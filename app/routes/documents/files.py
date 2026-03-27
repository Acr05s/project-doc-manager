"""文件搜索和选择相关路由"""

from flask import request, jsonify
from pathlib import Path
from datetime import datetime
from .utils import get_doc_manager


def get_directories():
    """获取项目的文档包目录列表（只从 zip_uploads.json 读取，使用相对路径）"""
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
        
        # 项目上传目录
        project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
        
        directories = []
        
        # 只从 zip_uploads.json 读取记录
        zip_uploads_file = doc_manager.config.projects_base_folder / project_name / 'zip_uploads.json'
        if zip_uploads_file.exists():
            import json
            try:
                with open(zip_uploads_file, 'r', encoding='utf-8') as f:
                    zip_uploads = json.load(f)
                
                # 获取 uploads 目录下所有子目录
                existing_dirs = {}
                if project_uploads_dir.exists():
                    for item in project_uploads_dir.iterdir():
                        if item.is_dir() and not item.name.startswith('.'):
                            existing_dirs[item.name] = item
                
                for zip_info in zip_uploads:
                    zip_name = zip_info.get('name', '')
                    file_count = zip_info.get('file_count', 0)
                    
                    if zip_name:
                        # 查找以 zip_name 开头的目录（因为目录名可能包含时间戳后缀）
                        matched_dir = None
                        for dir_name, dir_path in existing_dirs.items():
                            if dir_name.startswith(zip_name):
                                matched_dir = (dir_name, dir_path)
                                break
                        
                        if matched_dir:
                            dir_name, dir_path = matched_dir
                            # 使用相对路径（相对于项目目录）
                            # 使用完整相对路径（从 projects 开始），便于预览等功能
                            rel_path = f"projects/{project_name}/uploads/{dir_name}"
                            # 显示名称使用完整目录名（包含时间戳，便于区分）
                            # 从 dir_name 中提取文件名部分（去掉前缀）
                            if '_' in dir_name:
                                display_name = dir_name.split('_', 1)[1]
                            else:
                                display_name = dir_name
                            directories.append({
                                'id': rel_path,  # 完整相对路径
                                'name': f"{display_name}（{file_count}个文件）"
                            })
            except Exception as e:
                import traceback
                print(f"[get_directories] 读取 zip_uploads.json 失败: {e}")
                traceback.print_exc()
        
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
        
        # 确定搜索目录或ZIP文件
        search_dir = None
        zip_file = None
        
        if directory:
            # 处理完整相对路径（如 projects/{项目名}/uploads/xxx）
            if directory.startswith('projects/') and project_name:
                # 从 projects_base_folder 拼接完整路径
                directory_path = doc_manager.config.projects_base_folder.parent / directory
            elif directory.startswith('uploads/') and project_name:
                # 兼容旧格式
                directory_path = doc_manager.config.projects_base_folder / project_name / directory
            else:
                directory_path = Path(directory)
            
            if directory_path.exists():
                if directory_path.is_dir():
                    # 是目录
                    search_dir = directory_path
                elif directory_path.is_file() and directory_path.suffix.lower() == '.zip':
                    # 是ZIP文件
                    zip_file = directory_path
        elif project_name:
            # 默认搜索项目 uploads 目录
            search_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
        else:
            return jsonify({'status': 'error', 'message': '缺少搜索目录'}), 400
        
        # 支持的文件类型
        allowed_exts = {'.pdf', '.doc', '.docx', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}
        
        # 搜索文件
        files = []
        
        if search_dir and search_dir.exists():
            # 搜索目录
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
                
                # 计算相对路径
                rel_path = file_path.name
                if project_name:
                    project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
                    try:
                        rel_path = str(file_path.relative_to(project_uploads_dir))
                    except ValueError:
                        pass
                
                # 使用完整相对路径作为 id（从 projects 开始）
                full_rel_path = f"projects/{project_name}/uploads/{rel_path}"
                files.append({
                    'id': full_rel_path,
                    'name': file_path.name,
                    'path': full_rel_path,
                    'rel_path': rel_path,
                    'size': file_path.stat().st_size,
                    'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                    'used': is_used
                })
        elif zip_file and zip_file.exists():
            # 搜索ZIP文件
            import zipfile
            try:
                with zipfile.ZipFile(zip_file, 'r') as zf:
                    for info in zf.infolist():
                        if info.filename.endswith('/'):
                            continue
                        file_path = Path(info.filename)
                        if file_path.suffix.lower() not in allowed_exts:
                            continue
                        if keyword and keyword not in file_path.name.lower():
                            continue
                        
                        # 检查是否已被其他文档使用
                        is_used = any(
                            meta.get('file_path') == info.filename or 
                            meta.get('original_filename') == file_path.name
                            for meta in doc_manager.documents_db.values()
                        )
                        
                        files.append({
                            'id': info.filename,
                            'name': file_path.name,
                            'path': info.filename,
                            'rel_path': info.filename,
                            'size': info.file_size,
                            'modified': datetime.fromtimestamp(info.date_time[0:6]).isoformat(),
                            'used': is_used
                        })
            except Exception:
                # 如果ZIP文件损坏，返回空列表
                pass
        
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
            
            # 提取目录信息 - 手动选择的文件使用根目录 '/'，不显示具体子目录
            directory = '/'
            relative_path = str(file_path)
            if project_name:
                # 获取项目上传目录
                project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
                try:
                    # 计算相对路径
                    relative_path = str(file_path.relative_to(project_uploads_dir))
                except ValueError:
                    # 如果文件不在项目上传目录中，使用原路径
                    pass
            
            # 将路径转换为完整相对路径（从 projects 开始）
            try:
                # 尝试计算相对于 projects_base_folder 父目录的路径
                projects_base = doc_manager.config.projects_base_folder.parent
                file_path_relative = str(file_path.relative_to(projects_base))
            except ValueError:
                # 如果无法相对化，使用相对于 uploads 的路径
                try:
                    project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
                    rel_to_uploads = str(file_path.relative_to(project_uploads_dir))
                    file_path_relative = f"projects/{project_name}/uploads/{rel_to_uploads}"
                except ValueError:
                    # 最后使用绝对路径
                    file_path_relative = str(file_path)
            
            # 获取原始文件名（优先使用前端传来的文件名）
            original_name = file_info.get('name') or file_path.name
            
            doc_metadata = {
                'cycle': cycle,
                'doc_name': doc_name,
                'filename': original_name,
                'original_filename': original_name,
                'file_path': file_path_relative,
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
