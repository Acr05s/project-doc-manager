"""文档自定义属性及默认值迁移

为 documents 表添加 custom_attrs 列（TEXT DEFAULT '{}'），
为 directory 列设置默认值 '/'。
"""
import sqlite3
from pathlib import Path

from .utils import _check_table_exists


def description():
    return "为 documents 表添加 custom_attrs 列和设置默认值"


def upgrade(db_path: str):
    _add_columns_if_missing(db_path)

    projects_dir = Path(db_path).parent.parent / 'projects'
    if projects_dir.exists():
        for db_file in projects_dir.rglob('documents.db'):
            try:
                _add_columns_if_missing(str(db_file))
            except Exception as e:
                print(f"  [WARN] 处理 {db_file} 失败: {e}")


def _add_columns_if_missing(db_path: str):
    with sqlite3.connect(db_path) as conn:
        # 检查documents表是否存在
        if not _check_table_exists(conn, 'documents'):
            print(f"  [SKIP] {db_path} 中不存在 documents 表")
            return
        
        # 获取所有列信息，包括默认值
        cursor = conn.execute("PRAGMA table_info(documents)")
        columns_info = {row[1]: row[4] for row in cursor}  # row[1]是列名，row[4]是默认值
        
        added = []
        
        # 添加 custom_attrs 列
        if 'custom_attrs' not in columns_info:
            conn.execute("ALTER TABLE documents ADD COLUMN custom_attrs TEXT DEFAULT '{}'")
            added.append('custom_attrs')
        
        # 添加 directory 列（仅当不存在时）
        # 注意：SQLite 不支持修改现有列的默认值，只能在添加新列时设置默认值
        # 如果 directory 列已存在，无论其默认值是什么都不会被修改
        if 'directory' not in columns_info:
            conn.execute("ALTER TABLE documents ADD COLUMN directory TEXT DEFAULT '/'")
            added.append('directory')
        
        if added:
            conn.commit()
            print(f"  [OK] 已为 {db_path} 的 documents 表添加列: {', '.join(added)}")
        else:
            print(f"  [SKIP] {db_path} 的 documents 表已有所需列")
