"""项目管理相关路由"""

from flask import Blueprint
from .utils import init_doc_manager
from .basic import list_projects, create_project, get_project, update_project, delete_project
from .requirements import load_project_config, apply_requirements_to_project_route, list_requirements_configs, export_requirements
from .recycle import list_deleted_projects, restore_project, permanent_delete_project
from .structure import update_project_structure, confirm_cycle_documents
from .export import export_project, import_project, import_project_file, package_project, import_package, download_package, import_project_chunk, import_project_merge, package_full_project, preview_import_package, import_from_preview
from .acceptance import confirm_cycle_acceptance, download_project_package, verify_project_files
from .logs import get_operation_logs, get_external_logs
from .versions import list_config_versions, save_config_version, load_config_version, switch_config_version, delete_config_version, export_config_version
from .templates import list_templates, save_template, load_template, delete_template, apply_template_to_project
from .new_project import create_new_project, load_new_project, archive_new_document, export_new_project_package, list_new_projects, delete_new_project
from .draft import save_draft, load_draft, clear_draft

# 创建蓝图
project_bp = Blueprint('project', __name__)

# 注册路由
project_bp.route('/list', methods=['GET'])(list_projects)
project_bp.route('/create', methods=['POST'])(create_project)
project_bp.route('/<project_id>', methods=['GET'])(get_project)
project_bp.route('/<project_id>', methods=['PUT'])(update_project)
project_bp.route('/<project_id>', methods=['DELETE'])(delete_project)
project_bp.route('/load', methods=['POST'])(load_project_config)
project_bp.route('/<project_id>/apply-requirements', methods=['POST'])(apply_requirements_to_project_route)
project_bp.route('/requirements/list', methods=['GET'])(list_requirements_configs)
project_bp.route('/export-requirements', methods=['GET'])(export_requirements)
project_bp.route('/deleted/list', methods=['GET'])(list_deleted_projects)
project_bp.route('/<project_id>/restore', methods=['POST'])(restore_project)
project_bp.route('/<project_id>/permanent-delete', methods=['DELETE'])(permanent_delete_project)
project_bp.route('/<project_id>/structure', methods=['POST'])(update_project_structure)
project_bp.route('/<project_id>/confirm-cycle', methods=['POST'])(confirm_cycle_documents)
project_bp.route('/<project_id>/export', methods=['GET'])(export_project)
project_bp.route('/import', methods=['POST'])(import_project)
project_bp.route('/import/file', methods=['POST'])(import_project_file)
project_bp.route('/<project_id>/package', methods=['GET'])(package_project)
project_bp.route('/<project_id>/download/<task_id>', methods=['GET'])(download_package)
project_bp.route('/package/import', methods=['POST'])(import_package)
project_bp.route('/package/preview', methods=['POST'])(preview_import_package)
project_bp.route('/package/import-from-preview', methods=['POST'])(import_from_preview)

# 验收相关路由
project_bp.route('/<project_id>/confirm-acceptance', methods=['POST'])(confirm_cycle_acceptance)
project_bp.route('/<project_id>/verify-files', methods=['GET'])(verify_project_files)
project_bp.route('/<project_id>/download-package', methods=['GET'])(download_project_package)

# 日志相关路由
project_bp.route('/logs', methods=['GET'])(get_operation_logs)
project_bp.route('/logs/external', methods=['GET'])(get_external_logs)

# 版本管理相关路由
project_bp.route('/<project_id>/versions', methods=['GET'])(list_config_versions)
project_bp.route('/<project_id>/versions', methods=['POST'])(save_config_version)
project_bp.route('/<project_id>/versions/<version_filename>', methods=['GET'])(load_config_version)
project_bp.route('/<project_id>/versions/<version_filename>/switch', methods=['POST'])(switch_config_version)
project_bp.route('/<project_id>/versions/<version_filename>', methods=['DELETE'])(delete_config_version)
project_bp.route('/<project_id>/versions/<version_filename>/export', methods=['GET'])(export_config_version)

# 模板管理相关路由
project_bp.route('/templates', methods=['GET'])(list_templates)
project_bp.route('/templates', methods=['POST'])(save_template)
project_bp.route('/templates/<template_id>', methods=['GET'])(load_template)
project_bp.route('/templates/<template_id>', methods=['DELETE'])(delete_template)
project_bp.route('/<project_id>/apply-template/<template_id>', methods=['POST'])(apply_template_to_project)

# 新版文档清单模式路由
project_bp.route('/new/create', methods=['POST'])(create_new_project)
project_bp.route('/new/<project_name>/load', methods=['GET'])(load_new_project)
project_bp.route('/new/<project_name>/archive', methods=['POST'])(archive_new_document)
project_bp.route('/new/<project_name>/export', methods=['GET'])(export_new_project_package)
project_bp.route('/new/list', methods=['GET'])(list_new_projects)
project_bp.route('/new/<project_name>', methods=['DELETE'])(delete_new_project)

# 自动保存草稿路由
project_bp.route('/<project_id>/draft', methods=['POST'])(save_draft)
project_bp.route('/<project_id>/draft', methods=['GET'])(load_draft)
project_bp.route('/<project_id>/draft', methods=['DELETE'])(clear_draft)

# 项目导入路由（支持断点续传）
project_bp.route('/import/chunk', methods=['POST'])(import_project_chunk)
project_bp.route('/import/merge', methods=['POST'])(import_project_merge)

# 完整打包项目路由
project_bp.route('/<project_id>/package-full', methods=['POST'])(package_full_project)

# 导出
__all__ = ['project_bp', 'init_doc_manager']
