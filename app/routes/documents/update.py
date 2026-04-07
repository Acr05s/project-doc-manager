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

        # 文档替换成功后，删除旧的 PDF 转换缓存并触发新转换
        if result.get('status') == 'success':
            try:
                from src.services.pdf_conversion_record import pdf_conversion_record
                # 删除该文档的所有旧转换缓存
                pdf_conversion_record.delete_record(doc_id)
                print(f"[replace_doc] 已删除旧PDF转换缓存: {doc_id}")

                # 触发新的后台 PDF 转换
                updated_doc = doc_manager.documents_db.get(doc_id, {})
                file_path = updated_doc.get('file_path')
                if file_path:
                    from pathlib import Path
                    fp_obj = Path(file_path)
                    if not fp_obj.is_absolute():
                        fp_obj = doc_manager.config.projects_base_folder.parent / 'projects' / file_path
                    if fp_obj.exists():
                        import os
                        ext = fp_obj.suffix.lower()
                        if ext in ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']:
                            from app.services.task_service import task_service
                            mtime = int(os.path.getmtime(str(fp_obj)))
                            cache_key = f"{doc_id}_{mtime}"
                            task_service.start_pdf_conversion_task(str(fp_obj), doc_id, cache_key)
                            print(f"[replace_doc] 已触发新的后台PDF转换: {doc_id}")
            except Exception as e:
                print(f"[replace_doc] PDF缓存清理/转换失败: {e}")

        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
