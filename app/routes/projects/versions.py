"""配置版本管理API"""

from flask import request, jsonify, Response
from .utils import get_doc_manager


def list_config_versions(project_id):
    """获取配置版本列表"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.list_versions(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def save_config_version(project_id):
    """保存当前配置为新版本"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        version_name = data.get('version_name', '')
        description = data.get('description', '')
        
        if not version_name:
            return jsonify({'status': 'error', 'message': '版本名称不能为空'}), 400
        
        result = doc_manager.save_version(project_id, version_name, description)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def load_config_version(project_id, version_filename):
    """加载指定版本配置（预览，不切换）"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.load_version(project_id, version_filename)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def switch_config_version(project_id, version_filename):
    """切换到指定版本"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.switch_version(project_id, version_filename)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_config_version(project_id, version_filename):
    """删除指定版本"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.delete_version(project_id, version_filename)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def export_config_version(project_id, version_filename):
    """导出指定版本配置"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.export_version(project_id, version_filename)
        if result['status'] != 'success':
            return jsonify(result), 400
        
        response = Response(
            result['json_content'],
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename="{result["filename"]}"'
            }
        )
        return response
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
