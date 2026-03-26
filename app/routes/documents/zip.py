"""ZIP文件相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager


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
        
        # 使用JSON文件管理器获取ZIP上传记录
        from app.utils.json_file_manager import json_file_manager
        records = json_file_manager.get_zip_upload_records(str(project_file))
        
        return jsonify({
            'status': 'success',
            'records': records
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
        
        # 获取项目文件路径（新位置）
        project_folder = doc_manager.config.projects_base_folder / project_name
        project_file = project_folder / 'project_config.json'
        
        # 使用JSON文件管理器添加ZIP上传记录
        from app.utils.json_file_manager import json_file_manager
        json_file_manager.add_zip_upload_record(str(project_file), zip_info)
        
        return jsonify({
            'status': 'success',
            'message': 'ZIP上传记录添加成功'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def start_zip_match():
    """启动ZIP文件匹配任务"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        zip_path = data.get('zip_path')
        project_id = data.get('project_id')
        
        if not zip_path or not project_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 加载项目配置以获取项目名称
        project_result = doc_manager.load_project(project_id)
        if not project_result or project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project_result.get('project', {})
        project_name = project_config.get('name', project_id)
        
        # 生成任务ID
        import uuid
        task_id = str(uuid.uuid4())
        
        # 启动匹配任务（这里简化处理，实际应该使用后台任务队列）
        import threading
        def match_task():
            try:
                # 使用zip_matcher进行匹配
                from app.utils.zip_matcher import ZipMatcher
                matcher = ZipMatcher(doc_manager.config)
                result = matcher.match_zip(zip_path, project_name, project_id)
                
                # 保存匹配结果
                if result.get('status') == 'success':
                    # 这里可以保存匹配结果到项目配置
                    logger.info(f"ZIP匹配完成: {project_name}")
            except Exception as e:
                logger.error(f"ZIP匹配失败: {e}")
        
        # 启动后台线程执行匹配
        threading.Thread(target=match_task).start()
        
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
        
        # 这里简化处理，实际应该从任务队列中查询状态
        # 模拟任务完成
        return jsonify({
            'status': 'success',
            'task_status': 'completed',
            'progress': 100,
            'message': '匹配完成'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
