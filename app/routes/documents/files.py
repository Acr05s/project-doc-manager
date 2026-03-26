"""文件搜索和选择相关路由"""

from flask import request, jsonify
from pathlib import Path
from datetime import datetime
from .utils import get_doc_manager


def get_directories():
    """获取项目的文档包目录列表（扫描 projects/{项目名}/uploads/ 下的子目录）"""
    try:
        doc_manager = get_doc_manager()
        project_id = request.args.get('project_id')
        project_name = request.args.get('project_name')
        
        if not project_id and not project_name:
            return jsonify({'status': 'error', 'message': '缺少项目参数'}), 400
        
        # 如果只有 project_id，先查项目名
        if not project_name and project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result and project_result.get('status') == 'success':
                project_name = project_result.get('project', {}).get('name', '')
        
        if not project_name:
            return jsonify({'status': 'success', 'directories': []})
        
        # 扫描 projects/{项目名}/uploads/ 下的一级子目录
        project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
        project_uploads_dir.mkdir(parents=True, exist_ok=True)
        
        ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                        '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}
        
        directories = []
        if project_uploads_dir.exists():
            for item in sorted(project_uploads_dir.iterdir()):
                if item.is_dir() and not item.name.startswith('.'):
                    file_count = sum(
                        1 for f in item.rglob('*')
                        if f.is_file() and not f.name.startswith('.')
                        and f.suffix.lower() in ALLOWED_EXTS
                    )
                    directories.append({
                        'id': str(item),        # 完整绝对路径，供搜索时用
                        'name': f"{item.name}（{file_count}个文件）"
                    })
        
        return jsonify({
            'status': 'success',
            'directories': directories
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def search_files():
    """搜索文件"""
    try:
        doc_manager = get_doc_manager()
        project_id = request.args.get('project_id')
        project_name = request.args.get('project_name')
        directory = request.args.get('directory', '').strip()  # 可以是绝对路径或相对路径
        keyword = request.args.get('keyword', '').strip().lower()
        
        if not project_id and not project_name:
            return jsonify({'status': 'error', 'message': '缺少项目参数'}), 400
        
        # 如果只有 project_id，查项目名
        if not project_name and project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result and project_result.get('status') == 'success':
                project_name = project_result.get('project', {}).get('name', '')
        
        # 确定搜索目录
        if directory:
            search_dir = Path(directory)
            # 如果是绝对路径直接用，否则拼接项目目录
            if not search_dir.is_absolute() and project_name:
                docs_folder = doc_manager.get_documents_folder(project_name)
                search_dir = docs_folder / directory
        elif project_name:
            # 默认搜索项目 uploads 目录
            search_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
        else:
            return jsonify({'status': 'error', 'message': '缺少搜索目录'}), 400
        
        if not search_dir.exists():
            return jsonify({'status': 'success', 'files': [], 'total': 0})
        
        # 支持的文件类型
        allowed_exts = {'.pdf', '.doc', '.docx', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}
        
        # 搜索文件
        files = []
        for file_path in sorted(search_dir.rglob('*')):
            if not file_path.is_file() or file_path.name.startswith('.'):
                continue
            if file_path.suffix.lower() not in allowed_exts:
                continue
            if keyword and keyword not in file_path.name.lower():
                continue
            
            # 检查是否已被其他文档使用
            is_used = any(
                meta.get('file_path') == str(file_path) or 
                meta.get('original_filename') == file_path.name
                for meta in doc_manager.documents_db.values()
            )
            
            files.append({
                'id': str(file_path),
                'name': file_path.name,
                'path': str(file_path),
                'rel_path': file_path.name,
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


def select_files():
    """选择文件进行归档"""
    try:
        doc_manager = get_doc_manager()
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
            
            # 提取目录信息
            directory = ''
            if project_name:
                # 获取项目上传目录
                project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
                try:
                    # 计算相对路径作为目录
                    relative_path = file_path.relative_to(project_uploads_dir)
                    if len(relative_path.parts) > 1:
                        # 如果文件在子目录中，取第一个目录作为directory
                        directory = relative_path.parts[0]
                except ValueError:
                    # 如果文件不在项目上传目录中，使用空目录
                    pass
            
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
                'doc_id': doc_id,
                'directory': directory
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
