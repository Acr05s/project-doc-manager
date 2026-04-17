"""迁移说明: scheduled_tasks 表新增 skip_holidays 字段"""
import sqlite3


def description():
    return "scheduled_tasks 表新增 skip_holidays 字段（跳过非工作日）"


def upgrade(db_path):
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        columns = [row[1] for row in cursor.execute('PRAGMA table_info(scheduled_tasks)')]
        if 'skip_holidays' not in columns:
            cursor.execute(
                'ALTER TABLE scheduled_tasks ADD COLUMN skip_holidays INTEGER DEFAULT 0'
            )
        conn.commit()
