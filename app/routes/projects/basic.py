"""项目基本操作相关路由"""

from flask import request, jsonify
from flask_login import current_user
from .utils import get_doc_manager


def list_projects():
    """获取项目列表"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.get_projects_list()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def create_project():
    """创建新项目"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        name = data.get('name')
        description = data.get('description', '')
        party_a = data.get('party_a', '')
        party_b = data.get('party_b', '')
        supervisor = data.get('supervisor', '')
        manager = data.get('manager', '')
        duration = data.get('duration', '')
        
        if not name:
            return jsonify({'status': 'error', 'message': '项目名称不能为空'}), 400
        
        creator_id = int(current_user.id) if current_user.is_authenticated else None
        creator_username = current_user.username if current_user.is_authenticated else None
        creator_role = current_user.role if current_user.is_authenticated else None
        
        result = doc_manager.create_project(name, description, 
                                          party_a=party_a, party_b=party_b,
                                          supervisor=supervisor, manager=manager,
                                          duration=duration,
                                          creator_id=creator_id,
                                          creator_username=creator_username,
                                          creator_role=creator_role)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_accessible_projects():
    """获取当前用户可访问的项目列表"""
    try:
        doc_manager = get_doc_manager()
        if not current_user.is_authenticated:
            return jsonify([])
        
        user_id = int(current_user.id)
        user_role = current_user.role
        user_organization = getattr(current_user, 'organization', '') or ''
        
        result = doc_manager.get_user_accessible_projects(user_id, user_role, user_organization)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def approve_project():
    """审批项目（承建单位项目经理将 pending 项目改为 approved）"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '项目ID不能为空'}), 400
        
        if not current_user.is_authenticated:
            return jsonify({'status': 'error', 'message': '请先登录'}), 401
        
        if current_user.role not in ('admin', 'pmo', 'project_admin'):
            return jsonify({'status': 'error', 'message': '权限不足，只有项目经理或管理员可以审批项目'}), 403
        
        result = doc_manager.projects.approve_project(project_id, int(current_user.id))
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_project(project_id):
    """获取项目详情"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.load_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_project(project_id):
    """更新项目"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        result = doc_manager.update_project(project_id, data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_project(project_id):
    """删除项目"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.delete_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
