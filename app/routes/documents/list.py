"""文档列表相关路由"""

from flask import request, jsonify
import json
from pathlib import Path
from .utils import get_doc_manager


def list_documents():
    """获取文档列表"""
    try:
        doc_manager = get_doc_manager()
        cycle = request.args.get('cycle')
        doc_name = request.args.get('doc_name')
        project_id = request.args.get('project_id')
        
        # 首先尝试从内存中获取文档
        docs = doc_manager.get_documents(cycle, doc_name, project_id)
        
        # 如果内存中没有文档，尝试从项目配置中加载
        if not docs and project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result.get('status') == 'success':
                project_config = project_result.get('project')
                if project_config and 'documents' in project_config:
                    documents = project_config['documents']
                    # 遍历所有周期
                    for doc_cycle, cycle_info in documents.items():
                        # 过滤周期
                        if cycle and doc_cycle != cycle:
                            continue
                        # 检查是否有已上传的文档
                        if 'uploaded_docs' in cycle_info:
                            for doc in cycle_info['uploaded_docs']:
                                # 更灵活的文档名称匹配
                                doc_doc_name = doc.get('doc_name') or doc.get('name') or doc.get('docName')
                                # 过滤文档名称
                                if doc_name and doc_doc_name != doc_name:
                                    continue
                                # 确保文档有 ID
                                doc_id = doc.get('doc_id') or f"{doc_cycle}_{doc_doc_name}_{doc.get('upload_time', '').replace(':', '_').replace('-', '_')}"
                                # 确保文档有 directory 字段
                                if 'directory' not in doc:
                                    doc['directory'] = doc.get('category') or ''
                                # 添加到结果列表
                                docs.append({
                                    'id': doc_id,
                                    **doc
                                })
        
        # 确保所有文档都有 directory 字段
        for doc in docs:
            if 'directory' not in doc:
                doc['directory'] = doc.get('category') or ''
        
        return jsonify({
            'status': 'success',
            'data': docs,
            'total': len(docs)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_document(doc_id):
    """获取单个文档信息"""
    try:
        doc_manager = get_doc_manager()
        # doc_id 可能包含 URL 编码的字符
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        # 首先从 documents_db 中查找
        if doc_id in doc_manager.documents_db:
            metadata = doc_manager.documents_db[doc_id]
            return jsonify({
                'status': 'success',
                'data': metadata
            })
        else:
            # 尝试从项目配置中查找
            found_doc = None
            
            # 1. 从当前项目中查找
            if hasattr(doc_manager, 'current_project') and doc_manager.current_project:
                project_config = doc_manager.current_project
                if 'documents' in project_config:
                    for cycle, cycle_info in project_config['documents'].items():
                        if 'uploaded_docs' in cycle_info:
                            for doc in cycle_info['uploaded_docs']:
                                if doc.get('doc_id') == doc_id:
                                    found_doc = doc
                                    break
                        if found_doc:
                            break
            
            # 2. 从所有项目中查找
            if not found_doc and hasattr(doc_manager, 'projects') and doc_manager.projects:
                for project_id, project_data in doc_manager.projects.projects_db.items():
                    if 'documents' in project_data:
                        for cycle, cycle_info in project_data['documents'].items():
                            if 'uploaded_docs' in cycle_info:
                                for doc in cycle_info['uploaded_docs']:
                                    if doc.get('doc_id') == doc_id:
                                        found_doc = doc
                                        break
                            if found_doc:
                                break
                        if found_doc:
                            break
            
            # 3. 从项目文件中查找
            if not found_doc:
                projects_dir = doc_manager.config.projects_base_folder
                # 先找子目录下的 project_config.json，再找根目录 *.json
                project_files = list(projects_dir.glob('*/project_config.json')) + list(projects_dir.glob('*.json'))
                for project_file in project_files:
                    try:
                        with open(project_file, 'r', encoding='utf-8') as f:
                            project_data = json.load(f)
                        if 'documents' in project_data:
                            for cycle, cycle_info in project_data['documents'].items():
                                if isinstance(cycle_info, dict) and 'uploaded_docs' in cycle_info:
                                    for doc in cycle_info['uploaded_docs']:
                                        if doc.get('doc_id') == doc_id:
                                            found_doc = doc
                                            break
                                if found_doc:
                                    break
                            if found_doc:
                                break
                    except Exception as e:
                        pass
            
            # 4. 从文档索引中查找
            if not found_doc and hasattr(doc_manager, 'data_manager') and doc_manager.data_manager:
                # 遍历所有项目
                projects_dir = doc_manager.config.projects_base_folder
                for project_dir in projects_dir.iterdir():
                    if project_dir.is_dir():
                        project_name = project_dir.name
                        doc_index = doc_manager.data_manager.load_documents_index(project_name)
                        if 'documents' in doc_index and doc_id in doc_index['documents']:
                            found_doc = doc_index['documents'][doc_id]
                            break
            
            if found_doc:
                # 确保文档有 id 字段
                found_doc['id'] = found_doc.get('doc_id') or doc_id
                # 将找到的文档信息添加到 documents_db
                doc_manager.documents_db[doc_id] = found_doc
                return jsonify({
                    'status': 'success',
                    'data': found_doc
                })
            else:
                return jsonify({'status': 'error', 'message': '文档不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
