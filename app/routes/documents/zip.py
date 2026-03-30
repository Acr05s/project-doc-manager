"""ZIP文件相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager
import threading
import uuid
from datetime import datetime
from pathlib import Path

# 任务存储（使用JSON文件持久化）
import json
import os

def _get_tasks_file():
    """获取任务存储文件路径"""
    tasks_dir = Path('uploads/tasks')
    tasks_dir.mkdir(parents=True, exist_ok=True)
    return tasks_dir / 'zip_match_tasks.json'

def _load_tasks():
    """加载所有任务"""
    tasks_file = _get_tasks_file()
    if tasks_file.exists():
        try:
            with open(tasks_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def _save_tasks(tasks):
    """保存所有任务"""
    tasks_file = _get_tasks_file()
    with open(tasks_file, 'w', encoding='utf-8') as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)

def _get_task(task_id):
    """获取单个任务"""
    tasks = _load_tasks()
    return tasks.get(task_id)

def _update_task(task_id, task_data):
    """更新单个任务"""
    tasks = _load_tasks()
    tasks[task_id] = task_data
    _save_tasks(tasks)

# 内存缓存（用于快速访问）
zip_match_tasks = {}


def get_zip_records():
    """获取ZIP上传记录"""
    try:
        doc_manager = get_doc_manager()
        project_id = request.args.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 加载项目配置以获取项目名称
        project_result = doc_manager.load_project(project_id)
        if not project_result or project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project_result.get('project', {})
        project_name = project_config.get('name', project_id)
        
        # 获取项目文件路径（新位置）
        project_folder = doc_manager.config.projects_base_folder / project_name
        project_file = project_folder / 'project_config.json'
        zip_uploads_file = project_folder / 'zip_uploads.json'
        
        print(f"[get_zip_records] 项目ID: {project_id}, 项目名称: {project_name}", flush=True)
        print(f"[get_zip_records] 项目文件夹: {project_folder}, 存在: {project_folder.exists()}", flush=True)
        print(f"[get_zip_records] ZIP记录文件: {zip_uploads_file}, 存在: {zip_uploads_file.exists()}", flush=True)
        
        # 使用JSON文件管理器获取ZIP上传记录
        from app.utils.json_file_manager import json_file_manager
        records = json_file_manager.get_zip_upload_records(str(project_file))
        
        print(f"[get_zip_records] 读取到 {len(records)} 条记录", flush=True)
        
        # 格式化记录，兼容旧数据格式
        formatted_records = []
        for record in records:
            if isinstance(record, dict):
                # 兼容旧格式：将 zip_path/total_files 映射到新格式
                formatted_records.append({
                    'id': record.get('id', str(uuid.uuid4())[:8]),
                    'name': record.get('name') or Path(record.get('zip_path', '')).stem or '未知',
                    'path': record.get('path') or record.get('zip_path', ''),
                    'file_count': record.get('file_count', record.get('total_files', 0)),
                    'matched_count': record.get('matched_count', 0),
                    'status': record.get('status', 'completed'),
                    'upload_time': record.get('upload_time', '')
                })
        
        return jsonify({
            'status': 'success',
            'records': formatted_records
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def add_zip_record():
    """添加ZIP上传记录"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        project_id = data.get('project_id')
        zip_info = data.get('zip_info')
        
        if not project_id or not zip_info:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 加载项目配置以获取项目名称
        project_result = doc_manager.load_project(project_id)
        if not project_result or project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project_result.get('project', {})
        project_name = project_config.get('name', project_id)
        
        # 获取项目文件路径
        project_folder = doc_manager.config.projects_base_folder / project_name
        project_file = project_folder / 'project_config.json'
        
        # 使用JSON文件管理器添加ZIP上传记录
        from app.utils.json_file_manager import json_file_manager
        json_file_manager.add_zip_upload_record(str(project_file), zip_info)
        
        return jsonify({
            'status': 'success',
            'message': 'ZIP记录添加成功'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_zip_record(zip_id):
    """删除ZIP上传记录"""
    try:
        doc_manager = get_doc_manager()
        project_id = request.args.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 加载项目配置以获取项目名称
        project_result = doc_manager.load_project(project_id)
        if not project_result or project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project_result.get('project', {})
        project_name = project_config.get('name', project_id)
        
        # 获取项目文件路径（新位置）
        project_folder = doc_manager.config.projects_base_folder / project_name
        project_file = project_folder / 'project_config.json'
        
        # 使用JSON文件管理器删除ZIP上传记录
        from app.utils.json_file_manager import json_file_manager
        success = json_file_manager.delete_zip_upload_record(str(project_file), zip_id)
        
        if success:
            return jsonify({'status': 'success', 'message': 'ZIP上传记录删除成功'})
        else:
            return jsonify({'status': 'error', 'message': 'ZIP上传记录删除失败'}), 500
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def start_zip_match():
    """启动ZIP文件匹配任务"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        zip_path = data.get('zip_path')
        
        if not project_id or not zip_path:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 获取doc_manager
        doc_manager = get_doc_manager()
        
        # 加载项目配置
        project_result = doc_manager.load_project(project_id)
        if not project_result or project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project_result.get('project', {})
        project_name = project_config.get('name', project_id)
        
        # 创建任务ID
        task_id = str(uuid.uuid4())
        
        # 初始化任务状态（同时保存到内存和文件）
        task_data = {
            'id': task_id,
            'status': 'running',
            'progress': 0,
            'message': '正在启动匹配任务...',
            'result': None,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        zip_match_tasks[task_id] = task_data
        _update_task(task_id, task_data)
        
        # 在后台线程执行匹配
        def do_match():
            import logging
            logger = logging.getLogger(__name__)
            
            try:
                from app.utils.zip_matcher import ZipMatcher
                from app.utils.json_file_manager import json_file_manager
                from pathlib import Path
                
                print(f"[ZIP匹配] 开始执行任务 {task_id}", flush=True)
                logger.info(f"[ZIP匹配] 开始执行任务 {task_id}")
                
                print(f"[ZIP匹配] ZIP路径: {zip_path}", flush=True)
                logger.info(f"[ZIP匹配] ZIP路径: {zip_path}")
                
                print(f"[ZIP匹配] 项目ID: {project_id}, 项目名称: {project_name}", flush=True)
                logger.info(f"[ZIP匹配] 项目ID: {project_id}, 项目名称: {project_name}")
                
                # 创建matcher，使用与doc_manager相同的配置
                upload_folder = getattr(doc_manager.config, 'upload_folder', 'uploads')
                projects_base_folder = getattr(doc_manager.config, 'projects_base_folder', 'projects')
                matcher = ZipMatcher({
                    'upload_folder': str(upload_folder),
                    'projects_base_folder': str(projects_base_folder)
                })
                
                print(f"[ZIP匹配] ZipMatcher 创建成功")
                
                # 进度回调函数
                def progress_callback(progress, message):
                    zip_match_tasks[task_id]['progress'] = progress
                    zip_match_tasks[task_id]['message'] = message
                    zip_match_tasks[task_id]['updated_at'] = datetime.now().isoformat()
                    # 同时保存到文件
                    _update_task(task_id, zip_match_tasks[task_id])
                
                # 执行匹配
                print(f"[ZIP匹配] 开始执行 extract_and_match", flush=True)
                logger.info("[ZIP匹配] 开始执行 extract_and_match")
                
                try:
                    result = matcher.extract_and_match(
                        zip_path=zip_path,
                        project_config=project_config,
                        progress_callback=progress_callback,
                        project_name=project_name,
                        skip_archived=True
                    )
                    
                    if result is None:
                        raise Exception("匹配返回空结果")
                    
                    status = result.get('status', 'unknown')
                    print(f"[ZIP匹配] extract_and_match 结果: {status}", flush=True)
                    logger.info(f"[ZIP匹配] extract_and_match 结果: {status}")
                    
                except Exception as match_error:
                    print(f"[ZIP匹配] extract_and_match 异常: {match_error}", flush=True)
                    logger.error(f"[ZIP匹配] extract_and_match 异常: {match_error}")
                    import traceback
                    traceback.print_exc()
                    result = {'status': 'error', 'message': str(match_error)}
                
                if result['status'] == 'success':
                    # 保存项目配置（包含匹配结果）
                    print(f"[ZIP匹配] 保存项目配置")
                    save_result = doc_manager.save_project(project_config)
                    print(f"[ZIP匹配] 项目配置保存结果: {save_result}")
                    
                    # 添加ZIP上传记录
                    try:
                        project_folder = doc_manager.config.projects_base_folder / project_name
                        zip_uploads_file = project_folder / 'zip_uploads.json'
                        
                        print(f"[ZIP匹配] ZIP记录文件路径: {zip_uploads_file}", flush=True)
                        
                        # 生成唯一ID
                        zip_id = str(uuid.uuid4())[:8]
                        
                        # 从 zip_path 提取文件名作为 name
                        zip_name = Path(zip_path).stem
                        
                        zip_info = {
                            'id': zip_id,
                            'name': zip_name,
                            'path': zip_path,
                            'upload_time': datetime.now().isoformat(),
                            'file_count': result.get('total_files', 0),
                            'matched_count': result.get('matched_count', 0),
                            'status': 'completed'
                        }
                        
                        print(f"[ZIP匹配] 准备写入ZIP记录: {zip_info}", flush=True)
                        
                        # 直接读取和写入文件
                        zip_records = []
                        if zip_uploads_file.exists():
                            try:
                                with open(zip_uploads_file, 'r', encoding='utf-8') as f:
                                    zip_records = json.load(f)
                                    if not isinstance(zip_records, list):
                                        zip_records = []
                            except Exception as read_err:
                                print(f"[ZIP匹配] 读取现有记录失败: {read_err}", flush=True)
                                zip_records = []
                        
                        # 去重：同名文件只保留最新
                        zip_records = [r for r in zip_records if r.get('name') != zip_name]
                        zip_records.append(zip_info)
                        
                        with open(zip_uploads_file, 'w', encoding='utf-8') as f:
                            json.dump(zip_records, f, ensure_ascii=False, indent=2)
                        
                        print(f"[ZIP匹配] ZIP记录添加成功，共 {len(zip_records)} 条记录", flush=True)
                    except Exception as e:
                        print(f"[ZIP匹配] 添加ZIP记录异常: {e}", flush=True)
                        import traceback
                        traceback.print_exc()
                    
                    # 更新任务状态为完成
                    zip_match_tasks[task_id]['status'] = 'completed'
                    zip_match_tasks[task_id]['progress'] = 100
                    zip_match_tasks[task_id]['message'] = '匹配完成'
                    zip_match_tasks[task_id]['result'] = {
                        'total_files': result.get('total_files', 0),
                        'matched_count': result.get('matched_count', 0),
                        'unmatched_count': result.get('unmatched_count', 0),
                        'archived_files': result.get('archived_files', [])
                    }
                else:
                    # 匹配失败
                    zip_match_tasks[task_id]['status'] = 'failed'
                    zip_match_tasks[task_id]['message'] = result.get('message', '匹配失败')
                
                zip_match_tasks[task_id]['updated_at'] = datetime.now().isoformat()
                # 保存到文件
                _update_task(task_id, zip_match_tasks[task_id])
                
            except Exception as e:
                error_msg = f"[ZIP匹配] 任务异常: {e}"
                print(error_msg, flush=True)
                logger.error(error_msg)
                import traceback
                traceback.print_exc()
                zip_match_tasks[task_id]['status'] = 'failed'
                zip_match_tasks[task_id]['message'] = str(e)
                zip_match_tasks[task_id]['updated_at'] = datetime.now().isoformat()
                # 保存到文件
                _update_task(task_id, zip_match_tasks[task_id])
        
        # 启动后台线程
        print(f"[ZIP匹配] 启动后台线程执行任务 {task_id}", flush=True)
        thread = threading.Thread(target=do_match)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'status': 'success',
            'task_id': task_id
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_zip_match_status():
    """获取ZIP文件匹配任务状态"""
    try:
        task_id = request.args.get('task_id')
        
        if not task_id:
            return jsonify({'status': 'error', 'message': '缺少任务ID'}), 400
        
        # 先从内存缓存获取
        task = zip_match_tasks.get(task_id)
        
        # 如果内存中没有，从文件读取
        if not task:
            task = _get_task(task_id)
            if task:
                # 同时更新内存缓存
                zip_match_tasks[task_id] = task
        
        if not task:
            return jsonify({'status': 'error', 'message': '任务不存在'}), 404
        
        return jsonify({
            'status': 'success',
            'task_status': task['status'],
            'progress': task['progress'],
            'message': task['message'],
            'result': task.get('result')
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def check_zip_chunk():
    """检查已上传的分片（断点续传）"""
    try:
        from pathlib import Path
        
        filename = request.args.get('filename')
        file_id = request.args.get('fileId', 'default')
        
        if not filename:
            return jsonify({'status': 'error', 'message': '文件名不能为空'}), 400
        
        UPLOAD_TEMP_FOLDER = Path('uploads/temp_chunks')
        UPLOAD_TEMP_FOLDER.mkdir(parents=True, exist_ok=True)
        
        temp_dir = UPLOAD_TEMP_FOLDER / f"{filename}_{file_id}"
        
        if not temp_dir.exists():
            return jsonify({'status': 'success', 'uploaded_chunks': []})
        
        # 获取已上传的分片
        uploaded = []
        for chunk in temp_dir.glob('chunk_*'):
            try:
                index = int(chunk.name.split('_')[1])
                uploaded.append(index)
            except (ValueError, IndexError):
                continue
        
        return jsonify({
            'status': 'success',
            'uploaded_chunks': sorted(uploaded)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
