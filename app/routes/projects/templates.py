"""需求模板管理API"""

from flask import request, jsonify
from datetime import datetime
from .utils import get_doc_manager


def list_templates():
    """获取模板列表"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.list_templates()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def save_template():
    """保存需求模板"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        template_name = data.get('template_name', '')
        template_data = data.get('template_data', {})
        description = data.get('description', '')
        
        if not template_name:
            return jsonify({'status': 'error', 'message': '模板名称不能为空'}), 400
        
        if not template_data:
            return jsonify({'status': 'error', 'message': '模板数据不能为空'}), 400
        
        result = doc_manager.save_template(template_name, template_data, description)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def load_template(template_id):
    """加载指定模板"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.load_template(template_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_template(template_id):
    """删除指定模板"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.delete_template(template_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def apply_template_to_project(project_id, template_id):
    """将模板应用到项目"""
    try:
        doc_manager = get_doc_manager()
        # 加载模板
        template_result = doc_manager.load_template(template_id)
        if template_result['status'] != 'success':
            return jsonify(template_result), 400
        
        template = template_result['template']
        
        # 加载项目配置
        config = doc_manager.load(project_id)
        if not config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        # 应用模板数据
        config['cycles'] = template.get('cycles', [])
        config['documents'] = template.get('documents', {})
        config['updated_time'] = datetime.now().isoformat()
        
        # 保存配置
        doc_manager.save(project_id, config)
        
        return jsonify({
            'status': 'success',
            'message': '模板应用成功',
            'config': config
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
