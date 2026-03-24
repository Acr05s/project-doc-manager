#!/usr/bin/env python3
"""
独立测试导出需求清单功能的Flask应用
"""

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from app.utils.document_manager import DocumentManager

# 创建Flask应用
app = Flask(__name__)
CORS(app)

# 创建文档管理器实例
doc_manager = DocumentManager()

@app.route('/api/export-requirements', methods=['GET'])
def export_requirements():
    """导出需求清单为JSON"""
    try:
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
        response = make_response(json_content)
        response.headers['Content-Type'] = 'application/json'
        response.headers['Content-Disposition'] = f'attachment; filename="requirements_{project_config.get("name", "project")}.json"'
        
        return response
    except Exception as e:
        print(f"导出需求清单失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/')
def index():
    return '''
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>测试导出需求清单</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 {
                text-align: center;
                color: #333;
            }
            .btn {
                display: inline-block;
                padding: 10px 20px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            }
            .btn:hover {
                background-color: #0069d9;
            }
            .loading-indicator {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0,0,0,0.5);
                z-index: 1000;
                justify-content: center;
                align-items: center;
            }
            .loading-indicator.show {
                display: flex;
            }
            .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #007bff;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .loading-indicator p {
                color: white;
                margin-left: 10px;
            }
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px;
                border-radius: 4px;
                color: white;
                z-index: 1001;
                display: none;
            }
            .notification.show {
                display: block;
            }
            .notification.success {
                background-color: #28a745;
            }
            .notification.error {
                background-color: #dc3545;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>测试导出需求清单功能</h1>
            <button class="btn" onclick="testExport()">测试导出需求清单</button>
            <p>点击按钮后，系统会尝试导出需求清单，显示加载指示器，并在完成后自动下载导出的JSON文件。</p>
        </div>

        <!-- 加载指示器 -->
        <div id="loadingIndicator" class="loading-indicator">
            <div class="spinner"></div>
            <p>加载中...</p>
        </div>

        <!-- 提示信息 -->
        <div id="notification" class="notification"></div>

        <script>
            // 显示加载指示器
            function showLoading(show = true) {
                const loading = document.getElementById('loadingIndicator');
                if (show) {
                    loading.classList.add('show');
                } else {
                    loading.classList.remove('show');
                }
            }

            // 显示通知
            function showNotification(message, type = 'info') {
                const notification = document.getElementById('notification');
                notification.textContent = message;
                notification.className = `notification show ${type}`;

                // 3秒后自动隐藏
                setTimeout(() => {
                    notification.classList.remove('show');
                }, 3000);
            }

            // 测试导出需求清单
            async function testExport() {
                showLoading(true);
                try {
                    const projectId = 'project_20260321080707';
                    const response = await fetch(`/api/export-requirements?project_id=${projectId}`);

                    if (response.ok) {
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `requirements_test.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        
                        showNotification('导出成功！文件已下载', 'success');
                    } else {
                        const errorData = await response.json();
                        showNotification('导出失败: ' + (errorData.message || '未知错误'), 'error');
                    }
                } catch (error) {
                    console.error('导出失败:', error);
                    showNotification('导出失败: ' + error.message, 'error');
                } finally {
                    showLoading(false);
                }
            }
        </script>
    </body>
    </html>
    '''

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5002)
