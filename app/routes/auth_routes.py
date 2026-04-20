"""认证路由"""

from flask import Blueprint, jsonify
from flask_login import current_user, login_required

# 创建认证路由蓝图
auth_routes_bp = Blueprint('auth_routes', __name__, url_prefix='/api/auth')


@auth_routes_bp.route('/status')
def check_auth_status():
    """检查认证状态"""
    if current_user.is_authenticated:
        password_expired = False
        password_expire_days = 0
        try:
            from app.routes.settings import load_settings
            from app.models.user import user_manager
            settings = load_settings()
            password_expire_days = int(settings.get('password_expire_days', 0) or 0)
            password_expired = user_manager.is_password_expired(current_user.id, password_expire_days)
        except Exception:
            pass

        return jsonify({
            'status': 'success',
            'user': {
                'id': getattr(current_user, 'uuid', current_user.id),
                'username': current_user.username,
                'role': current_user.role,
                'organization': getattr(current_user, 'organization', None),
                'status': getattr(current_user, 'status', 'active'),
                'email': getattr(current_user, 'email', None),
                'display_name': getattr(current_user, 'display_name', None),
                'password_expired': password_expired
            },
            'security': {
                'password_expire_days': password_expire_days,
                'password_expired': password_expired
            }
        })
    else:
        return jsonify({
            'status': 'success',
            'user': None
        })


@auth_routes_bp.route('/roles')
@login_required
def get_roles():
    """获取用户角色"""
    return jsonify({
        'status': 'success',
        'role': current_user.role
    })


def get_users_by_role():
    """获取特定角色的用户列表"""
    try:
        from flask import request
        from app.models.user import user_manager

        role = request.args.get('role', 'pmo')

        # 获取所有用户并过滤角色
        all_users = user_manager.get_all_users()
        filtered_users = [u for u in all_users if u.role == role and u.status == 'active']

        # 转换为dict格式
        result_users = []
        for u in filtered_users:
            result_users.append({
                'id': u.id,
                'uuid': u.uuid,
                'username': u.username,
                'role': u.role,
                'organization': u.organization or '未分配'
            })

        return jsonify({
            'status': 'success',
            'users': result_users
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_pmo_users():
    """获取PMO成员列表"""
    try:
        from app.models.user import user_manager

        # 获取所有PMO和PMO领导角色的用户
        all_users = user_manager.get_all_users()
        filtered_users = [u for u in all_users if u.role in ('pmo', 'pmo_leader') and u.status == 'active']

        # 转换为dict格式
        result_users = []
        for u in filtered_users:
            result_users.append({
                'id': u.id,
                'uuid': u.uuid,
                'username': u.username,
                'display_name': u.display_name or u.username,
                'role': u.role,
                'organization': u.organization or '',
                'email': u.email or '',
                'source': 'PMO',
                'recommended': True
            })

        return jsonify({
            'status': 'success',
            'users': result_users
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def init_auth_routes(app):
    """初始化认证路由"""
    app.register_blueprint(auth_routes_bp)
    # 注册获取用户列表的路由（不使用蓝图前缀）
    app.add_url_rule('/api/users', 'get_users_by_role', get_users_by_role, methods=['GET'])
    # 注册获取PMO成员列表的路由
    app.add_url_rule('/api/users/pmo', 'get_pmo_users', get_pmo_users, methods=['GET'])
