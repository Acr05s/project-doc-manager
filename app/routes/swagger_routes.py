"""Swagger路由模块 - 处理API文档路由"""

from flask import Blueprint, redirect, jsonify
from app.utils.swagger_utils import setup_swagger, get_api_spec

swagger_bp = Blueprint('swagger', __name__)

@swagger_bp.route('/api/docs')
def api_docs():
    """Swagger UI API文档页面"""
    try:
        from flasgger import Swagger
        
        # 导入当前应用实例
        from flask import current_app
        app = current_app
        
        # 设置Swagger配置
        setup_swagger(app)
        
        swagger = Swagger(app, config=app.config['SWAGGER'])
        return redirect('/apidocs/')
    except ImportError:
        return "API文档功能需要安装flasgger包，请运行: pip install flasgger", 500

@swagger_bp.route('/api/spec.json')
def api_spec():
    """获取OpenAPI规范（JSON格式）"""
    try:
        spec = get_api_spec()
        return jsonify(spec)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500