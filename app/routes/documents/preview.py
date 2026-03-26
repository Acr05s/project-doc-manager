"""文档预览相关路由"""

from flask import request, jsonify, send_file
from pathlib import Path
from .utils import get_doc_manager
from src.services.preview_service import PreviewService


def preview_document(doc_id):
    """预览文档（返回JSON格式的预览内容）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        doc_manager = get_doc_manager()
        result = doc_manager.get_document_preview(doc_id)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500


def preview_document_local(doc_id):
    """本地预览文档（使用Python库转换）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        doc_manager = get_doc_manager()
        
        # 获取分页参数
        page = request.args.get('page', 0, type=int)
        
        # 首先从 documents_db 中查找
        if doc_id in doc_manager.documents_db:
            metadata = doc_manager.documents_db[doc_id]
        else:
            # 尝试从项目配置中查找
            doc = None
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                for project_id, project_data in doc_manager.projects.projects_db.items():
                    if 'documents' in project_data:
                        for cycle, cycle_info in project_data['documents'].items():
                            if 'uploaded_docs' in cycle_info:
                                for d in cycle_info['uploaded_docs']:
                                    if d.get('doc_id') == doc_id:
                                        doc = d
                                        break
                                if doc:
                                    break
                        if doc:
                            break
            
            # 尝试从项目文件中查找
            if not doc:
                import json
                projects_dir = doc_manager.config.projects_base_folder
                for project_file in projects_dir.glob('*.json'):
                    try:
                        with open(project_file, 'r', encoding='utf-8') as f:
                            project_data = json.load(f)
                        if 'documents' in project_data:
                            for cycle, cycle_info in project_data['documents'].items():
                                if 'uploaded_docs' in cycle_info:
                                    for d in cycle_info['uploaded_docs']:
                                        if d.get('doc_id') == doc_id:
                                            doc = d
                                            break
                                    if doc:
                                        break
                            if doc:
                                break
                    except Exception as e:
                        pass
            
            if not doc:
                return jsonify({'status': 'error', 'message': '文档不存在'}), 404
            
            metadata = doc
        
        file_path = metadata.get('file_path')
        
        # 处理相对路径
        file_path_obj = Path(file_path)
        if not file_path_obj.is_absolute():
            # 相对路径，相对于项目的uploads目录
            project_name = metadata.get('project_name')
            if not project_name and hasattr(doc_manager, 'current_project') and doc_manager.current_project:
                project_name = doc_manager.current_project.get('name')
            
            if project_name:
                project_uploads_dir = doc_manager.get_documents_folder(project_name)
                file_path_obj = project_uploads_dir / file_path
            else:
                # 如果没有项目名称，尝试使用绝对路径
                # 检查文件是否存在于uploads目录中
                if hasattr(doc_manager, 'config') and hasattr(doc_manager.config, 'upload_folder'):
                    upload_folder = doc_manager.config.upload_folder
                else:
                    upload_folder = Path('uploads')
                file_path_obj = upload_folder / file_path
        
        if not file_path or not file_path_obj.exists():
            return jsonify({'status': 'error', 'message': '文件不存在'}), 404
        
        # 使用PreviewService生成预览
        preview_service = PreviewService()
        html_content = preview_service.get_full_preview(str(file_path_obj), page)
        
        return html_content
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500


def view_document(doc_id):
    """直接查看文档（用于PDF、图片等可直接在浏览器显示的文件）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        doc_manager = get_doc_manager()
        
        # 首先从 documents_db 中查找
        if doc_id not in doc_manager.documents_db:
            # 尝试从项目配置中查找
            doc = None
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                for project_id, project_data in doc_manager.projects.projects_db.items():
                    if 'documents' in project_data:
                        for cycle, cycle_info in project_data['documents'].items():
                            if 'uploaded_docs' in cycle_info:
                                for d in cycle_info['uploaded_docs']:
                                    if d.get('doc_id') == doc_id:
                                        doc = d
                                        break
                                if doc:
                                    break
                        if doc:
                            break
            
            # 尝试从项目文件中查找
            if not doc:
                import json
                projects_dir = doc_manager.config.projects_base_folder
                for project_file in projects_dir.glob('*.json'):
                    try:
                        with open(project_file, 'r', encoding='utf-8') as f:
                            project_data = json.load(f)
                        if 'documents' in project_data:
                            for cycle, cycle_info in project_data['documents'].items():
                                if 'uploaded_docs' in cycle_info:
                                    for d in cycle_info['uploaded_docs']:
                                        if d.get('doc_id') == doc_id:
                                            doc = d
                                            break
                                    if doc:
                                        break
                            if doc:
                                break
                    except Exception as e:
                        pass
            
            if not doc:
                return jsonify({'status': 'error', 'message': '文档不存在'}), 404
            
            # 将找到的文档信息添加到 documents_db
            doc_manager.documents_db[doc_id] = doc
            metadata = doc
        else:
            metadata = doc_manager.documents_db[doc_id]
        
        file_path = metadata.get('file_path')
        
        # 处理相对路径
        file_path_obj = Path(file_path)
        if not file_path_obj.is_absolute():
            # 相对路径，相对于项目的uploads目录
            project_name = metadata.get('project_name')
            if not project_name and hasattr(doc_manager, 'current_project') and doc_manager.current_project:
                project_name = doc_manager.current_project.get('name')
            
            if project_name:
                project_uploads_dir = doc_manager.get_documents_folder(project_name)
                file_path_obj = project_uploads_dir / file_path
            else:
                # 如果没有项目名称，尝试使用绝对路径
                # 检查文件是否存在于uploads目录中
                if hasattr(doc_manager, 'config') and hasattr(doc_manager.config, 'upload_folder'):
                    upload_folder = doc_manager.config.upload_folder
                else:
                    upload_folder = Path('uploads')
                file_path_obj = upload_folder / file_path
        
        if not file_path or not file_path_obj.exists():
            return jsonify({'status': 'error', 'message': '文件不存在'}), 404
        
        file_ext = file_path_obj.suffix.lower()
        file_path = str(file_path_obj)
        
        mime_types = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp'
        }
        
        content_type = mime_types.get(file_ext, 'application/octet-stream')
        
        return send_file(file_path, mimetype=content_type)
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'查看失败: {str(e)}'}), 500