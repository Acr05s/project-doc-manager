"""
项目文档管理中心 - 主入口文件
支持文档收集、版本管理、签字盖章识别和缺失文档统计
"""

import logging
from typing import Dict, Any, Optional
from flask import Flask, render_template, request, jsonify
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
    # 注意：传入 base_dir（项目根目录），DocumentConfig 会在此基础上自动拼接
    # uploads/ 和 projects/ 等子目录，不要传 upload_folder（否则路径会多嵌套一层）
    from app.utils.document_manager import DocumentManager
    doc_manager = DocumentManager({
        'base_dir': BASE_DIR,
        **(config or {})
    })
    
    # 初始化任务系统（简化版）
    tasks_store = {}
    
    def get_task_status(task_id):
        return tasks_store.get(task_id)
    
    def list_tasks():
        return list(tasks_store.values())
    
    def cancel_task(task_id):
        if task_id in tasks_store:
            tasks_store[task_id]['status'] = 'cancelled'
            tasks_store[task_id]['message'] = '任务已取消'
            return True
        return False
    
    # 初始化路由
    from app.routes.project_routes import project_bp, init_doc_manager as init_project_manager
    from app.routes.document_routes import document_bp, init_doc_manager as init_document_manager
    
    # 初始化文档管理器到路由模块
    init_project_manager(doc_manager)
    init_document_manager(doc_manager)
    
    # 注册蓝图
    app.register_blueprint(project_bp, url_prefix='/api/projects')
    app.register_blueprint(document_bp, url_prefix='/api/documents')
    
    # 主页路由
    @app.route('/')
    def index():
        """主页"""
        return render_template('index.html')
    
    # 项目加载路由
    @app.route('/api/project/load', methods=['POST'])
    def load_project():
        """加载项目配置（支持Excel和JSON自动识别）并保存为需求配置"""
        try:
            from pathlib import Path
            import tempfile
            import shutil
            
            file = request.files.get('file')
            if not file:
                return jsonify({'status': 'error', 'message': '未选择文件'}), 400
            
            # 保存临时文件
            temp_dir = Path(tempfile.mkdtemp())
            temp_path = temp_dir / file.filename
            file.save(str(temp_path))
            
            # 加载项目配置（自动识别Excel或JSON）
            project_config = doc_manager.load_requirements(str(temp_path))
            
            # 清理临时文件
            shutil.rmtree(temp_dir, ignore_errors=True)
            
            # 检查配置是否有效
            if not project_config or not project_config.get('cycles'):
                return jsonify({'status': 'error', 'message': '文件解析失败或格式不正确'}), 400
            
            # 保存为独立的requirements文件
            result = doc_manager.save_requirements_config(project_config, file.filename)
            
            if result.get('status') != 'success':
                return jsonify({'status': 'error', 'message': result.get('message', '保存配置失败')}), 500
            
            return jsonify({
                'status': 'success',
                'data': project_config,
                'requirements_id': result.get('requirements_id'),
                'requirements_name': result.get('name')
            })
        except Exception as e:
            logger.error(f"加载项目失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # 导出需求清单路由
    @app.route('/api/project/export-requirements', methods=['GET'])
    def export_requirements():
        """导出需求清单为JSON"""
        try:
            from flask import make_response
            from pathlib import Path
            
            project_id = request.args.get('project_id')
            if not project_id:
                return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
            
            # 加载项目
            result = doc_manager.load_project(project_id)
            if result.get('status') != 'success':
                return jsonify({'status': 'error', 'message': '项目不存在'}), 404
            
            project_config = result.get('project', {})
            
            # 导出需求清单
            json_content = doc_manager.export_requirements_to_json(project_config)
            
            # 创建响应
            from urllib.parse import quote
            project_name = project_config.get('name', 'project')
            filename = f"requirements_{project_name}.json"
            # 对文件名进行URL编码，解决中文文件名问题
            encoded_filename = quote(filename)
            
            response = make_response(json_content)
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"; filename*=UTF-8\'\'{encoded_filename}'
            
            return response
        except Exception as e:
            logger.error(f"导出需求清单失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # 任务管理路由
    @app.route('/api/tasks', methods=['GET'])
    def get_tasks():
        """获取所有任务"""
        try:
            tasks = list_tasks()
            return jsonify({
                'status': 'success',
                'tasks': tasks
            })
        except Exception as e:
            logger.error(f"获取任务列表失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @app.route('/api/tasks/<task_id>', methods=['GET'])
    def get_task(task_id):
        """获取单个任务状态"""
        try:
            task = get_task_status(task_id)
            if task:
                return jsonify({
                    'status': 'success',
                    'task': task
                })
            else:
                return jsonify({'status': 'error', 'message': '任务不存在'}), 404
        except Exception as e:
            logger.error(f"获取任务状态失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @app.route('/api/tasks/<task_id>', methods=['DELETE'])
    def delete_task(task_id):
        """取消任务"""
        try:
            success = cancel_task(task_id)
            if success:
                return jsonify({
                    'status': 'success',
                    'message': '任务已取消'
                })
            else:
                return jsonify({'status': 'error', 'message': '任务不存在'}), 404
        except Exception as e:
            logger.error(f"取消任务失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # 后台任务启动路由（简化版）
    @app.route('/api/tasks/package', methods=['POST'])
    def start_package_task():
        """启动打包项目任务"""
        try:
            import uuid
            from datetime import datetime
            
            data = request.get_json()
            project_id = data.get('project_id')
            project_config = data.get('project_config')
            
            if not project_id or not project_config:
                return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
            
            # 创建任务
            task_id = str(uuid.uuid4())
            tasks_store[task_id] = {
                'id': task_id,
                'type': 'package',
                'name': '打包项目',
                'status': 'running',
                'progress': 0,
                'message': '开始打包项目...',
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            # 模拟打包过程
            import threading
            import time
            
            def package_task():
                for i in range(1, 11):
                    if tasks_store[task_id]['status'] == 'cancelled':
                        break
                    tasks_store[task_id]['progress'] = i * 10
                    tasks_store[task_id]['message'] = f'正在打包项目... {i * 10}%'
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                    time.sleep(0.5)
                
                if tasks_store[task_id]['status'] != 'cancelled':
                    # 实际打包操作
                    package_path = doc_manager.package_project(project_id, project_config)
                    tasks_store[task_id]['status'] = 'completed'
                    tasks_store[task_id]['message'] = '项目打包完成'
                    tasks_store[task_id]['result'] = {'package_path': package_path}
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            threading.Thread(target=package_task).start()
            
            return jsonify({
                'status': 'success',
                'task_id': task_id,
                'message': '打包任务已启动'
            })
        except Exception as e:
            logger.error(f"启动打包任务失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @app.route('/api/tasks/export', methods=['POST'])
    def start_export_task():
        """启动导出需求清单任务"""
        try:
            import uuid
            from datetime import datetime
            
            data = request.get_json()
            project_id = data.get('project_id')
            project_config = data.get('project_config')
            
            if not project_id or not project_config:
                return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
            
            # 创建任务
            task_id = str(uuid.uuid4())
            tasks_store[task_id] = {
                'id': task_id,
                'type': 'export',
                'name': '导出需求清单',
                'status': 'running',
                'progress': 0,
                'message': '开始导出需求清单...',
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            # 模拟导出过程
            import threading
            import time
            
            def export_task():
                for i in range(1, 6):
                    if tasks_store[task_id]['status'] == 'cancelled':
                        break
                    tasks_store[task_id]['progress'] = i * 20
                    tasks_store[task_id]['message'] = f'正在导出需求清单... {i * 20}%'
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                    time.sleep(0.3)
                
                if tasks_store[task_id]['status'] != 'cancelled':
                    # 实际导出操作
                    json_content = doc_manager.export_requirements_to_json(project_config)
                    tasks_store[task_id]['status'] = 'completed'
                    tasks_store[task_id]['message'] = '需求清单导出完成'
                    tasks_store[task_id]['result'] = {'content': json_content}
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            threading.Thread(target=export_task).start()
            
            return jsonify({
                'status': 'success',
                'task_id': task_id,
                'message': '导出任务已启动'
            })
        except Exception as e:
            logger.error(f"启动导出任务失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @app.route('/api/tasks/report', methods=['POST'])
    def start_report_task():
        """启动生成报告任务"""
        try:
            import uuid
            from datetime import datetime
            
            data = request.get_json()
            project_config = data.get('project_config')
            
            if not project_config:
                return jsonify({'status': 'error', 'message': '缺少项目配置'}), 400
            
            # 创建任务
            task_id = str(uuid.uuid4())
            tasks_store[task_id] = {
                'id': task_id,
                'type': 'report',
                'name': '生成报告',
                'status': 'running',
                'progress': 0,
                'message': '开始生成报告...',
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            # 模拟报告生成过程
            import threading
            import time
            
            def report_task():
                for i in range(1, 8):
                    if tasks_store[task_id]['status'] == 'cancelled':
                        break
                    tasks_store[task_id]['progress'] = round(i * 14.28)
                    tasks_store[task_id]['message'] = f'正在生成报告... {round(i * 14.28)}%'
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                    time.sleep(0.4)
                
                if tasks_store[task_id]['status'] != 'cancelled':
                    # 实际报告生成操作
                    report = doc_manager.generate_report(project_config)
                    tasks_store[task_id]['status'] = 'completed'
                    tasks_store[task_id]['message'] = '报告生成完成'
                    tasks_store[task_id]['result'] = {'report': report}
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            threading.Thread(target=report_task).start()
            
            return jsonify({
                'status': 'success',
                'task_id': task_id,
                'message': '报告生成任务已启动'
            })
        except Exception as e:
            logger.error(f"启动报告生成任务失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    @app.route('/api/report', methods=['POST'])
    def generate_report():
        """生成报告"""
        try:
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
    
    @app.route('/api/tasks/check', methods=['POST'])
    def start_check_task():
        """启动检查异常任务"""
        try:
            import uuid
            from datetime import datetime
            
            data = request.get_json()
            project_config = data.get('project_config')
            
            if not project_config:
                return jsonify({'status': 'error', 'message': '缺少项目配置'}), 400
            
            # 创建任务
            task_id = str(uuid.uuid4())
            tasks_store[task_id] = {
                'id': task_id,
                'type': 'check',
                'name': '检查异常',
                'status': 'running',
                'progress': 0,
                'message': '开始检查异常...',
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            # 模拟检查过程
            import threading
            import time
            
            def check_task():
                for i in range(1, 7):
                    if tasks_store[task_id]['status'] == 'cancelled':
                        break
                    tasks_store[task_id]['progress'] = round(i * 16.67)
                    tasks_store[task_id]['message'] = f'正在检查异常... {round(i * 16.67)}%'
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                    time.sleep(0.3)
                
                if tasks_store[task_id]['status'] != 'cancelled':
                    # 实际检查操作
                    compliance = doc_manager.check_compliance(project_config)
                    tasks_store[task_id]['status'] = 'completed'
                    tasks_store[task_id]['message'] = '异常检查完成'
                    tasks_store[task_id]['result'] = {'compliance': compliance}
                    tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            threading.Thread(target=check_task).start()
            
            return jsonify({
                'status': 'success',
                'task_id': task_id,
                'message': '异常检查任务已启动'
            })
        except Exception as e:
            logger.error(f"启动检查任务失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    

    
    # Swagger API 文档路由
    @app.route('/api/docs')
    def api_docs():
        """Swagger UI API文档页面"""
        try:
            from flasgger import Swagger
            from flask import redirect
            
            # Swagger配置
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
            
            swagger = Swagger(app, config=app.config['SWAGGER'])
            return redirect('/apidocs/')
        except ImportError:
            return "API文档功能需要安装flasgger包，请运行: pip install flasgger", 500
    
    @app.route('/api/spec.json')
    def api_spec():
        """获取OpenAPI规范（JSON格式）"""
        try:
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
            return jsonify(spec)
        except Exception as e:
            logger.error(f"获取API规范失败: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    return app


# 插件入口函数
def create_plugin(config: Optional[Dict] = None):
    """创建插件实例"""
    from app.utils.document_manager import DocumentManager
    return DocumentManager(config)


def process(data: Any, config: Optional[Dict] = None, params: Optional[Dict] = None) -> Dict[str, Any]:
    """兼容接口"""
    from app.utils.document_manager import DocumentManager
    
    manager = DocumentManager(config)
    
    # params示例: {'action': 'load_project', 'file': 'project.xlsx'}
    action = params.get('action', 'info') if params else 'info'
    
    if action == 'load_project':
        project_file = params.get('file')
        return manager.load_project_config(project_file)
    elif action == 'missing_docs':
        project_config = params.get('project_config')
        return manager.get_missing_documents(project_config)
    else:
        return {
            'name': manager.name,
            'version': manager.version,
            'description': '项目文档管理中心'
        }


if __name__ == '__main__':
    # 设置 UTF-8 编码支持
    import sys
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    
    print("Starting application...")
    try:
        # 测试/开发模式
        app = create_app()
        print("Application created successfully")
        print("Running on http://0.0.0.0:5000")
        app.run(debug=True, host='0.0.0.0', port=5000)
    except Exception as e:
        print(f"Error starting application: {e}")
        import traceback
        traceback.print_exc()
