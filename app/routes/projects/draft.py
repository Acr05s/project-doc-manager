"""自动保存草稿 API"""

import json
from flask import request, jsonify
from datetime import datetime
from .utils import get_doc_manager


def save_draft(project_id):
    """自动保存编辑器草稿"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        draft_key = f'tree_draft_{project_id}'
        
        # 保存草稿到项目目录下的 .draft.json
        config = doc_manager.load_project(project_id)
        if config.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project = config['project']
        # 使用项目名称作为目录名（与导入时一致）
        project_name = project.get('name', project_id)
        project_folder = doc_manager.projects_base_folder / project_name
        draft_path = project_folder / '.draft.json'
        
        draft_data = {
            'tree_data': data.get('tree_data'),
            'custom_attribute_definitions': data.get('custom_attribute_definitions', []),
            'predefined_attribute_definitions': data.get('predefined_attribute_definitions', []),
            'saved_time': datetime.now().isoformat(),
            'version': 1
        }
        
        with open(draft_path, 'w', encoding='utf-8') as f:
            json.dump(draft_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': '草稿已保存',
            'saved_time': draft_data['saved_time']
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def load_draft(project_id):
    """加载编辑器草稿"""
    try:
        doc_manager = get_doc_manager()
        config = doc_manager.load_project(project_id)
        if config.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project = config['project']
        # 使用项目名称作为目录名（与导入时一致）
        project_name = project.get('name', project_id)
        project_folder = doc_manager.projects_base_folder / project_name
        draft_path = project_folder / '.draft.json'
        
        if not draft_path.exists():
            return jsonify({'status': 'success', 'draft': None})
        
        with open(draft_path, 'r', encoding='utf-8') as f:
            draft_data = json.load(f)
        
        return jsonify({
            'status': 'success',
            'draft': draft_data
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def clear_draft(project_id):
    """删除编辑器草稿"""
    try:
        doc_manager = get_doc_manager()
        config = doc_manager.load_project(project_id)
        if config.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project = config['project']
        # 使用项目名称作为目录名（与导入时一致）
        project_name = project.get('name', project_id)
        project_folder = doc_manager.projects_base_folder / project_name
        draft_path = project_folder / '.draft.json'
        
        if draft_path.exists():
            draft_path.unlink()
        
        return jsonify({'status': 'success', 'message': '草稿已删除'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
