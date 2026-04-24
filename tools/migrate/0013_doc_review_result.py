"""文档审查结果及最后修改时间字段迁移

为 documents 表添加 review_result 列（TEXT DEFAULT ""）和 last_modified 列（TEXT）。
"""
import sqlite3
from pathlib import Path


def description():
    return "为 documents 表添加 review_result 和 last_modified 列"


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
        existing = {row[1] for row in conn.execute("PRAGMA table_info(documents)")}
        added = []
        if 'review_result' not in existing:
            conn.execute('ALTER TABLE documents ADD COLUMN review_result TEXT DEFAULT ""')
            added.append('review_result')
        if 'last_modified' not in existing:
            conn.execute('ALTER TABLE documents ADD COLUMN last_modified TEXT')
            added.append('last_modified')
        if added:
            conn.commit()
            print(f"  [OK] 已为 {db_path} 的 documents 表添加列: {', '.join(added)}")
        else:
            print(f"  [SKIP] {db_path} 的 documents 表已有 review_result 和 last_modified 列")
