"""模块管理路由 - 处理项目中的模块创建、编辑、删除等操作"""

import json
import logging
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from .utils import get_doc_manager

logger = logging.getLogger(__name__)

# 模块路由蓝图
modules_bp = Blueprint('modules', __name__, url_prefix='/api/modules')


@modules_bp.route('/list', methods=['GET'])
@login_required
def list_modules():
    """获取项目模块列表"""
    try:
        project_id = request.args.get('project_id')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少 project_id 参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 从项目配置中获取模块信息
        project_config = doc_manager.get_project_config(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        modules = project_config.get('modules', [])
        
        return jsonify({
            'status': 'success',
            'data': modules,
            'count': len(modules)
        })
    except Exception as e:
        logger.error(f"获取模块列表失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@modules_bp.route('/create', methods=['POST'])
@login_required
def create_module():
    """创建新模块"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        module_name = data.get('module_name', '').strip()
        module_description = data.get('module_description', '').strip()
        
        if not project_id or not module_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 获取项目配置
        project_config = doc_manager.get_project_config(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        # 检查模块名称重复
        modules = project_config.get('modules', [])
        if any(m.get('name') == module_name for m in modules):
            return jsonify({'status': 'error', 'message': '模块名称已存在'}), 400
        
        # 创建新模块
        new_module = {
            'id': f'module_{len(modules) + 1}',
            'name': module_name,
            'description': module_description,
            'created_at': __import__('datetime').datetime.now().isoformat(),
            'attributes': [],
            'documents': []
        }
        
        modules.append(new_module)
        project_config['modules'] = modules
        
        # 保存配置
        doc_manager.save_project_config(project_id, project_config)
        
        return jsonify({
            'status': 'success',
            'data': new_module,
            'message': '模块创建成功'
        })
    except Exception as e:
        logger.error(f"创建模块失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@modules_bp.route('/update/<module_id>', methods=['PUT'])
@login_required
def update_module(module_id):
    """更新模块信息"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        module_name = data.get('module_name', '').strip()
        module_description = data.get('module_description', '').strip()
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少 project_id 参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 获取项目配置
        project_config = doc_manager.get_project_config(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        # 找到要更新的模块
        modules = project_config.get('modules', [])
        module = next((m for m in modules if m.get('id') == module_id), None)
        if not module:
            return jsonify({'status': 'error', 'message': '模块不存在'}), 404
        
        # 检查名称重复（排除自己）
        if module_name and module_name != module.get('name'):
            if any(m.get('name') == module_name for m in modules if m.get('id') != module_id):
                return jsonify({'status': 'error', 'message': '模块名称已存在'}), 400
        
        # 更新模块信息
        module['name'] = module_name or module.get('name')
        module['description'] = module_description
        module['updated_at'] = __import__('datetime').datetime.now().isoformat()
        
        # 保存配置
        doc_manager.save_project_config(project_id, project_config)
        
        return jsonify({
            'status': 'success',
            'data': module,
            'message': '模块更新成功'
        })
    except Exception as e:
        logger.error(f"更新模块失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@modules_bp.route('/delete/<module_id>', methods=['DELETE'])
@login_required
def delete_module(module_id):
    """删除模块"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少 project_id 参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 获取项目配置
        project_config = doc_manager.get_project_config(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        # 删除模块
        modules = project_config.get('modules', [])
        original_count = len(modules)
        modules = [m for m in modules if m.get('id') != module_id]
        
        if len(modules) == original_count:
            return jsonify({'status': 'error', 'message': '模块不存在'}), 404
        
        project_config['modules'] = modules
        
        # 保存配置
        doc_manager.save_project_config(project_id, project_config)
        
        return jsonify({
            'status': 'success',
            'message': '模块删除成功',
            'remaining_count': len(modules)
        })
    except Exception as e:
        logger.error(f"删除模块失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@modules_bp.route('/add-attribute/<module_id>', methods=['POST'])
@login_required
def add_module_attribute(module_id):
    """为模块添加自定义属性（智能识别类型）"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        attr_name = data.get('attr_name', '').strip()
        attr_value = data.get('attr_value', '')
        
        if not project_id or not attr_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 获取项目配置
        project_config = doc_manager.get_project_config(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        # 找到模块
        modules = project_config.get('modules', [])
        module = next((m for m in modules if m.get('id') == module_id), None)
        if not module:
            return jsonify({'status': 'error', 'message': '模块不存在'}), 404
        
        # 智能识别属性类型
        attr_type = _infer_attribute_type(attr_value)
        
        # 创建属性对象
        attribute = {
            'id': f'attr_{len(module.get("attributes", [])) + 1}',
            'name': attr_name,
            'value': attr_value,
            'type': attr_type,
            'required': False,
            'created_at': __import__('datetime').datetime.now().isoformat()
        }
        
        # 添加到模块属性列表
        if 'attributes' not in module:
            module['attributes'] = []
        module['attributes'].append(attribute)
        
        # 保存配置
        doc_manager.save_project_config(project_id, project_config)
        
        return jsonify({
            'status': 'success',
            'data': attribute,
            'message': '属性添加成功'
        })
    except Exception as e:
        logger.error(f"添加模块属性失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@modules_bp.route('/update-attribute/<module_id>/<attr_id>', methods=['PUT'])
@login_required
def update_module_attribute(module_id, attr_id):
    """编辑模块属性"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        attr_value = data.get('attr_value')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少 project_id 参数'}), 400
        
        doc_manager = get_doc_manager()
        
        # 获取项目配置
        project_config = doc_manager.get_project_config(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        # 找到模块
        modules = project_config.get('modules', [])
        module = next((m for m in modules if m.get('id') == module_id), None)
        if not module:
            return jsonify({'status': 'error', 'message': '模块不存在'}), 404
        
        # 找到属性
        attributes = module.get('attributes', [])
        attribute = next((a for a in attributes if a.get('id') == attr_id), None)
        if not attribute:
            return jsonify({'status': 'error', 'message': '属性不存在'}), 404
        
        # 更新属性值和类型
        attribute['value'] = attr_value
        attribute['type'] = _infer_attribute_type(attr_value)
        attribute['updated_at'] = __import__('datetime').datetime.now().isoformat()
        
        # 保存配置
        doc_manager.save_project_config(project_id, project_config)
        
        return jsonify({
            'status': 'success',
            'data': attribute,
            'message': '属性更新成功'
        })
    except Exception as e:
        logger.error(f"更新模块属性失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@modules_bp.route('/delete-attribute/<module_id>/<attr_id>', methods=['DELETE'])
@login_required
def delete_module_attribute(module_id, attr_id):
    """Delete module attribute"""
    try:
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': 'Missing project_id'}), 400
        
        doc_manager = get_doc_manager()
        project_config = doc_manager.get_project_config(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': 'Project not found'}), 404
        
        modules = project_config.get('modules', [])
        module = next((m for m in modules if m.get('id') == module_id), None)
        if not module:
            return jsonify({'status': 'error', 'message': 'Module not found'}), 404
        
        attributes = module.get('attributes', [])
        original_count = len(attributes)
        module['attributes'] = [a for a in attributes if a.get('id') != attr_id]
        
        if len(module['attributes']) == original_count:
            return jsonify({'status': 'error', 'message': 'Attribute not found'}), 404
        
        doc_manager.save_project_config(project_id, project_config)
        
        return jsonify({
            'status': 'success',
            'message': 'Attribute deleted successfully',
            'remaining_count': len(module['attributes'])
        })
    except Exception as e:
        logger.error(f"Failed to delete attribute: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


def _infer_attribute_type(value):
    """智能识别属性类型"""
    if isinstance(value, bool) or value in ('true', 'false', 'True', 'False'):
        return 'boolean'
    
    try:
        int(value)
        return 'number'
    except (ValueError, TypeError):
        pass
    
    try:
        float(value)
        return 'number'
    except (ValueError, TypeError):
        pass
    
    if str(value).startswith('[') and str(value).endswith(']'):
        return 'array'
    
    if str(value).startswith('{') and str(value).endswith('}'):
        return 'object'
    
    # Check for multiline text or long text
    if isinstance(value, str) and ('\n' in value or len(value) > 50):
        return 'textarea'
    
    return 'string'
