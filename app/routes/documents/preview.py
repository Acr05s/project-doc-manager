"""文档预览相关路由"""

import os
from flask import request, jsonify, send_file
from pathlib import Path
from .utils import get_doc_manager
from app.services.task_service import task_service

# 导入预览服务（容错处理）
try:
    from src.services.preview_service import PreviewService
except ImportError:
    PreviewService = None

try:
    from src.services.pdf_conversion_service import PDFConversionService
except ImportError:
    PDFConversionService = None

try:
    from src.services.progressive_pdf_service import ProgressivePDFService
    progressive_pdf_service = ProgressivePDFService()
except ImportError:
    progressive_pdf_service = None


def normalize_path(path_str):
    """统一路径分隔符，支持Windows和Linux"""
    if not path_str:
        return path_str
    return path_str.replace('\\', '/')


def safe_join(*parts):
    """安全的路径拼接，自动处理不同平台的路径分隔符"""
    if not parts:
        return ''
    # 过滤空值并规范化每个部分
    normalized_parts = [normalize_path(p) for p in parts if p]
    if not normalized_parts:
        return ''
    # 使用 os.path.join，它会自动处理平台相关的分隔符
    result = os.path.join(*normalized_parts)
    # 规范化结果中的分隔符
    return normalize_path(result)


def preview_document(doc_id):
    """预览文档（返回JSON格式的预览内容）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        doc_manager = get_doc_manager()
        result = doc_manager.get_document_preview(doc_id)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500


def preview_document_local(doc_id):
    """本地预览文档（使用Python库转换）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        doc_manager = get_doc_manager()
        
        # 获取分页参数
        page = request.args.get('page', 0, type=int)
        
        # 首先从 documents_db 中查找
        if doc_id in doc_manager.documents_db:
            metadata = doc_manager.documents_db[doc_id]
        else:
            # 尝试从项目配置中查找
            doc = None
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                for project_id, project_data in doc_manager.projects.projects_db.items():
                    if 'documents' in project_data:
                        for cycle, cycle_info in project_data['documents'].items():
                            if 'uploaded_docs' in cycle_info:
                                for d in cycle_info['uploaded_docs']:
                                    if d.get('doc_id') == doc_id:
                                        doc = d
                                        break
                                if doc:
                                    break
                        if doc:
                            break
            
            # 尝试从项目文件中查找
            if not doc:
                import json
                projects_dir = doc_manager.config.projects_base_folder
                for project_file in projects_dir.glob('*.json'):
                    try:
                        with open(project_file, 'r', encoding='utf-8') as f:
                            project_data = json.load(f)
                        if 'documents' in project_data:
                            for cycle, cycle_info in project_data['documents'].items():
                                if 'uploaded_docs' in cycle_info:
                                    for d in cycle_info['uploaded_docs']:
                                        if d.get('doc_id') == doc_id:
                                            doc = d
                                            break
                                    if doc:
                                        break
                            if doc:
                                break
                    except Exception as e:
                        pass
            
            if not doc:
                return jsonify({'status': 'error', 'message': '文档不存在'}), 404
            
            metadata = doc
        
        file_path = metadata.get('file_path')
        print(f"[preview] file_path from metadata: {file_path}")
        
        # 使用通用工具函数规范化路径
        normalized_path = normalize_path(file_path)
        file_path_obj = Path(normalized_path)
        print(f"[preview] is_absolute: {file_path_obj.is_absolute()}")
        print(f"[preview] original file_path: {file_path}")
        print(f"[preview] normalized_path: {normalized_path}")
        
        if not file_path_obj.is_absolute():
            # 处理新的完整相对路径格式：projects/{项目名}/uploads/...
            if normalized_path.startswith('projects/'):
                # 从 projects_base_folder 的父目录开始拼接
                base_dir = doc_manager.config.projects_base_folder.parent
                # 使用safe_join构建路径，自动处理跨平台分隔符
                path_parts = normalized_path.split('/')
                file_path_obj = Path(safe_join(str(base_dir), *path_parts))
                print(f"[preview] projects format path: {file_path_obj}")
            else:
                # 旧格式：相对于项目的uploads目录
                project_name = metadata.get('project_name')
                if not project_name and hasattr(doc_manager, 'current_project') and doc_manager.current_project:
                    project_name = doc_manager.current_project.get('name')
                
                if project_name:
                    project_uploads_dir = doc_manager.get_documents_folder(project_name)
                    file_path_obj = Path(safe_join(str(project_uploads_dir), normalized_path))
                    print(f"[preview] project uploads path: {file_path_obj}")
                else:
                    # 如果没有项目名称，尝试使用绝对路径
                    if hasattr(doc_manager, 'config') and hasattr(doc_manager.config, 'upload_folder'):
                        upload_folder = doc_manager.config.upload_folder
                    else:
                        upload_folder = Path('uploads')
                    file_path_obj = Path(safe_join(str(upload_folder), normalized_path))
                    print(f"[preview] uploads path: {file_path_obj}")
        
        print(f"[preview] final file_path_obj: {file_path_obj}")
        print(f"[preview] file exists: {file_path_obj.exists()}")
        
        if not file_path or not file_path_obj.exists():
            return jsonify({'status': 'error', 'message': '文件不存在'}), 404
        
        # 使用PreviewService生成预览
        preview_service = PreviewService()
        html_content = preview_service.get_full_preview(str(file_path_obj), page)
        
        return html_content
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500


def view_document(doc_id):
    """直接查看文档（用于PDF、图片等可直接在浏览器显示的文件）"""
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        doc_manager = get_doc_manager()
        
        # 获取文档元数据
        metadata = _get_document_metadata(doc_manager, doc_id)
        if not metadata:
            return jsonify({'status': 'error', 'message': '文档不存在'}), 404
        
        # 解析文件路径
        file_path_obj = _resolve_file_path(doc_manager, metadata)
        if not file_path_obj or not file_path_obj.exists():
            print(f"[view_document] 文件不存在: {file_path_obj}")
            return jsonify({'status': 'error', 'message': '文件不存在'}), 404
        
        file_ext = file_path_obj.suffix.lower()
        file_path = str(file_path_obj)
        
        print(f"[view_document] 处理文件: {file_path}, 扩展名: {file_ext}")
        
        # 检查是否为PDF文件，直接返回
        if file_ext == '.pdf':
            return send_file(file_path, mimetype='application/pdf', 
                           as_attachment=False, 
                           download_name=f"{file_path_obj.stem}.pdf")
        
        # 检查是否为图片文件，直接返回
        image_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
        if file_ext in image_extensions:
            mime_types = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.bmp': 'image/bmp'
            }
            content_type = mime_types.get(file_ext, 'application/octet-stream')
            return send_file(file_path, mimetype=content_type)
        
        # 检查是否为Office文档
        office_extensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
        if file_ext in office_extensions:
            # 先检查是否已有转换缓存（PDF已存在）
            task_id = request.args.get('task_id')
            if task_id:
                task_status = task_service.get_task_status(task_id)
                if task_status:
                    if task_status['status'] == 'completed':
                        pdf_path = task_status['result']['pdf_path']
                        print(f"[view_document] 使用后台转换结果: {pdf_path}")
                        return send_file(pdf_path, mimetype='application/pdf',
                                       as_attachment=False,
                                       download_name=f"{file_path_obj.stem}.pdf")
                    elif task_status['status'] == 'error':
                        print(f"[view_document] 后台转换失败，使用在线预览降级")
                        # 降级为在线预览
                        return _office_online_viewer_response(file_path_obj, file_ext)
                    else:
                        # 转换中，返回等待页面
                        return (f"<html><body><h1>PDF转换中...</h1>"
                                f"<p>请稍候，正在转换文档为PDF格式。</p>"
                                f"<script>setTimeout(() => window.location.reload(), 2000);</script>"
                                f"</body></html>"), 200
            
            # 尝试检查是否有现有转换记录（避免重复启动任务）
            from src.services.pdf_conversion_service import pdf_conversion_record
            existing_record = pdf_conversion_record.get_record(doc_id)
            if existing_record and os.path.exists(existing_record['pdf_path']):
                print(f"[view_document] 使用已有PDF缓存: {existing_record['pdf_path']}")
                return send_file(existing_record['pdf_path'], mimetype='application/pdf',
                               as_attachment=False,
                               download_name=f"{file_path_obj.stem}.pdf")
            
            # 检查转换服务是否可用（LibreOffice/COM）
            conversion_available = _check_conversion_available(file_ext)
            if conversion_available:
                # 启动后台转换任务
                task_result = task_service.start_pdf_conversion_task(file_path, doc_id)
                task_id = task_result['task_id']
                print(f"[view_document] 启动后台转换任务: {task_id}")
                from flask import redirect, url_for
                return redirect(f"{url_for('document.view_document', doc_id=doc_id)}?task_id={task_id}")
            else:
                # 转换工具不可用，直接返回在线预览降级方案
                print(f"[view_document] 转换工具不可用，使用在线预览降级")
                return _office_online_viewer_response(file_path_obj, file_ext)
        
        # 其他文件类型，返回本地预览
        return preview_document_local(doc_id)
        
    except Exception as e:
        import traceback
        print(f"[view_document] 错误: {e}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'查看失败: {str(e)}'}), 500


def _check_conversion_available(file_ext: str) -> bool:
    """检查PDF转换工具是否可用"""
    import shutil
    import platform
    
    # 检查 LibreOffice（所有平台）
    if shutil.which('libreoffice') or shutil.which('soffice'):
        return True
    
    # Windows 平台检查 COM（需要装 Word/Excel/PPT）和 docx2pdf
    if platform.system() == 'Windows':
        if file_ext in ('.docx', '.doc'):
            try:
                import docx2pdf
                return True
            except ImportError:
                pass
            try:
                import comtypes.client
                return True
            except ImportError:
                pass
        else:
            try:
                import comtypes.client
                return True
            except ImportError:
                pass
    
    return False


def _office_online_viewer_response(file_path_obj, file_ext):
    """当本地转换工具不可用时，返回包含下载链接的降级HTML"""
    filename = file_path_obj.name
    file_icons = {
        '.docx': '📝', '.doc': '📝',
        '.xlsx': '📊', '.xls': '📊',
        '.pptx': '📑', '.ppt': '📑',
    }
    icon = file_icons.get(file_ext, '📄')
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: 'Microsoft YaHei', sans-serif; display:flex; justify-content:center; align-items:center; height:80vh; margin:0; background:#f5f5f5; }}
  .card {{ background:#fff; border-radius:12px; padding:40px 50px; text-align:center; box-shadow:0 2px 12px rgba(0,0,0,0.1); max-width:480px; }}
  .icon {{ font-size:64px; }}
  h3 {{ margin:16px 0 8px; color:#333; word-break:break-all; font-size:15px; }}
  p {{ color:#666; font-size:13px; margin:0 0 24px; }}
  .btn {{ display:inline-block; padding:10px 28px; border-radius:6px; text-decoration:none; font-size:14px; margin:6px; }}
  .btn-primary {{ background:#4f8ef7; color:#fff; }}
  .btn-secondary {{ background:#f0f0f0; color:#555; border:1px solid #ddd; }}
  .hint {{ font-size:12px; color:#aaa; margin-top:16px; }}
</style>
</head>
<body>
<div class="card">
  <div class="icon">{icon}</div>
  <h3>{filename}</h3>
  <p>此文件格式需要 Word/Excel/LibreOffice 才能在线转换预览，<br>服务器暂时不支持自动转换。</p>
  <a class="btn btn-primary" href="javascript:window.parent.location.href=window.location.href" onclick="window.open(window.location.href,'_blank');return false;">↓ 在新标签下载查看</a>
  <div class="hint">提示：您也可以右键文件名→另存为，下载后用本地软件打开</div>
</div>
</body>
</html>"""
    from flask import make_response
    resp = make_response(html, 200)
    resp.headers['Content-Type'] = 'text/html; charset=utf-8'
    return resp


def _get_document_metadata(doc_manager, doc_id):
    """获取文档元数据"""
    # 首先从 documents_db 中查找
    if doc_id in doc_manager.documents_db:
        return doc_manager.documents_db[doc_id]
    
    # 尝试从项目配置中查找
    if hasattr(doc_manager, 'projects') and doc_manager.projects:
        for project_id, project_data in doc_manager.projects.projects_db.items():
            if 'documents' in project_data:
                for cycle, cycle_info in project_data['documents'].items():
                    if 'uploaded_docs' in cycle_info:
                        for d in cycle_info['uploaded_docs']:
                            if d.get('doc_id') == doc_id or d.get('id') == doc_id:
                                doc_manager.documents_db[doc_id] = d
                                return d
    
    # 从 current_project 中查找
    if hasattr(doc_manager, 'current_project') and doc_manager.current_project:
        for cycle, cycle_info in doc_manager.current_project.get('documents', {}).items():
            if 'uploaded_docs' in cycle_info:
                for d in cycle_info['uploaded_docs']:
                    if d.get('doc_id') == doc_id or d.get('id') == doc_id:
                        doc_manager.documents_db[doc_id] = d
                        return d
    
    # 尝试从项目文件中查找（扫描根目录 *.json 和子目录的 project_config.json）
    import json
    projects_dir = doc_manager.config.projects_base_folder
    
    # 先通过 data_manager 的文档索引查找（最准确）
    if hasattr(doc_manager, 'data_manager'):
        try:
            for project_dir in projects_dir.iterdir():
                if project_dir.is_dir():
                    project_name = project_dir.name
                    doc_index = doc_manager.data_manager.load_documents_index(project_name)
                    if 'documents' in doc_index and doc_id in doc_index['documents']:
                        d = doc_index['documents'][doc_id]
                        doc_manager.documents_db[doc_id] = d
                        return d
        except Exception:
            pass
    
    # 扫描根目录 *.json
    for project_file in projects_dir.glob('*.json'):
        try:
            with open(project_file, 'r', encoding='utf-8') as f:
                project_data = json.load(f)
            if 'documents' in project_data:
                for cycle, cycle_info in project_data['documents'].items():
                    if 'uploaded_docs' in cycle_info:
                        for d in cycle_info['uploaded_docs']:
                            if d.get('doc_id') == doc_id or d.get('id') == doc_id:
                                doc_manager.documents_db[doc_id] = d
                                return d
        except Exception:
            pass
    
    # 扫描子目录中的 project_config.json
    try:
        for project_dir in projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            config_file = project_dir / 'project_config.json'
            if not config_file.exists():
                continue
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    project_data = json.load(f)
                if 'documents' in project_data:
                    for cycle, cycle_info in project_data['documents'].items():
                        if not isinstance(cycle_info, dict):
                            continue
                        for d in cycle_info.get('uploaded_docs', []):
                            if d.get('doc_id') == doc_id or d.get('id') == doc_id:
                                doc_manager.documents_db[doc_id] = d
                                return d
            except Exception:
                pass
    except Exception:
        pass
    
    return None


def _resolve_file_path(doc_manager, metadata):
    """解析文件路径，处理相对路径和绝对路径（支持Windows和Ubuntu）"""
    file_path = metadata.get('file_path')
    if not file_path:
        return None
    
    # 使用通用工具函数规范化路径
    normalized_path = normalize_path(file_path)
    file_path_obj = Path(normalized_path)
    
    # 如果是绝对路径，直接返回
    if file_path_obj.is_absolute():
        return file_path_obj
    
    # 获取项目名
    project_name = metadata.get('project_name')
    if not project_name:
        # 尝试从doc_id中解析项目名
        doc_id = metadata.get('doc_id', '')
        if '_' in doc_id and not doc_id.startswith('_'):
            parts = doc_id.split('_')
            if parts[0]:
                project_name = parts[0]
    
    # 优先：处理新的完整相对路径格式：projects/{项目名}/uploads/...
    if normalized_path.startswith('projects/'):
        base_dir = doc_manager.config.projects_base_folder.parent
        path_parts = normalized_path.split('/')
        # 使用safe_join构建路径，自动处理跨平台分隔符
        full_path = Path(safe_join(str(base_dir), *path_parts))
        print(f"[_resolve_file_path] 尝试路径: {full_path}")
        if full_path.exists():
            print(f"[_resolve_file_path] 找到文件: {full_path}")
            return full_path
    
    # 处理 uploads/ 相对路径（不带项目名前缀）
    if normalized_path.startswith('uploads/'):
        if project_name:
            base_dir = doc_manager.config.projects_base_folder.parent
            full_path = Path(safe_join(str(base_dir), 'projects', project_name, normalized_path))
            print(f"[_resolve_file_path] 尝试uploads路径: {full_path}")
            if full_path.exists():
                print(f"[_resolve_file_path] 找到文件: {full_path}")
                return full_path
        # 尝试从当前项目查找
        if hasattr(doc_manager, 'current_project') and doc_manager.current_project:
            project_name = doc_manager.current_project.get('name', project_name)
            if project_name:
                base_dir = doc_manager.config.projects_base_folder.parent
                full_path = Path(safe_join(str(base_dir), 'projects', project_name, normalized_path))
                print(f"[_resolve_file_path] 尝试当前项目路径: {full_path}")
                if full_path.exists():
                    print(f"[_resolve_file_path] 找到文件: {full_path}")
                    return full_path
    
    if project_name:
        project_uploads_dir = doc_manager.get_documents_folder(project_name)
        full_path = Path(safe_join(str(project_uploads_dir), normalized_path))
        print(f"[_resolve_file_path] 尝试项目目录: {full_path}")
        if full_path.exists():
            print(f"[_resolve_file_path] 找到文件: {full_path}")
            return full_path
    
    # 最后尝试uploads目录
    if hasattr(doc_manager, 'config') and hasattr(doc_manager.config, 'upload_folder'):
        upload_folder = doc_manager.config.upload_folder
    else:
        upload_folder = Path('uploads')
    full_path = Path(safe_join(str(upload_folder), normalized_path))
    print(f"[_resolve_file_path] 尝试uploads目录: {full_path}")
    return full_path


def preview_status(file_hash):
    """获取文档预览转换状态"""
    try:
        if not progressive_pdf_service:
            return jsonify({'status': 'error', 'message': '预览服务不可用'}), 503
        status = progressive_pdf_service.get_status(file_hash)
        return jsonify(status)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def preview_page(file_hash, page):
    """获取指定预览页面图片"""
    try:
        if not progressive_pdf_service:
            return jsonify({'status': 'error', 'message': '预览服务不可用'}), 503
        page_path = progressive_pdf_service.get_page(file_hash, page)
        if page_path and page_path.exists():
            return send_file(str(page_path), mimetype='image/png')
        else:
            return jsonify({'status': 'error', 'message': '页面尚未准备好'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def start_progressive_preview(doc_id):
    """
    启动渐进式文档预览
    1. 获取文档文件路径
    2. 启动后台转换
    3. 返回预览页面HTML
    """
    try:
        import urllib.parse
        doc_id = urllib.parse.unquote(doc_id)
        
        doc_manager = get_doc_manager()
        
        # 获取文档元数据
        metadata = _get_document_metadata(doc_manager, doc_id)
        if not metadata:
            return jsonify({'status': 'error', 'message': '文档不存在'}), 404
        
        # 解析文件路径
        file_path_obj = _resolve_file_path(doc_manager, metadata)
        if not file_path_obj or not file_path_obj.exists():
            print(f"[start_progressive_preview] 文件不存在: {file_path_obj}")
            return jsonify({'status': 'error', 'message': '文件不存在'}), 404
        
        file_ext = file_path_obj.suffix.lower()
        file_path = str(file_path_obj)
        
        # 检查是否为支持的Office文档类型
        office_extensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
        pdf_extensions = ['.pdf']
        
        if file_ext not in (office_extensions + pdf_extensions + ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']):
            # 不支持的文件类型，返回错误
            return jsonify({
                'status': 'error', 
                'message': f'该文件类型 ({file_ext}) 不支持渐进式预览',
                'fallback': 'download'
            }), 400
        
        # 启动渐进式转换（Office文档）或直接返回PDF信息
        if file_ext in office_extensions or file_ext == '.pdf':
            # 如果渐进式服务不可用，降级为直接查看
            if not progressive_pdf_service:
                return jsonify({
                    'status': 'success',
                    'mode': 'direct',
                    'file_url': f'/api/documents/view/{urllib.parse.quote(doc_id, safe="")}',
                    'file_ext': file_ext
                })
            # 启动后台转换
            try:
                source_type = 'pdf' if file_ext == '.pdf' else 'office'
                file_hash = progressive_pdf_service.start_conversion(file_path, source_type)
                
                # 获取初始状态
                status = progressive_pdf_service.get_status(file_hash)
                total_pages = status.get('total_pages', 1)
                
                # 生成预览HTML
                preview_html = progressive_pdf_service.get_preview_html(file_hash, total_pages)
                
                return jsonify({
                    'status': 'success',
                    'file_hash': file_hash,
                    'mode': 'progressive',
                    'total_pages': total_pages,
                    'preview_html': preview_html,
                    'file_ext': file_ext
                })
            except Exception as conv_err:
                # 渐进式转换失败，降级为 direct 模式（走 view 接口）
                print(f"[start_progressive_preview] 渐进式转换失败，降级为 direct: {conv_err}")
                return jsonify({
                    'status': 'success',
                    'mode': 'direct',
                    'file_url': f'/api/documents/view/{urllib.parse.quote(doc_id, safe="")}',
                    'file_ext': file_ext
                })
        else:
            # 图片直接返回
            return jsonify({
                'status': 'success',
                'mode': 'direct',
                'file_url': f'/api/documents/view/{urllib.parse.quote(doc_id, safe="")}',
                'file_ext': file_ext
            })
        
    except Exception as e:
        import traceback
        print(f"[start_progressive_preview] 错误: {e}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'启动预览失败: {str(e)}'}), 500


def start_batch_pdf_conversion():
    """启动批量PDF转换任务"""
    try:
        project_id = request.json.get('project_id')
        if not project_id:
            return jsonify({'status': 'error', 'message': '缺少项目ID'}), 400
        
        # 启动批量转换任务
        task_result = task_service.start_batch_pdf_conversion(project_id)
        return jsonify(task_result)
        
    except Exception as e:
        import traceback
        print(f"[start_batch_pdf_conversion] 错误: {e}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'启动批量转换失败: {str(e)}'}), 500


def delete_pdf_conversion():
    """删除PDF转换记录"""
    try:
        doc_id = request.json.get('doc_id')
        if not doc_id:
            return jsonify({'status': 'error', 'message': '缺少文档ID'}), 400
        
        from src.services.pdf_conversion_record import pdf_conversion_record
        # 删除转换记录和PDF文件
        pdf_conversion_record.delete_record(doc_id)
        
        return jsonify({'status': 'success', 'message': 'PDF转换记录已删除'})
        
    except Exception as e:
        import traceback
        print(f"[delete_pdf_conversion] 错误: {e}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'删除PDF转换记录失败: {str(e)}'}), 500

