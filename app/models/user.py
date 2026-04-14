"""用户模型"""

import sqlite3
import json
import os
import uuid as uuid_module
from datetime import datetime, timedelta
from pathlib import Path

from app.routes.settings import now_with_timezone


class User:
    """用户类"""
    
    def __init__(self, id, username, password_hash, role, created_at, status='active',
                 organization=None, approver_id=None, approved_at=None, email=None,
                 approval_code_hash=None, approval_code_needs_change=1, uuid=None, display_name=None):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.role = role
        self.created_at = created_at
        self.status = status
        self.organization = organization
        self.approver_id = approver_id
        self.approved_at = approved_at
        self.email = email
        self.approval_code_hash = approval_code_hash
        self.approval_code_needs_change = approval_code_needs_change
        self.uuid = uuid
        self.display_name = display_name
    
    @property
    def is_authenticated(self):
        return True
    
    @property
    def is_active(self):
        return self.status == 'active'
    
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
        # 使用上下文管理器确保连接正确关闭
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            
            # 创建用户表（CREATE TABLE IF NOT EXISTS 是自动提交的）
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'active',
                    organization TEXT,
                    approver_id INTEGER,
                    approved_at TIMESTAMP,
                    email TEXT,
                    approval_code_hash TEXT,
                    approval_code_needs_change INTEGER DEFAULT 1
                )
            ''')
            
            # 开始迁移事务
            conn.execute('BEGIN TRANSACTION')
            try:
                # 检查迁移版本
                cursor.execute('CREATE TABLE IF NOT EXISTS migration_versions (version INTEGER PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')
                cursor.execute('SELECT version FROM migration_versions ORDER BY version DESC LIMIT 1')
                current_version = cursor.fetchone()
                current_version = current_version[0] if current_version else 0
                
                # 迁移版本 1: 添加用户状态和组织字段
                if current_version < 1:
                    print("Running migration version 1: Adding user status and organization fields")
                    
                    # 检查所有列是否已存在
                    cursor.execute('PRAGMA table_info(users)')
                    existing_columns = {row[1] for row in cursor.fetchall()}
                    
                    # 要添加的列
                    columns_to_add = [
                        ('status', 'TEXT DEFAULT \'active\''),
                        ('organization', 'TEXT'),
                        ('approver_id', 'INTEGER'),
                        ('approved_at', 'TIMESTAMP'),
                        ('email', 'TEXT')
                    ]
                    
                    # 过滤出需要添加的列
                    columns_to_add = [(col, dtype) for col, dtype in columns_to_add if col not in existing_columns]
                    
                    # 添加所有需要的列
                    if columns_to_add:
                        print(f"Adding {len(columns_to_add)} new columns to users table")
                        for col, dtype in columns_to_add:
                            try:
                                cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {dtype}')
                                print(f"Successfully added column: {col}")
                            except Exception as e:
                                print(f"Failed to add column {col}: {e}")
                                # 虽然外层事务会回滚，但记录具体错误信息有助于调试
                                raise Exception(f"Failed to add column {col}: {e}")
                    else:
                        print("No new columns to add to users table")
                    
                    # 标记迁移完成
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (1)')

                # 迁移版本 2: 添加审批安全码字段
                if current_version < 2:
                    print("Running migration version 2: Adding approval code fields")
                    cursor.execute('PRAGMA table_info(users)')
                    existing_columns = {row[1] for row in cursor.fetchall()}
                    columns_to_add = [
                        ('approval_code_hash', 'TEXT'),
                        ('approval_code_needs_change', 'INTEGER DEFAULT 1')
                    ]
                    columns_to_add = [(col, dtype) for col, dtype in columns_to_add if col not in existing_columns]
                    if columns_to_add:
                        for col, dtype in columns_to_add:
                            try:
                                cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {dtype}')
                                print(f'Successfully added column: {col}')
                            except Exception as e:
                                print(f'Failed to add column {col}: {e}')
                                raise Exception(f'Failed to add column {col}: {e}')
                    # 确保旧数据默认需要首次设置审批安全码
                    cursor.execute('UPDATE users SET approval_code_needs_change = 1 WHERE approval_code_needs_change IS NULL')
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (2)')
                
                # 迁移版本 3: 创建归档审批表 archive_approvals
                if current_version < 3:
                    print("Running migration version 3: Creating archive_approvals table")
                    cursor.execute('''
                        CREATE TABLE IF NOT EXISTS archive_approvals (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            project_id TEXT NOT NULL,
                            cycle TEXT NOT NULL,
                            doc_names TEXT NOT NULL,
                            requester_id INTEGER NOT NULL,
                            requester_username TEXT,
                            status TEXT NOT NULL DEFAULT 'pending',
                            target_approver_ids TEXT,
                            approved_by_id INTEGER,
                            approved_by_username TEXT,
                            reject_reason TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            resolved_at TIMESTAMP,
                            FOREIGN KEY (requester_id) REFERENCES users(id)
                        )
                    ''')
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (3)')

                # 迁移版本 4: 为外部暴露的表添加UUID列
                if current_version < 4:
                    print("Running migration version 4: Adding UUID columns")
                    
                    # 为 users 表添加 uuid 列
                    cursor.execute('PRAGMA table_info(users)')
                    user_cols = {row[1] for row in cursor.fetchall()}
                    if 'uuid' not in user_cols:
                        cursor.execute('ALTER TABLE users ADD COLUMN uuid TEXT')
                        # 为已有用户生成 UUID
                        cursor.execute('SELECT id FROM users')
                        for (uid,) in cursor.fetchall():
                            cursor.execute('UPDATE users SET uuid = ? WHERE id = ?', (str(uuid_module.uuid4()), uid))
                        # 创建唯一索引
                        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid)')
                    
                    # 为 messages 表添加 uuid 列
                    cursor.execute('PRAGMA table_info(messages)')
                    msg_cols = {row[1] for row in cursor.fetchall()}
                    if 'uuid' not in msg_cols:
                        cursor.execute('ALTER TABLE messages ADD COLUMN uuid TEXT')
                        cursor.execute('SELECT id FROM messages')
                        for (mid,) in cursor.fetchall():
                            cursor.execute('UPDATE messages SET uuid = ? WHERE id = ?', (str(uuid_module.uuid4()), mid))
                        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_uuid ON messages(uuid)')
                    
                    # 为 archive_approvals 表添加 uuid 列
                    cursor.execute('PRAGMA table_info(archive_approvals)')
                    aa_cols = {row[1] for row in cursor.fetchall()}
                    if 'uuid' not in aa_cols:
                        cursor.execute('ALTER TABLE archive_approvals ADD COLUMN uuid TEXT')
                        cursor.execute('SELECT id FROM archive_approvals')
                        for (aid,) in cursor.fetchall():
                            cursor.execute('UPDATE archive_approvals SET uuid = ? WHERE id = ?', (str(uuid_module.uuid4()), aid))
                        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_approvals_uuid ON archive_approvals(uuid)')
                    
                    # 为 project_transfers 表添加 uuid 列
                    cursor.execute('PRAGMA table_info(project_transfers)')
                    pt_cols = {row[1] for row in cursor.fetchall()}
                    if 'uuid' not in pt_cols:
                        cursor.execute('ALTER TABLE project_transfers ADD COLUMN uuid TEXT')
                        cursor.execute('SELECT id FROM project_transfers')
                        for (tid,) in cursor.fetchall():
                            cursor.execute('UPDATE project_transfers SET uuid = ? WHERE id = ?', (str(uuid_module.uuid4()), tid))
                        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_transfers_uuid ON project_transfers(uuid)')
                    
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (4)')

                # 迁移版本 5: 添加多级审批支持字段
                if current_version < 5:
                    print("Running migration version 5: Adding multi-level approval support")

                    # 为 archive_approvals 表添加多级审批字段
                    cursor.execute('PRAGMA table_info(archive_approvals)')
                    aa_cols = {row[1] for row in cursor.fetchall()}

                    if 'approval_stages' not in aa_cols:
                        cursor.execute('ALTER TABLE archive_approvals ADD COLUMN approval_stages TEXT')
                    if 'current_stage' not in aa_cols:
                        cursor.execute('ALTER TABLE archive_approvals ADD COLUMN current_stage INTEGER DEFAULT 1')
                    if 'stage_completed' not in aa_cols:
                        cursor.execute('ALTER TABLE archive_approvals ADD COLUMN stage_completed BOOLEAN DEFAULT 0')
                    if 'stage_history' not in aa_cols:
                        cursor.execute('ALTER TABLE archive_approvals ADD COLUMN stage_history TEXT')

                    print("Migration version 5: Multi-level approval fields added successfully")
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (5)')

                # 迁移版本 6: 用户表添加 display_name 字段
                if current_version < 6:
                    print("Running migration version 6: Adding display_name to users")
                    cursor.execute('PRAGMA table_info(users)')
                    user_cols = {row[1] for row in cursor.fetchall()}
                    if 'display_name' not in user_cols:
                        cursor.execute('ALTER TABLE users ADD COLUMN display_name TEXT')
                    print("Migration version 6: display_name column added successfully")
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (6)')

                # 迁移版本 7: 归档审批表添加 request_type 字段（区分归档/不涉及）
                if current_version < 7:
                    print("Running migration version 7: Adding request_type to archive_approvals")
                    cursor.execute('PRAGMA table_info(archive_approvals)')
                    cols = {row[1] for row in cursor.fetchall()}
                    if 'request_type' not in cols:
                        cursor.execute("ALTER TABLE archive_approvals ADD COLUMN request_type TEXT DEFAULT 'archive'")
                    print("Migration version 7: request_type column added successfully")
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (7)')

                # 提交迁移操作
                conn.commit()
                print("Database migration completed successfully")
            except Exception as e:
                # 发生错误时回滚整个事务（包括migration_versions表的记录）
                conn.rollback()
                error_msg = f"Error during database migration: {e}"
                print(f"Error: {error_msg}")
                raise Exception(error_msg)
            
            # 创建其他表（这些操作不需要事务保护，因为都是 CREATE TABLE IF NOT EXISTS）
            # 创建承建单位表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS organizations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    admin_id INTEGER
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
            # 创建项目所有权移交表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS project_transfers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    project_name TEXT,
                    from_org TEXT,
                    to_org TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    accepted_by INTEGER,
                    accepted_at TIMESTAMP
                )
            ''')
            # 创建文档目录映射表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS document_directory_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    cycle TEXT NOT NULL,
                    doc_category TEXT NOT NULL,
                    directory_path TEXT NOT NULL,
                    document_patterns TEXT,
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(project_id, cycle, doc_category, directory_path),
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            ''')
            conn.commit()
    
    def _row_to_user(self, row):
        """将数据库行转换为 User 对象，兼容旧数据"""
        if row is None:
            return None
        # 14列：含UUID+display_name; 13列：含uuid不含display_name; 12列：不含uuid; 旧数据可能更少
        if len(row) >= 14:
            return User(*row[:14])
        elif len(row) == 13:
            return User(*row[:13], display_name=None)
        elif len(row) == 12:
            return User(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11], None, None)
        elif len(row) == 11:
            return User(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], 1, None, None)
        elif len(row) == 10:
            return User(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], None, 1, None, None)
        elif len(row) == 9:
            return User(row[0], row[1], row[2], row[3], row[4], 'active', row[5], row[6], row[7], row[8], None, 1, None, None)
        elif len(row) == 5:
            return User(row[0], row[1], row[2], row[3], row[4], 'active', None, None, None, None, None, 1, None, None)
        else:
            return None
    
    def add_user(self, username, password_hash, role, status='active', organization=None, email=None):
        """添加用户（保留旧接口兼容）"""
        try:
            new_uuid = str(uuid_module.uuid4())
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO users (username, password_hash, role, status, organization, email, uuid) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (username, password_hash, role, status, organization, email, new_uuid)
                )
                conn.commit()
                return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None
    
    def register_user(self, username, password_hash, organization_name, is_new_org=False, email=None, role=None, display_name=None):
        """注册新用户

        Args:
            role: 若传入则直接使用，否则按 is_new_org 推断
        Returns:
            dict: {'status': 'success'/'error', 'message': str, 'user_id': int}
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()

                if role == 'pmo':
                    status = 'pending'
                    # PMO 默认归属 PMO 组织
                    org_name = organization_name or 'PMO'
                elif is_new_org:
                    # 新建承建单位：角色为 project_admin，等待 PMO 审核
                    role = 'project_admin'
                    status = 'pending'
                    org_name = organization_name
                    # 先插入组织（如果已存在则失败）
                    try:
                        cursor.execute(
                            'INSERT INTO organizations (name) VALUES (?)',
                            (organization_name,)
                        )
                    except sqlite3.IntegrityError:
                        return {'status': 'error', 'message': '该承建单位已存在，请选择已有单位'}
                else:
                    # 选择已有承建单位：角色为 contractor，等待该单位 project_admin 审核
                    role = 'contractor'
                    status = 'pending'
                    org_name = organization_name
                    cursor.execute('SELECT id FROM organizations WHERE name = ?', (organization_name,))
                    if not cursor.fetchone():
                        return {'status': 'error', 'message': '所选承建单位不存在'}

                new_uuid = str(uuid_module.uuid4())
                cursor.execute(
                    'INSERT INTO users (username, password_hash, role, status, organization, email, uuid, display_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (username, password_hash, role, status, org_name, email, new_uuid, display_name)
                )
                conn.commit()
                user_id = cursor.lastrowid
                return {'status': 'success', 'message': '注册成功，请等待审核', 'user_id': user_id, 'uuid': new_uuid}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '用户名已存在'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
    def get_user_by_username(self, username):
        """根据用户名获取用户"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, password_hash, role, created_at, status, organization, approver_id, approved_at, email, approval_code_hash, approval_code_needs_change, uuid, display_name FROM users WHERE username = ?',
                (username,)
            )
            return self._row_to_user(cursor.fetchone())
    
    def get_user_by_id(self, user_id):
        """根据ID获取用户"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, password_hash, role, created_at, status, organization, approver_id, approved_at, email, approval_code_hash, approval_code_needs_change, uuid, display_name FROM users WHERE id = ?',
                (user_id,)
            )
            return self._row_to_user(cursor.fetchone())
    
    def get_user_by_uuid(self, user_uuid):
        """根据UUID获取用户"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, password_hash, role, created_at, status, organization, approver_id, approved_at, email, approval_code_hash, approval_code_needs_change, uuid, display_name FROM users WHERE uuid = ?',
                (user_uuid,)
            )
            return self._row_to_user(cursor.fetchone())
    
    def resolve_uuids_to_ids(self, uuids):
        """将UUID列表解析为内部整数ID列表"""
        if not uuids:
            return []
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            placeholders = ','.join('?' * len(uuids))
            cursor.execute(f'SELECT id FROM users WHERE uuid IN ({placeholders})', tuple(uuids))
            return [row[0] for row in cursor.fetchall()]
    
    def list_organizations(self):
        """获取所有承建单位列表"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id, name, admin_id FROM organizations ORDER BY name')
            return [{'id': row[0], 'name': row[1], 'admin_id': row[2]} for row in cursor.fetchall()]
    
    def get_pending_users(self, viewer_role, viewer_org=None):
        """获取待审核用户列表
        
        Args:
            viewer_role: 查看者角色
            viewer_org: 查看者所属组织（project_admin 需要）
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            if viewer_role in ('admin', 'pmo'):
                # 管理员/PMO 可以看到所有待审核用户，包括新建组织的 project_admin
                cursor.execute(
                    'SELECT id, username, role, created_at, organization, email, uuid, display_name FROM users WHERE status = ? ORDER BY created_at',
                    ('pending',)
                )
            elif viewer_role == 'project_admin':
                # 项目经理只能看到同组织的 contractor 待审核用户
                cursor.execute(
                    'SELECT id, username, role, created_at, organization, email, uuid, display_name FROM users WHERE status = ? AND organization = ? AND role = ? ORDER BY created_at',
                    ('pending', viewer_org, 'contractor')
                )
            else:
                return []
            
            return [
                {'id': row[0], 'username': row[1], 'role': row[2], 'created_at': row[3], 'organization': row[4], 'email': row[5], 'uuid': row[6], 'display_name': row[7]}
                for row in cursor.fetchall()
            ]
    
    def approve_user(self, user_id, approver_id):
        """审核通过用户"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE users SET status = ?, approver_id = ?, approved_at = ? WHERE id = ? AND status = ?',
                    ('active', approver_id, now_with_timezone().isoformat(), user_id, 'pending')
                )
                if cursor.rowcount == 0:
                    return {'status': 'error', 'message': '用户不存在或已审核'}
                
                # 如果是 project_admin，更新组织的 admin_id
                cursor.execute('SELECT role, organization FROM users WHERE id = ?', (user_id,))
                row = cursor.fetchone()
                if row and row[0] == 'project_admin' and row[1]:
                    cursor.execute(
                        'UPDATE organizations SET admin_id = ? WHERE name = ?',
                        (user_id, row[1])
                    )
                
                conn.commit()
                return {'status': 'success', 'message': '审核通过'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
    def reject_user(self, user_id, approver_id):
        """拒绝用户"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE users SET status = ?, approver_id = ?, approved_at = ? WHERE id = ? AND status = ?',
                    ('rejected', approver_id, now_with_timezone().isoformat(), user_id, 'pending')
                )
                if cursor.rowcount == 0:
                    return {'status': 'error', 'message': '用户不存在或已审核'}
                conn.commit()
                return {'status': 'success', 'message': '已拒绝'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
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
    
    def get_users_by_roles(self, roles):
        """按角色列表获取用户"""
        if not roles:
            return []
        placeholders = ','.join('?' * len(roles))
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                f'SELECT id, username, role, organization, status, uuid, display_name FROM users WHERE role IN ({placeholders})',
                roles
            )
            return [
                {'id': row[0], 'username': row[1], 'role': row[2], 'organization': row[3], 'status': row[4], 'uuid': row[5], 'display_name': row[6]}
                for row in cursor.fetchall()
            ]
    
    def get_all_users(self, keyword=None, status=None):
        """获取所有用户，支持关键字搜索和状态过滤"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            sql = 'SELECT id, username, password_hash, role, created_at, status, organization, approver_id, approved_at, email, approval_code_hash, approval_code_needs_change, uuid, display_name FROM users WHERE 1=1'
            params = []
            if status:
                sql += ' AND status = ?'
                params.append(status)
            if keyword:
                sql += ' AND (username LIKE ? OR organization LIKE ? OR role LIKE ? OR email LIKE ? OR display_name LIKE ?)'
                like = f'%{keyword}%'
                params.extend([like, like, like, like, like])
            sql += ' ORDER BY created_at DESC'
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [self._row_to_user(row) for row in rows]

    def update_user_email(self, user_id, email):
        """更新用户邮箱"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('UPDATE users SET email = ? WHERE id = ?', (email, user_id))
                conn.commit()
                return {'status': 'success', 'message': '邮箱已更新'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def update_password(self, user_id, new_password_hash):
        """重置用户密码"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_password_hash, user_id))
                conn.commit()
                return {'status': 'success', 'message': '密码已重置'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def update_approval_code(self, user_id, approval_code_hash, needs_change=0):
        """更新用户审批安全码"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE users SET approval_code_hash = ?, approval_code_needs_change = ? WHERE id = ?',
                    (approval_code_hash, needs_change, user_id)
                )
                conn.commit()
                return {'status': 'success', 'message': '审批安全码已更新'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def reset_approval_code_to_password(self, user_id):
        """将用户审批安全码重置为登录密码，并要求首次使用时改码"""
        try:
            user = self.get_user_by_id(user_id)
            if not user:
                return {'status': 'error', 'message': '用户不存在'}
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE users SET approval_code_hash = NULL, approval_code_needs_change = 1 WHERE id = ?',
                    (user_id,)
                )
                conn.commit()
                return {'status': 'success', 'message': '审批安全码已重置为登录密码，请用户首次使用时修改'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def update_user_role(self, user_id, new_role):
        """更新用户角色"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, user_id))
                conn.commit()
                return {'status': 'success', 'message': '角色已更新'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def batch_update_user_roles(self, user_ids, new_role):
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                placeholders = ','.join('?' * len(user_ids))
                cursor.execute(f'UPDATE users SET role = ? WHERE id IN ({placeholders})', (new_role, *user_ids))
                conn.commit()
                return {'status': 'success', 'message': f'已更新 {cursor.rowcount} 个用户', 'count': cursor.rowcount}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def batch_update_user_status(self, user_ids, new_status):
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                placeholders = ','.join('?' * len(user_ids))
                cursor.execute(f'UPDATE users SET status = ? WHERE id IN ({placeholders})', (new_status, *user_ids))
                conn.commit()
                return {'status': 'success', 'message': f'已更新 {cursor.rowcount} 个用户', 'count': cursor.rowcount}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def batch_delete_users(self, user_ids):
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                placeholders = ','.join('?' * len(user_ids))
                cursor.execute(f'DELETE FROM users WHERE id IN ({placeholders})', tuple(user_ids))
                conn.commit()
                return {'status': 'success', 'message': f'已删除 {cursor.rowcount} 个用户', 'count': cursor.rowcount}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def deactivate_user(self, user_id):
        """注销（停用）用户账号"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE users SET status = 'inactive' WHERE id = ?", (user_id,))
                conn.commit()
                return {'status': 'success', 'message': '账号已注销'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def toggle_user_status(self, user_id):
        """切换用户 active/inactive 状态"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT status FROM users WHERE id = ?', (user_id,))
                row = cursor.fetchone()
                if not row:
                    return {'status': 'error', 'message': '用户不存在'}
                new_status = 'inactive' if row[0] == 'active' else 'active'
                cursor.execute('UPDATE users SET status = ? WHERE id = ?', (new_status, user_id))
                conn.commit()
                return {'status': 'success', 'message': f'用户已{"启用" if new_status == "active" else "禁用"}', 'status': new_status}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def delete_user(self, user_id):
        """删除用户"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
                conn.commit()
                return {'status': 'success', 'message': '用户已删除'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def create_organization(self, name, admin_id=None):
        """创建承建单位"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('INSERT INTO organizations (name, admin_id) VALUES (?, ?)', (name, admin_id))
                conn.commit()
                return {'status': 'success', 'message': '承建单位创建成功'}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '承建单位已存在'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def update_organization(self, old_name, new_name, admin_id=None):
        """更新承建单位"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                if admin_id is not None:
                    cursor.execute('UPDATE organizations SET name = ?, admin_id = ? WHERE name = ?', (new_name, admin_id, old_name))
                else:
                    cursor.execute('UPDATE organizations SET name = ? WHERE name = ?', (new_name, old_name))
                # 同步更新用户表中的组织名称
                if old_name != new_name:
                    cursor.execute('UPDATE users SET organization = ? WHERE organization = ?', (new_name, old_name))
                conn.commit()
                return {'status': 'success', 'message': '承建单位更新成功'}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '名称已存在'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def delete_organization(self, name):
        """删除承建单位（检查是否有关联用户）"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT COUNT(*) FROM users WHERE organization = ?', (name,))
                if cursor.fetchone()[0] > 0:
                    return {'status': 'error', 'message': '该单位下仍有用户，无法删除'}
                cursor.execute('DELETE FROM organizations WHERE name = ?', (name,))
                conn.commit()
                return {'status': 'success', 'message': '承建单位已删除'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def set_organization_admin(self, org_name, admin_id):
        """设置承建单位管理员"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('UPDATE organizations SET admin_id = ? WHERE name = ?', (admin_id, org_name))
                conn.commit()
                return {'status': 'success', 'message': '管理员已设置'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_organization_user_count(self, name):
        """获取承建单位下的用户数量"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM users WHERE organization = ?', (name,))
            return cursor.fetchone()[0]

    # ---------------- 项目所有权移交 ----------------
    def create_project_transfer(self, project_id, project_name, from_org, to_org, created_by):
        """创建项目所有权移交申请"""
        try:
            new_uuid = str(uuid_module.uuid4())
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO project_transfers (project_id, project_name, from_org, to_org, status, created_by, created_at, uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (project_id, project_name, from_org, to_org, 'pending', created_by, now_with_timezone().isoformat(), new_uuid)
                )
                conn.commit()
                return {'status': 'success', 'message': '移交申请已创建', 'transfer_id': cursor.lastrowid, 'transfer_uuid': new_uuid}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_project_transfer(self, transfer_id):
        """获取移交申请详情"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, project_id, project_name, from_org, to_org, status, created_by, created_at, accepted_by, accepted_at, uuid FROM project_transfers WHERE id = ?',
                (transfer_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                'id': row[0], 'project_id': row[1], 'project_name': row[2],
                'from_org': row[3], 'to_org': row[4], 'status': row[5],
                'created_by': row[6], 'created_at': row[7],
                'accepted_by': row[8], 'accepted_at': row[9], 'uuid': row[10]
            }

    def get_project_transfer_by_uuid(self, transfer_uuid):
        """根据UUID获取移交申请"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, project_id, project_name, from_org, to_org, status, created_by, created_at, accepted_by, accepted_at, uuid FROM project_transfers WHERE uuid = ?',
                (transfer_uuid,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                'id': row[0], 'project_id': row[1], 'project_name': row[2],
                'from_org': row[3], 'to_org': row[4], 'status': row[5],
                'created_by': row[6], 'created_at': row[7],
                'accepted_by': row[8], 'accepted_at': row[9], 'uuid': row[10]
            }

    def get_pending_transfer_by_project(self, project_id):
        """获取项目的待处理移交申请"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, project_id, project_name, from_org, to_org, status, created_by, created_at, accepted_by, accepted_at, uuid FROM project_transfers WHERE project_id = ? AND status = ?',
                (project_id, 'pending')
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                'id': row[0], 'project_id': row[1], 'project_name': row[2],
                'from_org': row[3], 'to_org': row[4], 'status': row[5],
                'created_by': row[6], 'created_at': row[7],
                'accepted_by': row[8], 'accepted_at': row[9], 'uuid': row[10]
            }

    def accept_project_transfer(self, transfer_id, accepted_by):
        """接受项目所有权移交"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE project_transfers SET status = ?, accepted_by = ?, accepted_at = ? WHERE id = ? AND status = ?',
                    ('accepted', accepted_by, now_with_timezone().isoformat(), transfer_id, 'pending')
                )
                if cursor.rowcount == 0:
                    return {'status': 'error', 'message': '移交申请不存在或已处理'}
                conn.commit()
                return {'status': 'success', 'message': '移交已接受'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def reject_project_transfer(self, transfer_id, rejected_by):
        """拒绝项目所有权移交"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE project_transfers SET status = ?, accepted_by = ?, accepted_at = ? WHERE id = ? AND status = ?',
                    ('rejected', rejected_by, now_with_timezone().isoformat(), transfer_id, 'pending')
                )
                if cursor.rowcount == 0:
                    return {'status': 'error', 'message': '移交申请不存在或已处理'}
                conn.commit()
                return {'status': 'success', 'message': '移交已拒绝'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_users_by_organization(self, org_name, status=None):
        """获取指定承建单位下的用户，默认不过滤 status"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute(
                    'SELECT id, username, role, email, status, uuid FROM users WHERE organization = ? AND status = ?',
                    (org_name, status)
                )
            else:
                cursor.execute(
                    'SELECT id, username, role, email, status, uuid FROM users WHERE organization = ?',
                    (org_name,)
                )
            return [
                {'id': row[0], 'username': row[1], 'role': row[2], 'email': row[3], 'status': row[4], 'uuid': row[5]}
                for row in cursor.fetchall()
            ]
    
    def is_ip_blocked(self, ip_address):
        """检查IP是否被拉黑"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id FROM ip_blacklist WHERE ip_address = ? AND (unblock_at IS NULL OR unblock_at > ?)',
                (ip_address, now_with_timezone().isoformat())
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
                    (status, now_with_timezone().isoformat(), approved_by, request_id)
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
                    'INSERT INTO operation_logs (user_id, username, operation_type, target_id, target_name, details, ip_address, operation_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (user_id, username, operation_type, target_id, target_name, details, ip_address, now_with_timezone().strftime('%Y-%m-%d %H:%M:%S'))
                )
                conn.commit()
                return True
        except:
            return False

    def archive_old_logs(self, retention_days=30):
        """将超过保留天数的日志导出并删除，返回归档文件路径"""
        try:
            archive_dir = Path(__file__).parent.parent.parent / 'logs' / 'archive'
            archive_dir.mkdir(parents=True, exist_ok=True)
            cutoff_date = (now_with_timezone() - timedelta(days=int(retention_days))).strftime('%Y-%m-%d %H:%M:%S')

            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    'SELECT * FROM operation_logs WHERE operation_time < ? ORDER BY operation_time',
                    (cutoff_date,)
                )
                rows = cursor.fetchall()
                if not rows:
                    return {'status': 'success', 'message': '没有需要归档的日志', 'count': 0, 'file': None}

                logs = []
                for row in rows:
                    logs.append({
                        'id': row['id'],
                        'user_id': row['user_id'],
                        'username': row['username'],
                        'operation_type': row['operation_type'],
                        'target_id': row['target_id'],
                        'target_name': row['target_name'],
                        'details': row['details'],
                        'ip_address': row['ip_address'],
                        'operation_time': row['operation_time']
                    })

                timestamp = now_with_timezone().strftime('%Y%m%d_%H%M%S')
                archive_file = archive_dir / f'operation_logs_archive_{timestamp}.json'
                with open(archive_file, 'w', encoding='utf-8') as f:
                    json.dump({
                        'archived_at': now_with_timezone().isoformat(),
                        'retention_days': retention_days,
                        'count': len(logs),
                        'logs': logs
                    }, f, ensure_ascii=False, indent=2)

                cursor.execute('DELETE FROM operation_logs WHERE operation_time < ?', (cutoff_date,))
                conn.commit()
                return {'status': 'success', 'message': f'已归档 {len(logs)} 条日志', 'count': len(logs), 'file': str(archive_file)}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def import_logs(self, file_path):
        """从JSON文件导入日志到数据库"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logs = data.get('logs', []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            if not logs:
                return {'status': 'error', 'message': '文件中没有找到日志记录'}

            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                inserted = 0
                skipped = 0
                for log in logs:
                    # 简单去重：同一时间、同一用户、同一操作类型的记录不重复插入
                    cursor.execute(
                        'SELECT COUNT(*) FROM operation_logs WHERE user_id=? AND operation_type=? AND operation_time=?',
                        (log.get('user_id'), log.get('operation_type'), log.get('operation_time'))
                    )
                    if cursor.fetchone()[0] > 0:
                        skipped += 1
                        continue
                    cursor.execute(
                        'INSERT INTO operation_logs (user_id, username, operation_type, target_id, target_name, details, ip_address, operation_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        (log.get('user_id'), log.get('username'), log.get('operation_type'), log.get('target_id'), log.get('target_name'), log.get('details'), log.get('ip_address'), log.get('operation_time'))
                    )
                    inserted += 1
                conn.commit()
            return {'status': 'success', 'message': f'导入完成：成功 {inserted} 条，跳过重复 {skipped} 条', 'inserted': inserted, 'skipped': skipped}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_operation_logs(self, limit=200, offset=0, operation_type=None, username=None, user_ids=None):
        """获取操作日志
        
        Args:
            limit: 每页数量
            offset: 偏移量
            operation_type: 操作类型筛选
            username: 用户名模糊搜索
            user_ids: 用户ID列表，用于限制可见范围（如单位成员ID列表）
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                query = 'SELECT * FROM operation_logs WHERE 1=1'
                params = []
                if operation_type:
                    query += ' AND operation_type = ?'
                    params.append(operation_type)
                if username:
                    query += ' AND username LIKE ?'
                    params.append(f'%{username}%')
                if user_ids is not None:
                    if not user_ids:
                        return {'status': 'success', 'logs': [], 'total': 0}
                    placeholders = ','.join('?' * len(user_ids))
                    query += f' AND user_id IN ({placeholders})'
                    params.extend(user_ids)
                query += ' ORDER BY operation_time DESC LIMIT ? OFFSET ?'
                params.extend([limit, offset])
                cursor.execute(query, params)
                rows = cursor.fetchall()
                logs = []
                for row in rows:
                    logs.append({
                        'id': row['id'],
                        'user_id': row['user_id'],
                        'username': row['username'],
                        'operation_type': row['operation_type'],
                        'target_id': row['target_id'],
                        'target_name': row['target_name'],
                        'details': row['details'],
                        'ip_address': row['ip_address'],
                        'operation_time': row['operation_time']
                    })
                # 获取总数
                count_query = 'SELECT COUNT(*) as total FROM operation_logs WHERE 1=1'
                count_params = []
                if operation_type:
                    count_query += ' AND operation_type = ?'
                    count_params.append(operation_type)
                if username:
                    count_query += ' AND username LIKE ?'
                    count_params.append(f'%{username}%')
                if user_ids is not None:
                    if not user_ids:
                        total = 0
                        return {'status': 'success', 'logs': logs, 'total': total}
                    placeholders = ','.join('?' * len(user_ids))
                    count_query += f' AND user_id IN ({placeholders})'
                    count_params.extend(user_ids)
                cursor.execute(count_query, count_params)
                total = cursor.fetchone()['total']
                return {'status': 'success', 'logs': logs, 'total': total}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    # ===== 归档审批 (archive_approvals) =====

    def create_archive_approval(self, project_id, cycle, doc_names, requester_id, requester_username, target_approver_ids, request_type='archive'):
        """创建归档审批请求"""
        try:
            new_uuid = str(uuid_module.uuid4())
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    '''INSERT INTO archive_approvals
                       (project_id, cycle, doc_names, requester_id, requester_username, status, target_approver_ids, created_at, uuid, request_type)
                       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)''',
                    (project_id, cycle, json.dumps(doc_names, ensure_ascii=False),
                     requester_id, requester_username,
                     json.dumps(target_approver_ids) if target_approver_ids else None,
                     now_with_timezone().isoformat(), new_uuid, request_type)
                )
                conn.commit()
                return {'status': 'success', 'id': cursor.lastrowid, 'uuid': new_uuid}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_archive_approvals(self, project_id, status=None):
        """查询项目的归档审批列表"""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            sql = 'SELECT * FROM archive_approvals WHERE project_id = ?'
            params = [project_id]
            if status:
                sql += ' AND status = ?'
                params.append(status)
            sql += ' ORDER BY created_at DESC'
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            result = []
            for row in rows:
                item = dict(row)
                item['doc_names'] = json.loads(item['doc_names']) if item.get('doc_names') else []
                item['target_approver_ids'] = json.loads(item['target_approver_ids']) if item.get('target_approver_ids') else []
                # 解析approval_stages和stage_history JSON
                if isinstance(item.get('approval_stages'), str):
                    try:
                        item['approval_stages'] = json.loads(item['approval_stages'])
                    except:
                        item['approval_stages'] = []
                if isinstance(item.get('stage_history'), str):
                    try:
                        item['stage_history'] = json.loads(item['stage_history'])
                    except:
                        item['stage_history'] = []
                result.append(item)
            return result

    def get_all_archive_approvals(self, status=None, limit=100):
        """查询所有项目的归档审批列表"""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            sql = 'SELECT * FROM archive_approvals'
            params = []
            if status:
                sql += ' WHERE status = ?'
                params.append(status)
            sql += ' ORDER BY created_at DESC LIMIT ?'
            params.append(limit)
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            result = []
            for row in rows:
                item = dict(row)
                item['doc_names'] = json.loads(item['doc_names']) if item.get('doc_names') else []
                item['target_approver_ids'] = json.loads(item['target_approver_ids']) if item.get('target_approver_ids') else []
                if isinstance(item.get('approval_stages'), str):
                    try:
                        item['approval_stages'] = json.loads(item['approval_stages'])
                    except:
                        item['approval_stages'] = []
                if isinstance(item.get('stage_history'), str):
                    try:
                        item['stage_history'] = json.loads(item['stage_history'])
                    except:
                        item['stage_history'] = []
                result.append(item)
            return result

    def get_archive_approval_by_id(self, approval_id):
        """根据 ID 获取归档审批"""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM archive_approvals WHERE id = ?', (approval_id,))
            row = cursor.fetchone()
            if not row:
                return None
            item = dict(row)
            item['doc_names'] = json.loads(item['doc_names']) if item.get('doc_names') else []
            item['target_approver_ids'] = json.loads(item['target_approver_ids']) if item.get('target_approver_ids') else []
            return item

    def get_archive_approval_by_uuid(self, approval_uuid):
        """根据 UUID 获取归档审批"""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM archive_approvals WHERE uuid = ?', (approval_uuid,))
            row = cursor.fetchone()
            if not row:
                return None
            item = dict(row)
            item['doc_names'] = json.loads(item['doc_names']) if item.get('doc_names') else []
            item['target_approver_ids'] = json.loads(item['target_approver_ids']) if item.get('target_approver_ids') else []
            return item

    def get_pending_archive_approvals_for_user(self, user_id, user_role):
        """获取用户待审批的文档归档请求

        Args:
            user_id: 用户ID
            user_role: 用户角色('pmo' 或 'project_admin' 等)

        Returns:
            list: 用户需要审批的申请列表
        """
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                # 查询status为pending或stage_approved的审批请求
                cursor.execute(
                    '''SELECT * FROM archive_approvals
                       WHERE status IN ('pending', 'stage_approved')
                       ORDER BY created_at DESC'''
                )
                approvals = []
                for row in cursor.fetchall():
                    item = dict(row)

                    # 解析approval_stages JSON
                    try:
                        approval_stages = json.loads(item.get('approval_stages', '[]'))
                    except:
                        approval_stages = []

                    # 检查当前用户是否是该阶段的审批人
                    current_stage = item.get('current_stage', 1)
                    if not approval_stages or current_stage < 1 or current_stage > len(approval_stages):
                        continue

                    stage = approval_stages[current_stage - 1]
                    required_role = stage.get('required_role')

                    # 只返回当前用户应该批准的请求（基于角色匹配）
                    if required_role == user_role:
                        item['doc_names'] = json.loads(item['doc_names']) if item.get('doc_names') else []
                        item['target_approver_ids'] = json.loads(item['target_approver_ids']) if item.get('target_approver_ids') else []
                        item['approval_stages'] = approval_stages
                        approvals.append(item)

                return approvals
        except Exception as e:
            import traceback
            traceback.print_exc()
            return []

    def resolve_archive_approval(self, approval_id, status, approver_id, approver_username, reject_reason=None):
        """处理归档审批（通过/驳回）"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    '''UPDATE archive_approvals
                       SET status = ?, approved_by_id = ?, approved_by_username = ?, reject_reason = ?, resolved_at = ?
                       WHERE id = ? AND status = 'pending' ''',
                    (status, approver_id, approver_username, reject_reason,
                     now_with_timezone().isoformat(), approval_id)
                )
                if cursor.rowcount == 0:
                    return {'status': 'error', 'message': '审批请求不存在或已处理'}
                conn.commit()
                return {'status': 'success'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def has_pending_archive_approval(self, project_id, cycle, doc_names):
        """检查是否已存在相同的待审批请求"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, doc_names FROM archive_approvals WHERE project_id = ? AND cycle = ? AND status = 'pending'",
                (project_id, cycle)
            )
            for row in cursor.fetchall():
                existing_docs = json.loads(row[1]) if row[1] else []
                # 如果有重叠的文档名，说明已存在相同请求
                if set(doc_names) & set(existing_docs):
                    return True
            return False

    def create_document_directory(self, project_id, cycle, doc_category, directory_path, created_by, document_patterns=None):
        """创建文档目录映射"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO document_directory_mappings
                    (project_id, cycle, doc_category, directory_path, document_patterns, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (project_id, cycle, doc_category, directory_path, document_patterns, created_by))
                conn.commit()
                return {'status': 'success', 'id': cursor.lastrowid}
        except Exception as e:
            if 'UNIQUE constraint failed' in str(e):
                return {'status': 'error', 'message': '该目录已存在'}
            return {'status': 'error', 'message': str(e)}

    def get_document_directories(self, project_id, cycle, doc_category):
        """获取文档类型的所有目录映射"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT id, directory_path, document_patterns, created_at
                    FROM document_directory_mappings
                    WHERE project_id = ? AND cycle = ? AND doc_category = ?
                    ORDER BY directory_path
                ''', (project_id, cycle, doc_category))
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            return []

    def delete_document_directory(self, mapping_id):
        """删除文档目录映射"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM document_directory_mappings WHERE id = ?', (mapping_id,))
                if cursor.rowcount == 0:
                    return {'status': 'error', 'message': '目录不存在'}
                conn.commit()
                return {'status': 'success'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_directory_for_document(self, project_id, cycle, doc_category, doc_name):
        """根据文档名称获取其应该放在的目录（根据规则匹配）"""
        try:
            mappings = self.get_document_directories(project_id, cycle, doc_category)
            if not mappings:
                return ''

            # 简单的模式匹配逻辑
            # 如果有 document_patterns，则使用模式匹配
            # 否则所有文档都放在该目录
            for mapping in mappings:
                doc_name_lower = doc_name.lower()
                pattern = mapping.get('document_patterns', '').lower() if mapping.get('document_patterns') else None

                if not pattern or '*' in pattern:
                    # 无模式或通配符 - 匹配所有
                    return mapping['directory_path']
                elif pattern in doc_name_lower:
                    # 模式匹配
                    return mapping['directory_path']

            return ''
        except Exception as e:
            return ''

# 创建全局用户管理器实例
user_manager = UserManager()
