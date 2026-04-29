"""标注完成审批表增加自动归档字段

当用户点击归档时，如果存在未完成的标注，系统自动发起标注完成流程，
并在所有标注审批通过后自动触发归档流程。
"""
import sqlite3
from .utils import _check_table_exists


def description():
    return "annotation_approvals 表增加 auto_archive_doc_name 字段"


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        if not _check_table_exists(conn, 'annotation_approvals'):
            print(f"  [SKIP] {db_path} 中不存在 annotation_approvals 表")
            return

        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(annotation_approvals)")
        columns = [row[1] for row in cursor.fetchall()]
        if 'auto_archive_doc_name' in columns:
            print(f"  [SKIP] auto_archive_doc_name 列已存在")
            return

        conn.execute('ALTER TABLE annotation_approvals ADD COLUMN auto_archive_doc_name TEXT')
        conn.commit()
        print(f"  [OK] 已添加 auto_archive_doc_name 列")
