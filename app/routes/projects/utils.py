"""项目路由工具函数"""

from functools import wraps
from flask import jsonify, request
from flask_login import current_user, login_required

doc_manager = None

def init_doc_manager(manager):
    """初始化文档管理器"""
    global doc_manager
    doc_manager = manager

def get_doc_manager():
    """获取文档管理器实例"""
    global doc_manager
    if doc_manager is None:
        raise RuntimeError("DocumentManager not initialized. Call init_doc_manager first.")
    return doc_manager


def check_project_access(project_id):
    """检查当前用户是否有权访问指定项目，返回 (has_access, error_response)"""
    if not current_user.is_authenticated:
        return False, (jsonify({'status': 'error', 'message': '请先登录'}), 401)

    # admin 和 pmo 可以访问所有项目
    if current_user.role in ('admin', 'pmo', 'pmo_leader'):
        return True, None

    user_id = int(current_user.id)
    user_role = current_user.role
    user_organization = getattr(current_user, 'organization', '') or ''

    dm = get_doc_manager()
    accessible = dm.get_user_accessible_projects(user_id, user_role, user_organization)
    accessible_ids = [p['id'] for p in accessible]

    if project_id not in accessible_ids:
        return False, (jsonify({'status': 'error', 'message': '无权限访问该项目'}), 403)

    return True, None


def project_access_required(f):
    """装饰器：要求用户登录且对 project_id 参数指定的项目有访问权限"""
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        project_id = kwargs.get('project_id') or request.args.get('project') or request.args.get('project_id')
        if not project_id:
            # 尝试从 JSON body 中读取
            data = request.get_json(silent=True)
            if data:
                project_id = data.get('project_id') or data.get('project')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID参数'}), 400

        has_access, error = check_project_access(project_id)
        if not has_access:
            return error
        return f(*args, **kwargs)
    return decorated


def pmo_admin_required(f):
    """装饰器：要求用户角色为 PMO 或管理员"""
    @wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if current_user.role not in ('admin', 'pmo', 'pmo_leader'):
            return jsonify({'status': 'error', 'message': '仅PMO和管理员有权执行此操作'}), 403
        return f(*args, **kwargs)
    return decorated
