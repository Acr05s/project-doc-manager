"""项目管理相关路由"""

from flask import Blueprint, request, jsonify
from app.utils.document_manager import DocumentManager

project_bp = Blueprint('project', __name__)
doc_manager = None

def init_doc_manager(manager):
    """初始化文档管理器"""
    global doc_manager
    doc_manager = manager

@project_bp.route('/list', methods=['GET'])
def list_projects():
    """获取项目列表"""
    try:
        result = doc_manager.get_projects_list()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/create', methods=['POST'])
def create_project():
    """创建新项目"""
    try:
        data = request.get_json()
        name = data.get('name')
        description = data.get('description', '')
        
        if not name:
            return jsonify({'status': 'error', 'message': '项目名称不能为空'}), 400
        
        result = doc_manager.create_project(name, description)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>', methods=['GET'])
def get_project(project_id):
    """获取项目详情"""
    try:
        result = doc_manager.load_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>', methods=['PUT'])
def update_project(project_id):
    """更新项目"""
    try:
        data = request.get_json()
        result = doc_manager.save_project(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """删除项目"""
    try:
        result = doc_manager.delete_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/structure', methods=['POST'])
def update_project_structure(project_id):
    """更新项目结构"""
    try:
        data = request.get_json()
        action = data.get('action')
        
        if not action:
            return jsonify({'status': 'error', 'message': '操作类型不能为空'}), 400
        
        result = doc_manager.update_project_structure(project_id, action, data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/confirm-cycle', methods=['POST'])
def confirm_cycle_documents(project_id):
    """确认周期所有文档无误"""
    try:
        data = request.get_json()
        cycle_name = data.get('cycle_name')

        if not cycle_name:
            return jsonify({'status': 'error', 'message': '周期名称不能为空'}), 400

        result = doc_manager.confirm_cycle_documents(project_id, cycle_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/export', methods=['GET'])
def export_project(project_id):
    """导出项目为JSON"""
    try:
        result = doc_manager.export_project_json(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/import', methods=['POST'])
def import_project():
    """从JSON导入项目"""
    try:
        data = request.get_json()
        name = data.get('name')  # 可选的新项目名称
        
        if not data:
            return jsonify({'status': 'error', 'message': '未提供项目数据'}), 400
        
        result = doc_manager.import_project_json(data, name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/import/file', methods=['POST'])
def import_project_file():
    """从文件导入项目（JSON文件）"""
    try:
        from flask import request
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        # 读取JSON文件
        import json as json_module
        try:
            json_data = json_module.load(file)
        except:
            return jsonify({'status': 'error', 'message': '无效的JSON文件'}), 400
        
        name = request.form.get('name')  # 可选的新项目名称
        
        result = doc_manager.import_project_json(json_data, name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/package', methods=['GET'])
def package_project(project_id):
    """打包项目（项目配置+文档文件）为ZIP下载"""
    try:
        import io
        import zipfile
        from pathlib import Path
        from flask import make_response
        
        # 获取项目配置
        project = doc_manager.load_project(project_id)
        if not project or project.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project.get('project', {})
        project_name = project_config.get('name', 'project')
        
        # 创建内存ZIP
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # 1. 添加项目配置文件
            import json
            config_json = json.dumps(project_config, ensure_ascii=False, indent=2)
            zip_file.writestr('project_config.json', config_json)
            
            # 2. 添加文档元数据
            all_docs = doc_manager.get_documents()
            docs_json = json.dumps(all_docs, ensure_ascii=False, indent=2)
            zip_file.writestr('documents_metadata.json', docs_json)
            
            # 3. 复制文档文件
            copied_count = 0
            doc_counter = 1
            for doc in all_docs:
                file_path = doc.get('file_path')
                if file_path and Path(file_path).exists():
                    try:
                        # 保持目录结构：cycle/doc_name/filename
                        cycle = doc.get('cycle', 'unknown').replace('/', '_')
                        doc_name = doc.get('doc_name', 'unknown').replace('/', '_')
                        
                        # 生成顺序编号的文件名
                        file_ext = Path(file_path).suffix
                        new_filename = f"{doc_counter:03d}_{doc_name}{file_ext}"
                        arcname = f"documents/{cycle}/{doc_name}/{new_filename}"
                        zip_file.write(file_path, arcname)
                        copied_count += 1
                        doc_counter += 1
                    except Exception as e:
                        pass
        
        # 返回ZIP文件
        zip_buffer.seek(0)
        response = make_response(zip_buffer.getvalue())
        response.headers['Content-Type'] = 'application/zip'
        safe_name = ''.join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_name}_backup.zip"'
        
        return response
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/package/import', methods=['POST'])
def import_package():
    """从ZIP包导入项目"""
    try:
        from flask import request
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400

        import uuid
        import shutil
        from datetime import datetime
        from pathlib import Path
        import zipfile
        import json

        # 保存上传的ZIP到临时文件
        temp_zip_path = doc_manager.upload_folder / 'temp' / f'{uuid.uuid4()}.zip'
        temp_zip_path.parent.mkdir(parents=True, exist_ok=True)
        file.save(str(temp_zip_path))

        # 解压ZIP
        extract_dir = doc_manager.upload_folder / 'temp' / f'import_{uuid.uuid4()}'
        extract_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(temp_zip_path, 'r') as zip_file:
            zip_file.extractall(extract_dir)

        # 读取项目配置
        config_path = extract_dir / 'project_config.json'
        if not config_path.exists():
            # 清理临时文件
            shutil.rmtree(extract_dir, ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': 'ZIP包中缺少项目配置文件'}), 400

        with open(config_path, 'r', encoding='utf-8') as f:
            project_config = json.load(f)

        # 读取文档元数据
        docs_path = extract_dir / 'documents_metadata.json'
        documents_metadata = []
        if docs_path.exists():
            with open(docs_path, 'r', encoding='utf-8') as f:
                documents_metadata = json.load(f)

        # 获取冲突处理选项
        conflict_action = request.form.get('conflict_action', 'rename')
        custom_name = request.form.get('name', '').strip()

        # 确定项目名称
        original_name = project_config.get('name', '未命名项目')
        if custom_name:
            final_name = custom_name
        else:
            final_name = original_name

        # 检查是否有同名项目
        existing_project = None
        for proj_id, proj_data in doc_manager.projects_db.items():
            if proj_data.get('name') == final_name:
                existing_project = proj_data
                break

        if existing_project and conflict_action == 'rename':
            # 自动重命名为带日期的新名称
            final_name = f"{original_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            project_config['name'] = final_name
        elif existing_project and conflict_action == 'overwrite':
            # 覆盖已有项目 - 先删除旧项目
            old_project_id = existing_project.get('id')
            if old_project_id:
                doc_manager.delete_project(old_project_id)
        elif existing_project and conflict_action == 'merge':
            # 智能合并 - 保留已有项目ID，合并内容
            new_project_id = existing_project.get('id')
            old_project_config = existing_project.copy()
            
            # 合并文档结构
            if 'documents' in project_config and 'documents' in old_project_config:
                for cycle, doc_data in project_config['documents'].items():
                    if cycle not in old_project_config['documents']:
                        old_project_config['documents'][cycle] = doc_data
                    else:
                        # 合并周期内的文档类型
                        if 'doc_types' in doc_data and 'doc_types' in old_project_config['documents'][cycle]:
                            for doc_type in doc_data['doc_types']:
                                if doc_type not in old_project_config['documents'][cycle]['doc_types']:
                                    old_project_config['documents'][cycle]['doc_types'].append(doc_type)
            project_config = old_project_config
            project_config['updated_time'] = datetime.now().isoformat()
        elif existing_project and conflict_action == 'manual':
            # 手动编辑名称模式 - 返回冲突信息让用户确认
            return jsonify({
                'status': 'conflict',
                'message': f'存在同名项目 "{final_name}"，请选择处理方式',
                'existing_name': final_name,
                'original_name': original_name
            }), 200

        # 生成新的项目ID（如果不是merge模式）
        if conflict_action != 'merge':
            new_project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            project_config['id'] = new_project_id
            project_config['name'] = final_name
            project_config['created_time'] = datetime.now().isoformat()
            project_config['updated_time'] = datetime.now().isoformat()

        # 保存项目配置
        doc_manager._save_project(new_project_id, project_config)

        # 复制文档文件并更新元数据
        imported_count = 0
        for doc_meta in documents_metadata:
            old_path = doc_meta.get('file_path')
            if old_path and Path(old_path).exists():
                try:
                    # 计算新的存储路径
                    cycle = doc_meta.get('cycle', 'unknown').replace('/', '_')
                    doc_name = doc_meta.get('doc_name', 'unknown').replace('/', '_')

                    new_cycle_folder = doc_manager.upload_folder / cycle / doc_name
                    new_cycle_folder.mkdir(parents=True, exist_ok=True)

                    # 复制文件
                    new_filename = Path(old_path).name
                    new_file_path = new_cycle_folder / new_filename
                    shutil.copy2(old_path, new_file_path)

                    # 更新元数据
                    doc_meta['file_path'] = str(new_file_path)
                    doc_meta['id'] = f"{cycle}_{doc_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
                    doc_meta['project_id'] = new_project_id

                    # 保存到数据库
                    doc_manager.documents_db[doc_meta['id']] = doc_meta
                    
                    # 如果是merge模式，还需要更新项目配置中的uploaded_docs
                    if conflict_action == 'merge':
                        if 'documents' in project_config:
                            if cycle in project_config['documents']:
                                if 'uploaded_docs' not in project_config['documents'][cycle]:
                                    project_config['documents'][cycle]['uploaded_docs'] = []
                                # 检查是否已存在相同文件
                                exists = False
                                for existing_doc in project_config['documents'][cycle]['uploaded_docs']:
                                    if existing_doc.get('filename') == new_filename and existing_doc.get('doc_name') == doc_name:
                                        exists = True
                                        break
                                if not exists:
                                    project_config['documents'][cycle]['uploaded_docs'].append(doc_meta)
                    
                    imported_count += 1
                except Exception as e:
                    pass

        # 清理临时文件
        shutil.rmtree(extract_dir, ignore_errors=True)
        temp_zip_path.unlink(missing_ok=True)

        return jsonify({
            'status': 'success',
            'message': f'成功导入项目"{final_name}"，包含 {imported_count} 个文档',
            'project_id': new_project_id,
            'project_name': final_name
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/confirm-acceptance', methods=['POST'])
def confirm_cycle_acceptance(project_id):
    """确认周期验收"""
    try:
        from flask import request
        from datetime import datetime
        
        data = request.get_json() or {}
        cycle = data.get('cycle')

        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']

        if cycle:
            # 验收指定周期
            if cycle not in project_config['documents']:
                return jsonify({'status': 'error', 'message': '周期不存在'}), 404

            if 'acceptance' not in project_config['documents'][cycle]:
                project_config['documents'][cycle]['acceptance'] = {}
            project_config['documents'][cycle]['acceptance'] = {
                'accepted': True,
                'accepted_time': datetime.now().isoformat(),
                'accepted_by': data.get('accepted_by', '系统')
            }
            message = f'周期"{cycle}"验收确认完成'
        else:
            # 验收所有周期
            if 'acceptance' not in project_config:
                project_config['acceptance'] = {}
            project_config['acceptance'] = {
                'accepted': True,
                'accepted_time': datetime.now().isoformat(),
                'accepted_by': data.get('accepted_by', '系统')
            }
            # 同步验收每个周期
            for cyc, doc_data in project_config.get('documents', {}).items():
                if 'acceptance' not in doc_data:
                    doc_data['acceptance'] = {}
                doc_data['acceptance'] = {
                    'accepted': True,
                    'accepted_time': datetime.now().isoformat(),
                    'accepted_by': data.get('accepted_by', '系统')
                }
            message = '所有周期验收确认完成'

        doc_manager._save_project(project_id, project_config)
        doc_manager.log_operation('确认验收', message, project=project_id)

        return jsonify({'status': 'success', 'message': message, 'project': project_config})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/download-package', methods=['GET'])
def download_project_package(project_id):
    """打包下载项目所有文档"""
    try:
        import io
        import zipfile
        from pathlib import Path
        from flask import send_file
        from datetime import datetime

        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']
        project_name = project_config.get('name', '项目文档')

        # 创建内存 ZIP
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            added_count = 0

            for cycle, doc_data in project_config.get('documents', {}).items():
                uploaded_docs = doc_data.get('uploaded_docs', [])
                for doc_meta in uploaded_docs:
                    file_path = doc_meta.get('file_path')
                    if file_path and Path(file_path).exists():
                        # 目录结构: 项目名/周期/文档名/文件名
                        archive_path = f"{project_name}/{cycle}/{doc_meta.get('doc_name', '未知')}/{doc_meta.get('filename', Path(file_path).name)}"
                        zipf.write(file_path, archive_path)
                        added_count += 1

            # 如果没有文件，也添加一个说明文件
            if added_count == 0:
                zipf.writestr('说明.txt', f'项目"{project_name}"暂无归档文档。')

        zip_buffer.seek(0)
        zip_filename = f"{project_name}_{datetime.now().strftime('%Y%m%d')}.zip"

        doc_manager.log_operation('打包下载', f'下载项目"{project_name}"（{added_count}个文件）', project=project_id)

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=zip_filename
        )

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/logs', methods=['GET'])
def get_operation_logs():
    """获取操作日志（内部接口）"""
    try:
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

@project_bp.route('/logs/external', methods=['GET'])
def get_external_logs():
    """获取操作日志（外部接口 - 供外部平台调用）"""
    try:
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
