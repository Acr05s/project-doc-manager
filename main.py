"""
项目文档管理中心 - 主入口文件
支持文档收集、版本管理、签字盖章识别和缺失文档统计
"""

import logging
from typing import Dict, Any, Optional
from flask import Flask
from flask_cors import CORS

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 项目根目录（main.py 所在目录）
import os as _os
BASE_DIR = _os.path.dirname(_os.path.abspath(__file__))

# Flask应用初始化
def create_app(config: Optional[Dict] = None) -> Flask:
    """创建Flask应用"""
    app = Flask(__name__, 
                template_folder='templates',
                static_folder='static')
    
    # 添加CORS支持
    CORS(app)
    
    # 移除文件大小限制（设为None表示无限制）
    app.config['MAX_CONTENT_LENGTH'] = None
    # 使用绝对路径，避免因启动目录不同导致数据目录错误
    app.config['UPLOAD_FOLDER'] = _os.path.join(BASE_DIR, 'uploads')
    app.config['SECRET_KEY'] = 'doc_manager_secret_key'
    
    # 分片上传配置
    app.config['CHUNK_SIZE'] = 1024 * 1024 * 10  # 每个分片10MB
    app.config['TEMP_FOLDER'] = _os.path.join(BASE_DIR, 'uploads', 'temp_chunks')
    
    # 创建文档管理器实例
    from app.utils.document_manager import DocumentManager
    doc_manager = DocumentManager({
        'base_dir': BASE_DIR,
        **(config or {})
    })
    
    # 初始化任务服务
    from app.services.task_service import task_service
    task_service.set_doc_manager(doc_manager)
    
    # 初始化路由
    from app.routes.main_routes import main_bp, init_doc_manager as init_main_manager
    from app.routes.projects import project_bp, init_doc_manager as init_project_manager
    from app.routes.documents import document_bp, init_doc_manager as init_document_manager
    from app.routes.task_routes import task_bp
    from app.routes.swagger_routes import swagger_bp
    
    # 初始化文档管理器到路由模块
    init_main_manager(doc_manager)
    init_project_manager(doc_manager)
    init_document_manager(doc_manager)
    
    # 注册蓝图
    app.register_blueprint(main_bp)
    app.register_blueprint(project_bp, url_prefix='/api/projects')
    app.register_blueprint(document_bp, url_prefix='/api/documents')
    app.register_blueprint(task_bp)
    app.register_blueprint(swagger_bp)
    
    # 报告生成路由
    @app.route('/api/report', methods=['POST'])
    def generate_report():
        """生成报告"""
        try:
            from flask import request, jsonify
            data = request.get_json()
            project_config = data.get('project_config')
            if not project_config:
                return jsonify({'status': 'error', 'message': '未提供项目配置'}), 400
            
            report = doc_manager.generate_report(project_config)
            
            return jsonify({
                'status': 'success',
                'data': report
            })
        except Exception as e:
            logger.error(f"生成报告失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    return app

# 导入插件接口
from app.plugins import create_plugin, process

# 创建应用实例，供WSGI服务器使用
app = create_app()

if __name__ == '__main__':
    # 设置 UTF-8 编码支持
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    
    # 处理命令行参数
    import argparse
    parser = argparse.ArgumentParser(description='项目文档管理中心')
    parser.add_argument('--port', type=int, default=5000, help='服务器端口')
    parser.add_argument('--mode', choices=['dev', 'prod'], default='dev', help='运行模式')
    args = parser.parse_args()
    
    print("Starting application...")
    try:
        app = create_app()
        print(f"Application created successfully")
        
        if args.mode == 'dev':
            # 开发模式
            print(f"Running in development mode on http://0.0.0.0:{args.port}")
            app.run(debug=True, host='0.0.0.0', port=args.port)
        else:
            # 生产模式
            print(f"Running in production mode")
            print("请使用WSGI服务器启动，例如:")
            print(f"  gunicorn -w 4 -b 0.0.0.0:{args.port} main:app")
            print(f"  或 waitress-serve --listen=0.0.0.0:{args.port} main:app")
    except Exception as e:
        print(f"Error starting application: {e}")
        import traceback
        traceback.print_exc()