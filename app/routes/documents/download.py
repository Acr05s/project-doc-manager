"""文档下载相关路由"""

from flask import request, jsonify, send_file
from pathlib import Path
from .utils import get_doc_manager


def download_document(doc_id):
    """下载文档"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
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
        filename = metadata.get('filename', 'document')
        
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
        
        file_path = str(file_path_obj)
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'下载失败: {str(e)}'}), 500