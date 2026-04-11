"""认证模块"""

from flask import Blueprint, render_template, redirect, url_for, request, jsonify
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from app.models.user import user_manager
from app.models.message import message_manager
import json

# 创建认证蓝图
auth_bp = Blueprint('auth', __name__)

# 初始化登录管理器
login_manager = LoginManager()


@login_manager.user_loader
def load_user(user_id):
    """加载用户"""
    return user_manager.get_user_by_id(int(user_id))


def get_real_ip():
    """获取真实IP地址"""
    ip = request.headers.get('X-Forwarded-For')
    if ip:
        ip = ip.split(',')[0].strip()
    else:
        ip = request.headers.get('X-Real-IP')
    if not ip:
        ip = request.remote_addr
    return ip


def check_ip_blacklist():
    """检查IP是否在黑名单中"""
    ip = get_real_ip()
    return user_manager.is_ip_blocked(ip)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """登录"""
    if check_ip_blacklist():
        return jsonify({'status': 'error', 'message': 'IP地址已被限制访问'})
    
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        ip = get_real_ip()
        
        user = user_manager.get_user_by_username(username)
        if user and check_password_hash(user.password_hash, password):
            # 检查用户状态
            if user.status != 'active':
                user_manager.add_login_attempt(username, ip, False)
                status_messages = {
                    'rejected': '账户审核未通过，请联系管理员',
                    'inactive': '账户已被禁用或注销，请联系管理员',
                    'pending': '账户正在审核中，请等待管理员批准'
                }
                return jsonify({'status': 'error', 'message': status_messages.get(user.status, f'账户状态异常: {user.status}'})
            
            # 只有 active 状态的用户才能登录
            login_user(user)
            user_manager.add_operation_log(user.id, user.username, 'login', ip_address=ip)
            user_manager.add_login_attempt(username, ip, True)
            return jsonify({
                'status': 'success',
                'message': '登录成功',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'role': user.role,
                    'organization': user.organization,
                    'status': user.status,
                    'email': user.email
                }
            })
        else:
            user_manager.add_login_attempt(username, ip, False)
            failed_attempts = user_manager.get_failed_login_attempts(ip)
            if failed_attempts >= 5:
                user_manager.add_ip_to_blacklist(ip, f'连续登录失败{failed_attempts}次', None)
                return jsonify({'status': 'error', 'message': '登录失败次数过多，IP已被限制'})
            return jsonify({'status': 'error', 'message': '用户名或密码错误'})
    
    return render_template('login.html')


@auth_bp.route('/logout')
@login_required
def logout():
    """注销"""
    ip = get_real_ip()
    user_manager.add_operation_log(current_user.id, current_user.username, 'logout', ip_address=ip)
    logout_user()
    return redirect(url_for('auth.login'))


@auth_bp.route('/register', methods=['POST'])
def register():
    """公开注册"""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    password_confirm = data.get('password_confirm', '').strip()
    organization_name = data.get('organization', '').strip()
    org_mode = data.get('org_mode', 'existing')  # 'existing' 或 'new'
    email = data.get('email', '').strip()
    role = data.get('role', '').strip()

    if not username or not password:
        return jsonify({'status': 'error', 'message': '请填写所有必填项'})

    if role == 'pmo':
        pass  # PMO 不需要组织
    elif not organization_name:
        return jsonify({'status': 'error', 'message': '请选择或输入承建单位'})

    if len(password) < 6:
        return jsonify({'status': 'error', 'message': '密码长度至少6位'})

    if password != password_confirm:
        return jsonify({'status': 'error', 'message': '两次输入的密码不一致'})

    password_hash = generate_password_hash(password)
    result = user_manager.register_user(
        username, password_hash, organization_name, is_new_org=(org_mode == 'new'), email=email or None, role=role or None
    )

    if result['status'] == 'success':
        ip = get_real_ip()
        user_id = result.get('user_id')
        user_manager.add_operation_log(None, username, 'register', str(user_id), username, f'组织: {organization_name}, 模式: {org_mode}, 邮箱: {email}, 角色: {role}', ip)
        # 发送通知给审批人
        _notify_user_approvers(user_id, username, organization_name, org_mode == 'new', role=role)

        # 自动登录该用户（pending 状态也可以登录）
        user = user_manager.get_user_by_id(user_id)
        if user:
            login_user(user, force=True)
            return jsonify({
                'status': 'success',
                'message': '注册成功，账户正在审核中',
                'needs_approval': True,
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'role': user.role,
                    'organization': user.organization,
                    'status': user.status,
                    'email': user.email
                }
            })

    return jsonify(result)


def _notify_user_approvers(user_id, username, organization_name, is_new_org, role=None):
    """通知用户审批人"""
    try:
        if role == 'pmo':
            # PMO 注册：仅通知 admin 审核
            approvers = user_manager.get_users_by_roles(['admin'])
            for approver in approvers:
                message_manager.send_message(
                    receiver_id=approver['id'],
                    title='新用户待审批（PMO注册）',
                    content=f'用户 "{username}" 申请注册为 PMO 成员，请尽快审核。',
                    msg_type='approval',
                    related_id=str(user_id),
                    related_type='user'
                )
        elif is_new_org:
            # 新建组织：通知 admin 和 pmo
            approvers = user_manager.get_users_by_roles(['admin', 'pmo'])
            for approver in approvers:
                message_manager.send_message(
                    receiver_id=approver['id'],
                    title='新用户待审批（新建组织）',
                    content=f'用户 "{username}" 申请注册新建承建单位 "{organization_name}"，请尽快审核。',
                    msg_type='approval',
                    related_id=str(user_id),
                    related_type='user'
                )
        else:
            # 现有组织：通知同组织的 project_admin，以及 admin/pmo
            approvers = user_manager.get_users_by_roles(['admin', 'pmo', 'project_admin'])
            for approver in approvers:
                if approver['role'] == 'project_admin' and approver.get('organization') != organization_name:
                    continue
                message_manager.send_message(
                    receiver_id=approver['id'],
                    title='新用户待审批',
                    content=f'用户 "{username}" 申请加入承建单位 "{organization_name}"，请尽快审核。',
                    msg_type='approval',
                    related_id=str(user_id),
                    related_type='user'
                )
    except Exception as e:
        print(f"通知用户审批人失败: {e}")


@auth_bp.route('/organizations', methods=['GET'])
def list_organizations():
    """获取承建单位列表（公开）"""
    orgs = user_manager.list_organizations()
    return jsonify({'status': 'success', 'organizations': [o['name'] for o in orgs]})


@auth_bp.route('/pending-users', methods=['GET'])
@login_required
def get_pending_users():
    """获取待审核用户列表"""
    if current_user.role not in ('admin', 'pmo', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    
    org = getattr(current_user, 'organization', None)
    users = user_manager.get_pending_users(current_user.role, org)
    return jsonify({'status': 'success', 'users': users})


@auth_bp.route('/approve-user', methods=['POST'])
@login_required
def approve_user():
    """审核通过用户"""
    if current_user.role not in ('admin', 'pmo', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    
    data = request.get_json()
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': '用户ID不能为空'}), 400
    
    # project_admin 只能审核同组织的 contractor
    if current_user.role == 'project_admin':
        target = user_manager.get_user_by_id(int(user_id))
        if not target or target.organization != current_user.organization or target.role != 'contractor':
            return jsonify({'status': 'error', 'message': '只能审核本单位的普通用户'}), 403
    
    result = user_manager.approve_user(int(user_id), int(current_user.id))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'approve_user', str(user_id), None, None, ip)
        # 通知申请人
        _notify_user_applicant(int(user_id), approved=True)
    return jsonify(result)


@auth_bp.route('/reject-user', methods=['POST'])
@login_required
def reject_user():
    """拒绝用户"""
    if current_user.role not in ('admin', 'pmo', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    
    data = request.get_json()
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': '用户ID不能为空'}), 400
    
    if current_user.role == 'project_admin':
        target = user_manager.get_user_by_id(int(user_id))
        if not target or target.organization != current_user.organization or target.role != 'contractor':
            return jsonify({'status': 'error', 'message': '只能审核本单位的普通用户'}), 403
    
    result = user_manager.reject_user(int(user_id), int(current_user.id))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'reject_user', str(user_id), None, None, ip)
        # 通知申请人
        _notify_user_applicant(int(user_id), approved=False)
    return jsonify(result)


def _notify_user_applicant(user_id, approved=True):
    """通知用户申请人审批结果"""
    try:
        user = user_manager.get_user_by_id(user_id)
        if not user:
            return
        if approved:
            title = '账户已通过审核'
            content = '恭喜！您的账户已通过审核，现在可以登录系统了。'
        else:
            title = '账户审核未通过'
            content = '很遗憾，您的账户审核未通过，请联系管理员了解详情。'
        message_manager.send_message(
            receiver_id=user.id,
            title=title,
            content=content,
            msg_type='system',
            related_id=str(user_id),
            related_type='user'
        )
    except Exception as e:
        print(f"通知用户申请人失败: {e}")


@auth_bp.route('/users')
@login_required
def list_users():
    """列出所有用户（仅系统管理员可用）"""
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'})
    keyword = request.args.get('keyword', '').strip()
    status = request.args.get('status', '').strip()
    users = user_manager.get_all_users(keyword=keyword or None, status=status or None)
    return jsonify({
        'status': 'success',
        'users': [
            {
                'id': u.id,
                'username': u.username,
                'role': u.role,
                'organization': u.organization,
                'status': u.status,
                'email': u.email,
                'created_at': u.created_at
            } for u in users
        ]
    })


@auth_bp.route('/blacklist', methods=['GET', 'POST'])
@login_required
def manage_blacklist():
    """管理IP黑名单（仅系统管理员可用）"""
    if current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': '权限不足'})
    
    if request.method == 'POST':
        data = request.get_json()
        action = data.get('action')
        ip_address = data.get('ip_address')
        reason = data.get('reason', '')
        
        if action == 'add':
            success = user_manager.add_ip_to_blacklist(ip_address, reason, current_user.id)
            if success:
                ip = get_real_ip()
                user_manager.add_operation_log(current_user.id, current_user.username, 'add_ip_blacklist', ip_address, None, reason, ip)
                return jsonify({'status': 'success', 'message': 'IP已添加到黑名单'})
            else:
                return jsonify({'status': 'error', 'message': '添加失败'})
        elif action == 'remove':
            success = user_manager.remove_ip_from_blacklist(ip_address)
            if success:
                ip = get_real_ip()
                user_manager.add_operation_log(current_user.id, current_user.username, 'remove_ip_blacklist', ip_address, None, None, ip)
                return jsonify({'status': 'success', 'message': 'IP已从黑名单移除'})
            else:
                return jsonify({'status': 'error', 'message': '移除失败'})
    
    return jsonify({'status': 'success', 'blacklist': []})


@auth_bp.route('/api/me', methods=['GET'])
@login_required
def get_current_user_info():
    user = current_user
    return jsonify({
        'status': 'success',
        'user': {
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'organization': user.organization,
            'email': user.email,
            'status': user.status,
            'created_at': user.created_at
        }
    })

@auth_bp.route('/api/me', methods=['PUT'])
@login_required
def update_current_user_info():
    data = request.get_json()
    email = data.get('email', '').strip()
    result = user_manager.update_user_email(current_user.id, email)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'update_email', None, None, email, ip)
    return jsonify(result)

@auth_bp.route('/api/me/password', methods=['POST'])
@login_required
def change_current_user_password():
    data = request.get_json()
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')
    if not old_password or not new_password:
        return jsonify({'status': 'error', 'message': '请填写旧密码和新密码'})
    if len(new_password) < 6:
        return jsonify({'status': 'error', 'message': '新密码长度至少6位'})
    user = user_manager.get_user_by_id(current_user.id)
    if not check_password_hash(user.password_hash, old_password):
        return jsonify({'status': 'error', 'message': '旧密码错误'})
    result = user_manager.update_password(current_user.id, generate_password_hash(new_password))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'change_password', None, None, None, ip)
    return jsonify(result)

@auth_bp.route('/api/me/deactivate', methods=['POST'])
@login_required
def deactivate_current_user():
    result = user_manager.deactivate_user(current_user.id)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'deactivate_self', None, None, None, ip)
        logout_user()
    return jsonify(result)

@auth_bp.route('/api/admin/users', methods=['GET'])
@login_required
def admin_list_users():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    keyword = request.args.get('keyword', '').strip()
    status = request.args.get('status', '').strip()
    users = user_manager.get_all_users(keyword=keyword or None, status=status or None)
    return jsonify({
        'status': 'success',
        'users': [
            {
                'id': u.id,
                'username': u.username,
                'role': u.role,
                'organization': u.organization,
                'status': u.status,
                'email': u.email,
                'created_at': u.created_at
            } for u in users
        ]
    })

@auth_bp.route('/api/admin/users/<int:user_id>/reset-password', methods=['POST'])
@login_required
def admin_reset_password(user_id):
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    new_password = data.get('new_password', '')
    if len(new_password) < 6:
        return jsonify({'status': 'error', 'message': '密码长度至少6位'})
    result = user_manager.update_password(user_id, generate_password_hash(new_password))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'reset_password', str(user_id), None, None, ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/<int:user_id>/role', methods=['POST'])
@login_required
def admin_update_user_role(user_id):
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    new_role = data.get('new_role', '').strip()
    if not new_role:
        return jsonify({'status': 'error', 'message': '角色不能为空'}), 400
    if user_id == current_user.id:
        return jsonify({'status': 'error', 'message': '不能修改自己的角色'}), 400
    result = user_manager.update_user_role(user_id, new_role)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'update_user_role', str(user_id), None, new_role, ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/<int:user_id>/status', methods=['POST'])
@login_required
def admin_toggle_user_status(user_id):
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    result = user_manager.toggle_user_status(user_id)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'toggle_user_status', str(user_id), None, result.get('status'), ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
def admin_delete_user(user_id):
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    # prevent self-delete
    if user_id == current_user.id:
        return jsonify({'status': 'error', 'message': '不能删除自己'})
    result = user_manager.delete_user(user_id)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'delete_user', str(user_id), None, None, ip)
    return jsonify(result)

@auth_bp.route('/api/admin/organizations', methods=['GET'])
@login_required
def admin_list_organizations():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    orgs = user_manager.list_organizations()
    for org in orgs:
        org['user_count'] = user_manager.get_organization_user_count(org['name'])
        admin = user_manager.get_user_by_id(org['admin_id']) if org['admin_id'] else None
        org['admin_name'] = admin.username if admin else '-'
    return jsonify({'status': 'success', 'organizations': orgs})

@auth_bp.route('/api/admin/organizations', methods=['POST'])
@login_required
def admin_create_organization():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'status': 'error', 'message': '名称不能为空'})
    result = user_manager.create_organization(name)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'create_organization', None, name, None, ip)
    return jsonify(result)

@auth_bp.route('/api/admin/organizations', methods=['PUT'])
@login_required
def admin_update_organization():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    old_name = data.get('old_name', '').strip()
    new_name = data.get('new_name', '').strip()
    admin_id = data.get('admin_id')
    if not old_name or not new_name:
        return jsonify({'status': 'error', 'message': '名称不能为空'})
    result = user_manager.update_organization(old_name, new_name, admin_id)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'update_organization', old_name, new_name, f'admin_id={admin_id}', ip)
    return jsonify(result)

@auth_bp.route('/api/admin/organizations', methods=['DELETE'])
@login_required
def admin_delete_organization():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    name = request.args.get('name', '').strip()
    if not name:
        return jsonify({'status': 'error', 'message': '名称不能为空'})
    result = user_manager.delete_organization(name)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'delete_organization', None, name, None, ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/batch-delete', methods=['POST'])
@login_required
def admin_batch_delete_users():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    user_ids = data.get('user_ids', [])
    if not user_ids:
        return jsonify({'status': 'error', 'message': '未选择用户'}), 400
    if current_user.id in user_ids:
        return jsonify({'status': 'error', 'message': '不能批量删除自己'}), 400
    result = user_manager.batch_delete_users(user_ids)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'batch_delete_users', None, None, f'count={result.get("count", 0)}', ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/batch-role', methods=['POST'])
@login_required
def admin_batch_update_user_roles():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    user_ids = data.get('user_ids', [])
    new_role = data.get('new_role', '').strip()
    if not user_ids or not new_role:
        return jsonify({'status': 'error', 'message': '参数不完整'}), 400
    if current_user.id in user_ids:
        return jsonify({'status': 'error', 'message': '不能修改自己的角色'}), 400
    result = user_manager.batch_update_user_roles(user_ids, new_role)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'batch_update_user_roles', None, None, f'role={new_role}, count={result.get("count", 0)}', ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/batch-status', methods=['POST'])
@login_required
def admin_batch_update_user_status():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    user_ids = data.get('user_ids', [])
    new_status = data.get('new_status', '').strip()
    if not user_ids or not new_status:
        return jsonify({'status': 'error', 'message': '参数不完整'}), 400
    result = user_manager.batch_update_user_status(user_ids, new_status)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'batch_update_user_status', None, None, f'status={new_status}, count={result.get("count", 0)}', ip)
    return jsonify(result)

@auth_bp.route('/api/admin/organizations/batch-delete', methods=['POST'])
@login_required
def admin_batch_delete_organizations():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    names = data.get('names', [])
    if not names:
        return jsonify({'status': 'error', 'message': '未选择承建单位'}), 400
    success_count = 0
    failed = []
    for name in names:
        result = user_manager.delete_organization(name)
        if result['status'] == 'success':
            success_count += 1
        else:
            failed.append({'name': name, 'message': result.get('message', '删除失败')})
    ip = get_real_ip()
    user_manager.add_operation_log(current_user.id, current_user.username, 'batch_delete_organizations', None, None, f'count={success_count}', ip)
    return jsonify({'status': 'success', 'message': f'已删除 {success_count} 个承建单位', 'failed': failed})

@auth_bp.route('/api/admin/logs', methods=['GET'])
@login_required
def admin_get_logs():
    if current_user.role not in ('admin', 'pmo', 'project_admin', 'contractor'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    limit = request.args.get('limit', 200, type=int)
    offset = request.args.get('offset', 0, type=int)
    operation_type = request.args.get('type', '').strip() or None
    username = request.args.get('username', '').strip() or None

    user_ids = None
    if current_user.role == 'contractor':
        user_ids = [current_user.id]
    elif current_user.role == 'project_admin':
        org_users = user_manager.get_users_by_organization(current_user.organization)
        user_ids = [u['id'] for u in org_users] if org_users else []
    # admin / pmo 不限制 user_ids

    result = user_manager.get_operation_logs(
        limit=limit,
        offset=offset,
        operation_type=operation_type,
        username=username,
        user_ids=user_ids
    )
    return jsonify(result)

@auth_bp.route('/api/admin/logs/archive', methods=['POST'])
@login_required
def admin_archive_logs():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    from app.routes.settings import load_settings
    settings = load_settings()
    retention_days = settings.get('log_retention_days', 30)
    result = user_manager.archive_old_logs(retention_days)
    if result.get('status') == 'success' and result.get('count', 0) > 0:
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'archive_logs', None, None, f'days={retention_days}, count={result["count"]}', ip)
    return jsonify(result)

@auth_bp.route('/api/admin/logs/import', methods=['POST'])
@login_required
def admin_import_logs():
    if current_user.role not in ('admin', 'pmo'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': '请选择文件'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': '文件名为空'}), 400
    if not file.filename.endswith('.json'):
        return jsonify({'status': 'error', 'message': '仅支持 JSON 格式的日志文件'}), 400
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix='.json') as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name
    try:
        result = user_manager.import_logs(tmp_path)
        if result.get('status') == 'success':
            ip = get_real_ip()
            user_manager.add_operation_log(current_user.id, current_user.username, 'import_logs', None, None, f'inserted={result.get("inserted", 0)}, skipped={result.get("skipped", 0)}', ip)
    finally:
        import os
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    return jsonify(result)

def init_auth(app):
    """初始化认证模块"""
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = '请先登录'
    
    app.register_blueprint(auth_bp)
    
    @app.before_request
    def before_request():
        if request.endpoint not in ['auth.login', 'auth_routes.check_auth_status', 'auth.register', 'auth.list_organizations', 'static']:
            # pending 用户限制访问范围
            if current_user.is_authenticated and getattr(current_user, 'status', 'active') == 'pending':
                allowed_prefixes = ['/api/messages/', '/api/me', '/logout', '/api/auth/status']
                allowed = any(request.path.startswith(p) for p in allowed_prefixes) or request.endpoint in ['auth.logout', 'auth_routes.check_auth_status', 'auth.get_current_user_info', 'auth.update_current_user_info', 'auth.change_current_user_password', 'auth.deactivate_current_user']
                if not allowed:
                    return jsonify({'status': 'error', 'message': '账户正在审核中，暂无法使用该功能'}), 403
            if check_ip_blacklist():
                return jsonify({'status': 'error', 'message': 'IP地址已被限制访问'}), 403
