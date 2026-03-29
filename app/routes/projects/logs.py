"""操作日志相关路由"""

from flask import request, jsonify
from datetime import datetime
from .utils import get_doc_manager


def get_operation_logs():
    """获取操作日志（内部接口）"""
    try:
        doc_manager = get_doc_manager()
        limit = request.args.get('limit', 100, type=int)
        operation_type = request.args.get('type', None)
        project = request.args.get('project', None)

        logs = doc_manager.get_operation_logs(limit, operation_type, project)

        return jsonify({
            'status': 'success',
            'logs': logs,
            'count': len(logs)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_external_logs():
    """获取操作日志（外部接口 - 供外部平台调用）"""
    try:
        doc_manager = get_doc_manager()
        import os
        
        # 外部接口需要API Key验证
        api_key = request.headers.get('X-API-Key') or request.args.get('api_key')
        expected_key = os.environ.get('EXTERNAL_API_KEY', 'docmgr_secret_key')

        # 如果配置了API Key，则验证
        if expected_key and api_key != expected_key:
            return jsonify({'status': 'error', 'message': 'API Key无效'}), 401

        limit = request.args.get('limit', 100, type=int)
        operation_type = request.args.get('type', None)
        project = request.args.get('project', None)

        logs = doc_manager.get_operation_logs(limit, operation_type, project)

        return jsonify({
            'status': 'success',
            'logs': logs,
            'count': len(logs),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
