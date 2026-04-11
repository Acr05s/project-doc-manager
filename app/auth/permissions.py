"""权限控制模块"""

from functools import wraps
from flask import jsonify, request
from flask_login import login_required, current_user
from app.models.user import user_manager


def role_required(roles):
    """角色权限装饰器"""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            # 系统管理员拥有所有权限
            if current_user.role == 'admin':
                return f(*args, **kwargs)
            # 检查用户角色是否在允许的角色列表中
            if current_user.role not in roles:
                return jsonify({'status': 'error', 'message': '权限不足'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def project_required():
    """项目权限装饰器"""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            # 系统管理员和PMO成员拥有所有项目权限
            if current_user.role in ['admin', 'pmo']:
                return f(*args, **kwargs)
            # 获取项目ID
            project_id = kwargs.get('project_id') or request.args.get('project_id') or request.json.get('project_id')
            if not project_id:
                return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
            # 检查用户是否有权限访问该项目
            user_projects = user_manager.get_user_projects(current_user.id)
            if project_id not in user_projects:
                return jsonify({'status': 'error', 'message': '无权限访问该项目'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def admin_required(f):
    """系统管理员权限装饰器"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if current_user.role != 'admin':
            return jsonify({'status': 'error', 'message': '权限不足'}), 403
        return f(*args, **kwargs)
    return decorated_function


def pmo_required(f):
    """PMO成员权限装饰器"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if current_user.role not in ['admin', 'pmo']:
            return jsonify({'status': 'error', 'message': '权限不足'}), 403
        return f(*args, **kwargs)
    return decorated_function


def project_admin_required(f):
    """项目管理员权限装饰器"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if current_user.role == 'admin':
            return f(*args, **kwargs)
        if current_user.role != 'project_admin':
            return jsonify({'status': 'error', 'message': '权限不足'}), 403
        # 获取项目ID
        project_id = kwargs.get('project_id') or request.args.get('project_id') or request.json.get('project_id')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        # 检查用户是否有权限访问该项目
        user_projects = user_manager.get_user_projects(current_user.id)
        if project_id not in user_projects:
            return jsonify({'status': 'error', 'message': '无权限访问该项目'}), 403
        return f(*args, **kwargs)
    return decorated_function


def contractor_required(f):
    """承建方普通用户权限装饰器"""
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if current_user.role not in ['admin', 'pmo', 'project_admin', 'contractor']:
            return jsonify({'status': 'error', 'message': '权限不足'}), 403
        # 获取项目ID
        project_id = kwargs.get('project_id') or request.args.get('project_id') or request.json.get('project_id')
        if project_id:
            # 检查用户是否有权限访问该项目
            user_projects = user_manager.get_user_projects(current_user.id)
            if project_id not in user_projects:
                return jsonify({'status': 'error', 'message': '无权限访问该项目'}), 403
        return f(*args, **kwargs)
    return decorated_function
