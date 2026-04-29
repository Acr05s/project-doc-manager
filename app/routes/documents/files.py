"""文件搜索和选择相关路由"""

import os
import hashlib
from flask import request, jsonify, send_file
from pathlib import Path
from datetime import datetime
from .utils import get_doc_manager
from app.utils.base import normalize_file_path
import re


def normalize_used_by(used_by_list):
    """
    规范化 used_by 列表，去除重复项。
    处理周期名称格式差异（如 "1.项目立项" 和 "项目立项" 视为相同）
    """
    if not used_by_list:
        return []
    
    seen = set()
    result = []
    
    for item in used_by_list:
        # 提取周期名称和文档名称
        if ' - ' in item:
            cycle_part, doc_part = item.split(' - ', 1)
        else:
            cycle_part, doc_part = '', item
        
        # 去除周期名称中的序号前缀（如 "1."、"1、"等）用于比对
        normalized_cycle = re.sub(r'^\d+[\.、\s]+', '', cycle_part)
        normalized_key = f"{normalized_cycle}-{doc_part}"
        
        if normalized_key not in seen:
            seen.add(normalized_key)
            # 保留原始格式中更完整的那个（优先保留有序号的）
            result.append(item)
    
    return result


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
        
        print(f"[get_directories] 项目ID: {project_id}, 项目名称: {project_name}", flush=True)
        
        # 项目上传目录
        project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
        
        directories = []
        
        # 只从 zip_uploads.json 读取记录
        zip_uploads_file = doc_manager.config.projects_base_folder / project_name / 'zip_uploads.json'
        print(f"[get_directories] ZIP记录文件: {zip_uploads_file}, 存在: {zip_uploads_file.exists()}", flush=True)
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
            # 使用 pathlib 处理跨平台路径（自动适配 Windows/Unix 分隔符）
            dir_path = Path(directory)
            normalized_dir = dir_path.as_posix()
            if normalized_dir.startswith('projects/') and project_name:
                # 从 projects_base_folder 拼接完整路径
                directory_path = doc_manager.config.projects_base_folder.parent / directory
            elif normalized_dir.startswith('uploads/') and project_name:
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
                
                # 检查是否已被其他文档使用，并获取使用信息
                is_used = False
                used_by = []
                for meta in doc_manager.documents_db.values():
                    if meta.get('file_path') == str(file_path) or meta.get('original_filename') == file_path.name:
                        is_used = True
                        doc_name = meta.get('doc_name', '')
                        cycle = meta.get('cycle', '')
                        if doc_name and doc_name not in used_by:
                            used_by.append(f"{cycle} - {doc_name}" if cycle else doc_name)
                
                # 同时从项目配置中检查
                try:
                    project_result = doc_manager.load_project(project_id)
                    if project_result.get('status') == 'success':
                        project_config = project_result.get('project', {})
                        documents = project_config.get('documents', {})
                        for cycle_name, cycle_info in documents.items():
                            uploaded_docs = cycle_info.get('uploaded_docs', [])
                            for doc in uploaded_docs:
                                doc_file_path = doc.get('file_path', '')
                                doc_original_name = doc.get('original_filename', '')
                                # 检查文件名匹配或路径匹配
                                if doc_file_path and (doc_file_path.endswith(file_path.name) or file_path.name in doc_file_path):
                                    is_used = True
                                    doc_name = doc.get('doc_name', '')
                                    display_name = f"{cycle_name} - {doc_name}" if cycle_name else doc_name
                                    if display_name not in used_by:
                                        used_by.append(display_name)
                                elif doc_original_name and doc_original_name == file_path.name:
                                    is_used = True
                                    doc_name = doc.get('doc_name', '')
                                    display_name = f"{cycle_name} - {doc_name}" if cycle_name else doc_name
                                    if display_name not in used_by:
                                        used_by.append(display_name)
                except Exception:
                    pass
                
                # 规范化 used_by 列表，去除重复
                used_by = normalize_used_by(used_by)
                
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
                    'used': is_used,
                    'used_by': used_by
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
                        
                        # 检查是否已被其他文档使用，并获取使用信息
                        is_used = False
                        used_by = []
                        for meta in doc_manager.documents_db.values():
                            if meta.get('file_path') == info.filename or meta.get('original_filename') == file_path.name:
                                is_used = True
                                doc_name = meta.get('doc_name', '')
                                cycle = meta.get('cycle', '')
                                if doc_name and doc_name not in used_by:
                                    used_by.append(f"{cycle} - {doc_name}" if cycle else doc_name)
                        
                        # 同时从项目配置中检查
                        try:
                            project_result = doc_manager.load_project(project_id)
                            if project_result.get('status') == 'success':
                                project_config = project_result.get('project', {})
                                documents = project_config.get('documents', {})
                                for cycle_name, cycle_info in documents.items():
                                    uploaded_docs = cycle_info.get('uploaded_docs', [])
                                    for doc in uploaded_docs:
                                        doc_file_path = doc.get('file_path', '')
                                        doc_original_name = doc.get('original_filename', '')
                                        # 检查文件名匹配或路径匹配
                                        if doc_file_path and (doc_file_path.endswith(file_path.name) or file_path.name in doc_file_path or info.filename in doc_file_path):
                                            is_used = True
                                            doc_name = doc.get('doc_name', '')
                                            display_name = f"{cycle_name} - {doc_name}" if cycle_name else doc_name
                                            if display_name not in used_by:
                                                used_by.append(display_name)
                                        elif doc_original_name and doc_original_name == file_path.name:
                                            is_used = True
                                            doc_name = doc.get('doc_name', '')
                                            display_name = f"{cycle_name} - {doc_name}" if cycle_name else doc_name
                                            if display_name not in used_by:
                                                used_by.append(display_name)
                        except Exception:
                            pass
                        
                        # 规范化 used_by 列表，去除重复
                        used_by = normalize_used_by(used_by)
                        
                        files.append({
                            'id': info.filename,
                            'name': file_path.name,
                            'path': info.filename,
                            'rel_path': info.filename,
                            'size': info.file_size,
                            'modified': datetime.fromtimestamp(info.date_time[0:6]).isoformat(),
                            'used': is_used,
                            'used_by': used_by
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
            
            # 提取目录信息 - 优先使用前端传递的 source_dir
            source_dir = file_info.get('source_dir', '')
            if source_dir:
                # 使用前端传递的相对路径作为 directory
                directory = source_dir if source_dir.startswith('/') else '/' + source_dir
            else:
                directory = '/'
            
            # 获取根目录（用于显示和打包时截取路径）
            root_dir = file_info.get('root_dir') or data.get('root_directory', '')
            
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
            
            # 统一规范化路径格式为 {项目名}/uploads/...
            file_path_relative = normalize_file_path(
                str(file_path),
                project_name,
                doc_manager.config.projects_base_folder if project_name else None
            )
            
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
                'directory': directory if directory else '/',  # 目录：默认根目录
                'root_directory': root_dir,  # 根目录，用于显示和打包时截取路径
                'custom_attrs': {}  # 自定义属性（选择归档时不携带）
            }
            
            # 添加到documents_db（内存）
            doc_manager.documents_db[doc_id] = doc_metadata
            
            # 同时持久化到 documents.db（确保 root_directory 等字段不会丢失）
            try:
                doc_manager.add_document(
                    doc_id=doc_id,
                    project_id=project_id,
                    project_name=project_name,
                    cycle=cycle,
                    doc_name=doc_name,
                    file_path=file_path_relative,
                    file_size=file_path.stat().st_size,
                    original_filename=original_name,
                    directory=directory or '/',
                    source='select',
                    root_directory=root_dir
                )
            except Exception as db_err:
                print(f'[归档] 保存到documents.db失败（非致命）: {db_err}')
            
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
        
        # 后台触发 PDF 转换（针对 Office 文档）
        try:
            from app.services.task_service import task_service
            for result_item in results:
                if result_item['status'] == 'success':
                    rid = result_item['doc_id']
                    rmeta = doc_manager.documents_db.get(rid, {})
                    rpath = rmeta.get('file_path')
                    if rpath:
                        rpath_obj = Path(rpath)
                        if not rpath_obj.is_absolute():
                            rpath_obj = doc_manager.config.projects_base_folder.parent / 'projects' / rpath
                        if rpath_obj.exists():
                            ext = rpath_obj.suffix.lower()
                            if ext in ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']:
                                import time as _time
                                mtime = int(os.path.getmtime(str(rpath_obj)))
                                cache_key = f"{rid}_{mtime}"
                                task_service.start_pdf_conversion_task(
                                    str(rpath_obj), rid, cache_key
                                )
                                print(f"[select_files] 已触发后台PDF转换: {rid}")
        except Exception as e:
            print(f"[select_files] 触发PDF转换失败: {e}")

        return jsonify({
            'status': 'success',
            'results': results
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def _normalize_zip_source_path(path_value):
    if not path_value:
        return ''
    return str(path_value).replace('\\', '/').rstrip('/')


def _collect_zip_used_by(file_path, metas):
    """按 ZIP 源路径精确匹配，避免同名文件被误标记为已使用。"""
    normalized_file_path = _normalize_zip_source_path(file_path)
    used_by = []
    for meta in metas or []:
        meta_source_path = _normalize_zip_source_path(meta.get('source_path') or meta.get('original_path'))
        if not meta_source_path or meta_source_path != normalized_file_path:
            continue
        cycle = meta.get('cycle', '')
        doc_name = meta.get('doc_name', '')
        display_name = f"{cycle} - {doc_name}" if cycle else doc_name
        if display_name and display_name not in used_by:
            used_by.append(display_name)
    return used_by


def _collect_match_details(file_path, metas):
    """收集文件的详细匹配信息（周期、文档类型、匹配时间）"""
    normalized_file_path = _normalize_zip_source_path(file_path)
    details = []
    for meta in metas or []:
        meta_source_path = _normalize_zip_source_path(meta.get('source_path') or meta.get('original_path'))
        if not meta_source_path or meta_source_path != normalized_file_path:
            continue
        details.append({
            'cycle': meta.get('cycle', ''),
            'doc_name': meta.get('doc_name', ''),
            'doc_id': meta.get('doc_id', ''),
            'upload_time': meta.get('upload_time', ''),
            'original_filename': meta.get('original_filename', ''),
        })
    return details


def browse_file_tree():
    """浏览项目上传目录的完整文件树（含匹配信息）"""
    try:
        doc_manager = get_doc_manager()
        project_id = request.args.get('project_id')
        project_name = request.args.get('project_name')

        if not project_id and not project_name:
            return jsonify({'status': 'error', 'message': '缺少项目参数'}), 400

        if not project_name and project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result and project_result.get('status') == 'success':
                project_name = project_result.get('project', {}).get('name', '')

        if not project_name:
            return jsonify({'status': 'success', 'tree': [], 'total': 0})

        if project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result and project_result.get('status') == 'success':
                if project_name and hasattr(doc_manager, 'data_manager'):
                    doc_index = doc_manager.data_manager.load_documents_index(project_name)
                    for did, ddata in doc_index.items():
                        doc_manager.documents_db[did] = ddata

        uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
        if not uploads_dir.exists():
            return jsonify({'status': 'success', 'tree': [], 'total': 0})

        ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                        '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}

        def build_tree(dir_path, rel_prefix=''):
            entries = []
            try:
                items = sorted(dir_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
            except PermissionError:
                return entries

            for item in items:
                if item.name.startswith('.'):
                    continue
                rel_path = f"{rel_prefix}/{item.name}" if rel_prefix else item.name

                if item.is_dir():
                    children = build_tree(item, rel_path)
                    file_count = sum(1 for c in children if c['type'] == 'file') + sum(
                        c.get('file_count', 0) for c in children if c['type'] == 'dir')
                    if file_count > 0:
                        entries.append({
                            'type': 'dir',
                            'name': item.name,
                            'path': str(item),
                            'rel_path': rel_path,
                            'children': children,
                            'file_count': file_count
                        })
                elif item.is_file() and item.suffix.lower() in ALLOWED_EXTS:
                    used_by = _collect_zip_used_by(item, doc_manager.documents_db.values())
                    match_details = _collect_match_details(item, doc_manager.documents_db.values())
                    stat = item.stat()
                    entries.append({
                        'type': 'file',
                        'name': item.name,
                        'path': str(item),
                        'rel_path': rel_path,
                        'size': stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'ext': item.suffix.lower(),
                        'matched': len(used_by) > 0,
                        'used_by': used_by,
                        'match_details': match_details
                    })
            return entries

        tree = build_tree(uploads_dir)
        total = sum(1 for _ in uploads_dir.rglob('*')
                    if _.is_file() and not _.name.startswith('.') and _.suffix.lower() in ALLOWED_EXTS)

        return jsonify({'status': 'success', 'tree': tree, 'total': total})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def preview_file_by_path():
    """通过文件路径预览文件（用于文档浏览器中未匹配的文件）"""
    try:
        doc_manager = get_doc_manager()
        file_path = request.args.get('path', '').strip()
        if not file_path:
            return jsonify({'status': 'error', 'message': '缺少文件路径'}), 400

        file_path_obj = Path(file_path)
        if not file_path_obj.exists() or not file_path_obj.is_file():
            return jsonify({'status': 'error', 'message': '文件不存在'}), 404

        projects_base = str(doc_manager.config.projects_base_folder).replace('\\', '/')
        file_abs = str(file_path_obj.resolve()).replace('\\', '/')
        if not file_abs.startswith(projects_base.rstrip('/') + '/'):
            return jsonify({'status': 'error', 'message': '无权访问该文件'}), 403

        file_ext = file_path_obj.suffix.lower()

        if file_ext == '.pdf':
            return send_file(str(file_path_obj), mimetype='application/pdf', as_attachment=False)

        image_exts = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                      '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff'}
        if file_ext in image_exts:
            return send_file(str(file_path_obj), mimetype=image_exts[file_ext])

        office_exts = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
        if file_ext in office_exts:
            from app.routes.documents.preview import _convert_and_view_office
            doc_id = hashlib.md5(file_abs.encode()).hexdigest()
            return _convert_and_view_office(str(file_path_obj), doc_id, file_path_obj)

        if file_ext == '.txt':
            return send_file(str(file_path_obj), mimetype='text/plain; charset=utf-8')

        return send_file(str(file_path_obj), as_attachment=True)

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
