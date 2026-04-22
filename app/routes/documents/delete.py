"""文档删除相关路由"""

import json
from datetime import datetime
from flask import request, jsonify
from flask_login import current_user
from app.models.user import user_manager
from .utils import get_doc_manager


def delete_document(doc_id):
    """删除文档"""
    try:
        doc_manager = get_doc_manager()

        # 删除前记录文档信息，用于日志
        doc_info = doc_manager.documents_db.get(doc_id, {})
        project_name = doc_info.get('project_name', '')
        doc_name = doc_info.get('doc_name', '')
        cycle = doc_info.get('cycle', '')
        filename = doc_info.get('original_filename', doc_info.get('filename', ''))

        result = doc_manager.delete_document(doc_id)

        if result.get('status') == 'success':
            uploader_username = getattr(current_user, 'username', '') or 'unknown'
            user_id = getattr(current_user, 'id', 0) or 0
            ip = request.remote_addr
            user_manager.add_operation_log(
                user_id,
                uploader_username,
                'document_delete',
                project_name,
                project_name,
                json.dumps({
                    'doc_name': doc_name,
                    'cycle': cycle,
                    'filename': filename,
                    'delete_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                }, ensure_ascii=False),
                ip,
            )

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

        # 删除前收集各文档信息
        docs_info = []
        for doc_id in doc_ids:
            info = doc_manager.documents_db.get(doc_id, {})
            docs_info.append({
                'doc_id': doc_id,
                'project_name': info.get('project_name', ''),
                'doc_name': info.get('doc_name', ''),
                'cycle': info.get('cycle', ''),
                'filename': info.get('original_filename', info.get('filename', '')),
            })

        result = doc_manager.batch_delete_documents(doc_ids)

        if result.get('status') == 'success':
            uploader_username = getattr(current_user, 'username', '') or 'unknown'
            user_id = getattr(current_user, 'id', 0) or 0
            ip = request.remote_addr
            for info in docs_info:
                user_manager.add_operation_log(
                    user_id,
                    uploader_username,
                    'document_delete',
                    info['project_name'],
                    info['project_name'],
                    json.dumps({
                        'doc_name': info['doc_name'],
                        'cycle': info['cycle'],
                        'filename': info['filename'],
                        'delete_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    }, ensure_ascii=False),
                    ip,
                )

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
