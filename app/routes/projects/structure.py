"""项目结构相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager


def update_project_structure(project_id):
    """更新项目结构"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        action = data.get('action')
        
        if not action:
            return jsonify({'status': 'error', 'message': '操作类型不能为空'}), 400
        
        result = doc_manager.update_project_structure(project_id, action, data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def confirm_cycle_documents(project_id):
    """确认周期所有文档无误"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        cycle_name = data.get('cycle_name')

        if not cycle_name:
            return jsonify({'status': 'error', 'message': '周期名称不能为空'}), 400

        result = doc_manager.confirm_cycle_documents(project_id, cycle_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
