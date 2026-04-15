#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""项目 ID 迁移工具。

将历史项目 ID（如 ``project_20240327112233``）迁移为 UUID，
并同步更新所有已知引用位置，同时生成可回滚的备份目录。

覆盖范围：
1. projects/projects_index.db
2. data/users.db 中的 archive_approvals / project_transfers
3. projects/projects_index.json（如存在）
4. 各项目目录中的 project_info.json / project_config.json / documents_index.json
5. 各项目目录中的 data/db/documents.db

回滚策略：
- 迁移前会创建备份目录，默认位于 projects/migration_backups/
- 使用 rollback 子命令即可恢复备份文件

注意：
- 迁移和回滚都应在系统停机或无人写入时执行
- 脚本可重复执行；已是 UUID 的项目会自动跳过
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


BASE_DIR = Path(__file__).resolve().parent.parent
BACKUP_ROOT_NAME = 'migration_backups'


def now_iso() -> str:
    return datetime.now().isoformat(timespec='seconds')


def is_uuid_like(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def read_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as file_obj:
        return json.load(file_obj)


def write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as file_obj:
        json.dump(data, file_obj, ensure_ascii=False, indent=2)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


@dataclass
class ProjectRecord:
    old_id: str
    name: str
    deleted: bool = False
    new_id: Optional[str] = None


class ProjectIdUuidMigrator:
    def __init__(self, base_dir: Path | str = BASE_DIR):
        self.base_dir = Path(base_dir).resolve()
        self.projects_dir = self.base_dir / 'projects'
        self.index_db_path = self.projects_dir / 'projects_index.db'
        self.index_json_path = self.projects_dir / 'projects_index.json'
        self.users_db_path = self.base_dir / 'data' / 'users.db'
        self.backup_root = self.projects_dir / BACKUP_ROOT_NAME

    def discover_legacy_projects(self, project_ids: Optional[Iterable[str]] = None) -> List[ProjectRecord]:
        project_filter = set(project_ids or [])
        projects: Dict[str, ProjectRecord] = {}

        if self.index_db_path.exists():
            with sqlite3.connect(str(self.index_db_path)) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute('SELECT id, name, deleted FROM projects ORDER BY created_time ASC').fetchall()
            for row in rows:
                project_id = row['id']
                if is_uuid_like(project_id):
                    continue
                if project_filter and project_id not in project_filter:
                    continue
                projects[project_id] = ProjectRecord(
                    old_id=project_id,
                    name=row['name'],
                    deleted=bool(row['deleted'])
                )

        if not projects and self.index_json_path.exists():
            data = read_json(self.index_json_path) or {}
            source_projects = data.get('projects', data)
            for project_id, info in source_projects.items():
                if project_id in ('updated_time', 'deleted_projects', 'meta'):
                    continue
                if not isinstance(info, dict) or is_uuid_like(project_id):
                    continue
                if project_filter and project_id not in project_filter:
                    continue
                projects[project_id] = ProjectRecord(
                    old_id=project_id,
                    name=info.get('name', project_id),
                    deleted=bool(info.get('deleted'))
                )

        records = list(projects.values())
        for record in records:
            record.new_id = str(uuid.uuid4())
        return records

    def status(self, project_ids: Optional[Iterable[str]] = None) -> Dict[str, Any]:
        records = self.discover_legacy_projects(project_ids)
        return {
            'base_dir': str(self.base_dir),
            'legacy_count': len(records),
            'projects': [
                {
                    'old_id': record.old_id,
                    'name': record.name,
                    'deleted': record.deleted,
                    'suggested_uuid': record.new_id,
                }
                for record in records
            ]
        }

    def migrate(self, dry_run: bool = False, create_backup: bool = True,
                project_ids: Optional[Iterable[str]] = None) -> Dict[str, Any]:
        records = self.discover_legacy_projects(project_ids)
        if not records:
            return {
                'status': 'success',
                'message': '没有发现需要迁移的老项目 ID',
                'projects': [],
                'backup_dir': None,
            }

        mapping = {record.old_id: record.new_id for record in records if record.new_id}
        backup_dir = None

        if dry_run:
            return {
                'status': 'success',
                'message': f'预览完成，共 {len(records)} 个项目需要迁移',
                'projects': [self._record_to_dict(record) for record in records],
                'backup_dir': None,
            }

        if create_backup:
            backup_dir = self._create_backup(records)

        self._update_projects_index_db(mapping)
        self._update_users_db(mapping)
        self._update_projects_index_json(mapping)
        for record in records:
            self._update_project_files(record)

        manifest_path = None
        if backup_dir:
            manifest_path = backup_dir / 'manifest.json'
            manifest = read_json(manifest_path) or {}
            manifest['completed_at'] = now_iso()
            write_json(manifest_path, manifest)

        return {
            'status': 'success',
            'message': f'迁移完成，共处理 {len(records)} 个项目',
            'projects': [self._record_to_dict(record) for record in records],
            'backup_dir': str(backup_dir) if backup_dir else None,
            'manifest': str(manifest_path) if manifest_path else None,
        }

    def rollback(self, backup_dir: Path | str) -> Dict[str, Any]:
        backup_path = Path(backup_dir).resolve()
        manifest_path = backup_path / 'manifest.json'
        if not manifest_path.exists():
            raise FileNotFoundError(f'找不到回滚清单: {manifest_path}')

        manifest = read_json(manifest_path) or {}
        restored = []
        for relative_path in manifest.get('copied_files', []):
            source = backup_path / 'files' / relative_path
            target = self.base_dir / Path(relative_path)
            if not source.exists():
                continue
            ensure_parent(target)
            self._remove_sqlite_sidecars(target)
            shutil.copy2(source, target)
            restored.append(relative_path)

        manifest['rolled_back_at'] = now_iso()
        write_json(manifest_path, manifest)
        return {
            'status': 'success',
            'message': f'已从备份恢复 {len(restored)} 个文件',
            'backup_dir': str(backup_path),
            'restored_files': restored,
        }

    def _record_to_dict(self, record: ProjectRecord) -> Dict[str, Any]:
        return {
            'old_id': record.old_id,
            'new_id': record.new_id,
            'name': record.name,
            'deleted': record.deleted,
        }

    def _create_backup(self, records: List[ProjectRecord]) -> Path:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_dir = self.backup_root / f'project_id_uuid_{timestamp}'
        files_root = backup_dir / 'files'
        backup_dir.mkdir(parents=True, exist_ok=True)

        manifest = {
            'type': 'project-id-uuid-migration',
            'created_at': now_iso(),
            'base_dir': str(self.base_dir),
            'projects': [self._record_to_dict(record) for record in records],
            'copied_files': [],
        }

        paths = {
            self.index_db_path,
            self.index_json_path,
            self.users_db_path,
        }
        for record in records:
            project_root = self.projects_dir / record.name
            paths.update({
                project_root / 'project_info.json',
                project_root / 'project_config.json',
                project_root / 'config' / 'requirements.json',
                project_root / 'data' / 'documents_index.json',
                project_root / 'data' / 'db' / 'documents.db',
            })

        for path in sorted(paths):
            if not path.exists():
                continue
            relative = path.relative_to(self.base_dir)
            destination = files_root / relative
            ensure_parent(destination)
            shutil.copy2(path, destination)
            manifest['copied_files'].append(relative.as_posix())
            for suffix in ('-wal', '-shm'):
                sidecar = Path(str(path) + suffix)
                if sidecar.exists():
                    rel_sidecar = sidecar.relative_to(self.base_dir)
                    dest_sidecar = files_root / rel_sidecar
                    ensure_parent(dest_sidecar)
                    shutil.copy2(sidecar, dest_sidecar)
                    manifest['copied_files'].append(rel_sidecar.as_posix())

        write_json(backup_dir / 'manifest.json', manifest)
        return backup_dir

    def _update_projects_index_db(self, mapping: Dict[str, str]) -> None:
        if not self.index_db_path.exists() or not mapping:
            return
        with sqlite3.connect(str(self.index_db_path)) as conn:
            conn.execute('PRAGMA foreign_keys = OFF')
            cursor = conn.cursor()
            for old_id, new_id in mapping.items():
                cursor.execute('UPDATE projects SET id = ? WHERE id = ?', (new_id, old_id))
                cursor.execute('UPDATE zip_uploads SET project_id = ? WHERE project_id = ?', (new_id, old_id))
                cursor.execute('UPDATE project_configs SET project_id = ? WHERE project_id = ?', (new_id, old_id))
                cursor.execute('UPDATE project_stats SET project_id = ? WHERE project_id = ?', (new_id, old_id))

            rows = cursor.execute('SELECT id, project_id, config_type, config_data FROM project_configs').fetchall()
            for row_id, project_id, config_type, config_data in rows:
                data = json.loads(config_data)
                changed = False
                if config_type == 'project_info' and data.get('id') in mapping:
                    data['id'] = mapping[data['id']]
                    changed = True
                elif config_type == 'documents_index':
                    documents = data.get('documents', {})
                    for doc_info in documents.values():
                        if isinstance(doc_info, dict) and doc_info.get('project_id') in mapping:
                            doc_info['project_id'] = mapping[doc_info['project_id']]
                            changed = True
                if changed:
                    cursor.execute(
                        'UPDATE project_configs SET config_data = ?, updated_time = ? WHERE id = ?',
                        (json.dumps(data, ensure_ascii=False), now_iso(), row_id)
                    )
            conn.commit()

    def _update_users_db(self, mapping: Dict[str, str]) -> None:
        if not self.users_db_path.exists() or not mapping:
            return
        with sqlite3.connect(str(self.users_db_path)) as conn:
            cursor = conn.cursor()
            for old_id, new_id in mapping.items():
                if self._table_exists(cursor, 'archive_approvals'):
                    cursor.execute('UPDATE archive_approvals SET project_id = ? WHERE project_id = ?', (new_id, old_id))
                if self._table_exists(cursor, 'project_transfers'):
                    cursor.execute('UPDATE project_transfers SET project_id = ? WHERE project_id = ?', (new_id, old_id))
            conn.commit()

    def _update_projects_index_json(self, mapping: Dict[str, str]) -> None:
        if not self.index_json_path.exists() or not mapping:
            return
        data = read_json(self.index_json_path)
        if not data:
            return

        if 'projects' in data:
            data['projects'] = self._remap_project_index_dict(data.get('projects', {}), mapping)
        else:
            preserved = {key: value for key, value in data.items() if key in ('updated_time', 'meta', 'deleted_projects')}
            projects_only = {key: value for key, value in data.items() if key not in preserved}
            remapped = self._remap_project_index_dict(projects_only, mapping)
            remapped.update({key: value for key, value in preserved.items() if key != 'deleted_projects'})
            if 'deleted_projects' in data:
                remapped['deleted_projects'] = self._remap_project_index_dict(data.get('deleted_projects', {}), mapping)
            data = remapped

        if 'deleted_projects' in data:
            data['deleted_projects'] = self._remap_project_index_dict(data.get('deleted_projects', {}), mapping)

        write_json(self.index_json_path, data)

    def _remap_project_index_dict(self, source: Dict[str, Any], mapping: Dict[str, str]) -> Dict[str, Any]:
        result = {}
        for project_id, info in source.items():
            new_id = mapping.get(project_id, project_id)
            if isinstance(info, dict) and info.get('id') in mapping:
                info = dict(info)
                info['id'] = mapping[info['id']]
            result[new_id] = info
        return result

    def _update_project_files(self, record: ProjectRecord) -> None:
        old_id = record.old_id
        new_id = record.new_id
        project_root = self.projects_dir / record.name

        self._update_project_info_json(project_root / 'project_info.json', old_id, new_id)
        self._update_legacy_project_config_json(project_root / 'project_config.json', old_id, new_id)
        self._update_documents_index_json(project_root / 'data' / 'documents_index.json', old_id, new_id)
        self._update_project_documents_db(project_root / 'data' / 'db' / 'documents.db', old_id, new_id)

    def _update_project_info_json(self, path: Path, old_id: str, new_id: str) -> None:
        data = read_json(path)
        if not data:
            return
        if data.get('id') == old_id:
            data['id'] = new_id
            write_json(path, data)

    def _update_legacy_project_config_json(self, path: Path, old_id: str, new_id: str) -> None:
        data = read_json(path)
        if not data:
            return
        changed = False
        if data.get('id') == old_id:
            data['id'] = new_id
            changed = True
        documents = data.get('documents', {})
        for cycle_info in documents.values():
            if not isinstance(cycle_info, dict):
                continue
            for doc_info in cycle_info.get('uploaded_docs', []):
                if isinstance(doc_info, dict) and doc_info.get('project_id') == old_id:
                    doc_info['project_id'] = new_id
                    changed = True
        if changed:
            write_json(path, data)

    def _update_documents_index_json(self, path: Path, old_id: str, new_id: str) -> None:
        data = read_json(path)
        if not data:
            return
        documents = data.get('documents', data)
        changed = False
        for doc_info in documents.values():
            if isinstance(doc_info, dict) and doc_info.get('project_id') == old_id:
                doc_info['project_id'] = new_id
                changed = True
        if changed:
            write_json(path, data)

    def _update_project_documents_db(self, path: Path, old_id: str, new_id: str) -> None:
        if not path.exists():
            return
        with sqlite3.connect(str(path)) as conn:
            cursor = conn.cursor()
            if not self._table_exists(cursor, 'documents'):
                return
            cursor.execute('UPDATE documents SET project_id = ? WHERE project_id = ?', (new_id, old_id))
            conn.commit()

    def _remove_sqlite_sidecars(self, path: Path) -> None:
        if path.suffix != '.db':
            return
        for suffix in ('-wal', '-shm'):
            sidecar = Path(str(path) + suffix)
            if sidecar.exists():
                sidecar.unlink()

    def _table_exists(self, cursor: sqlite3.Cursor, table_name: str) -> bool:
        row = cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,)
        ).fetchone()
        return row is not None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='迁移老项目 ID 到 UUID，并支持回滚')
    parser.add_argument('--base-dir', type=str, default=str(BASE_DIR), help='项目根目录')
    subparsers = parser.add_subparsers(dest='command', required=True)

    status_parser = subparsers.add_parser('status', help='查看当前还有多少老项目 ID')
    status_parser.add_argument('--project-id', action='append', dest='project_ids', help='只查看指定项目 ID')

    migrate_parser = subparsers.add_parser('migrate', help='执行迁移')
    migrate_parser.add_argument('--dry-run', action='store_true', help='仅预览，不实际修改')
    migrate_parser.add_argument('--no-backup', action='store_true', help='不创建备份目录')
    migrate_parser.add_argument('--project-id', action='append', dest='project_ids', help='只迁移指定项目 ID')

    rollback_parser = subparsers.add_parser('rollback', help='从备份目录回滚')
    rollback_parser.add_argument('--backup-dir', required=True, help='备份目录路径')

    return parser


def print_result(result: Dict[str, Any]) -> None:
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    migrator = ProjectIdUuidMigrator(args.base_dir)

    try:
        if args.command == 'status':
            print_result(migrator.status(args.project_ids))
        elif args.command == 'migrate':
            print_result(migrator.migrate(
                dry_run=args.dry_run,
                create_backup=not args.no_backup,
                project_ids=args.project_ids,
            ))
        elif args.command == 'rollback':
            print_result(migrator.rollback(args.backup_dir))
        else:
            parser.error('未知命令')
            return 2
        return 0
    except Exception as exc:
        print(json.dumps({
            'status': 'error',
            'message': str(exc),
        }, ensure_ascii=False, indent=2))
        return 1


if __name__ == '__main__':
    sys.exit(main())