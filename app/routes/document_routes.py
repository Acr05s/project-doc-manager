"""文档管理相关路由"""

from flask import Blueprint, request, jsonify, send_file, make_response
import zipfile
import io
from pathlib import Path
from app.utils.document_manager import DocumentManager

document_bp = Blueprint('document', __name__)
doc_manager = None

def init_doc_manager(manager):
    """初始化文档管理器"""
    global doc_manager
    doc_manager = manager

@document_bp.route('/upload', methods=['POST'])
def upload_document():
    """上传文档"""
    try:
        file = request.files.get('file')
        cycle = request.form.get('cycle')
        doc_name = request.form.get('doc_name')
        doc_date = request.form.get('doc_date')
        sign_date = request.form.get('sign_date')
        signer = request.form.get('signer')
        no_signature = request.form.get('no_signature', 'false').lower() == 'true'
        has_seal = request.form.get('has_seal', 'false').lower() == 'true'
        party_a_seal = request.form.get('party_a_seal', 'false').lower() == 'true'
        party_b_seal = request.form.get('party_b_seal', 'false').lower() == 'true'
        no_seal = request.form.get('no_seal', 'false').lower() == 'true'
        other_seal = request.form.get('other_seal', '')
        project_id = request.form.get('project_id', None)
        
        if not all([file, cycle, doc_name]):
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.upload_document(
            file, cycle, doc_name,
            doc_date, sign_date, signer, no_signature,
            has_seal, party_a_seal, party_b_seal, no_seal, other_seal,
            project_id
        )
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/list', methods=['GET'])
def list_documents():
    """获取文档列表"""
    try:
        cycle = request.args.get('cycle')
        doc_name = request.args.get('doc_name')
        
        docs = doc_manager.get_documents(cycle, doc_name)
        
        return jsonify({
            'status': 'success',
            'data': docs,
            'total': len(docs)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>', methods=['GET'])
def get_document(doc_id):
    """获取单个文档信息"""
    try:
        # doc_id 可能包含 URL 编码的字符
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        if doc_id in doc_manager.documents_db:
            metadata = doc_manager.documents_db[doc_id]
            return jsonify({
                'status': 'success',
                'data': metadata
            })
        else:
            return jsonify({'status': 'error', 'message': '文档不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/preview/<doc_id>', methods=['GET'])
def preview_document(doc_id):
    """预览文档（返回JSON格式的预览内容）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        result = doc_manager.get_document_preview(doc_id)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500

@document_bp.route('/view/<doc_id>', methods=['GET'])
def view_document(doc_id):
    """直接查看文档（用于PDF、图片等可直接在浏览器显示的文件）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        if doc_id not in doc_manager.documents_db:
            return "文档不存在", 404
        
        metadata = doc_manager.documents_db[doc_id]
        file_path = metadata.get('file_path')
        
        if not file_path or not Path(file_path).exists():
            return "文件不存在", 404
        
        file_ext = Path(file_path).suffix.lower()
        
        mime_types = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp'
        }
        
        content_type = mime_types.get(file_ext, 'application/octet-stream')
        
        return send_file(file_path, mimetype=content_type)
    except Exception as e:
        return f"查看失败: {str(e)}", 500

@document_bp.route('/download/<doc_id>', methods=['GET'])
def download_document(doc_id):
    """下载文档"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        if doc_id not in doc_manager.documents_db:
            return "文档不存在", 404
        
        metadata = doc_manager.documents_db[doc_id]
        file_path = metadata.get('file_path')
        filename = metadata.get('filename', 'document')
        
        if not file_path or not Path(file_path).exists():
            return "文件不存在", 404
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return f"下载失败: {str(e)}", 500

@document_bp.route('/progress', methods=['GET'])
def get_cycle_progress():
    """获取周期文档完成进度"""
    try:
        cycle = request.args.get('cycle')
        project_id = request.args.get('project_id')
        
        if not cycle:
            return jsonify({'status': 'error', 'message': '缺少cycle参数'}), 400
        
        # 获取项目配置
        if project_id:
            project = doc_manager.load_project(project_id)
            project_config = project.get('project', {}) if project else {}
        else:
            project_config = doc_manager.current_project or {}
        
        # 获取该周期的需求文档数
        docs_info = project_config.get('documents', {}).get(cycle, {})
        required_docs = docs_info.get('required_docs', [])
        total_required = len(required_docs)
        
        # 获取已上传的文档
        all_docs = doc_manager.get_documents(cycle)
        
        # 已上传文档数（每个文档类型只算1个）
        doc_names = set()
        signer_count = 0
        seal_count = 0
        completed_count = 0  # 完成的文档数
        
        # 如果没有需求文档，直接按已上传文档计算进度
        if total_required == 0:
            for doc in all_docs:
                doc_name = doc.get('doc_name')
                if doc_name:
                    doc_names.add(doc_name)
            total_required = len(doc_names) or 1  # 避免除以0
            completed_count = len(doc_names)
            signer_count = completed_count
            seal_count = completed_count
        else:
            # 按文档名分组已上传的文档
            docs_by_name = {}
            for doc in all_docs:
                doc_name = doc.get('doc_name')
                if doc_name not in docs_by_name:
                    docs_by_name[doc_name] = []
                docs_by_name[doc_name].append(doc)
            
            # 检查每个需求文档的完成状态
            for req_doc in required_docs:
                doc_name = req_doc.get('name', '')
                requirement = req_doc.get('requirement', '').strip()
                has_no_requirement = not requirement
                
                # 更详细的要求识别
                require_signer = '签名' in requirement or '签字' in requirement
                require_seal = '盖章' in requirement or '章' in requirement
                require_party_a_signer = '甲方' in requirement and ('签名' in requirement or '签字' in requirement)
                require_party_b_signer = '乙方' in requirement and ('签名' in requirement or '签字' in requirement)
                require_party_a_seal = '甲方' in requirement and ('盖章' in requirement or '章' in requirement)
                require_party_b_seal = '乙方' in requirement and ('盖章' in requirement or '章' in requirement)
                require_owner_signer = '业主' in requirement and ('签名' in requirement or '签字' in requirement)
                
                uploaded_docs = docs_by_name.get(doc_name, [])
                
                if len(uploaded_docs) > 0:
                    doc_names.add(doc_name)
                    
                    # 无要求时，上传文档就算完成
                    if has_no_requirement:
                        completed_count += 1
                    else:
                        # 有要求时，检查签名和盖章
                        has_signer = any(d.get('signer') for d in uploaded_docs)
                        has_party_a_seal = any(d.get('party_a_seal') for d in uploaded_docs)
                        has_party_b_seal = any(d.get('party_b_seal') for d in uploaded_docs)
                        has_seal = any(d.get('has_seal_marked') or d.get('has_seal') or d.get('party_a_seal') or d.get('party_b_seal') for d in uploaded_docs)
                        
                        # 检查是否满足所有要求
                        all_requirements_met = False
                        
                        # 计算满足的要求数量
                        total_requirements = 0
                        met_requirements = 0
                        
                        if require_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_seal:
                            total_requirements += 1
                            if has_seal:
                                met_requirements += 1
                        if require_party_a_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_party_b_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_owner_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_party_a_seal:
                            total_requirements += 1
                            if has_party_a_seal:
                                met_requirements += 1
                        if require_party_b_seal:
                            total_requirements += 1
                            if has_party_b_seal:
                                met_requirements += 1
                        
                        # 判断是否满足所有要求
                        if has_no_requirement:
                            # 无要求，有文档就算完成
                            all_requirements_met = True
                        elif total_requirements > 0:
                            # 有具体要求，需要满足所有要求
                            all_requirements_met = (met_requirements == total_requirements)
                        else:
                            # 有要求但未识别出具体类型，默认只要有文档就算完成
                            # 与前端逻辑保持一致
                            all_requirements_met = True
                        
                        if all_requirements_met:
                            completed_count += 1
                        
                        # 统计满足要求的文档
                        if not require_signer or has_signer:
                            signer_count += 1
                        if not require_seal or has_seal:
                            seal_count += 1
        
        doc_count = len(doc_names)
        
        return jsonify({
            'status': 'success',
            'doc_count': doc_count,
            'signer_count': signer_count,
            'seal_count': seal_count,
            'total_required': total_required,
            'completed_count': completed_count
        })
        
    except Exception as e:
        import traceback
        logger.error(f"获取周期进度失败: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """删除文档"""
    try:
        result = doc_manager.delete_document(doc_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/batch-update', methods=['POST'])
def batch_update_documents():
    """批量更新文档属性"""
    try:
        data = request.json
        doc_ids = data.get('doc_ids', [])
        action = data.get('action')
        
        if not doc_ids or not action:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.batch_update_documents(doc_ids, action)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/batch-delete', methods=['POST'])
def batch_delete_documents():
    """批量删除文档"""
    try:
        data = request.json
        doc_ids = data.get('doc_ids', [])
        
        if not doc_ids:
            return jsonify({'status': 'error', 'message': '缺少文档ID列表'}), 400
        
        result = doc_manager.batch_delete_documents(doc_ids)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/categories', methods=['GET'])
def get_categories():
    """获取分类列表"""
    try:
        cycle = request.args.get('cycle')
        doc_name = request.args.get('doc_name')
        
        if not cycle or not doc_name:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        categories = doc_manager.get_categories(cycle, doc_name)
        return jsonify({
            'status': 'success',
            'data': categories
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/category', methods=['POST'])
def create_category():
    """创建分类"""
    try:
        data = request.json
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category')
        
        if not cycle or not doc_name or not category:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.create_category(cycle, doc_name, category)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/category', methods=['DELETE'])
def delete_category():
    """删除分类"""
    try:
        data = request.json
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category')
        
        if not cycle or not doc_name or not category:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        result = doc_manager.delete_category(cycle, doc_name, category)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>', methods=['PUT'])
def update_doc(doc_id):
    """更新文档元数据"""
    try:
        data = request.get_json()
        result = doc_manager.update_document(doc_id, data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>/replace', methods=['POST'])
def replace_doc(doc_id):
    """替换文档（覆盖上传）"""
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        new_data = {
            'doc_date': request.form.get('doc_date'),
            'sign_date': request.form.get('sign_date'),
            'signer': request.form.get('signer'),
            'no_signature': request.form.get('no_signature', 'false').lower() == 'true',
            'has_seal_marked': request.form.get('has_seal', 'false').lower() == 'true',
            'party_a_seal': request.form.get('party_a_seal', 'false').lower() == 'true',
            'party_b_seal': request.form.get('party_b_seal', 'false').lower() == 'true',
            'no_seal': request.form.get('no_seal', 'false').lower() == 'true',
            'other_seal': request.form.get('other_seal', '')
        }
        
        result = doc_manager.replace_document(doc_id, file, new_data)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/zip-upload', methods=['POST'])
def upload_zip():
    """上传压缩包并自动匹配文档"""
    try:
        from pathlib import Path
        from datetime import datetime
        
        # 优先检查是否有已上传的文件路径（分片上传场景）
        uploaded_file_path = request.form.get('uploaded_file_path')

        if uploaded_file_path:
            # 使用已上传的文件
            temp_zip = Path(uploaded_file_path)
            file = None
        else:
            # 普通上传
            file = request.files.get('file')
            if not file:
                return jsonify({'status': 'error', 'message': '未选择文件'}), 400

            # 检查是否为ZIP文件
            if not file.filename.lower().endswith('.zip'):
                return jsonify({'status': 'error', 'message': '请上传ZIP格式的压缩包'}), 400

            # 保存临时ZIP文件
            temp_zip = doc_manager.upload_folder / 'temp' / f'{datetime.now().strftime("%Y%m%d%H%M%S")}_{file.filename}'
            temp_zip.parent.mkdir(parents=True, exist_ok=True)
            file.save(str(temp_zip))

        if not temp_zip.exists():
            return jsonify({'status': 'error', 'message': 'ZIP文件不存在'}), 400

        # 获取项目配置
        project_config = request.form.get('project_config')
        if project_config:
            import json as json_module
            project_config = json_module.loads(project_config)

        # 解压并匹配
        result = doc_manager.extract_zipfile(str(temp_zip), project_config or {})

        # 不删除临时ZIP，保留以便后续导入使用

        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/list-zip-packages', methods=['GET'])
def list_zip_packages():
    """列出所有已解压的ZIP包（temp_extract下的一级子目录）"""
    try:
        from pathlib import Path
        temp_extract_dir = doc_manager.upload_folder / 'temp_extract'
        if not temp_extract_dir.exists():
            return jsonify({'status': 'success', 'packages': []})

        packages = []
        for item in sorted(temp_extract_dir.iterdir()):
            if item.is_dir() and not item.name.startswith('.'):
                # 统计文件数量
                ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                                '.png', '.jpg', '.jpeg', '.tiff', '.txt',
                                '.ppt', '.pptx'}
                file_count = sum(
                    1 for f in item.rglob('*')
                    if f.is_file() and not f.name.startswith('.')
                    and f.suffix.lower() in ALLOWED_EXTS
                )
                packages.append({
                    'name': item.name,
                    'path': str(item),
                    'file_count': file_count
                })

        return jsonify({'status': 'success', 'packages': packages})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/search-zip-files', methods=['GET'])
def search_zip_files():
    """搜索已解压的ZIP包中的文件，支持文件名模糊搜索和指定ZIP包"""
    try:
        from pathlib import Path
        keyword = request.args.get('keyword', '').strip().lower()
        package_path = request.args.get('package_path', '').strip()  # 指定ZIP包路径
        temp_extract_dir = doc_manager.upload_folder / 'temp_extract'

        if not temp_extract_dir.exists():
            return jsonify({'status': 'success', 'files': [], 'message': '暂无已上传的ZIP文件，请先批量导入ZIP'})

        # 支持的文档格式
        ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls',
                        '.png', '.jpg', '.jpeg', '.tiff', '.txt', '.ppt', '.pptx'}

        # 确定搜索根目录
        if package_path:
            search_root = Path(package_path)
            # 安全检查：必须在 temp_extract_dir 下
            try:
                search_root.relative_to(temp_extract_dir)
            except ValueError:
                return jsonify({'status': 'error', 'message': '非法路径'}), 400
            if not search_root.exists():
                return jsonify({'status': 'error', 'message': '指定的ZIP包目录不存在'}), 404
        else:
            search_root = temp_extract_dir

        results = []
        for file_path in sorted(search_root.rglob('*')):
            if not file_path.is_file():
                continue
            if file_path.name.startswith('.'):
                continue
            if file_path.suffix.lower() not in ALLOWED_EXTS:
                continue
            # 关键词过滤（空关键词返回全部）
            if keyword and keyword not in file_path.name.lower():
                continue

            try:
                rel_path = file_path.relative_to(temp_extract_dir)
            except ValueError:
                rel_path = file_path.name

            # 检查该文件是否已被归档（通过 original_filename 匹配）
            is_archived = any(
                meta.get('original_filename') == file_path.name or
                meta.get('source_path') == str(file_path)
                for meta in doc_manager.documents_db.values()
            )

            results.append({
                'name': file_path.name,
                'path': str(file_path),
                'rel_path': str(rel_path),
                'size': file_path.stat().st_size,
                'ext': file_path.suffix.lower(),
                'archived': is_archived
            })

            if len(results) >= 300:
                break

        return jsonify({'status': 'success', 'files': results, 'total': len(results)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/delete-zip-package', methods=['POST'])
def delete_zip_package():
    """删除指定的ZIP包及其解压内容"""
    try:
        from pathlib import Path
        import shutil
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400

        package_path = data.get('package_path')
        if not package_path:
            return jsonify({'status': 'error', 'message': '缺少package_path参数'}), 400

        package_dir = Path(package_path)
        temp_extract_dir = doc_manager.upload_folder / 'temp_extract'

        # 安全检查：必须在 temp_extract_dir 下
        try:
            package_dir.relative_to(temp_extract_dir)
        except ValueError:
            return jsonify({'status': 'error', 'message': '非法路径'}), 400

        if not package_dir.exists():
            return jsonify({'status': 'error', 'message': 'ZIP包目录不存在'}), 404

        # 删除ZIP包目录
        shutil.rmtree(package_dir)

        return jsonify({'status': 'success', 'message': 'ZIP包删除成功'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/archive-from-zip', methods=['POST'])
def archive_from_zip():
    """从已解压的ZIP包中直接归档指定文件"""
    try:
        from pathlib import Path
        import shutil
        from datetime import datetime
        
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400

        source_path = data.get('source_path')
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        doc_date = data.get('doc_date', '')
        sign_date = data.get('sign_date', '')
        signer = data.get('signer', '')
        no_signature = data.get('no_signature', False)
        has_seal = data.get('has_seal', False)
        party_a_seal = data.get('party_a_seal', False)
        party_b_seal = data.get('party_b_seal', False)
        no_seal = data.get('no_seal', False)
        other_seal = data.get('other_seal', '')
        project_id = data.get('project_id')

        if not all([source_path, cycle, doc_name]):
            return jsonify({'status': 'error', 'message': '参数不完整：需要source_path、cycle、doc_name'}), 400

        source_file = Path(source_path)
        if not source_file.exists():
            return jsonify({'status': 'error', 'message': f'源文件不存在: {source_path}'}), 404

        # 构建目标目录（与普通上传保持一致）
        cycle_folder = doc_manager.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
        cycle_folder.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_ext = source_file.suffix
        new_filename = f"{signer or 'zip'}_{timestamp}{file_ext}"
        dest_path = cycle_folder / new_filename

        shutil.copy2(str(source_file), str(dest_path))

        # 检测签字和盖章（图片文件）
        detected_signature = False
        detected_seal = False
        if file_ext.lower() in ['.png', '.jpg', '.jpeg', '.tiff']:
            detected_signature, _ = doc_manager.detect_signature(str(dest_path))
            detected_seal, _ = doc_manager.detect_seal(str(dest_path))

        # 保存文档元数据
        metadata = {
            'cycle': cycle,
            'doc_name': doc_name,
            'filename': new_filename,
            'original_filename': source_file.name,
            'file_path': str(dest_path),
            'doc_date': doc_date,
            'sign_date': sign_date,
            'signer': signer,
            'no_signature': no_signature,
            'has_seal_marked': has_seal,
            'party_a_seal': party_a_seal,
            'party_b_seal': party_b_seal,
            'no_seal': no_seal,
            'other_seal': other_seal,
            'upload_time': datetime.now().isoformat(),
            'source': 'zip',
            'detected_signature': detected_signature,
            'sign_confidence': 0.0,
            'detected_seal': detected_seal,
            'seal_confidence': 0.0,
            'file_size': dest_path.stat().st_size
        }

        doc_id = f"{cycle}_{doc_name}_{timestamp}"
        doc_manager.documents_db[doc_id] = metadata

        # ===== 保存到项目配置 =====
        # 确保 documents[cycle][doc_name].uploaded_docs 存在
        if project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result['status'] == 'success':
                project_config = project_result['project']
                if 'documents' not in project_config:
                    project_config['documents'] = {}
                if cycle not in project_config['documents']:
                    project_config['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
                if 'uploaded_docs' not in project_config['documents'][cycle]:
                    project_config['documents'][cycle]['uploaded_docs'] = []
                
                # 添加到 uploaded_docs
                project_config['documents'][cycle]['uploaded_docs'].append({
                    'doc_name': doc_name,
                    'filename': new_filename,
                    'original_filename': source_file.name,
                    'file_path': str(dest_path),
                    'doc_date': doc_date,
                    'sign_date': sign_date,
                    'signer': signer,
                    'has_seal': has_seal or detected_seal,
                    'upload_time': datetime.now().isoformat(),
                    'source': 'zip',
                    'doc_id': doc_id
                })
                
                # 保存项目配置
                doc_manager._save_project(project_id, project_config)

        doc_manager.log_operation('从ZIP归档文档', f'{cycle}/{doc_name} <- {source_file.name}',
                                   project=project_id)
        return jsonify({'status': 'success', 'message': '文档归档成功', 'doc_id': doc_id, 'metadata': metadata})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/pending-files', methods=['GET'])
def get_pending_files():
    """获取当前项目的待确认文件列表"""
    try:
        project_id = request.args.get('project_id', '')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        pending_list = doc_manager.pending_files.get(project_id, [])
        return jsonify({
            'status': 'success',
            'pending_files': pending_list,
            'count': len(pending_list)
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/confirm-pending', methods=['POST'])
def confirm_pending_files():
    """确认并归档待确认的文件"""
    try:
        from pathlib import Path
        import shutil
        from datetime import datetime
        
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400
        
        project_id = data.get('project_id')
        file_ids = data.get('file_ids', [])  # 要确认的文件索引列表
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        pending_list = doc_manager.pending_files.get(project_id, [])
        
        # 确认的文件
        confirmed_files = []
        for idx in file_ids:
            if 0 <= idx < len(pending_list):
                file_info = pending_list[idx]
                
                # 调用归档逻辑
                source_path = file_info.get('source_path')
                cycle = file_info.get('cycle')
                doc_name = file_info.get('doc_name')
                filename = file_info.get('filename')
                
                if source_path and cycle and doc_name:
                    source_file = Path(source_path)
                    if source_file.exists():
                        # 复制文件到正式目录
                        cycle_folder = doc_manager.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
                        cycle_folder.mkdir(parents=True, exist_ok=True)
                        
                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                        file_ext = source_file.suffix
                        new_filename = f"zip_{timestamp}{file_ext}"
                        dest_path = cycle_folder / new_filename
                        
                        shutil.copy2(str(source_file), str(dest_path))
                        
                        # 记录到已确认文件
                        if project_id not in doc_manager.confirmed_files:
                            doc_manager.confirmed_files[project_id] = set()
                        doc_manager.confirmed_files[project_id].add((cycle, doc_name, filename))
                        
                        # 添加到项目配置
                        project_result = doc_manager.load_project(project_id)
                        if project_result['status'] == 'success':
                            project_config = project_result['project']
                            if 'documents' not in project_config:
                                project_config['documents'] = {}
                            if cycle not in project_config['documents']:
                                project_config['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
                            if 'uploaded_docs' not in project_config['documents'][cycle]:
                                project_config['documents'][cycle]['uploaded_docs'] = []
                            
                            doc_id = f"{cycle}_{doc_name}_{timestamp}"
                            project_config['documents'][cycle]['uploaded_docs'].append({
                                'doc_name': doc_name,
                                'filename': new_filename,
                                'original_filename': filename,
                                'file_path': str(dest_path),
                                'doc_date': '',
                                'sign_date': '',
                                'signer': '',
                                'has_seal': False,
                                'upload_time': datetime.now().isoformat(),
                                'source': 'zip',
                                'doc_id': doc_id
                            })
                            
                            doc_manager._save_project(project_id, project_config)
                        
                        confirmed_files.append({
                            'cycle': cycle,
                            'doc_name': doc_name,
                            'filename': filename
                        })
        
        # 从待确认列表中移除已确认的文件
        confirmed_count = len(confirmed_files)
        # 按索引倒序删除，避免索引偏移
        for idx in sorted(file_ids, reverse=True):
            if 0 <= idx < len(doc_manager.pending_files[project_id]):
                del doc_manager.pending_files[project_id][idx]
        
        return jsonify({
            'status': 'success',
            'message': f'成功确认 {confirmed_count} 个文件',
            'confirmed_files': confirmed_files
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/reject-pending', methods=['POST'])
def reject_pending_files():
    """拒绝待确认的文件（仅从待确认列表移除，不归档）"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': '没有收到数据'}), 400
        
        project_id = data.get('project_id')
        file_ids = data.get('file_ids', [])
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        rejected_count = 0
        for idx in sorted(file_ids, reverse=True):
            if 0 <= idx < len(doc_manager.pending_files.get(project_id, [])):
                del doc_manager.pending_files[project_id][idx]
                rejected_count += 1
        
        return jsonify({
            'status': 'success',
            'message': f'已拒绝 {rejected_count} 个文件',
            'rejected_count': rejected_count
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/<doc_id>/check', methods=['POST'])
def check_doc_compliance(doc_id):
    """检查文档是否符合要求"""
    try:
        data = request.get_json()
        requirement = data.get('requirement', '')
        
        result = doc_manager.check_document_compliance(doc_id, requirement)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/compliance', methods=['POST'])
def check_all_compliance():
    """检查项目异常：显示未完成的任务，用颜色区别"""
    try:
        data = request.get_json()
        project_config = data.get('project_config', {})
        
        results = {}
        
        for cycle, docs_info in project_config.get('documents', {}).items():
            results[cycle] = []
            
            for doc in docs_info.get('required_docs', []):
                doc_name = doc['name']
                requirement = doc.get('requirement', '')
                
                # 查找该文档下的所有上传文件
                docs = doc_manager.get_documents(cycle=cycle, doc_name=doc_name)
                
                cycle_doc_result = {
                    'doc_name': doc_name,
                    'requirement': requirement,
                    'uploaded_count': len(docs),
                    'status': 'not_uploaded',  # not_uploaded, partial, complete
                    'documents': []
                }
                
                if len(docs) == 0:
                    # 没有上传任何文档
                    cycle_doc_result['status'] = 'not_uploaded'
                else:
                    # 有上传文档，检查合规性
                    all_compliant = True
                    for doc_meta in docs:
                        compliance = doc_manager.check_document_compliance(
                            doc_meta['id'], requirement
                        )
                        is_compliant = compliance.get('is_compliant', False)
                        if not is_compliant:
                            all_compliant = False
                        cycle_doc_result['documents'].append({
                            'id': doc_meta['id'],
                            'filename': doc_meta.get('original_filename'),
                            'is_compliant': is_compliant,
                            'issues': compliance.get('issues', [])
                        })
                    
                    if all_compliant:
                        cycle_doc_result['status'] = 'complete'
                    else:
                        cycle_doc_result['status'] = 'partial'
                
                results[cycle].append(cycle_doc_result)
        
        return jsonify({
            'status': 'success',
            'data': results
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/init', methods=['POST'])
def init_upload():
    """初始化分片上传，返回上传ID"""
    try:
        from pathlib import Path
        import uuid
        
        data = request.get_json()
        filename = data.get('filename')
        total_chunks = data.get('total_chunks')
        file_size = data.get('file_size')
        
        if not filename or not total_chunks:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 生成唯一的上传ID
        upload_id = str(uuid.uuid4())
        
        # 创建临时分片目录
        temp_folder = Path(app.config['TEMP_FOLDER']) / upload_id if 'app' in globals() else doc_manager.upload_folder / 'temp_chunks' / upload_id
        temp_folder.mkdir(parents=True, exist_ok=True)
        
        # 存储上传元数据
        doc_manager.upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        doc_manager.upload_sessions[upload_id] = {
            'filename': filename,
            'total_chunks': total_chunks,
            'file_size': file_size,
            'uploaded_chunks': [],
            'temp_folder': str(temp_folder),
            'init_time': datetime.now().isoformat()
        }
        
        return jsonify({
            'status': 'success',
            'upload_id': upload_id,
            'message': '上传会话已创建'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/chunk', methods=['POST'])
def upload_chunk():
    """上传单个分片"""
    try:
        from pathlib import Path
        
        upload_id = request.form.get('upload_id')
        chunk_index = int(request.form.get('chunk_index', 0))
        file = request.files.get('file')
        
        if not upload_id or not file:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        # 检查上传会话是否存在
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id not in upload_sessions:
            return jsonify({'status': 'error', 'message': '上传会话不存在或已过期'}), 400
        
        session = upload_sessions[upload_id]
        temp_folder = Path(session['temp_folder'])
        
        # 保存分片文件
        chunk_filename = f"chunk_{chunk_index:05d}"
        chunk_path = temp_folder / chunk_filename
        file.save(str(chunk_path))
        
        # 记录已上传的分片
        if chunk_index not in session['uploaded_chunks']:
            session['uploaded_chunks'].append(chunk_index)
            session['uploaded_chunks'].sort()
        
        # 计算进度
        progress = len(session['uploaded_chunks']) / session['total_chunks'] * 100
        
        return jsonify({
            'status': 'success',
            'message': f'分片 {chunk_index + 1}/{session["total_chunks"]} 上传成功',
            'chunk_index': chunk_index,
            'total_chunks': session['total_chunks'],
            'uploaded_count': len(session['uploaded_chunks']),
            'progress': round(progress, 2)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/check', methods=['GET'])
def check_upload():
    """检查已上传的分片（断点续传用）"""
    try:
        upload_id = request.args.get('upload_id')
        
        if not upload_id:
            return jsonify({'status': 'error', 'message': '缺少upload_id'}), 400
        
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id not in upload_sessions:
            return jsonify({'status': 'error', 'message': '上传会话不存在'}), 400
        
        session = upload_sessions[upload_id]
        
        return jsonify({
            'status': 'success',
            'uploaded_chunks': session['uploaded_chunks'],
            'total_chunks': session['total_chunks'],
            'filename': session['filename']
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/merge', methods=['POST'])
def merge_chunks():
    """合并所有分片，完成上传"""
    try:
        from pathlib import Path
        import shutil
        from datetime import datetime
        
        data = request.get_json()
        upload_id = data.get('upload_id')
        cycle = data.get('cycle')
        doc_name = data.get('doc_name')
        category = data.get('category', '')
        doc_date = data.get('doc_date')
        sign_date = data.get('sign_date')
        signer = data.get('signer')
        has_seal = data.get('has_seal', False)
        party_a_seal = data.get('party_a_seal', False)
        party_b_seal = data.get('party_b_seal', False)
        other_seal = data.get('other_seal', '')
        project_id = data.get('project_id', None)
        
        if not upload_id:
            return jsonify({'status': 'error', 'message': '缺少upload_id'}), 400
        
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id not in upload_sessions:
            return jsonify({'status': 'error', 'message': '上传会话不存在'}), 400
        
        session = upload_sessions[upload_id]
        temp_folder = Path(session['temp_folder'])
        
        # 检查是否所有分片都已上传
        expected_chunks = session['total_chunks']
        uploaded_chunks = len(session['uploaded_chunks'])
        
        if uploaded_chunks != expected_chunks:
            return jsonify({
                'status': 'error', 
                'message': f'分片未全部上传: {uploaded_chunks}/{expected_chunks}'
            }), 400
        
        # 合并分片
        original_filename = session['filename']
        file_ext = Path(original_filename).suffix
        
        # 创建最终文件
        final_folder = temp_folder / 'merged'
        final_folder.mkdir(parents=True, exist_ok=True)
        final_file = final_folder / f"merged_{datetime.now().strftime('%Y%m%d%H%M%S')}{file_ext}"
        
        # 按顺序合并所有分片
        with open(final_file, 'wb') as outfile:
            for i in range(expected_chunks):
                chunk_path = temp_folder / f"chunk_{i:05d}"
                if chunk_path.exists():
                    with open(chunk_path, 'rb') as infile:
                        outfile.write(infile.read())
        
        # 创建一个模拟的file对象用于upload_document
        class ChunkedFile:
            def __init__(self, path):
                self.filename = original_filename
                self._path = path
            
            def save(self, path):
                shutil.copy2(self._path, path)
        
        chunked_file = ChunkedFile(final_file)

        # 如果是临时ZIP文件（以_temp_或_blank_开头），不执行upload_document，直接返回文件路径
        if cycle == '_temp_' or doc_name.startswith('_temp_'):
            # 返回文件路径供后续处理
            return jsonify({
                'status': 'success',
                'message': '文件合并完成',
                'file_path': str(final_file),
                'filename': original_filename
            })

        # 调用现有的上传文档方法
        result = doc_manager.upload_document(
            chunked_file, cycle, doc_name,
            doc_date, sign_date, signer, False,
            has_seal, party_a_seal, party_b_seal, False, other_seal,
            project_id, category
        )

        # 清理临时文件
        if temp_folder.exists():
            shutil.rmtree(temp_folder)

        # 删除上传会话
        del upload_sessions[upload_id]

        return jsonify({
            'status': 'success',
            'message': '文件上传完成',
            'doc_id': result.get('doc_id'),
            'metadata': result.get('metadata')
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/upload/cancel', methods=['POST'])
def cancel_upload():
    """取消上传，清理临时文件"""
    try:
        from pathlib import Path
        import shutil
        
        data = request.get_json()
        upload_id = data.get('upload_id')
        
        if not upload_id:
            return jsonify({'status': 'error', 'message': '缺少upload_id'}), 400
        
        upload_sessions = getattr(doc_manager, 'upload_sessions', {})
        if upload_id in upload_sessions:
            session = upload_sessions[upload_id]
            temp_folder = Path(session.get('temp_folder'))
            
            # 清理临时文件
            if temp_folder.exists():
                shutil.rmtree(temp_folder)
            
            del upload_sessions[upload_id]
        
        return jsonify({
            'status': 'success',
            'message': '上传已取消'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@document_bp.route('/report', methods=['POST'])
def generate_report():
    """生成报告"""
    try:
        project_config = request.get_json().get('project_config')
        if not project_config:
            return jsonify({'status': 'error', 'message': '未提供项目配置'}), 400
        
        report = doc_manager.generate_report(project_config)
        
        return jsonify({
            'status': 'success',
            'data': report
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
