"""需求模板管理API"""

import json
from flask import request, jsonify, Response
from datetime import datetime
from .utils import get_doc_manager


def validate_template_data(template_data):
    """验证模板数据是否有效
    
    返回: (is_valid: bool, error_message: str)
    """
    if not isinstance(template_data, dict):
        return False, "模板数据必须是JSON对象"
    
    # 检查必需字段
    required_fields = ['cycles', 'documents']
    missing_fields = [f for f in required_fields if f not in template_data]
    if missing_fields:
        return False, f"缺少必需字段: {', '.join(missing_fields)}"
    
    # 检查cycles
    cycles = template_data.get('cycles')
    if not isinstance(cycles, list):
        return False, "'cycles' 必须是数组"
    if len(cycles) == 0:
        return False, "'cycles' 不能为空数组"
    for i, cycle in enumerate(cycles):
        if not isinstance(cycle, str) or not cycle.strip():
            return False, f"第 {i+1} 个周期名称无效"
    
    # 检查documents
    documents = template_data.get('documents')
    if not isinstance(documents, dict):
        return False, "'documents' 必须是对象"
    
    # 检查每个周期的文档配置
    for cycle_name, cycle_data in documents.items():
        if cycle_name not in cycles:
            return False, f"文档配置中的周期 '{cycle_name}' 不在cycles列表中"
        
        if not isinstance(cycle_data, dict):
            return False, f"周期 '{cycle_name}' 的配置必须是对象"
        
        # 检查required_docs
        if 'required_docs' not in cycle_data:
            return False, f"周期 '{cycle_name}' 缺少 'required_docs' 字段"
        
        required_docs = cycle_data.get('required_docs')
        if not isinstance(required_docs, list):
            return False, f"周期 '{cycle_name}' 的 'required_docs' 必须是数组"
        
        # 检查每个文档
        for i, doc in enumerate(required_docs):
            if not isinstance(doc, dict):
                return False, f"周期 '{cycle_name}' 的第 {i+1} 个文档必须是对象"
            
            if 'name' not in doc:
                return False, f"周期 '{cycle_name}' 的第 {i+1} 个文档缺少 'name' 字段"
            
            if not isinstance(doc['name'], str) or not doc['name'].strip():
                return False, f"周期 '{cycle_name}' 的第 {i+1} 个文档名称无效"
            
            # 检查attributes字段（如果存在）
            if 'attributes' in doc and not isinstance(doc['attributes'], dict):
                return False, f"周期 '{cycle_name}' 的文档 '{doc['name']}' 的 'attributes' 必须是对象"
    
    # 检查是否有重复的文档名称（在同一个周期内）
    for cycle_name, cycle_data in documents.items():
        required_docs = cycle_data.get('required_docs', [])
        doc_names = [doc.get('name') for doc in required_docs if isinstance(doc, dict)]
        duplicates = [name for name in set(doc_names) if doc_names.count(name) > 1]
        if duplicates:
            return False, f"周期 '{cycle_name}' 中存在重复的文档名称: {', '.join(duplicates)}"
    
    return True, None


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
        
        # 验证模板数据
        is_valid, error_msg = validate_template_data(template_data)
        if not is_valid:
            return jsonify({'status': 'error', 'message': f'模板数据验证失败: {error_msg}'}), 400
        
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


def update_template(template_id):
    """更新指定模板（名称/描述/内容）。"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json() or {}

        template_name = data.get('template_name')
        description = data.get('description')
        template_data = data.get('template_data')

        if template_name is not None and not str(template_name).strip():
            return jsonify({'status': 'error', 'message': '模板名称不能为空'}), 400

        if template_data is not None:
            is_valid, error_msg = validate_template_data(template_data)
            if not is_valid:
                return jsonify({'status': 'error', 'message': f'模板数据验证失败: {error_msg}'}), 400

        result = doc_manager.update_template(
            template_id=template_id,
            template_name=str(template_name).strip() if template_name is not None else None,
            description=str(description).strip() if description is not None else None,
            template_data=template_data
        )
        code = 200 if result.get('status') == 'success' else 400
        return jsonify(result), code
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
        
        # 验证模板数据
        is_valid, error_msg = validate_template_data(template_data)
        if not is_valid:
            return jsonify({
                'status': 'error', 
                'message': f'模板数据验证失败: {error_msg}',
                'validation_error': error_msg
            }), 400
        
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
        
        # 验证模板数据
        is_valid, error_msg = validate_template_data(template)
        if not is_valid:
            return jsonify({
                'status': 'error', 
                'message': f'模板数据验证失败: {error_msg}'
            }), 400
        
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
