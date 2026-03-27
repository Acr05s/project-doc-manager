"""文档更新相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager


def batch_update_documents():
    """批量更新文档属性"""
    try:
        doc_manager = get_doc_manager()
        data = request.json
        doc_ids = data.get('doc_ids', [])
        action = data.get('action')
        
        if not doc_ids or not action:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.batch_update_documents(doc_ids, action)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_doc(doc_id):
    """更新文档元数据"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        result = doc_manager.update_document(doc_id, data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def replace_doc(doc_id):
    """替换文档（覆盖上传）"""
    try:
        doc_manager = get_doc_manager()
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        new_data = {
            'doc_date': request.form.get('doc_date'),
            'sign_date': request.form.get('sign_date'),
            'signer': request.form.get('signer'),
            'no_signature': request.form.get('no_signature', 'false').lower() == 'true',
            'has_seal_marked': request.form.get('has_seal', 'false').lower() == 'true',
            'party_a_seal': request.form.get('party_a_seal', 'false').lower() == 'true',
            'party_b_seal': request.form.get('party_b_seal', 'false').lower() == 'true',
            'no_seal': request.form.get('no_seal', 'false').lower() == 'true',
            'other_seal': request.form.get('other_seal', '')
        }
        
        result = doc_manager.replace_document(doc_id, file, new_data)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
