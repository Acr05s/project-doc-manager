"""数据库迁移脚本

用途：当从其他分支合并到 main 分支时，运行此脚本升级数据库结构。
此脚本可独立运行，无需启动 Flask 应用。

使用方法：
    python tools/migrate_db.py [数据库路径]

如果不指定数据库路径，默认使用 data/users.db
"""

import sqlite3
import uuid
import sys
import os
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent

# 默认数据库路径
DEFAULT_DB_PATH = PROJECT_ROOT / 'data' / 'users.db'


def get_current_version(cursor):
    """获取当前迁移版本"""
    try:
        cursor.execute('CREATE TABLE IF NOT EXISTS migration_versions (version INTEGER PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
        cursor.execute('SELECT version FROM migration_versions ORDER BY version DESC LIMIT 1')
        row = cursor.fetchone()
        return row[0] if row else 0
    except Exception:
        return 0


def migrate(db_path):
    """执行数据库迁移"""
    db_path = Path(db_path)
    if not db_path.exists():
        print(f'数据库文件不存在: {db_path}')
        print('如果是全新安装，启动应用后会自动创建数据库。')
        return False

    print(f'数据库路径: {db_path}')
    print(f'文件大小: {db_path.stat().st_size / 1024:.1f} KB')
    print()

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        current_version = get_current_version(cursor)
        print(f'当前迁移版本: {current_version}')

        if current_version >= 6:
            print('数据库已经是最新版本，无需迁移。')
            return True

        print(f'需要迁移: {current_version} -> 6')
        print()

        conn.execute('BEGIN TRANSACTION')
        try:
            # ==================== 迁移版本 1 ====================
            if current_version < 1:
                print('执行迁移 1: 添加用户状态和组织字段...')
                cursor.execute('PRAGMA table_info(users)')
                existing = {row[1] for row in cursor.fetchall()}
                for col, dtype in [
                    ('status', "TEXT DEFAULT 'active'"),
                    ('organization', 'TEXT'),
                    ('approver_id', 'INTEGER'),
                    ('approved_at', 'TIMESTAMP'),
                    ('email', 'TEXT')
                ]:
                    if col not in existing:
                        cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {dtype}')
                        print(f'  + {col}')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (1)')
                print('  完成')

            # ==================== 迁移版本 2 ====================
            if current_version < 2:
                print('执行迁移 2: 添加审批安全码字段...')
                cursor.execute('PRAGMA table_info(users)')
                existing = {row[1] for row in cursor.fetchall()}
                for col, dtype in [
                    ('approval_code_hash', 'TEXT'),
                    ('approval_code_needs_change', 'INTEGER DEFAULT 1')
                ]:
                    if col not in existing:
                        cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {dtype}')
                        print(f'  + {col}')
                cursor.execute('UPDATE users SET approval_code_needs_change = 1 WHERE approval_code_needs_change IS NULL')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (2)')
                print('  完成')

            # ==================== 迁移版本 3 ====================
            if current_version < 3:
                print('执行迁移 3: 创建归档审批表...')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS archive_approvals (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id TEXT NOT NULL,
                        cycle TEXT NOT NULL,
                        doc_names TEXT NOT NULL,
                        requester_id INTEGER NOT NULL,
                        requester_username TEXT,
                        status TEXT NOT NULL DEFAULT 'pending',
                        target_approver_ids TEXT,
                        approved_by_id INTEGER,
                        approved_by_username TEXT,
                        reject_reason TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        resolved_at TIMESTAMP,
                        FOREIGN KEY (requester_id) REFERENCES users(id)
                    )
                ''')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (3)')
                print('  完成')

            # ==================== 迁移版本 4 ====================
            if current_version < 4:
                print('执行迁移 4: 为各表添加UUID列...')
                tables_to_uuid = [
                    ('users', 'id'),
                    ('messages', 'id'),
                    ('archive_approvals', 'id'),
                    ('project_transfers', 'id')
                ]
                for table, pk_col in tables_to_uuid:
                    try:
                        cursor.execute(f'PRAGMA table_info({table})')
                        cols = {row[1] for row in cursor.fetchall()}
                        if 'uuid' not in cols:
                            cursor.execute(f'ALTER TABLE {table} ADD COLUMN uuid TEXT')
                            cursor.execute(f'SELECT {pk_col} FROM {table}')
                            for (row_id,) in cursor.fetchall():
                                cursor.execute(f'UPDATE {table} SET uuid = ? WHERE {pk_col} = ?', (str(uuid.uuid4()), row_id))
                            cursor.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_uuid ON {table}(uuid)')
                            print(f'  + {table}.uuid')
                    except Exception as e:
                        print(f'  跳过 {table}: {e}')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (4)')
                print('  完成')

            # ==================== 迁移版本 5 ====================
            if current_version < 5:
                print('执行迁移 5: 添加多级审批支持字段...')
                cursor.execute('PRAGMA table_info(archive_approvals)')
                existing = {row[1] for row in cursor.fetchall()}
                for col, dtype in [
                    ('approval_stages', 'TEXT'),
                    ('current_stage', 'INTEGER DEFAULT 1'),
                    ('stage_completed', 'BOOLEAN DEFAULT 0'),
                    ('stage_history', 'TEXT')
                ]:
                    if col not in existing:
                        cursor.execute(f'ALTER TABLE archive_approvals ADD COLUMN {col} {dtype}')
                        print(f'  + {col}')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (5)')
                print('  完成')

            # ==================== 迁移版本 6 ====================
            if current_version < 6:
                print('执行迁移 6: 用户表添加 display_name 字段...')
                cursor.execute('PRAGMA table_info(users)')
                existing = {row[1] for row in cursor.fetchall()}
                if 'display_name' not in existing:
                    cursor.execute('ALTER TABLE users ADD COLUMN display_name TEXT')
                    print('  + display_name')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (6)')
                print('  完成')

            conn.commit()
            print()
            print('所有迁移执行成功！当前版本: 6')
            return True

        except Exception as e:
            conn.rollback()
            print(f'\n迁移失败，已回滚: {e}')
            return False


def show_db_info(db_path):
    """显示数据库当前状态信息"""
    db_path = Path(db_path)
    if not db_path.exists():
        print(f'数据库文件不存在: {db_path}')
        return

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        version = get_current_version(cursor)
        print(f'当前迁移版本: {version}')

        # 显示表结构
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row[0] for row in cursor.fetchall()]
        print(f'数据库表 ({len(tables)}): {", ".join(tables)}')

        # 显示用户表列
        cursor.execute('PRAGMA table_info(users)')
        cols = [row[1] for row in cursor.fetchall()]
        print(f'users 表列 ({len(cols)}): {", ".join(cols)}')

        # 统计
        for table in ['users', 'messages', 'archive_approvals']:
            if table in tables:
                cursor.execute(f'SELECT COUNT(*) FROM {table}')
                count = cursor.fetchone()[0]
                print(f'  {table}: {count} 条记录')


if __name__ == '__main__':
    if len(sys.argv) > 1:
        if sys.argv[1] == '--info':
            db = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_DB_PATH)
            show_db_info(db)
        else:
            db = sys.argv[1]
            migrate(db)
    else:
        migrate(str(DEFAULT_DB_PATH))
