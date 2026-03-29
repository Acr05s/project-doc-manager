"""项目需求配置相关路由"""

import json
import logging
from pathlib import Path
from flask import request, jsonify, Response
from .utils import get_doc_manager

logger = logging.getLogger(__name__)


def load_project_config():
    """加载项目配置（Excel/JSON文件解析）并保存为独立的requirements文件"""
    try:
        doc_manager = get_doc_manager()
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未获取到文件'}), 400

        # 保存临时文件
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        # 使用 RequirementsLoader 解析文件
        from app.utils.requirements_loader import RequirementsLoader
        loader = RequirementsLoader(doc_manager.config)
        config = loader.load(tmp_path)

        # 删除临时文件
        Path(tmp_path).unlink(missing_ok=True)

        if not config or not config.get('cycles'):
            return jsonify({'status': 'error', 'message': '文件解析失败或格式不正确'}), 400

        # 保存为独立的requirements文件
        logger.info(f"[DEBUG] 调用 save_requirements_config, doc_manager 类型: {type(doc_manager)}")
        logger.info(f"[DEBUG] doc_manager 是否有 save_requirements_config: {hasattr(doc_manager, 'save_requirements_config')}")
        
        result = doc_manager.save_requirements_config(config, file.filename)
        
        # 调试日志
        logger.info(f"[DEBUG] save_requirements_config 返回结果: {result}")
        logger.info(f"[DEBUG] result 类型: {type(result)}")
        if result:
            logger.info(f"[DEBUG] result.keys(): {result.keys() if isinstance(result, dict) else 'N/A'}")
            logger.info(f"[DEBUG] requirements_id: {result.get('requirements_id')}")
            logger.info(f"[DEBUG] name: {result.get('name')}")

        return jsonify({
            'status': 'success',
            'data': config,
            'requirements_id': result.get('requirements_id') if result else None,
            'requirements_name': result.get('name') if result else None
        })
    except Exception as e:
        logger.error(f"[DEBUG] load_project_config 异常: {e}")
        import traceback
        logger.error(f"[DEBUG] 错误堆栈: {traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


def apply_requirements_to_project_route(project_id):
    """将文档需求配置应用到项目"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        requirements_id = data.get('requirements_id')
        
        logger.info(f"[DEBUG] /apply-requirements 被调用: project_id={project_id}, requirements_id={requirements_id}")

        if not requirements_id:
            return jsonify({'status': 'error', 'message': '未指定需求配置ID'}), 400

        result = doc_manager.apply_requirements_to_project(project_id, requirements_id)
        
        logger.info(f"[DEBUG] apply_requirements_to_project 返回: {result}")
        return jsonify(result)
    except Exception as e:
        logger.error(f"[DEBUG] /apply-requirements 异常: {e}")
        import traceback
        logger.error(f"[DEBUG] 错误堆栈: {traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


def list_requirements_configs():
    """获取所有文档需求配置列表"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.list_requirements_configs()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def export_requirements():
    """导出需求清单JSON"""
    try:
        doc_manager = get_doc_manager()
        project_id = request.args.get('project_id')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 获取项目配置
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project_result['project']
        
        # 导出为JSON
        json_content = doc_manager.export_requirements_to_json(project_config)
        
        return Response(
            json_content,
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename=requirements_{project_id}.json'}
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
