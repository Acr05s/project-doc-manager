"""文档管理相关路由"""

from flask import Blueprint
from .upload import upload_document, upload_chunk, merge_chunks, get_upload_progress, upload_zip_chunk, merge_zip_chunks
from .list import list_documents, get_document
from .preview import preview_document, preview_document_local, view_document, preview_status, preview_page
from .download import download_document
from .progress import get_cycle_progress
from .delete import delete_document, batch_delete_documents
from .update import batch_update_documents, update_doc, replace_doc
from .recognize import smart_recognize
from .category import get_categories, create_category, delete_category
from .files import get_directories, search_files, select_files
from .zip import get_zip_records, add_zip_record, delete_zip_record, start_zip_match, get_zip_match_status, check_zip_chunk
from .cleanup import cleanup_duplicates
from .utils import init_doc_manager

# 创建蓝图
document_bp = Blueprint('document', __name__)

# 注册路由
document_bp.route('/upload', methods=['POST'])(upload_document)
document_bp.route('/upload/chunk', methods=['POST'])(upload_chunk)
document_bp.route('/upload/merge', methods=['POST'])(merge_chunks)
document_bp.route('/upload/progress', methods=['GET'])(get_upload_progress)
document_bp.route('/list', methods=['GET'])(list_documents)
document_bp.route('/<doc_id>', methods=['GET'])(get_document)
document_bp.route('/preview/<doc_id>', methods=['GET'])(preview_document)
document_bp.route('/preview-local/<doc_id>', methods=['GET'])(preview_document_local)
document_bp.route('/view/<doc_id>', methods=['GET'])(view_document)
document_bp.route('/download/<doc_id>', methods=['GET'])(download_document)
document_bp.route('/progress', methods=['GET'])(get_cycle_progress)
document_bp.route('/<doc_id>', methods=['DELETE'])(delete_document)
document_bp.route('/batch-update', methods=['POST'])(batch_update_documents)
document_bp.route('/batch-delete', methods=['POST'])(batch_delete_documents)
document_bp.route('/smart-recognize', methods=['POST'])(smart_recognize)
document_bp.route('/categories', methods=['GET'])(get_categories)
document_bp.route('/category', methods=['POST'])(create_category)
document_bp.route('/category', methods=['DELETE'])(delete_category)
document_bp.route('/<doc_id>', methods=['PUT'])(update_doc)
document_bp.route('/<doc_id>/replace', methods=['POST'])(replace_doc)
document_bp.route('/directories', methods=['GET'])(get_directories)
document_bp.route('/files/search', methods=['GET'])(search_files)
document_bp.route('/files/select', methods=['POST'])(select_files)
document_bp.route('/zip-records', methods=['GET'])(get_zip_records)
document_bp.route('/zip-records', methods=['POST'])(add_zip_record)
document_bp.route('/zip-records/<zip_id>', methods=['DELETE'])(delete_zip_record)
document_bp.route('/zip-chunk-upload', methods=['POST'])(upload_zip_chunk)
document_bp.route('/zip-chunk-merge', methods=['POST'])(merge_zip_chunks)
document_bp.route('/zip-check-chunk', methods=['GET'])(check_zip_chunk)
document_bp.route('/zip-match-start', methods=['POST'])(start_zip_match)
document_bp.route('/zip-match-status', methods=['GET'])(get_zip_match_status)
document_bp.route('/cleanup-duplicates', methods=['POST'])(cleanup_duplicates)

# 导出
__all__ = ['document_bp', 'init_doc_manager']