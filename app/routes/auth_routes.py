"""认证路由"""

from flask import Blueprint, jsonify
from flask_login import current_user, login_required

# 创建认证路由蓝图
auth_routes_bp = Blueprint('auth_routes', __name__, url_prefix='/api/auth')


@auth_routes_bp.route('/status')
def check_auth_status():
    """检查认证状态"""
    if current_user.is_authenticated:
        return jsonify({
            'status': 'success',
            'user': {
                'id': getattr(current_user, 'uuid', current_user.id),
                'username': current_user.username,
                'role': current_user.role,
                'organization': getattr(current_user, 'organization', None),
                'status': getattr(current_user, 'status', 'active'),
                'email': getattr(current_user, 'email', None)
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


def init_auth_routes(app):
    """初始化认证路由"""
    app.register_blueprint(auth_routes_bp)
    # 注册获取用户列表的路由（不使用蓝图前缀）
    app.add_url_rule('/api/users', 'get_users_by_role', get_users_by_role, methods=['GET'])
