"""迁移说明: scheduled_tasks 表新增 email_enabled 字段"""
import sqlite3


def description():
    return "scheduled_tasks 表新增 email_enabled 字段（邮件通知开关）"


def upgrade(db_path):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        columns = [row[1] for row in cursor.execute('PRAGMA table_info(scheduled_tasks)')]
        if 'email_enabled' not in columns:
            cursor.execute(
                "ALTER TABLE scheduled_tasks ADD COLUMN email_enabled INTEGER DEFAULT 1"
            )
        conn.commit()
