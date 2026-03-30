"""任务路由模块 - 处理任务管理API"""

from flask import Blueprint, request, jsonify
from app.services.task_service import task_service

task_bp = Blueprint('task', __name__)

# 获取 doc_manager 的方式
def get_doc_manager():
    """获取文档管理器"""
    from app.routes.projects.utils import get_doc_manager as _get
    return _get()


@task_bp.route('/api/tasks/set-packaging', methods=['POST'])
def set_project_packaging():
    """设置项目为打包状态"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        doc_manager = get_doc_manager()
        success = doc_manager.projects.update_project_status(project_id, packaging=True)
        
        if success:
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@task_bp.route('/api/tasks/clear-packaging', methods=['POST'])
def clear_project_packaging():
    """清除项目打包状态"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        doc_manager = get_doc_manager()
        success = doc_manager.projects.update_project_status(project_id, packaging=False)
        
        if success:
            return jsonify({'status': 'success'})
        else:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@task_bp.route('/api/tasks/project-status/<project_id>', methods=['GET'])
def get_project_packaging_status(project_id):
    """获取项目打包状态"""
    try:
        doc_manager = get_doc_manager()
        status = doc_manager.projects.get_project_status(project_id)
        
        return jsonify({
            'status': 'success',
            'packaging': status['packaging'],
            'locked': status['locked'],
            'session_id': status['session_id'],
            'session_expire': status['session_expire']
        })
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@task_bp.route('/api/tasks/lock-project', methods=['POST'])
def lock_project():
    """锁定项目（防止多会话冲突）"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        session_id = data.get('session_id')
        
        if not project_id or not session_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 检查项目是否已被其他会话锁定
        status = doc_manager.projects.get_project_status(project_id)
        if status['locked'] and status['session_id'] != session_id:
            # 检查是否超时
            expire_time = status.get('session_expire')
            if expire_time:
                from datetime import datetime
                try:
                    expire_dt = datetime.fromisoformat(expire_time.replace('Z', '+00:00'))
                    if expire_dt > datetime.now():
                        return jsonify({
                            'status': 'error', 
                            'message': '项目已被其他会话锁定',
                            'locked': True
                        }), 409
                except:
                    pass
        
        # 锁定项目（5分钟超时）
        from datetime import datetime, timedelta
        expire_time = (datetime.now() + timedelta(minutes=5)).isoformat()
        
        success = doc_manager.projects.update_project_status(
            project_id, 
            locked=True, 
            session_id=session_id,
            session_expire=expire_time
        )
        
        if success:
            return jsonify({'status': 'success', 'session_expire': expire_time})
        else:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500




@task_bp.route('/api/tasks/unlock-project', methods=['POST'])
def unlock_project():
    """解锁项目"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        session_id = data.get('session_id')
        
        if not project_id or not session_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 检查是否是当前会话锁定
        status = doc_manager.projects.get_project_status(project_id)
        if status['locked'] and status['session_id'] == session_id:
            # 只有当前会话可以解锁
            doc_manager.projects.update_project_status(
                project_id, 
                locked=False, 
                session_id=None,
                session_expire=None
            )
        
        return jsonify({'status': 'success'})
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

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
        scope = data.get('scope', 'matched')  # 'archived' 或 'matched'
        
        if not project_id or not project_config:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = task_service.start_download_package_task(project_id, project_config, scope)
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


@task_bp.route('/api/tasks/test', methods=['GET'])
def test_task_bp():
    """测试任务蓝图是否正常工作"""
    return jsonify({'status': 'success', 'message': 'Task blueprint is working'})