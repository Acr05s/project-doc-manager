"""文档管理相关路由"""

from flask import Blueprint, request, jsonify, send_file, make_response
import zipfile
import io
import os
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict
from app.utils.document_manager import DocumentManager
from app.utils.zip_matcher import create_matcher
from app.utils.json_file_manager import json_file_manager
from src.services.preview_service import PreviewService

document_bp = Blueprint('document', __name__)
doc_manager = None

# 分片上传配置
CHUNK_SIZE = 10 * 1024 * 1024  # 10MB per chunk
UPLOAD_TEMP_FOLDER = Path('uploads/temp_chunks')
UPLOAD_TEMP_FOLDER.mkdir(parents=True, exist_ok=True)

# 匹配任务存储
MATCH_TASKS = {}

def init_doc_manager(manager):
    """初始化文档管理器"""
    global doc_manager
    doc_manager = manager

@document_bp.route('/upload', methods=['POST'])
def upload_document():
    """上传文档"""
    try:
        file = request.files.get('file')
        cycle = request.form.get('cycle')
        doc_name = request.form.get('doc_name')
        doc_date = request.form.get('doc_date')
        sign_date = request.form.get('sign_date')
        signer = request.form.get('signer')
        no_signature = request.form.get('no_signature', 'false').lower() == 'true'
        has_seal = request.form.get('has_seal', 'false').lower() == 'true'
        party_a_seal = request.form.get('party_a_seal', 'false').lower() == 'true'
        party_b_seal = request.form.get('party_b_seal', 'false').lower() == 'true'
        no_seal = request.form.get('no_seal', 'false').lower() == 'true'
        other_seal = request.form.get('other_seal', '')
        project_id = request.form.get('project_id', None)
        project_name = request.form.get('project_name', None)
        
        if not all([file, cycle, doc_name]):
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.upload_document(
            file, cycle, doc_name,
            doc_date=doc_date, 
            sign_date=sign_date, 
            signer=signer, 
            no_signature=no_signature,
            has_seal=has_seal, 
            party_a_seal=party_a_seal, 
            party_b_seal=party_b_seal, 
            no_seal=no_seal, 
            other_seal=other_seal,
            project_name=project_name
        )
        
        # 上传成功后，将文档添加到documents_db中
        if result.get('status') == 'success':
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            doc_id = f"{cycle}_{doc_name}_{timestamp}"
            
            # 构建文档元数据
            doc_metadata = {
                'cycle': cycle,
                'doc_name': doc_name,
                'filename': result.get('saved_filename'),
                'original_filename': result.get('original_filename'),
                'file_path': result.get('path'),
                'project_name': project_name,
                'doc_date': doc_date or '',
                'sign_date': sign_date or '',
                'signer': signer or '',
                'no_signature': no_signature,
                'has_seal_marked': has_seal,
                'party_a_seal': party_a_seal,
                'party_b_seal': party_b_seal,
                'no_seal': no_seal,
                'other_seal': other_seal or '',
                'upload_time': result.get('upload_time'),
                'source': 'upload',
                'file_size': result.get('size'),
                'doc_id': doc_id
            }
            
            # 添加到documents_db
            doc_manager.documents_db[doc_id] = doc_metadata
            
            # 添加doc_id到结果中
            result['doc_id'] = doc_id
            
            # 保存到项目配置中，记录文件路径
            if project_id:
                project_result = doc_manager.load_project(project_id)
                if project_result.get('status') == 'success':
                    project_config = project_result.get('project')
                    if project_config:
                        # 确保文档结构存在
                        if 'documents' not in project_config:
                            project_config['documents'] = {}
                        if cycle not in project_config['documents']:
                            project_config['documents'][cycle] = {'uploaded_docs': []}
                        if 'uploaded_docs' not in project_config['documents'][cycle]:
                            project_config['documents'][cycle]['uploaded_docs'] = []
                        
                        # 添加文档到项目配置
                        project_config['documents'][cycle]['uploaded_docs'].append(doc_metadata)
                        
                        # 保存更新后的项目配置
                        doc_manager.save_project(project_config)
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/list', methods=['GET'])
def list_documents():
    """获取文档列表"""
    try:
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
                                # 添加到结果列表
                                docs.append({
                                    'id': doc_id,
                                    **doc
                                })
        
        return jsonify({
            'status': 'success',
            'data': docs,
            'total': len(docs)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>', methods=['GET'])
def get_document(doc_id):
    """获取单个文档信息"""
    try:
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
            if hasattr(doc_manager, 'current_project') and doc_manager.current_project:
                project_config = doc_manager.current_project
                if 'documents' in project_config:
                    for cycle, cycle_info in project_config['documents'].items():
                        if 'uploaded_docs' in cycle_info:
                            for doc in cycle_info['uploaded_docs']:
                                if doc.get('doc_id') == doc_id:
                                    # 将找到的文档信息添加到 documents_db
                                    doc_manager.documents_db[doc_id] = doc
                                    return jsonify({
                                        'status': 'success',
                                        'data': doc
                                    })
            
            # 尝试从所有项目中查找
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                for project_id, project_data in doc_manager.projects.projects_db.items():
                    if 'documents' in project_data:
                        for cycle, cycle_info in project_data['documents'].items():
                            if 'uploaded_docs' in cycle_info:
                                for doc in cycle_info['uploaded_docs']:
                                    if doc.get('doc_id') == doc_id:
                                        # 将找到的文档信息添加到 documents_db
                                        doc_manager.documents_db[doc_id] = doc
                                        return jsonify({
                                            'status': 'success',
                                            'data': doc
                                        })
            
            # 尝试从项目文件中查找
            import json
            from pathlib import Path
            projects_dir = doc_manager.config.projects_base_folder
            for project_file in projects_dir.glob('*.json'):
                try:
                    with open(project_file, 'r', encoding='utf-8') as f:
                        project_data = json.load(f)
                    if 'documents' in project_data:
                        for cycle, cycle_info in project_data['documents'].items():
                            if 'uploaded_docs' in cycle_info:
                                for doc in cycle_info['uploaded_docs']:
                                    if doc.get('doc_id') == doc_id:
                                        # 将找到的文档信息添加到 documents_db
                                        doc_manager.documents_db[doc_id] = doc
                                        return jsonify({
                                            'status': 'success',
                                            'data': doc
                                        })
                except Exception as e:
                    pass
            
            return jsonify({'status': 'error', 'message': '文档不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/preview/<doc_id>', methods=['GET'])
def preview_document(doc_id):
    """预览文档（返回JSON格式的预览内容）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        result = doc_manager.get_document_preview(doc_id)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500

@document_bp.route('/preview-local/<doc_id>', methods=['GET'])
def preview_document_local(doc_id):
    """本地预览文档（使用Python库转换）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
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

@document_bp.route('/view/<doc_id>', methods=['GET'])
def view_document(doc_id):
    """直接查看文档（用于PDF、图片等可直接在浏览器显示的文件）"""
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

@document_bp.route('/download/<doc_id>', methods=['GET'])
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

@document_bp.route('/progress', methods=['GET'])
def get_cycle_progress():
    """获取周期文档完成进度"""
    try:
        cycle = request.args.get('cycle')
        project_id = request.args.get('project_id')
        
        if not cycle:
            return jsonify({'status': 'error', 'message': '缺少cycle参数'}), 400
        
        # 获取项目配置
        if project_id:
            project = doc_manager.load_project(project_id)
            project_config = project.get('project', {}) if project else {}
        else:
            project_config = doc_manager.current_project or {}
        
        # 获取该周期的需求文档数
        docs_info = project_config.get('documents', {}).get(cycle, {})
        required_docs = docs_info.get('required_docs', [])
        total_required = len(required_docs)
        
        # 获取已上传的文档
        all_docs = doc_manager.get_documents(cycle, project_id=project_id)
        
        # 已上传文档数（每个文档类型只算1个）
        doc_names = set()
        signer_count = 0
        seal_count = 0
        completed_count = 0  # 完成的文档数
        
        # 如果没有需求文档，直接按已上传文档计算进度
        if total_required == 0:
            for doc in all_docs:
                doc_name = doc.get('doc_name')
                if doc_name:
                    doc_names.add(doc_name)
            total_required = len(doc_names) or 1  # 避免除以0
            completed_count = len(doc_names)
            signer_count = completed_count
            seal_count = completed_count
        else:
            # 按文档名分组已上传的文档
            docs_by_name = {}
            for doc in all_docs:
                doc_name = doc.get('doc_name')
                if doc_name not in docs_by_name:
                    docs_by_name[doc_name] = []
                docs_by_name[doc_name].append(doc)
            
            # 检查每个需求文档的完成状态
            for req_doc in required_docs:
                doc_name = req_doc.get('name', '')
                requirement = req_doc.get('requirement', '').strip()
                has_no_requirement = not requirement
                
                # 更详细的要求识别
                require_signer = '签名' in requirement or '签字' in requirement
                require_seal = '盖章' in requirement or '章' in requirement
                require_party_a_signer = '甲方' in requirement and ('签名' in requirement or '签字' in requirement)
                require_party_b_signer = '乙方' in requirement and ('签名' in requirement or '签字' in requirement)
                require_party_a_seal = '甲方' in requirement and ('盖章' in requirement or '章' in requirement)
                require_party_b_seal = '乙方' in requirement and ('盖章' in requirement or '章' in requirement)
                require_owner_signer = '业主' in requirement and ('签名' in requirement or '签字' in requirement)
                
                uploaded_docs = docs_by_name.get(doc_name, [])
                
                if len(uploaded_docs) > 0:
                    doc_names.add(doc_name)
                    
                    # 无要求时，上传文档就算完成
                    if has_no_requirement:
                        completed_count += 1
                    else:
                        # 有要求时，检查签名和盖章
                        has_signer = any(d.get('signer') for d in uploaded_docs)
                        has_party_a_seal = any(d.get('party_a_seal') for d in uploaded_docs)
                        has_party_b_seal = any(d.get('party_b_seal') for d in uploaded_docs)
                        has_seal = any(d.get('has_seal_marked') or d.get('has_seal') or d.get('party_a_seal') or d.get('party_b_seal') for d in uploaded_docs)
                        
                        # 检查是否满足所有要求
                        all_requirements_met = False
                        
                        # 计算满足的要求数量
                        total_requirements = 0
                        met_requirements = 0
                        
                        if require_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_seal:
                            total_requirements += 1
                            if has_seal:
                                met_requirements += 1
                        if require_party_a_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_party_b_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_owner_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_party_a_seal:
                            total_requirements += 1
                            if has_party_a_seal:
                                met_requirements += 1
                        if require_party_b_seal:
                            total_requirements += 1
                            if has_party_b_seal:
                                met_requirements += 1
                        
                        # 判断是否满足所有要求
                        if has_no_requirement:
                            # 无要求，有文档就算完成
                            all_requirements_met = True
                        elif total_requirements > 0:
                            # 有具体要求，需要满足所有要求
                            all_requirements_met = (met_requirements == total_requirements)
                        else:
                            # 有要求但未识别出具体类型，默认只要有文档就算完成
                            # 与前端逻辑保持一致
                            all_requirements_met = True
                        
                        if all_requirements_met:
                            completed_count += 1
                        
                        # 统计满足要求的文档
                        if not require_signer or has_signer:
                            signer_count += 1
                        if not require_seal or has_seal:
                            seal_count += 1
        
        doc_count = len(doc_names)
        
        return jsonify({
            'status': 'success',
            'doc_count': doc_count,
            'signer_count': signer_count,
            'seal_count': seal_count,
            'total_required': total_required,
            'completed_count': completed_count
        })
        
    except Exception as e:
        import traceback
        logger.error(f"获取周期进度失败: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """删除文档"""
    try:
        result = doc_manager.delete_document(doc_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/batch-update', methods=['POST'])
def batch_update_documents():
    """批量更新文档属性"""
    try:
        data = request.json
        doc_ids = data.get('doc_ids', [])
        action = data.get('action')
        
        if not doc_ids or not action:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.batch_update_documents(doc_ids, action)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/batch-delete', methods=['POST'])
def batch_delete_documents():
    """批量删除文档"""
    try:
        data = request.json
        doc_ids = data.get('doc_ids', [])
        
        if not doc_ids:
            return jsonify({'status': 'error', 'message': '缺少文档ID列表'}), 400
        
        result = doc_manager.batch_delete_documents(doc_ids)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/smart-recognize', methods=['POST'])
def smart_recognize():
    """智能识别文档属性（签章、盖章等）"""
    try:
        file = request.files.get('file')
        party_a = request.form.get('party_a', '')
        party_b = request.form.get('party_b', '')
        requirement = request.form.get('requirement', '')
        
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        # 保存临时文件
        import tempfile
        import os
        from pathlib import Path
        
        temp_dir = tempfile.mkdtemp()
        temp_path = Path(temp_dir) / file.filename
        file.save(str(temp_path))
        
        try:
            # 解析需要识别的属性
            attributes_to_recognize = parse_recognition_requirements(requirement)
            
            # 调用智能识别服务，传入动态配置
            result = doc_manager.smart_recognize_document(
                str(temp_path), 
                party_a, 
                party_b,
                attributes_to_recognize
            )
            return jsonify(result)
        finally:
            # 清理临时文件
            if temp_path.exists():
                temp_path.unlink()
            if Path(temp_dir).exists():
                Path(temp_dir).rmdir()
                
    except Exception as e:
        import traceback
        logger.error(f"智能识别失败: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

def parse_recognition_requirements(requirement: str) -> Dict:
    """解析需要识别的属性要求
    
    Args:
        requirement: 要求文本
        
    Returns:
        Dict: 需要识别的属性配置
    """
    attributes = {
        'doc_date': False,
        'sign_date': False,
        'signer': False,
        'has_seal': False,
        'party_a_seal': False,
        'party_b_seal': False,
        'no_seal': False,
        'no_signature': False,
        'other_seal': False,
        'doc_number': False
    }
    
    if not requirement or requirement == '无特殊要求' or requirement == '甲方提供':
        return attributes
    
    req_lower = requirement.lower()
    
    # 日期识别
    if '文档日期' in requirement or '日期' in requirement:
        attributes['doc_date'] = True
    
    if '签字日期' in requirement or '签署日期' in requirement:
        attributes['sign_date'] = True
    
    # 签字人识别
    if '签字' in requirement or '签名' in requirement:
        attributes['signer'] = True
        attributes['no_signature'] = True
    
    # 盖章识别
    if '甲方盖章' in requirement or '甲方章' in requirement:
        attributes['party_a_seal'] = True
        attributes['has_seal'] = True
    
    if '乙方盖章' in requirement or '乙方章' in requirement:
        attributes['party_b_seal'] = True
        attributes['has_seal'] = True
    
    if '盖章' in requirement:
        attributes['has_seal'] = True
        attributes['no_seal'] = True
    
    # 发文号识别
    if '发文号' in requirement or '文号' in requirement:
        attributes['doc_number'] = True
    
    # 其他盖章标注
    if '其它' in requirement or '其他' in requirement or '标注' in requirement:
        attributes['other_seal'] = True
    
    return attributes

@document_bp.route('/categories', methods=['GET'])
def get_categories():
    """获取分类列表"""
    try:
        cycle = request.args.get('cycle')
        doc_name = request.args.get('doc_name')
        
        if not cycle or not doc_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        categories = doc_manager.get_categories(cycle, doc_name)
        return jsonify({
            'status': 'success',
            'data': categories
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/category', methods=['POST'])
def create_category():
    """创建分类"""
    try:
        data = request.json
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category')
        
        if not cycle or not doc_name or not category:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.create_category(cycle, doc_name, category)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/category', methods=['DELETE'])
def delete_category():
    """删除分类"""
    try:
        data = request.json
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category')
        
        if not cycle or not doc_name or not category:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.delete_category(cycle, doc_name, category)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>', methods=['PUT'])
def update_doc(doc_id):
    """更新文档元数据"""
    try:
        data = request.get_json()
        result = doc_manager.update_document(doc_id, data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>/replace', methods=['POST'])
def replace_doc(doc_id):
    """替换文档（覆盖上传）"""
    try:
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

@document_bp.route('/directories', methods=['GET'])
def get_directories():
    """获取可用目录列表"""
    try:
        import os
        from pathlib import Path
        
        project_id = request.args.get('project_id')
        project_name = request.args.get('project_name')
        
        if not project_id or not project_name:
            return jsonify({'status': 'error', 'message': '缺少项目参数'}), 400
        
        # 获取项目的文档目录
        docs_folder = doc_manager.get_documents_folder(project_name)
        temp_folder = docs_folder / 'temp'
        
        # 确保temp目录存在
        temp_folder.mkdir(parents=True, exist_ok=True)
        
        # 扫描temp目录下的子目录
        directories = []
        if temp_folder.exists():
            for item in temp_folder.iterdir():
                if item.is_dir() and not item.name.startswith('.'):
                    directories.append({
                        'id': str(item.relative_to(docs_folder)),
                        'name': item.name
                    })
        
        return jsonify({
            'status': 'success',
            'directories': directories
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/files/search', methods=['GET'])
def search_files():
    """搜索文件"""
    try:
        import os
        from pathlib import Path
        from datetime import datetime
        
        project_id = request.args.get('project_id')
        project_name = request.args.get('project_name')
        directory = request.args.get('directory')
        keyword = request.args.get('keyword', '').strip().lower()
        
        if not project_id or not project_name:
            return jsonify({'status': 'error', 'message': '缺少项目参数'}), 400
        
        # 获取项目的文档目录
        docs_folder = doc_manager.get_documents_folder(project_name)
        search_dir = docs_folder
        
        if directory:
            search_dir = docs_folder / directory
            # 安全检查：确保目录在docs_folder下
            try:
                search_dir.relative_to(docs_folder)
            except ValueError:
                return jsonify({'status': 'error', 'message': '非法目录'}), 400
        
        # 支持的文件类型
        allowed_exts = {'.pdf', '.doc', '.docx', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}
        
        # 搜索文件
        files = []
        if search_dir.exists():
            for file_path in search_dir.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in allowed_exts:
                    # 检查关键词
                    if keyword and keyword not in file_path.name.lower():
                        continue
                    
                    # 检查是否已被其他文档使用
                    is_used = any(
                        meta.get('file_path') == str(file_path) or 
                        meta.get('original_filename') == file_path.name
                        for meta in doc_manager.documents_db.values()
                    )
                    
                    files.append({
                        'id': str(file_path.relative_to(docs_folder)),
                        'name': file_path.name,
                        'path': str(file_path),
                        'rel_path': str(file_path.relative_to(docs_folder)),
                        'size': file_path.stat().st_size,
                        'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                        'used': is_used
                    })
        
        return jsonify({
            'status': 'success',
            'files': files,
            'total': len(files)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/files/select', methods=['POST'])
def select_files():
    """选择文件进行归档"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        project_name = data.get('project_name')
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        files = data.get('files', [])
        
        if not project_id or not project_name or not cycle or not doc_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 处理每个选中的文件
        results = []
        for file_info in files:
            file_path = Path(file_info.get('path'))
            if not file_path.exists():
                results.append({
                    'status': 'error',
                    'file': file_info.get('name'),
                    'message': '文件不存在'
                })
                continue
            
            # 构建文档元数据
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            doc_id = f"{cycle}_{doc_name}_{timestamp}_{len(results)}"
            
            doc_metadata = {
                'cycle': cycle,
                'doc_name': doc_name,
                'filename': file_path.name,
                'original_filename': file_path.name,
                'file_path': str(file_path),
                'project_name': project_name,
                'upload_time': datetime.now().isoformat(),
                'source': 'select',
                'file_size': file_path.stat().st_size,
                'doc_id': doc_id
            }
            
            # 添加到documents_db
            doc_manager.documents_db[doc_id] = doc_metadata
            
            # 保存到项目配置中
            project_result = doc_manager.load_project(project_id)
            if project_result.get('status') == 'success':
                project_config = project_result.get('project')
                if project_config:
                    # 确保文档结构存在
                    if 'documents' not in project_config:
                        project_config['documents'] = {}
                    if cycle not in project_config['documents']:
                        project_config['documents'][cycle] = {'uploaded_docs': []}
                    if 'uploaded_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['uploaded_docs'] = []
                    
                    # 添加文档到项目配置
                    project_config['documents'][cycle]['uploaded_docs'].append(doc_metadata)
                    
                    # 保存更新后的项目配置
                    doc_manager.save_project(project_config)
            
            results.append({
                'status': 'success',
                'file': file_info.get('name'),
                'doc_id': doc_id
            })
        
        return jsonify({
            'status': 'success',
            'results': results
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/zip-records', methods=['GET'])
def get_zip_records():
    """获取ZIP上传记录"""
    try:
        project_id = request.args.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 获取项目文件路径
        project_file = os.path.join(doc_manager.config.projects_base_folder, f"{project_id}.json")
        
        # 使用JSON文件管理器获取ZIP上传记录
        records = json_file_manager.get_zip_upload_records(project_file)
        
        return jsonify({
            'status': 'success',
            'records': records
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/zip-records', methods=['POST'])
def add_zip_record():
    """添加ZIP上传记录"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        zip_info = data.get('zip_info')
        
        if not project_id or not zip_info:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 获取项目文件路径
        project_file = os.path.join(doc_manager.config.projects_base_folder, f"{project_id}.json")
        
        # 确保ZIP信息包含必要字段
        if 'id' not in zip_info:
            import uuid
            zip_info['id'] = str(uuid.uuid4())
        
        if 'upload_time' not in zip_info:
            zip_info['upload_time'] = datetime.now().isoformat()
        
        # 使用JSON文件管理器添加ZIP上传记录
        success = json_file_manager.add_zip_upload_record(project_file, zip_info)
        
        if success:
            return jsonify({'status': 'success', 'message': 'ZIP上传记录添加成功'})
        else:
            return jsonify({'status': 'error', 'message': 'ZIP上传记录添加失败'}), 500
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/zip-records/<zip_id>', methods=['DELETE'])
def delete_zip_record(zip_id):
    """删除ZIP上传记录"""
    try:
        project_id = request.args.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 获取项目文件路径
        project_file = os.path.join(doc_manager.config.projects_base_folder, f"{project_id}.json")
        
        # 使用JSON文件管理器删除ZIP上传记录
        success = json_file_manager.delete_zip_upload_record(project_file, zip_id)
        
        if success:
            return jsonify({'status': 'success', 'message': 'ZIP上传记录删除成功'})
        else:
            return jsonify({'status': 'error', 'message': 'ZIP上传记录删除失败'}), 500
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ========== ZIP 大文件断点续传上传 ==========

@document_bp.route('/zip-chunk-upload', methods=['POST'])
def upload_zip_chunk():
    """分片上传ZIP文件（断点续传）"""
    try:
        chunk = request.files.get('chunk')
        if not chunk:
            return jsonify({'status': 'error', 'message': '未获取到文件分片'}), 400
        
        filename = request.form.get('filename')
        chunk_index = int(request.form.get('chunkIndex', 0))
        total_chunks = int(request.form.get('totalChunks', 1))
        
        if not filename:
            return jsonify({'status': 'error', 'message': '文件名不能为空'}), 400
        
        # 创建临时目录
        temp_dir = UPLOAD_TEMP_FOLDER / f"{filename}_{request.form.get('fileId', 'default')}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        # 保存分片
        chunk_path = temp_dir / f"chunk_{chunk_index}"
        chunk.save(str(chunk_path))
        
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{total_chunks} 上传成功',
            'chunkIndex': chunk_index,
            'totalChunks': total_chunks
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/zip-chunk-merge', methods=['POST'])
def merge_zip_chunks():
    """合并ZIP分片"""
    try:
        data = request.get_json()
        filename = data.get('filename')
        file_id = data.get('fileId', 'default')
        
        if not filename:
            return jsonify({'status': 'error', 'message': '文件名不能为空'}), 400
        
        temp_dir = UPLOAD_TEMP_FOLDER / f"{filename}_{file_id}"
        if not temp_dir.exists():
            return jsonify({'status': 'error', 'message': '分片文件不存在'}), 400
        
        # 获取所有分片
        chunks = sorted(temp_dir.glob('chunk_*'), key=lambda x: int(x.name.split('_')[1]))
        
        if not chunks:
            return jsonify({'status': 'error', 'message': '没有找到分片文件'}), 400
        
        # 合并文件
        from datetime import datetime
        output_dir = UPLOAD_TEMP_FOLDER.parent / 'temp'
        output_dir.mkdir(parents=True, exist_ok=True)
        
        merged_path = output_dir / f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
        
        with open(merged_path, 'wb') as outfile:
            for chunk in chunks:
                with open(chunk, 'rb') as infile:
                    outfile.write(infile.read())
        
        # 清理分片
        import shutil
        shutil.rmtree(temp_dir)
        
        return jsonify({
            'status': 'success',
            'message': '文件合并成功',
            'file_path': str(merged_path)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/zip-check-chunk', methods=['GET'])
def check_zip_chunk():
    """检查已上传的分片（断点续传）"""
    try:
        filename = request.args.get('filename')
        file_id = request.args.get('fileId', 'default')
        
        if not filename:
            return jsonify({'status': 'error', 'message': '文件名不能为空'}), 400
        
        temp_dir = UPLOAD_TEMP_FOLDER / f"{filename}_{file_id}"
        
        if not temp_dir.exists():
            return jsonify({'status': 'success', 'uploaded_chunks': []})
        
        # 获取已上传的分片
        uploaded = []
        for chunk in temp_dir.glob('chunk_*'):
            index = int(chunk.name.split('_')[1])
            uploaded.append(index)
        
        return jsonify({
            'status': 'success',
            'uploaded_chunks': sorted(uploaded)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ========== ZIP 自动匹配任务 ==========

@document_bp.route('/zip-match-start', methods=['POST'])
def start_zip_match():
    """启动ZIP文件匹配任务"""
    try:
        data = request.get_json()
        zip_path = data.get('zip_path')
        project_id = data.get('project_id')
        
        if not zip_path:
            return jsonify({'status': 'error', 'message': 'ZIP文件路径不能为空'}), 400
        
        # 获取项目配置
        project_config = None
        if project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result.get('status') == 'success':
                project_config = project_result.get('project')
        
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目配置不存在'}), 400
        
        # 创建任务ID
        task_id = f"match_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # 初始化任务状态
        MATCH_TASKS[task_id] = {
            'status': 'running',
            'progress': 0,
            'message': '正在初始化...',
            'zip_path': zip_path,
            'project_id': project_id,
            'result': None,
            'created_at': datetime.now().isoformat()
        }
        
        # 在后台线程执行匹配（简单实现，实际可用Celery）
        import threading
        
        def run_match():
            try:
                # 创建匹配器
                config = doc_manager.config if hasattr(doc_manager, 'config') else {}
                matcher = create_matcher(config)
                
                # 进度回调
                def progress_callback(progress, message):
                    MATCH_TASKS[task_id]['progress'] = progress
                    MATCH_TASKS[task_id]['message'] = message
                
                # 获取项目名称
                project_name = project_config.get('name') if project_config else None
                
                # 执行匹配
                result = matcher.extract_and_match(
                    zip_path, 
                    project_config,
                    progress_callback,
                    project_name=project_name
                )
                
                # 保存更新后的项目配置
                if project_id and result.get('status') == 'success':
                    doc_manager.save_project(project_config)
                
                MATCH_TASKS[task_id]['result'] = result
                MATCH_TASKS[task_id]['status'] = 'completed' if result.get('status') == 'success' else 'failed'
                MATCH_TASKS[task_id]['message'] = result.get('message', '匹配完成')
                
            except Exception as e:
                MATCH_TASKS[task_id]['status'] = 'failed'
                MATCH_TASKS[task_id]['message'] = str(e)
                MATCH_TASKS[task_id]['result'] = {'status': 'error', 'message': str(e)}
        
        threading.Thread(target=run_match, daemon=True).start()
        
        return jsonify({
            'status': 'success',
            'task_id': task_id,
            'message': '匹配任务已启动'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/zip-match-status', methods=['GET'])
def get_zip_match_status():
    """获取ZIP匹配任务状态"""
    try:
        task_id = request.args.get('task_id')
        
        if not task_id or task_id not in MATCH_TASKS:
            return jsonify({'status': 'error', 'message': '任务不存在'}), 404
        
        task = MATCH_TASKS[task_id]
        
        return jsonify({
            'status': 'success',
            'task_id': task_id,
            'task_status': task['status'],
            'progress': task['progress'],
            'message': task['message'],
            'result': task.get('result')
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/zip-upload', methods=['POST'])
def upload_zip():
    """上传压缩包并自动匹配文档"""
    try:
        from pathlib import Path
        from datetime import datetime
        import uuid
        
        # 优先检查是否有已上传的文件路径（分片上传场景）
        uploaded_file_path = request.form.get('uploaded_file_path')

        if uploaded_file_path:
            # 使用已上传的文件
            temp_zip = Path(uploaded_file_path)
            file = None
            original_filename = temp_zip.name
        else:
            # 普通上传
            file = request.files.get('file')
            if not file:
                return jsonify({'status': 'error', 'message': '未选择文件'}), 400

            # 检查是否为ZIP文件
            if not file.filename.lower().endswith('.zip'):
                return jsonify({'status': 'error', 'message': '请上传ZIP格式的压缩包'}), 400

            # 保存临时ZIP文件
            original_filename = file.filename
            temp_zip = doc_manager.upload_folder / 'temp' / f'{datetime.now().strftime("%Y%m%d%H%M%S")}_{file.filename}'
            temp_zip.parent.mkdir(parents=True, exist_ok=True)
            file.save(str(temp_zip))

        if not temp_zip.exists():
            return jsonify({'status': 'error', 'message': 'ZIP文件不存在'}), 400

        # 获取项目配置
        project_config = request.form.get('project_config')
        if project_config:
            import json as json_module
            project_config = json_module.loads(project_config)

        # 解压并匹配
        result = doc_manager.extract_zipfile(str(temp_zip), project_config or {})

        # 如果解压成功，保存ZIP上传记录到项目JSON
        if result.get('status') == 'success' and project_config:
            project_id = project_config.get('id')
            if project_id:
                # 生成ZIP记录ID
                zip_id = f"zip_{datetime.now().strftime('%Y%m%d%H%M%S')}"
                
                # 获取解压目录（相对于项目uploads目录的路径）
                extracted_dir = result.get('extracted_dir', '')
                project_name = project_config.get('name', '')
                
                # 计算相对路径
                try:
                    from .folder_manager import FolderManager
                    from .base import DocumentConfig
                    folder_manager = FolderManager(DocumentConfig())
                    project_uploads_dir = folder_manager.get_documents_folder(project_name)
                    
                    # 将绝对路径转换为相对于项目uploads目录的路径
                    extract_path = Path(extracted_dir)
                    if extract_path.is_absolute():
                        try:
                            rel_path = extract_path.relative_to(project_uploads_dir)
                            path_for_record = str(rel_path)
                        except ValueError:
                            # 如果无法相对化，使用原始路径
                            path_for_record = str(extracted_dir)
                    else:
                        path_for_record = str(extracted_dir)
                except Exception as e:
                    logger.warning(f"计算相对路径失败: {e}")
                    path_for_record = str(extracted_dir)
                
                # 构建ZIP上传记录
                zip_record = {
                    'id': zip_id,
                    'name': original_filename,
                    'path': path_for_record,
                    'file_count': result.get('total_files', 0),
                    'upload_time': datetime.now().isoformat(),
                    'status': '已完成'
                }
                
                # 保存到项目JSON文件
                project_file = os.path.join(doc_manager.config.projects_base_folder, f"{project_id}.json")
                success = json_file_manager.add_zip_upload_record(project_file, zip_record)
                
                if success:
                    logger.info(f"ZIP上传记录已保存到项目 {project_id}")
                else:
                    logger.error(f"保存ZIP上传记录失败: {project_file}")

        # 不删除临时ZIP，保留以便后续导入使用

        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/list-zip-packages', methods=['GET'])
def list_zip_packages():
    """列出所有已解压的ZIP包（temp_extract下的一级子目录）"""
    try:
        from pathlib import Path
        from app.utils.base import get_config
        config = get_config()
        upload_folder = Path(config.get('upload_folder', 'uploads'))
        temp_extract_dir = upload_folder / 'temp_extract'
        if not temp_extract_dir.exists():
            return jsonify({'status': 'success', 'packages': []})

        packages = []
        for item in sorted(temp_extract_dir.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                # 统计文件数量
                ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                                '.png', '.jpg', '.jpeg', '.tiff', '.txt',
                                '.ppt', '.pptx'}
                file_count = sum(
                    1 for f in item.rglob('*')
                    if f.is_file() and not f.name.startswith('.')
                    and f.suffix.lower() in ALLOWED_EXTS
                )
                packages.append({
                    'name': item.name,
                    'path': str(item),
                    'file_count': file_count
                })

        return jsonify({'status': 'success', 'packages': packages})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/search-zip-files', methods=['GET'])
def search_zip_files():
    """搜索已解压的ZIP包中的文件，支持文件名模糊搜索和指定ZIP包"""
    try:
        from pathlib import Path
        from app.utils.base import get_config
        config = get_config()
        upload_folder = Path(config.get('upload_folder', 'uploads'))
        keyword = request.args.get('keyword', '').strip().lower()
        package_path = request.args.get('package_path', '').strip()  # 指定ZIP包路径
        temp_extract_dir = upload_folder / 'temp_extract'

        if not temp_extract_dir.exists():
            return jsonify({'status': 'success', 'files': [], 'message': '暂无已上传的ZIP文件，请先批量导入ZIP'})

        # 支持的文档格式
        ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                        '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}

        # 确定搜索根目录
        if package_path:
            search_root = Path(package_path)
            # 安全检查：必须在 temp_extract_dir 下
            try:
                search_root.relative_to(temp_extract_dir)
            except ValueError:
                return jsonify({'status': 'error', 'message': '非法路径'}), 400
            if not search_root.exists():
                return jsonify({'status': 'error', 'message': '指定的ZIP包目录不存在'}), 404
        else:
            search_root = temp_extract_dir

        results = []
        for file_path in sorted(search_root.rglob('*')):
            if not file_path.is_file():
                continue
            if file_path.name.startswith('.'):
                continue
            if file_path.suffix.lower() not in ALLOWED_EXTS:
                continue
            # 关键词过滤（空关键词返回全部）
            if keyword and keyword not in file_path.name.lower():
                continue

            try:
                rel_path = file_path.relative_to(temp_extract_dir)
            except ValueError:
                rel_path = file_path.name

            # 检查该文件是否已被归档（通过 original_filename 匹配）
            is_archived = any(
                meta.get('original_filename') == file_path.name or
                meta.get('source_path') == str(file_path)
                for meta in doc_manager.documents_db.values()
            )

            results.append({
                'name': file_path.name,
                'path': str(file_path),
                'rel_path': str(rel_path),
                'size': file_path.stat().st_size,
                'ext': file_path.suffix.lower(),
                'archived': is_archived
            })

            if len(results) >= 300:
                break

        return jsonify({'status': 'success', 'files': results, 'total': len(results)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/delete-zip-package', methods=['POST'])
def delete_zip_package():
    """删除指定的ZIP包及其解压内容"""
    try:
        from pathlib import Path
        import shutil
        from app.utils.base import get_config
        config = get_config()
        upload_folder = Path(config.get('upload_folder', 'uploads'))
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400

        package_path = data.get('package_path')
        if not package_path:
            return jsonify({'status': 'error', 'message': '缺少package_path参数'}), 400

        # 检查是否需要确认删除
        confirm_delete = data.get('confirm_delete', False)

        package_dir = Path(package_path)
        temp_extract_dir = upload_folder / 'temp_extract'

        # 安全检查：必须在 temp_extract_dir 下
        try:
            package_dir.relative_to(temp_extract_dir)
        except ValueError:
            return jsonify({'status': 'error', 'message': '非法路径'}), 400

        if not package_dir.exists():
            return jsonify({'status': 'error', 'message': 'ZIP包目录不存在'}), 404

        # 检查是否有文档引用了该ZIP包中的文件
        referenced_docs = []
        for doc_id, doc in doc_manager.documents_db.items():
            source_path = doc.get('source_path') or doc.get('original_path')
            if source_path and package_path in source_path:
                referenced_docs.append({
                    'id': doc_id,
                    'doc_name': doc.get('doc_name'),
                    'cycle': doc.get('cycle'),
                    'filename': doc.get('filename')
                })

        # 检查项目配置中的引用
        if hasattr(doc_manager, 'projects') and doc_manager.projects:
            for project_id, project_data in doc_manager.projects.projects_db.items():
                if 'documents' in project_data:
                    for cycle, cycle_info in project_data['documents'].items():
                        if 'uploaded_docs' in cycle_info:
                            for doc in cycle_info['uploaded_docs']:
                                source_path = doc.get('source_path') or doc.get('original_path')
                                if source_path and package_path in source_path:
                                    referenced_docs.append({
                                        'id': doc.get('doc_id'),
                                        'doc_name': doc.get('doc_name'),
                                        'cycle': cycle,
                                        'filename': doc.get('filename')
                                    })

        if not confirm_delete and referenced_docs:
            return jsonify({
                'status': 'warning',
                'message': f'该ZIP包中的文件被 {len(referenced_docs)} 个文档引用',
                'referenced_docs': referenced_docs,
                'need_confirm': True
            })

        # 删除目录
        shutil.rmtree(package_dir)

        return jsonify({
            'status': 'success',
            'message': 'ZIP包删除成功'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/directories', methods=['GET'])
def list_directories():
    """获取文件目录列表"""
    try:
        from pathlib import Path
        from app.utils.base import get_config
        config = get_config()
        upload_folder = Path(config.get('upload_folder', 'uploads'))
        
        # 定义目录列表
        directories = [
            {"id": "temp", "name": "临时上传目录", "path": str(upload_folder / "temp")},
            {"id": "temp_extract", "name": "解压文件目录", "path": str(upload_folder / "temp_extract")},
            {"id": "projects", "name": "项目文件目录", "path": str(upload_folder / "projects")}
        ]
        
        # 确保目录存在
        for directory in directories:
            dir_path = Path(directory["path"])
            dir_path.mkdir(parents=True, exist_ok=True)
        
        return jsonify({
            "status": "success",
            "data": directories
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/files/search-imported', methods=['GET'])
def search_imported_files():
    """搜索导入的文件"""
    try:
        from pathlib import Path
        from app.utils.base import get_config
        config = get_config()
        upload_folder = Path(config.get('upload_folder', 'uploads'))
        
        keyword = request.args.get('keyword', '').strip().lower()
        directory = request.args.get('directory', 'temp')
        
        # 确定搜索目录
        search_dirs = {
            'temp': upload_folder / 'temp',
            'temp_extract': upload_folder / 'temp_extract',
            'projects': upload_folder / 'projects'
        }
        
        search_path = search_dirs.get(directory, upload_folder / 'temp')
        if not search_path.exists():
            search_path.mkdir(parents=True, exist_ok=True)
        
        # 支持的文档格式
        ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                        '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}
        
        results = []
        for file_path in sorted(search_path.rglob('*')):
            if not file_path.is_file():
                continue
            if file_path.name.startswith('.'):
                continue
            if file_path.suffix.lower() not in ALLOWED_EXTS:
                continue
            # 关键词过滤（空关键词返回全部）
            if keyword and keyword not in file_path.name.lower():
                continue
            
            try:
                rel_path = file_path.relative_to(upload_folder)
            except ValueError:
                rel_path = file_path.name
            
            # 检查该文件是否已被归档（通过 original_filename 匹配）
            is_archived = any(
                meta.get('original_filename') == file_path.name or
                meta.get('source_path') == str(file_path)
                for meta in doc_manager.documents_db.values()
            )
            
            results.append({
                'id': str(file_path),
                'name': file_path.name,
                'path': str(file_path),
                'rel_path': str(rel_path),
                'size': file_path.stat().st_size,
                'ext': file_path.suffix.lower(),
                'archived': is_archived
            })
            
            if len(results) >= 300:
                break
        
        return jsonify({
            "status": "success",
            "data": results,
            "total": len(results)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@document_bp.route('/files/select-imported', methods=['POST'])
def select_imported_files():
    """选择导入的文件进行归档"""
    try:
        data = request.get_json()
        files = data.get('files', [])
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        project_id = data.get('project_id')
        project_name = data.get('project_name')
        
        if not files or not cycle or not doc_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        selected_files = []
        for file_info in files:
            file_path = Path(file_info.get('path'))
            if not file_path.exists():
                continue
            
            # 处理文件选择逻辑
            # 这里可以根据需要实现具体的文件处理
            selected_files.append({
                'name': file_info.get('name'),
                'path': str(file_path)
            })
        
        return jsonify({
            "status": "success",
            "message": f"成功选择 {len(selected_files)} 个文件",
            "data": selected_files
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
        if hasattr(doc_manager, 'projects') and doc_manager.projects:
            for project_id, project_data in doc_manager.projects.projects_db.items():
                if 'documents' in project_data:
                    for cycle, cycle_info in project_data['documents'].items():
                        if 'uploaded_docs' in cycle_info:
                            for doc in cycle_info['uploaded_docs']:
                                source_path = doc.get('source_path') or doc.get('original_path')
                                if source_path and package_path in source_path:
                                    referenced_docs.append({
                                        'id': doc.get('doc_id'),
                                        'doc_name': doc.get('doc_name'),
                                        'cycle': cycle,
                                        'filename': doc.get('filename'),
                                        'project_id': project_id
                                    })

        # 如果有引用记录，且用户未确认删除，返回引用信息
        if referenced_docs and not confirm_delete:
            return jsonify({
                'status': 'warning',
                'message': '该ZIP包中有文件被文档引用',
                'referenced_docs': referenced_docs,
                'total_references': len(referenced_docs)
            }), 200

        # 用户确认删除，删除ZIP包目录
        shutil.rmtree(package_dir)

        # 删除相关的引用记录
        if referenced_docs:
            # 从内存中的documents_db删除引用
            for doc in referenced_docs:
                if doc['id'] in doc_manager.documents_db:
                    del doc_manager.documents_db[doc['id']]

            # 从项目配置中删除引用
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                for project_id, project_data in doc_manager.projects.projects_db.items():
                    if 'documents' in project_data:
                        for cycle, cycle_info in project_data['documents'].items():
                            if 'uploaded_docs' in cycle_info:
                                # 过滤掉引用了被删除ZIP包的文档
                                cycle_info['uploaded_docs'] = [
                                    doc for doc in cycle_info['uploaded_docs']
                                    if not (doc.get('source_path') and package_path in doc.get('source_path'))
                                ]
                        # 保存更新后的项目配置
                        doc_manager.projects.save(project_id, project_data)

        return jsonify({
            'status': 'success', 
            'message': 'ZIP包删除成功',
            'deleted_references': len(referenced_docs)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/list-imported', methods=['GET'])
def list_imported_documents():
    """获取历史导入文档列表"""
    try:
        from pathlib import Path
        from app.utils.base import get_config
        config = get_config()
        upload_folder = Path(config.get('upload_folder', 'uploads'))
        temp_extract_dir = upload_folder / 'temp_extract'
        
        if not temp_extract_dir.exists():
            return jsonify({'status': 'success', 'data': []})

        # 支持的文档格式
        ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                        '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}

        results = []
        for file_path in sorted(temp_extract_dir.rglob('*')):
            if not file_path.is_file():
                continue
            if file_path.name.startswith('.'):
                continue
            if file_path.suffix.lower() not in ALLOWED_EXTS:
                continue

            try:
                rel_path = file_path.relative_to(temp_extract_dir)
            except ValueError:
                rel_path = file_path.name

            # 检查该文件是否已被归档（通过 original_filename 匹配）
            is_archived = any(
                meta.get('original_filename') == file_path.name or
                meta.get('source_path') == str(file_path)
                for meta in doc_manager.documents_db.values()
            )

            results.append({
                'name': file_path.name,
                'path': str(file_path),
                'rel_path': str(rel_path),
                'size': file_path.stat().st_size,
                'ext': file_path.suffix.lower(),
                'archived': is_archived
            })

        return jsonify({'status': 'success', 'data': results, 'total': len(results)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/search-imported', methods=['GET'])
def search_imported_documents():
    """搜索历史导入文档"""
    try:
        from pathlib import Path
        from app.utils.base import get_config
        config = get_config()
        upload_folder = Path(config.get('upload_folder', 'uploads'))
        keyword = request.args.get('keyword', '').strip().lower()
        temp_extract_dir = upload_folder / 'temp_extract'

        if not temp_extract_dir.exists():
            return jsonify({'status': 'success', 'data': [], 'message': '暂无已上传的文档'})

        # 支持的文档格式
        ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                        '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}

        results = []
        for file_path in sorted(temp_extract_dir.rglob('*')):
            if not file_path.is_file():
                continue
            if file_path.name.startswith('.'):
                continue
            if file_path.suffix.lower() not in ALLOWED_EXTS:
                continue
            # 关键词过滤（空关键词返回全部）
            if keyword and keyword not in file_path.name.lower():
                continue

            try:
                rel_path = file_path.relative_to(temp_extract_dir)
            except ValueError:
                rel_path = file_path.name

            # 检查该文件是否已被归档（通过 original_filename 匹配）
            is_archived = any(
                meta.get('original_filename') == file_path.name or
                meta.get('source_path') == str(file_path)
                for meta in doc_manager.documents_db.values()
            )

            results.append({
                'name': file_path.name,
                'path': str(file_path),
                'rel_path': str(rel_path),
                'size': file_path.stat().st_size,
                'ext': file_path.suffix.lower(),
                'archived': is_archived
            })

        return jsonify({'status': 'success', 'data': results, 'total': len(results)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/archive-from-zip', methods=['POST'])
def archive_from_zip():
    """从已解压的ZIP包中直接归档指定文件"""
    try:
        from pathlib import Path
        import shutil
        from datetime import datetime
        
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400

        source_path = data.get('source_path')
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        doc_date = data.get('doc_date', '')
        sign_date = data.get('sign_date', '')
        signer = data.get('signer', '')
        no_signature = data.get('no_signature', False)
        has_seal = data.get('has_seal', False)
        party_a_seal = data.get('party_a_seal', False)
        party_b_seal = data.get('party_b_seal', False)
        no_seal = data.get('no_seal', False)
        other_seal = data.get('other_seal', '')
        project_id = data.get('project_id')

        if not all([source_path, cycle, doc_name]):
            return jsonify({'status': 'error', 'message': '参数不完整：需要source_path、cycle、doc_name'}), 400

        source_file = Path(source_path)
        if not source_file.exists():
            return jsonify({'status': 'error', 'message': f'源文件不存在: {source_path}'}), 404

        # 构建目标目录（与普通上传保持一致）
        cycle_folder = doc_manager.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
        cycle_folder.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_ext = source_file.suffix
        new_filename = f"{signer or 'zip'}_{timestamp}{file_ext}"
        dest_path = cycle_folder / new_filename

        shutil.copy2(str(source_file), str(dest_path))

        # 检测签字和盖章（图片文件）
        detected_signature = False
        detected_seal = False
        if file_ext.lower() in ['.png', '.jpg', '.jpeg', '.tiff']:
            detected_signature, _ = doc_manager.detect_signature(str(dest_path))
            detected_seal, _ = doc_manager.detect_seal(str(dest_path))

        # 保存文档元数据
        metadata = {
            'cycle': cycle,
            'doc_name': doc_name,
            'filename': new_filename,
            'original_filename': source_file.name,
            'file_path': str(dest_path),
            'doc_date': doc_date,
            'sign_date': sign_date,
            'signer': signer,
            'no_signature': no_signature,
            'has_seal_marked': has_seal,
            'party_a_seal': party_a_seal,
            'party_b_seal': party_b_seal,
            'no_seal': no_seal,
            'other_seal': other_seal,
            'upload_time': datetime.now().isoformat(),
            'source': 'zip',
            'detected_signature': detected_signature,
            'sign_confidence': 0.0,
            'detected_seal': detected_seal,
            'seal_confidence': 0.0,
            'file_size': dest_path.stat().st_size
        }

        doc_id = f"{cycle}_{doc_name}_{timestamp}"
        doc_manager.documents_db[doc_id] = metadata

        # ===== 保存到项目配置 =====
        # 确保 documents[cycle][doc_name].uploaded_docs 存在
        if project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result['status'] == 'success':
                project_config = project_result['project']
                if 'documents' not in project_config:
                    project_config['documents'] = {}
                if cycle not in project_config['documents']:
                    project_config['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
                if 'uploaded_docs' not in project_config['documents'][cycle]:
                    project_config['documents'][cycle]['uploaded_docs'] = []
                
                # 添加到 uploaded_docs
                project_config['documents'][cycle]['uploaded_docs'].append({
                    'doc_name': doc_name,
                    'filename': new_filename,
                    'original_filename': source_file.name,
                    'file_path': str(dest_path),
                    'doc_date': doc_date,
                    'sign_date': sign_date,
                    'signer': signer,
                    'has_seal': has_seal or detected_seal,
                    'upload_time': datetime.now().isoformat(),
                    'source': 'zip',
                    'doc_id': doc_id
                })
                
                # 保存项目配置
                doc_manager._save_project(project_id, project_config)

        doc_manager.log_operation('从ZIP归档文档', f'{cycle}/{doc_name} <- {source_file.name}',
                                   project=project_id)
        return jsonify({'status': 'success', 'message': '文档归档成功', 'doc_id': doc_id, 'metadata': metadata})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/pending-files', methods=['GET'])
def get_pending_files():
    """获取当前项目的待确认文件列表"""
    try:
        project_id = request.args.get('project_id', '')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        pending_list = doc_manager.pending_files.get(project_id, [])
        return jsonify({
            'status': 'success',
            'pending_files': pending_list,
            'count': len(pending_list)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/confirm-pending', methods=['POST'])
def confirm_pending_files():
    """确认并归档待确认的文件"""
    try:
        from pathlib import Path
        import shutil
        from datetime import datetime
        
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400
        
        project_id = data.get('project_id')
        file_ids = data.get('file_ids', [])  # 要确认的文件索引列表
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        pending_list = doc_manager.pending_files.get(project_id, [])
        
        # 确认的文件
        confirmed_files = []
        for idx in file_ids:
            if 0 <= idx < len(pending_list):
                file_info = pending_list[idx]
                
                # 调用归档逻辑
                source_path = file_info.get('source_path')
                cycle = file_info.get('cycle')
                doc_name = file_info.get('doc_name')
                filename = file_info.get('filename')
                
                if source_path and cycle and doc_name:
                    source_file = Path(source_path)
                    if source_file.exists():
                        # 复制文件到正式目录
                        cycle_folder = doc_manager.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
                        cycle_folder.mkdir(parents=True, exist_ok=True)
                        
                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                        file_ext = source_file.suffix
                        new_filename = f"zip_{timestamp}{file_ext}"
                        dest_path = cycle_folder / new_filename
                        
                        shutil.copy2(str(source_file), str(dest_path))
                        
                        # 记录到已确认文件
                        if project_id not in doc_manager.confirmed_files:
                            doc_manager.confirmed_files[project_id] = set()
                        doc_manager.confirmed_files[project_id].add((cycle, doc_name, filename))
                        
                        # 添加到项目配置
                        project_result = doc_manager.load_project(project_id)
                        if project_result['status'] == 'success':
                            project_config = project_result['project']
                            if 'documents' not in project_config:
                                project_config['documents'] = {}
                            if cycle not in project_config['documents']:
                                project_config['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
                            if 'uploaded_docs' not in project_config['documents'][cycle]:
                                project_config['documents'][cycle]['uploaded_docs'] = []
                            
                            # 如果 cycles 数组中没有这个周期，自动添加进去
                            if 'cycles' not in project_config:
                                project_config['cycles'] = []
                            if cycle not in project_config['cycles']:
                                project_config['cycles'].append(cycle)
                            
                            doc_id = f"{cycle}_{doc_name}_{timestamp}"
                            project_config['documents'][cycle]['uploaded_docs'].append({
                                'doc_name': doc_name,
                                'filename': new_filename,
                                'original_filename': filename,
                                'file_path': str(dest_path),
                                'doc_date': '',
                                'sign_date': '',
                                'signer': '',
                                'has_seal': False,
                                'upload_time': datetime.now().isoformat(),
                                'source': 'zip',
                                'doc_id': doc_id
                            })
                            
                            doc_manager._save_project(project_id, project_config)
                        
                        confirmed_files.append({
                            'cycle': cycle,
                            'doc_name': doc_name,
                            'filename': filename
                        })
        
        # 从待确认列表中移除已确认的文件
        confirmed_count = len(confirmed_files)
        # 按索引倒序删除，避免索引偏移
        for idx in sorted(file_ids, reverse=True):
            if 0 <= idx < len(doc_manager.pending_files[project_id]):
                del doc_manager.pending_files[project_id][idx]
        
        return jsonify({
            'status': 'success',
            'message': f'成功确认 {confirmed_count} 个文件',
            'confirmed_files': confirmed_files
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/reject-pending', methods=['POST'])
def reject_pending_files():
    """拒绝待确认的文件（仅从待确认列表移除，不归档）"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400
        
        project_id = data.get('project_id')
        file_ids = data.get('file_ids', [])
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        rejected_count = 0
        for idx in sorted(file_ids, reverse=True):
            if 0 <= idx < len(doc_manager.pending_files.get(project_id, [])):
                del doc_manager.pending_files[project_id][idx]
                rejected_count += 1
        
        return jsonify({
            'status': 'success',
            'message': f'已拒绝 {rejected_count} 个文件',
            'rejected_count': rejected_count
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>/check', methods=['POST'])
def check_doc_compliance(doc_id):
    """检查文档是否符合要求"""
    try:
        data = request.get_json()
        requirement = data.get('requirement', '')
        
        result = doc_manager.check_document_compliance(doc_id, requirement)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/compliance', methods=['POST'])
def check_all_compliance():
    """检查项目异常：显示未完成的任务，用颜色区别"""
    try:
        data = request.get_json()
        project_config = data.get('project_config', {})
        
        results = {}
        
        for cycle, docs_info in project_config.get('documents', {}).items():
            results[cycle] = []
            
            for doc in docs_info.get('required_docs', []):
                doc_name = doc['name']
                requirement = doc.get('requirement', '')
                
                # 查找该文档下的所有上传文件
                docs = doc_manager.get_documents(cycle=cycle, doc_name=doc_name)
                
                cycle_doc_result = {
                    'doc_name': doc_name,
                    'requirement': requirement,
                    'uploaded_count': len(docs),
                    'status': 'not_uploaded',  # not_uploaded, partial, complete
                    'documents': []
                }
                
                if len(docs) == 0:
                    # 没有上传任何文档
                    cycle_doc_result['status'] = 'not_uploaded'
                else:
                    # 有上传文档，检查合规性
                    all_compliant = True
                    for doc_meta in docs:
                        compliance = doc_manager.check_document_compliance(
                            doc_meta['id'], requirement
                        )
                        is_compliant = compliance.get('is_compliant', False)
                        if not is_compliant:
                            all_compliant = False
                        cycle_doc_result['documents'].append({
                            'id': doc_meta['id'],
                            'filename': doc_meta.get('original_filename'),
                            'is_compliant': is_compliant,
                            'issues': compliance.get('issues', [])
                        })
                    
                    if all_compliant:
                        cycle_doc_result['status'] = 'complete'
                    else:
                        cycle_doc_result['status'] = 'partial'
                
                results[cycle].append(cycle_doc_result)
        
        return jsonify({
            'status': 'success',
            'data': results
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/init', methods=['POST'])
def init_upload():
    """初始化分片上传，返回上传ID"""
    try:
        from pathlib import Path
        import uuid
        
        data = request.get_json()
        filename = data.get('filename')
        total_chunks = data.get('total_chunks')
        file_size = data.get('file_size')
        
        if not filename or not total_chunks:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 生成唯一的上传ID
        upload_id = str(uuid.uuid4())
        
        # 创建临时分片目录
        temp_folder = Path(app.config['TEMP_FOLDER']) / upload_id if 'app' in globals() else doc_manager.upload_folder / 'temp_chunks' / upload_id
        temp_folder.mkdir(parents=True, exist_ok=True)
        
        # 存储上传元数据
        doc_manager.upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        doc_manager.upload_sessions[upload_id] = {
            'filename': filename,
            'total_chunks': total_chunks,
            'file_size': file_size,
            'uploaded_chunks': [],
            'temp_folder': str(temp_folder),
            'init_time': datetime.now().isoformat()
        }
        
        return jsonify({
            'status': 'success',
            'upload_id': upload_id,
            'message': '上传会话已创建'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/chunk', methods=['POST'])
def upload_chunk():
    """上传单个分片"""
    try:
        from pathlib import Path
        
        upload_id = request.form.get('upload_id')
        chunk_index = int(request.form.get('chunk_index', 0))
        file = request.files.get('file')
        
        if not upload_id or not file:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 检查上传会话是否存在
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id not in upload_sessions:
            return jsonify({'status': 'error', 'message': '上传会话不存在或已过期'}), 400
        
        session = upload_sessions[upload_id]
        temp_folder = Path(session['temp_folder'])
        
        # 保存分片文件
        chunk_filename = f"chunk_{chunk_index:05d}"
        chunk_path = temp_folder / chunk_filename
        file.save(str(chunk_path))
        
        # 记录已上传的分片
        if chunk_index not in session['uploaded_chunks']:
            session['uploaded_chunks'].append(chunk_index)
            session['uploaded_chunks'].sort()
        
        # 计算进度
        progress = len(session['uploaded_chunks']) / session['total_chunks'] * 100
        
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{session["total_chunks"]} 上传成功',
            'chunk_index': chunk_index,
            'total_chunks': session['total_chunks'],
            'uploaded_count': len(session['uploaded_chunks']),
            'progress': round(progress, 2)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/check', methods=['GET'])
def check_upload():
    """检查已上传的分片（断点续传用）"""
    try:
        upload_id = request.args.get('upload_id')
        
        if not upload_id:
            return jsonify({'status': 'error', 'message': '缺少upload_id'}), 400
        
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id not in upload_sessions:
            return jsonify({'status': 'error', 'message': '上传会话不存在'}), 400
        
        session = upload_sessions[upload_id]
        
        return jsonify({
            'status': 'success',
            'uploaded_chunks': session['uploaded_chunks'],
            'total_chunks': session['total_chunks'],
            'filename': session['filename']
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/merge', methods=['POST'])
def merge_chunks():
    """合并所有分片，完成上传"""
    try:
        from pathlib import Path
        import shutil
        from datetime import datetime
        
        data = request.get_json()
        upload_id = data.get('upload_id')
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category', '')
        doc_date = data.get('doc_date')
        sign_date = data.get('sign_date')
        signer = data.get('signer')
        has_seal = data.get('has_seal', False)
        party_a_seal = data.get('party_a_seal', False)
        party_b_seal = data.get('party_b_seal', False)
        other_seal = data.get('other_seal', '')
        project_id = data.get('project_id', None)
        
        if not upload_id:
            return jsonify({'status': 'error', 'message': '缺少upload_id'}), 400
        
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id not in upload_sessions:
            return jsonify({'status': 'error', 'message': '上传会话不存在'}), 400
        
        session = upload_sessions[upload_id]
        temp_folder = Path(session['temp_folder'])
        
        # 检查是否所有分片都已上传
        expected_chunks = session['total_chunks']
        uploaded_chunks = len(session['uploaded_chunks'])
        
        if uploaded_chunks != expected_chunks:
            return jsonify({
                'status': 'error', 
                'message': f'分片未全部上传: {uploaded_chunks}/{expected_chunks}'
            }), 400
        
        # 合并分片
        original_filename = session['filename']
        file_ext = Path(original_filename).suffix
        
        # 创建最终文件
        final_folder = temp_folder / 'merged'
        final_folder.mkdir(parents=True, exist_ok=True)
        final_file = final_folder / f"merged_{datetime.now().strftime('%Y%m%d%H%M%S')}{file_ext}"
        
        # 按顺序合并所有分片
        with open(final_file, 'wb') as outfile:
            for i in range(expected_chunks):
                chunk_path = temp_folder / f"chunk_{i:05d}"
                if chunk_path.exists():
                    with open(chunk_path, 'rb') as infile:
                        outfile.write(infile.read())
        
        # 创建一个模拟的file对象用于upload_document
        class ChunkedFile:
            def __init__(self, path):
                self.filename = original_filename
                self._path = path
            
            def save(self, path):
                shutil.copy2(self._path, path)
        
        chunked_file = ChunkedFile(final_file)

        # 如果是临时ZIP文件（以_temp_或_blank_开头），不执行upload_document，直接返回文件路径
        if cycle == '_temp_' or doc_name.startswith('_temp_'):
            # 返回文件路径供后续处理
            return jsonify({
                'status': 'success',
                'message': '文件合并完成',
                'file_path': str(final_file),
                'filename': original_filename
            })

        # 调用现有的上传文档方法
        result = doc_manager.upload_document(
            chunked_file, cycle, doc_name,
            doc_date, sign_date, signer, False,
            has_seal, party_a_seal, party_b_seal, False, other_seal,
            project_id, category
        )

        # 清理临时文件
        if temp_folder.exists():
            shutil.rmtree(temp_folder)

        # 删除上传会话
        del upload_sessions[upload_id]

        return jsonify({
            'status': 'success',
            'message': '文件上传完成',
            'doc_id': result.get('doc_id'),
            'metadata': result.get('metadata')
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/cancel', methods=['POST'])
def cancel_upload():
    """取消上传，清理临时文件"""
    try:
        from pathlib import Path
        import shutil
        
        data = request.get_json()
        upload_id = data.get('upload_id')
        
        if not upload_id:
            return jsonify({'status': 'error', 'message': '缺少upload_id'}), 400
        
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id in upload_sessions:
            session = upload_sessions[upload_id]
            temp_folder = Path(session.get('temp_folder'))
            
            # 清理临时文件
            if temp_folder.exists():
                shutil.rmtree(temp_folder)
            
            del upload_sessions[upload_id]
        
        return jsonify({
            'status': 'success',
            'message': '上传已取消'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/report', methods=['POST'])
def generate_report():
    """生成报告"""
    try:
        project_config = request.get_json().get('project_config')
        if not project_config:
            return jsonify({'status': 'error', 'message': '未提供项目配置'}), 400
        
        report = doc_manager.generate_report(project_config)
        
        return jsonify({
            'status': 'success',
            'data': report
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
