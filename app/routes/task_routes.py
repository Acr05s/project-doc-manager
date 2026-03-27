"""任务路由模块 - 处理任务管理API"""

from flask import Blueprint, request, jsonify
from app.services.task_service import task_service

task_bp = Blueprint('task', __name__)

@task_bp.route('/api/tasks', methods=['GET'])
def get_tasks():
    """获取所有任务"""
    try:
        tasks = task_service.list_tasks()
        return jsonify({
            'status': 'success',
            'tasks': tasks
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@task_bp.route('/api/tasks/<task_id>', methods=['GET'])
def get_task(task_id):
    """获取单个任务状态"""
    try:
        task = task_service.get_task_status(task_id)
        if task:
            return jsonify({
                'status': 'success',
                'task': task
            })
        else:
            return jsonify({'status': 'error', 'message': '任务不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@task_bp.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    """取消任务"""
    try:
        success = task_service.cancel_task(task_id)
        if success:
            return jsonify({
                'status': 'success',
                'message': '任务已取消'
            })
        else:
            return jsonify({'status': 'error', 'message': '任务不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@task_bp.route('/api/tasks/package', methods=['POST'])
def start_package_task():
    """启动打包项目任务"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        project_config = data.get('project_config')
        
        if not project_id or not project_config:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = task_service.start_package_task(project_id, project_config)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@task_bp.route('/api/tasks/export', methods=['POST'])
def start_export_task():
    """启动导出需求清单任务"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        project_config = data.get('project_config')
        
        if not project_id or not project_config:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = task_service.start_export_task(project_id, project_config)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@task_bp.route('/api/tasks/report', methods=['POST'])
def start_report_task():
    """启动生成报告任务"""
    try:
        data = request.get_json()
        project_config = data.get('project_config')
        
        if not project_config:
            return jsonify({'status': 'error', 'message': '缺少项目配置'}), 400
        
        result = task_service.start_report_task(project_config)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@task_bp.route('/api/tasks/check', methods=['POST'])
def start_check_task():
    """启动检查异常任务"""
    try:
        data = request.get_json()
        project_config = data.get('project_config')
        
        if not project_config:
            return jsonify({'status': 'error', 'message': '缺少项目配置'}), 400
        
        result = task_service.start_check_task(project_config)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@task_bp.route('/api/tasks/download-package', methods=['POST'])
def start_download_package_task():
    """启动下载打包任务"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        project_config = data.get('project_config')
        
        if not project_id or not project_config:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = task_service.start_download_package_task(project_id, project_config)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@task_bp.route('/api/tasks/download/<task_id>', methods=['GET'])
def download_task_package(task_id):
    """下载任务生成的包"""
    try:
        from flask import send_file
        from pathlib import Path
        
        task = task_service.get_task_status(task_id)
        if not task or task.get('status') != 'completed':
            return jsonify({'status': 'error', 'message': '任务不存在或未完成'}), 404
        
        result = task.get('result', {})
        package_path = result.get('package_path')
        
        if not package_path or not Path(package_path).exists():
            return jsonify({'status': 'error', 'message': '文件不存在'}), 404
        
        return send_file(
            package_path,
            mimetype='application/zip',
            as_attachment=True,
            download_name=result.get('package_filename', 'package.zip')
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500