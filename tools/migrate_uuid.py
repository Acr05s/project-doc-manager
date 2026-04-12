#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UUID迁移工具 - 为旧版本系统迁移到UUID标识符

功能说明：
  将数据库中所有对外暴露的ID字段添加UUID列，实现内部使用自增整数ID、
  外部API返回UUID的双列策略，防止ID枚举攻击。

迁移内容：
  1. users 表 - 添加 uuid 列 + 唯一索引
  2. messages 表 - 添加 uuid 列 + 唯一索引
  3. archive_approvals 表 - 添加 uuid 列 + 唯一索引
  4. project_transfers 表 - 添加 uuid 列 + 唯一索引
  5. migration_versions 表 - 写入版本号 4

使用方法：
  python tools/migrate_uuid.py                    # 使用默认数据库 data/users.db
  python tools/migrate_uuid.py --db path/to.db    # 指定数据库路径
  python tools/migrate_uuid.py --dry-run           # 仅预览，不实际执行
  python tools/migrate_uuid.py --backup            # 迁移前自动备份数据库

注意事项：
  - 此脚本可安全重复运行，已存在UUID列的表会被跳过
  - 迁移前建议先备份数据库（使用 --backup 选项）
  - 需要配合新版本代码才能正常使用UUID功能
"""

import sqlite3
import uuid
import os
import sys
import shutil
import argparse
from datetime import datetime
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).parent.parent


def get_db_path(custom_path=None):
    """获取数据库路径"""
    if custom_path:
        return Path(custom_path)
    return BASE_DIR / 'data' / 'users.db'


def check_current_version(cursor):
    """检查当前迁移版本"""
    try:
        cursor.execute('SELECT MAX(version) FROM migration_versions')
        row = cursor.fetchone()
        return row[0] if row and row[0] else 0
    except sqlite3.OperationalError:
        # migration_versions 表不存在
        return 0


def get_table_columns(cursor, table_name):
    """获取表的所有列名"""
    cursor.execute(f'PRAGMA table_info({table_name})')
    return {row[1] for row in cursor.fetchall()}


def table_exists(cursor, table_name):
    """检查表是否存在"""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cursor.fetchone() is not None


def add_uuid_column(cursor, table_name, index_name, dry_run=False):
    """为表添加UUID列并生成UUID值"""
    if not table_exists(cursor, table_name):
        print(f"  [跳过] 表 {table_name} 不存在")
        return 0

    cols = get_table_columns(cursor, table_name)
    if 'uuid' in cols:
        # 检查是否有空的uuid值
        cursor.execute(f'SELECT COUNT(*) FROM {table_name} WHERE uuid IS NULL OR uuid = ""')
        null_count = cursor.fetchone()[0]
        if null_count > 0:
            print(f"  [修复] 表 {table_name} 有 {null_count} 行缺少UUID，补充生成中...")
            if not dry_run:
                cursor.execute(f'SELECT id FROM {table_name} WHERE uuid IS NULL OR uuid = ""')
                for (row_id,) in cursor.fetchall():
                    cursor.execute(f'UPDATE {table_name} SET uuid = ? WHERE id = ?',
                                   (str(uuid.uuid4()), row_id))
            return null_count
        else:
            print(f"  [跳过] 表 {table_name} 已有uuid列且数据完整")
            return 0

    # 获取现有行数
    cursor.execute(f'SELECT COUNT(*) FROM {table_name}')
    row_count = cursor.fetchone()[0]

    print(f"  [迁移] 表 {table_name}: 添加uuid列, 为 {row_count} 行生成UUID...")

    if not dry_run:
        # 添加列
        cursor.execute(f'ALTER TABLE {table_name} ADD COLUMN uuid TEXT')

        # 为已有行生成UUID
        cursor.execute(f'SELECT id FROM {table_name}')
        for (row_id,) in cursor.fetchall():
            cursor.execute(f'UPDATE {table_name} SET uuid = ? WHERE id = ?',
                           (str(uuid.uuid4()), row_id))

        # 创建唯一索引
        cursor.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table_name}(uuid)')

    return row_count


def migrate(db_path, dry_run=False, backup=False):
    """执行UUID迁移"""
    db_path = Path(db_path)

    if not db_path.exists():
        print(f"[错误] 数据库文件不存在: {db_path}")
        return False

    print(f"{'[预览模式] ' if dry_run else ''}UUID迁移工具")
    print(f"数据库: {db_path}")
    print(f"文件大小: {db_path.stat().st_size / 1024:.1f} KB")
    print()

    # 备份
    if backup and not dry_run:
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        backup_path = db_path.with_suffix(f'.db.bak_{timestamp}')
        print(f"[备份] 创建数据库备份: {backup_path}")
        shutil.copy2(db_path, backup_path)
        print(f"[备份] 备份完成")
        print()

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        # 检查当前版本
        current_version = check_current_version(cursor)
        print(f"当前迁移版本: {current_version}")

        if current_version >= 4:
            print("[信息] 数据库已完成UUID迁移（版本 >= 4）")
            # 仍然检查是否有缺失的UUID
            print("\n检查UUID数据完整性...")
            tables = [
                ('users', 'idx_users_uuid'),
                ('messages', 'idx_messages_uuid'),
                ('archive_approvals', 'idx_archive_approvals_uuid'),
                ('project_transfers', 'idx_project_transfers_uuid'),
            ]
            fixed = 0
            for table_name, index_name in tables:
                fixed += add_uuid_column(cursor, table_name, index_name, dry_run)
            if fixed > 0 and not dry_run:
                conn.commit()
                print(f"\n[完成] 修复了 {fixed} 行缺失的UUID")
            else:
                print("\n[完成] 所有UUID数据完整，无需修复")
            return True

        print(f"\n开始迁移到版本 4...")
        print("=" * 50)

        # 确保 migration_versions 表存在
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS migration_versions (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 迁移各表
        tables = [
            ('users', 'idx_users_uuid'),
            ('messages', 'idx_messages_uuid'),
            ('archive_approvals', 'idx_archive_approvals_uuid'),
            ('project_transfers', 'idx_project_transfers_uuid'),
        ]

        total_rows = 0
        for table_name, index_name in tables:
            count = add_uuid_column(cursor, table_name, index_name, dry_run)
            total_rows += count

        # 记录迁移版本
        if not dry_run:
            cursor.execute('INSERT OR IGNORE INTO migration_versions (version) VALUES (4)')
            conn.commit()

        print()
        print("=" * 50)
        if dry_run:
            print(f"[预览] 将为 {total_rows} 行数据生成UUID（未实际执行）")
        else:
            print(f"[完成] 迁移成功，共生成 {total_rows} 个UUID")
            print(f"[完成] 数据库迁移版本已更新至 4")

        return True

    except Exception as e:
        conn.rollback()
        print(f"\n[错误] 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()


def show_status(db_path):
    """显示数据库UUID迁移状态"""
    db_path = Path(db_path)
    if not db_path.exists():
        print(f"[错误] 数据库文件不存在: {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    print(f"数据库: {db_path}")
    print()

    # 迁移版本
    version = check_current_version(cursor)
    print(f"迁移版本: {version} {'(已迁移UUID)' if version >= 4 else '(未迁移UUID)'}")
    print()

    # 各表状态
    tables = ['users', 'messages', 'archive_approvals', 'project_transfers']
    for table_name in tables:
        if not table_exists(cursor, table_name):
            print(f"  {table_name}: 表不存在")
            continue

        cols = get_table_columns(cursor, table_name)
        cursor.execute(f'SELECT COUNT(*) FROM {table_name}')
        total = cursor.fetchone()[0]

        if 'uuid' in cols:
            cursor.execute(f'SELECT COUNT(*) FROM {table_name} WHERE uuid IS NOT NULL AND uuid != ""')
            with_uuid = cursor.fetchone()[0]
            cursor.execute(f'SELECT COUNT(*) FROM {table_name} WHERE uuid IS NULL OR uuid = ""')
            without_uuid = cursor.fetchone()[0]
            status = "✓ 完整" if without_uuid == 0 else f"⚠ 缺失 {without_uuid} 行"
            print(f"  {table_name}: {total} 行, UUID列存在, {status}")
        else:
            print(f"  {table_name}: {total} 行, UUID列不存在 ✗")

    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='UUID迁移工具 - 为数据库表添加UUID标识列',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python tools/migrate_uuid.py                     默认迁移
  python tools/migrate_uuid.py --backup            迁移前备份
  python tools/migrate_uuid.py --dry-run           预览模式
  python tools/migrate_uuid.py --status            查看状态
  python tools/migrate_uuid.py --db other.db       指定数据库
        """
    )
    parser.add_argument('--db', type=str, default=None,
                        help='数据库文件路径（默认: data/users.db）')
    parser.add_argument('--dry-run', action='store_true',
                        help='仅预览迁移内容，不实际执行')
    parser.add_argument('--backup', action='store_true',
                        help='迁移前自动备份数据库')
    parser.add_argument('--status', action='store_true',
                        help='仅显示当前迁移状态')

    args = parser.parse_args()
    db_path = get_db_path(args.db)

    if args.status:
        show_status(db_path)
        return

    success = migrate(db_path, dry_run=args.dry_run, backup=args.backup)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
