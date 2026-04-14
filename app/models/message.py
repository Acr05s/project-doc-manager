"""站内信模型"""

import sqlite3
import uuid as uuid_module
from datetime import datetime
from pathlib import Path


class MessageManager:
    """站内信管理器"""
    
    def __init__(self, db_path=None):
        if db_path is None:
            from app.utils.base import get_config
            config = get_config()
            db_path = config.projects_base_folder.parent / 'data' / 'users.db'
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """初始化数据库"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER,
                    receiver_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    type TEXT DEFAULT 'system',
                    is_read INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    related_id TEXT,
                    related_type TEXT
                )
            ''')
            # 添加 uuid 列（如果不存在）
            cursor.execute('PRAGMA table_info(messages)')
            msg_cols = {row[1] for row in cursor.fetchall()}
            if 'uuid' not in msg_cols:
                cursor.execute('ALTER TABLE messages ADD COLUMN uuid TEXT')
                cursor.execute('SELECT id FROM messages')
                for (mid,) in cursor.fetchall():
                    cursor.execute('UPDATE messages SET uuid = ? WHERE id = ?', (str(uuid_module.uuid4()), mid))
                cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_uuid ON messages(uuid)')
            conn.commit()
    
    def send_message(self, receiver_id, title, content, sender_id=None, msg_type='system', related_id=None, related_type=None):
        """发送站内信"""
        try:
            new_uuid = str(uuid_module.uuid4())
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    '''INSERT INTO messages 
                       (sender_id, receiver_id, title, content, type, related_id, related_type, uuid) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                    (sender_id, receiver_id, title, content, msg_type, related_id, related_type, new_uuid)
                )
                conn.commit()
                return new_uuid
        except Exception as e:
            print(f"发送站内信失败: {e}")
            return None
    
    def get_messages(self, user_id, is_read=None, limit=50, offset=0):
        """获取用户的站内信列表"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            sql = '''
                SELECT m.id, m.sender_id, m.receiver_id, m.title, m.content, m.type, 
                       m.is_read, m.created_at, m.related_id, m.related_type,
                       u.username as sender_name, m.uuid
                FROM messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE m.receiver_id = ?
            '''
            params = [user_id]
            if is_read is not None:
                sql += ' AND m.is_read = ?'
                params.append(1 if is_read else 0)
            sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?'
            params.extend([limit, offset])
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [
                {
                    'id': row[0], 'sender_id': row[1], 'receiver_id': row[2],
                    'title': row[3], 'content': row[4], 'type': row[5],
                    'is_read': bool(row[6]), 'created_at': row[7],
                    'related_id': row[8], 'related_type': row[9],
                    'sender_name': row[10] or '系统', 'uuid': row[11]
                }
                for row in rows
            ]
    
    def get_unread_count(self, user_id):
        """获取未读消息数量"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND is_read = 0',
                (user_id,)
            )
            return cursor.fetchone()[0]
    
    def mark_as_read(self, message_id, user_id):
        """标记消息为已读"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE messages SET is_read = 1 WHERE id = ? AND receiver_id = ?',
                    (message_id, user_id)
                )
                conn.commit()
                return cursor.rowcount > 0
        except Exception:
            return False
    
    def mark_as_read_by_uuid(self, message_uuid, user_id):
        """根据UUID标记消息为已读"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE messages SET is_read = 1 WHERE uuid = ? AND receiver_id = ?',
                    (message_uuid, user_id)
                )
                conn.commit()
                return cursor.rowcount > 0
        except Exception:
            return False
    
    def mark_all_as_read(self, user_id):
        """标记所有消息为已读"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND is_read = 0',
                    (user_id,)
                )
                conn.commit()
                return cursor.rowcount
        except Exception:
            return 0
    
    def delete_message(self, message_id, user_id):
        """删除消息"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'DELETE FROM messages WHERE id = ? AND receiver_id = ?',
                    (message_id, user_id)
                )
                conn.commit()
                return cursor.rowcount > 0
        except Exception:
            return False
    
    def delete_message_by_uuid(self, message_uuid, user_id):
        """根据UUID删除消息"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'DELETE FROM messages WHERE uuid = ? AND receiver_id = ?',
                    (message_uuid, user_id)
                )
                conn.commit()
                return cursor.rowcount > 0
        except Exception:
            return False

    def batch_mark_as_read_by_uuids(self, uuids, user_id):
        """批量标记消息为已读"""
        if not uuids:
            return 0
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                placeholders = ','.join('?' * len(uuids))
                cursor.execute(
                    f'UPDATE messages SET is_read = 1 WHERE uuid IN ({placeholders}) AND receiver_id = ?',
                    (*uuids, user_id)
                )
                conn.commit()
                return cursor.rowcount
        except Exception:
            return 0

    def batch_delete_by_uuids(self, uuids, user_id):
        """批量删除消息"""
        if not uuids:
            return 0
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                placeholders = ','.join('?' * len(uuids))
                cursor.execute(
                    f'DELETE FROM messages WHERE uuid IN ({placeholders}) AND receiver_id = ?',
                    (*uuids, user_id)
                )
                conn.commit()
                return cursor.rowcount
        except Exception:
            return 0


# 全局实例
message_manager = MessageManager()
