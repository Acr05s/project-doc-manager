"""项目定时报告路由。"""

from flask import jsonify, request
from flask_login import current_user

from app.services.scheduled_report_service import scheduled_report_service


def _is_pmo_plus() -> bool:
    role = getattr(current_user, 'role', '')
    return role in ('admin', 'pmo', 'pmo_leader')


def get_project_report_schedule(project_id):
    """获取项目定时报告配置。"""
    try:
        detail = scheduled_report_service.get_schedule_detail(project_id)
        return jsonify({'status': 'success', 'data': detail.get('schedule', {}), 'recipient_options': detail.get('recipient_options', [])})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_project_report_schedule(project_id):
    """更新项目定时报告配置（仅 PMO 及以上）。"""
    try:
        if not _is_pmo_plus():
            return jsonify({'status': 'error', 'message': '仅PMO及以上角色可配置定时报告'}), 403

        data = request.get_json() or {}
        schedule = scheduled_report_service.update_schedule(project_id, data)
        return jsonify({'status': 'success', 'data': schedule, 'message': '定时报告配置已保存'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def run_project_report_now(project_id):
    """立即执行一次报告发送（仅 PMO 及以上）。"""
    try:
        if not _is_pmo_plus():
            return jsonify({'status': 'error', 'message': '仅PMO及以上角色可手动执行'}), 403

        requester_user_id = int(getattr(current_user, 'id', 0) or 0)
        result = scheduled_report_service.run_now(project_id, requester_user_id=requester_user_id)
        code = 200 if result.get('status') == 'success' else 400
        return jsonify(result), code
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
