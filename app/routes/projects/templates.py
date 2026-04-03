"""需求模板管理API"""

import json
from flask import request, jsonify, Response
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


def export_template(template_id):
    """导出指定模板为JSON文件"""
    try:
        doc_manager = get_doc_manager()
        template_data = doc_manager.export_template(template_id)
        
        if template_data is None:
            return jsonify({'status': 'error', 'message': '模板不存在或导出失败'}), 404
        
        # 生成文件名
        filename = f"template_{template_data.get('name', template_id)}_{datetime.now().strftime('%Y%m%d')}.json"
        
        return Response(
            json.dumps(template_data, ensure_ascii=False, indent=2),
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename*=UTF-8\'\'{filename}'}
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_template():
    """导入模板JSON"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        
        if not data:
            return jsonify({'status': 'error', 'message': '未接收到模板数据'}), 400
        
        # 获取导入信息
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        template_data = data.get('template_data')
        
        if not name:
            return jsonify({'status': 'error', 'message': '模板名称不能为空'}), 400
        
        if not template_data:
            return jsonify({'status': 'error', 'message': '模板数据不能为空'}), 400
        
        result = doc_manager.import_template(template_data, name, description)
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
