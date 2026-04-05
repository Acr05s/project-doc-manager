"""系统设置相关路由"""

from flask import request, jsonify, Blueprint
import json
import os
from pathlib import Path
import urllib.request
import urllib.error

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
        'description': '项目全生命周期文档管理系统'
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
        allowed_fields = ['system_name', 'author', 'description', 'fast_preview_threshold']
        print(f"[update_settings] Allowed fields: {allowed_fields}", flush=True)
        print(f"[update_settings] Data: {data}", flush=True)
        print(f"[update_settings] Data type: {type(data)}", flush=True)
        
        # 手动检查 fast_preview_threshold
        print(f"[update_settings] 'fast_preview_threshold' in data: {'fast_preview_threshold' in data}", flush=True)
        if 'fast_preview_threshold' in data:
            print(f"[update_settings] data['fast_preview_threshold'] = {data['fast_preview_threshold']}", flush=True)
        
        for field in allowed_fields:
            print(f"[update_settings] Checking field: {field}", flush=True)
            if field in data:
                print(f"[update_settings] >>> Updating {field}: {data[field]}", flush=True)
                current_settings[field] = data[field]
                print(f"[update_settings] >>> Updated current_settings[{field}] = {current_settings[field]}", flush=True)
            else:
                print(f"[update_settings] Field not in data: {field}", flush=True)
        
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
