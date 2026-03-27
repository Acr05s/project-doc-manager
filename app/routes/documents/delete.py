"""文档删除相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager


def delete_document(doc_id):
    """删除文档"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.delete_document(doc_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def batch_delete_documents():
    """批量删除文档"""
    try:
        doc_manager = get_doc_manager()
        data = request.json
        doc_ids = data.get('doc_ids', [])
        
        if not doc_ids:
            return jsonify({'status': 'error', 'message': '缺少文档ID列表'}), 400
        
        result = doc_manager.batch_delete_documents(doc_ids)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
