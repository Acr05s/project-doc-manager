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
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') == 'success':
            original_config = project_result.get('project')
            if original_config and 'documents' in original_config:
                # 构建旧文档名称到新文档名称的映射（基于索引位置）
                doc_name_mapping = {}
                for cycle, cycle_info in original_config['documents'].items():
                    if cycle not in data.get('documents', {}):
                        continue
                    
                    old_required = cycle_info.get('required_docs', [])
                    new_required = data['documents'][cycle].get('required_docs', [])
                    
                    # 对比新旧required_docs，找出名称变更
                    for i, old_doc in enumerate(old_required):
                        if i < len(new_required):
                            new_doc = new_required[i]
                            old_name = old_doc.get('name') if isinstance(old_doc, dict) else old_doc
                            new_name = new_doc.get('name') if isinstance(new_doc, dict) else new_doc
                            if old_name and new_name and old_name != new_name:
                                doc_name_mapping[(cycle, old_name)] = new_name
                
                # 保留原有文档信息，并同步更新doc_name
                for cycle, cycle_info in original_config['documents'].items():
                    if 'uploaded_docs' in cycle_info:
                        if cycle not in data.get('documents', {}):
                            data.setdefault('documents', {})[cycle] = {}
                        
                        # 复制uploaded_docs并更新doc_name
                        updated_docs = []
                        for doc in cycle_info['uploaded_docs']:
                            doc_copy = doc.copy() if isinstance(doc, dict) else doc
                            if isinstance(doc_copy, dict):
                                old_doc_name = doc_copy.get('doc_name')
                                if old_doc_name and (cycle, old_doc_name) in doc_name_mapping:
                                    doc_copy['doc_name'] = doc_name_mapping[(cycle, old_doc_name)]
                            updated_docs.append(doc_copy)
                        
                        data['documents'][cycle]['uploaded_docs'] = updated_docs
        
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


def sync_project_stats(project_id):
    """同步指定项目的统计信息"""
    try:
        from app.utils.db_manager import get_projects_index_db
        db = get_projects_index_db()
        success = db.sync_project_stats(project_id)
        if success:
            stats = db.get_project_stats(project_id)
            return jsonify({'status': 'success', 'data': stats})
        else:
            return jsonify({'status': 'error', 'message': '同步失败'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def sync_all_project_stats():
    """同步所有项目的统计信息"""
    try:
        from app.utils.db_manager import get_projects_index_db
        db = get_projects_index_db()
        result = db.sync_all_project_stats()
        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_project_stats(project_id):
    """获取指定项目的统计信息"""
    try:
        from app.utils.db_manager import get_projects_index_db
        db = get_projects_index_db()
        stats = db.get_project_stats(project_id)
        if stats:
            return jsonify({'status': 'success', 'data': stats})
        else:
            return jsonify({'status': 'error', 'message': '项目统计不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_all_project_stats():
    """获取所有项目的统计信息"""
    try:
        from app.utils.db_manager import get_projects_index_db
        db = get_projects_index_db()
        stats = db.get_project_stats()
        return jsonify({'status': 'success', 'data': stats})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_global_stats():
    """获取全局统计信息"""
    try:
        from app.utils.db_manager import get_projects_index_db
        db = get_projects_index_db()
        stats = db.get_global_stats()
        return jsonify({'status': 'success', 'data': stats})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
