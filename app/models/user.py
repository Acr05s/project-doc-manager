"""用户模型"""

import sqlite3
import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from app.routes.settings import now_with_timezone


class User:
    """用户类"""
    
    def __init__(self, id, username, password_hash, role, created_at, status='active',
                 organization=None, approver_id=None, approved_at=None, email=None):
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
            # 迁移：增加新字段和版本控制
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
                    
                    if columns_to_add:
                        # 记录已添加的列，用于回滚
                        added_columns = []
                        
                        try:
                            for col, dtype in columns_to_add:
                                cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {dtype}')
                                added_columns.append(col)
                                print(f"Successfully added column: {col}")
                        except Exception as e:
                            # 迁移失败，尝试回滚已添加的列
                            print(f"Migration failed, rolling back...")
                            for col in reversed(added_columns):
                                try:
                                    cursor.execute(f'ALTER TABLE users DROP COLUMN {col}')
                                    print(f"Rolled back column: {col}")
                                except Exception as rollback_error:
                                    print(f"Warning: Failed to roll back column {col}: {rollback_error}")
                                    # 继续回滚其他列
                            raise Exception(f"Migration failed: {e}")
                    
                    # 标记迁移完成
                    cursor.execute('INSERT INTO migration_versions (version) VALUES (1)')
                
                # 提交迁移操作
                conn.commit()
                print("Database migration completed successfully")
            except Exception as e:
                # 发生错误时回滚
                conn.rollback()
                error_msg = f"Error during database migration: {e}"
                print(f"Error: {error_msg}")
                raise Exception(error_msg)
            
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
            conn.commit()
    
    def _row_to_user(self, row):
        """将数据库行转换为 User 对象，兼容旧数据"""
        if row is None:
            return None
        # 旧数据只有5列，新数据有10列
        if len(row) >= 10:
            return User(*row)
        elif len(row) == 9:
            return User(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], None)
        elif len(row) == 5:
            return User(row[0], row[1], row[2], row[3], row[4], 'active', None, None, None, None)
        else:
            return None
    
    def add_user(self, username, password_hash, role, status='active', organization=None, email=None):
        """添加用户（保留旧接口兼容）"""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO users (username, password_hash, role, status, organization, email) VALUES (?, ?, ?, ?, ?, ?)',
                    (username, password_hash, role, status, organization, email)
                )
                conn.commit()
                return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None
    
    def register_user(self, username, password_hash, organization_name, is_new_org=False, email=None, role=None):
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

                cursor.execute(
                    'INSERT INTO users (username, password_hash, role, status, organization, email) VALUES (?, ?, ?, ?, ?, ?)',
                    (username, password_hash, role, status, org_name, email)
                )
                conn.commit()
                user_id = cursor.lastrowid
                return {'status': 'success', 'message': '注册成功，请等待审核', 'user_id': user_id}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '用户名已存在'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
    
    def get_user_by_username(self, username):
        """根据用户名获取用户"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, password_hash, role, created_at, status, organization, approver_id, approved_at, email FROM users WHERE username = ?',
                (username,)
            )
            return self._row_to_user(cursor.fetchone())
    
    def get_user_by_id(self, user_id):
        """根据ID获取用户"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, username, password_hash, role, created_at, status, organization, approver_id, approved_at, email FROM users WHERE id = ?',
                (user_id,)
            )
            return self._row_to_user(cursor.fetchone())
    
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
                    'SELECT id, username, role, created_at, organization, email FROM users WHERE status = ? ORDER BY created_at',
                    ('pending',)
                )
            elif viewer_role == 'project_admin':
                # 项目经理只能看到同组织的 contractor 待审核用户
                cursor.execute(
                    'SELECT id, username, role, created_at, organization, email FROM users WHERE status = ? AND organization = ? AND role = ? ORDER BY created_at',
                    ('pending', viewer_org, 'contractor')
                )
            else:
                return []
            
            return [
                {'id': row[0], 'username': row[1], 'role': row[2], 'created_at': row[3], 'organization': row[4], 'email': row[5]}
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
                f'SELECT id, username, role, organization, status FROM users WHERE role IN ({placeholders})',
                roles
            )
            return [
                {'id': row[0], 'username': row[1], 'role': row[2], 'organization': row[3], 'status': row[4]}
                for row in cursor.fetchall()
            ]
    
    def get_all_users(self, keyword=None, status=None):
        """获取所有用户，支持关键字搜索和状态过滤"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            sql = 'SELECT id, username, password_hash, role, created_at, status, organization, approver_id, approved_at, email FROM users WHERE 1=1'
            params = []
            if status:
                sql += ' AND status = ?'
                params.append(status)
            if keyword:
                sql += ' AND (username LIKE ? OR organization LIKE ? OR role LIKE ? OR email LIKE ?)'
                like = f'%{keyword}%'
                params.extend([like, like, like, like])
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
            with sqlite3.connect(str(self.db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO project_transfers (project_id, project_name, from_org, to_org, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (project_id, project_name, from_org, to_org, 'pending', created_by, now_with_timezone().isoformat())
                )
                conn.commit()
                return {'status': 'success', 'message': '移交申请已创建', 'transfer_id': cursor.lastrowid}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_project_transfer(self, transfer_id):
        """获取移交申请详情"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, project_id, project_name, from_org, to_org, status, created_by, created_at, accepted_by, accepted_at FROM project_transfers WHERE id = ?',
                (transfer_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                'id': row[0], 'project_id': row[1], 'project_name': row[2],
                'from_org': row[3], 'to_org': row[4], 'status': row[5],
                'created_by': row[6], 'created_at': row[7],
                'accepted_by': row[8], 'accepted_at': row[9]
            }

    def get_pending_transfer_by_project(self, project_id):
        """获取项目的待处理移交申请"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, project_id, project_name, from_org, to_org, status, created_by, created_at, accepted_by, accepted_at FROM project_transfers WHERE project_id = ? AND status = ?',
                (project_id, 'pending')
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                'id': row[0], 'project_id': row[1], 'project_name': row[2],
                'from_org': row[3], 'to_org': row[4], 'status': row[5],
                'created_by': row[6], 'created_at': row[7],
                'accepted_by': row[8], 'accepted_at': row[9]
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

    def get_users_by_organization(self, org_name, status=None):
        """获取指定承建单位下的用户，默认不过滤 status"""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute(
                    'SELECT id, username, role, email, status FROM users WHERE organization = ? AND status = ?',
                    (org_name, status)
                )
            else:
                cursor.execute(
                    'SELECT id, username, role, email, status FROM users WHERE organization = ?',
                    (org_name,)
                )
            return [
                {'id': row[0], 'username': row[1], 'role': row[2], 'email': row[3], 'status': row[4]}
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
                    (user_id, username, operation_type, target_id, target_name, details, ip_address, now_with_timezone().isoformat())
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


# 创建全局用户管理器实例
user_manager = UserManager()
