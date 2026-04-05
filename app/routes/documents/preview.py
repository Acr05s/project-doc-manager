"""文档预览相关路由"""

import os
import json
from flask import request, jsonify, send_file
from pathlib import Path
from .utils import get_doc_manager
from app.services.task_service import task_service

# 设置文件路径
SETTINGS_FILE = Path(__file__).parent.parent.parent.parent / 'settings.json'

def get_fast_preview_threshold():
    """获取快速预览阈值（MB转字节）"""
    try:
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                threshold_mb = settings.get('fast_preview_threshold', 5)
                # 确保在合理范围1-50MB
                threshold_mb = max(1, min(50, int(threshold_mb)))
                return threshold_mb * 1024 * 1024
    except Exception:
        pass
    return 5 * 1024 * 1024  # 默认5MB

# 导入预览服务（容错处理）
try:
    from src.services.preview_service import PreviewService
except ImportError:
    PreviewService = None

try:
    from src.services.pdf_conversion_service import PDFConversionService
except ImportError:
    PDFConversionService = None

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
        if PreviewService:
            try:
                preview_service = PreviewService()
                html_content = preview_service.get_full_preview(str(file_path_obj), page)
                from flask import make_response
                resp = make_response(html_content, 200)
                resp.headers['Content-Type'] = 'text/html; charset=utf-8'
                return resp
            except Exception as e:
                return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500
        else:
            # 预览服务不可用，返回错误
            return jsonify({'status': 'error', 'message': '预览服务不可用'}), 503
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'预览失败: {str(e)}'}), 500


def view_document(doc_id):
    """直接查看文档（用于PDF、图片等可直接在浏览器显示的文件）
    
    优化方案：
    1. PDF和图片直接返回，无需转换
    2. Office文档使用同步快速转换+缓存，优先使用已缓存的PDF
    3. 缓存键包含文件修改时间，确保文件更新后重新转换
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
            # 使用优化的同步转换（带缓存）
            return _convert_and_view_office(file_path, doc_id, file_path_obj)
        
        # 其他文件类型，返回下载
        return send_file(file_path, as_attachment=True)
        
    except Exception as e:
        import traceback
        print(f"[view_document] 错误: {e}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'查看失败: {str(e)}'}), 500


def _convert_and_view_office(file_path, doc_id, file_path_obj):
    """转换Office文档为PDF并查看（同步快速转换+智能缓存）"""
    from src.services.pdf_conversion_record import pdf_conversion_record
    from src.services.pdf_conversion_service import PDFConversionService
    import time
    
    try:
        # 获取文件修改时间作为缓存有效性检查
        file_mtime = os.path.getmtime(file_path)
        
        # 检查是否有有效的缓存
        cache_key = f"{doc_id}_{int(file_mtime)}"
        cached_record = pdf_conversion_record.get_record(cache_key)
        
        if cached_record:
            pdf_path = cached_record.get('pdf_path')
            if pdf_path and os.path.exists(pdf_path):
                print(f"[view_document] 使用缓存的PDF: {pdf_path}")
                pdf_conversion_record.update_access_time(cache_key)
                return send_file(pdf_path, mimetype='application/pdf',
                               as_attachment=False,
                               download_name=f"{file_path_obj.stem}.pdf")
        
        # 检查doc_id的旧缓存（兼容旧版本，但会检查文件是否更新）
        old_record = pdf_conversion_record.get_record(doc_id)
        if old_record:
            old_pdf_path = old_record.get('pdf_path')
            old_file_path = old_record.get('file_path')
            old_mtime = old_record.get('file_mtime', 0)
            
            # 如果文件路径相同且修改时间未变，使用旧缓存
            if (old_pdf_path and os.path.exists(old_pdf_path) and 
                old_file_path == file_path and old_mtime == file_mtime):
                print(f"[view_document] 使用旧缓存的PDF: {old_pdf_path}")
                pdf_conversion_record.update_access_time(doc_id)
                return send_file(old_pdf_path, mimetype='application/pdf',
                               as_attachment=False,
                               download_name=f"{file_path_obj.stem}.pdf")
            else:
                # 文件已更新，删除旧缓存
                print(f"[view_document] 文件已更新，删除旧缓存")
                pdf_conversion_record.delete_record(doc_id)
        
        # 没有缓存或缓存失效，执行同步转换
        print(f"[view_document] 开始同步转换: {file_path}")
        start_time = time.time()
        
        # 创建预览文件临时目录
        preview_temp_dir = Path('uploads/temp/preview')
        preview_temp_dir.mkdir(parents=True, exist_ok=True)
        
        # 初始化PDF转换服务
        pdf_service = PDFConversionService()
        pdf_service.set_preview_temp_dir(str(preview_temp_dir))
        
        # 执行转换
        pdf_path = pdf_service.convert_to_pdf(file_path, cache_key)
        
        # 保存转换记录（包含文件修改时间）
        pdf_conversion_record.add_record(cache_key, pdf_path, file_path)
        # 同时更新记录，添加文件修改时间
        if cache_key in pdf_conversion_record.records:
            pdf_conversion_record.records[cache_key]['file_mtime'] = file_mtime
            pdf_conversion_record._save_records()
        
        elapsed_time = time.time() - start_time
        print(f"[view_document] 转换完成，耗时: {elapsed_time:.2f}秒, PDF: {pdf_path}")
        
        return send_file(pdf_path, mimetype='application/pdf',
                       as_attachment=False,
                       download_name=f"{file_path_obj.stem}.pdf")
        
    except Exception as e:
        import traceback
        print(f"[view_document] 转换失败: {e}")
        print(traceback.format_exc())
        # 转换失败，返回友好的错误页面
        file_ext = file_path_obj.suffix.lower()
        return _office_convert_error_response(file_path_obj, file_ext, str(e))


def _office_convert_error_response(file_path_obj, file_ext, error_msg):
    """当Office转换失败时，返回友好的错误页面"""
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
  .error {{ font-size:11px; color:#e74c3c; margin-top:10px; background:#fee; padding:8px; border-radius:4px; }}
</style>
</head>
<body>
<div class="card">
  <div class="icon">{icon}</div>
  <h3>{filename}</h3>
  <p>PDF转换暂时不可用，请下载后查看</p>
  <a class="btn btn-primary" href="/api/documents/download/{filename}" download>↓ 下载文件</a>
  <div class="hint">提示：您也可以右键文件名→另存为，下载后用本地软件打开</div>
  <div class="error">转换错误: {error_msg[:100]}</div>
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
    
    # 处理 {项目名}/uploads/... 格式的路径（不带 projects/ 前缀）
    if project_name and normalized_path.startswith(f"{project_name}/"):
        base_dir = doc_manager.config.projects_base_folder.parent
        full_path = Path(safe_join(str(base_dir), 'projects', normalized_path))
        print(f"[_resolve_file_path] 尝试项目相对路径: {full_path}")
        if full_path.exists():
            print(f"[_resolve_file_path] 找到文件: {full_path}")
            return full_path
    
    # 尝试从路径中提取项目名（如果路径以任意项目名开头）
    if normalized_path and '/' in normalized_path:
        potential_project = normalized_path.split('/')[0]
        if potential_project:
            base_dir = doc_manager.config.projects_base_folder.parent
            full_path = Path(safe_join(str(base_dir), 'projects', normalized_path))
            print(f"[_resolve_file_path] 尝试提取项目路径: {full_path}")
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
    if full_path.exists():
        return full_path
    
    # 备用方案：根据文件名在项目目录中搜索（处理ZIP文件夹被删除的情况）
    original_filename = metadata.get('original_filename', '')
    if original_filename and project_name:
        print(f"[_resolve_file_path] 尝试搜索文件: {original_filename}")
        found_path = _find_file_by_name(doc_manager, project_name, original_filename)
        if found_path:
            print(f"[_resolve_file_path] 通过文件名找到: {found_path}")
            return found_path
    
    return full_path


def _find_file_by_name(doc_manager, project_name, filename):
    """根据文件名在项目目录中搜索文件"""
    try:
        project_uploads_dir = doc_manager.get_documents_folder(project_name)
        if not project_uploads_dir or not project_uploads_dir.exists():
            return None
        
        # 在项目的 uploads 目录中递归搜索
        for file_path in project_uploads_dir.rglob(filename):
            if file_path.is_file():
                return file_path
        
        # 如果没找到，尝试不区分大小写搜索
        filename_lower = filename.lower()
        for file_path in project_uploads_dir.rglob('*'):
            if file_path.is_file() and file_path.name.lower() == filename_lower:
                return file_path
                
    except Exception as e:
        print(f"[_find_file_by_name] 搜索失败: {e}")
    
    return None


def preview_status(file_hash):
    """获取文档预览转换状态（已弃用，保留兼容）"""
    return jsonify({'status': 'completed', 'message': '使用直接预览模式'})


def preview_page(file_hash, page):
    """获取指定预览页面图片（已弃用，保留兼容）"""
    return jsonify({'status': 'error', 'message': '已切换到PDF直接预览模式'}), 410


def start_progressive_preview(doc_id):
    """
    启动文档预览（优化版：大文件先显示第一页，后台转换完整PDF）
    
    优化方案：
    1. 小文件（<5MB）：直接完整转换
    2. 大文件（>=5MB）：先快速转换第1页显示，后台异步转换完整PDF
    3. 提供转换状态查询接口
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
        file_size = os.path.getsize(file_path)
        
        # 支持的文件类型
        office_extensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']
        
        if file_ext not in (office_extensions + ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']):
            return jsonify({
                'status': 'error', 
                'message': f'该文件类型 ({file_ext}) 不支持预览',
                'fallback': 'download'
            }), 400
        
        # Office文档：智能转换策略
        if file_ext in office_extensions:
            try:
                from src.services.pdf_conversion_record import pdf_conversion_record
                from src.services.pdf_conversion_service import PDFConversionService
                import time
                
                file_mtime = os.path.getmtime(file_path)
                cache_key = f"{doc_id}_{int(file_mtime)}"
                
                # 检查是否已有完整PDF缓存
                cached_record = pdf_conversion_record.get_record(cache_key)
                if cached_record and os.path.exists(cached_record.get('pdf_path', '')):
                    print(f"[start_progressive_preview] 使用已缓存的完整PDF")
                    return jsonify({
                        'status': 'success',
                        'mode': 'direct',
                        'file_url': f'/api/documents/preview/pdf/{urllib.parse.quote(cache_key, safe="")}',
                        'file_ext': '.pdf'
                    })
                
                # 判断文件大小，决定转换策略
                # 小文件(<阈值): 直接完整转换
                # 大文件(>=阈值): 先快速转换第1页，后台转换完整PDF
                FAST_PREVIEW_THRESHOLD = get_fast_preview_threshold()
                
                preview_temp_dir = Path('uploads/temp/preview')
                preview_temp_dir.mkdir(parents=True, exist_ok=True)
                
                pdf_service = PDFConversionService()
                pdf_service.set_preview_temp_dir(str(preview_temp_dir))
                
                if file_size < FAST_PREVIEW_THRESHOLD:
                    # 小文件：直接完整转换
                    print(f"[start_progressive_preview] 小文件({file_size/1024/1024:.1f}MB)，直接完整转换: {file_path}")
                    start_time = time.time()
                    pdf_path = pdf_service.convert_to_pdf(file_path, cache_key)
                    elapsed_time = time.time() - start_time
                    print(f"[start_progressive_preview] 转换完成，耗时: {elapsed_time:.2f}秒")
                    
                    # 保存转换记录
                    pdf_conversion_record.add_record(cache_key, pdf_path, file_path)
                    if cache_key in pdf_conversion_record.records:
                        pdf_conversion_record.records[cache_key]['file_mtime'] = file_mtime
                        pdf_conversion_record.records[cache_key]['is_complete'] = True
                        pdf_conversion_record._save_records()
                    
                    return jsonify({
                        'status': 'success',
                        'mode': 'direct',
                        'file_url': f'/api/documents/preview/pdf/{urllib.parse.quote(cache_key, safe="")}',
                        'file_ext': '.pdf'
                    })
                else:
                    # 大文件：先快速转换第1页
                    print(f"[start_progressive_preview] 大文件({file_size/1024/1024:.1f}MB)，先转换第1页: {file_path}")
                    
                    first_page_key = f"{cache_key}_page1"
                    first_page_path = os.path.join(str(preview_temp_dir), f"{first_page_key}.pdf")
                    
                    # 检查是否已有第一页缓存
                    if not os.path.exists(first_page_path):
                        try:
                            # 快速转换第一页（使用PageRange=1-1）
                            pdf_service.convert_first_page_fast(file_path, first_page_path)
                            print(f"[start_progressive_preview] 第1页转换完成")
                        except Exception as e:
                            print(f"[start_progressive_preview] 第1页快速转换失败: {e}，尝试完整转换")
                            # 回退到完整转换
                            pdf_path = pdf_service.convert_to_pdf(file_path, cache_key)
                            pdf_conversion_record.add_record(cache_key, pdf_path, file_path)
                            if cache_key in pdf_conversion_record.records:
                                pdf_conversion_record.records[cache_key]['file_mtime'] = file_mtime
                                pdf_conversion_record.records[cache_key]['is_complete'] = True
                                pdf_conversion_record._save_records()
                            
                            return jsonify({
                                'status': 'success',
                                'mode': 'direct',
                                'file_url': f'/api/documents/preview/pdf/{urllib.parse.quote(cache_key, safe="")}',
                                'file_ext': '.pdf'
                            })
                    
                    # 保存第一页到转换记录
                    pdf_conversion_record.add_record(first_page_key, first_page_path, file_path)
                    
                    # 启动后台任务转换完整PDF
                    # 使用任务服务启动后台转换
                    try:
                        from app.services.task_service import task_service
                        task_service.start_pdf_conversion_task(doc_id, file_path, cache_key)
                        print(f"[start_progressive_preview] 已启动后台完整转换任务")
                    except Exception as e:
                        print(f"[start_progressive_preview] 启动后台任务失败: {e}")
                    
                    # 返回第一页的URL，并标记为不完整预览
                    return jsonify({
                        'status': 'success',
                        'mode': 'direct',
                        'file_url': f'/api/documents/preview/pdf/{urllib.parse.quote(first_page_key, safe="")}',
                        'file_ext': '.pdf',
                        'is_partial': True,  # 标记为部分预览
                        'full_preview_url': f'/api/documents/preview/pdf/{urllib.parse.quote(cache_key, safe="")}',
                        'message': '正在生成完整预览，当前仅显示第1页'
                    })
                
            except Exception as conv_err:
                print(f"[start_progressive_preview] 转换失败: {conv_err}")
                import traceback
                print(traceback.format_exc())
                return jsonify({
                    'status': 'error',
                    'message': f'PDF转换失败: {str(conv_err)}',
                    'fallback': 'download'
                }), 500
        
        # PDF和图片：直接返回view URL
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


def preview_converted_pdf(cache_key):
    """直接返回转换后的PDF文件（避免循环转换）"""
    try:
        import urllib.parse
        from src.services.pdf_conversion_record import pdf_conversion_record
        from flask import send_file
        
        # URL解码 cache_key（处理特殊字符）
        cache_key = urllib.parse.unquote(cache_key)
        print(f"[preview_converted_pdf] cache_key: {cache_key}")
        
        # 获取转换记录
        record = pdf_conversion_record.get_record(cache_key)
        
        if not record:
            print(f"[preview_converted_pdf] 记录不存在，尝试列出可用记录...")
            print(f"[preview_converted_pdf] 可用记录数: {len(pdf_conversion_record.records)}")
            # 尝试模糊匹配
            for key in pdf_conversion_record.records.keys():
                if cache_key in key or key in cache_key:
                    print(f"[preview_converted_pdf] 找到相似记录: {key}")
                    record = pdf_conversion_record.get_record(key)
                    break
            
            if not record:
                # 尝试查找实际的PDF文件
                preview_dir = Path('uploads/temp/preview')
                if preview_dir.exists():
                    possible_files = list(preview_dir.glob(f"*{cache_key}*.pdf"))
                    if possible_files:
                        # 找到文件但没有记录，重新创建记录
                        pdf_path = str(possible_files[0])
                        print(f"[preview_converted_pdf] 找到PDF文件但无记录，重新创建记录: {pdf_path}")
                        pdf_conversion_record.add_record(cache_key, pdf_path, '')
                        record = pdf_conversion_record.get_record(cache_key)
                
                if not record:
                    return jsonify({'status': 'error', 'message': f'PDF转换记录不存在，请重新预览文档'}), 404
        
        pdf_path = record.get('pdf_path')
        print(f"[preview_converted_pdf] pdf_path: {pdf_path}")
        
        if not pdf_path:
            return jsonify({'status': 'error', 'message': 'PDF路径为空'}), 404
            
        if not os.path.exists(pdf_path):
            return jsonify({'status': 'error', 'message': f'PDF文件已被清理: {pdf_path}'}), 404
        
        # 更新访问时间
        pdf_conversion_record.update_access_time(cache_key)
        
        # 直接返回PDF文件
        return send_file(pdf_path, mimetype='application/pdf', 
                        as_attachment=False)
        
    except Exception as e:
        import traceback
        print(f"[preview_converted_pdf] 错误: {e}")
        print(traceback.format_exc())
        return jsonify({'status': 'error', 'message': f'加载PDF失败: {str(e)}'}), 500


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
