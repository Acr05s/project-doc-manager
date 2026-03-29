"""项目导出导入相关路由"""

import io
import zipfile
import json
import uuid
import shutil
import logging
from datetime import datetime
from pathlib import Path
from flask import request, jsonify, make_response
from .utils import get_doc_manager

logger = logging.getLogger(__name__)


def export_project(project_id):
    """导出项目为JSON"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.export_project_json(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_project():
    """从JSON导入项目"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        name = data.get('name')  # 可选的新项目名称
        
        if not data:
            return jsonify({'status': 'error', 'message': '未提供项目数据'}), 400
        
        result = doc_manager.import_project_json(data, name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_project_file():
    """从文件导入项目（JSON文件）"""
    try:
        doc_manager = get_doc_manager()
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        # 读取JSON文件
        import json as json_module
        try:
            json_data = json_module.load(file)
        except:
            return jsonify({'status': 'error', 'message': '无效的JSON文件'}), 400
        
        name = request.form.get('name')  # 可选的新项目名称
        
        result = doc_manager.import_project_json(json_data, name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def package_project(project_id):
    """打包项目（项目配置+文档文件）为ZIP下载"""
    try:
        doc_manager = get_doc_manager()
        # 获取项目配置
        project = doc_manager.load_project(project_id)
        if not project or project.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project.get('project', {})
        project_name = project_config.get('name', 'project')
        
        # 创建内存ZIP
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # 1. 添加项目配置文件
            config_json = json.dumps(project_config, ensure_ascii=False, indent=2)
            zip_file.writestr('project_config.json', config_json)
            
            # 2. 添加文档元数据
            all_docs = doc_manager.get_documents()
            docs_json = json.dumps(all_docs, ensure_ascii=False, indent=2)
            zip_file.writestr('documents_metadata.json', docs_json)
            
            # 3. 复制文档文件
            copied_count = 0
            for doc in all_docs:
                file_path = doc.get('file_path')
                if file_path and Path(file_path).exists():
                    try:
                        # 构建目录结构：项目名/周期名/文档类型/子目录/文档
                        project_name = project_config.get('name', 'project')
                        cycle = doc.get('cycle', 'unknown')
                        doc_name = doc.get('doc_name', 'unknown')
                        directory = doc.get('directory', '')
                        filename = doc.get('filename', Path(file_path).name)
                        
                        # 构建归档路径
                        if directory:
                            # 有子目录：项目名/周期名/文档类型/子目录/文件名
                            arcname = f"{project_name}/{cycle}/{doc_name}/{directory}/{filename}"
                        else:
                            # 无子目录：项目名/周期名/文档类型/文件名
                            arcname = f"{project_name}/{cycle}/{doc_name}/{filename}"
                        
                        zip_file.write(file_path, arcname)
                        copied_count += 1
                    except Exception as e:
                        pass
        
        # 返回ZIP文件
        zip_buffer.seek(0)
        response = make_response(zip_buffer.getvalue())
        response.headers['Content-Type'] = 'application/zip'
        safe_name = ''.join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_name}_backup.zip"'
        
        return response
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_package():
    """从ZIP包导入项目"""
    try:
        doc_manager = get_doc_manager()
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400

        # 保存上传的ZIP到临时文件
        temp_zip_path = doc_manager.upload_folder / 'temp' / f'{uuid.uuid4()}.zip'
        temp_zip_path.parent.mkdir(parents=True, exist_ok=True)
        file.save(str(temp_zip_path))

        # 解压ZIP
        extract_dir = doc_manager.upload_folder / 'temp' / f'import_{uuid.uuid4()}'
        extract_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
            zip_ref.extractall(str(extract_dir))

        # 读取项目配置
        config_file = extract_dir / 'project_config.json'
        if not config_file.exists():
            return jsonify({'status': 'error', 'message': 'ZIP包中缺少project_config.json文件'}), 400

        with open(config_file, 'r', encoding='utf-8') as f:
            project_config = json.load(f)

        # 处理文档文件
        documents_dir = extract_dir / 'documents'
        if documents_dir.exists():
            # 可以在这里处理文档文件的复制
            pass

        # 导入项目
        result = doc_manager.import_project_json(project_config)

        # 清理临时文件
        shutil.rmtree(extract_dir, ignore_errors=True)
        temp_zip_path.unlink(missing_ok=True)

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def download_package(project_id, task_id):
    """下载打包完成的ZIP文件"""
    import json
    from pathlib import Path
    import os
    
    try:
        from flask import send_file, jsonify
        
        # 使用绝对路径
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        tasks_file = base_dir / 'uploads' / 'tasks' / 'package_tasks.json'
        
        print(f'[下载] 任务文件路径: {tasks_file}', flush=True)
        print(f'[下载] 任务文件存在: {tasks_file.exists()}', flush=True)
        
        task = None
        if tasks_file.exists():
            with open(tasks_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                task = data.get(task_id)
                print(f'[下载] 找到任务: {task is not None}', flush=True)
        
        if not task:
            return jsonify({'status': 'error', 'message': '任务不存在或已过期'}), 404
        
        if task.get('status') != 'completed':
            return jsonify({'status': 'error', 'message': '任务尚未完成'}), 400
        
        if task.get('type') != 'package':
            return jsonify({'status': 'error', 'message': '任务类型不是打包'}), 400
        
        result = task.get('result', {})
        package_path = result.get('package_path')
        
        print(f'[下载] 包文件路径: {package_path}', flush=True)
        print(f'[下载] 包文件存在: {Path(package_path).exists() if package_path else False}', flush=True)
        
        if not package_path:
            return jsonify({'status': 'error', 'message': '打包路径为空'}), 404
        
        if not Path(package_path).exists():
            return jsonify({'status': 'error', 'message': f'打包文件不存在: {package_path}'}), 404
        
        # 返回文件
        filename = result.get('package_filename', 'project_package.zip')
        print(f'[下载] 开始返回文件: {filename}', flush=True)
        return send_file(
            package_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/zip'
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'下载失败: {str(e)}'}), 500


# 项目导入相关路由
import io
import zipfile
import json
import uuid
import shutil
import os
from datetime import datetime
from pathlib import Path

# 分片上传配置
UPLOAD_TEMP_FOLDER = Path('uploads/temp_chunks')
UPLOAD_TEMP_FOLDER.mkdir(parents=True, exist_ok=True)


def import_project_chunk():
    """上传项目包分片（支持断点续传）"""
    try:
        file = request.files.get('chunk')
        chunk_index = request.form.get('chunkIndex', type=int)
        total_chunks = request.form.get('totalChunks', type=int)
        file_name = request.form.get('filename')
        file_id = request.form.get('fileId')
        
        # 检查必要参数
        if file is None or chunk_index is None or total_chunks is None or not file_name or not file_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 生成临时文件路径
        temp_dir = UPLOAD_TEMP_FOLDER / f"import_project_{file_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = temp_dir / f"chunk_{chunk_index}"
        
        # 保存分片
        file.save(chunk_path)
        
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{total_chunks} 上传成功'
        })
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_project_merge():
    """合并项目包分片并导入"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        file_name = data.get('filename')
        file_id = data.get('fileId')
        
        # 新的冲突处理参数
        conflict_action = data.get('conflict_action', 'rename')  # 'overwrite', 'rename', 'manual'
        custom_name = data.get('custom_name')  # 用户手动输入的名称
        
        if not all([file_name, file_id]):
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 读取所有分片
        temp_dir = UPLOAD_TEMP_FOLDER / f"import_project_{file_id}"
        if not temp_dir.exists():
            return jsonify({'status': 'error', 'message': '分片不存在'}), 400
        
        # 合并分片
        merged_file = io.BytesIO()
        
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
                merged_file.write(f.read())
        
        merged_file.seek(0)
        
        # 解压ZIP文件到projects目录
        projects_dir = doc_manager.config.projects_folder
        extract_dir = projects_dir / f"import_temp_{file_id}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        with zipfile.ZipFile(merged_file, 'r') as zip_ref:
            zip_ref.extractall(str(extract_dir))
        
        # 查找项目配置文件
        project_config_file = None
        project_info_file = None
        
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                if file == 'project_config.json':
                    project_config_file = Path(root) / file
                elif file == 'project_info.json':
                    project_info_file = Path(root) / file
            if project_config_file or project_info_file:
                break
        
        # 读取项目配置
        project_config = {}
        if project_config_file:
            with open(project_config_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
        elif project_info_file:
            with open(project_info_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
        else:
            # 清理临时文件
            shutil.rmtree(temp_dir, ignore_errors=True)
            shutil.rmtree(extract_dir, ignore_errors=True)
            return jsonify({'status': 'error', 'message': 'ZIP包中缺少项目配置文件（project_config.json或project_info.json）'}), 400
        
        # 获取原始项目名称
        original_project_name = project_config.get('name', f'导入项目_{datetime.now().strftime("%Y%m%d%H%M%S")}')
        project_name = original_project_name
        
        # 如果用户指定了自定义名称，使用自定义名称
        if custom_name:
            project_name = custom_name
        
        # 复制项目文件到projects目录
        target_project_dir = projects_dir / project_name
        
        # 确定项目源目录
        if project_config_file:
            project_source_dir = project_config_file.parent
        elif project_info_file:
            project_source_dir = project_info_file.parent
        else:
            project_source_dir = extract_dir
        
        # 检查项目是否已存在
        project_exists = target_project_dir.exists()
        is_renamed = False
        merge_stats = None
        should_copy_files = True
        
        # 处理冲突
        if project_exists:
            if conflict_action == 'merge':
                # 合并数据：不解压到目标目录，而是先解压到临时目录，然后合并数据
                logger.info(f"开始合并项目数据: {project_name}")
                merge_stats = merge_project_data(
                    project_source_dir, 
                    target_project_dir, 
                    project_name,
                    doc_manager
                )
                logger.info(f"项目数据合并完成: {merge_stats}")
                should_copy_files = False  # 合并后不需要再复制文件
            elif conflict_action == 'overwrite':
                # 覆盖：删除现有项目
                shutil.rmtree(str(target_project_dir))
                logger.info(f"已删除现有项目目录: {project_name}")
            elif conflict_action == 'manual' and custom_name:
                # 手动模式且已提供新名称，但名称仍然冲突
                if target_project_dir.exists():
                    project_name = f"{custom_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
                    target_project_dir = projects_dir / project_name
                    is_renamed = True
                    logger.info(f"手动名称冲突，生成新名称: {project_name}")
            else:
                # 重命名：自动添加时间戳
                project_name = f"{original_project_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
                target_project_dir = projects_dir / project_name
                is_renamed = True
                logger.info(f"项目已存在，生成新名称: {project_name}")
        
        logger.info(f"项目源目录: {project_source_dir}")
        logger.info(f"项目目标目录: {target_project_dir}")
        
        # 检查源目录中的文档索引文件
        source_index_path = project_source_dir / 'data' / 'documents_index.json'
        logger.info(f"源文档索引路径: {source_index_path}")
        logger.info(f"源文档索引是否存在: {source_index_path.exists()}")
        
        if source_index_path.exists():
            try:
                with open(source_index_path, 'r', encoding='utf-8') as f:
                    temp_data = json.load(f)
                logger.info(f"源文档索引文档数量: {len(temp_data.get('documents', {}))}")
            except Exception as e:
                logger.error(f"读取源文档索引失败: {e}")
        
        # 如果需要，复制项目文件
        if should_copy_files:
            shutil.copytree(str(project_source_dir), str(target_project_dir))
            logger.info(f"项目文件已复制到: {target_project_dir}")
        
        # 处理文档索引文件
        target_index_path = target_project_dir / 'data' / 'documents_index.json'
        
        if source_index_path.exists():
            try:
                # 读取原始文档索引
                with open(source_index_path, 'r', encoding='utf-8') as f:
                    index_data = json.load(f)
                
                logger.info(f"读取到 {len(index_data.get('documents', {}))} 个文档")
                
                # 更新文档路径中的项目名称
                documents = index_data.get('documents', {})
                for doc_id, doc_info in documents.items():
                    # 更新file_path中的项目名称
                    if 'file_path' in doc_info:
                        # 替换旧项目名称为新项目名称
                        old_project_name = project_source_dir.name
                        new_project_name = project_name
                        if old_project_name != new_project_name:
                            doc_info['file_path'] = doc_info['file_path'].replace(old_project_name, new_project_name)
                        # 更新project_name字段
                        doc_info['project_name'] = new_project_name
                
                # 保存更新后的索引
                with open(target_index_path, 'w', encoding='utf-8') as f:
                    json.dump(index_data, f, ensure_ascii=False, indent=2)
                
                logger.info(f"已更新文档索引文件: {target_index_path}")
                logger.info(f"保存了 {len(documents)} 个文档")
            except Exception as e:
                logger.error(f"处理文档索引文件失败: {e}")
                import traceback
                logger.error(traceback.format_exc())
        else:
            logger.warning(f"源文档索引文件不存在: {source_index_path}")
        
        # 检查是否存在requirements.json文件
        requirements_file = target_project_dir / 'requirements.json'
        if not requirements_file.exists():
            # 检查config目录中的requirements.json
            config_dir = target_project_dir / 'config'
            if config_dir.exists():
                requirements_file = config_dir / 'requirements.json'
        
        # 生成新的项目ID
        new_project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        project_config['id'] = new_project_id
        project_config['created_time'] = datetime.now().isoformat()
        project_config['updated_time'] = datetime.now().isoformat()
        
        # 如果存在requirements.json，加载需求
        if requirements_file.exists():
            try:
                with open(requirements_file, 'r', encoding='utf-8') as f:
                    requirements = json.load(f)
                
                # 更新项目配置
                project_config['cycles'] = requirements.get('cycles', [])
                project_config['documents'] = requirements.get('documents', {})
                
                logger.info(f"已加载requirements.json文件: {requirements_file}")
            except Exception as e:
                logger.error(f"加载requirements.json失败: {e}")
        
        # 保存更新后的配置
        # 检查目标目录中存在的配置文件类型
        target_info_file = target_project_dir / 'project_info.json'
        target_config_file = target_project_dir / 'project_config.json'
        
        if target_info_file.exists():
            # 如果存在project_info.json，更新它
            with open(target_info_file, 'w', encoding='utf-8') as f:
                json.dump(project_config, f, ensure_ascii=False, indent=2)
        else:
            # 否则更新project_config.json
            with open(target_config_file, 'w', encoding='utf-8') as f:
                json.dump(project_config, f, ensure_ascii=False, indent=2)
        
        # 更新项目索引
        doc_manager.projects.create(
            name=project_name,
            description=project_config.get('description', ''),
            requirements_file=str(requirements_file) if requirements_file.exists() else None
        )
        
        # 清理临时文件
        shutil.rmtree(temp_dir, ignore_errors=True)
        shutil.rmtree(extract_dir, ignore_errors=True)
        
        # 构建返回结果
        result = {
            'status': 'success',
            'message': '项目数据合并完成' if merge_stats else '项目导入成功',
            'project_id': new_project_id,
            'project_name': project_name,
            'renamed': is_renamed,
            'merged': merge_stats is not None
        }
        
        # 如果是合并操作，添加合并统计
        if merge_stats:
            result['merge_stats'] = merge_stats
            logger.info(f"返回合并统计: {merge_stats}")
        
        return jsonify(result)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def package_full_project(project_id):
    """完整打包项目目录（先保存再打包）"""
    try:
        import tempfile
        import os
        from flask import make_response
        
        doc_manager = get_doc_manager()
        
        # 1. 先获取项目配置并保存，确保数据已持久化
        project = doc_manager.load_project(project_id)
        if not project or project.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project.get('project', {})
        project_name = project_config.get('name', 'project')
        
        # 保存项目数据
        save_result = doc_manager.save_project(project_config)
        if save_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '保存项目数据失败: ' + save_result.get('message', '')}), 500
        
        # 2. 查找项目目录
        project_dir = None
        projects_base = doc_manager.config.projects_base_folder
        
        # 尝试多种方式查找项目目录
        possible_paths = [
            projects_base / project_id,
            projects_base / project_name,
            projects_base / f"{project_name}_{project_id}",
        ]
        
        for path in possible_paths:
            if path.exists() and path.is_dir():
                project_dir = path
                break
        
        # 如果没找到，使用项目ID作为目录名
        if not project_dir:
            project_dir = projects_base / project_id
            if not project_dir.exists():
                return jsonify({'status': 'error', 'message': '项目目录不存在'}), 404
        
        # 3. 创建临时ZIP文件
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        temp_zip.close()
        
        # 4. 打包整个项目目录
        shutil.make_archive(
            temp_zip.name.replace('.zip', ''),
            'zip',
            root_dir=project_dir.parent,
            base_dir=project_dir.name
        )
        
        # 5. 读取ZIP文件并返回
        with open(temp_zip.name, 'rb') as f:
            zip_data = f.read()
        
        # 清理临时文件
        os.unlink(temp_zip.name)
        
        # 记录操作日志
        doc_manager.log_operation('打包项目', f'完整打包项目"{project_name}"', project=project_id)
        
        # 返回ZIP文件
        response = make_response(zip_data)
        response.headers['Content-Type'] = 'application/zip'
        # 使用 Werkzeug 安全文件名函数
        from werkzeug.utils import secure_filename
        safe_name = secure_filename(project_name)
        if not safe_name:
            safe_name = 'project'
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_name}_full_backup.zip"'
        
        return response
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ==================== 项目数据合并功能 ====================

def merge_project_data(source_dir, target_dir, project_name, doc_manager):
    """
    合并两个项目的数据
    
    Args:
        source_dir: 新导入项目的临时目录
        target_dir: 现有项目的目标目录
        project_name: 项目名称
        doc_manager: 文档管理器实例
    
    Returns:
        dict: 合并统计信息
    """
    stats = {
        'documents_added': 0,
        'documents_merged': 0,
        'zip_records_added': 0,
        'zip_records_merged': 0,
        'files_copied': 0,
        'files_backed_up': 0,
        'cycles_added': 0,
        'requirements_added': 0
    }
    
    logger.info(f"开始合并项目数据: {project_name}")
    logger.info(f"源目录: {source_dir}")
    logger.info(f"目标目录: {target_dir}")
    
    # 1. 合并 documents_index.json
    merge_documents_index(source_dir, target_dir, project_name, stats)
    
    # 2. 合并 documents_archived.json
    merge_documents_archived(source_dir, target_dir, stats)
    
    # 3. 合并 requirements.json
    merge_requirements(source_dir, target_dir, project_name, stats)
    
    # 4. 合并 zip_uploads.json
    merge_zip_uploads(source_dir, target_dir, stats)
    
    # 5. 复制文档文件
    copy_document_files(source_dir, target_dir, project_name, stats)
    
    # 6. 更新 project_info.json
    merge_update_project_info(source_dir, target_dir, stats)
    
    logger.info(f"项目数据合并完成: {stats}")
    return stats


def merge_documents_index(source_dir, target_dir, project_name, stats):
    """合并文档索引"""
    source_file = source_dir / 'data' / 'documents_index.json'
    target_file = target_dir / 'data' / 'documents_index.json'
    
    if not source_file.exists():
        logger.info("源文档索引不存在，跳过合并")
        return
    
    # 读取源数据
    with open(source_file, 'r', encoding='utf-8') as f:
        source_data = json.load(f)
    
    # 读取或创建目标数据
    target_data = {'documents': {}}
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_data = json.load(f)
    
    # 合并文档
    for doc_id, doc_info in source_data.get('documents', {}).items():
        # 更新项目名称
        doc_info['project_name'] = project_name
        
        # 更新文件路径中的项目名称
        if 'file_path' in doc_info:
            old_project_name = doc_info.get('project_name', '')
            if old_project_name and old_project_name != project_name:
                doc_info['file_path'] = doc_info['file_path'].replace(old_project_name, project_name)
        
        if doc_id in target_data['documents']:
            # 已存在，比较更新时间
            source_time = doc_info.get('upload_time', '')
            target_time = target_data['documents'][doc_id].get('upload_time', '')
            if source_time > target_time:
                target_data['documents'][doc_id] = doc_info
                stats['documents_merged'] += 1
                logger.debug(f"更新文档: {doc_id}")
        else:
            # 新文档
            target_data['documents'][doc_id] = doc_info
            stats['documents_added'] += 1
            logger.debug(f"添加新文档: {doc_id}")
    
    # 保存合并后的数据
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"文档索引合并完成: 新增 {stats['documents_added']}, 更新 {stats['documents_merged']}")


def merge_documents_archived(source_dir, target_dir, stats):
    """合并归档状态"""
    source_file = source_dir / 'data' / 'documents_archived.json'
    target_file = target_dir / 'data' / 'documents_archived.json'
    
    if not source_file.exists():
        return
    
    with open(source_file, 'r', encoding='utf-8') as f:
        source_data = json.load(f)
    
    target_data = {'documents_archived': {}}
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_data = json.load(f)
    
    # 合并归档状态（任一来源已归档则标记为已归档）
    for cycle, docs in source_data.get('documents_archived', {}).items():
        if cycle not in target_data['documents_archived']:
            target_data['documents_archived'][cycle] = {}
        
        for doc_name, archived in docs.items():
            if archived:
                target_data['documents_archived'][cycle][doc_name] = True
    
    # 保存
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)
    
    logger.info("归档状态合并完成")


def merge_requirements(source_dir, target_dir, project_name, stats):
    """合并需求配置"""
    # 尝试多个可能的路径
    possible_paths = [
        source_dir / 'config' / 'requirements.json',
        source_dir / 'requirements.json',
        source_dir / 'data' / 'requirements.json'
    ]
    
    source_file = None
    for path in possible_paths:
        if path.exists():
            source_file = path
            break
    
    if not source_file:
        logger.info("源需求配置不存在，跳过合并")
        return
    
    # 目标文件路径
    target_paths = [
        target_dir / 'config' / 'requirements.json',
        target_dir / 'requirements.json',
        target_dir / 'data' / 'requirements.json'
    ]
    
    target_file = None
    for path in target_paths:
        if path.exists():
            target_file = path
            break
    
    # 读取源数据
    with open(source_file, 'r', encoding='utf-8') as f:
        source_data = json.load(f)
    
    # 读取或创建目标数据
    target_data = {'cycles': [], 'documents': {}}
    if target_file and target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_data = json.load(f)
    else:
        target_file = target_dir / 'config' / 'requirements.json'
    
    # 合并 cycles（去重）
    existing_cycles = set(target_data.get('cycles', []))
    for cycle in source_data.get('cycles', []):
        if cycle not in existing_cycles:
            target_data['cycles'].append(cycle)
            existing_cycles.add(cycle)
            stats['cycles_added'] += 1
    
    # 合并 documents
    for cycle, cycle_data in source_data.get('documents', {}).items():
        if cycle not in target_data['documents']:
            target_data['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
        
        # 合并 required_docs（按名称去重）
        existing_doc_names = {d.get('name') if isinstance(d, dict) else d 
                             for d in target_data['documents'][cycle].get('required_docs', [])}
        
        for doc in cycle_data.get('required_docs', []):
            doc_name = doc.get('name') if isinstance(doc, dict) else doc
            if doc_name not in existing_doc_names:
                target_data['documents'][cycle]['required_docs'].append(doc)
                existing_doc_names.add(doc_name)
                stats['requirements_added'] += 1
        
        # 合并 uploaded_docs
        existing_uploaded_ids = {d.get('doc_id') for d in target_data['documents'][cycle].get('uploaded_docs', []) if isinstance(d, dict)}
        
        for uploaded_doc in cycle_data.get('uploaded_docs', []):
            if isinstance(uploaded_doc, dict):
                doc_id = uploaded_doc.get('doc_id')
                if doc_id and doc_id not in existing_uploaded_ids:
                    # 更新项目名称和路径
                    uploaded_doc['project_name'] = project_name
                    if 'file_path' in uploaded_doc:
                        old_name = uploaded_doc.get('project_name', '')
                        if old_name and old_name != project_name:
                            uploaded_doc['file_path'] = uploaded_doc['file_path'].replace(old_name, project_name)
                    
                    target_data['documents'][cycle]['uploaded_docs'].append(uploaded_doc)
                    existing_uploaded_ids.add(doc_id)
    
    # 保存
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"需求配置合并完成: 新增 {stats['cycles_added']} 个周期, {stats['requirements_added']} 个文档类型")


def merge_zip_uploads(source_dir, target_dir, stats):
    """合并 ZIP 上传记录"""
    source_file = source_dir / 'zip_uploads.json'
    target_file = target_dir / 'zip_uploads.json'
    
    if not source_file.exists():
        logger.info("源 ZIP 上传记录不存在，跳过合并")
        return
    
    with open(source_file, 'r', encoding='utf-8') as f:
        source_records = json.load(f)
    
    target_records = []
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_records = json.load(f)
    
    # 创建目标记录的字典（以 id 为键）
    target_dict = {r['id']: r for r in target_records}
    
    # 合并记录
    for record in source_records:
        record_id = record['id']
        if record_id in target_dict:
            # 已存在，保留更新时间较新的
            source_time = record.get('upload_time', '')
            target_time = target_dict[record_id].get('upload_time', '')
            if source_time > target_time:
                target_dict[record_id] = record
                stats['zip_records_merged'] += 1
        else:
            # 新记录
            target_dict[record_id] = record
            stats['zip_records_added'] += 1
    
    # 保存合并后的记录
    merged_records = list(target_dict.values())
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(merged_records, f, ensure_ascii=False, indent=2)
    
    logger.info(f"ZIP 上传记录合并完成: 新增 {stats['zip_records_added']}, 更新 {stats['zip_records_merged']}")


def copy_document_files(source_dir, target_dir, project_name, stats):
    """复制文档文件"""
    # 获取源目录中的所有文件（排除 JSON 配置文件）
    excluded_extensions = {'.json'}
    
    for item in source_dir.iterdir():
        if item.is_file() and item.suffix.lower() not in excluded_extensions:
            target_file = target_dir / item.name
            
            if target_file.exists():
                # 文件已存在，比较修改时间
                source_stat = item.stat()
                target_stat = target_file.stat()
                
                if source_stat.st_mtime > target_stat.st_mtime:
                    # 源文件较新，备份旧文件
                    backup_name = f"{item.stem}_backup_{datetime.now().strftime('%Y%m%d%H%M%S')}{item.suffix}"
                    backup_file = target_dir / backup_name
                    shutil.move(str(target_file), str(backup_file))
                    shutil.copy2(str(item), str(target_file))
                    stats['files_backed_up'] += 1
                    stats['files_copied'] += 1
                    logger.debug(f"文件已更新: {item.name}")
                else:
                    # 目标文件较新或相同，跳过
                    logger.debug(f"文件已存在且较新，跳过: {item.name}")
            else:
                # 新文件，直接复制
                shutil.copy2(str(item), str(target_file))
                stats['files_copied'] += 1
                logger.debug(f"复制新文件: {item.name}")
    
    logger.info(f"文档文件复制完成: 复制 {stats['files_copied']}, 备份 {stats['files_backed_up']}")


def merge_update_project_info(source_dir, target_dir, stats):
    """合并项目数据时更新项目信息"""
    source_file = source_dir / 'project_info.json'
    target_file = target_dir / 'project_info.json'
    
    if not source_file.exists():
        return
    
    with open(source_file, 'r', encoding='utf-8') as f:
        source_info = json.load(f)
    
    target_info = {}
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_info = json.load(f)
    
    # 保留目标项目的基本信息（id, name, created_time）
    # 合并其他字段（如果源数据不为空则更新）
    fields_to_merge = ['description', 'party_a', 'party_b', 'supervisor', 'manager', 'duration']
    
    for field in fields_to_merge:
        if source_info.get(field) and not target_info.get(field):
            target_info[field] = source_info[field]
    
    # 更新 updated_time
    target_info['updated_time'] = datetime.now().isoformat()
    
    # 保存
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_info, f, ensure_ascii=False, indent=2)
    
    logger.info("项目信息更新完成")

# ==================== 项目数据合并功能结束 ====================


def preview_import_package():
    """
    预览导入的ZIP包
    接收ZIP文件，解压到临时目录，读取项目信息并返回，供前端显示冲突选项
    """
    try:
        from flask import request, jsonify
        import uuid
        import shutil
        from datetime import datetime
        from pathlib import Path
        import zipfile
        import json
        
        doc_manager = get_doc_manager()
        
        # 检查是否有文件上传
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        # 保存上传的ZIP到临时文件
        temp_id = str(uuid.uuid4())
        upload_folder = doc_manager.folders.upload_folder if doc_manager.folders else Path('uploads')
        temp_zip_path = upload_folder / 'temp' / f'preview_{temp_id}.zip'
        temp_zip_path.parent.mkdir(parents=True, exist_ok=True)
        file.save(str(temp_zip_path))
        
        # 解压ZIP到临时目录
        extract_dir = upload_folder / 'temp' / f'preview_{temp_id}'
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            with zipfile.ZipFile(temp_zip_path, 'r') as zip_file:
                zip_file.extractall(extract_dir)
        except zipfile.BadZipFile:
            shutil.rmtree(extract_dir, ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': '无效的ZIP文件'}), 400
        
        # 查找项目配置文件
        project_config_file = None
        project_info_file = None
        
        for json_file in extract_dir.rglob('*.json'):
            if json_file.name == 'project_config.json':
                project_config_file = json_file
                break
            elif json_file.name == 'project_info.json':
                project_info_file = json_file
        
        config_file = project_config_file or project_info_file
        
        if not config_file:
            shutil.rmtree(extract_dir, ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': 'ZIP包中未找到项目配置文件'}), 400
        
        # 读取项目配置
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
        except Exception as e:
            shutil.rmtree(extract_dir, ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': f'读取项目配置失败: {str(e)}'}), 400
        
        project_name = project_config.get('name', '')
        if not project_name:
            project_name = file.filename.replace('.zip', '')
        
        # 检查是否有同名项目
        existing_project = None
        try:
            projects = doc_manager.get_projects_list()
            for p in projects:
                if p.get('name') == project_name:
                    existing_project = p
                    break
        except:
            pass
        
        # 统计ZIP包中的文档数量
        doc_count = 0
        if 'documents' in project_config:
            for cycle_data in project_config['documents'].values():
                if isinstance(cycle_data, dict):
                    doc_count += len(cycle_data.get('uploaded_docs', []))
        
        # 获取周期数量
        cycle_count = len(project_config.get('cycles', []))
        
        # 构建响应
        result = {
            'status': 'success',
            'temp_id': temp_id,
            'project_info': {
                'name': project_name,
                'original_name': project_config.get('name', ''),
                'description': project_config.get('description', ''),
                'cycle_count': cycle_count,
                'doc_count': doc_count,
                'created_time': project_config.get('created_time', ''),
                'config': project_config
            },
            'conflict': {
                'has_conflict': existing_project is not None,
                'existing_project': existing_project,
                'message': f'项目"{project_name}"已存在' if existing_project else None
            }
        }
        
        # 不清理临时文件，留待实际导入时使用
        return jsonify(result)
        
    except Exception as e:
        import traceback
        logger.error(f"预览导入包失败: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_from_preview():
    """
    从预览的临时文件执行实际导入
    """
    try:
        from flask import request, jsonify
        import shutil
        from datetime import datetime
        from pathlib import Path
        import json
        
        doc_manager = get_doc_manager()
        
        data = request.get_json()
        temp_id = data.get('temp_id')
        conflict_action = data.get('conflict_action', 'rename')  # overwrite, rename, merge
        custom_name = data.get('custom_name', '')
        
        if not temp_id:
            return jsonify({'status': 'error', 'message': '缺少临时文件ID'}), 400
        
        # 检查临时文件是否存在
        upload_folder = doc_manager.folders.upload_folder if doc_manager.folders else Path('uploads')
        extract_dir = upload_folder / 'temp' / f'preview_{temp_id}'
        temp_zip_path = upload_folder / 'temp' / f'preview_{temp_id}.zip'
        
        if not extract_dir.exists():
            return jsonify({'status': 'error', 'message': '临时文件已过期，请重新上传'}), 400
        
        try:
            # 查找项目配置文件
            project_config_file = None
            project_info_file = None
            
            for json_file in extract_dir.rglob('*.json'):
                if json_file.name == 'project_config.json':
                    project_config_file = json_file
                    break
                elif json_file.name == 'project_info.json':
                    project_info_file = json_file
            
            config_file = project_config_file or project_info_file
            
            if not config_file:
                return jsonify({'status': 'error', 'message': '未找到项目配置文件'}), 400
            
            # 读取项目配置
            with open(config_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
            
            project_name = custom_name or project_config.get('name', '')
            if not project_name:
                return jsonify({'status': 'error', 'message': '项目名称不能为空'}), 400
            
            # 确定项目源目录
            if project_config_file:
                project_source_dir = project_config_file.parent
            elif project_info_file:
                project_source_dir = project_info_file.parent
            else:
                project_source_dir = extract_dir
            
            # 检查是否已存在同名项目
            existing_project = None
            projects = doc_manager.get_projects_list()
            for p in projects:
                if p.get('name') == project_name:
                    existing_project = p
                    break
            
            # 确定目标项目目录
            projects_base = doc_manager.config.projects_base_folder
            
            def find_project_dir(proj_id, proj_name):
                """查找现有项目目录"""
                possible_paths = [
                    projects_base / proj_id,
                    projects_base / proj_name,
                    projects_base / f"{proj_name}_{proj_id}",
                ]
                for path in possible_paths:
                    if path.exists() and path.is_dir():
                        return path
                return projects_base / proj_id
            
            if existing_project and conflict_action == 'overwrite':
                # 覆盖模式：删除现有项目，使用项目名称作为目录名
                project_id = existing_project['id']
                existing_name = existing_project.get('name', '')
                # 优先使用项目名称作为目录名
                target_project_dir = projects_base / existing_name
                # 如果项目名称目录不存在，尝试查找现有目录
                if not target_project_dir.exists():
                    target_project_dir = find_project_dir(project_id, existing_name)
                if target_project_dir.exists():
                    shutil.rmtree(str(target_project_dir))
            elif existing_project and conflict_action == 'merge':
                # 合并模式：保留现有项目ID，但使用项目名称作为目录名（与DataManager一致）
                project_id = existing_project['id']
                existing_name = existing_project.get('name', '')
                # 优先使用项目名称作为目录名，确保与DataManager一致
                target_project_dir = projects_base / existing_name
                # 如果项目名称目录不存在，尝试查找现有目录
                if not target_project_dir.exists():
                    target_project_dir = find_project_dir(project_id, existing_name)
            else:
                # 重命名模式或新项目：创建新项目ID
                if existing_project and not custom_name:
                    # 自动生成新名称
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    project_name = f"{project_name}_{timestamp}"
                
                project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
                target_project_dir = projects_base / project_name
            
            # 更新项目配置
            project_config['id'] = project_id
            project_config['name'] = project_name
            project_config['updated_time'] = datetime.now().isoformat()
            if not project_config.get('created_time'):
                project_config['created_time'] = datetime.now().isoformat()
            
            # 执行导入
            if existing_project and conflict_action == 'merge':
                # 合并数据
                merge_stats = merge_project_data(
                    project_source_dir,
                    target_project_dir,
                    project_name,
                    doc_manager
                )
                
                # 更新项目信息
                update_imported_project_info(target_project_dir, project_config)
                
                # 确保项目索引存在
                ensure_project_index(doc_manager, project_id, project_name, project_config)
                
                result = {
                    'status': 'success',
                    'message': f'项目数据合并完成',
                    'project_id': project_id,
                    'project_name': project_name,
                    'merged': True,
                    'merge_stats': merge_stats
                }
            else:
                # 复制项目目录
                if target_project_dir.exists():
                    shutil.rmtree(str(target_project_dir))
                shutil.copytree(str(project_source_dir), str(target_project_dir))
                
                # 更新项目信息文件
                update_imported_project_info(target_project_dir, project_config)
                
                # 确保项目索引存在
                ensure_project_index(doc_manager, project_id, project_name, project_config)
                
                result = {
                    'status': 'success',
                    'message': f'项目"{project_name}"导入成功',
                    'project_id': project_id,
                    'project_name': project_name,
                    'renamed': existing_project is not None and conflict_action != 'overwrite'
                }
            
            # 刷新项目管理的内存缓存（重要：否则新导入的项目在列表中不显示）
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                doc_manager.projects._load_projects_index()
            
            return jsonify(result)
            
        finally:
            # 清理临时文件
            shutil.rmtree(extract_dir, ignore_errors=True)
            if temp_zip_path.exists():
                temp_zip_path.unlink(missing_ok=True)
            
    except Exception as e:
        import traceback
        logger.error(f"导入项目失败: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_imported_project_info(project_dir, project_config):
    """导入项目后更新项目信息文件"""
    try:
        import json
        
        # 更新 project_info.json
        info_file = project_dir / 'project_info.json'
        if info_file.exists():
            with open(info_file, 'r', encoding='utf-8') as f:
                info = json.load(f)
        else:
            info = {}
        
        info.update({
            'id': project_config['id'],
            'name': project_config['name'],
            'updated_time': project_config['updated_time']
        })
        
        with open(info_file, 'w', encoding='utf-8') as f:
            json.dump(info, f, ensure_ascii=False, indent=2)
        
        # 更新 project_config.json
        config_file = project_dir / 'project_config.json'
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(project_config, f, ensure_ascii=False, indent=2)
            
    except Exception as e:
        logger.error(f"更新项目信息失败: {e}")


def ensure_project_index(doc_manager, project_id, project_name, project_config):
    """确保项目在索引中存在（兼容 ProjectManager 的旧格式）"""
    try:
        import json
        
        index_file = doc_manager.config.projects_base_folder / 'projects_index.json'
        
        # 使用与 ProjectManager._save_projects_index 兼容的旧格式
        # 格式: {project_id: project_info, ..., 'deleted_projects': {...}, 'updated_time': ...}
        index_data = {}
        
        if index_file.exists():
            with open(index_file, 'r', encoding='utf-8') as f:
                index_data = json.load(f)
        
        # 移除旧的同ID项目（如果有）
        if project_id in index_data and project_id != 'deleted_projects' and project_id != 'updated_time':
            del index_data[project_id]
        
        # 添加/更新项目条目（以项目ID为键）
        index_data[project_id] = {
            'id': project_id,
            'name': project_name,
            'description': project_config.get('description', ''),
            'created_time': project_config.get('created_time', ''),
            'updated_time': project_config.get('updated_time', '')
        }
        
        # 确保有 deleted_projects 和 updated_time 字段
        if 'deleted_projects' not in index_data:
            index_data['deleted_projects'] = {}
        index_data['updated_time'] = datetime.now().isoformat()
        
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)
            
    except Exception as e:
        logger.error(f"更新项目索引失败: {e}")
