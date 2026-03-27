"""文档分类相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager


def get_categories():
    """获取分类列表"""
    try:
        cycle = request.args.get('cycle')
        doc_name = request.args.get('doc_name')
        project_id = request.args.get('project_id')
        
        if not cycle or not doc_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        doc_manager = get_doc_manager()
        categories = doc_manager.get_categories(cycle, doc_name, project_id)
        return jsonify({
            'status': 'success',
            'data': categories
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def create_category():
    """创建分类"""
    try:
        data = request.json
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category')
        project_id = data.get('project_id')
        
        if not cycle or not doc_name or not category:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        doc_manager = get_doc_manager()
        result = doc_manager.create_category(cycle, doc_name, category, project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_category():
    """删除分类"""
    try:
        data = request.json
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category')
        project_id = data.get('project_id')
        
        if not cycle or not doc_name or not category:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        doc_manager = get_doc_manager()
        result = doc_manager.delete_category(cycle, doc_name, category, project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
