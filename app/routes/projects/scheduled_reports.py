"""项目定时报告路由。"""

from flask import jsonify, request
from flask_login import current_user

from app.services.scheduled_report_service import scheduled_report_service


def _is_pmo_plus() -> bool:
    role = getattr(current_user, 'role', '')
    return role in ('admin', 'pmo', 'pmo_leader')


def _forbidden_resp():
    return jsonify({'status': 'error', 'message': '仅PMO及以上角色可配置定时报告'}), 403


def get_project_report_schedule(project_id):
    """获取项目定时报告配置（兼容旧接口）。"""
    try:
        detail = scheduled_report_service.get_schedule_detail(project_id)
        project = scheduled_report_service._load_project(project_id)  # noqa: SLF001 - 路由层展示用途
        return jsonify({
            'status': 'success',
            'data': detail.get('schedule', {}),
            'tasks': detail.get('tasks', []),
            'recipient_options': detail.get('recipient_options', []),
            'project_meta': {
                'party_b': project.get('party_b', ''),
                'project_name': project.get('name', project_id),
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_project_report_schedule(project_id):
    """更新项目定时报告配置（兼容旧接口：更新第一条任务）。"""
    try:
        if not _is_pmo_plus():
            return _forbidden_resp()

        data = request.get_json() or {}
        schedule = scheduled_report_service.update_schedule(project_id, data)
        return jsonify({'status': 'success', 'data': schedule, 'message': '定时报告配置已保存'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def run_project_report_now(project_id):
    """立即执行一次报告发送（兼容旧接口：执行默认任务）。"""
    try:
        if not _is_pmo_plus():
            return jsonify({'status': 'error', 'message': '仅PMO及以上角色可手动执行'}), 403

        requester_user_id = int(getattr(current_user, 'id', 0) or 0)
        result = scheduled_report_service.run_now(project_id, requester_user_id=requester_user_id)
        code = 200 if result.get('status') == 'success' else 400
        return jsonify(result), code
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def list_project_report_tasks(project_id):
    """获取项目定时报告任务列表。"""
    try:
        detail = scheduled_report_service.get_schedule_detail(project_id)
        project = scheduled_report_service._load_project(project_id)  # noqa: SLF001 - 路由层展示用途
        return jsonify({
            'status': 'success',
            'tasks': detail.get('tasks', []),
            'recipient_options': detail.get('recipient_options', []),
            'project_meta': {
                'party_b': project.get('party_b', ''),
                'project_name': project.get('name', project_id),
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def create_project_report_task(project_id):
    """创建项目定时报告任务。"""
    try:
        if not _is_pmo_plus():
            return _forbidden_resp()
        data = request.get_json() or {}
        task = scheduled_report_service.create_task(project_id, data)
        return jsonify({'status': 'success', 'data': task, 'message': '任务已创建'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_project_report_task(project_id, task_id):
    """更新项目定时报告任务。"""
    try:
        if not _is_pmo_plus():
            return _forbidden_resp()
        data = request.get_json() or {}
        task = scheduled_report_service.update_task(project_id, task_id, data)
        return jsonify({'status': 'success', 'data': task, 'message': '任务已更新'})
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_project_report_task(project_id, task_id):
    """删除项目定时报告任务。"""
    try:
        if not _is_pmo_plus():
            return _forbidden_resp()
        ok = scheduled_report_service.delete_task(project_id, task_id)
        if not ok:
            return jsonify({'status': 'error', 'message': '任务不存在'}), 404
        return jsonify({'status': 'success', 'message': '任务已删除'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def toggle_project_report_task(project_id, task_id):
    """启用/停用项目定时报告任务。"""
    try:
        if not _is_pmo_plus():
            return _forbidden_resp()
        data = request.get_json() or {}
        enabled = bool(data.get('enabled', False))
        task = scheduled_report_service.set_task_enabled(project_id, task_id, enabled)
        return jsonify({'status': 'success', 'data': task, 'message': '任务状态已更新'})
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def run_project_report_task_now(project_id, task_id):
    """立即执行指定任务。"""
    try:
        if not _is_pmo_plus():
            return jsonify({'status': 'error', 'message': '仅PMO及以上角色可手动执行'}), 403

        requester_user_id = int(getattr(current_user, 'id', 0) or 0)
        result = scheduled_report_service.run_now(project_id, requester_user_id=requester_user_id, task_id=task_id)
        code = 200 if result.get('status') == 'success' else 400
        return jsonify(result), code
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
