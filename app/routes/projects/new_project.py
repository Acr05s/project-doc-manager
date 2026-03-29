"""新版文档清单模式API"""

import json
from flask import request, jsonify, send_file, make_response
from .utils import get_doc_manager


def create_new_project():
    """创建新项目（新版文档清单模式）"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        project_name = data.get('name')
        project_info = data.get('project_info', {})
        cycles = data.get('cycles', [])  # [{"序号": 1, "名称": "准备阶段"}, ...]
        documents = data.get('documents', {})  # {"周期名": [{"文档名": "...", "要求": "..."}]}
        
        if not project_name:
            return jsonify({'status': 'error', 'message': '项目名称不能为空'}), 400
        
        # 创建文档清单
        result = doc_manager.create_document_list(project_name, project_info, cycles, documents)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def load_new_project(project_name):
    """加载项目（新版文档清单模式）"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.load_document_list(project_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def archive_new_document(project_name):
    """归档文档（新版文档清单模式）"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        cycle_name = data.get('cycle_name')
        doc_name = data.get('doc_name')
        file_path = data.get('file_path')
        source_info = data.get('source_info', {})
        
        if not cycle_name or not doc_name or not file_path:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.archive_document(project_name, cycle_name, doc_name, file_path, source_info)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def export_new_project_package(project_name):
    """导出归档文档包（新版文档清单模式）"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.export_documents_package(project_name)
        if result['status'] != 'success':
            return jsonify(result), 400
        
        package_path = result['package_path']
        download_name = result['download_name']
        
        # 读取文件并发送
        with open(package_path, 'rb') as f:
            file_data = f.read()
        
        response = make_response(file_data)
        response.headers['Content-Type'] = 'application/zip'
        response.headers['Content-Disposition'] = f'attachment; filename="{download_name}"'
        
        return response
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def list_new_projects():
    """获取所有项目列表（新版文档清单模式）"""
    try:
        doc_manager = get_doc_manager()
        projects = []
        
        # 扫描 projects 目录
        for project_dir in doc_manager.projects_base_folder.iterdir():
            if project_dir.is_dir():
                # 检查是否存在文档清单
                doc_list_path = doc_manager.get_document_list_path(project_dir.name)
                if doc_list_path.exists():
                    # 读取基本信息
                    with open(doc_list_path, 'r', encoding='utf-8') as f:
                        doc_list = json.load(f)
                    
                    projects.append({
                        'name': project_dir.name,
                        '项目信息': doc_list.get('项目信息', {}),
                        '周期列表': doc_list.get('周期列表', []),
                        '文档清单路径': str(doc_list_path)
                    })
        
        return jsonify({
            'status': 'success',
            'projects': projects,
            'count': len(projects)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_new_project(project_name):
    """删除项目（新版文档清单模式）"""
    try:
        doc_manager = get_doc_manager()
        import shutil
        
        # 删除项目文件夹
        project_folder = doc_manager.get_project_folder(project_name)
        if project_folder.exists():
            shutil.rmtree(project_folder)
        
        return jsonify({
            'status': 'success',
            'message': f'项目 "{project_name}" 已删除'
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
