"""系统设置相关路由"""

from flask import request, jsonify, Blueprint
import json
import os
from pathlib import Path
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

settings_bp = Blueprint('settings', __name__)

# 设置文件路径
SETTINGS_FILE = Path(__file__).parent.parent.parent / 'settings.json'
PLUGIN_FILE = Path(__file__).parent.parent.parent / 'plugin.json'
VERSION_FILE = Path(__file__).parent.parent.parent / 'Version.txt'

# GitHub仓库信息
GITHUB_REPO = "bysdc/project_doc_manager"
GITHUB_VERSION_URL = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/Version.txt"


def load_settings():
    """加载系统设置"""
    default_settings = {
        'system_name': '项目文档管理中心',
        'version': '1.0.0',
        'author': '项目验收团队',
        'description': '项目全生命周期文档管理系统',
        'email_notification_enabled': False,
        'require_approval_code': False,
        'force_agreement_on_login': False,
        'agreement_markdown': '# 使用与保密协议\n\n## 一、系统使用协议\n\n1. 本系统仅用于项目资料管理、审批与验收相关工作，禁止用于与业务无关的用途。\n2. 登录账户仅限本人使用，不得借用、共享或转交他人操作。\n3. 用户需对自身操作行为负责，系统将保留完整操作日志用于审计追溯。\n\n## 二、保密协议\n\n1. 系统中的项目资料、审批信息、组织信息及用户数据均属于受控信息。\n2. 未经授权，不得复制、外传、截图传播或对外披露任何涉密内容。\n3. 如发现数据泄露风险、账号异常或违规使用行为，应立即上报管理员。\n\n> 继续登录即视为您已阅读并同意上述使用与保密条款。',
        'password_min_length': 8,
        'password_require_letter_digit': True,
        'approval_code_must_differ_from_password': True,
        'password_expire_days': 0,
        'watermark_enabled': False,
        'watermark_opacity': 15,
        'watermark_content_fields': ['username', 'display_name', 'organization', 'datetime'],
        'smtp_host': '',
        'smtp_port': 465,
        'smtp_username': '',
        'smtp_password': '',
        'smtp_sender': '',
        'smtp_encryption': 'ssl',
        'log_retention_days': 30,
        'timezone': 'Asia/Shanghai',
        'admin_archive_approval_enabled': True,
        'admin_system_settings_require_approval_code': False
    }
    
    # 优先从plugin.json读取
    if PLUGIN_FILE.exists():
        try:
            with open(PLUGIN_FILE, 'r', encoding='utf-8') as f:
                plugin_data = json.load(f)
                default_settings['system_name'] = plugin_data.get('name', default_settings['system_name'])
                default_settings['version'] = plugin_data.get('version', default_settings['version'])
                default_settings['author'] = plugin_data.get('author', default_settings['author'])
                default_settings['description'] = plugin_data.get('description', default_settings['description'])
        except Exception:
            pass
    
    # 从settings.json读取自定义设置（覆盖plugin.json的设置）
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                custom_settings = json.load(f)
                default_settings.update(custom_settings)
        except Exception:
            pass
    
    return default_settings


def save_settings(settings):
    """保存系统设置到settings.json"""
    try:
        print(f"[save_settings] Saving settings: {settings}", flush=True)
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        print(f"[save_settings] Saved to {SETTINGS_FILE}", flush=True)
        return True
    except Exception as e:
        print(f"保存设置失败: {e}", flush=True)
        return False


def update_plugin_json(settings):
    """更新plugin.json"""
    try:
        if PLUGIN_FILE.exists():
            with open(PLUGIN_FILE, 'r', encoding='utf-8') as f:
                plugin_data = json.load(f)
            
            # 更新字段
            plugin_data['name'] = settings.get('system_name', plugin_data.get('name'))
            plugin_data['version'] = settings.get('version', plugin_data.get('version'))
            plugin_data['author'] = settings.get('author', plugin_data.get('author'))
            plugin_data['description'] = settings.get('description', plugin_data.get('description'))
            
            with open(PLUGIN_FILE, 'w', encoding='utf-8') as f:
                json.dump(plugin_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"更新plugin.json失败: {e}")
        return False


def get_local_version():
    """获取本地版本号"""
    try:
        if VERSION_FILE.exists():
            with open(VERSION_FILE, 'r', encoding='utf-8') as f:
                return f.readline().strip()
    except Exception:
        pass
    
    # 从plugin.json获取
    settings = load_settings()
    return settings.get('version', '1.0.0')


def get_system_timezone():
    """获取当前系统设置的时区"""
    settings = load_settings()
    tz_name = settings.get('timezone', 'Asia/Shanghai')
    # 不引入 pytz，用标准库处理常见时区
    tz_map = {
        'Asia/Shanghai': timezone(timedelta(hours=8)),
        'Asia/Hong_Kong': timezone(timedelta(hours=8)),
        'Asia/Taipei': timezone(timedelta(hours=8)),
        'Asia/Tokyo': timezone(timedelta(hours=9)),
        'Asia/Seoul': timezone(timedelta(hours=9)),
        'Asia/Singapore': timezone(timedelta(hours=8)),
        'Asia/Bangkok': timezone(timedelta(hours=7)),
        'Asia/Dubai': timezone(timedelta(hours=4)),
        'Europe/London': timezone(timedelta(hours=0)),
        'Europe/Paris': timezone(timedelta(hours=1)),
        'Europe/Berlin': timezone(timedelta(hours=1)),
        'America/New_York': timezone(timedelta(hours=-5)),
        'America/Los_Angeles': timezone(timedelta(hours=-8)),
        'America/Chicago': timezone(timedelta(hours=-6)),
        'Australia/Sydney': timezone(timedelta(hours=11)),
        'UTC': timezone.utc,
    }
    return tz_map.get(tz_name, timezone(timedelta(hours=8)))


def now_with_timezone():
    """获取配置时区的当前时间"""
    return datetime.now(get_system_timezone())


def check_github_update():
    """检查GitHub上的最新版本"""
    try:
        # 设置超时和请求头
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        req = urllib.request.Request(GITHUB_VERSION_URL, headers=headers, timeout=10)
        
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                content = response.read().decode('utf-8')
                lines = content.strip().split('\n')
                if lines:
                    latest_version = lines[0].strip()
                    current_version = get_local_version()
                    
                    return {
                        'has_update': latest_version != current_version,
                        'current_version': current_version,
                        'latest_version': latest_version,
                        'changelog': '\n'.join(lines[2:]) if len(lines) > 2 else '',
                        'download_url': f"https://github.com/{GITHUB_REPO}/releases"
                    }
        
        return {'error': '无法获取版本信息'}
        
    except urllib.error.HTTPError as e:
        return {'error': f'GitHub请求失败: HTTP {e.code}'}
    except urllib.error.URLError as e:
        return {'error': f'网络连接失败: {str(e.reason)}'}
    except Exception as e:
        return {'error': f'检查更新失败: {str(e)}'}


# API路由处理函数
@settings_bp.route('/api/settings', methods=['GET'])
def get_settings():
    """获取系统设置"""
    settings = load_settings()
    settings['current_version'] = get_local_version()
    return jsonify({
        'status': 'success',
        'data': settings
    })


@settings_bp.route('/api/settings', methods=['POST'])
def update_settings():
    """更新系统设置"""
    try:
        import sys
        data = request.get_json()
        print(f"[update_settings] Received data: {data}", flush=True)
        sys.stdout.flush()
        if not data:
            return jsonify({'status': 'error', 'message': '无效的数据'}), 400
        
        # 加载当前设置
        current_settings = load_settings()
        print(f"[update_settings] Current settings: {current_settings}", flush=True)
        
        # 更新允许修改的字段
        allowed_fields = ['system_name', 'author', 'description', 'fast_preview_threshold', 'email_notification_enabled', 'log_retention_days', 'timezone', 'require_approval_code', 'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_sender', 'smtp_encryption', 'force_agreement_on_login', 'agreement_markdown', 'watermark_enabled', 'watermark_opacity', 'watermark_content_fields', 'password_min_length', 'password_require_letter_digit', 'approval_code_must_differ_from_password', 'password_expire_days', 'admin_archive_approval_enabled', 'admin_system_settings_require_approval_code']
        print(f"[update_settings] Allowed fields: {allowed_fields}", flush=True)
        print(f"[update_settings] Data: {data}", flush=True)
        print(f"[update_settings] Data type: {type(data)}", flush=True)
        
        # 手动检查 fast_preview_threshold
        print(f"[update_settings] 'fast_preview_threshold' in data: {'fast_preview_threshold' in data}", flush=True)
        if 'fast_preview_threshold' in data:
            print(f"[update_settings] data['fast_preview_threshold'] = {data['fast_preview_threshold']}", flush=True)
        
        # 规范化布尔字段，确保 false 被正确保存
        bool_fields = {'email_notification_enabled', 'require_approval_code', 'force_agreement_on_login', 'watermark_enabled', 'admin_archive_approval_enabled', 'admin_system_settings_require_approval_code'}
        for field in allowed_fields:
            print(f"[update_settings] Checking field: {field}", flush=True)
            if field in data:
                print(f"[update_settings] >>> Updating {field}: {data[field]}", flush=True)
                val = data[field]
                if field in bool_fields:
                    # 将字符串'false'、0、'' 等转换为正确的布尔值
                    if isinstance(val, bool):
                        current_settings[field] = val
                    elif isinstance(val, str):
                        current_settings[field] = val.lower() in ('true', '1', 'yes')
                    else:
                        current_settings[field] = bool(val)
                else:
                    current_settings[field] = val
                print(f"[update_settings] >>> Updated current_settings[{field}] = {current_settings[field]}", flush=True)
            else:
                print(f"[update_settings] Field not in data: {field}", flush=True)

        # 水印字段白名单化，避免写入非法值
        wm_fields = current_settings.get('watermark_content_fields', ['username', 'display_name', 'organization', 'datetime'])
        if isinstance(wm_fields, str):
            wm_fields = [x.strip() for x in wm_fields.split(',') if x.strip()]
        if not isinstance(wm_fields, list):
            wm_fields = ['username', 'display_name', 'organization', 'datetime']
        allowed_wm_fields = {'username', 'display_name', 'organization', 'datetime'}
        wm_fields = [str(x).strip() for x in wm_fields if str(x).strip() in allowed_wm_fields]
        if not wm_fields:
            wm_fields = ['username', 'display_name', 'organization', 'datetime']
        current_settings['watermark_content_fields'] = wm_fields
        
        print(f"[update_settings] After update: {current_settings}", flush=True)
        
        # DEBUG: 强制检查 fast_preview_threshold
        if 'fast_preview_threshold' not in current_settings:
            raise Exception("fast_preview_threshold missing!")
        
        # 保存到settings.json
        if save_settings(current_settings):
            # 同步更新plugin.json
            update_plugin_json(current_settings)
            
            return jsonify({
                'status': 'success',
                'message': '设置已保存',
                'data': current_settings
            })
        else:
            return jsonify({'status': 'error', 'message': '保存设置失败'}), 500
            
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@settings_bp.route('/api/settings/check-update', methods=['GET'])
def api_check_update():
    """检查系统更新"""
    result = check_github_update()
    
    if 'error' in result:
        return jsonify({
            'status': 'error',
            'message': result['error']
        }), 500
    
    return jsonify({
        'status': 'success',
        'data': result
    })


@settings_bp.route('/api/settings/test-smtp', methods=['POST'])
def test_smtp_connection():
    """测试SMTP邮件连接"""
    try:
        from flask_login import current_user, login_required
        if not current_user.is_authenticated or current_user.role not in ('admin', 'pmo'):
            return jsonify({'status': 'error', 'message': '权限不足'}), 403

        data = request.get_json()
        smtp_host = (data.get('smtp_host') or '').strip()
        smtp_port = int(data.get('smtp_port') or 465)
        smtp_username = (data.get('smtp_username') or '').strip()
        smtp_password = data.get('smtp_password') or ''
        smtp_encryption = data.get('smtp_encryption') or 'ssl'

        if not smtp_host or not smtp_username:
            return jsonify({'status': 'error', 'message': '请填写SMTP服务器地址和用户名'}), 400

        import smtplib
        if smtp_encryption == 'ssl':
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            if smtp_encryption == 'tls':
                server.starttls()

        server.login(smtp_username, smtp_password)
        server.quit()

        return jsonify({'status': 'success', 'message': 'SMTP连接测试成功'})
    except smtplib.SMTPAuthenticationError:
        return jsonify({'status': 'error', 'message': '认证失败，请检查用户名和密码/授权码'})
    except smtplib.SMTPConnectError:
        return jsonify({'status': 'error', 'message': '无法连接到SMTP服务器，请检查地址和端口'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'连接失败: {str(e)}'})


# ================== 权限配置（平台级） ==================

PERMISSIONS_FILE = Path(__file__).parent.parent.parent / 'permissions.json'

# 默认菜单权限配置（项目菜单=顶部, 系统菜单=侧边栏, 含二级子菜单）
DEFAULT_MENU_PERMISSIONS = {
    # ── 项目菜单（顶部，打开项目后显示） ──
    'documentRequirementsMenu': {'label': '📄 文档需求', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'top'},
    'editRequirementsBtn': {'label': '✏️ 编辑文档需求', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'top', 'parent': 'documentRequirementsMenu'},
    'manageVersionsBtn': {'label': '🔄 切换配置版本', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'top', 'parent': 'documentRequirementsMenu'},
    'clearRequirementsBtn': {'label': '🗑️ 删除当前需求', 'roles': ['admin'], 'group': 'top', 'parent': 'documentRequirementsMenu'},
    'documentManagementMenu': {'label': '📋 文档导入与匹配', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor'], 'group': 'top'},
    'zipUploadBtn': {'label': '📥 导入文档', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor'], 'group': 'top', 'parent': 'documentManagementMenu'},
    'deleteProjectBtn': {'label': '🔄 重新匹配文件管理', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top', 'parent': 'documentManagementMenu'},
    'cleanupDuplicatesBtn': {'label': '🧹 清理重复文档', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'top', 'parent': 'documentManagementMenu'},
    'generateReportBtn': {'label': '📊 生成报告', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top'},
    'packageProjectBtn': {'label': '📦 备份项目', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top'},
    'acceptanceMenu': {'label': '✅ 验收项目文件 📊 生成报告 ✅ 确认验收 📦 打包下载', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top'},
    'confirmAcceptanceBtn': {'label': '✅ 确认验收', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'top', 'parent': 'acceptanceMenu'},
    'downloadPackageBtn': {'label': '📦 打包下载', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top', 'parent': 'acceptanceMenu'},
    'archiveAndApprovalMenu': {'label': '📋 文档归档与审批', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top'},
    'openArchiveConfigBtn': {'label': '⚙️ 配置审批流程', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'top', 'parent': 'archiveAndApprovalMenu'},
    'viewArchiveRequestsBtn': {'label': '📨 查看审批请求', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top', 'parent': 'archiveAndApprovalMenu'},
    'viewApprovalHistoryBtn': {'label': '📊 审批历史', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'top', 'parent': 'archiveAndApprovalMenu'},
    # ── 系统菜单（侧边栏，🍀四叶草） ──
    'systemSettingsMenuItem': {'label': '⚙️ 系统设置', 'roles': ['admin'], 'group': 'sidebar'},
    'userApprovalBtn': {'label': '👤 用户审核', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'sidebar'},
    'userApprovalHistoryMenuItem': {'label': '👥 用户审批历史', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'sidebar'},
    'archiveApprovalBtn': {'label': '📋 文档归档审批', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'sidebar'},
    'approvalHistoryBtn': {'label': '📊 审批历史', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'sidebar'},
    'scheduledReportTaskMenuItem': {'label': '🗓️ 定时报告任务', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'sidebar'},
    'logManagementMenuItem': {'label': '📝 操作日志', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor'], 'group': 'sidebar'},
    'userManagementMenuItem': {'label': '👤 用户管理', 'roles': ['admin', 'pmo_leader', 'pmo', 'project_admin'], 'group': 'sidebar'},
    'orgManagementMenuItem': {'label': '🏢 承建单位管理', 'roles': ['admin', 'pmo', 'pmo_leader'], 'group': 'sidebar'},
    'projectManagementMenuItem': {'label': '📁 项目管理', 'roles': ['admin', 'pmo', 'pmo_leader', 'project_admin'], 'group': 'sidebar'},
}


def load_permissions():
    """加载权限配置（平台级）"""
    import copy
    all_roles = ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor']
    permissions = copy.deepcopy(DEFAULT_MENU_PERMISSIONS)
    if PERMISSIONS_FILE.exists():
        try:
            with open(PERMISSIONS_FILE, 'r', encoding='utf-8') as f:
                saved = json.load(f)
            for key, val in saved.items():
                if key in permissions:
                    roles = val.get('roles', permissions[key]['roles'])
                    permissions[key]['roles'] = [r for r in roles if r in all_roles]
                    if val.get('label'):
                        permissions[key]['label'] = str(val.get('label'))
                    if val.get('group') in ('top', 'sidebar'):
                        permissions[key]['group'] = val.get('group')
                    if 'parent' in val:
                        permissions[key]['parent'] = val.get('parent')
                else:
                    roles = [r for r in val.get('roles', []) if r in all_roles]
                    group = val.get('group') if val.get('group') in ('top', 'sidebar') else 'sidebar'
                    dynamic_item = {
                        'label': str(val.get('label') or key),
                        'roles': roles,
                        'group': group
                    }
                    if val.get('parent'):
                        dynamic_item['parent'] = str(val.get('parent'))
                    permissions[key] = dynamic_item
        except Exception:
            pass

    # 兼容旧权限文件：若菜单已授权 PMO，则默认同步授权 PMO负责人
    for key, cfg in permissions.items():
        roles = cfg.get('roles', [])
        if 'pmo' in roles and 'pmo_leader' not in roles:
            cfg['roles'] = roles + ['pmo_leader']

    # 若关闭管理员归档审批权限，则从审批相关菜单中移除 admin
    try:
        settings = load_settings()
        admin_archive_approval_enabled = bool(settings.get('admin_archive_approval_enabled', True))
        if not admin_archive_approval_enabled:
            approval_menu_keys = {
                'archiveAndApprovalMenu',
                'openArchiveConfigBtn',
                'viewArchiveRequestsBtn',
                'viewApprovalHistoryBtn',
                'archiveApprovalBtn',
                'approvalHistoryBtn'
            }
            for key in approval_menu_keys:
                if key in permissions:
                    roles = permissions[key].get('roles', [])
                    permissions[key]['roles'] = [r for r in roles if r != 'admin']
    except Exception:
        pass

    return permissions


def save_permissions(permissions):
    """保存权限配置（平台级）"""
    try:
        with open(PERMISSIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(permissions, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存权限配置失败: {e}", flush=True)
        return False


@settings_bp.route('/api/settings/permissions', methods=['GET'])
def get_permissions():
    """获取菜单权限配置（平台级）"""
    try:
        from flask_login import current_user
        if not current_user.is_authenticated:
            return jsonify({'status': 'error', 'message': '未登录'}), 401
        permissions = load_permissions()
        return jsonify({'status': 'success', 'data': permissions})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@settings_bp.route('/api/settings/permissions', methods=['POST'])
def update_permissions():
    """更新菜单权限配置（仅admin，平台级）"""
    try:
        from flask_login import current_user
        if not current_user.is_authenticated or current_user.role != 'admin':
            return jsonify({'status': 'error', 'message': '权限不足，仅管理员可修改'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '无效的数据'}), 400

        # 加载当前权限
        permissions = load_permissions()
        all_roles = ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor']

        for menu_key, menu_data in data.items():
            if not isinstance(menu_data, dict):
                continue
            roles = menu_data.get('roles', [])
            valid_roles = [r for r in roles if r in all_roles]

            group = menu_data.get('group') if menu_data.get('group') in ('top', 'sidebar') else None
            parent = menu_data.get('parent')
            label = menu_data.get('label')

            if menu_key not in permissions:
                permissions[menu_key] = {
                    'label': str(label or menu_key),
                    'roles': valid_roles,
                    'group': group or 'sidebar'
                }
                if parent:
                    permissions[menu_key]['parent'] = str(parent)
            else:
                permissions[menu_key]['roles'] = valid_roles
                if label:
                    permissions[menu_key]['label'] = str(label)
                if group:
                    permissions[menu_key]['group'] = group
                if parent:
                    permissions[menu_key]['parent'] = str(parent)
                elif 'parent' in permissions[menu_key] and parent == '':
                    permissions[menu_key].pop('parent', None)

        if save_permissions(permissions):
            return jsonify({'status': 'success', 'message': '权限配置已保存', 'data': permissions})
        else:
            return jsonify({'status': 'error', 'message': '保存失败'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
