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
import shutil
import sqlite3
import threading
import tempfile
from typing import Dict, Any, Optional, List, Callable, Union
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
        try:
            with _file_lock(self.db_path, exclusive=False):
                conn = self._get_connection()
                try:
                    cursor = conn.execute(sql, params)
                    rows = cursor.fetchall()
                    return [dict(row) for row in rows]
                finally:
                    conn.close()
        except sqlite3.OperationalError as e:
            if 'no such table' in str(e):
                print(f"[DB] 检测到表不存在 ({e})，尝试重建数据库表...")
                self._init_db()
                # 重建后重试一次
                with _file_lock(self.db_path, exclusive=False):
                    conn = self._get_connection()
                    try:
                        cursor = conn.execute(sql, params)
                        rows = cursor.fetchall()
                        return [dict(row) for row in rows]
                    finally:
                        conn.close()
            raise

    def execute_write(self, sql: str, params: tuple = ()) -> int:
        """执行写入操作并返回影响的行数"""
        try:
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
        except sqlite3.OperationalError as e:
            if 'no such table' in str(e):
                print(f"[DB] 检测到表不存在 ({e})，尝试重建数据库表...")
                self._init_db()
                with _file_lock(self.db_path, exclusive=True):
                    conn = self._get_connection()
                    try:
                        cursor = conn.execute(sql, params)
                        conn.commit()
                        return cursor.rowcount
                    except Exception as e2:
                        conn.rollback()
                        raise e2
                    finally:
                        conn.close()
            raise

    def execute_insert(self, sql: str, params: tuple = ()) -> int:
        """执行插入操作并返回自增ID"""
        try:
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
        except sqlite3.OperationalError as e:
            if 'no such table' in str(e):
                print(f"[DB] 检测到表不存在 ({e})，尝试重建数据库表...")
                self._init_db()
                with _file_lock(self.db_path, exclusive=True):
                    conn = self._get_connection()
                    try:
                        cursor = conn.execute(sql, params)
                        conn.commit()
                        return cursor.lastrowid if cursor.lastrowid else 0
                    except Exception as e2:
                        conn.rollback()
                        raise e2
                    finally:
                        conn.close()
            raise

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

    def update(self, sql: str, update_func: Callable[[List[Dict]], None], 
               write_func: Callable[[sqlite3.Connection, List[Dict]], None] = None) -> bool:
        """原子性更新数据（读-改-写 作为一个整体）

        Args:
            sql: 查询语句
            update_func: 更新函数，接收当前数据列表，修改后返回
            write_func: 写入函数，接收数据库连接和修改后的数据列表，执行实际的写入操作。
                        如果未提供，将自动根据表的主键生成UPDATE语句。

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

                # 执行写入操作
                if write_func:
                    write_func(conn, data)
                else:
                    self._auto_write_updates(conn, sql, data, cursor)
                conn.commit()

                return True
            except Exception as e:
                conn.rollback()
                print(f"数据库更新失败: {e}")
                return False
            finally:
                conn.close()

    def _auto_write_updates(self, conn, sql: str, data: List[Dict], cursor):
        """根据查询SQL自动推断表名和主键，生成UPDATE语句写回数据"""
        from sqlite3 import Cursor
        
        # 从SQL语句中提取表名
        import re
        table_match = re.search(r'FROM\s+(\w+)', sql, re.IGNORECASE)
        if not table_match:
            raise ValueError(f"无法从SQL语句中提取表名: {sql}")
        table_name = table_match.group(1)
        
        # 获取表的主键列
        pk_columns = []
        cursor.execute(f"PRAGMA table_info({table_name})")
        for col_info in cursor.fetchall():
            # col_info: (cid, name, type, notnull, dflt_value, pk)
            if col_info[5] > 0:  # pk > 0 表示是主键
                pk_columns.append((col_info[1], col_info[5]))  # (name, pk_order)
        
        # 按主键顺序排序
        pk_columns.sort(key=lambda x: x[1])
        pk_names = [col[0] for col in pk_columns]
        
        if not pk_names:
            raise ValueError(f"表 {table_name} 没有主键，无法自动生成UPDATE语句，请提供write_func")
        
        # 获取所有列名
        all_columns = list(data[0].keys()) if data else []
        update_columns = [c for c in all_columns if c not in pk_names]
        
        if not update_columns:
            return
        
        # 生成UPDATE语句
        set_clause = ', '.join([f'{c} = ?' for c in update_columns])
        where_clause = ' AND '.join([f'{c} = ?' for c in pk_names])
        update_sql = f"UPDATE {table_name} SET {set_clause} WHERE {where_clause}"
        
        for row in data:
            set_values = [row.get(c) for c in update_columns]
            pk_values = [row.get(c) for c in pk_names]
            conn.execute(update_sql, set_values + pk_values)


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
        try:
            with _file_lock(self.db_path, exclusive=True):
                conn = self._get_connection()
                try:
                    self._create_tables(conn)
                    conn.commit()
                finally:
                    conn.close()
        except Exception as e:
            print(f"[DB] 初始化数据库表失败: {e}")
            import traceback
            traceback.print_exc()
            
            # 如果数据库文件损坏，尝试备份后重建
            try:
                if os.path.exists(self.db_path):
                    backup_path = self.db_path + '.backup'
                    
                    try:
                        # 尝试备份数据库文件
                        shutil.copy2(self.db_path, backup_path)
                        print(f"[DB] 已创建数据库备份: {backup_path}")
                    except Exception as backup_err:
                        print(f"[DB] 备份失败（继续执行重建）: {backup_err}")
                    
                    # 删除损坏的数据库文件及其 WAL/SHM 文件
                    print(f"[DB] 尝试删除损坏的数据库文件: {self.db_path}")
                    os.remove(self.db_path)
                    for suffix in ('-wal', '-shm'):
                        wal_path = self.db_path + suffix
                        if os.path.exists(wal_path):
                            os.remove(wal_path)
                
                # 重新创建数据库
                with _file_lock(self.db_path, exclusive=True):
                    conn = self._get_connection()
                    try:
                        self._create_tables(conn)
                        conn.commit()
                        print(f"[DB] 数据库重建成功: {self.db_path}")
                        
                        # 尝试从备份恢复数据
                        backup_path = self.db_path + '.backup'
                        if os.path.exists(backup_path):
                            try:
                                self._try_recover_from_backup(conn, backup_path)
                                print(f"[DB] 数据恢复完成")
                                os.remove(backup_path)  # 成功后删除备份
                            except Exception as recover_err:
                                print(f"[DB] 数据恢复失败（使用空数据库）: {recover_err}")
                                
                    finally:
                        conn.close()
            except Exception as e2:
                print(f"[DB] 数据库重建也失败了: {e2}")
                import traceback
                traceback.print_exc()

    def _try_recover_from_backup(self, conn, backup_path):
        """尝试从备份恢复数据"""
        try:
            import sqlite3 as sqlite3_module
            
            # 读取备份数据库中的所有数据
            with sqlite3_module.connect(backup_path) as backup_conn:
                backup_cursor = backup_conn.cursor()
                
                # 获取所有表名
                backup_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                tables = [row[0] for row in backup_cursor.fetchall()]
                
                for table in tables:
                    try:
                        # 获取表结构
                        backup_cursor.execute(f"PRAGMA table_info({table})")
                        columns = [row[1] for row in backup_cursor.fetchall()]
                        
                        if not columns:
                            continue
                        
                        # 读取所有数据
                        backup_cursor.execute(f"SELECT * FROM {table}")
                        rows = backup_cursor.fetchall()
                        
                        if rows:
                            placeholders = ','.join(['?' for _ in columns])
                            columns_str = ','.join(columns)
                            
                            # 插入到新数据库
                            conn.executemany(
                                f"INSERT OR IGNORE INTO {table} ({columns_str}) VALUES ({placeholders})",
                                rows
                            )
                            
                            print(f"[DB] 已从备份恢复表 {table}: {len(rows)} 条记录")
                            
                    except Exception as table_err:
                        print(f"[DB] 恢复表 {table} 失败: {table_err}")
                        continue
                
                conn.commit()
                
        except Exception as e:
            raise Exception(f"数据恢复失败: {e}")

    def _create_tables(self, conn):
        """创建所有数据库表"""
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

        # 项目配置数据表（存储所有项目配置JSON）
        conn.execute('''
            CREATE TABLE IF NOT EXISTS project_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                config_type TEXT NOT NULL,
                config_data TEXT NOT NULL,
                updated_time TEXT,
                UNIQUE(project_id, config_type)
            )
        ''')

        # 索引
        conn.execute('CREATE INDEX IF NOT EXISTS idx_config_project ON project_configs(project_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_config_type ON project_configs(config_type)')

        # 项目统计信息全局视图表（从各项目 documents.db 同步汇总）
        conn.execute('''
            CREATE TABLE IF NOT EXISTS project_stats (
                project_id TEXT PRIMARY KEY,
                project_name TEXT NOT NULL,
                total_docs INTEGER DEFAULT 0,
                archived_docs INTEGER DEFAULT 0,
                not_involved_docs INTEGER DEFAULT 0,
                total_file_size INTEGER DEFAULT 0,
                last_sync_time TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        ''')

        # PDF转换缓存记录表
        conn.execute('''
            CREATE TABLE IF NOT EXISTS pdf_conversions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id TEXT NOT NULL,
                cache_key TEXT NOT NULL,
                pdf_path TEXT NOT NULL,
                source_file_path TEXT,
                source_file_mtime REAL,
                is_complete INTEGER DEFAULT 1,
                converted_at TEXT,
                last_accessed TEXT,
                UNIQUE(doc_id, cache_key)
            )
        ''')

        # 索引
        conn.execute('CREATE INDEX IF NOT EXISTS idx_pdf_conv_doc_id ON pdf_conversions(doc_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_pdf_conv_cache_key ON pdf_conversions(cache_key)')

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

    # ==================== PDF转换缓存 CRUD ====================

    def add_pdf_conversion(self, doc_id: str, cache_key: str, pdf_path: str,
                           source_file_path: str = None, source_file_mtime: float = None,
                           is_complete: bool = True) -> int:
        """添加或更新PDF转换记录"""
        from datetime import datetime
        now = datetime.now().isoformat()
        # 先尝试删除旧记录（同一 doc_id + cache_key）
        self.execute_write(
            'DELETE FROM pdf_conversions WHERE doc_id = ? AND cache_key = ?',
            (doc_id, cache_key)
        )
        sql = '''
            INSERT INTO pdf_conversions (doc_id, cache_key, pdf_path, source_file_path,
                                          source_file_mtime, is_complete, converted_at, last_accessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        '''
        return self.execute_insert(sql, (
            doc_id, cache_key, pdf_path, source_file_path,
            source_file_mtime, 1 if is_complete else 0, now, now
        ))

    def get_pdf_conversion(self, cache_key: str) -> Optional[Dict]:
        """根据 cache_key 获取PDF转换记录"""
        sql = 'SELECT * FROM pdf_conversions WHERE cache_key = ?'
        results = self.execute(sql, (cache_key,))
        return results[0] if results else None

    def get_pdf_conversion_by_doc_id(self, doc_id: str) -> Optional[Dict]:
        """根据 doc_id 获取最新的PDF转换记录"""
        sql = 'SELECT * FROM pdf_conversions WHERE doc_id = ? ORDER BY converted_at DESC LIMIT 1'
        results = self.execute(sql, (doc_id,))
        return results[0] if results else None

    def update_pdf_conversion_access(self, cache_key: str) -> bool:
        """更新PDF转换记录的访问时间"""
        from datetime import datetime
        sql = 'UPDATE pdf_conversions SET last_accessed = ? WHERE cache_key = ?'
        return self.execute_write(sql, (datetime.now().isoformat(), cache_key)) > 0

    def delete_pdf_conversion(self, doc_id: str, cache_key: str = None) -> bool:
        """删除PDF转换记录及其PDF文件"""
        if cache_key:
            sql = 'SELECT * FROM pdf_conversions WHERE doc_id = ? AND cache_key = ?'
            results = self.execute(sql, (doc_id, cache_key))
        else:
            sql = 'SELECT * FROM pdf_conversions WHERE doc_id = ?'
            results = self.execute(sql, (doc_id,))

        deleted_count = 0
        for record in results:
            pdf_path = record.get('pdf_path')
            if pdf_path and os.path.exists(pdf_path):
                try:
                    os.remove(pdf_path)
                    print(f"[DB] 删除PDF文件: {pdf_path}")
                except Exception as e:
                    print(f"[DB] 删除PDF文件失败: {e}")

        if cache_key:
            deleted_count = self.execute_write(
                'DELETE FROM pdf_conversions WHERE doc_id = ? AND cache_key = ?',
                (doc_id, cache_key)
            )
        else:
            deleted_count = self.execute_write(
                'DELETE FROM pdf_conversions WHERE doc_id = ?',
                (doc_id,)
            )
        return deleted_count > 0

    def get_pdf_conversions_by_project(self, project_id: str) -> List[Dict]:
        """获取项目所有PDF转换记录（通过 project_configs 中的 documents_index 查找）"""
        # 先获取项目的所有文档
        sql = "SELECT config_data FROM project_configs WHERE config_type = 'documents_index' AND project_id = ?"
        results = self.execute(sql, (project_id,))
        all_records = []
        for row in results:
            try:
                docs = json.loads(row.get('config_data', '{}')).get('documents', {})
                for doc_id, doc_info in docs.items():
                    record = self.get_pdf_conversion_by_doc_id(doc_id)
                    if record:
                        all_records.append(record)
            except Exception:
                continue
        return all_records

    def cleanup_expired_pdf_conversions(self, days: int = 30) -> int:
        """清理过期的PDF转换记录"""
        import time
        from datetime import datetime
        cutoff_time = time.time() - days * 24 * 3600
        sql = 'SELECT * FROM pdf_conversions'
        results = self.execute(sql)
        expired_keys = []
        for record in results:
            last_accessed = record.get('last_accessed', record.get('converted_at', ''))
            if last_accessed:
                try:
                    accessed_ts = datetime.fromisoformat(last_accessed).timestamp()
                    if accessed_ts < cutoff_time:
                        expired_keys.append(record['cache_key'])
                except Exception:
                    continue

        deleted_count = 0
        for key in expired_keys:
            try:
                record = self.get_pdf_conversion(key)
                if record:
                    pdf_path = record.get('pdf_path')
                    if pdf_path and os.path.exists(pdf_path):
                        os.remove(pdf_path)
                self.execute_write('DELETE FROM pdf_conversions WHERE cache_key = ?', (key,))
                deleted_count += 1
            except Exception:
                continue

        if deleted_count > 0:
            print(f"[DB] 清理了 {deleted_count} 个过期PDF转换记录")
        return deleted_count

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

    # ==================== 项目配置数据 CRUD ====================

    def save_project_config(self, project_id: str, config_type: str, config_data: Dict) -> bool:
        """保存项目配置数据
        
        Args:
            project_id: 项目ID
            config_type: 配置类型（project_info, requirements, categories, documents_index, documents_archived, draft, zip_uploads等）
            config_data: 配置数据字典
        
        Returns:
            bool: 是否保存成功
        """
        import json
        from datetime import datetime, date
        
        def json_serial(obj):
            """JSON serializer for objects not serializable by default json code"""
            if isinstance(obj, (datetime, date)):
                return obj.isoformat()
            if hasattr(obj, '__dict__'):
                return obj.__dict__
            raise TypeError(f"Type {type(obj)} not serializable")
        
        try:
            sql = '''
                INSERT INTO project_configs (project_id, config_type, config_data, updated_time)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(project_id, config_type) DO UPDATE SET
                    config_data = excluded.config_data,
                    updated_time = excluded.updated_time
            '''
            self.execute_write(sql, (
                project_id,
                config_type,
                json.dumps(config_data, ensure_ascii=False, indent=2, default=json_serial),
                datetime.now().isoformat()
            ))
            return True
        except Exception as e:
            print(f"保存项目配置失败: {e}")
            return False

    def get_project_config(self, project_id: str, config_type: str) -> Optional[Dict]:
        """获取项目配置数据
        
        Args:
            project_id: 项目ID
            config_type: 配置类型
        
        Returns:
            Optional[Dict]: 配置数据，不存在返回None
        """
        import json
        try:
            sql = 'SELECT config_data FROM project_configs WHERE project_id = ? AND config_type = ?'
            results = self.execute(sql, (project_id, config_type))
            if results:
                return json.loads(results[0]['config_data'])
            return None
        except Exception as e:
            print(f"获取项目配置失败: {e}")
            return None

    def delete_project_config(self, project_id: str, config_type: str = None) -> bool:
        """删除项目配置数据
        
        Args:
            project_id: 项目ID
            config_type: 配置类型（None表示删除该项目的所有配置）
        
        Returns:
            bool: 是否删除成功
        """
        try:
            if config_type:
                sql = 'DELETE FROM project_configs WHERE project_id = ? AND config_type = ?'
                self.execute_write(sql, (project_id, config_type))
            else:
                sql = 'DELETE FROM project_configs WHERE project_id = ?'
                self.execute_write(sql, (project_id,))
            return True
        except Exception as e:
            print(f"删除项目配置失败: {e}")
            return False

    def export_to_json(self) -> Dict:
        """导出为JSON数据"""
        projects = self.list_projects(include_deleted=True)
        zip_uploads = self.get_zip_uploads()

        return {
            'projects': projects,
            'zip_uploads': zip_uploads
        }

    # ==================== 项目统计信息同步 ====================

    def sync_project_stats(self, project_id: str, project_name: str = None) -> bool:
        """同步指定项目的统计信息到全局视图表
        
        从项目的 documents.db 读取统计信息，汇总后写入 project_stats 表
        
        Args:
            project_id: 项目ID
            project_name: 项目名称（可选，不传则从 projects 表查询）
        
        Returns:
            bool: 是否同步成功
        """
        try:
            # 获取项目名称
            if project_name is None:
                project = self.get_project(project_id)
                if not project:
                    print(f"[SyncStats] 项目不存在: {project_id}")
                    return False
                project_name = project.get('name')

            # 获取项目文档数据库路径
            from .base import get_config
            config = get_config()
            projects_base = config.get('projects_base_folder', 'projects')
            doc_db_path = os.path.join(projects_base, project_name, 'data', 'db', 'documents.db')

            # 如果项目数据库不存在，记录为0
            if not os.path.exists(doc_db_path):
                sql = '''
                    INSERT INTO project_stats (project_id, project_name, total_docs, archived_docs, 
                        not_involved_docs, total_file_size, last_sync_time)
                    VALUES (?, ?, 0, 0, 0, 0, ?)
                    ON CONFLICT(project_id) DO UPDATE SET
                        total_docs = 0,
                        archived_docs = 0,
                        not_involved_docs = 0,
                        total_file_size = 0,
                        last_sync_time = excluded.last_sync_time
                '''
                self.execute_write(sql, (project_id, project_name, datetime.now().isoformat()))
                return True

            # 从项目数据库读取统计信息
            try:
                conn = sqlite3.connect(doc_db_path, timeout=5.0)
                conn.row_factory = sqlite3.Row
                cursor = conn.execute('''
                    SELECT 
                        COUNT(*) as total_docs,
                        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_docs,
                        SUM(CASE WHEN status = 'not_involved' THEN 1 ELSE 0 END) as not_involved_docs,
                        SUM(COALESCE(file_size, 0)) as total_file_size
                    FROM documents
                ''')
                row = cursor.fetchone()
                conn.close()

                stats = {
                    'total_docs': row['total_docs'] or 0,
                    'archived_docs': row['archived_docs'] or 0,
                    'not_involved_docs': row['not_involved_docs'] or 0,
                    'total_file_size': row['total_file_size'] or 0
                }
            except Exception as e:
                print(f"[SyncStats] 读取项目数据库失败 {project_name}: {e}")
                # 记录为0，避免重复报错
                stats = {'total_docs': 0, 'archived_docs': 0, 'not_involved_docs': 0, 'total_file_size': 0}

            # 更新全局视图表
            sql = '''
                INSERT INTO project_stats (project_id, project_name, total_docs, archived_docs, 
                    not_involved_docs, total_file_size, last_sync_time)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    project_name = excluded.project_name,
                    total_docs = excluded.total_docs,
                    archived_docs = excluded.archived_docs,
                    not_involved_docs = excluded.not_involved_docs,
                    total_file_size = excluded.total_file_size,
                    last_sync_time = excluded.last_sync_time
            '''
            self.execute_write(sql, (
                project_id, project_name,
                stats['total_docs'], stats['archived_docs'],
                stats['not_involved_docs'], stats['total_file_size'],
                datetime.now().isoformat()
            ))
            return True

        except Exception as e:
            print(f"[SyncStats] 同步项目统计失败 {project_id}: {e}")
            import traceback
            traceback.print_exc()
            return False

    def sync_all_project_stats(self) -> Dict[str, int]:
        """同步所有项目的统计信息
        
        Returns:
            Dict: {'success': 成功数, 'failed': 失败数}
        """
        projects = self.list_projects(include_deleted=False)
        success = 0
        failed = 0

        for project in projects:
            project_id = project.get('id')
            project_name = project.get('name')
            if self.sync_project_stats(project_id, project_name):
                success += 1
            else:
                failed += 1

        print(f"[SyncStats] 同步完成: {success} 成功, {failed} 失败")
        return {'success': success, 'failed': failed}

    def get_project_stats(self, project_id: str = None) -> Union[Dict, List[Dict]]:
        """获取项目统计信息
        
        Args:
            project_id: 项目ID（None则返回所有项目统计）
        
        Returns:
            Dict 或 List[Dict]: 项目统计信息
        """
        if project_id:
            sql = 'SELECT * FROM project_stats WHERE project_id = ?'
            results = self.execute(sql, (project_id,))
            return results[0] if results else None
        else:
            sql = '''
                SELECT s.*, p.created_time, p.description 
                FROM project_stats s
                LEFT JOIN projects p ON s.project_id = p.id
                ORDER BY s.total_docs DESC
            '''
            return self.execute(sql)

    def get_global_stats(self) -> Dict:
        """获取全局统计信息
        
        Returns:
            Dict: 所有项目的汇总统计
        """
        sql = '''
            SELECT 
                COUNT(DISTINCT project_id) as project_count,
                SUM(total_docs) as total_docs,
                SUM(archived_docs) as archived_docs,
                SUM(not_involved_docs) as not_involved_docs,
                SUM(total_file_size) as total_file_size
            FROM project_stats
        '''
        results = self.execute(sql)
        if results:
            row = results[0]
            return {
                'project_count': row['project_count'] or 0,
                'total_docs': row['total_docs'] or 0,
                'archived_docs': row['archived_docs'] or 0,
                'not_involved_docs': row['not_involved_docs'] or 0,
                'total_file_size': row['total_file_size'] or 0,
                'total_file_size_mb': round((row['total_file_size'] or 0) / (1024 * 1024), 2)
            }
        return {
            'project_count': 0, 'total_docs': 0, 'archived_docs': 0,
            'not_involved_docs': 0, 'total_file_size': 0, 'total_file_size_mb': 0
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
        try:
            with _file_lock(self.db_path, exclusive=True):
                conn = self._get_connection()
                try:
                    self._create_document_tables(conn)
                    conn.commit()
                finally:
                    conn.close()
        except Exception as e:
            print(f"[DB] 初始化文档数据库表失败: {e}")
            import traceback
            traceback.print_exc()
            # 如果数据库文件损坏，尝试删除后重建
            try:
                if os.path.exists(self.db_path):
                    print(f"[DB] 尝试删除损坏的数据库文件: {self.db_path}")
                    os.remove(self.db_path)
                    for suffix in ('-wal', '-shm'):
                        wal_path = self.db_path + suffix
                        if os.path.exists(wal_path):
                            os.remove(wal_path)
                with _file_lock(self.db_path, exclusive=True):
                    conn = self._get_connection()
                    try:
                        self._create_document_tables(conn)
                        conn.commit()
                        print(f"[DB] 文档数据库重建成功: {self.db_path}")
                    finally:
                        conn.close()
            except Exception as e2:
                print(f"[DB] 文档数据库重建也失败了: {e2}")
                import traceback
                traceback.print_exc()

    def _create_document_tables(self, conn):
        """创建文档数据库表"""
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
                source TEXT,
                root_directory TEXT
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
            'custom_attrs': 'TEXT',  # JSON格式存储自定义属性
            'root_directory': 'TEXT'  # ZIP归档时选择的根目录，用于显示截断
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
                      custom_attrs: Dict = None, root_directory: str = '') -> bool:
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
                                   doc_date, sign_date, directory, source, custom_attrs,
                                   root_directory)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        try:
            self.execute_insert(sql, (doc_id, project_id, project_name, cycle, doc_name,
                                       file_path, file_size, file_type, original_filename,
                                       upload_time, status,
                                       has_seal, party_a_seal, party_b_seal, no_seal,
                                       no_signature, party_a_signer or '', party_b_signer or '',
                                       doc_date or '', sign_date or '',
                                       directory or '/', source or '', json.dumps(custom_attrs, ensure_ascii=False),
                                       root_directory or ''))
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
            # 确保 root_directory 有默认值（空字符串等同于 '/'，表示不截断）
            if not doc.get('root_directory'):
                doc['root_directory'] = ''
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
            # 确保 root_directory 有默认值（空字符串等同于 '/'，表示不截断）
            if not doc.get('root_directory'):
                doc['root_directory'] = ''
        
        return results

    def update_document(self, doc_id: str, **kwargs) -> bool:
        """更新文档信息"""
        allowed_fields = [
            'cycle', 'doc_name', 'file_path', 'file_size', 'file_type',
            'original_filename', 'status', 'matched_file', 'matched_time', 'archived',
            # 盖章和签字字段
            'has_seal', 'party_a_seal', 'party_b_seal', 'no_seal',
            'no_signature', 'party_a_signer', 'party_b_signer',
            'doc_date', 'sign_date', 'directory', 'source',
            'root_directory'
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
