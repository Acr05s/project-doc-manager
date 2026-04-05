"""项目验收相关路由"""

from flask import request, jsonify
from datetime import datetime
from .utils import get_doc_manager


def confirm_cycle_acceptance(project_id):
    """确认周期验收"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json() or {}
        cycle = data.get('cycle')

        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']

        if cycle:
            # 验收指定周期
            if cycle not in project_config['documents']:
                return jsonify({'status': 'error', 'message': '周期不存在'}), 404

            if 'acceptance' not in project_config['documents'][cycle]:
                project_config['documents'][cycle]['acceptance'] = {}
            project_config['documents'][cycle]['acceptance'] = {
                'accepted': True,
                'accepted_time': datetime.now().isoformat(),
                'accepted_by': data.get('accepted_by', '系统')
            }
            message = f'周期"{cycle}"验收确认完成'
        else:
            # 验收所有周期
            if 'acceptance' not in project_config:
                project_config['acceptance'] = {}
            project_config['acceptance'] = {
                'accepted': True,
                'accepted_time': datetime.now().isoformat(),
                'accepted_by': data.get('accepted_by', '系统')
            }
            # 同步验收每个周期
            for cyc, doc_data in project_config.get('documents', {}).items():
                if 'acceptance' not in doc_data:
                    doc_data['acceptance'] = {}
                doc_data['acceptance'] = {
                    'accepted': True,
                    'accepted_time': datetime.now().isoformat(),
                    'accepted_by': data.get('accepted_by', '系统')
                }
            message = '所有周期验收确认完成'

        doc_manager.save_project(project_config)
        doc_manager.log_operation('确认验收', message, project=project_id)

        return jsonify({'status': 'success', 'message': message, 'project': project_config})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def verify_project_files(project_id):
    """验证项目所有文件是否存在且可以被打包"""
    try:
        from pathlib import Path
        
        doc_manager = get_doc_manager()
        
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']
        project_name = project_config.get('name', project_id)
        
        # 检查结果
        result = {
            'total_files': 0,
            'valid_files': 0,
            'missing_files': [],
            'path_errors': [],
            'can_package': True
        }
        
        # 遍历所有周期检查文件
        for cycle, doc_data in project_config.get('documents', {}).items():
            uploaded_docs = doc_data.get('uploaded_docs', [])
            
            for doc_meta in uploaded_docs:
                if not isinstance(doc_meta, dict):
                    continue
                
                result['total_files'] += 1
                
                file_path = doc_meta.get('file_path', '')
                doc_name = doc_meta.get('doc_name', '未知')
                filename = doc_meta.get('filename', '未知')
                
                # 检查文件路径是否为空
                if not file_path:
                    result['path_errors'].append({
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'filename': filename,
                        'error': '文件路径为空',
                        'doc_id': doc_meta.get('doc_id', '')
                    })
                    result['can_package'] = False
                    continue
                
                # 解析文件路径
                file_path_obj = Path(file_path)

                # 处理相对路径
                if not file_path_obj.is_absolute():
                    # 使用 pathlib 处理跨平台路径（自动适配 Windows/Unix 分隔符）
                    normalized_path = file_path_obj.as_posix()

                    # 剥离可能存在的 "projects/{project_name}/uploads/" 前缀，避免路径重复
                    # file_path 格式可能是：
                    # 1. "projects/{name}/uploads/..." （标准上传格式）
                    # 2. "uploads/..." （带 uploads 前缀）
                    # 3. "temp/..." （直接相对 uploads 目录）
                    prefix_patterns = [
                        f'projects/{project_name}/uploads/',
                        f'projects/{project_name}\\uploads\\',
                        f'{project_name}/uploads/',
                        f'{project_name}\\uploads\\',
                    ]
                    rel_path = normalized_path
                    for p in prefix_patterns:
                        if rel_path.startswith(p):
                            rel_path = rel_path[len(p):]
                            break

                    # 如果剩余路径以 uploads/ 开头，再剥离一层 uploads/（避免 uploads/uploads/）
                    if rel_path.startswith('uploads/') or rel_path.startswith('uploads\\'):
                        rel_path = rel_path[len('uploads/'):]

                    project_uploads_dir = Path(doc_manager.config.projects_base_folder) / project_name / 'uploads'
                    file_path_obj = project_uploads_dir / rel_path

                # 检查文件是否存在
                if not file_path_obj.exists():
                    result['missing_files'].append({
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'filename': filename,
                        'file_path': str(file_path),
                        'resolved_path': str(file_path_obj),
                        'doc_id': doc_meta.get('doc_id', '')
                    })
                    result['can_package'] = False
                else:
                    result['valid_files'] += 1
        
        return jsonify({
            'status': 'success',
            'result': result
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def clean_invalid_files(project_id):
    """清理项目中文件不存在的无效记录"""
    try:
        from pathlib import Path
        
        doc_manager = get_doc_manager()
        
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']
        project_name = project_config.get('name', project_id)
        
        # 清理结果统计
        cleaned_count = 0
        cleaned_files = []
        
        # 遍历所有周期检查文件
        for cycle, doc_data in project_config.get('documents', {}).items():
            uploaded_docs = doc_data.get('uploaded_docs', [])
            valid_docs = []
            
            for doc_meta in uploaded_docs:
                if not isinstance(doc_meta, dict):
                    continue
                
                file_path = doc_meta.get('file_path', '')
                doc_name = doc_meta.get('doc_name', '未知')
                filename = doc_meta.get('filename', '未知')
                
                # 检查文件路径是否为空
                if not file_path:
                    cleaned_count += 1
                    cleaned_files.append({
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'filename': filename,
                        'reason': '文件路径为空'
                    })
                    continue
                
                # 解析文件路径
                file_path_obj = Path(file_path)

                # 处理相对路径
                if not file_path_obj.is_absolute():
                    normalized_path = file_path_obj.as_posix()

                    # 剥离可能存在的 "projects/{project_name}/uploads/" 前缀，避免路径重复
                    # file_path 格式可能是：
                    # 1. "projects/{name}/uploads/..." （标准上传格式）
                    # 2. "uploads/..." （带 uploads 前缀）
                    # 3. "temp/..." （直接相对 uploads 目录）
                    prefix_patterns = [
                        f'projects/{project_name}/uploads/',
                        f'projects/{project_name}\\uploads\\',
                        f'{project_name}/uploads/',
                        f'{project_name}\\uploads\\',
                    ]
                    rel_path = normalized_path
                    for p in prefix_patterns:
                        if rel_path.startswith(p):
                            rel_path = rel_path[len(p):]
                            break

                    # 如果剩余路径以 uploads/ 开头，再剥离一层 uploads/（避免 uploads/uploads/）
                    if rel_path.startswith('uploads/') or rel_path.startswith('uploads\\'):
                        rel_path = rel_path[len('uploads/'):]

                    project_uploads_dir = Path(doc_manager.config.projects_base_folder) / project_name / 'uploads'
                    file_path_obj = project_uploads_dir / rel_path

                # 检查文件是否存在
                if not file_path_obj.exists():
                    cleaned_count += 1
                    cleaned_files.append({
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'filename': filename,
                        'file_path': str(file_path),
                        'reason': '文件不存在'
                    })
                else:
                    # 文件存在，保留
                    valid_docs.append(doc_meta)
            
            # 更新上传文档列表（只保留有效文件）
            doc_data['uploaded_docs'] = valid_docs
        
        # 保存更新后的项目配置
        doc_manager.save_project(project_config)
        
        # 记录操作日志
        doc_manager.log_operation('清理无效文件', f'清理了 {cleaned_count} 个无效文件记录', project=project_id)
        
        return jsonify({
            'status': 'success',
            'message': f'成功清理 {cleaned_count} 个无效文件记录',
            'cleaned_count': cleaned_count,
            'cleaned_files': cleaned_files
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def download_project_package(project_id):
    """打包下载项目所有文档（优先使用新版导出）"""
    try:
        doc_manager = get_doc_manager()
        import io
        import zipfile
        from pathlib import Path
        from flask import send_file, make_response
        from datetime import datetime

        project_name = project_id  # 新版使用project_id作为项目名称

        # 优先尝试新版导出
        result = doc_manager.export_documents_package(project_name)
        if result['status'] == 'success':
            # 使用新版导出结果
            with open(result['package_path'], 'rb') as f:
                file_data = f.read()
            
            response = make_response(file_data)
            response.headers['Content-Type'] = 'application/zip'
            response.headers['Content-Disposition'] = f'attachment; filename="{result["download_name"]}"'
            return response

        # 回退到旧版导出
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']
        project_name = project_config.get('name', '项目文档')

        # 创建内存 ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            added_count = 0

            for cycle, doc_data in project_config.get('documents', {}).items():
                uploaded_docs = doc_data.get('uploaded_docs', [])
                for doc_meta in uploaded_docs:
                    file_path = doc_meta.get('file_path')
                    if file_path and Path(file_path).exists():
                        # 构建目录结构：项目名/周期名/文档类型/子目录/文档
                        doc_name = doc_meta.get('doc_name', '未知')
                        directory = doc_meta.get('directory', '')
                        
                        # 构建归档路径
                        if directory:
                            # 有子目录：项目名/周期名/文档类型/子目录/文件名
                            archive_path = f"{project_name}/{cycle}/{doc_name}/{directory}/{doc_meta.get('filename', Path(file_path).name)}"
                        else:
                            # 无子目录：项目名/周期名/文档类型/文件名
                            archive_path = f"{project_name}/{cycle}/{doc_name}/{doc_meta.get('filename', Path(file_path).name)}"
                        
                        zipf.write(file_path, archive_path)
                        added_count += 1

            # 如果没有文件，也添加一个说明文件
            if added_count == 0:
                zipf.writestr('说明.txt', f'项目"{project_name}"暂无归档文档。')

        zip_buffer.seek(0)
        zip_filename = f"{project_name}_{datetime.now().strftime('%Y%m%d')}.zip"

        doc_manager.log_operation('打包下载', f'下载项目"{project_name}"（{added_count}个文件）', project=project_id)

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_application=True,
            download_name=zip_filename
        )

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
