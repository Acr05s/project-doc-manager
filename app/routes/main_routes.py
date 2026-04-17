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


# 系统设置路由已迁移至 settings.py（settings_bp），此处不再重复注册