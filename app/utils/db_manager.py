# -*- coding: utf-8 -*-
"""SQLite 数据库管理模块

提供跨进程安全的 SQLite 数据库操作。
使用文件系统级别的锁（fcntl.flock）支持多进程并发访问。

数据库存储位置：
- 全局索引库：projects/projects_index.db
- 项目数据库：projects/<项目名>/data/db/*.db
"""

import json
import os
import sys
import sqlite3
import threading
import tempfile
from typing import Dict, Any, Optional, List, Callable
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime

# 跨进程文件锁实现（复用 json_file_manager）
_IS_POSIX = sys.platform != 'win32'

if _IS_POSIX:
    import fcntl

    @contextmanager
    def _file_lock(path: str, exclusive: bool = True):
        """POSIX 文件系统级锁（跨进程）"""
        lock_path = path + '.lock'
        lock_dir = os.path.dirname(lock_path)
        if lock_dir:
            os.makedirs(lock_dir, exist_ok=True)

        fd = open(lock_path, 'w')
        try:
            flag = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
            fcntl.flock(fd, flag)
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            fd.close()
else:
    import msvcrt

    @contextmanager
    def _file_lock(path: str, exclusive: bool = True):
        """Windows 文件锁（线程级）"""
        lock_path = path + '.lock'
        lock_dir = os.path.dirname(lock_path)
        if lock_dir:
            os.makedirs(lock_dir, exist_ok=True)

        fd = open(lock_path, 'w')
        try:
            msvcrt.locking(fd.fileno(), msvcrt.LK_NBLCK, 1)
            yield
        except OSError:
            import time
            for _ in range(50):
                time.sleep(0.1)
                try:
                    msvcrt.locking(fd.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    continue
            yield
        finally:
            try:
                msvcrt.locking(fd.fileno(), msvcrt.LK_UNLCK, 1)
            except Exception:
                pass
            fd.close()


class DatabaseManager:
    """SQLite 数据库管理器

    提供跨进程安全的数据库操作，使用文件系统锁保护数据库文件。
    """

    def __init__(self, db_path: str):
        """初始化数据库管理器

        Args:
            db_path: 数据库文件路径
        """
        self.db_path = os.path.abspath(db_path)
        self._ensure_dir()
        self._init_db()

    def _ensure_dir(self):
        """确保数据库目录存在"""
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

    def _get_connection(self) -> sqlite3.Connection:
        """获取数据库连接（每次创建新连接，SQLite 线程安全）"""
        conn = sqlite3.connect(self.db_path, timeout=30.0, isolation_level='DEFERRED')
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')  # 使用 WAL 模式提高并发性能
        conn.execute('PRAGMA busy_timeout=30000')  # 30秒忙等待
        return conn

    def _init_db(self):
        """初始化数据库（子类可覆盖）"""
        pass

    @contextmanager
    def _transaction(self):
        """数据库事务上下文管理器"""
        conn = self._get_connection()
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def execute(self, sql: str, params: tuple = ()) -> List[Dict]:
        """执行查询并返回结果（读操作）"""
        with _file_lock(self.db_path, exclusive=False):
            conn = self._get_connection()
            try:
                cursor = conn.execute(sql, params)
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
            finally:
                conn.close()

    def execute_write(self, sql: str, params: tuple = ()) -> int:
        """执行写入操作并返回影响的行数"""
        with _file_lock(self.db_path, exclusive=True):
            conn = self._get_connection()
            try:
                cursor = conn.execute(sql, params)
                conn.commit()
                return cursor.rowcount
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()

    def execute_insert(self, sql: str, params: tuple = ()) -> int:
        """执行插入操作并返回自增ID"""
        with _file_lock(self.db_path, exclusive=True):
            conn = self._get_connection()
            try:
                cursor = conn.execute(sql, params)
                conn.commit()
                return cursor.lastrowid if cursor.lastrowid else 0
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()

    def execute_many(self, sql: str, params_list: List[tuple]) -> int:
        """批量执行写入操作"""
        with _file_lock(self.db_path, exclusive=True):
            conn = self._get_connection()
            try:
                cursor = conn.executemany(sql, params_list)
                conn.commit()
                return cursor.rowcount
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()

    def update(self, sql: str, update_func: Callable[[List[Dict]], None]) -> bool:
        """原子性更新数据（读-改-写 作为一个整体）

        Args:
            sql: 查询语句
            update_func: 更新函数，接收当前数据列表，修改后返回

        Returns:
            bool: 是否更新成功
        """
        with _file_lock(self.db_path, exclusive=True):
            conn = self._get_connection()
            try:
                # 读取
                cursor = conn.execute(sql)
                rows = cursor.fetchall()
                data = [dict(row) for row in rows]

                # 修改
                update_func(data)

                # 如果是空列表，则什么都不做
                if not data:
                    return True

                return True
            except Exception as e:
                conn.rollback()
                print(f"数据库更新失败: {e}")
                return False
            finally:
                conn.close()


# ============================================================================
# 全局项目索引数据库 (projects_index.db)
# ============================================================================

class ProjectsIndexDB(DatabaseManager):
    """全局项目索引数据库

    表结构：
    - projects: 项目索引表
    - zip_uploads: ZIP上传记录表
    """

    def __init__(self, db_path: str = None):
        if db_path is None:
            from .base import get_config
            config = get_config()
            projects_base = config.get('projects_base_folder', 'projects')
            db_path = os.path.join(projects_base, 'projects_index.db')
        super().__init__(db_path)

    def _init_db(self):
        """初始化数据库表"""
        with _file_lock(self.db_path, exclusive=True):
            conn = self._get_connection()
            try:
                # 项目索引表
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL UNIQUE,
                        created_time TEXT,
                        description TEXT,
                        deleted INTEGER DEFAULT 0,
                        deleted_time TEXT
                    )
                ''')

                # ZIP上传记录表
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS zip_uploads (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id TEXT NOT NULL,
                        zip_filename TEXT NOT NULL,
                        upload_time TEXT NOT NULL,
                        file_count INTEGER DEFAULT 0,
                        matched_count INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'pending',
                        FOREIGN KEY (project_id) REFERENCES projects(id)
                    )
                ''')

                # 索引
                conn.execute('CREATE INDEX IF NOT EXISTS idx_zip_project ON zip_uploads(project_id)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_zip_time ON zip_uploads(upload_time DESC)')

                conn.commit()
            finally:
                conn.close()

    # ==================== 项目 CRUD ====================

    def create_project(self, project_id: str, name: str, created_time: str = None,
                       description: str = None) -> bool:
        """创建项目"""
        if created_time is None:
            created_time = datetime.now().isoformat()

        sql = '''
            INSERT INTO projects (id, name, created_time, description, deleted, deleted_time)
            VALUES (?, ?, ?, ?, 0, NULL)
        '''
        try:
            self.execute_insert(sql, (project_id, name, created_time, description))
            return True
        except sqlite3.IntegrityError:
            # 项目已存在，更新
            return self.update_project(project_id, name=name, description=description)
        except Exception as e:
            print(f"创建项目失败: {e}")
            return False

    def get_project(self, project_id: str) -> Optional[Dict]:
        """获取单个项目"""
        sql = 'SELECT * FROM projects WHERE id = ? AND deleted = 0'
        results = self.execute(sql, (project_id,))
        return results[0] if results else None

    def get_project_by_name(self, name: str) -> Optional[Dict]:
        """根据名称获取项目"""
        sql = 'SELECT * FROM projects WHERE name = ? AND deleted = 0'
        results = self.execute(sql, (name,))
        return results[0] if results else None

    def list_projects(self, include_deleted: bool = False) -> List[Dict]:
        """列出所有项目"""
        if include_deleted:
            sql = 'SELECT * FROM projects ORDER BY created_time DESC'
        else:
            sql = 'SELECT * FROM projects WHERE deleted = 0 ORDER BY created_time DESC'
        return self.execute(sql)

    def update_project(self, project_id: str, **kwargs) -> bool:
        """更新项目信息"""
        allowed_fields = ['name', 'description', 'deleted', 'deleted_time']
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}

        if not updates:
            return True

        set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
        values = list(updates.values()) + [project_id]

        sql = f'UPDATE projects SET {set_clause} WHERE id = ?'
        try:
            self.execute_write(sql, tuple(values))
            return True
        except Exception as e:
            print(f"更新项目失败: {e}")
            return False

    def delete_project(self, project_id: str, hard: bool = False) -> bool:
        """删除项目（软删除或硬删除）"""
        if hard:
            sql = 'DELETE FROM projects WHERE id = ?'
        else:
            sql = 'UPDATE projects SET deleted = 1, deleted_time = ? WHERE id = ?'
            return self.execute_write(sql, (datetime.now().isoformat(), project_id)) > 0

        return self.execute_write(sql, (project_id,)) > 0

    # ==================== ZIP上传记录 CRUD ====================

    def add_zip_upload(self, project_id: str, zip_filename: str,
                        file_path: str = None, file_count: int = 0, 
                        matched_count: int = 0, status: str = 'pending',
                        upload_time: str = None) -> Optional[int]:
        """添加ZIP上传记录
        
        Args:
            project_id: 项目ID
            zip_filename: ZIP文件名
            file_path: ZIP文件路径（可选）
            file_count: 文件数量
            matched_count: 已匹配数量
            status: 状态
            upload_time: 上传时间（可选，默认当前时间）
        """
        if upload_time is None:
            upload_time = datetime.now().isoformat()
        sql = '''
            INSERT INTO zip_uploads (project_id, zip_filename, upload_time, file_count, matched_count, status)
            VALUES (?, ?, ?, ?, ?, ?)
        '''
        try:
            return self.execute_insert(sql, (project_id, zip_filename, upload_time,
                                              file_count, matched_count, status))
        except Exception as e:
            print(f"添加ZIP上传记录失败: {e}")
            return None

    def get_zip_uploads(self, project_id: str = None) -> List[Dict]:
        """获取ZIP上传记录"""
        if project_id:
            sql = 'SELECT * FROM zip_uploads WHERE project_id = ? ORDER BY upload_time DESC'
            return self.execute(sql, (project_id,))
        else:
            sql = 'SELECT * FROM zip_uploads ORDER BY upload_time DESC'
            return self.execute(sql)

    def update_zip_upload(self, record_id: int, **kwargs) -> bool:
        """更新ZIP上传记录"""
        allowed_fields = ['file_count', 'matched_count', 'status']
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}

        if not updates:
            return True

        set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
        values = list(updates.values()) + [record_id]

        sql = f'UPDATE zip_uploads SET {set_clause} WHERE id = ?'
        try:
            self.execute_write(sql, tuple(values))
            return True
        except Exception as e:
            print(f"更新ZIP上传记录失败: {e}")
            return False

    def delete_zip_upload(self, record_id: int) -> bool:
        """删除ZIP上传记录"""
        sql = 'DELETE FROM zip_uploads WHERE id = ?'
        return self.execute_write(sql, (record_id,)) > 0

    # ==================== 数据迁移 ====================

    def import_from_json(self, json_data: Dict) -> bool:
        """从JSON数据导入

        用于从旧的 projects_index.json 迁移数据
        """
        if not json_data:
            return True

        try:
            # 导入项目列表
            projects = json_data.get('projects', [])
            for project in projects:
                self.create_project(
                    project_id=project['id'],
                    name=project['name'],
                    created_time=project.get('created_time'),
                    description=project.get('description')
                )

            # 导入ZIP上传记录（如果有）
            if 'zip_uploads' in json_data:
                for record in json_data['zip_uploads']:
                    self.add_zip_upload(
                        project_id=record['project_id'],
                        zip_filename=record.get('zip_filename', record.get('name', '')),
                        file_count=record.get('file_count', 0),
                        matched_count=record.get('matched_count', 0),
                        status=record.get('status', 'completed')
                    )

            return True
        except Exception as e:
            print(f"从JSON导入失败: {e}")
            return False

    def export_to_json(self) -> Dict:
        """导出为JSON数据"""
        projects = self.list_projects(include_deleted=True)
        zip_uploads = self.get_zip_uploads()

        return {
            'projects': projects,
            'zip_uploads': zip_uploads
        }


# ============================================================================
# 项目文档数据库 (documents.db)
# ============================================================================

class ProjectDocumentsDB(DatabaseManager):
    """项目文档数据库

    每个项目一个数据库文件，位于 projects/<项目名>/data/db/documents.db

    表结构：
    - documents: 文档索引表
    """

    def __init__(self, project_name: str, db_path: str = None):
        if db_path is None:
            from .base import get_config
            config = get_config()
            projects_base = config.get('projects_base_folder', 'projects')
            db_path = os.path.join(projects_base, project_name, 'data', 'db', 'documents.db')
        self.project_name = project_name
        super().__init__(db_path)

    def _init_db(self):
        """初始化数据库表"""
        with _file_lock(self.db_path, exclusive=True):
            conn = self._get_connection()
            try:
                # 文档索引表
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS documents (
                        doc_id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        project_name TEXT,
                        cycle TEXT,
                        doc_name TEXT,
                        file_path TEXT,
                        file_size INTEGER DEFAULT 0,
                        file_type TEXT,
                        original_filename TEXT,
                        upload_time TEXT,
                        status TEXT DEFAULT 'uploaded',
                        matched_file TEXT,
                        matched_time TEXT,
                        archived INTEGER DEFAULT 0,
                        -- 盖章和签字字段
                        has_seal INTEGER DEFAULT 0,
                        party_a_seal INTEGER DEFAULT 0,
                        party_b_seal INTEGER DEFAULT 0,
                        no_seal INTEGER DEFAULT 0,
                        no_signature INTEGER DEFAULT 0,
                        party_a_signer TEXT,
                        party_b_signer TEXT,
                        doc_date TEXT,
                        sign_date TEXT,
                        directory TEXT,
                        source TEXT
                    )
                ''')

                # 检查并添加缺失的列（用于已存在的数据库升级）
                existing_columns = [row[1] for row in conn.execute("PRAGMA table_info(documents)")]
                new_columns = {
                    'has_seal': 'INTEGER DEFAULT 0',
                    'party_a_seal': 'INTEGER DEFAULT 0',
                    'party_b_seal': 'INTEGER DEFAULT 0',
                    'no_seal': 'INTEGER DEFAULT 0',
                    'no_signature': 'INTEGER DEFAULT 0',
                    'party_a_signer': 'TEXT',
                    'party_b_signer': 'TEXT',
                    'doc_date': 'TEXT',
                    'sign_date': 'TEXT',
                    'directory': 'TEXT DEFAULT "/"',
                    'source': 'TEXT',
                    'custom_attrs': 'TEXT'  # JSON格式存储自定义属性
                }
                for col_name, col_type in new_columns.items():
                    if col_name not in existing_columns:
                        try:
                            conn.execute(f'ALTER TABLE documents ADD COLUMN {col_name} {col_type}')
                            print(f"[DB] 添加列 {col_name} 成功")
                        except Exception as e:
                            print(f"[DB] 添加列 {col_name} 失败: {e}")

                # 索引
                conn.execute('CREATE INDEX IF NOT EXISTS idx_doc_project ON documents(project_id)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_doc_cycle ON documents(cycle)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_doc_docname ON documents(doc_name)')

                conn.commit()
            finally:
                conn.close()

    # ==================== 文档 CRUD ====================

    def add_document(self, doc_id: str, project_id: str, project_name: str,
                      cycle: str, doc_name: str, file_path: str,
                      file_size: int = 0, file_type: str = None,
                      original_filename: str = None, status: str = 'uploaded',
                      # 新增字段：盖章和签字
                      has_seal: int = 0, party_a_seal: int = 0, party_b_seal: int = 0,
                      no_seal: int = 0, no_signature: int = 0,
                      party_a_signer: str = None, party_b_signer: str = None,
                      doc_date: str = None, sign_date: str = None,
                      directory: str = '/', source: str = None,
                      custom_attrs: Dict = None) -> bool:
        """添加文档"""
        import json
        
        upload_time = datetime.now().isoformat()
        if original_filename is None:
            original_filename = os.path.basename(file_path)
        if file_type is None:
            file_type = os.path.splitext(file_path)[1].lower()
        if custom_attrs is None:
            custom_attrs = {}

        sql = '''
            INSERT INTO documents (doc_id, project_id, project_name, cycle, doc_name,
                                   file_path, file_size, file_type, original_filename,
                                   upload_time, status, archived,
                                   has_seal, party_a_seal, party_b_seal, no_seal,
                                   no_signature, party_a_signer, party_b_signer,
                                   doc_date, sign_date, directory, source, custom_attrs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        try:
            self.execute_insert(sql, (doc_id, project_id, project_name, cycle, doc_name,
                                       file_path, file_size, file_type, original_filename,
                                       upload_time, status,
                                       has_seal, party_a_seal, party_b_seal, no_seal,
                                       no_signature, party_a_signer or '', party_b_signer or '',
                                       doc_date or '', sign_date or '',
                                       directory or '/', source or '', json.dumps(custom_attrs, ensure_ascii=False)))
            return True
        except sqlite3.IntegrityError:
            # 文档已存在，更新
            return self.update_document(doc_id,
                                       file_path=file_path, file_size=file_size,
                                       original_filename=original_filename,
                                       has_seal=has_seal, party_a_seal=party_a_seal,
                                       party_b_seal=party_b_seal, no_seal=no_seal,
                                       no_signature=no_signature,
                                       party_a_signer=party_a_signer,
                                       party_b_signer=party_b_signer,
                                       doc_date=doc_date, sign_date=sign_date,
                                       directory=directory, source=source,
                                       custom_attrs=custom_attrs)
        except Exception as e:
            print(f"添加文档失败: {e}")
            return False

    def get_document(self, doc_id: str) -> Optional[Dict]:
        """获取单个文档"""
        sql = 'SELECT * FROM documents WHERE doc_id = ?'
        results = self.execute(sql, (doc_id,))
        if results:
            doc = results[0]
            # 反序列化 custom_attrs JSON字段
            import json
            if 'custom_attrs' in doc and doc['custom_attrs']:
                try:
                    doc['custom_attrs'] = json.loads(doc['custom_attrs'])
                except:
                    doc['custom_attrs'] = {}
            else:
                doc['custom_attrs'] = {}
            # 确保 directory 有默认值
            if not doc.get('directory'):
                doc['directory'] = '/'
            return doc
        return None

    def get_documents(self, project_id: str = None, cycle: str = None,
                       doc_name: str = None, archived: bool = None) -> List[Dict]:
        """获取文档列表（支持过滤）"""
        conditions = []
        params = []

        if project_id:
            conditions.append('project_id = ?')
            params.append(project_id)
        if cycle:
            conditions.append('cycle = ?')
            params.append(cycle)
        if doc_name:
            conditions.append('doc_name = ?')
            params.append(doc_name)
        if archived is not None:
            conditions.append('archived = ?')
            params.append(1 if archived else 0)

        where_clause = ' AND '.join(conditions) if conditions else '1=1'
        sql = f'SELECT * FROM documents WHERE {where_clause} ORDER BY upload_time DESC'

        results = self.execute(sql, tuple(params))
        
        # 反序列化 custom_attrs JSON字段
        import json
        for doc in results:
            if 'custom_attrs' in doc and doc['custom_attrs']:
                try:
                    doc['custom_attrs'] = json.loads(doc['custom_attrs'])
                except:
                    doc['custom_attrs'] = {}
            else:
                doc['custom_attrs'] = {}
            # 确保 directory 有默认值
            if not doc.get('directory'):
                doc['directory'] = '/'
        
        return results

    def update_document(self, doc_id: str, **kwargs) -> bool:
        """更新文档信息"""
        allowed_fields = [
            'cycle', 'doc_name', 'file_path', 'file_size', 'file_type',
            'original_filename', 'status', 'matched_file', 'matched_time', 'archived',
            # 盖章和签字字段
            'has_seal', 'party_a_seal', 'party_b_seal', 'no_seal',
            'no_signature', 'party_a_signer', 'party_b_signer',
            'doc_date', 'sign_date', 'directory', 'source'
        ]
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
        
        # 特殊处理 custom_attrs（需要序列化为JSON）
        if 'custom_attrs' in kwargs:
            import json
            updates['custom_attrs'] = json.dumps(kwargs['custom_attrs'] or {}, ensure_ascii=False)

        if not updates:
            return True

        set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
        values = list(updates.values()) + [doc_id]

        sql = f'UPDATE documents SET {set_clause} WHERE doc_id = ?'
        try:
            self.execute_write(sql, tuple(values))
            return True
        except Exception as e:
            print(f"更新文档失败: {e}")
            return False

    def delete_document(self, doc_id: str) -> bool:
        """删除文档"""
        sql = 'DELETE FROM documents WHERE doc_id = ?'
        return self.execute_write(sql, (doc_id,)) > 0
    
    def clear_documents(self) -> bool:
        """清空所有文档记录"""
        sql = 'DELETE FROM documents'
        try:
            self.execute_write(sql)
            return True
        except Exception as e:
            logger.error(f"清空文档记录失败: {e}")
            return False

    def mark_archived(self, doc_id: str, archived: bool = True) -> bool:
        """标记文档为已归档"""
        return self.update_document(doc_id, archived=1 if archived else 0)

    # ==================== 数据迁移 ====================

    def import_from_json(self, json_data: Dict) -> bool:
        """从JSON数据导入

        用于从旧的 documents_index.json 迁移数据
        """
        if not json_data:
            return True

        try:
            # 导入文档列表
            documents = json_data.get('documents', [])
            for doc in documents:
                self.add_document(
                    doc_id=doc.get('id', doc.get('doc_id')),
                    project_id=doc.get('project_id', ''),
                    project_name=doc.get('project_name', self.project_name),
                    cycle=doc.get('cycle', ''),
                    doc_name=doc.get('doc_name', ''),
                    file_path=doc.get('file_path', doc.get('path', '')),
                    file_size=doc.get('file_size', 0),
                    file_type=doc.get('file_type'),
                    original_filename=doc.get('original_filename'),
                    status=doc.get('status', 'uploaded')
                )

            return True
        except Exception as e:
            print(f"从JSON导入文档失败: {e}")
            return False

    def export_to_json(self) -> Dict:
        """导出为JSON数据"""
        documents = self.get_documents()
        return {'documents': documents}


# ============================================================================
# 全局实例
# ============================================================================

# 全局项目索引数据库实例
_projects_index_db: Optional[ProjectsIndexDB] = None


def get_projects_index_db() -> ProjectsIndexDB:
    """获取全局项目索引数据库实例（单例）"""
    global _projects_index_db
    if _projects_index_db is None:
        _projects_index_db = ProjectsIndexDB()
    return _projects_index_db


def get_project_documents_db(project_name: str) -> ProjectDocumentsDB:
    """获取项目文档数据库实例"""
    return ProjectDocumentsDB(project_name)


# ============================================================================
# 数据迁移工具
# ============================================================================

def migrate_from_json_to_db():
    """从旧JSON文件迁移到SQLite数据库

    执行一次性迁移，将旧的JSON数据迁移到SQLite数据库。
    """
    from .base import get_config
    config = get_config()
    projects_base = config.get('projects_base_folder', 'projects')
    projects_base = os.path.abspath(projects_base)

    print("=" * 60)
    print("开始数据迁移：JSON -> SQLite")
    print("=" * 60)

    # 1. 迁移 projects_index.json
    index_file = os.path.join(projects_base, 'projects_index.json')
    if os.path.exists(index_file):
        print(f"\n[1/2] 迁移 projects_index.json ...")
        try:
            with open(index_file, 'r', encoding='utf-8') as f:
                json_data = json.load(f)

            db = get_projects_index_db()
            db.import_from_json(json_data)
            print("  ✓ 项目索引迁移完成")
        except Exception as e:
            print(f"  ✗ 迁移失败: {e}")
    else:
        print(f"\n[1/2] projects_index.json 不存在，跳过")

    # 2. 迁移各项目的 documents_index.json
    print(f"\n[2/2] 迁移各项目的 documents_index.json ...")
    migrated_count = 0
    for entry in os.listdir(projects_base):
        project_dir = os.path.join(projects_base, entry)
        if not os.path.isdir(project_dir):
            continue

        doc_index_file = os.path.join(project_dir, 'documents_index.json')
        if os.path.exists(doc_index_file):
            try:
                with open(doc_index_file, 'r', encoding='utf-8') as f:
                    json_data = json.load(f)

                db = get_project_documents_db(entry)
                db.import_from_json(json_data)
                migrated_count += 1
            except Exception as e:
                print(f"  ! 迁移 {entry} 失败: {e}")

    print(f"  ✓ 迁移了 {migrated_count} 个项目的文档索引")

    print("\n" + "=" * 60)
    print("数据迁移完成！")
    print("=" * 60)
