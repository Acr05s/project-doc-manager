"""项目基本操作相关路由"""

from flask import request, jsonify
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
        
        result = doc_manager.create_project(name, description, 
                                          party_a=party_a, party_b=party_b,
                                          supervisor=supervisor, manager=manager,
                                          duration=duration)
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
    """更新项目（兼容新旧版）"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        
        # 加载原有项目配置，保留uploaded_docs信息
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') == 'success':
            original_config = project_result.get('project')
            if original_config and 'documents' in original_config:
                # 保留原有文档信息
                for cycle, cycle_info in original_config['documents'].items():
                    if 'uploaded_docs' in cycle_info:
                        if cycle not in data.get('documents', {}):
                            data.setdefault('documents', {})[cycle] = {}
                        data['documents'][cycle]['uploaded_docs'] = cycle_info['uploaded_docs']
        
        # 保存项目配置
        result = doc_manager.save_project(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_project(project_id):
    """删除项目（软删除）"""
    try:
        doc_manager = get_doc_manager()
        permanent = request.args.get('permanent', 'false').lower() == 'true'
        result = doc_manager.delete_project(project_id, permanent)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
