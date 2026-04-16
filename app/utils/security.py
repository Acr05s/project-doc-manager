"""安全工具模块

提供：
- 真实 IP 提取（反代兼容）
- Secret Key 持久化管理
- 全局请求 IP 封堵检查
- 安全响应头注入
- 简单内存限流（兜底防刷）
"""

from __future__ import annotations

import os
import secrets
import threading
from collections import defaultdict, deque
from datetime import datetime, timedelta
from pathlib import Path
from flask import request, jsonify

BASE_DIR = Path(__file__).resolve().parent.parent.parent
_SECRET_KEY_FILE = BASE_DIR / '.secret_key'

# 内存限流：{ ip: deque([timestamp, ...]) }
_rate_store: dict[str, deque] = defaultdict(deque)
_rate_lock = threading.Lock()


# ---------------------------------------------------------------------------
# IP 提取
# ---------------------------------------------------------------------------

def get_real_ip() -> str:
    """从请求中提取客户端真实 IP，支持反向代理"""
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
        if ip:
            return ip
    real_ip = request.headers.get('X-Real-IP', '').strip()
    if real_ip:
        return real_ip
    return request.remote_addr or '0.0.0.0'


# ---------------------------------------------------------------------------
# 密钥管理
# ---------------------------------------------------------------------------

def load_or_create_secret_key() -> str:
    """从环境变量或持久化文件读取 Secret Key，文件不存在时自动生成。

    优先级：环境变量 SECRET_KEY > .secret_key 文件 > 自动生成并写入文件。
    """
    env_key = os.environ.get('SECRET_KEY', '').strip()
    if env_key:
        return env_key

    if _SECRET_KEY_FILE.exists():
        key = _SECRET_KEY_FILE.read_text(encoding='utf-8').strip()
        if len(key) >= 32:
            return key

    key = secrets.token_hex(32)
    _SECRET_KEY_FILE.write_text(key, encoding='utf-8')
    # 限制文件权限（仅在 Unix 上生效）
    try:
        _SECRET_KEY_FILE.chmod(0o600)
    except Exception:
        pass
    print(f'[SECURITY] 已生成新的 Secret Key 并写入 {_SECRET_KEY_FILE}')
    return key


# ---------------------------------------------------------------------------
# 全局 IP 封堵中间件
# ---------------------------------------------------------------------------

def register_security_hooks(app):
    """向 Flask 应用注册 before_request / after_request 安全钩子"""

    @app.before_request
    def enforce_ip_blacklist():
        """在处理每个请求前检查 IP 黑名单，仅针对 API 和登录页面"""
        path = request.path
        # 静态资源不检查，减少 DB 读取压力
        if path.startswith('/static/'):
            return None

        ip = get_real_ip()
        try:
            from app.models.user import user_manager
            if user_manager.is_ip_blocked(ip):
                if path.startswith('/api/'):
                    return jsonify({'status': 'error', 'message': 'IP 地址已被限制访问'}), 403
                # 非 API 路径（登录页等）重定向到登录并提示
                from flask import redirect, url_for, flash
                try:
                    flash('您的 IP 已被限制访问，如有疑问请联系管理员。', 'danger')
                except Exception:
                    pass
                return redirect(url_for('auth.login'))
        except Exception:
            # 数据库尚未初始化等极端情况：不阻断请求
            pass

        # 登录后全局密码过期强制校验（除改密相关接口外）
        try:
            from flask_login import current_user
            if current_user.is_authenticated:
                # 白名单：登录/登出、认证状态、个人信息读取、改密接口
                is_allowed = (
                    path.startswith('/static/')
                    or path == '/login'
                    or path == '/logout'
                    or path == '/api/auth/status'
                    or (path == '/api/version' and request.method.upper() == 'GET')
                    or (path == '/api/settings/permissions' and request.method.upper() in ('GET', 'POST'))
                    or (path.startswith('/api/messages/') and request.method.upper() in ('GET', 'POST', 'DELETE'))
                    or (path == '/api/me' and request.method.upper() == 'GET')
                    or (path == '/api/me/password' and request.method.upper() == 'POST')
                )
                if not is_allowed:
                    from app.routes.settings import load_settings
                    settings = load_settings()
                    expire_days = int(settings.get('password_expire_days', 0) or 0)
                    if user_manager.is_password_expired(current_user.id, expire_days):
                        message = '密码已过期，请先修改密码后继续操作'
                        if expire_days > 0:
                            message = f'密码已过期（超过 {expire_days} 天），请先修改密码后继续操作'
                        if path.startswith('/api/'):
                            return jsonify({
                                'status': 'password_expired',
                                'message': message,
                                'expire_days': expire_days
                            }), 403
                        return None
        except Exception:
            pass
        return None

    @app.after_request
    def add_security_headers(response):
        """为每个响应注入安全相关 HTTP 头"""
        # 防点击劫持
        response.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
        # 防 MIME 嗅探
        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        # 旧浏览器 XSS 过滤器
        response.headers.setdefault('X-XSS-Protection', '1; mode=block')
        # 来源策略
        response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
        # 禁止跨域嵌入 Flash/PDF
        response.headers.setdefault('X-Permitted-Cross-Domain-Policies', 'none')
        # API 响应不缓存
        if request.path.startswith('/api/'):
            response.headers.setdefault('Cache-Control', 'no-store')
            response.headers.setdefault('Pragma', 'no-cache')
        return response


# ---------------------------------------------------------------------------
# 内存限流（轻量兜底，不需要 Redis）
# ---------------------------------------------------------------------------

def is_rate_limited(ip: str, limit: int, window_seconds: int) -> bool:
    """判断 ip 在 window_seconds 内请求次数是否超过 limit。

    线程安全，使用滑动窗口。
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=window_seconds)

    with _rate_lock:
        dq = _rate_store[ip]
        # 移除窗口外的旧记录
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            return True
        dq.append(now)
        return False
