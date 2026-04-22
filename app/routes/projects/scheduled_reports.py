"""项目定时报告路由。"""

from flask import jsonify, request
from flask_login import current_user

from app.services.scheduled_report_service import scheduled_report_service
from app.models.user import user_manager


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
        resp = jsonify({
            'status': 'success',
            'data': detail.get('schedule', {}),
            'tasks': detail.get('tasks', []),
            'recipient_options': detail.get('recipient_options', []),
            'project_meta': {
                'party_b': project.get('party_b', ''),
                'project_name': project.get('name', project_id),
            }
        })
        resp.headers['Cache-Control'] = 'no-store'
        return resp
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
        tasks = detail.get('tasks', [])
        for t in tasks:
            t['_next_execution'] = scheduled_report_service.calc_next_execution_time(t)
        return jsonify({
            'status': 'success',
            'tasks': tasks,
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
        data.setdefault('created_by_user_id', int(getattr(current_user, 'id', 0) or 0))
        data.setdefault('created_by_username', str(getattr(current_user, 'username', '') or ''))
        data.setdefault('created_by_display_name', str(getattr(current_user, 'display_name', '') or getattr(current_user, 'username', '') or ''))
        data.setdefault('created_by_organization', str(getattr(current_user, 'organization', '') or ''))
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


def skip_next_project_report_task(project_id, task_id):
    """跳过指定任务的下一次执行。"""
    try:
        if not _is_pmo_plus():
            return _forbidden_resp()
        result = scheduled_report_service.skip_next_execution(project_id, task_id)
        code = 200 if result.get('status') == 'success' else 400
        return jsonify(result), code
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def list_all_report_tasks():
    """获取全平台所有定时报告任务（平台级功能）。"""
    try:
        tasks = scheduled_report_service.list_all_tasks()
        # 附加项目元信息
        enriched = []
        for task in tasks:
            project_id = str(task.get('project_id') or '')
            project = scheduled_report_service._load_project(project_id) if project_id else {}  # noqa: SLF001
            recipient_options = scheduled_report_service._build_project_recipient_options(project) if project else []  # noqa: SLF001
            task['_project_name'] = project.get('name', project_id)
            task['_party_b'] = project.get('party_b', '')
            task['_recipient_options'] = recipient_options
            task['_creator_name'] = task.get('created_by_display_name') or task.get('created_by_username') or '-'
            task['_next_execution'] = scheduled_report_service.calc_next_execution_time(task)
            enriched.append(task)
        resp = jsonify({'status': 'success', 'tasks': enriched})
        resp.headers['Cache-Control'] = 'no-store'
        return resp
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_report_send_history():
    """获取定时报告发送历史记录。"""
    try:
        project_id = request.args.get('project_id', '').strip()
        limit = request.args.get('limit', 200, type=int)
        offset = request.args.get('offset', 0, type=int)
        days = request.args.get('days', 0, type=int)  # 最近N天

        result = user_manager.get_operation_logs(
            limit=limit,
            offset=offset,
            operation_types=['scheduled_report_send'],
        )

        if result.get('status') != 'success':
            return jsonify(result), 500

        logs = result.get('logs', [])

        # 按 project_id 过滤（target_id 存储的是 project_id）
        if project_id:
            logs = [log for log in logs if str(log.get('target_id', '')).strip() == project_id]

        # 按日期范围过滤
        if days > 0:
            from datetime import datetime, timedelta
            cutoff = datetime.now() - timedelta(days=days)
            cutoff_str = cutoff.strftime('%Y-%m-%d %H:%M:%S')
            filtered = []
            for log in logs:
                op_time = str(log.get('operation_time', '') or '').replace('T', ' ')[:19]
                if op_time >= cutoff_str:
                    filtered.append(log)
            logs = filtered

        # 丰富日志信息：解析 details JSON
        enriched = []
        import json as _json
        for log in logs:
            entry = dict(log)
            details_raw = str(log.get('details', '') or '')
            try:
                details_obj = _json.loads(details_raw)
                entry['frequency'] = details_obj.get('frequency', '-')
                entry['success_count'] = details_obj.get('success_count', 0)
                entry['total'] = details_obj.get('total', 0)
                entry['period_start'] = details_obj.get('period_start', '')
                entry['period_end'] = details_obj.get('period_end', '')
                entry['recipients'] = details_obj.get('recipients', [])
                entry['site_receivers'] = details_obj.get('site_receivers', [])
                entry['site_sent_count'] = details_obj.get('site_sent_count', 0)
                entry['site_total'] = details_obj.get('site_total', 0)
                entry['email_enabled'] = details_obj.get('email_enabled', True)
                entry['in_app_enabled'] = details_obj.get('in_app_enabled', True)
            except Exception:
                entry['frequency'] = '-'
                entry['success_count'] = 0
                entry['total'] = 0
                entry['period_start'] = ''
                entry['period_end'] = ''
            entry['trigger_type'] = '自动' if log.get('username', '') == 'system_scheduler' else '手动'
            enriched.append(entry)

        total = len(enriched)
        return jsonify({'status': 'success', 'logs': enriched, 'total': total})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_holiday_status():
    """获取中国法定节假日数据状态。"""
    try:
        from app.services.china_holidays import get_holiday_status as _get_status
        status = _get_status()
        return jsonify({'status': 'success', 'data': status})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_holiday_data():
    """手动更新中国法定节假日数据（从在线API获取）。"""
    try:
        if not _is_pmo_plus():
            return _forbidden_resp()

        data = request.get_json() or {}
        year = data.get('year')
        if year is not None:
            year = int(year)

        from app.services.china_holidays import fetch_holidays_from_api
        result = fetch_holidays_from_api(year)

        if result.get('status') == 'success':
            return jsonify({'status': 'success', 'message': result['message'], 'data': result})
        else:
            return jsonify({'status': 'error', 'message': result.get('message', '获取失败')}), 400
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
