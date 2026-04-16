"""定时报告服务：周报/月报邮件发送与PDF附件生成。"""

import json
import logging
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.models.user import user_manager
from app.models.message import message_manager
from app.routes.settings import now_with_timezone
from app.utils.notification import send_email

logger = logging.getLogger(__name__)


class ScheduledReportService:
    """项目周报/月报定时任务服务。"""

    def __init__(self):
        self.doc_manager = None
        self._lock = threading.RLock()
        self._started = False
        self._stop_event = threading.Event()
        self._schedules_file = Path('uploads/tasks/report_schedules.json')
        self._schedules_file.parent.mkdir(parents=True, exist_ok=True)
        self._schedules: Dict[str, Dict[str, Any]] = {}
        self._load_schedules()

    def set_doc_manager(self, manager):
        self.doc_manager = manager
        self.start_scheduler()

    def start_scheduler(self):
        if self._started:
            return
        self._started = True
        t = threading.Thread(target=self._scheduler_loop, daemon=True)
        t.start()
        logger.info('[ScheduledReportService] scheduler started')

    def stop_scheduler(self):
        self._stop_event.set()

    def _load_schedules(self):
        if not self._schedules_file.exists():
            self._schedules = {}
            return
        try:
            with open(self._schedules_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict):
                self._schedules = data
            else:
                self._schedules = {}
        except Exception as e:
            logger.warning(f'[ScheduledReportService] load schedules failed: {e}')
            self._schedules = {}

    def _save_schedules(self):
        try:
            with open(self._schedules_file, 'w', encoding='utf-8') as f:
                json.dump(self._schedules, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f'[ScheduledReportService] save schedules failed: {e}')

    def get_schedule(self, project_id: str) -> Dict[str, Any]:
        with self._lock:
            cfg = self._schedules.get(project_id, {}).copy()
        if not cfg:
            return {
                'enabled': False,
                'frequency': 'weekly',
                'send_time': '09:00',
                'weekday': 1,
                'day_of_month': 1,
                'include_pdf': True,
                'in_app_message_enabled': True,
                'login_popup_enabled': True,
                'external_emails': [],
                'last_run_key': ''
            }
        cfg.setdefault('enabled', False)
        cfg.setdefault('frequency', 'weekly')
        cfg.setdefault('send_time', '09:00')
        cfg.setdefault('weekday', 1)
        cfg.setdefault('day_of_month', 1)
        cfg.setdefault('include_pdf', True)
        cfg.setdefault('in_app_message_enabled', True)
        cfg.setdefault('login_popup_enabled', True)
        cfg.setdefault('external_emails', [])
        cfg.setdefault('last_run_key', '')
        return cfg

    def update_schedule(self, project_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            cfg = self.get_schedule(project_id)
            cfg['enabled'] = bool(data.get('enabled', cfg['enabled']))
            frequency = str(data.get('frequency', cfg['frequency'])).strip()
            if frequency not in ('weekly', 'monthly'):
                frequency = 'weekly'
            cfg['frequency'] = frequency

            send_time = str(data.get('send_time', cfg['send_time'])).strip()
            if len(send_time) != 5 or ':' not in send_time:
                send_time = '09:00'
            cfg['send_time'] = send_time

            try:
                cfg['weekday'] = min(7, max(1, int(data.get('weekday', cfg['weekday']))))
            except Exception:
                cfg['weekday'] = 1
            try:
                cfg['day_of_month'] = min(28, max(1, int(data.get('day_of_month', cfg['day_of_month']))))
            except Exception:
                cfg['day_of_month'] = 1

            cfg['include_pdf'] = bool(data.get('include_pdf', cfg['include_pdf']))
            cfg['in_app_message_enabled'] = bool(data.get('in_app_message_enabled', cfg.get('in_app_message_enabled', True)))
            cfg['login_popup_enabled'] = bool(data.get('login_popup_enabled', cfg.get('login_popup_enabled', True)))

            ext = data.get('external_emails', cfg.get('external_emails', []))
            if isinstance(ext, str):
                ext = [x.strip() for x in ext.replace('，', ',').split(',') if x.strip()]
            elif isinstance(ext, list):
                ext = [str(x).strip() for x in ext if str(x).strip()]
            else:
                ext = []
            cfg['external_emails'] = ext

            self._schedules[project_id] = cfg
            self._save_schedules()
            return cfg

    def run_now(self, project_id: str, requester_user_id: Optional[int] = None) -> Dict[str, Any]:
        return self._run_project_report(project_id, manual=True, requester_user_id=requester_user_id)

    def _scheduler_loop(self):
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as e:
                logger.error(f'[ScheduledReportService] tick failed: {e}')
            self._stop_event.wait(30)

    def _tick(self):
        now = now_with_timezone()
        project_ids = self._list_project_ids()
        for project_id in project_ids:
            cfg = self.get_schedule(project_id)
            if not cfg.get('enabled'):
                continue
            if self._is_due(cfg, now):
                run_key = self._build_run_key(cfg, now)
                if run_key and cfg.get('last_run_key') == run_key:
                    continue
                result = self._run_project_report(project_id, manual=False)
                if result.get('status') == 'success':
                    with self._lock:
                        fresh = self.get_schedule(project_id)
                        fresh['last_run_key'] = run_key
                        self._schedules[project_id] = fresh
                        self._save_schedules()

    def _list_project_ids(self) -> List[str]:
        if not self.doc_manager:
            return []
        try:
            projects_obj = getattr(self.doc_manager, 'projects', None)
            projects_db = getattr(projects_obj, 'projects_db', {}) if projects_obj else {}
            if isinstance(projects_db, dict):
                return list(projects_db.keys())
        except Exception:
            pass
        return []

    def _is_due(self, cfg: Dict[str, Any], now: datetime) -> bool:
        send_time = str(cfg.get('send_time', '09:00'))
        try:
            hour = int(send_time.split(':')[0])
            minute = int(send_time.split(':')[1])
        except Exception:
            hour, minute = 9, 0

        if now.hour != hour or now.minute != minute:
            return False

        frequency = cfg.get('frequency', 'weekly')
        if frequency == 'weekly':
            weekday = int(cfg.get('weekday', 1))
            # Python weekday: Monday=0 ... Sunday=6
            return (now.weekday() + 1) == weekday
        day_of_month = int(cfg.get('day_of_month', 1))
        return now.day == day_of_month

    def _build_run_key(self, cfg: Dict[str, Any], now: datetime) -> str:
        frequency = cfg.get('frequency', 'weekly')
        if frequency == 'weekly':
            return now.strftime('W%Y-%W')
        return now.strftime('M%Y-%m')

    def _run_project_report(self, project_id: str, manual: bool = False, requester_user_id: Optional[int] = None) -> Dict[str, Any]:
        if not self.doc_manager:
            return {'status': 'error', 'message': '文档管理器未初始化'}

        project_result = self.doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return {'status': 'error', 'message': '项目加载失败'}

        project = project_result.get('project', {})
        project_name = project.get('name', project_id)
        cfg = self.get_schedule(project_id)
        frequency = cfg.get('frequency', 'weekly')
        period_start, period_end = self._calc_period(now_with_timezone(), frequency)

        metrics = self._build_metrics(project_id, project, period_start, period_end)
        targets = self._collect_recipient_targets(project, cfg)
        recipients = targets.get('emails', [])
        site_receiver_ids = targets.get('user_ids', [])
        if manual and requester_user_id and requester_user_id not in site_receiver_ids:
            site_receiver_ids.append(int(requester_user_id))
            site_receiver_ids = sorted(set(site_receiver_ids))
        if not recipients and not (cfg.get('in_app_message_enabled', True) and site_receiver_ids):
            return {'status': 'error', 'message': '未配置可用收件人（邮箱或站内信）'}

        subject = f"【项目定时报告】{project_name} - {'周报' if frequency == 'weekly' else '月报'}"
        text_content, html_content = self._build_email_content(project_name, frequency, period_start, period_end, metrics)

        attachments = []
        if cfg.get('include_pdf', True):
            pdf_path = self._build_pdf_report(project_name, frequency, period_start, period_end, metrics)
            if pdf_path:
                attachments.append({'path': str(pdf_path), 'name': pdf_path.name})

        success_count = 0
        errors = []
        if recipients:
            for email in recipients:
                result = send_email(email, subject, text_content, html_content=html_content, attachments=attachments)
                if result.get('status') == 'success':
                    success_count += 1
                else:
                    errors.append(f"{email}: {result.get('message', '发送失败')}")

        site_sent_count = 0
        if cfg.get('in_app_message_enabled', True):
            run_key = self._build_run_key(cfg, now_with_timezone())
            site_sent_count = self._send_site_messages(
                receiver_ids=site_receiver_ids,
                project_id=project_id,
                project_name=project_name,
                frequency=frequency,
                period_start=period_start,
                period_end=period_end,
                metrics=metrics,
                run_key=run_key,
                popup_enabled=bool(cfg.get('login_popup_enabled', True))
            )

        status = 'success' if (success_count > 0 or site_sent_count > 0) else 'error'
        message = f"邮件成功 {success_count}/{len(recipients)}，站内信 {site_sent_count}/{len(site_receiver_ids)}"
        if errors:
            message += '；' + '；'.join(errors[:3])

        # 记录操作日志
        user_manager.add_operation_log(
            0,
            'system_scheduler' if not manual else 'manual_scheduler',
            'scheduled_report_send',
            project_id,
            project_name,
            json.dumps({
                'frequency': frequency,
                'success_count': success_count,
                'total': len(recipients),
                'period_start': period_start.strftime('%Y-%m-%d %H:%M:%S'),
                'period_end': period_end.strftime('%Y-%m-%d %H:%M:%S')
            }, ensure_ascii=False),
            None
        )

        return {'status': status, 'message': message, 'success_count': success_count, 'total': len(recipients)}

    def _calc_period(self, now: datetime, frequency: str) -> Tuple[datetime, datetime]:
        # 统一为本地无时区时间，避免与解析出的历史时间（通常为无时区）比较时报错。
        if getattr(now, 'tzinfo', None) is not None:
            now = now.replace(tzinfo=None)
        if frequency == 'monthly':
            return now - timedelta(days=30), now
        return now - timedelta(days=7), now

    def _parse_time(self, value: Any) -> Optional[datetime]:
        if not value:
            return None
        s = str(value).strip()
        candidates = [
            s,
            s.replace('T', ' '),
            s.split('.')[0],
            s.replace('T', ' ').split('.')[0],
            s.replace('Z', ''),
            s.replace('T', ' ').replace('Z', '')
        ]
        formats = ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d']
        for candidate in candidates:
            candidate = candidate.split('+')[0].split('Z')[0].strip()
            for fmt in formats:
                try:
                    return datetime.strptime(candidate, fmt)
                except Exception:
                    continue
        try:
            return datetime.fromisoformat(s.replace('Z', '+00:00')).replace(tzinfo=None)
        except Exception:
            return None

    def _build_metrics(self, project_id: str, project: Dict[str, Any], start: datetime, end: datetime) -> Dict[str, Any]:
        uploads = 0
        by_cycle: Dict[str, Dict[str, int]] = {}
        docs = project.get('documents', {}) if isinstance(project.get('documents', {}), dict) else {}
        for cycle, cycle_info in docs.items():
            uploaded_docs = cycle_info.get('uploaded_docs', []) if isinstance(cycle_info, dict) else []
            cycle_upload_count = 0
            for doc in uploaded_docs:
                t = self._parse_time(doc.get('upload_time'))
                if t and start <= t <= end:
                    uploads += 1
                    cycle_upload_count += 1
            by_cycle.setdefault(cycle, {'uploads': 0, 'archived': 0})
            by_cycle[cycle]['uploads'] = cycle_upload_count

        archived = 0
        try:
            with sqlite3.connect(str(user_manager.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT cycle, doc_names, resolved_at
                    FROM archive_approvals
                    WHERE project_id = ? AND status = 'approved' AND request_type = 'archive'
                    """,
                    (project_id,)
                )
                for row in cursor.fetchall():
                    resolved_at = self._parse_time(row['resolved_at'])
                    if not resolved_at or not (start <= resolved_at <= end):
                        continue
                    try:
                        doc_names = json.loads(row['doc_names']) if row['doc_names'] else []
                    except Exception:
                        doc_names = []
                    count = len([x for x in doc_names if str(x).strip()])
                    archived += count
                    cycle = row['cycle'] or '未分组'
                    by_cycle.setdefault(cycle, {'uploads': 0, 'archived': 0})
                    by_cycle[cycle]['archived'] += count
        except Exception as e:
            logger.warning(f'[ScheduledReportService] query archive approvals failed: {e}')

        archive_rate = round((archived / uploads) * 100, 2) if uploads > 0 else 0.0
        return {
            'uploads': uploads,
            'archived': archived,
            'archive_rate': archive_rate,
            'by_cycle': by_cycle
        }

    def _collect_recipient_targets(self, project: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, List[Any]]:
        recipients = set()
        user_ids = set()

        pmo_users = user_manager.get_users_by_roles(['pmo', 'pmo_leader']) or []
        for user in pmo_users:
            email = (user.get('email') or '').strip()
            if email and user.get('status') == 'active':
                recipients.add(email)
            if user.get('status') == 'active' and user.get('id'):
                user_ids.add(int(user.get('id')))

        party_b = (project.get('party_b') or '').strip()
        pm_users = user_manager.get_users_by_roles(['project_admin']) or []
        for user in pm_users:
            if user.get('status') != 'active':
                continue
            user_org = (user.get('organization') or '').strip()
            if party_b and user_org and user_org != party_b:
                continue
            email = (user.get('email') or '').strip()
            if email:
                recipients.add(email)
            if user.get('id'):
                user_ids.add(int(user.get('id')))

        manager_username = (project.get('manager') or '').strip()
        if manager_username:
            user = user_manager.get_user_by_username(manager_username)
            if user:
                if getattr(user, 'email', ''):
                    recipients.add(str(user.email).strip())
                if getattr(user, 'id', None):
                    user_ids.add(int(user.id))

        for email in cfg.get('external_emails', []) or []:
            s = str(email).strip()
            if s:
                recipients.add(s)

        return {
            'emails': sorted([x for x in recipients if '@' in x]),
            'user_ids': sorted(user_ids)
        }

    def _send_site_messages(
        self,
        receiver_ids: List[int],
        project_id: str,
        project_name: str,
        frequency: str,
        period_start: datetime,
        period_end: datetime,
        metrics: Dict[str, Any],
        run_key: str,
        popup_enabled: bool
    ) -> int:
        if not receiver_ids:
            return 0
        title = f"【{project_name}】{'周报' if frequency == 'weekly' else '月报'}已生成"
        content = (
            f"项目：{project_name}\n"
            f"类型：{'周报' if frequency == 'weekly' else '月报'}\n"
            f"统计区间：{period_start.strftime('%Y-%m-%d')} ~ {period_end.strftime('%Y-%m-%d')}\n"
            f"上传审核通过：{metrics.get('uploads', 0)}\n"
            f"归档通过：{metrics.get('archived', 0)}\n"
            f"归档率：{metrics.get('archive_rate', 0.0)}%\n"
            f"可在消息中心查看详情。"
        )
        msg_type = 'scheduled_report_popup' if popup_enabled else 'scheduled_report'
        sent_count = 0
        for receiver_id in receiver_ids:
            try:
                message_manager.send_message(
                    receiver_id=int(receiver_id),
                    title=title,
                    content=content,
                    sender_id=0,
                    msg_type=msg_type,
                    related_id=project_id,
                    related_type='project'
                )
                sent_count += 1
            except Exception as e:
                logger.warning(f'[ScheduledReportService] send site message failed for user {receiver_id}: {e}')
        return sent_count

    def _build_email_content(self, project_name: str, frequency: str, start: datetime, end: datetime, metrics: Dict[str, Any]) -> Tuple[str, str]:
        title = '周报' if frequency == 'weekly' else '月报'
        uploads = metrics.get('uploads', 0)
        archived = metrics.get('archived', 0)
        rate = metrics.get('archive_rate', 0.0)
        by_cycle = metrics.get('by_cycle', {})

        text = (
            f"项目：{project_name}\n"
            f"报告类型：{title}\n"
            f"统计区间：{start.strftime('%Y-%m-%d')} ~ {end.strftime('%Y-%m-%d')}\n"
            f"上传审核通过次数：{uploads}\n"
            f"归档通过次数：{archived}\n"
            f"归档率：{rate}%\n"
        )

        rows = ''
        for cycle, val in sorted(by_cycle.items(), key=lambda x: str(x[0])):
            c_uploads = val.get('uploads', 0)
            c_archived = val.get('archived', 0)
            c_rate = round((c_archived / c_uploads) * 100, 2) if c_uploads > 0 else 0.0
            bar_width = max(1, min(100, int(c_rate)))
            rows += (
            f"<tr><td style='padding:6px 8px;border:1px solid #ddd'>{str(cycle)}</td>"
                f"<td style='padding:6px 8px;border:1px solid #ddd'>{c_uploads}</td>"
                f"<td style='padding:6px 8px;border:1px solid #ddd'>{c_archived}</td>"
                f"<td style='padding:6px 8px;border:1px solid #ddd'>"
                f"<div style='background:#f1f5f9;height:12px;border-radius:8px;overflow:hidden;'>"
                f"<div style='width:{bar_width}%;background:#22c55e;height:12px;'></div></div>"
                f"<div style='font-size:12px;color:#555;margin-top:4px'>{c_rate}%</div>"
                f"</td></tr>"
            )

        html = f"""
        <div style='font-family:Arial,\"Microsoft YaHei\",sans-serif;line-height:1.6;color:#222'>
          <h2 style='margin:0 0 10px'>项目{title} - {project_name}</h2>
          <p>统计区间：{start.strftime('%Y-%m-%d')} ~ {end.strftime('%Y-%m-%d')}</p>
          <div style='display:flex;gap:12px;margin:12px 0 16px;'>
            <div style='padding:10px 12px;background:#eef6ff;border-radius:8px;'>上传审核通过：<b>{uploads}</b></div>
            <div style='padding:10px 12px;background:#f0fff4;border-radius:8px;'>归档通过：<b>{archived}</b></div>
            <div style='padding:10px 12px;background:#fff7ed;border-radius:8px;'>归档率：<b>{rate}%</b></div>
          </div>
          <table style='border-collapse:collapse;width:100%;font-size:13px;'>
            <thead>
              <tr>
                <th style='padding:8px;border:1px solid #ddd;background:#f8fafc;'>周期</th>
                <th style='padding:8px;border:1px solid #ddd;background:#f8fafc;'>上传通过</th>
                <th style='padding:8px;border:1px solid #ddd;background:#f8fafc;'>归档通过</th>
                <th style='padding:8px;border:1px solid #ddd;background:#f8fafc;'>归档率图示</th>
              </tr>
            </thead>
            <tbody>{rows or "<tr><td colspan='4' style='padding:10px;border:1px solid #ddd;text-align:center;color:#666'>暂无数据</td></tr>"}</tbody>
          </table>
        </div>
        """
        return text, html

    def _build_pdf_report(self, project_name: str, frequency: str, start: datetime, end: datetime, metrics: Dict[str, Any]) -> Optional[Path]:
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.cidfonts import UnicodeCIDFont
            from reportlab.pdfgen import canvas

            out_dir = Path('uploads/tasks/reports')
            out_dir.mkdir(parents=True, exist_ok=True)
            suffix = now_with_timezone().strftime('%Y%m%d_%H%M%S')
            pdf_path = out_dir / f"scheduled_report_{suffix}.pdf"

            pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
            c = canvas.Canvas(str(pdf_path), pagesize=A4)
            c.setFont('STSong-Light', 14)
            title = '周报' if frequency == 'weekly' else '月报'
            c.drawString(40, 800, f'项目定时{title}: {project_name}')
            c.setFont('STSong-Light', 10)
            c.drawString(40, 782, f"统计区间: {start.strftime('%Y-%m-%d')} ~ {end.strftime('%Y-%m-%d')}")

            uploads = metrics.get('uploads', 0)
            archived = metrics.get('archived', 0)
            rate = metrics.get('archive_rate', 0.0)
            c.drawString(40, 760, f'上传审核通过次数: {uploads}')
            c.drawString(220, 760, f'归档通过次数: {archived}')
            c.drawString(400, 760, f'归档率: {rate}%')

            c.setFont('STSong-Light', 11)
            c.drawString(40, 736, '按周期统计')

            y = 716
            c.setFont('STSong-Light', 9)
            c.setFillColor(colors.black)
            c.drawString(40, y, '周期')
            c.drawString(200, y, '上传')
            c.drawString(260, y, '归档')
            c.drawString(320, y, '归档率')
            y -= 14

            by_cycle = metrics.get('by_cycle', {})
            for cycle, val in sorted(by_cycle.items(), key=lambda x: str(x[0])):
                if y < 80:
                    c.showPage()
                    c.setFont('STSong-Light', 9)
                    y = 800
                u = val.get('uploads', 0)
                a = val.get('archived', 0)
                r = round((a / u) * 100, 2) if u > 0 else 0.0
                c.setFillColor(colors.black)
                c.drawString(40, y, str(cycle)[:24])
                c.drawString(200, y, str(u))
                c.drawString(260, y, str(a))
                c.drawString(320, y, f'{r}%')
                c.setStrokeColor(colors.lightgrey)
                c.setFillColor(colors.HexColor('#16a34a'))
                c.rect(370, y - 2, max(1, min(150, int(r * 1.5))), 8, fill=1, stroke=0)
                y -= 14

            c.save()
            return pdf_path
        except Exception as e:
            logger.warning(f'[ScheduledReportService] build pdf failed: {e}')
            return None


scheduled_report_service = ScheduledReportService()
