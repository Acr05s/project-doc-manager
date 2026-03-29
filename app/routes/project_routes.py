"""项目管理相关路由"""

import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from app.utils.document_manager import DocumentManager

# 使用 get_doc_manager 方式获取 doc_manager
def get_doc_manager():
    """获取当前模块的 doc_manager（用于独立运行时）"""
    from app.routes.projects.utils import get_doc_manager as _get
    return _get()

project_bp = Blueprint('project', __name__)

# 为兼容旧代码，提供模块级 doc_manager（需要先调用 init_doc_manager）
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
        party_a = data.get('party_a', '')
        party_b = data.get('party_b', '')
        supervisor = data.get('supervisor', '')
        manager = data.get('manager', '')
        duration = data.get('duration', '')
        
        if not name:
            return jsonify({'status': 'error', 'message': '项目名称不能为空'}), 400
        
        result = doc_manager.create_project(name, description, 
                                          party_a=party_a, party_b=party_b,
                                          supervisor=supervisor, manager=manager,
                                          duration=duration)
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
    """更新项目（兼容新旧版）"""
    try:
        data = request.get_json()
        
        # 加载原有项目配置，保留uploaded_docs信息
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') == 'success':
            original_config = project_result.get('project')
            if original_config and 'documents' in original_config:
                # 保留原有文档信息
                for cycle, cycle_info in original_config['documents'].items():
                    if 'uploaded_docs' in cycle_info:
                        if cycle not in data.get('documents', {}):
                            data.setdefault('documents', {})[cycle] = {}
                        data['documents'][cycle]['uploaded_docs'] = cycle_info['uploaded_docs']
        
        # 保存项目配置
        result = doc_manager.save_project(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/load', methods=['POST'])
def load_project_config():
    """加载项目配置（Excel/JSON文件解析）并保存为独立的requirements文件"""
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未获取到文件'}), 400

        # 保存临时文件
        from pathlib import Path
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
        import logging
        logger = logging.getLogger(__name__)
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
        return jsonify({'status': 'error', 'message': str(e)}), 500


@project_bp.route('/<project_id>/apply-requirements', methods=['POST'])
def apply_requirements_to_project_route(project_id):
    """将文档需求配置应用到项目"""
    try:
        import logging
        logger = logging.getLogger(__name__)
        data = request.get_json()
        requirements_id = data.get('requirements_id')
        
        logger.info(f"[DEBUG] /apply-requirements 被调用: project_id={project_id}, requirements_id={requirements_id}")

        if not requirements_id:
            return jsonify({'status': 'error', 'message': '未指定需求配置ID'}), 400

        result = doc_manager.apply_requirements_to_project(project_id, requirements_id)
        
        logger.info(f"[DEBUG] apply_requirements_to_project 返回: {result}")
        return jsonify(result)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"[DEBUG] /apply-requirements 异常: {e}")
        import traceback
        logger.error(f"[DEBUG] 错误堆栈: {traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@project_bp.route('/requirements/list', methods=['GET'])
def list_requirements_configs():
    """获取所有文档需求配置列表"""
    try:
        result = doc_manager.list_requirements_configs()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """删除项目（软删除）"""
    try:
        permanent = request.args.get('permanent', 'false').lower() == 'true'
        result = doc_manager.delete_project(project_id, permanent)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/deleted/list', methods=['GET'])
def list_deleted_projects():
    """获取已删除项目列表"""
    try:
        result = doc_manager.get_deleted_projects()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/restore', methods=['POST'])
def restore_project(project_id):
    """恢复已删除的项目"""
    try:
        result = doc_manager.restore_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/permanent-delete', methods=['DELETE'])
def permanent_delete_project(project_id):
    """永久删除项目"""
    try:
        result = doc_manager.delete_project(project_id, permanent=True)
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

@project_bp.route('/export-requirements', methods=['GET'])
def export_requirements():
    """导出需求清单JSON"""
    try:
        project_id = request.args.get('project_id')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 获取项目配置
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project_result['project']
        project_name = project_config.get('name', project_id)
        
        # 直接读取 config 下的 requirements.json 文件
        from pathlib import Path
        requirements_path = doc_manager.config.get_project_config_folder(project_name) / 'requirements.json'
        
        if not requirements_path.exists():
            return jsonify({'status': 'error', 'message': 'requirements.json 文件不存在'}), 404
        
        # 读取文件内容
        with open(requirements_path, 'r', encoding='utf-8') as f:
            json_content = f.read()
        
        from flask import Response
        return Response(
            json_content,
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename=requirements_{project_id}.json'}
        )
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


@project_bp.route('/<project_id>/package-full', methods=['POST'])
def package_full_project(project_id):
    """完整打包项目目录（先保存再打包）"""
    try:
        import shutil
        import tempfile
        from flask import make_response
        
        # 获取 doc_manager
        doc_manager = get_doc_manager()
        
        # 1. 先获取项目配置并保存，确保数据已持久化
        project = doc_manager.load_project(project_id)
        if not project or project.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project_config = project.get('project', {})
        project_name = project_config.get('name', 'project')
        
        # 保存项目数据
        save_result = doc_manager.save_project(project_config)
        if save_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '保存项目数据失败: ' + save_result.get('message', '')}), 500
        
        # 2. 查找项目目录
        project_dir = None
        projects_base = doc_manager.config.projects_base_folder
        
        # 尝试多种方式查找项目目录
        possible_paths = [
            projects_base / project_id,
            projects_base / project_name,
            projects_base / f"{project_name}_{project_id}",
        ]
        
        for path in possible_paths:
            if path.exists() and path.is_dir():
                project_dir = path
                break
        
        # 如果没找到，使用项目ID作为目录名
        if not project_dir:
            project_dir = projects_base / project_id
            if not project_dir.exists():
                return jsonify({'status': 'error', 'message': '项目目录不存在'}), 404
        
        # 3. 创建临时ZIP文件
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        temp_zip.close()
        
        # 4. 打包整个项目目录
        shutil.make_archive(
            temp_zip.name.replace('.zip', ''),
            'zip',
            root_dir=project_dir.parent,
            base_dir=project_dir.name
        )
        
        # 5. 读取ZIP文件并返回
        with open(temp_zip.name, 'rb') as f:
            zip_data = f.read()
        
        # 清理临时文件
        import os
        os.unlink(temp_zip.name)
        
        # 记录操作日志
        doc_manager.log_operation('打包项目', f'完整打包项目"{project_name}"', project=project_id)
        
        # 返回ZIP文件
        response = make_response(zip_data)
        response.headers['Content-Type'] = 'application/zip'
        safe_name = ''.join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_name}_full_backup.zip"'
        
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

        # 复制文档文件并更新元数据（先处理文件，再保存配置）
        imported_count = 0
        # 加载现有的文档索引（用于merge模式去重）
        if conflict_action == 'merge':
            try:
                existing_doc_index = doc_manager.data_manager.load_documents_index(final_name)
                existing_docs = existing_doc_index.get('documents', {})
            except:
                existing_docs = {}
        else:
            existing_docs = {}
        
        # 用于跟踪已导入的文件（避免重复）
        imported_files = {}  # key: original_filename, value: doc_meta
        
        for doc_meta in documents_metadata:
            old_path = doc_meta.get('file_path')
            if old_path and Path(old_path).exists():
                try:
                    # 计算新的存储路径
                    cycle = doc_meta.get('cycle', 'unknown').replace('/', '_')
                    doc_name = doc_meta.get('doc_name', 'unknown').replace('/', '_')
                    original_filename = doc_meta.get('original_filename', Path(old_path).name)

                    # 检查是否已存在相同文件（基于 original_filename 去重）
                    file_key = original_filename.strip().lower()
                    if file_key in imported_files:
                        continue  # 跳过重复文件
                    
                    # 检查现有文档索引中是否已存在
                    if conflict_action == 'merge':
                        exists_in_index = False
                        for existing_doc_id, existing_doc in existing_docs.items():
                            existing_name = existing_doc.get('original_filename', '').strip().lower()
                            if existing_name == file_key:
                                exists_in_index = True
                                break
                        if exists_in_index:
                            continue  # 跳过已存在的文件

                    new_cycle_folder = doc_manager.upload_folder / final_name / 'uploads' / cycle / doc_name
                    new_cycle_folder.mkdir(parents=True, exist_ok=True)

                    # 复制文件
                    new_filename = Path(old_path).name
                    new_file_path = new_cycle_folder / new_filename
                    shutil.copy2(old_path, new_file_path)

                    # 更新元数据
                    doc_meta['file_path'] = str(new_file_path)
                    doc_meta['doc_id'] = f"{cycle}_{doc_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
                    doc_meta['project_id'] = new_project_id
                    doc_meta['project_name'] = final_name

                    # 保存到数据库
                    doc_manager.documents_db[doc_meta['doc_id']] = doc_meta
                    
                    # 直接添加到 documents_index.json
                    doc_manager.data_manager.add_document_to_index(final_name, doc_meta['doc_id'], doc_meta)
                    
                    # 记录已导入的文件
                    imported_files[file_key] = doc_meta
                    
                    # 更新项目配置中的 uploaded_docs（用于内存中的展示）
                    if 'documents' not in project_config:
                        project_config['documents'] = {}
                    if cycle not in project_config['documents']:
                        project_config['documents'][cycle] = {}
                    if 'uploaded_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['uploaded_docs'] = []
                    project_config['documents'][cycle]['uploaded_docs'].append(doc_meta)
                    
                    imported_count += 1
                except Exception as e:
                    import traceback
                    print(f"导入文档失败: {e}")
                    print(traceback.format_exc())
        
        # 保存项目配置（不再包含 uploaded_docs 到 requirements.json）
        doc_manager._save_project(new_project_id, project_config)

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


@project_bp.route('/package/import-full', methods=['POST'])
def import_full_package():
    """从完整项目目录ZIP导入项目"""
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

        # 解压ZIP到临时目录
        extract_dir = doc_manager.upload_folder / 'temp' / f'import_full_{uuid.uuid4()}'
        extract_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(temp_zip_path, 'r') as zip_file:
            zip_file.extractall(extract_dir)

        # 查找解压后的项目目录（应该是解压目录下的一个子目录）
        project_dirs = [d for d in extract_dir.iterdir() if d.is_dir()]
        if not project_dirs:
            # 可能是直接打包的项目目录内容，使用解压目录本身
            project_dir = extract_dir
        else:
            project_dir = project_dirs[0]

        # 查找项目配置文件
        config_path = project_dir / 'project_config.json'
        if not config_path.exists():
            # 尝试在其他位置查找
            config_files = list(project_dir.rglob('project_config.json'))
            if config_files:
                config_path = config_files[0]
                project_dir = config_path.parent
            else:
                shutil.rmtree(extract_dir, ignore_errors=True)
                temp_zip_path.unlink(missing_ok=True)
                return jsonify({'status': 'error', 'message': 'ZIP包中未找到项目配置文件'}), 400

        # 读取项目配置
        with open(config_path, 'r', encoding='utf-8') as f:
            project_config = json.load(f)

        # 获取冲突处理选项
        conflict_action = request.form.get('conflict_action', 'rename')
        custom_name = request.form.get('name', '').strip()

        # 确定项目名称
        original_name = project_config.get('name', '未命名项目')
        final_name = custom_name or original_name

        # 检查是否有同名项目
        existing_projects = doc_manager.get_projects_list()
        existing_project = None
        for proj in existing_projects:
            if proj.get('name') == final_name:
                existing_project = proj
                break

        # 处理冲突
        if existing_project and conflict_action == 'rename':
            final_name = f"{original_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        elif existing_project and conflict_action == 'overwrite':
            # 删除旧项目
            doc_manager.delete_project(existing_project.get('id'))
        elif existing_project and conflict_action == 'manual':
            return jsonify({
                'status': 'conflict',
                'message': f'存在同名项目 "{final_name}"',
                'existing_name': final_name,
                'original_name': original_name
            }), 200

        # 生成新的项目ID
        new_project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # 更新项目配置
        project_config['id'] = new_project_id
        project_config['name'] = final_name
        project_config['created_time'] = datetime.now().isoformat()
        project_config['updated_time'] = datetime.now().isoformat()

        # 创建项目目录
        projects_base = doc_manager.config.projects_base_folder
        new_project_dir = projects_base / new_project_id
        new_project_dir.mkdir(parents=True, exist_ok=True)

        # 复制所有文件到新项目目录
        for item in project_dir.iterdir():
            if item.is_file():
                shutil.copy2(item, new_project_dir)
            elif item.is_dir():
                shutil.copytree(item, new_project_dir / item.name, dirs_exist_ok=True)

        # 保存项目配置
        doc_manager._save_project(new_project_id, project_config)

        # 更新文档数据库中的文件路径
        if 'documents' in project_config:
            for cycle, cycle_info in project_config['documents'].items():
                if 'uploaded_docs' in cycle_info:
                    for doc in cycle_info['uploaded_docs']:
                        if 'file_path' in doc:
                            old_path = Path(doc['file_path'])
                            # 更新路径指向新的项目目录
                            new_path = new_project_dir / 'documents' / cycle / doc.get('doc_name', '') / old_path.name
                            if new_path.exists():
                                doc['file_path'] = str(new_path)

        # 重新保存更新后的配置
        doc_manager._save_project(new_project_id, project_config)

        # 清理临时文件
        shutil.rmtree(extract_dir, ignore_errors=True)
        temp_zip_path.unlink(missing_ok=True)

        # 记录操作日志
        doc_manager.log_operation('导入项目', f'导入完整项目"{final_name}"', project=new_project_id)

        return jsonify({
            'status': 'success',
            'message': f'项目"{final_name}"导入成功',
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


@project_bp.route('/<project_id>/verify-acceptance', methods=['GET'])
def verify_acceptance(project_id):
    """验证项目是否满足验收条件"""
    try:
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']
        
        # 验证结果
        verification = {
            'can_accept': True,
            'issues': [],
            'warnings': [],
            'statistics': {
                'total_cycles': 0,
                'completed_cycles': 0,
                'total_docs': 0,
                'uploaded_docs': 0,
                'archived_docs': 0
            }
        }
        
        # 检查所有周期
        for cycle, doc_data in project_config.get('documents', {}).items():
            verification['statistics']['total_cycles'] += 1
            
            # 检查周期是否有文档需求
            required_docs = doc_data.get('required_docs', [])
            uploaded_docs = doc_data.get('uploaded_docs', [])
            archived = doc_data.get('archived', {})
            
            # 检查必需文档是否都有文件
            for req_doc in required_docs:
                doc_name = req_doc.get('name') if isinstance(req_doc, dict) else req_doc
                requirement = req_doc.get('requirement', '') if isinstance(req_doc, dict) else ''
                
                verification['statistics']['total_docs'] += 1
                
                # 查找该文档类型的上传文件
                type_files = [d for d in uploaded_docs if d.get('doc_name') == doc_name]
                
                if type_files:
                    verification['statistics']['uploaded_docs'] += 1
                    
                    # 检查是否已归档
                    if archived.get(doc_name):
                        verification['statistics']['archived_docs'] += 1
                    else:
                        verification['warnings'].append({
                            'type': 'not_archived',
                            'cycle': cycle,
                            'doc_name': doc_name,
                            'message': f'周期"{cycle}"的"{doc_name}"未归档'
                        })
                    
                    # 检查附加要求是否满足
                    for doc_file in type_files:
                        missing = []
                        
                        if requirement:
                            # 检查签字
                            if '甲方签字' in requirement and not doc_file.get('party_a_signer') and not doc_file.get('no_signature'):
                                missing.append('甲方签字')
                            if '乙方签字' in requirement and not doc_file.get('party_b_signer') and not doc_file.get('no_signature'):
                                missing.append('乙方签字')
                            if '签字' in requirement and not doc_file.get('signer') and not doc_file.get('no_signature') and '甲方签字' not in requirement and '乙方签字' not in requirement:
                                missing.append('签字')
                            
                            # 检查盖章
                            if '甲方盖章' in requirement and not doc_file.get('party_a_seal') and not doc_file.get('no_seal'):
                                missing.append('甲方盖章')
                            if '乙方盖章' in requirement and not doc_file.get('party_b_seal') and not doc_file.get('no_seal'):
                                missing.append('乙方盖章')
                            if '盖章' in requirement and not doc_file.get('has_seal_marked') and not doc_file.get('has_seal') and not doc_file.get('party_a_seal') and not doc_file.get('party_b_seal') and not doc_file.get('no_seal'):
                                missing.append('盖章')
                            
                            # 检查日期
                            if '文档日期' in requirement and not doc_file.get('doc_date'):
                                missing.append('文档日期')
                            if '签字日期' in requirement and not doc_file.get('sign_date'):
                                missing.append('签字日期')
                        
                        if missing:
                            verification['issues'].append({
                                'type': 'missing_requirement',
                                'cycle': cycle,
                                'doc_name': doc_name,
                                'filename': doc_file.get('filename'),
                                'missing': missing,
                                'message': f'周期"{cycle}"的"{doc_name}"缺少：{"、".join(missing)}'
                            })
                            verification['can_accept'] = False
                else:
                    # 必需文档没有上传文件
                    verification['issues'].append({
                        'type': 'missing_file',
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'message': f'周期"{cycle}"的"{doc_name}"缺少文件'
                    })
                    verification['can_accept'] = False
            
            # 检查周期是否完成（所有必需文档都有文件且已归档）
            cycle_completed = True
            for req_doc in required_docs:
                doc_name = req_doc.get('name') if isinstance(req_doc, dict) else req_doc
                type_files = [d for d in uploaded_docs if d.get('doc_name') == doc_name]
                if not type_files or not archived.get(doc_name):
                    cycle_completed = False
                    break
            
            if cycle_completed:
                verification['statistics']['completed_cycles'] += 1
        
        # 如果没有周期，也提示问题
        if verification['statistics']['total_cycles'] == 0:
            verification['issues'].append({
                'type': 'no_cycles',
                'message': '项目没有配置任何周期'
            })
            verification['can_accept'] = False
        
        return jsonify({
            'status': 'success',
            'verification': verification
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@project_bp.route('/<project_id>/verify-files', methods=['GET'])
def verify_project_files(project_id):
    """验证项目所有文件是否存在且可以被打包"""
    try:
        from pathlib import Path
        
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify(project_result), 404

        project_config = project_result['project']
        project_name = project_config.get('name', project_id)
        
        # 检查结果
        result = {
            'total_files': 0,
            'valid_files': 0,
            'missing_files': [],
            'path_errors': [],
            'can_package': True
        }
        
        # 遍历所有周期检查文件
        for cycle, doc_data in project_config.get('documents', {}).items():
            uploaded_docs = doc_data.get('uploaded_docs', [])
            
            for doc_meta in uploaded_docs:
                if not isinstance(doc_meta, dict):
                    continue
                
                result['total_files'] += 1
                
                file_path = doc_meta.get('file_path', '')
                doc_name = doc_meta.get('doc_name', '未知')
                filename = doc_meta.get('filename', '未知')
                
                # 检查文件路径是否为空
                if not file_path:
                    result['path_errors'].append({
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'filename': filename,
                        'error': '文件路径为空',
                        'doc_id': doc_meta.get('doc_id', '')
                    })
                    result['can_package'] = False
                    continue
                
                # 解析文件路径
                file_path_obj = Path(file_path)
                
                # 处理相对路径
                if not file_path_obj.is_absolute():
                    if file_path.startswith('projects/'):
                        # 完整相对路径
                        base_dir = doc_manager.config.projects_base_folder.parent
                        file_path_obj = base_dir / file_path
                    else:
                        # 旧格式或 uploads 格式
                        project_uploads_dir = doc_manager.config.projects_base_folder / project_name / 'uploads'
                        file_path_obj = project_uploads_dir / file_path
                
                # 检查文件是否存在
                if not file_path_obj.exists():
                    result['missing_files'].append({
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'filename': filename,
                        'file_path': str(file_path),
                        'resolved_path': str(file_path_obj),
                        'doc_id': doc_meta.get('doc_id', '')
                    })
                    result['can_package'] = False
                else:
                    result['valid_files'] += 1
        
        return jsonify({
            'status': 'success',
            'result': result
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def generate_sequential_filename(original_name, seq_num):
    """
    生成顺序编号的文件名
    规则：去掉源文件名第一个中文字符前的所有字符，加上序号
    例："DT-DJ-2023-03-002-V1.0 中国大唐集团..." -> "001_中国大唐集团..."
    """
    import re
    from pathlib import Path
    
    # 查找第一个中文字符位置
    match = re.search(r'[\u4e00-\u9fff]', original_name)
    if match:
        chinese_start = match.start()
        name_without_prefix = original_name[chinese_start:]
    else:
        # 如果没有中文字符，使用原文件名（去掉扩展名）
        name_without_prefix = Path(original_name).stem
    
    # 清理文件名中的非法字符
    name_without_prefix = re.sub(r'[<>:"/\\|?*]', '_', name_without_prefix)
    
    # 保留原扩展名
    ext = Path(original_name).suffix
    
    return f"{seq_num:03d}_{name_without_prefix}{ext}"


def convert_to_pdf(file_path, output_path):
    """
    将文件转换为PDF格式
    支持：Word(doc/docx)、Excel(xls/xlsx)、PowerPoint(ppt/pptx)、图片等
    """
    try:
        from pathlib import Path
        import subprocess
        import os
        
        file_path = Path(file_path)
        output_path = Path(output_path)
        ext = file_path.suffix.lower()
        
        # 如果已经是PDF，直接复制
        if ext == '.pdf':
            import shutil
            shutil.copy2(file_path, output_path)
            return True
        
        # 尝试使用LibreOffice转换
        try:
            cmd = [
                'soffice',
                '--headless',
                '--convert-to', 'pdf',
                '--outdir', str(output_path.parent),
                str(file_path)
            ]
            subprocess.run(cmd, check=True, timeout=60)
            
            # LibreOffice生成的文件名可能与预期不同
            generated_pdf = output_path.parent / (file_path.stem + '.pdf')
            if generated_pdf.exists():
                if generated_pdf != output_path:
                    generated_pdf.rename(output_path)
                return True
        except (subprocess.SubprocessError, FileNotFoundError):
            pass
        
        # 如果是图片，使用PIL转换
        if ext in ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.gif']:
            try:
                from PIL import Image
                img = Image.open(file_path)
                if img.mode in ('RGBA', 'LA', 'P'):
                    img = img.convert('RGB')
                img.save(output_path, 'PDF', resolution=100.0)
                return True
            except Exception:
                pass
        
        # 转换失败，返回False
        return False
        
    except Exception as e:
        print(f"PDF转换失败: {e}")
        return False


@project_bp.route('/<project_id>/download-package', methods=['GET'])
def download_project_package(project_id):
    """打包下载项目所有文档（支持序号重生成和PDF转换）"""
    try:
        import io
        import zipfile
        from pathlib import Path
        from flask import send_file, request
        from datetime import datetime
        import tempfile
        import shutil

        # 获取查询参数
        renumber = request.args.get('renumber', 'false').lower() == 'true'
        convert_pdf = request.args.get('convert_pdf', 'false').lower() == 'true'

        # 加载项目
        project_result = doc_manager.load_project(project_id)
        if project_result['status'] != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404

        project_config = project_result.get('project', {})
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目配置为空'}), 404
            
        project_name = project_config.get('name', '项目文档')

        # 创建临时目录用于处理文件
        temp_dir = Path(tempfile.mkdtemp())
        
        try:
            # 收集所有文件
            files_to_package = []
            global_file_counter = 1
            
            documents = project_config.get('documents', {})
            if not documents:
                # 如果没有文档数据，返回空包
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    zipf.writestr('说明.txt', f'项目"{project_name}"暂无文档数据。')
                zip_buffer.seek(0)
                zip_filename = f"{project_name}_文档包_{datetime.now().strftime('%Y%m%d')}.zip"
                return send_file(
                    zip_buffer,
                    mimetype='application/zip',
                    as_attachment=True,
                    download_name=zip_filename
                )
            
            # 按周期顺序处理
            cycle_counter = 1
            for cycle, doc_data in documents.items():
                if not isinstance(doc_data, dict):
                    continue
                uploaded_docs = doc_data.get('uploaded_docs', [])
                if not uploaded_docs:
                    continue
                
                # 按文档类型和目录分组
                docs_by_type = {}
                for doc_meta in uploaded_docs:
                    if not isinstance(doc_meta, dict):
                        continue
                    file_path = doc_meta.get('file_path')
                    if not file_path:
                        continue
                    file_path_obj = Path(file_path)
                    if not file_path_obj.exists():
                        continue
                    
                    doc_name = doc_meta.get('doc_name', '未知')
                    directory = doc_meta.get('directory', '')
                    
                    if doc_name not in docs_by_type:
                        docs_by_type[doc_name] = {}
                    if directory not in docs_by_type[doc_name]:
                        docs_by_type[doc_name][directory] = []
                    
                    docs_by_type[doc_name][directory].append(doc_meta)
                
                # 处理每个文档类型
                doc_type_counter = 1
                for doc_name, dirs in docs_by_type.items():
                    # 先处理根目录文件（无子目录）
                    if '' in dirs or '/' in dirs:
                        root_docs = dirs.get('') or dirs.get('/') or []
                        for i, doc_meta in enumerate(root_docs, 1):
                            file_path = doc_meta.get('file_path')
                            file_path_obj = Path(file_path)
                            original_filename = doc_meta.get('filename') or file_path_obj.name
                            
                            # 生成层级序号
                            level_seq = f"{cycle_counter}.{doc_type_counter}"
                            
                            # 生成新文件名
                            if renumber:
                                # 为每个文件生成唯一序号
                                file_seq = global_file_counter
                                new_filename = f"{level_seq}.{i}_{original_filename}"
                            else:
                                new_filename = original_filename
                            
                            # 如果需要PDF转换且不是PDF文件
                            final_filename = new_filename
                            if convert_pdf and not new_filename.lower().endswith('.pdf'):
                                pdf_filename = Path(new_filename).stem + '.pdf'
                                final_filename = pdf_filename
                            
                            files_to_package.append({
                                'source_path': str(file_path_obj),
                                'original_name': original_filename,
                                'new_name': new_filename,
                                'final_name': final_filename,
                                'cycle': cycle,
                                'doc_name': doc_name,
                                'directory': '',
                                'needs_conversion': convert_pdf and not original_filename.lower().endswith('.pdf'),
                                'seq_num': f"{cycle_counter}.{doc_type_counter}",
                                'global_seq': global_file_counter
                            })
                            global_file_counter += 1
                    
                    # 处理子目录
                    subdir_counter = 1
                    for directory, docs in dirs.items():
                        if directory == '' or directory == '/':
                            continue
                        
                        # 子目录序号
                        for i, doc_meta in enumerate(docs, 1):
                            file_path = doc_meta.get('file_path')
                            file_path_obj = Path(file_path)
                            original_filename = doc_meta.get('filename') or file_path_obj.name
                            
                            # 生成层级序号
                            level_seq = f"{cycle_counter}.{doc_type_counter}.{subdir_counter}"
                            
                            # 生成新文件名
                            if renumber:
                                # 为每个文件生成唯一序号
                                file_seq = global_file_counter
                                new_filename = f"{level_seq}.{i}_{original_filename}"
                            else:
                                new_filename = original_filename
                            
                            # 如果需要PDF转换且不是PDF文件
                            final_filename = new_filename
                            if convert_pdf and not new_filename.lower().endswith('.pdf'):
                                pdf_filename = Path(new_filename).stem + '.pdf'
                                final_filename = pdf_filename
                            
                            files_to_package.append({
                                'source_path': str(file_path_obj),
                                'original_name': original_filename,
                                'new_name': new_filename,
                                'final_name': final_filename,
                                'cycle': cycle,
                                'doc_name': doc_name,
                                'directory': directory,
                                'needs_conversion': convert_pdf and not original_filename.lower().endswith('.pdf'),
                                'seq_num': f"{cycle_counter}.{doc_type_counter}.{subdir_counter}.{i}",
                                'global_seq': global_file_counter
                            })
                            global_file_counter += 1
                        
                        subdir_counter += 1
                    
                    doc_type_counter += 1
                
                cycle_counter += 1
            
            # 创建 ZIP
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                added_count = 0
                
                for file_info in files_to_package:
                    try:
                        source_path = Path(file_info['source_path'])
                        final_name = file_info['final_name']
                        
                        # 构建归档路径：/<项目名>/<周期>/<文档类型>[目录]/<文件>
                        directory = file_info.get('directory', '')
                        if directory and directory != '/':
                            # 有子目录，添加目录层级
                            archive_path = f"{project_name}/{file_info['cycle']}/{file_info['doc_name']}/{directory}/{final_name}"
                        else:
                            # 无子目录
                            archive_path = f"{project_name}/{file_info['cycle']}/{file_info['doc_name']}/{final_name}"
                        
                        # 如果需要PDF转换
                        if file_info['needs_conversion']:
                            temp_pdf_path = temp_dir / final_name
                            if convert_to_pdf(source_path, temp_pdf_path):
                                zipf.write(temp_pdf_path, archive_path)
                            else:
                                # 转换失败，使用原文件
                                zipf.write(source_path, archive_path.replace('.pdf', source_path.suffix))
                        else:
                            # 直接添加文件
                            zipf.write(source_path, archive_path)
                        
                        added_count += 1
                    except Exception as e:
                        print(f"添加文件失败 {file_info['original_name']}: {e}")
                        continue
                
                # 如果没有文件，添加说明
                if added_count == 0:
                    zipf.writestr('说明.txt', f'项目"{project_name}"暂无归档文档。')
                
                # 添加文件清单
                manifest = []
                for f in files_to_package:
                    manifest.append(f"{f['seq_num']}. {f['original_name']} -> {f['final_name']}")
                if manifest:
                    zipf.writestr('文件清单.txt', '\n'.join(manifest))

            zip_buffer.seek(0)
            
            # 构建文件名
            suffix_parts = []
            if renumber:
                suffix_parts.append('序号重编')
            if convert_pdf:
                suffix_parts.append('PDF版')
            suffix = '_'.join(suffix_parts) if suffix_parts else '文档包'
            zip_filename = f"{project_name}_{suffix}_{datetime.now().strftime('%Y%m%d')}.zip"

            doc_manager.log_operation(
                '打包下载', 
                f'下载项目"{project_name}"（{added_count}个文件，重编号={renumber}，PDF转换={convert_pdf}）', 
                project=project_id
            )

            return send_file(
                zip_buffer,
                mimetype='application/zip',
                as_attachment=True,
                download_name=zip_filename
            )
            
        finally:
            # 清理临时目录
            shutil.rmtree(temp_dir, ignore_errors=True)

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


# ========== 配置版本管理API ==========

@project_bp.route('/<project_id>/versions', methods=['GET'])
def list_config_versions(project_id):
    """获取配置版本列表"""
    try:
        result = doc_manager.list_versions(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/versions', methods=['POST'])
def save_config_version(project_id):
    """保存当前配置为新版本"""
    try:
        data = request.get_json()
        version_name = data.get('version_name', '')
        description = data.get('description', '')
        
        if not version_name:
            return jsonify({'status': 'error', 'message': '版本名称不能为空'}), 400
        
        result = doc_manager.save_version(project_id, version_name, description)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/versions/<version_filename>', methods=['GET'])
def load_config_version(project_id, version_filename):
    """加载指定版本配置（预览，不切换）"""
    try:
        result = doc_manager.load_version(project_id, version_filename)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/versions/<version_filename>/switch', methods=['POST'])
def switch_config_version(project_id, version_filename):
    """切换到指定版本"""
    try:
        result = doc_manager.switch_version(project_id, version_filename)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/versions/<version_filename>', methods=['DELETE'])
def delete_config_version(project_id, version_filename):
    """删除指定版本"""
    try:
        result = doc_manager.delete_version(project_id, version_filename)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/versions/<version_filename>/export', methods=['GET'])
def export_config_version(project_id, version_filename):
    """导出指定版本配置"""
    try:
        result = doc_manager.export_version(project_id, version_filename)
        if result['status'] != 'success':
            return jsonify(result), 400
        
        from flask import Response
        return Response(
            result['json_content'],
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename="{result["filename"]}"'}
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ========== 需求模板管理API ==========

@project_bp.route('/templates', methods=['GET'])
def list_templates():
    """获取模板列表"""
    try:
        result = doc_manager.list_templates()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/templates', methods=['POST'])
def save_template():
    """保存需求模板"""
    try:
        data = request.get_json()
        template_name = data.get('template_name', '')
        template_data = data.get('template_data', {})
        description = data.get('description', '')
        
        if not template_name:
            return jsonify({'status': 'error', 'message': '模板名称不能为空'}), 400
        
        if not template_data:
            return jsonify({'status': 'error', 'message': '模板数据不能为空'}), 400
        
        result = doc_manager.save_template(template_name, template_data, description)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/templates/<template_id>', methods=['GET'])
def load_template(template_id):
    """加载指定模板"""
    try:
        result = doc_manager.load_template(template_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/templates/<template_id>', methods=['DELETE'])
def delete_template(template_id):
    """删除指定模板"""
    try:
        result = doc_manager.delete_template(template_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@project_bp.route('/<project_id>/apply-template/<template_id>', methods=['POST'])
def apply_template_to_project(project_id, template_id):
    """将模板应用到项目"""
    try:
        # 加载模板
        template_result = doc_manager.load_template(template_id)
        if template_result['status'] != 'success':
            return jsonify(template_result), 400
        
        template = template_result['template']
        
        # 加载项目配置
        config = doc_manager.load(project_id)
        if not config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        # 应用模板数据
        config['cycles'] = template.get('cycles', [])
        config['documents'] = template.get('documents', {})
        config['updated_time'] = datetime.now().isoformat()
        
        # 保存配置
        doc_manager.save(project_id, config)
        
        return jsonify({
            'status': 'success',
            'message': '模板应用成功',
            'config': config
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ========== 新版文档清单模式API ==========

@project_bp.route('/new/create', methods=['POST'])
def create_new_project():
    """创建新项目（新版文档清单模式）"""
    try:
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


@project_bp.route('/new/<project_name>/load', methods=['GET'])
def load_new_project(project_name):
    """加载项目（新版文档清单模式）"""
    try:
        result = doc_manager.load_document_list(project_name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@project_bp.route('/new/<project_name>/archive', methods=['POST'])
def archive_new_document(project_name):
    """归档文档（新版文档清单模式）"""
    try:
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


@project_bp.route('/new/<project_name>/export', methods=['GET'])
def export_new_project_package(project_name):
    """导出归档文档包（新版文档清单模式）"""
    try:
        from flask import send_file, make_response
        import io
        
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


@project_bp.route('/new/list', methods=['GET'])
def list_new_projects():
    """获取所有项目列表（新版文档清单模式）"""
    try:
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


@project_bp.route('/new/<project_name>', methods=['DELETE'])
def delete_new_project(project_name):
    """删除项目（新版文档清单模式）"""
    try:
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


# ========== 自动保存草稿 API ==========

@project_bp.route('/<project_id>/draft', methods=['POST'])
def save_draft(project_id):
    """自动保存编辑器草稿"""
    try:
        data = request.get_json()
        draft_key = f'tree_draft_{project_id}'
        
        # 保存草稿到项目目录下的 .draft.json
        config = doc_manager.load_project(project_id)
        if config.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project = config['project']
        project_folder = doc_manager.projects_base_folder / project_id
        draft_path = project_folder / '.draft.json'
        
        draft_data = {
            'tree_data': data.get('tree_data'),
            'saved_time': datetime.now().isoformat(),
            'version': 1
        }
        
        with open(draft_path, 'w', encoding='utf-8') as f:
            json.dump(draft_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': '草稿已保存',
            'saved_time': draft_data['saved_time']
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@project_bp.route('/<project_id>/draft', methods=['GET'])
def load_draft(project_id):
    """加载编辑器草稿"""
    try:
        config = doc_manager.load_project(project_id)
        if config.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project = config['project']
        project_folder = doc_manager.projects_base_folder / project_id
        draft_path = project_folder / '.draft.json'
        
        if not draft_path.exists():
            return jsonify({'status': 'success', 'draft': None})
        
        with open(draft_path, 'r', encoding='utf-8') as f:
            draft_data = json.load(f)
        
        return jsonify({
            'status': 'success',
            'draft': draft_data
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@project_bp.route('/<project_id>/draft', methods=['DELETE'])
def clear_draft(project_id):
    """删除编辑器草稿"""
    try:
        config = doc_manager.load_project(project_id)
        if config.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404
        
        project = config['project']
        project_folder = doc_manager.projects_base_folder / project_id
        draft_path = project_folder / '.draft.json'
        
        if draft_path.exists():
            draft_path.unlink()
        
        return jsonify({'status': 'success', 'message': '草稿已删除'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@project_bp.route('/<project_id>/download/<task_id>', methods=['GET'])
def download_package(project_id, task_id):
    """下载打包完成的ZIP文件"""
    import json
    from pathlib import Path
    import os
    
    try:
        from flask import send_file, jsonify
        
        # 使用绝对路径
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        tasks_file = Path(base_dir) / 'uploads' / 'tasks' / 'package_tasks.json'
        
        print(f'[下载] 任务文件路径: {tasks_file}', flush=True)
        print(f'[下载] 任务文件存在: {tasks_file.exists()}', flush=True)
        
        task = None
        if tasks_file.exists():
            with open(tasks_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                task = data.get(task_id)
                print(f'[下载] 找到任务: {task is not None}', flush=True)
        
        if not task:
            return jsonify({'status': 'error', 'message': '任务不存在或已过期'}), 404
        
        if task.get('status') != 'completed':
            return jsonify({'status': 'error', 'message': '任务尚未完成'}), 400
        
        if task.get('type') != 'package':
            return jsonify({'status': 'error', 'message': '任务类型不是打包'}), 400
        
        result = task.get('result', {})
        package_path = result.get('package_path')
        
        print(f'[下载] 包文件路径: {package_path}', flush=True)
        print(f'[下载] 包文件存在: {Path(package_path).exists() if package_path else False}', flush=True)
        
        if not package_path:
            return jsonify({'status': 'error', 'message': '打包路径为空'}), 404
        
        if not Path(package_path).exists():
            return jsonify({'status': 'error', 'message': f'打包文件不存在: {package_path}'}), 404
        
        # 返回文件
        filename = result.get('package_filename', 'project_package.zip')
        print(f'[下载] 开始返回文件: {filename}', flush=True)
        return send_file(
            package_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/zip'
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f'下载失败: {str(e)}'}), 500
