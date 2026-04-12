"""项目导出导入相关路由"""

import io
import zipfile
import json
import uuid
import shutil
import logging
import os
from datetime import datetime
from pathlib import Path
from flask import request, jsonify, make_response, current_app
from .utils import get_doc_manager

logger = logging.getLogger(__name__)

# 导入公共的日志函数
from app.utils.base import log_package


def export_project(project_id):
    """导出项目为JSON"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.export_project_json(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_project():
    """从JSON导入项目"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        name = data.get('name')  # 可选的新项目名称
        
        if not data:
            return jsonify({'status': 'error', 'message': '未提供项目数据'}), 400
        
        result = doc_manager.import_project_json(data, name)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_project_file():
    """从文件导入项目（JSON文件）"""
    try:
        doc_manager = get_doc_manager()
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


def package_project(project_id):
    """打包项目（项目配置+文档文件）为ZIP下载"""
    try:
        doc_manager = get_doc_manager()
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
            config_json = json.dumps(project_config, ensure_ascii=False, indent=2)
            zip_file.writestr('project_config.json', config_json)
            
            # 2. 添加文档元数据（使用工具函数获取文档列表）
            from app.utils.document_list import DocumentListManager
            all_docs = DocumentListManager.get_documents_list(doc_manager, project_id=project_id)
            
            docs_json = json.dumps(all_docs, ensure_ascii=False, indent=2)
            zip_file.writestr('documents_metadata.json', docs_json)
            
            # 3. 复制文档文件
            copied_count = 0
            debug_dirs = set()
            for doc in all_docs:
                file_path = doc.get('file_path')
                if file_path and Path(file_path).exists():
                    try:
                        # 构建目录结构：项目名/周期名/文档类型/子目录/文档
                        project_name = project_config.get('name', 'project')
                        cycle = doc.get('cycle', 'unknown')
                        doc_name = doc.get('doc_name', 'unknown')
                        filename = doc.get('filename', Path(file_path).name)
                        
                        # 优先使用 display_directory（已由 list.py 计算好，与显示一致）
                        directory = doc.get('display_directory', '') or doc.get('directory', '')
                        debug_dirs.add(directory)
                        
                        # 构建归档路径
                        if directory and directory != '/':
                            arcname = f"{cycle}/{doc_name}/{directory}/{filename}"
                        else:
                            arcname = f"{cycle}/{doc_name}/{filename}"
                        
                        zip_file.write(file_path, arcname)
                        copied_count += 1
                    except Exception as e:
                        pass
            
            # 记录日志
            log_package(f'Project: {project_name}, Total docs: {len(all_docs)}, Copied: {copied_count}')
            log_package(f'Directories found: {sorted(debug_dirs)}')
            # 记录前5个文档的详细信息
            for doc in all_docs[:5]:
                log_package(f"  Doc: {doc.get('doc_name')} | dir: {doc.get('directory')} | display_dir: {doc.get('display_directory')} | root: {doc.get('root_directory', 'N/A')}")
        
        # 返回ZIP文件
        zip_buffer.seek(0)
        response = make_response(zip_buffer.getvalue())
        response.headers['Content-Type'] = 'application/zip'
        safe_name = ''.join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_name}_backup.zip"'
        
        return response
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_package():
    """从ZIP包导入项目"""
    try:
        doc_manager = get_doc_manager()
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400

        # 确保 upload_folder 存在
        if hasattr(doc_manager, 'config') and doc_manager.config and hasattr(doc_manager.config, 'upload_folder'):
            upload_folder = doc_manager.config.upload_folder
        elif hasattr(doc_manager, 'folders') and doc_manager.folders and hasattr(doc_manager.folders, 'upload_folder'):
            upload_folder = doc_manager.folders.upload_folder
        else:
            # 使用默认路径
            from pathlib import Path
            upload_folder = Path('uploads')
        
        # 保存上传的ZIP到临时文件
        temp_zip_path = upload_folder / 'temp' / f'{uuid.uuid4()}.zip'
        
        try:
            # 确保临时目录存在
            temp_zip_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"[导入] 保存ZIP文件到: {temp_zip_path}")
            
            # 保存上传的文件
            file.save(str(temp_zip_path))
            logger.info(f"[导入] ZIP文件保存成功，大小: {temp_zip_path.stat().st_size} bytes")
            
            # 解压ZIP
            extract_dir = upload_folder / 'temp' / f'import_{uuid.uuid4()}'
            extract_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"[导入] 解压到目录: {extract_dir}")
            
            try:
                with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
                    zip_ref.extractall(str(extract_dir))
                logger.info(f"[导入] ZIP文件解压成功")
            except zipfile.BadZipFile:
                logger.error(f"[导入] 无效的ZIP文件: {temp_zip_path}")
                shutil.rmtree(extract_dir, ignore_errors=True)
                temp_zip_path.unlink(missing_ok=True)
                return jsonify({'status': 'error', 'message': '无效的ZIP文件'}), 400
            except Exception as e:
                logger.error(f"[导入] 解压ZIP文件失败: {e}")
                shutil.rmtree(extract_dir, ignore_errors=True)
                temp_zip_path.unlink(missing_ok=True)
                return jsonify({'status': 'error', 'message': f'解压ZIP文件失败: {str(e)}'}), 400
        except Exception as e:
            logger.error(f"[导入] 保存ZIP文件失败: {e}")
            # 清理可能创建的文件
            if temp_zip_path.exists():
                try:
                    temp_zip_path.unlink()
                except:
                    pass
            return jsonify({'status': 'error', 'message': f'保存ZIP文件失败: {str(e)}'}), 500

        # 读取项目配置（支持单用户版备份格式：配置文件在子目录中）
        config_file = None
        # 先查找根目录
        if (extract_dir / 'project_config.json').exists():
            config_file = extract_dir / 'project_config.json'
        elif (extract_dir / 'project_info.json').exists():
            config_file = extract_dir / 'project_info.json'
        else:
            # 再使用rglob在子目录中查找（单用户版备份格式：{项目名}/project_config.json）
            for candidate_name in ('project_config.json', 'project_info.json'):
                found = list(extract_dir.rglob(candidate_name))
                if found:
                    config_file = found[0]
                    break
        
        if not config_file:
            shutil.rmtree(extract_dir, ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': 'ZIP包中缺少project_config.json或project_info.json文件'}), 400

        with open(config_file, 'r', encoding='utf-8') as f:
            project_config = json.load(f)

        # ── 确定原始项目名、新项目名 ──
        original_project_name = project_config.get('name', '')

        # 如果项目名冲突，import_project_json 会加时间戳后缀，先自行判断
        existing_projects = doc_manager.projects.list_all() if doc_manager.projects else []
        existing_names = {p.get('name') for p in existing_projects}
        new_project_name = original_project_name
        if new_project_name in existing_names:
            new_project_name = f"{new_project_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        # ── 复制文件：ZIP 里的 {原项目名}/uploads/ → 新项目的 uploads 目录 ──
        # 备份打包时 arcname = relative_to(project_dir.parent)，
        # 所以 ZIP 内路径格式：  {原项目名}/uploads/xxx/yyy.docx
        try:
            projects_base = Path(doc_manager.config.projects_base_folder)
            new_project_uploads = projects_base / new_project_name / 'uploads'
            new_project_uploads.mkdir(parents=True, exist_ok=True)

            copied_count = 0
            # 在解压目录中查找与原项目名同名的子目录
            # extract_dir 可能直接就是解压根，也可能 config_file 在子目录里
            # 尝试几种目录结构：
            # 1. extract_dir/{原项目名}/uploads/...
            # 2. extract_dir/uploads/...（配置文件在根目录时）
            src_uploads_candidates = [
                extract_dir / original_project_name / 'uploads',
                extract_dir / 'uploads',
            ]
            src_uploads = None
            for candidate in src_uploads_candidates:
                if candidate.exists() and candidate.is_dir():
                    src_uploads = candidate
                    break

            if src_uploads:
                # 递归复制 uploads 目录下所有文件
                for src_file in src_uploads.rglob('*'):
                    if src_file.is_file():
                        rel = src_file.relative_to(src_uploads)
                        dst_file = new_project_uploads / rel
                        dst_file.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(src_file, dst_file)
                        copied_count += 1
                logger.info(f"[导入备份] 复制文件完成，共 {copied_count} 个")
            else:
                logger.warning(f"[导入备份] 未找到 uploads 目录（原项目名={original_project_name}），跳过文件复制")
        except Exception as copy_err:
            logger.error(f"[导入备份] 复制文件失败: {copy_err}")
            import traceback
            logger.error(traceback.format_exc())
            # 文件复制失败不阻塞配置导入，继续执行

        # ── 更新 project_config 中的项目名（import_project_json 也会更新，但提前同步名称） ──
        project_config['name'] = new_project_name

        # ── 更新 project_config 里所有 file_path 中的旧项目名 → 新项目名 ──
        def _fix_path(path_str: str) -> str:
            """把 file_path 中的旧项目名替换为新项目名，同时处理路径分隔符兼容性"""
            if not path_str:
                return path_str
            
            # 第一步：统一路径分隔符为正斜杠（兼容性处理）
            # Windows 备份用反斜杠，Linux 用正斜杠，统一用正斜杠更通用
            normalized = path_str.replace('\\', '/')
            
            # 第二步：替换项目名（支持两种分隔符格式）
            if not original_project_name or original_project_name == new_project_name:
                return normalized
            
            # 尝试替换两种分隔符格式的项目名
            # 格式1: projects/原项目名/uploads/...
            # 格式2: 原项目名/uploads/...
            for sep in ['/', '\\']:
                old_patterns = [
                    f'projects{sep}{original_project_name}{sep}uploads{sep}',
                    f'{original_project_name}{sep}uploads{sep}',
                ]
                new_patterns = [
                    f'projects{sep}{new_project_name}{sep}uploads{sep}',
                    f'{new_project_name}{sep}uploads{sep}',
                ]
                for old_p, new_p in zip(old_patterns, new_patterns):
                    if old_p in normalized:
                        normalized = normalized.replace(old_p, new_p)
                        break
            
            # 直接替换原项目名（兜底处理）
            if original_project_name in normalized:
                normalized = normalized.replace(original_project_name, new_project_name)
            
            return normalized

        for cycle, cycle_info in project_config.get('documents', {}).items():
            if not isinstance(cycle_info, dict):
                continue
            for doc in cycle_info.get('uploaded_docs', []):
                if 'file_path' in doc:
                    doc['file_path'] = _fix_path(doc['file_path'])
        # 也更新顶层 documents_index（如果有）
        for doc_id, doc_info in project_config.get('documents_index', {}).items():
            if isinstance(doc_info, dict) and 'file_path' in doc_info:
                doc_info['file_path'] = _fix_path(doc_info['file_path'])

        # ── 复制项目文档数据库 documents.db（如果有）──
        # 新版本使用 documents.db 存储文档信息，需要一起恢复
        db_copied = False
        db_candidates = [
            extract_dir / original_project_name / 'data' / 'db' / 'documents.db',
            extract_dir / original_project_name / 'data' / 'db' / 'documents.db.lock',
            extract_dir / 'data' / 'db' / 'documents.db',
            extract_dir / 'data' / 'db' / 'documents.db.lock',
        ]
        for db_candidate in db_candidates:
            if db_candidate.exists() and 'documents.db' in db_candidate.name:
                try:
                    # 获取解压目录中的源 db 目录
                    src_db_dir = db_candidate.parent
                    # 目标 db 目录（在新项目中）
                    projects_base = Path(doc_manager.config.projects_base_folder)
                    dst_db_dir = projects_base / new_project_name / 'data' / 'db'
                    dst_db_dir.mkdir(parents=True, exist_ok=True)
                    
                    # 复制所有 db 文件（.db 和 .db.lock）
                    for db_file in src_db_dir.glob('documents.db*'):
                        dst_file = dst_db_dir / db_file.name
                        shutil.copy2(db_file, dst_file)
                        logger.info(f"[导入备份] 复制数据库文件: {db_file.name} -> {dst_file}")
                        db_copied = True
                    break
                except Exception as db_err:
                    logger.warning(f"[导入备份] 复制 documents.db 失败（不影响主流程）: {db_err}")
        
        if db_copied:
            logger.info(f"[导入备份] 已恢复 documents.db 数据库")

        # ── 处理备份里的 documents_index.json（新版本的主要文档记录来源）──
        # 备份打包时递归打包了整个项目目录，所以 ZIP 里有：
        # {项目名}/data/documents_index.json  或  {项目名}/documents_index.json
        doc_index_candidates = [
            extract_dir / original_project_name / 'data' / 'documents_index.json',
            extract_dir / original_project_name / 'documents_index.json',
            extract_dir / 'data' / 'documents_index.json',
            extract_dir / 'documents_index.json',
        ]
        doc_index_file = None
        for candidate in doc_index_candidates:
            if candidate.exists():
                doc_index_file = candidate
                break

        if doc_index_file:
            try:
                with open(doc_index_file, 'r', encoding='utf-8') as f:
                    doc_index = json.load(f)
                # 更新 file_path
                for doc_id, doc_info in doc_index.get('documents', {}).items():
                    if isinstance(doc_info, dict) and 'file_path' in doc_info:
                        doc_info['file_path'] = _fix_path(doc_info['file_path'])
                        doc_info['project_name'] = new_project_name
                
                # ── 同步 documents 结构（供验收检查使用）──
                # 验收检查读取的是 project_config['documents'][cycle]['uploaded_docs']
                # 需要从 documents_index 重建 documents 结构
                imported_docs = doc_index.get('documents', {})
                if imported_docs:
                    # 构建 documents 结构
                    # 结构：{ cycle: { doc_name: { uploaded_docs: [...] } } }
                    # 需要先从 project_config 中获取 cycles 列表
                    imported_cycles = project_config.get('cycles', [])
                    imported_documents = project_config.get('documents', {})
                    
                    # 确保 documents 结构存在
                    if not imported_documents:
                        imported_documents = {}
                    
                    # 按 cycle 和 doc_name 分组
                    for doc_id, doc_info in imported_docs.items():
                        if not isinstance(doc_info, dict):
                            continue
                        
                        cycle = doc_info.get('cycle', '未分类')
                        doc_name = doc_info.get('doc_name', '未知文档')
                        directory = doc_info.get('directory', '')
                        
                        # 确保 cycle 存在
                        if cycle not in imported_documents:
                            imported_documents[cycle] = {'uploaded_docs': []}
                        if 'uploaded_docs' not in imported_documents[cycle]:
                            imported_documents[cycle]['uploaded_docs'] = []
                        
                        # 构建 uploaded_doc 记录
                        uploaded_doc = {
                            'doc_id': doc_id,
                            'doc_name': doc_name,
                            'filename': doc_info.get('original_filename', ''),
                            'file_path': doc_info.get('file_path', ''),
                            'file_size': doc_info.get('file_size', 0),
                            'file_type': doc_info.get('file_type', ''),
                            'upload_time': doc_info.get('upload_time', ''),
                            'directory': directory,
                            'status': doc_info.get('status', 'uploaded'),
                        }
                        # 添加附加属性
                        if doc_info.get('has_seal'):
                            uploaded_doc['has_seal'] = doc_info.get('has_seal')
                        if doc_info.get('party_a_seal'):
                            uploaded_doc['party_a_seal'] = doc_info.get('party_a_seal')
                        if doc_info.get('party_b_seal'):
                            uploaded_doc['party_b_seal'] = doc_info.get('party_b_seal')
                        if doc_info.get('no_seal'):
                            uploaded_doc['no_seal'] = doc_info.get('no_seal')
                        if doc_info.get('no_signature'):
                            uploaded_doc['no_signature'] = doc_info.get('no_signature')
                        if doc_info.get('party_a_signer'):
                            uploaded_doc['party_a_signer'] = doc_info.get('party_a_signer')
                        if doc_info.get('party_b_signer'):
                            uploaded_doc['party_b_signer'] = doc_info.get('party_b_signer')
                        if doc_info.get('doc_date'):
                            uploaded_doc['doc_date'] = doc_info.get('doc_date')
                        if doc_info.get('sign_date'):
                            uploaded_doc['sign_date'] = doc_info.get('sign_date')
                        if doc_info.get('source'):
                            uploaded_doc['source'] = doc_info.get('source')
                        if doc_info.get('custom_attrs'):
                            uploaded_doc['custom_attrs'] = doc_info.get('custom_attrs')
                        
                        imported_documents[cycle]['uploaded_docs'].append(uploaded_doc)
                    
                    # 更新 project_config 中的 documents
                    project_config['documents'] = imported_documents
                    logger.info(f"[导入备份] 同步 documents 结构：{len(imported_docs)} 个文档")
                
                # 注入到 project_config 供 import_project_json / save_full_config 使用
                project_config['_imported_doc_index'] = doc_index
                logger.info(f"[导入备份] 找到 documents_index.json，共 {len(doc_index.get('documents', {}))} 个文档记录")
            except Exception as idx_err:
                logger.warning(f"[导入备份] 读取 documents_index.json 失败（不影响主流程）: {idx_err}")

        # ── 导入项目（传入 new_name，避免函数内部再次重命名导致路径不一致） ──
        result = doc_manager.import_project_json(project_config, new_name=new_project_name)

        if result.get('status') == 'success':
            result['copied_files'] = copied_count if src_uploads else 0
            result['message'] = f"项目导入成功，已恢复 {copied_count if src_uploads else 0} 个文件"

        # 清理临时文件
        shutil.rmtree(extract_dir, ignore_errors=True)
        temp_zip_path.unlink(missing_ok=True)

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def download_package(project_id, task_id):
    """下载打包完成的ZIP文件"""
    import json
    from pathlib import Path
    import os
    
    try:
        from flask import send_file, jsonify
        
        # 使用绝对路径
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        tasks_file = base_dir / 'uploads' / 'tasks' / 'package_tasks.json'
        
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


# 项目导入相关路由
import io
import zipfile
import json
import uuid
import shutil
import os
from datetime import datetime
from pathlib import Path

# 分片上传配置
UPLOAD_TEMP_FOLDER = Path('uploads/temp_chunks')
UPLOAD_TEMP_FOLDER.mkdir(parents=True, exist_ok=True)


def import_project_chunk():
    """上传项目包分片（支持断点续传）"""
    try:
        file = request.files.get('chunk')
        chunk_index = request.form.get('chunkIndex', type=int)
        total_chunks = request.form.get('totalChunks', type=int)
        file_name = request.form.get('filename')
        file_id = request.form.get('fileId')
        
        # 检查必要参数
        if file is None or chunk_index is None or total_chunks is None or not file_name or not file_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 生成临时文件路径
        temp_dir = UPLOAD_TEMP_FOLDER / f"import_project_{file_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = temp_dir / f"chunk_{chunk_index}"
        
        # 保存分片
        file.save(chunk_path)
        
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{total_chunks} 上传成功'
        })
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_project_merge():
    """合并项目包分片并导入"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        file_name = data.get('filename')
        file_id = data.get('fileId')
        
        # 新的冲突处理参数
        conflict_action = data.get('conflict_action', 'rename')  # 'overwrite', 'rename', 'manual'
        custom_name = data.get('custom_name')  # 用户手动输入的名称
        
        if not all([file_name, file_id]):
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 读取所有分片
        temp_dir = UPLOAD_TEMP_FOLDER / f"import_project_{file_id}"
        if not temp_dir.exists():
            return jsonify({'status': 'error', 'message': '分片不存在'}), 400
        
        # 合并分片
        merged_file = io.BytesIO()
        
        # 找出所有分片文件并按索引排序
        chunk_files = []
        for chunk_file in temp_dir.iterdir():
            if chunk_file.name.startswith('chunk_'):
                try:
                    chunk_index = int(chunk_file.name.split('_')[1])
                    chunk_files.append((chunk_index, chunk_file))
                except:
                    pass
        
        # 按索引排序
        chunk_files.sort(key=lambda x: x[0])
        
        # 合并所有分片
        for chunk_index, chunk_file in chunk_files:
            with open(chunk_file, 'rb') as f:
                merged_file.write(f.read())
        
        merged_file.seek(0)
        
        # 解压ZIP文件到projects目录
        projects_dir = doc_manager.config.projects_folder
        extract_dir = projects_dir / f"import_temp_{file_id}"
        extract_dir.mkdir(parents=True, exist_ok=True)
        
        with zipfile.ZipFile(merged_file, 'r') as zip_ref:
            zip_ref.extractall(str(extract_dir))
        
        # 查找项目配置文件
        project_config_file = None
        project_info_file = None
        
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                if file == 'project_config.json':
                    project_config_file = Path(root) / file
                elif file == 'project_info.json':
                    project_info_file = Path(root) / file
            if project_config_file or project_info_file:
                break
        
        # 读取项目配置
        project_config = {}
        if project_config_file:
            with open(project_config_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
        elif project_info_file:
            with open(project_info_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
        else:
            # 清理临时文件
            shutil.rmtree(temp_dir, ignore_errors=True)
            shutil.rmtree(extract_dir, ignore_errors=True)
            return jsonify({'status': 'error', 'message': 'ZIP包中缺少项目配置文件（project_config.json或project_info.json）'}), 400
        
        # 获取原始项目名称
        original_project_name = project_config.get('name', f'导入项目_{datetime.now().strftime("%Y%m%d%H%M%S")}')
        project_name = original_project_name
        
        # 如果用户指定了自定义名称，使用自定义名称
        if custom_name:
            project_name = custom_name
        
        # 目录名用项目名（与系统约定一致：get_project_folder 用项目名）
        target_project_dir = projects_dir / project_name
        
        # 确定项目源目录
        if project_config_file:
            project_source_dir = project_config_file.parent
        elif project_info_file:
            project_source_dir = project_info_file.parent
        else:
            project_source_dir = extract_dir
        
        logger.info(f"[导入] 源目录: {project_source_dir}")
        logger.info(f"[导入] 目标目录: {target_project_dir}")
        
        is_renamed = False
        merge_stats = None
        should_copy_files = True
        
        # 冲突检测：直接检查目标目录是否存在（比查索引更可靠）
        project_exists = target_project_dir.exists()
        
        # 处理冲突（同名项目目录已存在时）
        if project_exists:
            if conflict_action == 'merge':
                logger.info(f"开始合并项目数据: {project_name}")
                merge_stats = merge_project_data(
                    project_source_dir,
                    target_project_dir,
                    project_name,
                    doc_manager
                )
                logger.info(f"项目数据合并完成: {merge_stats}")
                should_copy_files = False
            elif conflict_action == 'overwrite':
                shutil.rmtree(str(target_project_dir), ignore_errors=True)
                logger.info(f"已删除现有项目目录: {target_project_dir}")
            elif conflict_action == 'manual' and custom_name:
                # 手动名称冲突，追加时间戳区分
                project_name = f"{custom_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
                target_project_dir = projects_dir / project_name
                is_renamed = True
                logger.info(f"手动名称冲突，生成新名称: {project_name}")
            else:
                # 默认：重命名，追加时间戳区分
                project_name = f"{original_project_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
                target_project_dir = projects_dir / project_name
                is_renamed = True
                logger.info(f"项目已存在，生成新名称: {project_name}")
        
        # 生成新项目ID（UUID格式，不作为目录名，仅用于索引）
        new_project_id = str(uuid.uuid4())
        logger.info(f"[导入] 新项目ID: {new_project_id}, 项目名: {project_name}")
        
        logger.info(f"项目源目录: {project_source_dir}")
        logger.info(f"项目目标目录: {target_project_dir}")
        
        # 检查源目录中的文档索引文件
        source_index_path = project_source_dir / 'data' / 'documents_index.json'
        logger.info(f"源文档索引路径: {source_index_path}")
        logger.info(f"源文档索引是否存在: {source_index_path.exists()}")
        
        if source_index_path.exists():
            try:
                with open(source_index_path, 'r', encoding='utf-8') as f:
                    temp_data = json.load(f)
                logger.info(f"源文档索引文档数量: {len(temp_data.get('documents', {}))}")
            except Exception as e:
                logger.error(f"读取源文档索引失败: {e}")
        
        # 如果需要，复制项目文件
        if should_copy_files:
            shutil.copytree(str(project_source_dir), str(target_project_dir))
            logger.info(f"项目文件已复制到: {target_project_dir}")
        
        # 处理文档索引文件
        target_index_path = target_project_dir / 'data' / 'documents_index.json'
        
        if source_index_path.exists():
            try:
                # 读取原始文档索引
                with open(source_index_path, 'r', encoding='utf-8') as f:
                    index_data = json.load(f)
                
                logger.info(f"读取到 {len(index_data.get('documents', {}))} 个文档")
                
                # ★ 提前构建 doc_name → cycle 映射（从 requirements.json）
                doc_name_to_cycle = {}
                requirements_file = target_project_dir / 'requirements.json'
                if not requirements_file.exists():
                    config_dir = target_project_dir / 'config'
                    if config_dir.exists():
                        requirements_file = config_dir / 'requirements.json'
                
                if requirements_file.exists():
                    try:
                        with open(requirements_file, 'r', encoding='utf-8') as f:
                            requirements = json.load(f)
                        for cycle, cycle_data in requirements.get('documents', {}).items():
                            for doc in cycle_data.get('required_docs', []):
                                doc_name = doc.get('name', '')
                                if doc_name and doc_name not in doc_name_to_cycle:
                                    doc_name_to_cycle[doc_name] = cycle
                        logger.info(f"[导入] 从 requirements.json 构建了 {len(doc_name_to_cycle)} 个文档名→周期映射")
                    except Exception as e:
                        logger.warning(f"读取 requirements.json 失败，跳过 cycle 推断: {e}")
                
                # 更新文档路径中的项目目录名（旧项目名 → 新项目名）并推断 cycle
                documents = index_data.get('documents', {})
                for doc_id, doc_info in documents.items():
                    # 更新file_path中的目录名
                    # file_path 格式: projects\{原项目名}\uploads\...
                    # 需要把原项目名替换为新项目名
                    if 'file_path' in doc_info:
                        # 优先用 project_name 字段作为旧名（最准确）
                        old_name_in_path = doc_info.get('project_name') or original_project_name
                        new_dir_name = project_name  # 目录名是项目名
                        if old_name_in_path and old_name_in_path != new_dir_name:
                            doc_info['file_path'] = doc_info['file_path'].replace(old_name_in_path, new_dir_name)
                    # 始终同步 project_name 字段
                    # 更新project_name字段
                    doc_info['project_name'] = project_name
                    # ★ 根据 doc_name 推断 cycle（documents_index.json 中的文档 cycle 通常为 None）
                    if not doc_info.get('cycle'):
                        doc_name = doc_info.get('doc_name', '')
                        if doc_name in doc_name_to_cycle:
                            doc_info['cycle'] = doc_name_to_cycle[doc_name]
                            logger.info(f"[导入] 推断文档 {doc_id} 的周期: {doc_name} → {doc_info['cycle']}")
                
                # 保存更新后的索引
                with open(target_index_path, 'w', encoding='utf-8') as f:
                    json.dump(index_data, f, ensure_ascii=False, indent=2)
                
                logger.info(f"已更新文档索引文件: {target_index_path}")
                logger.info(f"保存了 {len(documents)} 个文档")
            except Exception as e:
                logger.error(f"处理文档索引文件失败: {e}")
                import traceback
                logger.error(traceback.format_exc())
        else:
            logger.warning(f"源文档索引文件不存在: {source_index_path}")
        
        # ★ 使用已提前生成的项目ID（不再重复生成）
        project_config['id'] = new_project_id
        project_config['name'] = project_name
        project_config['created_time'] = project_config.get('created_time') or datetime.now().isoformat()
        project_config['updated_time'] = datetime.now().isoformat()
        
        # 确保项目配置中的名称与实际目录名称一致
        logger.info(f"[导入] 项目配置已更新: ID={new_project_id}, 名称={project_name}, 目录={target_project_dir.name}")
        
        # 如果存在requirements.json，加载需求
        # 重新检查（前面可能在复制目标目录后查找）
        requirements_file = target_project_dir / 'requirements.json'
        if not requirements_file.exists():
            config_dir = target_project_dir / 'config'
            if config_dir.exists():
                requirements_file = config_dir / 'requirements.json'
        
        if requirements_file.exists():
            try:
                with open(requirements_file, 'r', encoding='utf-8') as f:
                    requirements = json.load(f)
                
                # 先保留原 project_config 里的 uploaded_docs（路径需要同步更新）
                old_documents = project_config.get('documents', {})
                
                # 更新项目配置（cycles 和 required_docs 来自 requirements）
                project_config['cycles'] = requirements.get('cycles', [])
                project_config['documents'] = requirements.get('documents', {})
                
                # 将原 uploaded_docs 回填到新 documents 中，并同步 file_path 里的项目名
                for cycle, old_cycle_data in old_documents.items():
                    uploaded_docs = old_cycle_data.get('uploaded_docs', [])
                    if not uploaded_docs:
                        continue
                    # 确保目标 cycle 存在
                    if cycle not in project_config['documents']:
                        project_config['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
                    elif 'uploaded_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['uploaded_docs'] = []
                    # 更新每个文档的 file_path 和 project_name
                    for doc in uploaded_docs:
                        if 'file_path' in doc:
                            old_name = doc.get('project_name') or original_project_name
                            if old_name and old_name != project_name:
                                doc['file_path'] = doc['file_path'].replace(old_name, project_name)
                        doc['project_name'] = project_name
                    # 回填到配置（只添加 project_info 里已有的，不重复）
                    project_config['documents'][cycle]['uploaded_docs'] = uploaded_docs
                
                logger.info(f"已加载requirements.json文件: {requirements_file}")
            except Exception as e:
                logger.error(f"加载requirements.json失败: {e}")
        
        # 保存更新后的配置
        # 检查目标目录中存在的配置文件类型
        target_info_file = target_project_dir / 'project_info.json'
        target_config_file = target_project_dir / 'project_config.json'
        
        if target_info_file.exists():
            # 如果存在project_info.json，更新它
            with open(target_info_file, 'w', encoding='utf-8') as f:
                json.dump(project_config, f, ensure_ascii=False, indent=2)
        else:
            # 否则更新project_config.json
            with open(target_config_file, 'w', encoding='utf-8') as f:
                json.dump(project_config, f, ensure_ascii=False, indent=2)
        
        # 更新项目索引（使用add_to_index而不是create，避免重复创建目录）
        doc_manager.projects.add_to_index(
            project_id=new_project_id,
            name=project_name,
            description=project_config.get('description', ''),
            created_time=project_config.get('created_time')
        )
        
        # ★ 通过 data_manager 再保存一次配置，确保 load_full_config(project_name) 能正常读取
        # （data_manager 使用项目名作为目录名，与系统其他部分一致）
        if not merge_stats:  # 合并操作已经处理了数据，不需要重复保存
            doc_manager.data_manager.save_full_config(project_name, project_config)
            logger.info(f"[导入] 已通过 data_manager 保存配置: {project_name}")
        
        # 清理临时文件
        shutil.rmtree(temp_dir, ignore_errors=True)
        shutil.rmtree(extract_dir, ignore_errors=True)
        
        # 构建返回结果
        result = {
            'status': 'success',
            'message': '项目数据合并完成' if merge_stats else '项目导入成功',
            'project_id': new_project_id,
            'project_name': project_name,
            'renamed': is_renamed,
            'merged': merge_stats is not None
        }
        
        # 如果是合并操作，添加合并统计
        if merge_stats:
            result['merge_stats'] = merge_stats
            logger.info(f"返回合并统计: {merge_stats}")
        
        return jsonify(result)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def package_full_project(project_id):
    """完整打包项目目录（先保存再打包）"""
    try:
        import tempfile
        import os
        from flask import make_response
        
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
        os.unlink(temp_zip.name)
        
        # 记录操作日志
        doc_manager.log_operation('打包项目', f'完整打包项目"{project_name}"', project=project_id)
        
        # 返回ZIP文件
        response = make_response(zip_data)
        response.headers['Content-Type'] = 'application/zip'
        # 使用 Werkzeug 安全文件名函数
        from werkzeug.utils import secure_filename
        safe_name = secure_filename(project_name)
        if not safe_name:
            safe_name = 'project'
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_name}_full_backup.zip"'
        
        return response
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ==================== 项目数据合并功能 ====================

def merge_project_data(source_dir, target_dir, project_name, doc_manager):
    """
    合并两个项目的数据
    
    Args:
        source_dir: 新导入项目的临时目录
        target_dir: 现有项目的目标目录
        project_name: 项目名称
        doc_manager: 文档管理器实例
    
    Returns:
        dict: 合并统计信息
    """
    stats = {
        'documents_added': 0,
        'documents_merged': 0,
        'zip_records_added': 0,
        'zip_records_merged': 0,
        'files_copied': 0,
        'files_backed_up': 0,
        'cycles_added': 0,
        'requirements_added': 0
    }
    
    logger.info(f"开始合并项目数据: {project_name}")
    logger.info(f"源目录: {source_dir}")
    logger.info(f"目标目录: {target_dir}")
    
    # 1. 合并 documents_index.json
    merge_documents_index(source_dir, target_dir, project_name, stats)
    
    # 2. 合并 documents_archived.json
    merge_documents_archived(source_dir, target_dir, stats)
    
    # 3. 合并 requirements.json
    merge_requirements(source_dir, target_dir, project_name, stats)
    
    # 4. 合并 zip_uploads.json
    merge_zip_uploads(source_dir, target_dir, stats)
    
    # 5. 复制文档文件
    copy_document_files(source_dir, target_dir, project_name, stats)
    
    # 6. 更新 project_info.json
    merge_update_project_info(source_dir, target_dir, stats)
    
    logger.info(f"项目数据合并完成: {stats}")
    return stats


def merge_documents_index(source_dir, target_dir, project_name, stats):
    """合并文档索引"""
    source_file = source_dir / 'data' / 'documents_index.json'
    target_file = target_dir / 'data' / 'documents_index.json'
    
    if not source_file.exists():
        logger.info("源文档索引不存在，跳过合并")
        return
    
    # 读取源数据
    with open(source_file, 'r', encoding='utf-8') as f:
        source_data = json.load(f)
    
    # 读取或创建目标数据
    target_data = {'documents': {}}
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_data = json.load(f)
    
    # 合并文档
    for doc_id, doc_info in source_data.get('documents', {}).items():
        # 更新项目名称
        doc_info['project_name'] = project_name
        
        # 更新文件路径中的项目名称
        if 'file_path' in doc_info:
            old_project_name = doc_info.get('project_name', '')
            if old_project_name and old_project_name != project_name:
                doc_info['file_path'] = doc_info['file_path'].replace(old_project_name, project_name)
        
        if doc_id in target_data['documents']:
            # 已存在，比较更新时间
            source_time = doc_info.get('upload_time', '')
            target_time = target_data['documents'][doc_id].get('upload_time', '')
            if source_time > target_time:
                target_data['documents'][doc_id] = doc_info
                stats['documents_merged'] += 1
                logger.debug(f"更新文档: {doc_id}")
        else:
            # 新文档
            target_data['documents'][doc_id] = doc_info
            stats['documents_added'] += 1
            logger.debug(f"添加新文档: {doc_id}")
    
    # 保存合并后的数据
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"文档索引合并完成: 新增 {stats['documents_added']}, 更新 {stats['documents_merged']}")


def merge_documents_archived(source_dir, target_dir, stats):
    """合并归档状态"""
    source_file = source_dir / 'data' / 'documents_archived.json'
    target_file = target_dir / 'data' / 'documents_archived.json'
    
    if not source_file.exists():
        return
    
    with open(source_file, 'r', encoding='utf-8') as f:
        source_data = json.load(f)
    
    target_data = {'documents_archived': {}}
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_data = json.load(f)
    
    # 合并归档状态（任一来源已归档则标记为已归档）
    for cycle, docs in source_data.get('documents_archived', {}).items():
        if cycle not in target_data['documents_archived']:
            target_data['documents_archived'][cycle] = {}
        
        for doc_name, archived in docs.items():
            if archived:
                target_data['documents_archived'][cycle][doc_name] = True
    
    # 保存
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)
    
    logger.info("归档状态合并完成")


def merge_requirements(source_dir, target_dir, project_name, stats):
    """合并需求配置"""
    # 尝试多个可能的路径
    possible_paths = [
        source_dir / 'config' / 'requirements.json',
        source_dir / 'requirements.json',
        source_dir / 'data' / 'requirements.json'
    ]
    
    source_file = None
    for path in possible_paths:
        if path.exists():
            source_file = path
            break
    
    if not source_file:
        logger.info("源需求配置不存在，跳过合并")
        return
    
    # 目标文件路径
    target_paths = [
        target_dir / 'config' / 'requirements.json',
        target_dir / 'requirements.json',
        target_dir / 'data' / 'requirements.json'
    ]
    
    target_file = None
    for path in target_paths:
        if path.exists():
            target_file = path
            break
    
    # 读取源数据
    with open(source_file, 'r', encoding='utf-8') as f:
        source_data = json.load(f)
    
    # 读取或创建目标数据
    target_data = {'cycles': [], 'documents': {}}
    if target_file and target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_data = json.load(f)
    else:
        target_file = target_dir / 'config' / 'requirements.json'
    
    # 合并 cycles（去重）
    existing_cycles = set(target_data.get('cycles', []))
    for cycle in source_data.get('cycles', []):
        if cycle not in existing_cycles:
            target_data['cycles'].append(cycle)
            existing_cycles.add(cycle)
            stats['cycles_added'] += 1
    
    # 合并 documents
    for cycle, cycle_data in source_data.get('documents', {}).items():
        if cycle not in target_data['documents']:
            target_data['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
        
        # 合并 required_docs（按名称去重）
        existing_doc_names = {d.get('name') if isinstance(d, dict) else d 
                             for d in target_data['documents'][cycle].get('required_docs', [])}
        
        for doc in cycle_data.get('required_docs', []):
            doc_name = doc.get('name') if isinstance(doc, dict) else doc
            if doc_name not in existing_doc_names:
                target_data['documents'][cycle]['required_docs'].append(doc)
                existing_doc_names.add(doc_name)
                stats['requirements_added'] += 1
        
        # 合并 uploaded_docs
        existing_uploaded_ids = {d.get('doc_id') for d in target_data['documents'][cycle].get('uploaded_docs', []) if isinstance(d, dict)}
        
        for uploaded_doc in cycle_data.get('uploaded_docs', []):
            if isinstance(uploaded_doc, dict):
                doc_id = uploaded_doc.get('doc_id')
                if doc_id and doc_id not in existing_uploaded_ids:
                    # 更新项目名称和路径
                    uploaded_doc['project_name'] = project_name
                    if 'file_path' in uploaded_doc:
                        old_name = uploaded_doc.get('project_name', '')
                        if old_name and old_name != project_name:
                            uploaded_doc['file_path'] = uploaded_doc['file_path'].replace(old_name, project_name)
                    
                    target_data['documents'][cycle]['uploaded_docs'].append(uploaded_doc)
                    existing_uploaded_ids.add(doc_id)
    
    # 保存
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)
    
    logger.info(f"需求配置合并完成: 新增 {stats['cycles_added']} 个周期, {stats['requirements_added']} 个文档类型")


def merge_zip_uploads(source_dir, target_dir, stats):
    """合并 ZIP 上传记录"""
    source_file = source_dir / 'zip_uploads.json'
    target_file = target_dir / 'zip_uploads.json'
    
    if not source_file.exists():
        logger.info("源 ZIP 上传记录不存在，跳过合并")
        return
    
    with open(source_file, 'r', encoding='utf-8') as f:
        source_records = json.load(f)
    
    target_records = []
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_records = json.load(f)
    
    # 创建目标记录的字典（以 id 为键）
    target_dict = {r['id']: r for r in target_records}
    
    # 合并记录
    for record in source_records:
        record_id = record['id']
        if record_id in target_dict:
            # 已存在，保留更新时间较新的
            source_time = record.get('upload_time', '')
            target_time = target_dict[record_id].get('upload_time', '')
            if source_time > target_time:
                target_dict[record_id] = record
                stats['zip_records_merged'] += 1
        else:
            # 新记录
            target_dict[record_id] = record
            stats['zip_records_added'] += 1
    
    # 保存合并后的记录
    merged_records = list(target_dict.values())
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(merged_records, f, ensure_ascii=False, indent=2)
    
    logger.info(f"ZIP 上传记录合并完成: 新增 {stats['zip_records_added']}, 更新 {stats['zip_records_merged']}")


def copy_document_files(source_dir, target_dir, project_name, stats):
    """复制文档文件"""
    # 获取源目录中的所有文件（排除 JSON 配置文件）
    excluded_extensions = {'.json'}
    
    for root, dirs, files in os.walk(source_dir):
        # 计算相对路径
        relative_path = Path(root).relative_to(source_dir)
        target_root = target_dir / relative_path
        
        # 确保目标目录存在
        target_root.mkdir(parents=True, exist_ok=True)
        
        for file in files:
            if Path(file).suffix.lower() not in excluded_extensions:
                source_file = Path(root) / file
                target_file = target_root / file
                
                if target_file.exists():
                    # 文件已存在，比较修改时间
                    source_stat = source_file.stat()
                    target_stat = target_file.stat()
                    
                    if source_stat.st_mtime > target_stat.st_mtime:
                        # 源文件较新，备份旧文件
                        backup_name = f"{target_file.stem}_backup_{datetime.now().strftime('%Y%m%d%H%M%S')}{target_file.suffix}"
                        backup_file = target_file.parent / backup_name
                        shutil.move(str(target_file), str(backup_file))
                        shutil.copy2(str(source_file), str(target_file))
                        stats['files_backed_up'] += 1
                        stats['files_copied'] += 1
                        logger.debug(f"文件已更新: {source_file}")
                    else:
                        # 目标文件较新或相同，跳过
                        logger.debug(f"文件已存在且较新，跳过: {source_file}")
                else:
                    # 新文件，直接复制
                    shutil.copy2(str(source_file), str(target_file))
                    stats['files_copied'] += 1
                    logger.debug(f"复制新文件: {source_file}")
    
    logger.info(f"文档文件复制完成: 复制 {stats['files_copied']}, 备份 {stats['files_backed_up']}")


def merge_update_project_info(source_dir, target_dir, stats):
    """合并项目数据时更新项目信息"""
    source_file = source_dir / 'project_info.json'
    target_file = target_dir / 'project_info.json'
    
    if not source_file.exists():
        return
    
    with open(source_file, 'r', encoding='utf-8') as f:
        source_info = json.load(f)
    
    target_info = {}
    if target_file.exists():
        with open(target_file, 'r', encoding='utf-8') as f:
            target_info = json.load(f)
    
    # 保留目标项目的基本信息（id, name, created_time）
    # 合并其他字段（如果源数据不为空则更新）
    fields_to_merge = ['description', 'party_a', 'party_b', 'supervisor', 'manager', 'duration']
    
    for field in fields_to_merge:
        if source_info.get(field) and not target_info.get(field):
            target_info[field] = source_info[field]
    
    # 更新 updated_time
    target_info['updated_time'] = datetime.now().isoformat()
    
    # 保存
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(target_info, f, ensure_ascii=False, indent=2)
    
    logger.info("项目信息更新完成")

# ==================== 项目数据合并功能结束 ====================


def preview_import_package():
    """
    预览导入的ZIP包
    接收ZIP文件，解压到临时目录，读取项目信息并返回，供前端显示冲突选项
    """
    try:
        from flask import request, jsonify
        import uuid
        import shutil
        from datetime import datetime
        from pathlib import Path
        import zipfile
        import json
        
        doc_manager = get_doc_manager()
        
        # 检查是否有文件上传
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        # 保存上传的ZIP到临时文件
        temp_id = str(uuid.uuid4())
        # 确保 upload_folder 存在
        if hasattr(doc_manager, 'config') and doc_manager.config and hasattr(doc_manager.config, 'upload_folder'):
            upload_folder = doc_manager.config.upload_folder
        elif hasattr(doc_manager, 'folders') and doc_manager.folders and hasattr(doc_manager.folders, 'upload_folder'):
            upload_folder = doc_manager.folders.upload_folder
        else:
            # 使用默认路径
            from pathlib import Path
            upload_folder = Path('uploads')
        temp_zip_path = upload_folder / 'temp' / f'preview_{temp_id}.zip'
        
        try:
            # 确保临时目录存在
            temp_zip_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"[预览] 保存ZIP文件到: {temp_zip_path}")
            
            # 保存上传的文件
            file.save(str(temp_zip_path))
            logger.info(f"[预览] ZIP文件保存成功，大小: {temp_zip_path.stat().st_size} bytes")
            
            # 解压ZIP到临时目录
            extract_dir = upload_folder / 'temp' / f'preview_{temp_id}'
            extract_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"[预览] 解压到目录: {extract_dir}")
            
            try:
                with zipfile.ZipFile(temp_zip_path, 'r') as zip_file:
                    zip_file.extractall(extract_dir)
                logger.info(f"[预览] ZIP文件解压成功")
            except zipfile.BadZipFile:
                logger.error(f"[预览] 无效的ZIP文件: {temp_zip_path}")
                shutil.rmtree(extract_dir, ignore_errors=True)
                temp_zip_path.unlink(missing_ok=True)
                return jsonify({'status': 'error', 'message': '无效的ZIP文件'}), 400
            except Exception as e:
                logger.error(f"[预览] 解压ZIP文件失败: {e}")
                shutil.rmtree(extract_dir, ignore_errors=True)
                temp_zip_path.unlink(missing_ok=True)
                return jsonify({'status': 'error', 'message': f'解压ZIP文件失败: {str(e)}'}), 400
        except Exception as e:
            logger.error(f"[预览] 保存ZIP文件失败: {e}")
            # 清理可能创建的文件
            if temp_zip_path.exists():
                try:
                    temp_zip_path.unlink()
                except:
                    pass
            return jsonify({'status': 'error', 'message': f'保存ZIP文件失败: {str(e)}'}), 500
        
        # 查找项目配置文件
        project_config_file = None
        project_info_file = None
        
        for json_file in extract_dir.rglob('*.json'):
            if json_file.name == 'project_config.json':
                project_config_file = json_file
                break
            elif json_file.name == 'project_info.json':
                project_info_file = json_file
        
        config_file = project_config_file or project_info_file
        
        if not config_file:
            shutil.rmtree(extract_dir, ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': 'ZIP包中未找到项目配置文件'}), 400

        # 读取项目配置
        try:
            with open(str(config_file), 'r', encoding='utf-8') as f:
                project_config = json.load(f)
        except Exception as e:
            shutil.rmtree(extract_dir, ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': f'读取项目配置失败: {str(e)}'}), 400

        project_name = project_config.get('name', '')
        if not project_name:
            project_name = file.filename.replace('.zip', '')

        # ── 补充读取 cycles（来自 requirements.json）和 documents_index ──
        project_folder = config_file.parent
        # requirements.json 可能在项目根目录或 config/ 子目录
        requirements_file = project_folder / 'requirements.json'
        if not requirements_file.exists():
            requirements_file = project_folder / 'config' / 'requirements.json'
        # documents_index.json 可能在 data/ 子目录或项目根目录
        doc_index_file = project_folder / 'data' / 'documents_index.json'
        if not doc_index_file.exists():
            doc_index_file = project_folder / 'documents_index.json'

        # 从 requirements.json 读取 cycles（主要来源）
        cycles_list = []
        if requirements_file.exists():
            try:
                with open(requirements_file, 'r', encoding='utf-8') as f:
                    req_data = json.load(f)
                cycles_list = req_data.get('cycles', [])
            except Exception:
                pass

        # cycles 也可能直接在 project_config 里（旧格式兼容）
        if not cycles_list and project_config.get('cycles'):
            cycles_list = project_config.get('cycles', [])

        # 从 documents_index.json 读取已上传文档数量
        doc_count = 0
        if doc_index_file.exists():
            try:
                with open(doc_index_file, 'r', encoding='utf-8') as f:
                    doc_index = json.load(f)
                doc_count = len(doc_index.get('documents', {}))
            except Exception:
                pass

        # 如果没有 documents_index，尝试从 project_config.documents 统计
        if doc_count == 0 and project_config.get('documents'):
            for cycle_data in project_config['documents'].values():
                if isinstance(cycle_data, dict):
                    doc_count += len(cycle_data.get('uploaded_docs', []))

        cycle_count = len(cycles_list)

        # 检查是否有同名项目
        existing_project = None
        try:
            projects = doc_manager.get_projects_list()
            logger.info(f"[预览] 检查同名项目: '{project_name}', 平台现有项目数: {len(projects)}")
            for p in projects:
                logger.info(f"[预览] 比对: 平台'{p.get('name')}' vs 导入'{project_name}' -> 匹配: {p.get('name') == project_name}")
                if p.get('name') == project_name:
                    existing_project = p
                    break
            logger.info(f"[预览] 同名项目检查结果: {'找到' if existing_project else '未找到'}")
        except Exception as e:
            logger.error(f"[预览] 检查同名项目出错: {e}")
            import traceback
            logger.error(traceback.format_exc())
            pass
        
        # 构建响应
        result = {
            'status': 'success',
            'temp_id': temp_id,
            'project_info': {
                'name': project_name,
                'original_name': project_config.get('name', ''),
                'description': project_config.get('description', ''),
                'cycle_count': cycle_count,
                'doc_count': doc_count,
                'created_time': project_config.get('created_time', ''),
                'config': project_config
            },
            'conflict': {
                'has_conflict': existing_project is not None,
                'existing_project': existing_project,
                'message': f'项目"{project_name}"已存在' if existing_project else None
            }
        }
        
        # 不清理临时文件，留待实际导入时使用
        return jsonify(result)
        
    except Exception as e:
        import traceback
        logger.error(f"预览导入包失败: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'message': str(e)}), 500


def import_from_preview():
    """
    从预览的临时文件执行实际导入
    处理同名项目的冲突，支持合并、覆盖和重命名
    """
    try:
        from flask import request, jsonify
        import shutil
        from datetime import datetime
        from pathlib import Path
        import json
        
        doc_manager = get_doc_manager()
        
        data = request.get_json()
        temp_id = data.get('temp_id')
        conflict_action = data.get('conflict_action', 'rename')  # 'overwrite', 'rename', 'merge'
        custom_name = data.get('custom_name', '')
        
        if not temp_id:
            return jsonify({'status': 'error', 'message': '缺少临时文件ID'}), 400
        
        # 检查临时文件
        # 确保 upload_folder 存在
        if hasattr(doc_manager, 'config') and doc_manager.config and hasattr(doc_manager.config, 'upload_folder'):
            upload_folder = doc_manager.config.upload_folder
        elif hasattr(doc_manager, 'folders') and doc_manager.folders and hasattr(doc_manager.folders, 'upload_folder'):
            upload_folder = doc_manager.folders.upload_folder
        else:
            # 使用默认路径
            from pathlib import Path
            upload_folder = Path('uploads')
        extract_dir = upload_folder / 'temp' / f'preview_{temp_id}'
        temp_zip_path = upload_folder / 'temp' / f'preview_{temp_id}.zip'
        
        try:
            if not extract_dir.exists():
                logger.error(f"[导入] 临时文件已过期或不存在: {extract_dir}")
                return jsonify({'status': 'error', 'message': '临时文件已过期'}), 400
            
            logger.info(f"[导入] 找到临时目录: {extract_dir}")
        except Exception as e:
            logger.error(f"[导入] 检查临时文件失败: {e}")
            return jsonify({'status': 'error', 'message': f'检查临时文件失败: {str(e)}'}), 500
        
        try:
            # 1. 找到项目配置文件
            project_info_file = None
            for json_file in extract_dir.rglob('project_info.json'):
                project_info_file = json_file
                break
            
            if not project_info_file:
                # 尝试找 project_config.json
                for json_file in extract_dir.rglob('project_config.json'):
                    project_info_file = json_file
                    break
            
            if not project_info_file:
                return jsonify({'status': 'error', 'message': '未找到项目配置文件'}), 400
            
            # 2. 读取项目配置
            with open(project_info_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
            
            # 3. 确定项目名称（优先使用用户输入的名称）
            original_name = project_config.get('name', '')
            project_name = custom_name or original_name
            if not project_name:
                return jsonify({'status': 'error', 'message': '项目名称不能为空'}), 400
            
            # 4. 确定项目源目录（包含 project_info.json 的目录）
            project_source_dir = project_info_file.parent
            logger.info(f"[导入] 源目录: {project_source_dir}")
            logger.info(f"[导入] 源目录内容: {list(project_source_dir.iterdir())}")
            
            # 5. 检查同名项目
            existing_project = None
            projects = doc_manager.get_projects_list()
            logger.info(f"[导入] 检查同名项目: '{project_name}', 平台现有项目数: {len(projects)}")
            for p in projects:
                logger.info(f"[导入] 比对: 平台'{p.get('name')}' vs 导入'{project_name}' -> 匹配: {p.get('name') == project_name}")
                if p.get('name') == project_name:
                    existing_project = p
                    break
            
            logger.info(f"[导入] 同名项目检查结果: {'找到' if existing_project else '未找到'}, 冲突处理方式: {conflict_action}")
            
            # 6. 处理重命名
            is_renamed = False
            if existing_project and conflict_action == 'rename' and not custom_name:
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                project_name = f"{project_name}_{timestamp}"
                is_renamed = True
                logger.info(f"[导入] 项目已存在，生成新名称: {project_name}")
            
            # 7. 确定项目ID和目标目录
            projects_base = doc_manager.config.projects_base_folder
            target_project_dir = projects_base / project_name
            
            # 8. 处理不同的冲突情况
            merge_stats = None
            
            if existing_project and conflict_action == 'overwrite':
                # 覆盖模式：使用现有项目ID，删除旧目录后复制
                project_id = existing_project['id']
                if target_project_dir.exists():
                    shutil.rmtree(str(target_project_dir))
                    logger.info(f"[导入] 覆盖模式-删除旧目录: {target_project_dir}")
                # 复制整个目录
                shutil.copytree(str(project_source_dir), str(target_project_dir))
                logger.info(f"[导入] 覆盖模式-复制完成")
                
            elif existing_project and conflict_action == 'merge':
                # 合并模式：使用现有项目ID，合并数据
                project_id = existing_project['id']
                logger.info(f"[导入] 合并模式-开始合并数据到: {target_project_dir}")
                
                # 确保目标目录存在
                target_project_dir.mkdir(parents=True, exist_ok=True)
                
                # 调用合并函数
                merge_stats = merge_project_data(
                    project_source_dir,
                    target_project_dir,
                    project_name,
                    doc_manager
                )
                logger.info(f"[导入] 合并模式-合并完成: {merge_stats}")
                
            else:
                # 新建项目（重命名或全新导入）
                project_id = str(uuid.uuid4())
                logger.info(f"[导入] 新建项目模式，生成新ID: {project_id}")
                # 复制整个目录
                shutil.copytree(str(project_source_dir), str(target_project_dir))
                logger.info(f"[导入] 复制完成")
            
            logger.info(f"[导入] 目标目录: {target_project_dir}")
            logger.info(f"[导入] 项目ID: {project_id}, 项目名称: {project_name}")
            
            # 9. 更新项目配置文件
            project_config['id'] = project_id
            project_config['name'] = project_name
            project_config['updated_time'] = datetime.now().isoformat()
            
            # 更新 project_info.json
            target_info_file = target_project_dir / 'project_info.json'
            with open(target_info_file, 'w', encoding='utf-8') as f:
                json.dump(project_config, f, ensure_ascii=False, indent=2)
            
            # 同时更新 project_config.json（如果存在）
            target_config_file = target_project_dir / 'project_config.json'
            if target_config_file.exists():
                with open(target_config_file, 'w', encoding='utf-8') as f:
                    json.dump(project_config, f, ensure_ascii=False, indent=2)
            
            logger.info(f"[导入] 项目信息已更新")
            
            # 10. 添加到项目索引
            ensure_project_index(doc_manager, project_id, project_name, project_config)
            
            # 10.5 将导入的数据同步到数据库（load_full_config 从文件读取后写入数据库）
            if hasattr(doc_manager, 'data_manager') and doc_manager.data_manager:
                try:
                    imported_config = doc_manager.data_manager.load_full_config(project_name)
                    if imported_config:
                        doc_manager.data_manager.save_full_config(project_name, imported_config)
                        logger.info(f"[导入] 完整配置已同步到数据库: {project_name}")
                except Exception as cfg_err:
                    logger.warning(f"[导入] 同步配置到数据库失败（不影响导入）: {cfg_err}")
            
            # 11. 刷新索引缓存
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                doc_manager.projects._load_projects_index()
                logger.info(f"[导入] 索引缓存已刷新，当前项目数量: {len(doc_manager.projects.list_all())}")
            
            logger.info(f"[导入] 项目导入成功: {project_name}")
            
            # 构建返回结果
            result = {
                'status': 'success',
                'message': '项目数据合并完成' if merge_stats else f'项目"{project_name}"导入成功',
                'project_id': project_id,
                'project_name': project_name,
                'renamed': is_renamed,
                'merged': merge_stats is not None
            }
            
            # 如果是合并操作，添加合并统计
            if merge_stats:
                result['merge_stats'] = merge_stats
                logger.info(f"[导入] 返回合并统计: {merge_stats}")
            
            return jsonify(result)
            
        finally:
            # 清理临时文件
            shutil.rmtree(extract_dir, ignore_errors=True)
            if temp_zip_path.exists():
                temp_zip_path.unlink(missing_ok=True)
            
    except Exception as e:
        import traceback
        logger.error(f"导入项目失败: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_imported_project_info(project_dir, project_config):
    """导入项目后更新项目信息文件"""
    try:
        import json
        
        # 更新 project_info.json
        info_file = project_dir / 'project_info.json'
        if info_file.exists():
            with open(info_file, 'r', encoding='utf-8') as f:
                info = json.load(f)
        else:
            info = {}
        
        info.update({
            'id': project_config['id'],
            'name': project_config['name'],
            'updated_time': project_config['updated_time']
        })
        
        with open(info_file, 'w', encoding='utf-8') as f:
            json.dump(info, f, ensure_ascii=False, indent=2)
        
        # 更新 project_config.json
        config_file = project_dir / 'project_config.json'
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(project_config, f, ensure_ascii=False, indent=2)
            
    except Exception as e:
        logger.error(f"更新项目信息失败: {e}")


def ensure_project_index(doc_manager, project_id, project_name, project_config):
    """确保项目在索引中存在（JSON + 数据库双写）"""
    try:
        import json
        from app.utils.json_file_manager import json_file_manager, get_file_lock

        # ── 1. 写入数据库（主存储）──
        if hasattr(doc_manager, 'projects') and doc_manager.projects and hasattr(doc_manager.projects, '_db') and doc_manager.projects._db:
            db = doc_manager.projects._db
            created_time = project_config.get('created_time', '')
            description = project_config.get('description', '')
            try:
                db.create_project(project_id, project_name, created_time=created_time, description=description)
                logger.info(f"[索引] 数据库项目条目已更新: {project_id} -> {project_name}")
            except Exception as db_err:
                logger.error(f"[索引] 数据库写入失败: {db_err}")

        # ── 2. 写入 JSON 文件（备份）──
        index_file = doc_manager.config.projects_base_folder / 'projects_index.json'
        logger.info(f"[索引] 更新项目索引: {index_file}")
        
        # 确保目录存在
        index_file.parent.mkdir(parents=True, exist_ok=True)
        
        # 获取文件锁
        with get_file_lock(str(index_file)):
            # 读取现有索引数据
            index_data = json_file_manager.read_json(str(index_file)) or {}
            
            # 准备保存数据（与 ProjectManager._save_projects_index 完全一致）
            save_data = {
                'updated_time': datetime.now().isoformat()
            }
            
            # 确定项目存储的位置
            projects_dict = {}
            
            if index_data:
                # 检查是否为新格式
                if isinstance(index_data, dict) and 'projects' in index_data:
                    # 新格式：使用 projects 子字典
                    projects_dict = index_data.get('projects', {})
                    logger.info(f"[索引] 读取新格式索引，包含 {len(projects_dict)} 个项目")
                else:
                    # 旧格式：过滤掉非项目键
                    projects_dict = {
                        k: v for k, v in index_data.items() 
                        if isinstance(v, dict) and 'id' in v and k != 'deleted_projects'
                    }
                    logger.info(f"[索引] 读取旧格式索引，包含 {len(projects_dict)} 个项目")
            else:
                logger.info(f"[索引] 索引文件不存在或为空，创建新索引")
            
            # 移除旧的同ID项目（如果有）
            if project_id in projects_dict:
                del projects_dict[project_id]
                logger.info(f"[索引] 移除旧项目条目: {project_id}")
            
            # 添加/更新项目条目（以项目ID为键）
            projects_dict[project_id] = {
                'id': project_id,
                'name': project_name,
                'description': project_config.get('description', ''),
                'created_time': project_config.get('created_time', ''),
                'updated_time': project_config.get('updated_time', '')
            }
            logger.info(f"[索引] 添加项目条目: {project_id} -> {project_name}")
            
            # 添加项目数据到保存数据
            save_data.update(projects_dict)
            
            # 确保有 deleted_projects 字段
            if 'deleted_projects' in index_data:
                save_data['deleted_projects'] = index_data.get('deleted_projects', {})
            else:
                save_data['deleted_projects'] = {}
            
            # 使用 json_file_manager 写入文件，确保路径和编码处理一致
            success = json_file_manager.write_json(str(index_file), save_data)
            if success:
                logger.info(f"[索引] 索引文件已更新: {index_file}")
                logger.info(f"[索引] 保存的项目数量: {len(projects_dict)}")
            else:
                logger.error(f"[索引] 索引文件更新失败: {index_file}")
            
    except Exception as e:
        logger.error(f"[索引] 更新项目索引失败: {e}")
        import traceback
        logger.error(traceback.format_exc())


# ======================== 预览导入包 - 分片上传支持 ========================

# 分片临时目录
PREVIEW_CHUNK_TEMP = Path('uploads/temp_chunks')


def preview_package_chunk():
    """
    接收预览导入ZIP包的分片
    每个分片单独保存，最后由 preview_package_merge 合并并解压预览
    """
    try:
        file = request.files.get('chunk')
        chunk_index = request.form.get('chunkIndex', type=int)
        total_chunks = request.form.get('totalChunks', type=int)
        file_name = request.form.get('filename')
        file_id = request.form.get('fileId')

        if file is None or chunk_index is None or total_chunks is None or not file_name or not file_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400

        temp_dir = PREVIEW_CHUNK_TEMP / f'preview_{file_id}'
        temp_dir.mkdir(parents=True, exist_ok=True)
        chunk_path = temp_dir / f'chunk_{chunk_index}'
        file.save(str(chunk_path))

        logger.info(f"[预览分片] 保存分片 {chunk_index + 1}/{total_chunks}: {chunk_path}")
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{total_chunks} 上传成功'
        })

    except Exception as e:
        logger.error(f"[预览分片] 接收分片失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


def preview_package_merge():
    """
    合并预览导入ZIP包的所有分片，然后执行解压预览
    相当于原来的 preview_import_package，但输入来自已上传的分片而非一次性上传
    """
    try:
        data = request.get_json()
        file_name = data.get('filename')
        file_id = data.get('fileId')

        if not file_name or not file_id:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400

        # 合并分片
        temp_dir = PREVIEW_CHUNK_TEMP / f'preview_{file_id}'
        if not temp_dir.exists():
            return jsonify({'status': 'error', 'message': '分片目录不存在，请重新上传'}), 400

        chunk_files = sorted(
            [(int(f.name.split('_')[1]), f) for f in temp_dir.iterdir() if f.name.startswith('chunk_')],
            key=lambda x: x[0]
        )
        if not chunk_files:
            return jsonify({'status': 'error', 'message': '找不到已上传的分片'}), 400

        # 获取 upload_folder
        doc_manager = get_doc_manager()
        if hasattr(doc_manager, 'config') and doc_manager.config and hasattr(doc_manager.config, 'upload_folder'):
            upload_folder = doc_manager.config.upload_folder
        elif hasattr(doc_manager, 'folders') and doc_manager.folders and hasattr(doc_manager.folders, 'upload_folder'):
            upload_folder = doc_manager.folders.upload_folder
        else:
            upload_folder = Path('uploads')

        # 保存合并后的 ZIP
        temp_zip_path = upload_folder / 'temp' / f'preview_{file_id}.zip'
        temp_zip_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"[预览合并] 合并 {len(chunk_files)} 个分片到: {temp_zip_path}")
        with open(str(temp_zip_path), 'wb') as out_f:
            for _, chunk_file in chunk_files:
                with open(str(chunk_file), 'rb') as in_f:
                    while True:
                        buf = in_f.read(8192)
                        if not buf:
                            break
                        out_f.write(buf)

        # 清理分片临时目录
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        logger.info(f"[预览合并] 合并完成，大小: {temp_zip_path.stat().st_size} bytes")

        # ---- 以下逻辑与 preview_import_package 一致 ----
        extract_dir = upload_folder / 'temp' / f'preview_{file_id}'
        extract_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"[预览合并] 解压到: {extract_dir}")

        try:
            with zipfile.ZipFile(str(temp_zip_path), 'r') as zf:
                zf.extractall(str(extract_dir))
            logger.info(f"[预览合并] 解压成功")
        except zipfile.BadZipFile:
            shutil.rmtree(str(extract_dir), ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': '无效的ZIP文件，请检查备份包是否完整'}), 400
        except Exception as e:
            shutil.rmtree(str(extract_dir), ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': f'解压ZIP文件失败: {str(e)}'}), 400

        # 查找项目配置文件（支持单用户版备份格式：配置在子目录中）
        project_config_file = None
        project_info_file = None
        for json_file in extract_dir.rglob('*.json'):
            if json_file.name == 'project_config.json':
                project_config_file = json_file
                break
            elif json_file.name == 'project_info.json' and project_info_file is None:
                project_info_file = json_file

        config_file = project_config_file or project_info_file
        if not config_file:
            shutil.rmtree(str(extract_dir), ignore_errors=True)
            temp_zip_path.unlink(missing_ok=True)
            return jsonify({'status': 'error', 'message': 'ZIP包中找不到项目配置文件，请确认备份包格式'}), 400

        with open(str(config_file), 'r', encoding='utf-8') as f:
            project_config = json.load(f)

        project_name = project_config.get('name', '未知项目')
        project_id = project_config.get('id', '')

        # ── 读取 cycles 和 documents 数量（与 preview_import_package 保持一致）──
        project_folder = config_file.parent
        requirements_file = project_folder / 'requirements.json'
        if not requirements_file.exists():
            requirements_file = project_folder / 'config' / 'requirements.json'
        doc_index_file = project_folder / 'data' / 'documents_index.json'
        if not doc_index_file.exists():
            doc_index_file = project_folder / 'documents_index.json'

        cycle_count = 0
        doc_count = 0

        # 从 requirements.json 读取 cycles
        if requirements_file.exists():
            try:
                with open(requirements_file, 'r', encoding='utf-8') as f:
                    req_data = json.load(f)
                cycle_count = len(req_data.get('cycles', []))
            except Exception:
                pass

        # 从 documents_index.json 读取文档数量
        if doc_index_file.exists():
            try:
                with open(doc_index_file, 'r', encoding='utf-8') as f:
                    doc_index = json.load(f)
                doc_count = len(doc_index.get('documents', {}))
            except Exception:
                pass

        existing_project = None
        if project_name:
            projects = doc_manager.get_projects_list()
            for p in projects:
                if p.get('name') == project_name:
                    existing_project = p
                    break

        temp_zip_path.unlink(missing_ok=True)  # 清理 ZIP，保留解压目录

        result = {
            'status': 'success',
            'temp_id': file_id,
            'project_info': {
                'name': project_name,
                'id': project_id,
                'doc_count': doc_count,
                'cycle_count': cycle_count
            },
            'conflict': {
                'has_conflict': existing_project is not None,
                'existing_project': existing_project,
                'message': f'项目"{project_name}"已存在' if existing_project else None
            }
        }
        return jsonify(result)

    except Exception as e:
        import traceback
        logger.error(f"[预览合并] 合并预览失败: {e}")
        logger.error(traceback.format_exc())
        return jsonify({'status': 'error', 'message': str(e)}), 500
