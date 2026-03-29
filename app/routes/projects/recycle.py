"""项目回收站相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager


def list_deleted_projects():
    """获取已删除项目列表"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.get_deleted_projects()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def restore_project(project_id):
    """恢复已删除的项目"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.restore_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def permanent_delete_project(project_id):
    """永久删除项目"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.delete_project(project_id, permanent=True)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
