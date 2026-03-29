"""清理重复文档路由"""

from flask import request, jsonify
from datetime import datetime
from pathlib import Path
from .utils import get_doc_manager


def cleanup_duplicates():
    """
    清理当前项目的重复文档
    
    请求参数:
        project_id: 项目ID
        project_name: 项目名称
        
    返回:
        清理结果，包含：
        - total: 总文档数
        - duplicates_found: 发现的重复组数
        - removed: 删除的文档数
        - remaining: 剩余文档数
        - details: 详细记录
    """
    try:
        doc_manager = get_doc_manager()
        
        # 获取请求参数
        data = request.get_json() or {}
        project_id = data.get('project_id')
        project_name = data.get('project_name')
        
        if not project_id and not project_name:
            return jsonify({
                'status': 'error',
                'message': '缺少项目参数'
            }), 400
        
        # 如果只有 project_id，查找项目名称
        if not project_name and project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result and project_result.get('status') == 'success':
                project_name = project_result.get('project', {}).get('name', '')
        
        if not project_name:
            return jsonify({
                'status': 'error',
                'message': '无法确定项目名称'
            }), 400
        
        # 加载文档索引
        doc_index = doc_manager.data_manager.load_documents_index(project_name)
        documents = doc_index.get('documents', {})
        
        original_count = len(documents)
        
        # 用于去重的字典
        seen_files = {}  # key: original_filename, value: (doc_id, upload_time, doc_info)
        duplicates_to_remove = []  # 要删除的重复项
        duplicate_groups = []  # 重复组，用于返回详细信息
        
        # 第一步：找出所有重复项
        for doc_id, doc_info in documents.items():
            original_filename = doc_info.get('original_filename', '')
            
            if not original_filename:
                # 如果没有 original_filename，尝试使用 file_path 中的文件名
                file_path = doc_info.get('file_path', '')
                if file_path:
                    original_filename = Path(file_path).name
                else:
                    continue
            
            upload_time = doc_info.get('upload_time', '') or doc_info.get('timestamp', '')
            
            if original_filename in seen_files:
                # 发现重复
                existing_doc_id, existing_time, existing_info = seen_files[original_filename]
                
                # 比较上传时间，保留更新的
                if upload_time >= existing_time:
                    # 当前文档更新，标记删除旧的
                    duplicates_to_remove.append({
                        'doc_id': existing_doc_id,
                        'filename': existing_info.get('original_filename', ''),
                        'reason': '被更新的重复项替换'
                    })
                    # 记录重复组
                    duplicate_groups.append({
                        'filename': original_filename,
                        'kept': {
                            'doc_id': doc_id,
                            'upload_time': upload_time,
                            'cycle': doc_info.get('cycle', ''),
                            'doc_name': doc_info.get('doc_name', '')
                        },
                        'removed': {
                            'doc_id': existing_doc_id,
                            'upload_time': existing_time,
                            'cycle': existing_info.get('cycle', ''),
                            'doc_name': existing_info.get('doc_name', '')
                        }
                    })
                    # 更新为当前文档
                    seen_files[original_filename] = (doc_id, upload_time, doc_info)
                else:
                    # 当前文档更旧，标记删除当前的
                    duplicates_to_remove.append({
                        'doc_id': doc_id,
                        'filename': original_filename,
                        'reason': '存在更新的重复项'
                    })
                    # 记录重复组
                    duplicate_groups.append({
                        'filename': original_filename,
                        'kept': {
                            'doc_id': existing_doc_id,
                            'upload_time': existing_time,
                            'cycle': existing_info.get('cycle', ''),
                            'doc_name': existing_info.get('doc_name', '')
                        },
                        'removed': {
                            'doc_id': doc_id,
                            'upload_time': upload_time,
                            'cycle': doc_info.get('cycle', ''),
                            'doc_name': doc_info.get('doc_name', '')
                        }
                    })
            else:
                seen_files[original_filename] = (doc_id, upload_time, doc_info)
        
        # 第二步：执行删除
        removed_count = 0
        removed_details = []
        
        for item in duplicates_to_remove:
            doc_id = item['doc_id']
            if doc_id in documents:
                del documents[doc_id]
                removed_count += 1
                removed_details.append(item)
        
        # 第三步：保存更新后的文档索引
        if removed_count > 0:
            doc_manager.data_manager.save_documents_index(project_name, doc_index)
            
            # 同时更新项目配置中的 uploaded_docs
            try:
                config = doc_manager.data_manager.load_full_config(project_name)
                if config and 'documents' in config:
                    # 重新构建 uploaded_docs
                    for cycle_name in config['documents']:
                        if 'uploaded_docs' in config['documents'][cycle_name]:
                            # 只保留存在于 documents_index 中的文档
                            config['documents'][cycle_name]['uploaded_docs'] = [
                                doc for doc in config['documents'][cycle_name]['uploaded_docs']
                                if doc.get('doc_id') in documents
                            ]
                    
                    # 保存更新后的配置
                    doc_manager.data_manager.save_full_config(project_name, config)
            except Exception as e:
                print(f"更新项目配置失败: {e}")
        
        return jsonify({
            'status': 'success',
            'data': {
                'total': original_count,
                'duplicates_found': len(duplicate_groups),
                'removed': removed_count,
                'remaining': len(documents),
                'duplicate_groups': duplicate_groups,
                'removed_details': removed_details
            }
        })
        
    except Exception as e:
        import traceback
        return jsonify({
            'status': 'error',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500
