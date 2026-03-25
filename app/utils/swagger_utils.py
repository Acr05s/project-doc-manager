"""Swagger工具模块 - 处理API文档相关功能"""

from flask import redirect, request, jsonify
from typing import Dict, Any

def setup_swagger(app) -> None:
    """设置Swagger配置"""
    app.config['SWAGGER'] = {
        'title': '项目文档管理中心 API',
        'uiversion': 3,
        'version': '1.0.0',
        'description': '项目全生命周期文档管理系统API文档',
        'contact': {
            'developer': '文档管理团队',
            'email': 'support@example.com'
        },
        'license': {
            'name': 'MIT',
            'url': 'https://opensource.org/licenses/MIT'
        },
        'tags': [
            {
                'name': '项目管理',
                'description': '项目创建、加载、删除等操作'
            },
            {
                'name': '文档管理',
                'description': '文档上传、下载、预览、删除等操作'
            },
            {
                'name': '报告生成',
                'description': '生成项目文档管理报告'
            },
            {
                'name': '任务管理',
                'description': '后台任务管理'
            },
            {
                'name': '系统管理',
                'description': '日志查询、系统配置等'
            }
        ]
    }

def get_api_spec() -> Dict[str, Any]:
    """获取OpenAPI规范（JSON格式）"""
    spec = {
        'openapi': '3.0.0',
        'info': {
            'title': '项目文档管理中心 API',
            'version': '1.0.0',
            'description': '项目全生命周期文档管理系统API文档'
        },
        'tags': [],
        'servers': [
            {
                'url': request.host_url.rstrip('/'),
                'description': '当前服务器'
            }
        ],
        'paths': {}
    }
    return spec