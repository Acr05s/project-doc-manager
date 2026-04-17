"""定时报告服务：周报/月报邮件发送与PDF附件生成。"""

import json
import logging
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

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
        # 使用基于模块文件位置的绝对路径，避免相对路径问题
        import os as _os
        _services_dir = _os.path.dirname(_os.path.abspath(__file__))
        _app_dir = _os.path.dirname(_services_dir)  # app
        _project_root = _os.path.dirname(_app_dir)  # 项目根目录
        # SQLite 数据库路径
        self._db_path = Path(_project_root) / 'data' / 'users.db'
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        # 旧 JSON 文件路径（用于迁移）
        self._schedules_file = Path(_project_root) / 'uploads' / 'tasks' / 'report_schedules.json'
        self._migrate_json_to_db()

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

    def _get_db_conn(self):
        """获取数据库连接。"""
        conn = sqlite3.connect(str(self._db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """初始化 scheduled_tasks 表。"""
        with self._get_db_conn() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS scheduled_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT UNIQUE NOT NULL,
                    project_id TEXT NOT NULL,
                    task_name TEXT NOT NULL DEFAULT '定时报告任务',
                    task_type TEXT NOT NULL DEFAULT 'periodic',
                    enabled INTEGER DEFAULT 0,
                    frequency TEXT DEFAULT 'weekly',
                    send_time TEXT DEFAULT '09:00',
                    weekday INTEGER DEFAULT 1,
                    day_of_month INTEGER DEFAULT 1,
                    run_date TEXT DEFAULT '',
                    include_pdf INTEGER DEFAULT 1,
                    in_app_message_enabled INTEGER DEFAULT 1,
                    login_popup_enabled INTEGER DEFAULT 1,
                    external_emails TEXT DEFAULT '[]',
                    recipient_user_ids TEXT DEFAULT '[]',
                    last_run_key TEXT DEFAULT '',
                    run_count INTEGER DEFAULT 0,
                    last_run_at TEXT DEFAULT '',
                    valid_until TEXT DEFAULT '',
                    skip_holidays INTEGER DEFAULT 0,
                    created_by_user_id INTEGER DEFAULT 0,
                    created_by_username TEXT DEFAULT '',
                    created_by_display_name TEXT DEFAULT '',
                    created_by_organization TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            ''')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_project ON scheduled_tasks(project_id)')
            conn.commit()

    def _migrate_json_to_db(self):
        """从旧 JSON 文件迁移数据到 SQLite（仅执行一次）。"""
        if not self._schedules_file.exists():
            return
        try:
            with open(self._schedules_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if not isinstance(data, dict) or not data:
                return
            # 检查 DB 是否已有数据（避免重复迁移）
            with self._get_db_conn() as conn:
                count = conn.execute('SELECT COUNT(*) FROM scheduled_tasks').fetchone()[0]
                if count > 0:
                    logger.info('[ScheduledReportService] DB already has tasks, skipping JSON migration')
                    return
            migrated = 0
            for project_id, raw in data.items():
                tasks = []
                if isinstance(raw, list):
                    tasks = [x for x in raw if isinstance(x, dict)]
                elif isinstance(raw, dict):
                    if 'tasks' in raw and isinstance(raw.get('tasks'), list):
                        tasks = [x for x in raw['tasks'] if isinstance(x, dict)]
                    else:
                        tasks = [raw]
                for i, task_data in enumerate(tasks):
                    task = self._normalize_task(project_id, task_data, f'定时任务{i + 1}')
                    self._db_insert_task(task)
                    migrated += 1
            logger.info(f'[ScheduledReportService] migrated {migrated} tasks from JSON to DB')
            # 重命名旧文件作为备份
            backup = self._schedules_file.with_suffix('.json.bak')
            self._schedules_file.rename(backup)
            logger.info(f'[ScheduledReportService] old JSON renamed to {backup}')
        except Exception as e:
            logger.warning(f'[ScheduledReportService] JSON migration failed: {e}')

    def _db_insert_task(self, task: Dict[str, Any]):
        """插入一条任务到数据库。"""
        with self._get_db_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO scheduled_tasks
                (task_id, project_id, task_name, task_type, enabled, frequency,
                 send_time, weekday, day_of_month, run_date, include_pdf,
                 in_app_message_enabled, login_popup_enabled, external_emails,
                 recipient_user_ids, last_run_key, run_count, last_run_at,
                 valid_until, skip_holidays, created_by_user_id, created_by_username,
                 created_by_display_name, created_by_organization,
                 created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (
                task['task_id'], task['project_id'], task['task_name'],
                task['task_type'], 1 if task.get('enabled') else 0,
                task['frequency'], task['send_time'], task['weekday'],
                task['day_of_month'], task.get('run_date', ''),
                1 if task.get('include_pdf', True) else 0,
                1 if task.get('in_app_message_enabled', True) else 0,
                1 if task.get('login_popup_enabled', True) else 0,
                json.dumps(task.get('external_emails', []), ensure_ascii=False),
                json.dumps(task.get('recipient_user_ids', []), ensure_ascii=False),
                task.get('last_run_key', ''), task.get('run_count', 0),
                task.get('last_run_at', ''), task.get('valid_until', ''),
                1 if task.get('skip_holidays') else 0,
                task.get('created_by_user_id', 0),
                task.get('created_by_username', ''),
                task.get('created_by_display_name', ''),
                task.get('created_by_organization', ''),
                task['created_at'], task['updated_at']
            ))
            conn.commit()

    def _db_row_to_task(self, row: sqlite3.Row) -> Dict[str, Any]:
        """将数据库行转换为任务字典。"""
        d = dict(row)
        d['enabled'] = bool(d.get('enabled', 0))
        d['include_pdf'] = bool(d.get('include_pdf', 1))
        d['in_app_message_enabled'] = bool(d.get('in_app_message_enabled', 1))
        d['login_popup_enabled'] = bool(d.get('login_popup_enabled', 1))
        d['skip_holidays'] = bool(d.get('skip_holidays', 0))
        try:
            d['external_emails'] = json.loads(d.get('external_emails') or '[]')
        except Exception:
            d['external_emails'] = []
        try:
            d['recipient_user_ids'] = json.loads(d.get('recipient_user_ids') or '[]')
        except Exception:
            d['recipient_user_ids'] = []
        return d

    def _default_task(self, project_id: str = '', task_name: str = '') -> Dict[str, Any]:
        now_iso = now_with_timezone().isoformat()
        return {
            'task_id': uuid4().hex,
            'project_id': project_id,
            'task_name': task_name or '定时报告任务',
            'task_type': 'periodic',
            'enabled': False,
            'frequency': 'weekly',
            'send_time': '09:00',
            'weekday': 1,
            'day_of_month': 1,
            'run_date': '',
            'include_pdf': True,
            'in_app_message_enabled': True,
            'login_popup_enabled': True,
            'external_emails': [],
            'recipient_user_ids': [],
        'last_run_key': '',
        'run_count': 0,
        'last_run_at': '',
        'valid_until': '',
        'skip_holidays': False,
        'created_by_user_id': 0,
            'created_by_username': '',
            'created_by_display_name': '',
            'created_by_organization': '',
            'created_at': now_iso,
            'updated_at': now_iso,
        }

    def _normalize_task(self, project_id: str, data: Dict[str, Any], fallback_name: str = '') -> Dict[str, Any]:
        base = self._default_task(project_id=project_id, task_name=fallback_name)
        merged = dict(base)
        if isinstance(data, dict):
            merged.update(data)

        merged['task_id'] = str(merged.get('task_id') or uuid4().hex)
        merged['project_id'] = project_id
        merged['task_name'] = str(merged.get('task_name') or fallback_name or '定时报告任务').strip()
        if not merged['task_name']:
            merged['task_name'] = '定时报告任务'

        task_type = str(merged.get('task_type', 'periodic')).strip().lower()
        if task_type not in ('one_time', 'periodic'):
            task_type = 'periodic'
        merged['task_type'] = task_type

        merged['enabled'] = bool(merged.get('enabled', False))
        frequency = str(merged.get('frequency', 'weekly')).strip().lower()
        if task_type == 'one_time':
            frequency = 'daily'
        if frequency not in ('daily', 'weekly', 'monthly'):
            frequency = 'weekly'
        merged['frequency'] = frequency

        send_time = str(merged.get('send_time', '09:00')).strip()
        if len(send_time) != 5 or ':' not in send_time:
            send_time = '09:00'
        merged['send_time'] = send_time

        try:
            merged['weekday'] = min(7, max(1, int(merged.get('weekday', 1))))
        except Exception:
            merged['weekday'] = 1
        try:
            merged['day_of_month'] = min(28, max(1, int(merged.get('day_of_month', 1))))
        except Exception:
            merged['day_of_month'] = 1
        merged['run_date'] = str(merged.get('run_date') or '').strip()

        merged['include_pdf'] = bool(merged.get('include_pdf', True))
        merged['in_app_message_enabled'] = bool(merged.get('in_app_message_enabled', True))
        merged['login_popup_enabled'] = bool(merged.get('login_popup_enabled', True))

        ids = merged.get('recipient_user_ids', [])
        recipient_user_ids: List[int] = []
        if isinstance(ids, str):
            ids = [x.strip() for x in ids.replace('，', ',').split(',') if x.strip()]
        if isinstance(ids, list):
            for x in ids:
                try:
                    recipient_user_ids.append(int(x))
                except Exception:
                    continue
        merged['recipient_user_ids'] = sorted(set(recipient_user_ids))

        ext = merged.get('external_emails', [])
        if isinstance(ext, str):
            ext = [x.strip() for x in ext.replace('，', ',').split(',') if x.strip()]
        elif isinstance(ext, list):
            ext = [str(x).strip() for x in ext if str(x).strip()]
        else:
            ext = []
        merged['external_emails'] = ext

        merged['last_run_key'] = str(merged.get('last_run_key') or '')
        try:
            merged['run_count'] = max(0, int(merged.get('run_count', 0)))
        except Exception:
            merged['run_count'] = 0
        merged['last_run_at'] = str(merged.get('last_run_at') or '')
        # 截止日期：格式 YYYY-MM-DD 或空
        valid_until = str(merged.get('valid_until') or '').strip()[:10]
        merged['valid_until'] = valid_until
        merged['skip_holidays'] = bool(merged.get('skip_holidays', False))
        try:
            merged['created_by_user_id'] = int(merged.get('created_by_user_id') or 0)
        except Exception:
            merged['created_by_user_id'] = 0
        merged['created_by_username'] = str(merged.get('created_by_username') or '')
        merged['created_by_display_name'] = str(merged.get('created_by_display_name') or '')
        merged['created_by_organization'] = str(merged.get('created_by_organization') or '')
        merged['created_at'] = str(merged.get('created_at') or base['created_at'])
        merged['updated_at'] = now_with_timezone().isoformat()
        return merged

    def _get_project_tasks_locked(self, project_id: str) -> List[Dict[str, Any]]:
        with self._get_db_conn() as conn:
            rows = conn.execute(
                'SELECT * FROM scheduled_tasks WHERE project_id = ? ORDER BY created_at',
                (project_id,)
            ).fetchall()
        return [self._db_row_to_task(r) for r in rows]

    def list_tasks(self, project_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            return self._get_project_tasks_locked(project_id)

    def list_all_tasks(self) -> List[Dict[str, Any]]:
        """获取所有项目的全部任务。"""
        with self._lock:
            with self._get_db_conn() as conn:
                rows = conn.execute('SELECT * FROM scheduled_tasks ORDER BY created_at').fetchall()
            return [self._db_row_to_task(r) for r in rows]

    def get_task(self, project_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            with self._get_db_conn() as conn:
                row = conn.execute(
                    'SELECT * FROM scheduled_tasks WHERE project_id = ? AND task_id = ?',
                    (project_id, task_id)
                ).fetchone()
            if row:
                return self._db_row_to_task(row)
        return None

    def create_task(self, project_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            existing = self._get_project_tasks_locked(project_id)
            fallback_name = f'定时任务{len(existing) + 1}'
            task = self._normalize_task(project_id, data or {}, fallback_name)
            self._db_insert_task(task)
            return dict(task)

    def update_task(self, project_id: str, task_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            with self._get_db_conn() as conn:
                row = conn.execute(
                    'SELECT * FROM scheduled_tasks WHERE project_id = ? AND task_id = ?',
                    (project_id, task_id)
                ).fetchone()
            if not row:
                raise ValueError('任务不存在')
            existing = self._db_row_to_task(row)
            updated = dict(existing)
            if isinstance(data, dict):
                updated.update(data)
            updated['task_id'] = str(task_id)
            updated = self._normalize_task(project_id, updated, existing.get('task_name', '定时报告任务'))
            self._db_insert_task(updated)  # INSERT OR REPLACE
            return dict(updated)

    def delete_task(self, project_id: str, task_id: str) -> bool:
        with self._lock:
            with self._get_db_conn() as conn:
                cursor = conn.execute(
                    'DELETE FROM scheduled_tasks WHERE project_id = ? AND task_id = ?',
                    (project_id, task_id)
                )
                conn.commit()
                return cursor.rowcount > 0

    def set_task_enabled(self, project_id: str, task_id: str, enabled: bool) -> Dict[str, Any]:
        return self.update_task(project_id, task_id, {'enabled': bool(enabled)})

    def get_schedule(self, project_id: str) -> Dict[str, Any]:
        tasks = self.list_tasks(project_id)
        if tasks:
            return tasks[0]
        return self._default_task(project_id=project_id, task_name='默认定时任务')

    def get_schedule_detail(self, project_id: str) -> Dict[str, Any]:
        project = self._load_project(project_id)
        recipient_options = self._build_project_recipient_options(project)

        tasks = self.list_tasks(project_id)
        active_ids = {int(opt.get('id')) for opt in recipient_options if opt.get('id')}
        normalized_tasks: List[Dict[str, Any]] = []
        for task in tasks:
            selected_ids = []
            for x in task.get('recipient_user_ids', []) or []:
                try:
                    uid = int(x)
                except Exception:
                    continue
                if uid in active_ids:
                    selected_ids.append(uid)
            if not selected_ids:
                selected_ids = [int(opt['id']) for opt in recipient_options if opt.get('recommended') and opt.get('id')]
            item = dict(task)
            item['recipient_user_ids'] = sorted(set(selected_ids))
            normalized_tasks.append(item)

        return {
            'schedule': normalized_tasks[0] if normalized_tasks else self._default_task(project_id=project_id, task_name='默认定时任务'),
            'tasks': normalized_tasks,
            'recipient_options': recipient_options
        }

    def update_schedule(self, project_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        # 兼容旧接口：更新第一个任务，不存在则创建
        with self._lock:
            tasks = self._get_project_tasks_locked(project_id)
            if not tasks:
                task = self._normalize_task(project_id, data or {}, '默认定时任务')
                self._db_insert_task(task)
                return dict(task)

            merged = dict(tasks[0])
            if isinstance(data, dict):
                merged.update(data)
            merged = self._normalize_task(project_id, merged, tasks[0].get('task_name', '默认定时任务'))
            self._db_insert_task(merged)
            return dict(merged)

    def run_now(self, project_id: str, requester_user_id: Optional[int] = None, task_id: Optional[str] = None) -> Dict[str, Any]:
        cfg = None
        if task_id:
            cfg = self.get_task(project_id, task_id)
            if not cfg:
                return {'status': 'error', 'message': '任务不存在'}
        else:
            tasks = self.list_tasks(project_id)
            if tasks:
                cfg = tasks[0]
        if cfg is None:
            cfg = self.get_schedule(project_id)
        result = self._run_project_report(project_id, cfg=cfg, manual=True, requester_user_id=requester_user_id)
        self._mark_task_run_result(
            project_id=project_id,
            task_id=str(cfg.get('task_id') or ''),
            success=result.get('status') == 'success',
            run_key=self._build_run_key(cfg, now_with_timezone()),
        )
        return result

    def _mark_task_run_result(self, project_id: str, task_id: str, success: bool, run_key: str = ''):
        if not task_id:
            return
        with self._lock:
            task = self.get_task(project_id, task_id)
            if not task:
                return
            updates: Dict[str, Any] = {'updated_at': now_with_timezone().isoformat()}
            if success:
                if run_key:
                    updates['last_run_key'] = run_key
                updates['last_run_at'] = now_with_timezone().isoformat()
                try:
                    updates['run_count'] = int(task.get('run_count', 0)) + 1
                except Exception:
                    updates['run_count'] = 1
                if str(task.get('task_type', 'periodic')) == 'one_time':
                    updates['enabled'] = False
            merged = dict(task)
            merged.update(updates)
            merged = self._normalize_task(project_id, merged, task.get('task_name', '定时报告任务'))
            self._db_insert_task(merged)

    def _scheduler_loop(self):
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as e:
                logger.error(f'[ScheduledReportService] tick failed: {e}')
            self._stop_event.wait(30)

    def _tick(self):
        now = now_with_timezone()
        # 直接从数据库获取所有启用的任务
        all_tasks = self.list_all_tasks()
        for task in all_tasks:
            project_id = str(task.get('project_id') or '')
            if not project_id:
                continue
            if not task.get('enabled'):
                continue
            # 检查截止日期：到期则自动禁用
            valid_until = str(task.get('valid_until') or '').strip()
            if valid_until:
                try:
                    deadline = datetime.strptime(valid_until, '%Y-%m-%d')
                    if now.replace(tzinfo=None) > deadline:
                        logger.info(f'[ScheduledReportService] task {task.get("task_id")} expired ({valid_until}), auto-disabling')
                        self.update_task(project_id, str(task.get('task_id') or ''), {'enabled': False})
                        continue
                except Exception:
                    pass
            if not self._is_due(task, now):
                continue
            run_key = self._build_run_key(task, now)
            if run_key and task.get('last_run_key') == run_key:
                continue
            try:
                result = self._run_project_report(project_id, cfg=task, manual=False)
                success = result.get('status') == 'success'
            except Exception as e:
                logger.error(f'[ScheduledReportService] run report failed for {project_id}/{task.get("task_id")}: {e}')
                success = False
            self._mark_task_run_result(
                project_id=project_id,
                task_id=str(task.get('task_id') or ''),
                success=success,
                run_key=run_key,
            )

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
        task_type = str(cfg.get('task_type', 'periodic')).strip().lower()
        send_time = str(cfg.get('send_time', '09:00'))
        try:
            hour = int(send_time.split(':')[0])
            minute = int(send_time.split(':')[1])
        except Exception:
            hour, minute = 9, 0

        if now.hour != hour or now.minute != minute:
            return False

        if task_type == 'one_time':
            run_date = str(cfg.get('run_date') or '').strip()
            if not run_date:
                return False
            return now.strftime('%Y-%m-%d') == run_date

        frequency = str(cfg.get('frequency', 'weekly')).strip().lower()
        if frequency == 'daily':
            if cfg.get('skip_holidays'):
                from app.services.china_holidays import is_workday
                if not is_workday(now.date()):
                    return False
            return True
        if frequency == 'weekly':
            weekday = int(cfg.get('weekday', 1))
            # Python weekday: Monday=0 ... Sunday=6
            return (now.weekday() + 1) == weekday
        day_of_month = int(cfg.get('day_of_month', 1))
        return now.day == day_of_month

    def _build_run_key(self, cfg: Dict[str, Any], now: datetime) -> str:
        frequency = str(cfg.get('frequency', 'weekly')).strip().lower()
        if frequency == 'daily':
            return now.strftime('D%Y-%m-%d')
        if frequency == 'weekly':
            return now.strftime('W%Y-%W')
        return now.strftime('M%Y-%m')

    def _run_project_report(
        self,
        project_id: str,
        cfg: Optional[Dict[str, Any]] = None,
        manual: bool = False,
        requester_user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        if not self.doc_manager:
            return {'status': 'error', 'message': '文档管理器未初始化'}

        project = self._load_project(project_id)
        if not project:
            return {'status': 'error', 'message': '项目加载失败'}
        project_name = project.get('name', project_id)
        cfg = cfg or self.get_schedule(project_id)
        frequency = str(cfg.get('frequency', 'weekly')).strip().lower()
        period_start, period_end = self._calc_period(now_with_timezone(), frequency)

        metrics = self._build_metrics(project_id, project, period_start, period_end)
        party_b = project.get('party_b', '')
        targets = self._collect_recipient_targets(project, cfg)
        recipients = targets.get('emails', [])
        site_receiver_ids = targets.get('user_ids', [])
        if manual and requester_user_id and requester_user_id not in site_receiver_ids:
            site_receiver_ids.append(int(requester_user_id))
            site_receiver_ids = sorted(set(site_receiver_ids))
        if not recipients and not (cfg.get('in_app_message_enabled', True) and site_receiver_ids):
            return {'status': 'error', 'message': '未配置可用收件人（邮箱或站内信）'}

        subject = f"【项目定时报告】{project_name} - {self._frequency_label(frequency)}"
        text_content, html_content = self._build_email_content(project_name, frequency, period_start, period_end, metrics, party_b=party_b)

        attachments = []
        # 手动执行时默认附带PDF，定时执行按任务配置决定
        should_attach_pdf = bool(cfg.get('include_pdf', True)) or manual
        if should_attach_pdf:
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
                popup_enabled=bool(cfg.get('login_popup_enabled', True)),
                party_b=party_b,
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
        if frequency == 'daily':
            return now - timedelta(days=1), now
        if frequency == 'monthly':
            return now - timedelta(days=30), now
        return now - timedelta(days=7), now

    def _get_ordered_cycles(self, project: Dict[str, Any], docs: Dict[str, Any]) -> List[str]:
        ordered: List[str] = []
        seen = set()

        for cycle in project.get('cycles', []) or []:
            c = str(cycle or '').strip()
            if not c or c in seen:
                continue
            seen.add(c)
            ordered.append(c)

        for cycle in docs.keys():
            c = str(cycle or '').strip()
            if not c or c in seen:
                continue
            seen.add(c)
            ordered.append(c)

        return ordered

    def _is_required_doc_completed(self, req_doc: Dict[str, Any], uploaded_docs: List[Dict[str, Any]]) -> bool:
        doc_name = str(req_doc.get('name') or '').strip()
        requirement = str(req_doc.get('requirement') or '')
        if not doc_name:
            return False

        uploaded = [d for d in uploaded_docs if str(d.get('doc_name') or '').strip() == doc_name]
        if not uploaded:
            return False

        if not requirement:
            return True

        # 与前端 checkMissingRequirements 保持一致
        def get_val(d, *keys):
            for k in keys:
                v = d.get(k) or d.get(f'_{k}')
                if v:
                    return v
            return None

        has_party_a_sign_req = '甲方签字' in requirement
        has_party_b_sign_req = '乙方签字' in requirement
        has_general_sign_req = '签字' in requirement and not has_party_a_sign_req and not has_party_b_sign_req
        has_party_a_seal_req = '甲方盖章' in requirement
        has_party_b_seal_req = '乙方盖章' in requirement
        has_general_seal_req = '盖章' in requirement and not has_party_a_seal_req and not has_party_b_seal_req

        for d in uploaded:
            no_sig = get_val(d, 'no_signature')
            no_seal = get_val(d, 'no_seal')

            if has_party_a_sign_req:
                if not get_val(d, 'party_a_signer') and not no_sig:
                    continue
            if has_party_b_sign_req:
                if not get_val(d, 'party_b_signer') and not no_sig:
                    continue
            if has_general_sign_req:
                if not get_val(d, 'signer') and not no_sig:
                    continue
            if has_party_a_seal_req:
                if not (get_val(d, 'party_a_seal') or get_val(d, 'has_seal_marked') or get_val(d, 'has_seal') or no_seal):
                    continue
            if has_party_b_seal_req:
                if not (get_val(d, 'party_b_seal') or get_val(d, 'has_seal_marked') or get_val(d, 'has_seal') or no_seal):
                    continue
            if has_general_seal_req:
                if not (get_val(d, 'has_seal_marked') or get_val(d, 'has_seal') or
                        get_val(d, 'party_a_seal') or get_val(d, 'party_b_seal') or no_seal):
                    continue
            # 该文档满足所有要求
            return True
        return False
        has_party_a_sign_req = '甲方签字' in requirement
        has_party_b_sign_req = '乙方签字' in requirement
        has_general_sign_req = '签字' in requirement and not has_party_a_sign_req and not has_party_b_sign_req
        has_party_a_seal_req = '甲方盖章' in requirement
        has_party_b_seal_req = '乙方盖章' in requirement
        has_general_seal_req = '盖章' in requirement and not has_party_a_seal_req and not has_party_b_seal_req

        for d in uploaded:
            no_sig = get_val(d, 'no_signature')
            no_seal = get_val(d, 'no_seal')

            if has_party_a_sign_req:
                if not get_val(d, 'party_a_signer') and not no_sig:
                    continue
            if has_party_b_sign_req:
                if not get_val(d, 'party_b_signer') and not no_sig:
                    continue
            if has_general_sign_req:
                if not get_val(d, 'signer') and not no_sig:
                    continue
            if has_party_a_seal_req:
                if not (get_val(d, 'party_a_seal') or get_val(d, 'has_seal_marked') or get_val(d, 'has_seal') or no_seal):
                    continue
            if has_party_b_seal_req:
                if not (get_val(d, 'party_b_seal') or get_val(d, 'has_seal_marked') or get_val(d, 'has_seal') or no_seal):
                    continue
            if has_general_seal_req:
                if not (get_val(d, 'has_seal_marked') or get_val(d, 'has_seal') or
                        get_val(d, 'party_a_seal') or get_val(d, 'party_b_seal') or no_seal):
                    continue
            # 该文档满足所有要求
            return True
        return False

    def _frequency_label(self, frequency: str) -> str:
        f = str(frequency or '').strip().lower()
        if f == 'daily':
            return '日报'
        if f == 'monthly':
            return '月报'
        return '周报'

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
        updated_docs = 0   # 本周期内重新上传（版本更新）次数
        by_cycle: Dict[str, Dict[str, Any]] = {}
        doc_details: List[Dict[str, Any]] = []   # 文档明细列表
        checklist: List[Dict[str, Any]] = []     # 项目文档清单

        docs = project.get('documents', {}) if isinstance(project.get('documents', {}), dict) else {}
        cycle_order = self._get_ordered_cycles(project, docs)

        # 先按系统周期顺序初始化统计和文档清单
        for cycle in cycle_order:
            cycle_info = docs.get(cycle, {}) if isinstance(docs.get(cycle, {}), dict) else {}
            required_docs = cycle_info.get('required_docs', []) if isinstance(cycle_info, dict) else []
            uploaded_docs = cycle_info.get('uploaded_docs', []) if isinstance(cycle_info, dict) else []

            completed_docs_count = 0
            for idx, req in enumerate(required_docs):
                doc_name = str(req.get('name') or '').strip()
                requirement = str(req.get('requirement') or '').strip()
                if not doc_name:
                    continue
                same_name_uploaded = [d for d in uploaded_docs if str(d.get('doc_name') or '').strip() == doc_name]
                is_completed = self._is_required_doc_completed(req, uploaded_docs)
                if is_completed:
                    completed_docs_count += 1
                status = '已完成' if is_completed else ('待完善' if same_name_uploaded else '未上传')
                checklist.append({
                    'cycle': cycle,
                    'index': idx + 1,
                    'doc_name': doc_name,
                    'requirement': requirement,
                    'uploaded_count': len(same_name_uploaded),
                    'status': status
                })

            by_cycle.setdefault(cycle, {
                'uploads': 0,
                'updated': 0,
                'archived': 0,
                'required': len(required_docs),
                'completed': completed_docs_count,
                'pending': max(0, len(required_docs) - completed_docs_count),
                'uploaded_unique': 0,
            })

        # 统计本期上传/更新
        for cycle in cycle_order:
            cycle_info = docs.get(cycle, {}) if isinstance(docs.get(cycle, {}), dict) else {}
            uploaded_docs = cycle_info.get('uploaded_docs', []) if isinstance(cycle_info, dict) else []
            cycle_upload_count = 0
            cycle_update_count = 0
            # 记录每个文档名已经遍历到第几次，判断是否是更新
            doc_name_seen: Dict[str, int] = {}
            for doc in uploaded_docs:
                dn = doc.get('doc_name', '')
                doc_name_seen[dn] = doc_name_seen.get(dn, 0) + 1
                t = self._parse_time(doc.get('upload_time'))
                if t and start <= t <= end:
                    uploads += 1
                    cycle_upload_count += 1
                    is_update = doc_name_seen[dn] > 1   # 同文档名第2次及以上视为更新
                    if is_update:
                        updated_docs += 1
                        cycle_update_count += 1
                    # 添加文档明细
                    doc_details.append({
                        'cycle': cycle,
                        'doc_name': dn,
                        'uploader': doc.get('uploader', doc.get('uploaded_by', '')),
                        'upload_time': doc.get('upload_time', ''),
                        'filename': doc.get('original_filename', doc.get('filename', '')),
                        'is_update': is_update,
                    })
            by_cycle[cycle]['uploads'] = cycle_upload_count
            by_cycle[cycle]['updated'] = cycle_update_count

        # ── 统计本周期内实际上传的唯一文档（按 doc_name 去重） ──
        uploaded_unique_by_cycle: Dict[str, set] = {}
        for cycle in cycle_order:
            cycle_info = docs.get(cycle, {}) if isinstance(docs.get(cycle, {}), dict) else {}
            uploaded_docs = cycle_info.get('uploaded_docs', []) if isinstance(cycle_info, dict) else []
            uploaded_unique_by_cycle[cycle] = set()
            for doc in uploaded_docs:
                t = self._parse_time(doc.get('upload_time'))
                if t and start <= t <= end:
                    dn = str(doc.get('doc_name') or '').strip()
                    if dn:
                        uploaded_unique_by_cycle[cycle].add(dn)

        archived = 0
        # 按周期统计已归档的唯一文档名
        archived_unique_by_cycle: Dict[str, set] = {}
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
                    cycle = row['cycle'] or '未分组'
                    if cycle not in archived_unique_by_cycle:
                        archived_unique_by_cycle[cycle] = set()
                    for dn in doc_names:
                        dn_s = str(dn).strip()
                        if dn_s:
                            archived_unique_by_cycle[cycle].add(dn_s)

                    if cycle not in by_cycle:
                        by_cycle[cycle] = {
                            'uploads': 0,
                            'updated': 0,
                            'archived': 0,
                            'required': 0,
                            'completed': 0,
                            'pending': 0,
                            'uploaded_unique': 0,
                        }
                        cycle_order.append(cycle)

        except Exception as e:
            logger.warning(f'[ScheduledReportService] query archive approvals failed: {e}')

        # 计算各周期归档合格率：
        #   分子 = 本周期内已归档的唯一文档数
        #   分母 = 本周期内实际上传的唯一文档数（体现本周该类型文档合格率）
        total_uploaded_unique = 0
        total_archived_unique = 0
        for cycle in cycle_order:
            if cycle not in by_cycle:
                continue
            # 统计实际上传的唯一文档数
            unique_uploaded = len(uploaded_unique_by_cycle.get(cycle, set()))
            by_cycle[cycle]['uploaded_unique'] = unique_uploaded
            unique_archived = len(archived_unique_by_cycle.get(cycle, set()))
            # 归档数不超过本周实际上传的唯一文档数
            cycle_archived = min(unique_archived, unique_uploaded)
            by_cycle[cycle]['archived'] = cycle_archived
            archived += cycle_archived
            total_uploaded_unique += unique_uploaded
            total_archived_unique += unique_archived

        # 归档合格率 = 已归档唯一文档数 / 实际上传唯一文档数，最大 100%
        if total_uploaded_unique > 0:
            archive_rate = round(min(100.0, (total_archived_unique / total_uploaded_unique) * 100), 2)
        else:
            archive_rate = 0.0
        # 按上传时间倒序排列文档明细
        doc_details.sort(key=lambda x: str(x.get('upload_time', '')), reverse=True)
        return {
            'uploads': uploads,
            'updated_docs': updated_docs,
            'archived': archived,
            'archive_rate': archive_rate,
            'by_cycle': by_cycle,
            'doc_details': doc_details,
            'cycle_order': cycle_order,
            'checklist': checklist,
        }

    def _load_project(self, project_id: str) -> Dict[str, Any]:
        if not self.doc_manager:
            return {}
        project_result = self.doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return {}
        project = project_result.get('project', {})
        return project if isinstance(project, dict) else {}

    def _build_project_recipient_options(self, project: Dict[str, Any]) -> List[Dict[str, Any]]:
        options: List[Dict[str, Any]] = []
        seen_ids = set()

        def add_user(user: Dict[str, Any], source_label: str, recommended: bool = True):
            if not isinstance(user, dict):
                return
            if user.get('status') != 'active':
                return
            uid = user.get('id')
            if not uid:
                return
            try:
                uid = int(uid)
            except Exception:
                return
            if uid in seen_ids:
                return
            seen_ids.add(uid)
            options.append({
                'id': uid,
                'username': str(user.get('username') or ''),
                'display_name': str(user.get('display_name') or user.get('username') or ''),
                'organization': str(user.get('organization') or ''),
                'role': str(user.get('role') or ''),
                'email': str(user.get('email') or ''),
                'source': source_label,
                'recommended': bool(recommended)
            })

        for user in user_manager.get_users_by_roles(['pmo', 'pmo_leader']) or []:
            add_user(user, 'PMO', True)

        party_b = (project.get('party_b') or '').strip()
        for user in user_manager.get_users_by_roles(['project_admin']) or []:
            if party_b:
                user_org = (user.get('organization') or '').strip()
                if user_org and user_org != party_b:
                    continue
            add_user(user, '项目经理', True)

        manager_username = (project.get('manager') or '').strip()
        if manager_username:
            manager_user = user_manager.get_user_by_username(manager_username)
            if manager_user and getattr(manager_user, 'status', '') == 'active':
                add_user({
                    'id': getattr(manager_user, 'id', None),
                    'username': getattr(manager_user, 'username', ''),
                    'display_name': getattr(manager_user, 'display_name', '') or getattr(manager_user, 'username', ''),
                    'organization': getattr(manager_user, 'organization', '') or '',
                    'role': getattr(manager_user, 'role', '') or '',
                    'email': getattr(manager_user, 'email', '') or '',
                    'status': 'active',
                }, '项目经理', True)

        options.sort(key=lambda x: (
            0 if x.get('recommended') else 1,
            str(x.get('role') or ''),
            str(x.get('display_name') or x.get('username') or '')
        ))
        return options

    def _collect_recipient_targets(self, project: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, List[Any]]:
        recipients = set()
        user_ids = set()

        recipient_options = self._build_project_recipient_options(project)
        selected_ids: List[int] = []
        active_ids = {int(opt.get('id')) for opt in recipient_options if opt.get('id')}
        for x in cfg.get('recipient_user_ids', []) or []:
            try:
                uid = int(x)
            except Exception:
                continue
            if uid in active_ids:
                selected_ids.append(uid)
        if not selected_ids:
            selected_ids = [int(opt['id']) for opt in recipient_options if opt.get('recommended') and opt.get('id')]

        selected_set = set(selected_ids)
        for opt in recipient_options:
            uid = int(opt.get('id')) if opt.get('id') else None
            if not uid or uid not in selected_set:
                continue
            user_ids.add(uid)
            email = str(opt.get('email') or '').strip()
            if email:
                recipients.add(email)

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
        popup_enabled: bool,
        party_b: str = '',
    ) -> int:
        if not receiver_ids:
            return 0
        title = f"【{project_name}】{self._frequency_label(frequency)}已生成"
        party_b_line = f"承建单位：{party_b}<br>" if party_b else ''
        # 站内信内容使用HTML表格格式便于渲染
        uploads_val = metrics.get('uploads', 0)
        updated_val = metrics.get('updated_docs', 0)
        archived_val = metrics.get('archived', 0)
        rate_val = metrics.get('archive_rate', 0.0)
        by_cycle = metrics.get('by_cycle', {})
        cycle_order = metrics.get('cycle_order', [])
        ordered_cycles = [c for c in cycle_order if c in by_cycle] + [c for c in by_cycle.keys() if c not in set(cycle_order)]

        cycle_rows = ''
        for cycle in ordered_cycles:
            val = by_cycle.get(cycle, {})
            c_uploads = val.get('uploads', 0)
            c_archived = val.get('archived', 0)
            c_uploaded_unique = val.get('uploaded_unique', 0)
            if c_uploaded_unique > 0:
                c_rate = round(min(100.0, (c_archived / c_uploaded_unique) * 100), 2)
            else:
                c_rate = 0.0
            cycle_rows += (
                f"<tr>"
                f"<td style='padding:4px 8px;border:1px solid #c9d7e8;'>{cycle}</td>"
                f"<td style='padding:4px 8px;border:1px solid #c9d7e8;text-align:center;'>{c_uploads}</td>"
                f"<td style='padding:4px 8px;border:1px solid #c9d7e8;text-align:center;'>{c_archived}</td>"
                f"<td style='padding:4px 8px;border:1px solid #c9d7e8;text-align:center;'>{c_rate}%</td>"
                f"</tr>"
            )
        cycle_table = (
            "<table style='border-collapse:collapse;width:100%;font-size:12px;margin-top:8px;'>"
            "<thead><tr style='background:#e8f0f9;'>"
            "<th style='padding:5px 8px;border:1px solid #b0c4d8;text-align:left;'>\u5468\u671f</th>"
            "<th style='padding:5px 8px;border:1px solid #b0c4d8;text-align:center;'>\u4e0a\u4f20</th>"
            "<th style='padding:5px 8px;border:1px solid #b0c4d8;text-align:center;'>\u5f52\u6863</th>"
            "<th style='padding:5px 8px;border:1px solid #b0c4d8;text-align:center;'>\u5f52\u6863\u7387</th>"
            f"</tr></thead><tbody>{cycle_rows}</tbody></table>"
        ) if cycle_rows else '<p style="color:#888;font-size:12px;">\u6682\u65e0\u5468\u671f\u6570\u636e</p>'

        content = (
            f"<div style='font-family:Arial,\"Microsoft YaHei\",sans-serif;font-size:13px;color:#222;'>"
            f"<p style='margin:0 0 6px;'><b>\u9879\u76ee\uff1a</b>{project_name}</p>"
            f"<p style='margin:0 0 6px;'>{party_b_line}<b>\u7c7b\u578b\uff1a</b>{self._frequency_label(frequency)}</p>"
            f"<p style='margin:0 0 6px;color:#888;'>\u7edf\u8ba1\u533a\u95f4\uff1a{period_start.strftime('%Y-%m-%d')} ~ {period_end.strftime('%Y-%m-%d')}</p>"
            f"<div style='display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;'>"
            f"<span style='background:#eef6ff;padding:4px 10px;border-radius:6px;'><b style='color:#2563eb;'>{uploads_val}</b> \u4e0a\u4f20\u901a\u8fc7</span>"
            f"<span style='background:#f0fff4;padding:4px 10px;border-radius:6px;'><b style='color:#16a34a;'>{archived_val}</b> \u5f52\u6863\u901a\u8fc7</span>"
            f"<span style='background:#fdf4ff;padding:4px 10px;border-radius:6px;'><b style='color:#7c3aed;'>{rate_val}%</b> \u5f52\u6863\u7387</span>"
            f"</div>"
            f"<p style='margin:8px 0 4px;font-weight:600;'>\u6309\u5468\u671f\u7edf\u8ba1\uff1a</p>"
            f"{cycle_table}"
            f"<p style='margin:10px 0 0;color:#888;font-size:11px;'>\u6587\u6863\u6e05\u5355\u8bf7\u67e5\u770bPDF\u9644\u4ef6\u3002</p>"
            f"</div>"
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

    def _build_email_content(
        self, project_name: str, frequency: str, start: datetime, end: datetime,
        metrics: Dict[str, Any], party_b: str = ''
    ) -> Tuple[str, str]:
        title = self._frequency_label(frequency)
        uploads = metrics.get('uploads', 0)
        updated_docs = metrics.get('updated_docs', 0)
        archived = metrics.get('archived', 0)
        rate = metrics.get('archive_rate', 0.0)
        by_cycle = metrics.get('by_cycle', {})
        cycle_order = metrics.get('cycle_order', [])
        checklist = metrics.get('checklist', [])

        party_b_line = f"承建单位：{party_b}\n" if party_b else ''
        text = (
            f"项目：{project_name}\n"
            + party_b_line
            + f"报告类型：{title}\n"
            f"统计区间：{start.strftime('%Y-%m-%d')} ~ {end.strftime('%Y-%m-%d')}\n"
            f"上传审核通过次数：{uploads}\n"
            f"文档更新次数：{updated_docs}\n"
            f"归档通过次数：{archived}\n"
            f"归档率：{rate}%\n"
            f"项目文档清单条目数：{len(checklist)}\n"
        )

        rows = ''
        ordered_cycles = [c for c in cycle_order if c in by_cycle] + [c for c in by_cycle.keys() if c not in set(cycle_order)]
        for cycle in ordered_cycles:
            val = by_cycle.get(cycle, {})
            c_uploads = val.get('uploads', 0)
            c_updated = val.get('updated', 0)
            c_archived = val.get('archived', 0)
            c_uploaded_unique = val.get('uploaded_unique', 0)
            if c_uploaded_unique > 0:
                c_rate = round(min(100.0, (c_archived / c_uploaded_unique) * 100), 2)
            else:
                c_rate = 0.0
            bar_width = max(1, min(100, int(c_rate)))
            rows += (
                f"<tr><td style='padding:6px 8px;border:1px solid #ddd'>{str(cycle)}</td>"
                f"<td style='padding:6px 8px;border:1px solid #ddd;text-align:center'>{c_uploads}</td>"
                f"<td style='padding:6px 8px;border:1px solid #ddd;text-align:center'>{c_updated}</td>"
                f"<td style='padding:6px 8px;border:1px solid #ddd;text-align:center'>{c_archived}</td>"
                f"<td style='padding:6px 8px;border:1px solid #ddd'>"
                f"<div style='background:#f1f5f9;height:10px;border-radius:8px;overflow:hidden;'>"
                f"<div style='width:{bar_width}%;background:#22c55e;height:10px;'></div></div>"
                f"<div style='font-size:11px;color:#555;margin-top:3px'>{c_rate}%</div>"
                f"</td></tr>"
            )


        party_b_html = (f"<p style='margin:4px 0;color:#666;font-size:13px'>承建单位：<b>{party_b}</b></p>"
                        if party_b else '')
        no_data_row = "<tr><td colspan='5' style='padding:10px;border:1px solid #ddd;text-align:center;color:#666'>暂无数据</td></tr>"

        # 邮件只包含概括摘要 + 按周期统计表，文档清单和上传明细通过PDF附件发送
        html = (
            f"<div style='font-family:Arial,\"Microsoft YaHei\",sans-serif;line-height:1.6;color:#222;max-width:860px;'>"
            f"<h2 style='margin:0 0 4px;font-size:18px'>项目{title} — {project_name}</h2>"
            f"{party_b_html}"
            f"<p style='margin:4px 0;color:#888;font-size:13px'>统计区间：{start.strftime('%Y-%m-%d')} ~ {end.strftime('%Y-%m-%d')}</p>"
            f"<div style='display:flex;flex-wrap:wrap;gap:10px;margin:14px 0;'>"
            f"<div style='padding:10px 14px;background:#eef6ff;border-radius:8px;min-width:110px;text-align:center;'>"
            f"<div style='font-size:22px;font-weight:bold;color:#2563eb'>{uploads}</div>"
            f"<div style='font-size:12px;color:#64748b;margin-top:2px'>上传审核通过</div></div>"
            f"<div style='padding:10px 14px;background:#fff7ed;border-radius:8px;min-width:110px;text-align:center;'>"
            f"<div style='font-size:22px;font-weight:bold;color:#d97706'>{updated_docs}</div>"
            f"<div style='font-size:12px;color:#64748b;margin-top:2px'>文档更新次数</div></div>"
            f"<div style='padding:10px 14px;background:#f0fff4;border-radius:8px;min-width:110px;text-align:center;'>"
            f"<div style='font-size:22px;font-weight:bold;color:#16a34a'>{archived}</div>"
            f"<div style='font-size:12px;color:#64748b;margin-top:2px'>归档通过</div></div>"
            f"<div style='padding:10px 14px;background:#fdf4ff;border-radius:8px;min-width:110px;text-align:center;'>"
            f"<div style='font-size:22px;font-weight:bold;color:#7c3aed'>{rate}%</div>"
            f"<div style='font-size:12px;color:#64748b;margin-top:2px'>归档率</div></div></div>"
            f"<h3 style='font-size:14px;margin:18px 0 8px;color:#374151'>按周期统计</h3>"
            f"<table style='border-collapse:collapse;width:100%;font-size:13px;'>"
            f"<thead><tr style='background:#f8fafc;'>"
            f"<th style='padding:8px;border:1px solid #ddd;text-align:left'>周期</th>"
            f"<th style='padding:8px;border:1px solid #ddd;text-align:center'>上传通过</th>"
            f"<th style='padding:8px;border:1px solid #ddd;text-align:center'>更新次数</th>"
            f"<th style='padding:8px;border:1px solid #ddd;text-align:center'>归档通过</th>"
            f"<th style='padding:8px;border:1px solid #ddd;text-align:left'>归档率图示</th>"
            f"</tr></thead>"
            f"<tbody>{rows or no_data_row}</tbody></table>"
            f"<p style='margin:18px 0 4px;color:#888;font-size:12px'>文档清单及上传明细请查看PDF附件。</p>"
            f"</div>"
        )
        return text, html
    def _build_pdf_report(self, project_name: str, frequency: str, start: datetime, end: datetime, metrics: Dict[str, Any]) -> Optional[Path]:
        try:
            from reportlab.lib import colors as rl_colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.cidfonts import UnicodeCIDFont
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
            from reportlab.lib.enums import TA_CENTER, TA_LEFT

            out_dir = Path('uploads/tasks/reports')
            out_dir.mkdir(parents=True, exist_ok=True)
            suffix = now_with_timezone().strftime('%Y%m%d_%H%M%S')
            pdf_path = out_dir / f"scheduled_report_{suffix}.pdf"

            pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
            font_name = 'STSong-Light'

            styles = getSampleStyleSheet()
            h1 = ParagraphStyle('h1', fontName=font_name, fontSize=14, spaceAfter=4)
            h2 = ParagraphStyle('h2', fontName=font_name, fontSize=11, spaceAfter=4, spaceBefore=10)
            body = ParagraphStyle('body', fontName=font_name, fontSize=9, spaceAfter=2)

            title_label = self._frequency_label(frequency)
            party_b = metrics.get('party_b', '')

            elems = []
            elems.append(Paragraph(f'项目定时{title_label}：{project_name}', h1))
            if party_b:
                elems.append(Paragraph(f'承建单位：{party_b}', body))
            elems.append(Paragraph(f"统计区间：{start.strftime('%Y-%m-%d')} ~ {end.strftime('%Y-%m-%d')}", body))
            elems.append(Spacer(1, 6))

            # 概况统计行
            uploads = metrics.get('uploads', 0)
            updated_docs = metrics.get('updated_docs', 0)
            archived = metrics.get('archived', 0)
            rate = metrics.get('archive_rate', 0.0)
            summary_data = [
                ['上传审核通过', '文档更新次数', '归档通过', '归档率'],
                [str(uploads), str(updated_docs), str(archived), f'{rate}%'],
            ]
            summary_style = TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), font_name),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('FONTSIZE', (0, 1), (-1, 1), 13),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#e8f0fb')),
                ('BOX', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#b0c4d8')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#b0c4d8')),
                ('ROWBACKGROUNDS', (0, 1), (-1, 1), [rl_colors.white]),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ])
            w = (A4[0] - 80) / 4
            elems.append(Table(summary_data, colWidths=[w, w, w, w], style=summary_style))
            elems.append(Spacer(1, 8))

            # 按周期统计
            elems.append(Paragraph('按周期统计', h2))
            by_cycle = metrics.get('by_cycle', {})
            cycle_order = metrics.get('cycle_order', [])
            ordered_cycles = [x for x in cycle_order if x in by_cycle] + [x for x in by_cycle.keys() if x not in set(cycle_order)]
            cycle_data = [['周期', '上传通过', '更新次数', '归档通过', '归档率']]
            for cycle in ordered_cycles:
                val = by_cycle.get(cycle, {})
                u = val.get('uploads', 0)
                upd = val.get('updated', 0)
                a = val.get('archived', 0)
                uniq = val.get('uploaded_unique', 0)
                r = round(min(100.0, (a / uniq) * 100), 2) if uniq > 0 else 0.0
                cycle_data.append([str(cycle), str(u), str(upd), str(a), f'{r}%'])
            cycle_style = TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), font_name),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#e8f0fb')),
                ('BOX', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#b0c4d8')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#c9d7e8')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor('#f5f8fd')]),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ])
            pw = A4[0] - 80
            elems.append(Table(cycle_data, colWidths=[pw*0.35, pw*0.15, pw*0.15, pw*0.15, pw*0.2], style=cycle_style))

            # 项目文档清单
            checklist = metrics.get('checklist', [])
            if checklist:
                elems.append(PageBreak())
                elems.append(Paragraph('项目文档清单（按系统周期顺序）', h1))
                cl_data = [['序号', '周期', '文档名称', '要求', '上传数', '状态']]
                prev_cycle = None
                for i, item in enumerate(checklist, 1):
                    cur_cycle = str(item.get('cycle', ''))
                    cycle_cell = cur_cycle if cur_cycle != prev_cycle else ''
                    prev_cycle = cur_cycle
                    status = str(item.get('status', ''))
                    cl_data.append([
                        str(i),
                        cycle_cell,
                        str(item.get('doc_name', '')),
                        str(item.get('requirement', '') or '-'),
                        str(item.get('uploaded_count', 0)),
                        status,
                    ])
                # 为不同状态上色
                cl_style_cmds = [
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('ALIGN', (0, 0), (0, -1), 'CENTER'),   # 序号居中
                    ('ALIGN', (4, 0), (5, -1), 'CENTER'),   # 上传数、状态居中
                    ('ALIGN', (1, 0), (3, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#e8f0fb')),
                    ('BOX', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#b0c4d8')),
                    ('INNERGRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#c9d7e8')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor('#f5f8fd')]),
                    ('TOPPADDING', (0, 0), (-1, -1), 3),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                    ('WORDWRAP', (2, 1), (3, -1), True),
                ]
                for row_idx, item in enumerate(checklist, 1):
                    status = str(item.get('status', ''))
                    if status == '已完成':
                        cl_style_cmds.append(('TEXTCOLOR', (5, row_idx), (5, row_idx), rl_colors.HexColor('#16a34a')))
                    elif status == '待完善':
                        cl_style_cmds.append(('TEXTCOLOR', (5, row_idx), (5, row_idx), rl_colors.HexColor('#d97706')))
                    elif status == '未上传':
                        cl_style_cmds.append(('TEXTCOLOR', (5, row_idx), (5, row_idx), rl_colors.HexColor('#dc2626')))
                cl_style = TableStyle(cl_style_cmds)
                cw = pw / 6
                elems.append(Table(cl_data, colWidths=[cw*0.5, cw*1.2, cw*1.8, cw*1.3, cw*0.5, cw*0.7], style=cl_style, repeatRows=1))

            # 本期文档上传明细
            doc_details = metrics.get('doc_details', [])
            if doc_details:
                elems.append(PageBreak())
                elems.append(Paragraph('本期文档上传明细', h1))
                dd_data = [['序号', '周期', '文档名称', '文件名', '上传人', '上传时间']]
                prev_cycle = None
                for idx, d in enumerate(doc_details, 1):
                    cur_cycle = str(d.get('cycle', ''))
                    cycle_cell = cur_cycle if cur_cycle != prev_cycle else ''
                    prev_cycle = cur_cycle
                    doc_name = str(d.get('doc_name', ''))
                    if d.get('is_update'):
                        doc_name += '(更新)'
                    upload_time = str(d.get('upload_time', '') or '').split('T')[0].split(' ')[0] or '-'
                    dd_data.append([
                        str(idx),
                        cycle_cell,
                        doc_name,
                        str(d.get('filename', '') or '')[:30],
                        str(d.get('uploader', '-') or '-'),
                        upload_time,
                    ])
                dd_style = TableStyle([
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                    ('ALIGN', (1, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('BACKGROUND', (0, 0), (-1, 0), rl_colors.HexColor('#e8f0fb')),
                    ('BOX', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#b0c4d8')),
                    ('INNERGRID', (0, 0), (-1, -1), 0.5, rl_colors.HexColor('#c9d7e8')),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [rl_colors.white, rl_colors.HexColor('#f5f8fd')]),
                    ('TOPPADDING', (0, 0), (-1, -1), 3),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ])
                dw = pw / 6
                elems.append(Table(dd_data, colWidths=[dw*0.4, dw*0.9, dw*1.4, dw*1.5, dw*0.9, dw*0.9], style=dd_style, repeatRows=1))

            doc = SimpleDocTemplate(
                str(pdf_path), pagesize=A4,
                leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40
            )
            doc.build(elems)
            return pdf_path
        except Exception as e:
            logger.warning(f'[ScheduledReportService] build pdf failed: {e}')
            return None


scheduled_report_service = ScheduledReportService()
