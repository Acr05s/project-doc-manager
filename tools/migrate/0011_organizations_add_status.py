"""迁移说明: organizations 表新增 status 字段"""
import sqlite3


def description():
    return "organizations 表新增 status 字段（承建单位审批状态）"


def upgrade(db_path):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        columns = [row[1] for row in cursor.execute('PRAGMA table_info(organizations)')]
        if 'status' not in columns:
            cursor.execute(
                "ALTER TABLE organizations ADD COLUMN status TEXT DEFAULT 'approved'"
            )
        conn.commit()
