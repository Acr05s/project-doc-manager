"""文档审查结果字段迁移

为 documents 表添加 review_result 列（TEXT DEFAULT ""）。
review_result 同时存储在项目 JSON 文件的 uploaded_docs[] 中，
SQLite 作为索引缓存，两者通过 save_documents_index 保持同步。
"""
import sqlite3
from pathlib import Path


def description():
    return "为 documents 表添加 review_result 列（文档审查结果）"


def upgrade(db_path: str):
    """为 users.db 中的 documents 表添加 review_result 列（如已存在则跳过）。
    同时扫描所有项目的 per-project documents.db 并添加同一列。
    """
    _add_column_if_missing(db_path)

    # 扫描 projects/ 目录下所有 per-project documents.db
    projects_dir = Path(db_path).parent.parent / 'projects'
    if projects_dir.exists():
        for db_file in projects_dir.rglob('documents.db'):
            try:
                _add_column_if_missing(str(db_file))
            except Exception as e:
                print(f"  [WARN] 处理 {db_file} 失败: {e}")


def _add_column_if_missing(db_path: str):
    with sqlite3.connect(db_path) as conn:
        existing = {row[1] for row in conn.execute("PRAGMA table_info(documents)")}
        if 'review_result' not in existing:
            conn.execute('ALTER TABLE documents ADD COLUMN review_result TEXT DEFAULT ""')
            conn.commit()
            print(f"  [OK] 已为 {db_path} 的 documents 表添加 review_result 列")
        else:
            print(f"  [SKIP] {db_path} 的 documents 表已有 review_result 列")
