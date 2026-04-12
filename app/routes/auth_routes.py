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


def init_auth_routes(app):
    """初始化认证路由"""
    app.register_blueprint(auth_routes_bp)
