"""通知服务模块 - 邮件通知 & 短信通知（预留接口）"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
import json


def _load_settings():
    """加载系统设置"""
    settings_file = Path(__file__).parent.parent.parent / 'settings.json'
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def send_email(to_email, subject, content, html_content=None):
    """发送邮件通知

    Args:
        to_email: 收件人邮箱地址
        subject: 邮件主题
        content: 纯文本内容
        html_content: HTML格式内容（可选）

    Returns:
        dict: {'status': 'success'/'error', 'message': str}
    """
    settings = _load_settings()

    if not settings.get('email_notification_enabled'):
        return {'status': 'skipped', 'message': '邮件通知未开启'}

    smtp_host = settings.get('smtp_host', '').strip()
    smtp_port = int(settings.get('smtp_port', 465))
    smtp_username = settings.get('smtp_username', '').strip()
    smtp_password = settings.get('smtp_password', '')
    smtp_sender = settings.get('smtp_sender', '项目资料管理平台')
    smtp_encryption = settings.get('smtp_encryption', 'ssl')

    if not smtp_host or not smtp_username:
        return {'status': 'error', 'message': 'SMTP未配置'}

    if not to_email:
        return {'status': 'error', 'message': '收件人邮箱为空'}

    try:
        if html_content:
            msg = MIMEMultipart('alternative')
            msg.attach(MIMEText(content, 'plain', 'utf-8'))
            msg.attach(MIMEText(html_content, 'html', 'utf-8'))
        else:
            msg = MIMEText(content, 'plain', 'utf-8')

        msg['Subject'] = subject
        msg['From'] = f'{smtp_sender} <{smtp_username}>'
        msg['To'] = to_email

        if smtp_encryption == 'ssl':
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            if smtp_encryption == 'tls':
                server.starttls()

        server.login(smtp_username, smtp_password)
        server.sendmail(smtp_username, [to_email], msg.as_string())
        server.quit()

        return {'status': 'success', 'message': '邮件发送成功'}
    except Exception as e:
        print(f'[notification] 邮件发送失败: {e}')
        return {'status': 'error', 'message': str(e)}


def notify_user_registered(username, email, organization, role):
    """通知用户注册成功（发送给注册者）"""
    if not email:
        return
    role_map = {'contractor': '普通员工', 'project_admin': '项目经理', 'pmo': '项目管理组织'}
    role_label = role_map.get(role, role)
    subject = '【项目资料管理平台】注册成功通知'
    content = f'''您好 {username}，

您的账户已成功注册，正在等待审核。

注册信息：
- 用户名：{username}
- 角色：{role_label}
- 承建单位：{organization or "无"}

请等待管理员审核通过后即可正常使用系统。

--- 项目资料管理平台'''
    send_email(email, subject, content)


def notify_user_approved(username, email):
    """通知用户审核通过"""
    if not email:
        return
    subject = '【项目资料管理平台】账户审核通过'
    content = f'''您好 {username}，

您的账户已通过审核，现在可以正常登录使用系统。

--- 项目资料管理平台'''
    send_email(email, subject, content)


def notify_user_rejected(username, email):
    """通知用户审核被拒绝"""
    if not email:
        return
    subject = '【项目资料管理平台】账户审核未通过'
    content = f'''您好 {username}，

很遗憾，您的账户审核未通过。如有疑问请联系管理员。

--- 项目资料管理平台'''
    send_email(email, subject, content)


def notify_archive_approved(username, email, project_name, doc_names):
    """通知文档归档审批通过"""
    if not email:
        return
    docs_str = '、'.join(doc_names) if isinstance(doc_names, list) else str(doc_names)
    subject = '【项目资料管理平台】文档归档审批通过'
    content = f'''您好 {username}，

您提交的文档归档申请已通过审批。

项目：{project_name}
文档：{docs_str}

--- 项目资料管理平台'''
    send_email(email, subject, content)


def notify_archive_rejected(username, email, project_name, doc_names, reason=''):
    """通知文档归档审批被拒绝"""
    if not email:
        return
    docs_str = '、'.join(doc_names) if isinstance(doc_names, list) else str(doc_names)
    subject = '【项目资料管理平台】文档归档审批未通过'
    content = f'''您好 {username}，

您提交的文档归档申请未通过审批。

项目：{project_name}
文档：{docs_str}
{f"原因：{reason}" if reason else ""}

--- 项目资料管理平台'''
    send_email(email, subject, content)


# ==================== 短信通知接口（预留） ====================

class SMSNotifier:
    """短信通知接口（预留）

    使用方法：
    1. 继承此类并实现 _send_sms 方法
    2. 实例化后调用 send() 方法发送短信

    示例：
        class AliyunSMS(SMSNotifier):
            def _send_sms(self, phone, template_code, template_params):
                # 调用阿里云短信API
                pass

        sms = AliyunSMS(api_key='xxx', api_secret='xxx')
        sms.send('13800138000', '您的验证码是{code}', code='123456')
    """

    def __init__(self, **config):
        """初始化短信配置

        Args:
            **config: 短信服务商配置参数（如 api_key, api_secret, sign_name 等）
        """
        self.config = config
        self.enabled = False  # 默认未启用

    def send(self, phone, content, **kwargs):
        """发送短信

        Args:
            phone: 手机号
            content: 短信内容
            **kwargs: 额外参数（模板变量等）

        Returns:
            dict: {'status': 'success'/'error'/'skipped', 'message': str}
        """
        if not self.enabled:
            return {'status': 'skipped', 'message': '短信通知未启用'}

        if not phone:
            return {'status': 'error', 'message': '手机号为空'}

        try:
            return self._send_sms(phone, content, **kwargs)
        except Exception as e:
            print(f'[notification] 短信发送失败: {e}')
            return {'status': 'error', 'message': str(e)}

    def _send_sms(self, phone, content, **kwargs):
        """实际发送短信的方法（子类需要覆盖实现）

        Args:
            phone: 手机号
            content: 短信内容
            **kwargs: 额外参数

        Returns:
            dict: {'status': 'success'/'error', 'message': str}
        """
        raise NotImplementedError('请在子类中实现 _send_sms 方法，接入具体的短信服务商API')


# 全局短信通知实例（默认未启用）
sms_notifier = SMSNotifier()
