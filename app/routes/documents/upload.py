"""文档上传相关路由"""

from flask import request, jsonify
from pathlib import Path
from datetime import datetime
from .utils import get_doc_manager

# 分片上传配置
UPLOAD_TEMP_FOLDER = Path('uploads/temp_chunks')
UPLOAD_TEMP_FOLDER.mkdir(parents=True, exist_ok=True)


def upload_document():
    """上传文档"""
    try:
        doc_manager = get_doc_manager()
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
                'doc_id': doc_id,
                'directory': result.get('directory', '')
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


def upload_chunk():
    """上传分片"""
    try:
        file = request.files.get('file')
        chunk_index = request.form.get('chunkIndex', type=int)
        total_chunks = request.form.get('totalChunks', type=int)
        file_name = request.form.get('fileName')
        cycle = request.form.get('cycle')
        doc_name = request.form.get('doc_name')
        project_id = request.form.get('project_id')
        project_name = request.form.get('project_name')
        
        # 检查必要参数（注意：chunk_index 可能为 0，不能用 all()）
        if file is None or chunk_index is None or total_chunks is None or not file_name or not cycle or not doc_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 生成临时文件路径
        temp_dir = UPLOAD_TEMP_FOLDER / f"{cycle}_{doc_name}_{file_name}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = temp_dir / f"chunk_{chunk_index}"
        
        # 保存分片
        file.save(str(chunk_path))
        
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{total_chunks} 上传成功'
        })
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def merge_chunks():
    """合并分片"""
    try:
        doc_manager = get_doc_manager()
        file_name = request.form.get('fileName')
        cycle = request.form.get('cycle')
        doc_name = request.form.get('doc_name')
        total_chunks = request.form.get('totalChunks', type=int)
        doc_date = request.form.get('doc_date')
        sign_date = request.form.get('sign_date')
        signer = request.form.get('signer')
        no_signature = request.form.get('no_signature', 'false').lower() == 'true'
        has_seal = request.form.get('has_seal', 'false').lower() == 'true'
        party_a_seal = request.form.get('party_a_seal', 'false').lower() == 'true'
        party_b_seal = request.form.get('party_b_seal', 'false').lower() == 'true'
        no_seal = request.form.get('no_seal', 'false').lower() == 'true'
        other_seal = request.form.get('other_seal', '')
        project_id = request.form.get('project_id')
        project_name = request.form.get('project_name')
        
        if not all([file_name, cycle, doc_name, total_chunks]):
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 读取所有分片
        temp_dir = UPLOAD_TEMP_FOLDER / f"{cycle}_{doc_name}_{file_name}"
        if not temp_dir.exists():
            return jsonify({'status': 'error', 'message': '分片不存在'}), 400
        
        # 合并分片 - 使用临时文件避免内存占用
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as temp_file:
            temp_file_path = temp_file.name
            
        try:
            with open(temp_file_path, 'wb') as merged_file:
                for i in range(total_chunks):
                    chunk_path = temp_dir / f"chunk_{i}"
                    if not chunk_path.exists():
                        return jsonify({'status': 'error', 'message': f'分片 {i} 不存在'}), 400
                    with open(chunk_path, 'rb') as f:
                        # 分块读取以减少内存使用
                        while True:
                            chunk_data = f.read(8192)  # 8KB chunks
                            if not chunk_data:
                                break
                            merged_file.write(chunk_data)
            
            # 重新打开临时文件进行读取
            with open(temp_file_path, 'rb') as f:
                merged_file_content = f.read()
        
        # 上传合并后的文件
        from werkzeug.datastructures import FileStorage
        import io
        file = FileStorage(io.BytesIO(merged_file_content), filename=file_name)
        
        # 清理临时文件
        import os
        os.unlink(temp_file_path)
        
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
        
        # 清理临时文件
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        # 上传成功后，将文档添加到documents_db中
        if result.get('status') == 'success':
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
                'doc_id': doc_id,
                'directory': result.get('directory', '')
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


def get_upload_progress():
    """获取上传进度"""
    try:
        # 这里可以实现上传进度的获取逻辑
        # 例如，检查临时目录中的分片数量
        return jsonify({
            'status': 'success',
            'progress': 100
        })
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def upload_zip_chunk():
    """上传ZIP文件分片"""
    try:
        file = request.files.get('chunk')
        chunk_index = request.form.get('chunkIndex', type=int)
        total_chunks = request.form.get('totalChunks', type=int)
        file_name = request.form.get('filename')
        file_id = request.form.get('fileId')
        
        # 检查必要参数（注意：chunk_index 可能为 0，不能用 all()）
        if file is None or chunk_index is None or total_chunks is None or not file_name or not file_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 生成临时文件路径
        temp_dir = UPLOAD_TEMP_FOLDER / file_id
        temp_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = temp_dir / f"chunk_{chunk_index}"
        
        # 保存分片
        file.save(str(chunk_path))
        
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{total_chunks} 上传成功'
        })
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def merge_zip_chunks():
    """合并ZIP文件分片"""
    try:
        data = request.get_json()
        file_name = data.get('filename')
        file_id = data.get('fileId')
        
        if not all([file_name, file_id]):
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 读取所有分片
        temp_dir = UPLOAD_TEMP_FOLDER / file_id
        if not temp_dir.exists():
            return jsonify({'status': 'error', 'message': '分片不存在'}), 400
        
        # 合并分片 - 使用临时文件避免内存占用
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as temp_file:
            temp_file_path = temp_file.name
            
        try:
            with open(temp_file_path, 'wb') as merged_file:
                # 找出所有分片文件并按索引排序
                chunk_files = []
                for chunk_file in temp_dir.iterdir():
                    if chunk_file.name.startswith('chunk_'):
                        try:
                            chunk_index = int(chunk_file.name.split('_')[1])
                            chunk_files.append((chunk_index, chunk_file))
                        except:
                            pass
                
                # 按索引排序
                chunk_files.sort(key=lambda x: x[0])
                
                # 合并所有分片
                for chunk_index, chunk_file in chunk_files:
                    with open(chunk_file, 'rb') as f:
                        # 分块读取以减少内存使用
                        while True:
                            chunk_data = f.read(8192)  # 8KB chunks
                            if not chunk_data:
                                break
                            merged_file.write(chunk_data)
            
            # 读取合并后的内容
            with open(temp_file_path, 'rb') as f:
                merged_content = f.read()
        
        # 保存合并后的ZIP文件
        import uuid
        zip_save_dir = Path('uploads/zip')
        zip_save_dir.mkdir(parents=True, exist_ok=True)
        zip_file_path = zip_save_dir / f"{file_id}_{file_name}"
        
        with open(zip_file_path, 'wb') as f:
            f.write(merged_content)
        
        # 清理临时文件
        import os
        os.unlink(temp_file_path)
        
        # 清理分片临时目录
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        return jsonify({
            'status': 'success',
            'file_path': str(zip_file_path)
        })
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
