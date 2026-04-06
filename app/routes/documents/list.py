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
        
        # 从内存中获取文档（get_documents 已经处理了从项目配置加载的逻辑）
        docs = doc_manager.get_documents(cycle, doc_name, project_id)
        
        # 去重：基于 doc_id 或 file_path
        seen_ids = set()
        unique_docs = []
        for doc in docs:
            doc_id = doc.get('doc_id') or doc.get('id')
            file_path = doc.get('file_path', '')
            original_name = doc.get('original_filename', '')
            
            # 创建唯一键
            unique_key = doc_id if doc_id else (file_path if file_path else original_name)
            
            if unique_key and unique_key not in seen_ids:
                seen_ids.add(unique_key)
                # 确保文档有 id 字段（总是使用 doc_id 覆盖，确保正确性）
                if doc_id:
                    doc['id'] = doc_id
                # 确保文档有 directory 字段
                if 'directory' not in doc:
                    doc['directory'] = doc.get('category') or ''
                unique_docs.append(doc)
        
        docs = unique_docs
        
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
            
            def _doc_matches(doc, search_id, doc_cycle=None):
                """检查文档是否匹配给定的 doc_id（兼容多种字段格式）
                
                兜底逻辑：对于历史数据里没有 doc_id 字段的记录，
                用 {cycle}_{doc_name}_{upload_time}（与 get_documents 生成规则相同）动态对比
                """
                if (doc.get('doc_id') == search_id or
                        doc.get('id') == search_id or
                        doc.get('original_filename') == search_id or
                        doc.get('filename') == search_id):
                    return True
                # 动态 ID 兜底：重新生成并对比（需要传入 cycle）
                _cycle = doc_cycle or doc.get('cycle', doc.get('doc_cycle', ''))
                upload_time = doc.get('upload_time', '').replace(':', '_').replace('-', '_')
                dynamic_id = f"{_cycle}_{doc.get('doc_name', '')}_{upload_time}"
                return dynamic_id == search_id
            
            # 1. 从当前项目中查找
            if hasattr(doc_manager, 'current_project') and doc_manager.current_project:
                project_config = doc_manager.current_project
                if 'documents' in project_config:
                    for cycle, cycle_info in project_config['documents'].items():
                        if 'uploaded_docs' in cycle_info:
                            for doc in cycle_info['uploaded_docs']:
                                if _doc_matches(doc, doc_id, cycle):
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
                                    if _doc_matches(doc, doc_id, cycle):
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
                                        if _doc_matches(doc, doc_id, cycle):
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
