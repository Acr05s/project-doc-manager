"""标注完成审批表迁移

创建 annotation_approvals 表，用于标注完成的多级审批流程。
"""
import sqlite3
from .utils import _check_table_exists


def description():
    return "创建标注完成审批表 annotation_approvals"


def upgrade(db_path: str):
    with sqlite3.connect(db_path) as conn:
        if _check_table_exists(conn, 'annotation_approvals'):
            print(f"  [SKIP] {db_path} 中已存在 annotation_approvals 表")
            return

        conn.execute('''
            CREATE TABLE IF NOT EXISTS annotation_approvals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT UNIQUE,
                project_id TEXT NOT NULL,
                cycle TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                doc_name TEXT,
                entry_id TEXT NOT NULL,
                entry_remark TEXT,
                complete_content TEXT,
                requester_id INTEGER NOT NULL,
                requester_username TEXT,
                status TEXT DEFAULT 'pending',
                approval_stages TEXT,
                current_stage INTEGER DEFAULT 1,
                stage_completed BOOLEAN DEFAULT 0,
                stage_history TEXT,
                approved_by_id INTEGER,
                approved_by_username TEXT,
                reject_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_annotation_approvals_project ON annotation_approvals(project_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_annotation_approvals_status ON annotation_approvals(status)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_annotation_approvals_uuid ON annotation_approvals(uuid)')
        conn.commit()
        print(f"  [OK] 已创建 annotation_approvals 表")
