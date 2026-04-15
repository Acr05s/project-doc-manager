"""认证模块"""

import re
from flask import Blueprint, render_template, redirect, url_for, request, jsonify
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from app.models.user import user_manager
from app.models.message import message_manager
import json
from app.utils.security import get_real_ip, is_rate_limited
from datetime import datetime, timedelta

# 创建认证蓝图
auth_bp = Blueprint('auth', __name__)

# 初始化登录管理器
login_manager = LoginManager()


@login_manager.user_loader
def load_user(user_id):
    """加载用户"""
    return user_manager.get_user_by_id(int(user_id))


def _get_security_settings():
    """读取系统安全设置，失败时回退到默认值。"""
    defaults = {
        'password_min_length': 8,
        'password_require_letter_digit': True,
        'approval_code_must_differ_from_password': True,
        'require_approval_code': False,
    }
    try:
        from app.routes.settings import load_settings
        settings = load_settings() or {}
        defaults.update({
            'password_min_length': int(settings.get('password_min_length', defaults['password_min_length']) or defaults['password_min_length']),
            'password_require_letter_digit': bool(settings.get('password_require_letter_digit', defaults['password_require_letter_digit'])),
            'approval_code_must_differ_from_password': bool(settings.get('approval_code_must_differ_from_password', defaults['approval_code_must_differ_from_password'])),
            'require_approval_code': bool(settings.get('require_approval_code', defaults['require_approval_code'])),
        })
    except Exception:
        pass
    if defaults['password_min_length'] < 6:
        defaults['password_min_length'] = 6
    return defaults


def is_strong_password(password, min_length=8, require_letter_digit=True):
    if not password or len(password) < min_length:
        return False
    if not require_letter_digit:
        return True
    return bool(re.search(r'[A-Za-z]', password) and re.search(r'[0-9]', password))


def check_ip_blacklist():
    """检查IP是否在黑名单中"""
    ip = get_real_ip()
    return user_manager.is_ip_blocked(ip)


# ---------------------------------------------------------------------------
# 暴力破解分级封禁
# ---------------------------------------------------------------------------
_BAN_TIERS = [
    # (1 小时内失败次数, 封禁分钟数, 日志原因)
    (15, 24 * 60, '高频暴力破解，自动封禁 24 小时'),
    (5,  30,      '多次登录失败，自动封禁 30 分钟'),
]


def _apply_brute_force_ban(ip: str, failed: int):
    """按失败次数决定临时封禁时长，返回封禁提示或 None。"""
    for threshold, minutes, reason in _BAN_TIERS:
        if failed >= threshold:
            unblock_at = (datetime.now() + timedelta(minutes=minutes)).isoformat()
            user_manager.add_ip_to_blacklist(ip, reason, None, unblock_at=unblock_at)
            label = '24 小时' if minutes >= 1440 else f'{minutes} 分钟'
            return f'登录失败次数过多，IP 已被临时封禁 {label}'
    return None


def _parse_time_safe(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip().replace('T', ' ')
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d'):
        try:
            return datetime.strptime(text, fmt)
        except Exception:
            continue
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """登录"""
    ip = get_real_ip()

    if check_ip_blacklist():
        if request.method == 'POST':
            return jsonify({'status': 'error', 'message': 'IP 地址已被限制访问'}), 403
        return render_template('login.html')

    if request.method == 'POST':
        # 内存限流：同一 IP 每分钟最多 20 次登录尝试
        if is_rate_limited(ip + ':login', limit=20, window_seconds=60):
            return jsonify({'status': 'error', 'message': '请求过于频繁，请稍后再试'}), 429

        data = request.get_json(silent=True) or {}
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''

        # 输入校验
        if not username or not password:
            return jsonify({'status': 'error', 'message': '用户名和密码不能为空'})
        if len(username) > 64:
            return jsonify({'status': 'error', 'message': '用户名过长'})
        if len(password) > 256:
            return jsonify({'status': 'error', 'message': '密码过长'})

        user = user_manager.get_user_by_username(username)
        if user and check_password_hash(user.password_hash, password):
            if user.status != 'active':
                user_manager.add_login_attempt(username, ip, False)
                status_messages = {
                    'rejected': '账户审核未通过，请联系管理员',
                    'inactive': '账户已被禁用或注销，请联系管理员',
                    'pending': '账户正在审核中，请等待管理员批准'
                }
                if user.status not in status_messages:
                    return jsonify({'status': 'error', 'message': f'账户状态异常: {user.status}'})
                return jsonify({'status': 'error', 'message': status_messages[user.status]})

            login_user(user, remember=False)
            user_manager.add_operation_log(user.id, user.username, 'login', ip_address=ip)
            user_manager.add_login_attempt(username, ip, True)
            user_manager.clear_failed_login_attempts(ip)

            security = _get_security_settings()
            expire_days = int((security or {}).get('password_expire_days', 0) or 0)
            pwd_expired = False
            if expire_days > 0:
                base_time = _parse_time_safe(getattr(user, 'created_at', None))
                if base_time is not None:
                    pwd_expired = (datetime.now() - base_time).days >= expire_days

            return jsonify({
                'status': 'success',
                'message': '登录成功，请尽快修改密码' if pwd_expired else '登录成功',
                'user': {
                    'id': user.uuid,
                    'username': user.username,
                    'role': user.role,
                    'organization': user.organization,
                    'status': user.status,
                    'email': user.email,
                    'display_name': user.display_name,
                    'password_expired': pwd_expired
                },
                'security': {
                    'password_expire_days': expire_days,
                    'password_expired': pwd_expired
                }
            })
        else:
            user_manager.add_login_attempt(username, ip, False)
            failed = user_manager.get_failed_login_attempts(ip, minutes=60)
            ban_msg = _apply_brute_force_ban(ip, failed)
            if ban_msg:
                return jsonify({'status': 'error', 'message': ban_msg}), 403
            remaining = max(0, 5 - failed)
            tip = f'，再失败 {remaining} 次将被临时封禁' if remaining > 0 else ''
            return jsonify({'status': 'error', 'message': f'用户名或密码错误{tip}'})

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
    ip = get_real_ip()

    if check_ip_blacklist():
        return jsonify({'status': 'error', 'message': 'IP 地址已被限制访问'}), 403

    # 内存限流：同一 IP 每小时最多注册 5 次
    if is_rate_limited(ip + ':register', limit=5, window_seconds=3600):
        return jsonify({'status': 'error', 'message': '注册请求过于频繁，请 1 小时后再试'}), 429

    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    password_confirm = data.get('password_confirm', '').strip()
    organization_name = data.get('organization', '').strip()
    org_mode = data.get('org_mode', 'existing')  # 'existing' 或 'new'
    email = data.get('email', '').strip()
    role = data.get('role', '').strip()
    display_name = data.get('display_name', '').strip()

    if not username or not password:
        return jsonify({'status': 'error', 'message': '请填写所有必填项'})

    if role == 'pmo':
        pass  # PMO 不需要组织
    elif not organization_name:
        return jsonify({'status': 'error', 'message': '请选择或输入承建单位'})

    security = _get_security_settings()
    min_len = int(security.get('password_min_length', 8) or 8)
    require_mix = bool(security.get('password_require_letter_digit', True))

    if len(password) < min_len:
        return jsonify({'status': 'error', 'message': f'密码长度至少{min_len}位'})

    if not is_strong_password(password, min_len, require_mix):
        if require_mix:
            return jsonify({'status': 'error', 'message': f'密码需至少{min_len}位，且必须包含字母和数字'})
        return jsonify({'status': 'error', 'message': f'密码需至少{min_len}位'})

    if password != password_confirm:
        return jsonify({'status': 'error', 'message': '两次输入的密码不一致'})

    password_hash = generate_password_hash(password)
    result = user_manager.register_user(
        username, password_hash, organization_name, is_new_org=(org_mode == 'new'), email=email or None, role=role or None, display_name=display_name or None
    )

    if result['status'] == 'success':
        ip = get_real_ip()
        user_id = result.get('user_id')
        user_manager.add_operation_log(None, username, 'register', str(user_id), username, f'组织: {organization_name}, 模式: {org_mode}, 邮箱: {email}, 角色: {role}', ip)
        # 发送通知给审批人
        _notify_user_approvers(user_id, username, organization_name, org_mode == 'new', role=role)

        # 发送注册邮件通知
        try:
            from app.utils.notification import notify_user_registered
            notify_user_registered(username, email, organization_name, role)
        except Exception as e:
            print(f"发送注册邮件通知失败: {e}")

        # 自动登录该用户（pending 状态也可以登录）
        user = user_manager.get_user_by_id(user_id)
        if user:
            login_user(user, force=True)
            return jsonify({
                'status': 'success',
                'message': '注册成功，账户正在审核中',
                'needs_approval': True,
                'user': {
                    'id': user.uuid,
                    'username': user.username,
                    'role': user.role,
                    'organization': user.organization,
                    'status': user.status,
                    'email': user.email,
                    'display_name': user.display_name
                }
            })

    return jsonify(result)


def _notify_user_approvers(user_id, username, organization_name, is_new_org, role=None):
    """通知用户审批人"""
    try:
        if role == 'pmo':
            # PMO 注册：优先通知 PMO 负责人审核，无负责人时回退 admin
            approvers = [
                u for u in user_manager.get_users_by_roles(['pmo_leader'])
                if u.get('status') == 'active' and (u.get('organization') or '').strip() == 'PMO'
            ]
            if not approvers:
                approvers = [u for u in user_manager.get_users_by_roles(['admin']) if u.get('status') == 'active']
            for approver in approvers:
                message_manager.send_message(
                    receiver_id=approver['id'],
                    title='新用户待审批（PMO成员注册）',
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
            # 现有组织：优先通知同组织的 project_admin 审核
            approvers = [
                approver for approver in user_manager.get_users_by_roles(['project_admin'])
                if approver.get('organization') == organization_name and approver.get('status') == 'active'
            ]
            if not approvers:
                approvers = [
                    approver for approver in user_manager.get_users_by_roles(['admin', 'pmo'])
                    if approver.get('status') == 'active'
                ]
            for approver in approvers:
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
@auth_bp.route('/api/users/pending', methods=['GET'])
@login_required
def get_pending_users():
    """获取待审核用户列表"""
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    
    org = getattr(current_user, 'organization', None)
    users = user_manager.get_pending_users(current_user.role, org)
    # 用UUID替代内部ID返回给前端
    for u in users:
        u['id'] = u.get('uuid', u['id'])
    return jsonify({'status': 'success', 'users': users})


@auth_bp.route('/approve-user', methods=['POST'])
@auth_bp.route('/api/approve-user', methods=['POST'])
@login_required
def approve_user():
    """审核通过用户"""
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    
    data = request.get_json()
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': '用户ID不能为空'}), 400
    
    # 通过UUID解析内部ID
    target = user_manager.get_user_by_uuid(str(user_id))
    if not target:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    
    # project_admin 只能审核同组织的 contractor
    if current_user.role == 'project_admin':
        if target.organization != current_user.organization or target.role != 'contractor':
            return jsonify({'status': 'error', 'message': '只能审核本单位的普通用户'}), 403
    # pmo_leader 只能审核 PMO 成员
    if current_user.role == 'pmo_leader':
        if not _is_pmo_user(target):
            return jsonify({'status': 'error', 'message': '只能审核PMO组织成员'}), 403
    
    result = user_manager.approve_user(target.id, int(current_user.id))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'approve_user', str(target.uuid), None, None, ip)

        if current_user.role == 'project_admin' and target.role == 'contractor':
            # 组织管理员同意后，通知 PMO 了解该用户已通过本单位审核
            pmos = [u for u in user_manager.get_users_by_roles(['pmo']) if u.get('status') == 'active']
            for pmo_user in pmos:
                message_manager.send_message(
                    receiver_id=pmo_user['id'],
                    title='组织管理员已通过新用户审核',
                    content=f'用户 "{target.username}" 已通过承建单位 "{target.organization}" 的管理员审核。',
                    msg_type='system',
                    related_id=str(target.uuid),
                    related_type='user'
                )

        # 通知申请人
        _notify_user_applicant(target.id, approved=True)
    return jsonify(result)


@auth_bp.route('/reject-user', methods=['POST'])
@auth_bp.route('/api/reject-user', methods=['POST'])
@login_required
def reject_user():
    """拒绝用户"""
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    
    data = request.get_json()
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': '用户ID不能为空'}), 400
    
    # 通过UUID解析内部ID
    target = user_manager.get_user_by_uuid(str(user_id))
    if not target:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    
    if current_user.role == 'project_admin':
        if target.organization != current_user.organization or target.role != 'contractor':
            return jsonify({'status': 'error', 'message': '只能审核本单位的普通用户'}), 403
    if current_user.role == 'pmo_leader':
        if not _is_pmo_user(target):
            return jsonify({'status': 'error', 'message': '只能审核PMO组织成员'}), 403
    
    result = user_manager.reject_user(target.id, int(current_user.id))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'reject_user', str(target.uuid), None, None, ip)
        # 通知申请人
        _notify_user_applicant(target.id, approved=False)
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
        # 发送邮件通知
        try:
            from app.utils.notification import notify_user_approved, notify_user_rejected
            if approved:
                notify_user_approved(user.username, user.email)
            else:
                notify_user_rejected(user.username, user.email)
        except Exception as e:
            print(f"发送邮件通知失败: {e}")
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
                'id': u.uuid,
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
    
    return jsonify({'status': 'success', 'blacklist': user_manager.get_ip_blacklist(include_expired=False)})


@auth_bp.route('/api/security/blacklist', methods=['GET'])
@login_required
def list_ip_blacklist_api():
    """获取当前有效 IP 黑名单（仅管理员）"""
    if current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    return jsonify({'status': 'success', 'blacklist': user_manager.get_ip_blacklist(include_expired=False)})


@auth_bp.route('/api/security/blacklist/unblock', methods=['POST'])
@login_required
def unblock_ip_api():
    """管理员解封指定 IP（用于误封恢复）"""
    if current_user.role != 'admin':
        return jsonify({'status': 'error', 'message': '权限不足'}), 403

    data = request.get_json(silent=True) or {}
    ip_address = (data.get('ip_address') or '').strip()
    if not ip_address:
        return jsonify({'status': 'error', 'message': 'ip_address 不能为空'}), 400

    success = user_manager.remove_ip_from_blacklist(ip_address)
    if success:
        # 解封后清理该 IP 失败计数，避免刚解封再次被立即触发封禁
        user_manager.clear_failed_login_attempts(ip_address)
        ip = get_real_ip()
        user_manager.add_operation_log(
            current_user.id,
            current_user.username,
            'remove_ip_blacklist',
            ip_address,
            None,
            'api_unblock',
            ip
        )
        return jsonify({'status': 'success', 'message': 'IP 解封成功'})

    return jsonify({'status': 'error', 'message': '解封失败或该 IP 不在黑名单中'}), 400


@auth_bp.route('/api/me', methods=['GET'])
@login_required
def get_current_user_info():
    user = current_user
    return jsonify({
        'status': 'success',
        'user': {
            'id': user.uuid,
            'username': user.username,
            'role': user.role,
            'organization': user.organization,
            'email': user.email,
            'status': user.status,
            'created_at': user.created_at,
            'approval_code_needs_change': getattr(user, 'approval_code_needs_change', 1) == 1
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
    security = _get_security_settings()
    min_len = int(security.get('password_min_length', 8) or 8)
    require_mix = bool(security.get('password_require_letter_digit', True))

    if len(new_password) < min_len:
        return jsonify({'status': 'error', 'message': f'新密码长度至少{min_len}位'})
    if not is_strong_password(new_password, min_len, require_mix):
        if require_mix:
            return jsonify({'status': 'error', 'message': f'新密码需至少{min_len}位，且必须包含字母和数字'})
        return jsonify({'status': 'error', 'message': f'新密码需至少{min_len}位'})
    user = user_manager.get_user_by_id(current_user.id)
    if not check_password_hash(user.password_hash, old_password):
        return jsonify({'status': 'error', 'message': '旧密码错误'})
    result = user_manager.update_password(current_user.id, generate_password_hash(new_password))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'change_password', None, None, None, ip)
    return jsonify(result)


@auth_bp.route('/api/me/approval-code/verify', methods=['POST'])
@login_required
def verify_current_user_approval_code():
    data = request.get_json() or {}
    code = data.get('code', '')
    new_code = data.get('new_code', '')
    if not code:
        return jsonify({'status': 'error', 'message': '请输入审批安全码'}), 400
    user = user_manager.get_user_by_id(current_user.id)
    if not user:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404

    if getattr(user, 'approval_code_needs_change', 1) == 1:
        if not check_password_hash(user.password_hash, code):
            return jsonify({'status': 'error', 'message': '审批安全码验证失败'}), 400
        if not new_code:
            return jsonify({'status': 'needs_change', 'message': '首次使用审批安全码需重新设置'}), 400
        security = _get_security_settings()
        min_len = int(security.get('password_min_length', 8) or 8)
        require_mix = bool(security.get('password_require_letter_digit', True))
        if not is_strong_password(new_code, min_len, require_mix):
            if require_mix:
                return jsonify({'status': 'error', 'message': f'审批安全码需至少{min_len}位，且必须包含字母和数字'}), 400
            return jsonify({'status': 'error', 'message': f'审批安全码需至少{min_len}位'}), 400
        if security.get('approval_code_must_differ_from_password', True) and check_password_hash(user.password_hash, new_code):
            return jsonify({'status': 'error', 'message': '审批安全码不能与登录密码相同'}), 400
        new_hash = generate_password_hash(new_code)
        result = user_manager.update_approval_code(current_user.id, new_hash, needs_change=0)
        if result['status'] == 'success':
            ip = get_real_ip()
            user_manager.add_operation_log(current_user.id, current_user.username, 'set_approval_code', None, None, None, ip)
        return jsonify(result)

    if not user.approval_code_hash or not check_password_hash(user.approval_code_hash, code):
        return jsonify({'status': 'error', 'message': '审批安全码错误'}), 400
    return jsonify({'status': 'success', 'message': '审批安全码验证通过'})


@auth_bp.route('/api/me/approval-code/change', methods=['POST'])
@login_required
def change_current_user_approval_code():
    data = request.get_json() or {}
    current_code = data.get('current_code', '')
    new_code = data.get('new_code', '')
    if not current_code or not new_code:
        return jsonify({'status': 'error', 'message': '请输入当前审批码和新审批码'}), 400
    security = _get_security_settings()
    min_len = int(security.get('password_min_length', 8) or 8)
    require_mix = bool(security.get('password_require_letter_digit', True))
    if not is_strong_password(new_code, min_len, require_mix):
        if require_mix:
            return jsonify({'status': 'error', 'message': f'新审批安全码需至少{min_len}位，且必须包含字母和数字'}), 400
        return jsonify({'status': 'error', 'message': f'新审批安全码需至少{min_len}位'}), 400
    user = user_manager.get_user_by_id(current_user.id)
    if not user:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    if getattr(user, 'approval_code_needs_change', 1) == 1:
        if not check_password_hash(user.password_hash, current_code):
            return jsonify({'status': 'error', 'message': '当前审批码验证失败'}), 400
    else:
        if not user.approval_code_hash or not check_password_hash(user.approval_code_hash, current_code):
            return jsonify({'status': 'error', 'message': '当前审批码错误'}), 400
    if security.get('approval_code_must_differ_from_password', True) and check_password_hash(user.password_hash, new_code):
        return jsonify({'status': 'error', 'message': '审批安全码不能与登录密码相同'}), 400

    new_hash = generate_password_hash(new_code)
    result = user_manager.update_approval_code(current_user.id, new_hash, needs_change=0)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'change_approval_code', None, None, None, ip)
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


def _is_pmo_user(user):
    """判断目标用户是否属于 PMO 组织成员（含负责人）"""
    if not user:
        return False
    org = (getattr(user, 'organization', '') or '').strip()
    role = (getattr(user, 'role', '') or '').strip()
    return org == 'PMO' and role in ('pmo', 'pmo_leader')


def _filter_pmo_user_ids(user_ids):
    """过滤出 PMO 组织成员对应的用户ID"""
    pmo_user_ids = {
        u['id'] for u in user_manager.get_users_by_organization('PMO')
        if u.get('role') in ('pmo', 'pmo_leader')
    }
    return [uid for uid in user_ids if uid in pmo_user_ids]

@auth_bp.route('/api/admin/users', methods=['GET'])
@login_required
def admin_list_users():
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    keyword = request.args.get('keyword', '').strip()
    status = request.args.get('status', '').strip()
    users = user_manager.get_all_users(keyword=keyword or None, status=status or None)
    # project_admin 只能查看本单位的用户
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        users = [u for u in users if (u.organization or '') == my_org]
    # pmo_leader 只能查看 PMO 组织成员
    if current_user.role == 'pmo_leader':
        users = [u for u in users if (u.organization or '') == 'PMO' and (u.role in ('pmo', 'pmo_leader'))]
    return jsonify({
        'status': 'success',
        'users': [
            {
                'id': u.uuid,
                'username': u.username,
                'display_name': getattr(u, 'display_name', None),
                'role': u.role,
                'organization': u.organization,
                'status': u.status,
                'email': u.email,
                'created_at': u.created_at
            } for u in users
        ]
    })

@auth_bp.route('/api/admin/users/<user_id>/reset-password', methods=['POST'])
@login_required
def admin_reset_password(user_id):
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    target = user_manager.get_user_by_uuid(user_id)
    if not target:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    # project_admin 只能操作本单位用户
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        if (target.organization or '') != my_org:
            return jsonify({'status': 'error', 'message': '只能操作本单位用户'}), 403
    if current_user.role == 'pmo_leader':
        if not _is_pmo_user(target):
            return jsonify({'status': 'error', 'message': '只能操作PMO组织成员'}), 403
    data = request.get_json()
    new_password = data.get('new_password', '')
    if len(new_password) < 6:
        return jsonify({'status': 'error', 'message': '密码长度至少6位'})
    result = user_manager.update_password(target.id, generate_password_hash(new_password))
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'reset_password', str(target.uuid), None, None, ip)
    return jsonify(result)


@auth_bp.route('/api/admin/users/<user_id>/reset-approval-code', methods=['POST'])
@login_required
def admin_reset_approval_code(user_id):
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    target = user_manager.get_user_by_uuid(user_id)
    if not target:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    # project_admin 只能操作本单位用户
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        if (target.organization or '') != my_org:
            return jsonify({'status': 'error', 'message': '只能操作本单位用户'}), 403
    if current_user.role == 'pmo_leader':
        if not _is_pmo_user(target):
            return jsonify({'status': 'error', 'message': '只能操作PMO组织成员'}), 403
    result = user_manager.reset_approval_code_to_password(target.id)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'reset_approval_code', str(target.uuid), None, None, ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/<user_id>/role', methods=['POST'])
@login_required
def admin_update_user_role(user_id):
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    target = user_manager.get_user_by_uuid(user_id)
    if not target:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    data = request.get_json()
    new_role = data.get('new_role', '').strip()
    if not new_role:
        return jsonify({'status': 'error', 'message': '角色不能为空'}), 400
    if target.id == current_user.id:
        return jsonify({'status': 'error', 'message': '不能修改自己的角色'}), 400
    # project_admin 只能操作本单位用户，且只能在 project_admin/contractor 之间切换
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        if (target.organization or '') != my_org:
            return jsonify({'status': 'error', 'message': '只能操作本单位用户'}), 403
        if new_role not in ('project_admin', 'contractor'):
            return jsonify({'status': 'error', 'message': '无权设置该角色'}), 403
    if current_user.role == 'pmo_leader':
        if not _is_pmo_user(target):
            return jsonify({'status': 'error', 'message': '只能操作PMO组织成员'}), 403
        if new_role not in ('pmo', 'pmo_leader'):
            return jsonify({'status': 'error', 'message': '无权设置该角色'}), 403
    result = user_manager.update_user_role(target.id, new_role)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'update_user_role', str(target.uuid), None, new_role, ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/<user_id>/status', methods=['POST'])
@login_required
def admin_toggle_user_status(user_id):
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    target = user_manager.get_user_by_uuid(user_id)
    if not target:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    # project_admin 只能操作本单位用户
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        if (target.organization or '') != my_org:
            return jsonify({'status': 'error', 'message': '只能操作本单位用户'}), 403
    if current_user.role == 'pmo_leader':
        if not _is_pmo_user(target):
            return jsonify({'status': 'error', 'message': '只能操作PMO组织成员'}), 403
    result = user_manager.toggle_user_status(target.id)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'toggle_user_status', str(target.uuid), None, result.get('status'), ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/<user_id>', methods=['DELETE'])
@login_required
def admin_delete_user(user_id):
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    target = user_manager.get_user_by_uuid(user_id)
    if not target:
        return jsonify({'status': 'error', 'message': '用户不存在'}), 404
    if target.id == current_user.id:
        return jsonify({'status': 'error', 'message': '不能删除自己'})
    # project_admin 只能删除本单位用户
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        if (target.organization or '') != my_org:
            return jsonify({'status': 'error', 'message': '只能操作本单位用户'}), 403
    if current_user.role == 'pmo_leader':
        if not _is_pmo_user(target):
            return jsonify({'status': 'error', 'message': '只能操作PMO组织成员'}), 403
    result = user_manager.delete_user(target.id)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'delete_user', str(target.uuid), None, None, ip)
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
        # 返回UUID给前端
        org['admin_id'] = admin.uuid if admin else None
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
    # 如果admin_id是UUID，解析为内部ID
    if admin_id:
        admin_user = user_manager.get_user_by_uuid(str(admin_id))
        admin_id = admin_user.id if admin_user else None
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
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    user_uuids = data.get('user_ids', [])
    if not user_uuids:
        return jsonify({'status': 'error', 'message': '未选择用户'}), 400
    # 解析UUID为内部ID
    user_ids = user_manager.resolve_uuids_to_ids(user_uuids)
    if current_user.id in user_ids:
        return jsonify({'status': 'error', 'message': '不能批量删除自己'}), 400
    # project_admin 只能删除本单位用户
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        org_user_ids = {u['id'] for u in user_manager.get_users_by_organization(my_org)}
        user_ids = [uid for uid in user_ids if uid in org_user_ids]
        if not user_ids:
            return jsonify({'status': 'error', 'message': '所选用户均不属于本单位'}), 403
    if current_user.role == 'pmo_leader':
        user_ids = _filter_pmo_user_ids(user_ids)
        if not user_ids:
            return jsonify({'status': 'error', 'message': '所选用户均不属于PMO组织'}), 403
    result = user_manager.batch_delete_users(user_ids)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'batch_delete_users', None, None, f'count={result.get("count", 0)}', ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/batch-role', methods=['POST'])
@login_required
def admin_batch_update_user_roles():
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    user_uuids = data.get('user_ids', [])
    new_role = data.get('new_role', '').strip()
    if not user_uuids or not new_role:
        return jsonify({'status': 'error', 'message': '参数不完整'}), 400
    user_ids = user_manager.resolve_uuids_to_ids(user_uuids)
    if current_user.id in user_ids:
        return jsonify({'status': 'error', 'message': '不能修改自己的角色'}), 400
    # project_admin 只能操作本单位用户，且只能在 project_admin/contractor 之间切换
    if current_user.role == 'project_admin':
        if new_role not in ('project_admin', 'contractor'):
            return jsonify({'status': 'error', 'message': '无权设置该角色'}), 403
        my_org = getattr(current_user, 'organization', '') or ''
        org_user_ids = {u['id'] for u in user_manager.get_users_by_organization(my_org)}
        user_ids = [uid for uid in user_ids if uid in org_user_ids]
        if not user_ids:
            return jsonify({'status': 'error', 'message': '所选用户均不属于本单位'}), 403
    if current_user.role == 'pmo_leader':
        if new_role not in ('pmo', 'pmo_leader'):
            return jsonify({'status': 'error', 'message': '无权设置该角色'}), 403
        user_ids = _filter_pmo_user_ids(user_ids)
        if not user_ids:
            return jsonify({'status': 'error', 'message': '所选用户均不属于PMO组织'}), 403
    result = user_manager.batch_update_user_roles(user_ids, new_role)
    if result['status'] == 'success':
        ip = get_real_ip()
        user_manager.add_operation_log(current_user.id, current_user.username, 'batch_update_user_roles', None, None, f'role={new_role}, count={result.get("count", 0)}', ip)
    return jsonify(result)

@auth_bp.route('/api/admin/users/batch-status', methods=['POST'])
@login_required
def admin_batch_update_user_status():
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin'):
        return jsonify({'status': 'error', 'message': '权限不足'}), 403
    data = request.get_json()
    user_uuids = data.get('user_ids', [])
    new_status = data.get('new_status', '').strip()
    if not user_uuids or not new_status:
        return jsonify({'status': 'error', 'message': '参数不完整'}), 400
    user_ids = user_manager.resolve_uuids_to_ids(user_uuids)
    # project_admin 只能操作本单位用户
    if current_user.role == 'project_admin':
        my_org = getattr(current_user, 'organization', '') or ''
        org_user_ids = {u['id'] for u in user_manager.get_users_by_organization(my_org)}
        user_ids = [uid for uid in user_ids if uid in org_user_ids]
        if not user_ids:
            return jsonify({'status': 'error', 'message': '所选用户均不属于本单位'}), 403
    if current_user.role == 'pmo_leader':
        user_ids = _filter_pmo_user_ids(user_ids)
        if not user_ids:
            return jsonify({'status': 'error', 'message': '所选用户均不属于PMO组织'}), 403
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
    if current_user.role not in ('admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor'):
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
    # admin / pmo / pmo_leader 不限制 user_ids

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
                allowed = any(request.path.startswith(p) for p in allowed_prefixes) or request.endpoint in ['auth.logout', 'auth_routes.check_auth_status', 'auth.get_current_user_info', 'auth.update_current_user_info', 'auth.change_current_user_password', 'auth.deactivate_current_user', 'main.index']
                if not allowed:
                    return jsonify({'status': 'error', 'message': '账户正在审核中，暂无法使用该功能'}), 403
            if check_ip_blacklist():
                return jsonify({'status': 'error', 'message': 'IP地址已被限制访问'}), 403
