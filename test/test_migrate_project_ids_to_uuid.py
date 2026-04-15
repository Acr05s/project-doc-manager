import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from tools.migrate_project_ids_to_uuid import ProjectIdUuidMigrator, is_uuid_like


LEGACY_PROJECT_ID = 'project_20240327112233'
PROJECT_NAME = '老测试项目'


class ProjectIdUuidMigrationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)
        self.projects_dir = self.base_dir / 'projects'
        self.project_dir = self.projects_dir / PROJECT_NAME
        self.data_dir = self.base_dir / 'data'
        self._prepare_structure()
        self.migrator = ProjectIdUuidMigrator(self.base_dir)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _prepare_structure(self):
        (self.project_dir / 'config').mkdir(parents=True, exist_ok=True)
        (self.project_dir / 'data' / 'db').mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self._create_projects_index_db()
        self._create_users_db()
        self._create_project_files()
        self._create_documents_db()

    def _create_projects_index_db(self):
        db_path = self.projects_dir / 'projects_index.db'
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute(
                'CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT UNIQUE, created_time TEXT, description TEXT, deleted INTEGER DEFAULT 0, deleted_time TEXT)'
            )
            conn.execute(
                'CREATE TABLE zip_uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, zip_filename TEXT, upload_time TEXT, file_count INTEGER, matched_count INTEGER, status TEXT)'
            )
            conn.execute(
                'CREATE TABLE project_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, config_type TEXT, config_data TEXT, updated_time TEXT, UNIQUE(project_id, config_type))'
            )
            conn.execute(
                'CREATE TABLE project_stats (project_id TEXT PRIMARY KEY, project_name TEXT, total_docs INTEGER, archived_docs INTEGER, not_involved_docs INTEGER, total_file_size INTEGER, last_sync_time TEXT)'
            )

            conn.execute('INSERT INTO projects (id, name, created_time, description, deleted) VALUES (?, ?, ?, ?, 0)', (LEGACY_PROJECT_ID, PROJECT_NAME, '2026-04-01T10:00:00', 'desc'))
            conn.execute('INSERT INTO zip_uploads (project_id, zip_filename, upload_time, file_count, matched_count, status) VALUES (?, ?, ?, 1, 1, ?)', (LEGACY_PROJECT_ID, 'a.zip', '2026-04-01T10:00:00', 'completed'))
            conn.execute('INSERT INTO project_stats (project_id, project_name, total_docs, archived_docs, not_involved_docs, total_file_size, last_sync_time) VALUES (?, ?, 1, 0, 0, 12, ?)', (LEGACY_PROJECT_ID, PROJECT_NAME, '2026-04-01T10:00:00'))

            project_info = {
                'id': LEGACY_PROJECT_ID,
                'name': PROJECT_NAME,
                'description': 'desc',
            }
            documents_index = {
                'documents': {
                    'doc-1': {
                        'doc_id': 'doc-1',
                        'project_id': LEGACY_PROJECT_ID,
                        'project_name': PROJECT_NAME,
                        'doc_name': '文档A',
                    }
                }
            }
            conn.execute('INSERT INTO project_configs (project_id, config_type, config_data, updated_time) VALUES (?, ?, ?, ?)', (LEGACY_PROJECT_ID, 'project_info', json.dumps(project_info, ensure_ascii=False), '2026-04-01T10:00:00'))
            conn.execute('INSERT INTO project_configs (project_id, config_type, config_data, updated_time) VALUES (?, ?, ?, ?)', (LEGACY_PROJECT_ID, 'documents_index', json.dumps(documents_index, ensure_ascii=False), '2026-04-01T10:00:00'))
            conn.commit()

        index_json = {
            LEGACY_PROJECT_ID: {
                'id': LEGACY_PROJECT_ID,
                'name': PROJECT_NAME,
                'description': 'desc'
            },
            'updated_time': '2026-04-01T10:00:00'
        }
        with open(self.projects_dir / 'projects_index.json', 'w', encoding='utf-8') as file_obj:
            json.dump(index_json, file_obj, ensure_ascii=False, indent=2)

    def _create_users_db(self):
        db_path = self.data_dir / 'users.db'
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute('CREATE TABLE archive_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, cycle TEXT, doc_names TEXT)')
            conn.execute('CREATE TABLE project_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, project_name TEXT)')
            conn.execute('INSERT INTO archive_approvals (project_id, cycle, doc_names) VALUES (?, ?, ?)', (LEGACY_PROJECT_ID, '第一批', '[]'))
            conn.execute('INSERT INTO project_transfers (project_id, project_name) VALUES (?, ?)', (LEGACY_PROJECT_ID, PROJECT_NAME))
            conn.commit()

    def _create_project_files(self):
        project_info = {
            'id': LEGACY_PROJECT_ID,
            'name': PROJECT_NAME,
            'description': 'desc'
        }
        documents_index = {
            'documents': {
                'doc-1': {
                    'doc_id': 'doc-1',
                    'project_id': LEGACY_PROJECT_ID,
                    'project_name': PROJECT_NAME,
                    'doc_name': '文档A'
                }
            }
        }
        with open(self.project_dir / 'project_info.json', 'w', encoding='utf-8') as file_obj:
            json.dump(project_info, file_obj, ensure_ascii=False, indent=2)
        with open(self.project_dir / 'data' / 'documents_index.json', 'w', encoding='utf-8') as file_obj:
            json.dump(documents_index, file_obj, ensure_ascii=False, indent=2)

    def _create_documents_db(self):
        db_path = self.project_dir / 'data' / 'db' / 'documents.db'
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute('CREATE TABLE documents (doc_id TEXT PRIMARY KEY, project_id TEXT, project_name TEXT, cycle TEXT, doc_name TEXT)')
            conn.execute('INSERT INTO documents (doc_id, project_id, project_name, cycle, doc_name) VALUES (?, ?, ?, ?, ?)', ('doc-1', LEGACY_PROJECT_ID, PROJECT_NAME, '第一批', '文档A'))
            conn.commit()

    def test_migrate_and_rollback(self):
        preview = self.migrator.migrate(dry_run=True)
        self.assertEqual(preview['status'], 'success')
        self.assertEqual(len(preview['projects']), 1)
        new_id = preview['projects'][0]['new_id']
        self.assertTrue(is_uuid_like(new_id))

        result = self.migrator.migrate()
        self.assertEqual(result['status'], 'success')
        migrated_id = result['projects'][0]['new_id']
        backup_dir = Path(result['backup_dir'])
        self.assertTrue(backup_dir.exists())

        with sqlite3.connect(str(self.projects_dir / 'projects_index.db')) as conn:
            row = conn.execute('SELECT id FROM projects WHERE name = ?', (PROJECT_NAME,)).fetchone()
            self.assertEqual(row[0], migrated_id)
            zip_row = conn.execute('SELECT project_id FROM zip_uploads').fetchone()
            self.assertEqual(zip_row[0], migrated_id)
            config_row = conn.execute("SELECT config_data FROM project_configs WHERE config_type = 'project_info'").fetchone()
            self.assertEqual(json.loads(config_row[0])['id'], migrated_id)

        with sqlite3.connect(str(self.data_dir / 'users.db')) as conn:
            row = conn.execute('SELECT project_id FROM archive_approvals').fetchone()
            self.assertEqual(row[0], migrated_id)

        with open(self.project_dir / 'project_info.json', 'r', encoding='utf-8') as file_obj:
            self.assertEqual(json.load(file_obj)['id'], migrated_id)
        with open(self.project_dir / 'data' / 'documents_index.json', 'r', encoding='utf-8') as file_obj:
            self.assertEqual(json.load(file_obj)['documents']['doc-1']['project_id'], migrated_id)
        with sqlite3.connect(str(self.project_dir / 'data' / 'db' / 'documents.db')) as conn:
            row = conn.execute('SELECT project_id FROM documents WHERE doc_id = ?', ('doc-1',)).fetchone()
            self.assertEqual(row[0], migrated_id)

        rollback = self.migrator.rollback(backup_dir)
        self.assertEqual(rollback['status'], 'success')

        with sqlite3.connect(str(self.projects_dir / 'projects_index.db')) as conn:
            row = conn.execute('SELECT id FROM projects WHERE name = ?', (PROJECT_NAME,)).fetchone()
            self.assertEqual(row[0], LEGACY_PROJECT_ID)
        with sqlite3.connect(str(self.data_dir / 'users.db')) as conn:
            row = conn.execute('SELECT project_id FROM archive_approvals').fetchone()
            self.assertEqual(row[0], LEGACY_PROJECT_ID)
        with open(self.project_dir / 'project_info.json', 'r', encoding='utf-8') as file_obj:
            self.assertEqual(json.load(file_obj)['id'], LEGACY_PROJECT_ID)


if __name__ == '__main__':
    unittest.main()