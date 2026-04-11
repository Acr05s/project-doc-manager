"""用户模型"""

import sqlite3
from datetime import datetime
from pathlib import Path


class User:
    """用户类"""
    
    def __init__(self, id, username, password_hash, role, created_at):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.role = role
        self.created_at = created_at
    
    @property
    def is_authenticated(self):
        return True
    
    @property
    def is_active(self):
        return True
    
    @property
    def is_anonymous(self):
        return False
    
    def get_id(self):
        return str(self.id)


class UserManager:
    """用户管理器"""
    
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
            # 创建用户表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            # 创建用户项目关联表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    project_id TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            ''')
            # 创建IP黑名单表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ip_blacklist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip_address TEXT NOT NULL,
                    reason TEXT,
                    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    blocked_by INTEGER,
                    unblock_at TIMESTAMP,
                    FOREIGN KEY (blocked_by) REFERENCES users(id)
                )
            ''')
            # 创建登录尝试表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS login_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    ip_address TEXT NOT NULL,
                    attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN NOT NULL
                )
            ''')
            # 创建文档归档申请表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS archive_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    doc_id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    requester_id INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    approved_at TIMESTAMP,
                    approved_by INTEGER,
                    FOREIGN KEY (requester_id) REFERENCES users(id),
                    FOREIGN KEY (approved_by) REFERENCES users(id)
                )
            ''')
            # 创建操作日志表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS operation_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    username TEXT,
                    operation_type TEXT NOT NULL,
                    target_id TEXT,
                    target_name TEXT,
                    details TEXT,
                    ip_address TEXT,
                    operation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            ''')
            conn.commit()
    
    def add_user(self, username, password_hash, role):
        """添加用户"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                    (username, password_hash, role)
                )
                conn.commit()
                return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None
    
    def get_user_by_username(self, username):
        """根据用户名获取用户"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?',
                (username,)
            )
            row = cursor.fetchone()
            if row:
                return User(*row)
            return None
    
    def get_user_by_id(self, user_id):
        """根据ID获取用户"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, password_hash, role, created_at FROM users WHERE id = ?',
                (user_id,)
            )
            row = cursor.fetchone()
            if row:
                return User(*row)
            return None
    
    def add_user_project(self, user_id, project_id):
        """添加用户项目关联"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
                    (user_id, project_id)
                )
                conn.commit()
                return True
        except:
            return False
    
    def get_user_projects(self, user_id):
        """获取用户的项目"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT project_id FROM user_projects WHERE user_id = ?',
                (user_id,)
            )
            return [row[0] for row in cursor.fetchall()]
    
    def is_ip_blocked(self, ip_address):
        """检查IP是否被拉黑"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id FROM ip_blacklist WHERE ip_address = ? AND (unblock_at IS NULL OR unblock_at > ?)',
                (ip_address, datetime.now().isoformat())
            )
            return cursor.fetchone() is not None
    
    def add_ip_to_blacklist(self, ip_address, reason, blocked_by, unblock_at=None):
        """添加IP到黑名单"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO ip_blacklist (ip_address, reason, blocked_by, unblock_at) VALUES (?, ?, ?, ?)',
                    (ip_address, reason, blocked_by, unblock_at)
                )
                conn.commit()
                return True
        except:
            return False
    
    def remove_ip_from_blacklist(self, ip_address):
        """从黑名单中移除IP"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'DELETE FROM ip_blacklist WHERE ip_address = ?',
                    (ip_address,)
                )
                conn.commit()
                return True
        except:
            return False
    
    def add_login_attempt(self, username, ip_address, success):
        """添加登录尝试记录"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO login_attempts (username, ip_address, success) VALUES (?, ?, ?)',
                    (username, ip_address, success)
                )
                conn.commit()
                return True
        except:
            return False
    
    def get_failed_login_attempts(self, ip_address, minutes=15):
        """获取指定时间内的失败登录尝试次数"""
        from datetime import datetime, timedelta
        cutoff_time = (datetime.now() - timedelta(minutes=minutes)).isoformat()
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND success = 0 AND attempt_time > ?',
                (ip_address, cutoff_time)
            )
            return cursor.fetchone()[0]
    
    def add_archive_request(self, doc_id, project_id, requester_id):
        """添加归档申请"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO archive_requests (doc_id, project_id, requester_id, status) VALUES (?, ?, ?, ?)',
                    (doc_id, project_id, requester_id, 'pending')
                )
                conn.commit()
                return cursor.lastrowid
        except:
            return None
    
    def update_archive_request(self, request_id, status, approved_by):
        """更新归档申请状态"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE archive_requests SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?',
                    (status, datetime.now().isoformat(), approved_by, request_id)
                )
                conn.commit()
                return True
        except:
            return False
    
    def add_operation_log(self, user_id, username, operation_type, target_id=None, target_name=None, details=None, ip_address=None):
        """添加操作日志"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO operation_logs (user_id, username, operation_type, target_id, target_name, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (user_id, username, operation_type, target_id, target_name, details, ip_address)
                )
                conn.commit()
                return True
        except:
            return False


# 创建全局用户管理器实例
user_manager = UserManager()
