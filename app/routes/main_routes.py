"""主路由模块 - 处理主页和通用功能"""

from flask import Blueprint, request, jsonify, render_template, make_response
from pathlib import Path
import tempfile
import shutil
from urllib.parse import quote

main_bp = Blueprint('main', __name__)
doc_manager = None

def init_doc_manager(manager):
    """初始化文档管理器"""
    global doc_manager
    doc_manager = manager

from flask_login import login_required

@main_bp.route('/')
@login_required
def index():
    """主页"""
    return render_template('index.html')

@main_bp.route('/api/project/load', methods=['POST'])
def load_project():
    """加载项目配置（支持Excel和JSON自动识别）并保存为需求配置"""
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        # 保存临时文件
        temp_dir = Path(tempfile.mkdtemp())
        temp_path = temp_dir / file.filename
        file.save(str(temp_path))
        
        # 加载项目配置（自动识别Excel或JSON）
        project_config = doc_manager.load_requirements(str(temp_path))
        
        # 清理临时文件
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        # 检查配置是否有效
        if not project_config or not project_config.get('cycles'):
            return jsonify({'status': 'error', 'message': '文件解析失败或格式不正确'}), 400
        
        # 保存为独立的requirements文件
        result = doc_manager.save_requirements_config(project_config, file.filename)
        
        if result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': result.get('message', '保存配置失败')}), 500
        
        return jsonify({
            'status': 'success',
            'data': project_config,
            'requirements_id': result.get('requirements_id'),
            'requirements_name': result.get('name')
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@main_bp.route('/api/project/export-requirements', methods=['GET'])
def export_requirements():
    """导出需求清单为JSON"""
    try:
        project_id = request.args.get('project_id')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 加载项目
        result = doc_manager.load_project(project_id)
        if result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = result.get('project', {})
        
        # 导出需求清单
        json_content = doc_manager.export_requirements_to_json(project_config)
        
        # 创建响应
        project_name = project_config.get('name', 'project')
        filename = f"requirements_{project_name}.json"
        # 对文件名进行URL编码，解决中文文件名问题
        encoded_filename = quote(filename)
        
        response = make_response(json_content)
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded_filename}'
        
        return response
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@main_bp.route('/api/version', methods=['GET'])
def get_version():
    """获取版本信息"""
    try:
        import os
        version_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'Version.txt')
        
        if os.path.exists(version_file):
            with open(version_file, 'r', encoding='utf-8') as f:
                content = f.read()
            return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}
        else:
            return '0.0.1\n\n版本文件不存在', 200, {'Content-Type': 'text/plain; charset=utf-8'}
    except Exception as e:
        return f'0.0.1\n\n获取版本信息失败: {str(e)}', 200, {'Content-Type': 'text/plain; charset=utf-8'}


# ========== 系统设置路由 ==========
from .settings import load_settings, save_settings, update_plugin_json, get_local_version, check_github_update

@main_bp.route('/api/settings', methods=['GET'])
def api_get_settings():
    """获取系统设置"""
    settings = load_settings()
    settings['current_version'] = get_local_version()
    return jsonify({
        'status': 'success',
        'data': settings
    })

@main_bp.route('/api/settings', methods=['POST'])
def api_update_settings():
    """更新系统设置"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '无效的数据'}), 400
        
        # 加载当前设置
        current_settings = load_settings()
        
        # 更新允许修改的字段
        allowed_fields = ['system_name', 'author', 'description', 'fast_preview_threshold']
        for field in allowed_fields:
            if field in data:
                current_settings[field] = data[field]
        
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

@main_bp.route('/api/settings/check-update', methods=['GET'])
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