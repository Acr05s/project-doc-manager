"""项目管理相关路由"""

from flask import Blueprint
from flask_login import login_required
from .utils import init_doc_manager, project_access_required, pmo_admin_required
from .basic import list_projects, create_project, get_accessible_projects, approve_project, get_project, update_project, update_project_config, delete_project, get_dashboard_stats, get_report_types, get_report_data, get_doc_changes, initiate_project_transfer, respond_project_transfer, batch_delete_projects, batch_update_projects, batch_update_project_status, list_all_projects, get_archive_stats, bulk_approve_archive_requests
from .requirements import load_project_config, apply_requirements_to_project_route, list_requirements_configs, export_requirements, get_document_directories, create_document_directory, delete_document_directory, preview_excel_file, parse_excel_with_mapping
from .recycle import list_deleted_projects, restore_project, permanent_delete_project
from .structure import update_project_structure, confirm_cycle_documents
from .export import export_project, import_project, import_project_file, package_project, import_package, download_package, import_project_chunk, import_project_merge, package_full_project, preview_import_package, import_from_preview, preview_package_chunk, preview_package_merge
from .acceptance import confirm_cycle_acceptance, download_project_package, verify_project_files, clean_invalid_files
from .logs import get_operation_logs, get_external_logs
from .versions import list_config_versions, save_config_version, load_config_version, switch_config_version, delete_config_version, export_config_version
from .templates import list_templates, save_template, load_template, delete_template, update_template, apply_template_to_project, export_template, import_template
from .new_project import create_new_project, load_new_project, archive_new_document, export_new_project_package, list_new_projects, delete_new_project
from .draft import save_draft, load_draft, clear_draft
from .archive import submit_archive_request, get_archive_requests, approve_archive_request, reject_archive_request, get_archive_approvers, archive_project_document, get_pending_archive_approvals, withdraw_archive_request, get_approval_history, get_all_approval_history
from .scheduled_reports import (
    get_project_report_schedule,
    update_project_report_schedule,
    run_project_report_now,
    list_project_report_tasks,
    create_project_report_task,
    update_project_report_task,
    delete_project_report_task,
    toggle_project_report_task,
    run_project_report_task_now,
    skip_next_project_report_task,
    send_project_report,
    list_all_report_tasks,
    get_report_send_history,
    get_holiday_status,
    update_holiday_data,
)
from .modules import modules_bp

# 创建蓝图
project_bp = Blueprint('project', __name__)

# 注册子蓝图
project_bp.register_blueprint(modules_bp)

# ===== 不含 project_id 的路由：仅需 login_required =====
project_bp.route('/list', methods=['GET'])(login_required(list_projects))
project_bp.route('/create', methods=['POST'])(login_required(create_project))
project_bp.route('/accessible', methods=['GET'])(login_required(get_accessible_projects))
project_bp.route('/approve', methods=['POST'])(login_required(approve_project))
project_bp.route('/dashboard', methods=['GET'])(login_required(get_dashboard_stats))
project_bp.route('/reports/types', methods=['GET'])(login_required(get_report_types))
project_bp.route('/reports/data', methods=['GET'])(login_required(get_report_data))
project_bp.route('/reports/doc-changes', methods=['GET'])(login_required(get_doc_changes))
project_bp.route('/archive-stats', methods=['GET'])(login_required(get_archive_stats))
project_bp.route('/bulk-approve', methods=['POST'])(login_required(bulk_approve_archive_requests))
project_bp.route('/transfer/respond', methods=['POST'])(login_required(respond_project_transfer))
project_bp.route('/batch/delete', methods=['POST'])(login_required(batch_delete_projects))
project_bp.route('/batch/update', methods=['POST'])(login_required(batch_update_projects))
project_bp.route('/batch/status', methods=['POST'])(login_required(batch_update_project_status))
project_bp.route('/all', methods=['GET'])(login_required(list_all_projects))
project_bp.route('/load', methods=['POST'])(pmo_admin_required(load_project_config))
project_bp.route('/requirements/list', methods=['GET'])(login_required(list_requirements_configs))
project_bp.route('/export-requirements', methods=['GET'])(login_required(export_requirements))
project_bp.route('/excel/preview', methods=['POST'])(login_required(preview_excel_file))
project_bp.route('/excel/parse', methods=['POST'])(login_required(parse_excel_with_mapping))
project_bp.route('/deleted/list', methods=['GET'])(login_required(list_deleted_projects))
project_bp.route('/import', methods=['POST'])(login_required(import_project))
project_bp.route('/import/file', methods=['POST'])(login_required(import_project_file))
project_bp.route('/package/import', methods=['POST'])(login_required(import_package))
project_bp.route('/package/preview', methods=['POST'])(login_required(preview_import_package))
project_bp.route('/package/import-from-preview', methods=['POST'])(login_required(import_from_preview))
project_bp.route('/package/preview-chunk', methods=['POST'])(login_required(preview_package_chunk))
project_bp.route('/package/preview-merge', methods=['POST'])(login_required(preview_package_merge))
project_bp.route('/logs', methods=['GET'])(login_required(get_operation_logs))
project_bp.route('/logs/external', methods=['GET'])(login_required(get_external_logs))
project_bp.route('/import/chunk', methods=['POST'])(login_required(import_project_chunk))
project_bp.route('/import/merge', methods=['POST'])(login_required(import_project_merge))

# ===== 含 project_id 的路由：需 project_access_required =====
project_bp.route('/<project_id>', methods=['GET'])(project_access_required(get_project))
project_bp.route('/<project_id>', methods=['PUT'])(project_access_required(update_project))
project_bp.route('/<project_id>/config', methods=['PATCH'])(project_access_required(update_project_config))
project_bp.route('/<project_id>', methods=['DELETE'])(project_access_required(delete_project))
project_bp.route('/<project_id>/transfer', methods=['POST'])(project_access_required(initiate_project_transfer))
project_bp.route('/<project_id>/apply-requirements', methods=['POST'])(pmo_admin_required(apply_requirements_to_project_route))
project_bp.route('/<project_id>/restore', methods=['POST'])(login_required(restore_project))
project_bp.route('/<project_id>/permanent-delete', methods=['DELETE'])(login_required(permanent_delete_project))
project_bp.route('/<project_id>/structure', methods=['POST'])(project_access_required(update_project_structure))
project_bp.route('/<project_id>/confirm-cycle', methods=['POST'])(project_access_required(confirm_cycle_documents))
project_bp.route('/<project_id>/export', methods=['GET'])(project_access_required(export_project))
project_bp.route('/<project_id>/package', methods=['GET'])(project_access_required(package_project))
project_bp.route('/<project_id>/download/<task_id>', methods=['GET'])(project_access_required(download_package))
project_bp.route('/<project_id>/confirm-acceptance', methods=['POST'])(project_access_required(confirm_cycle_acceptance))
project_bp.route('/<project_id>/verify-files', methods=['GET'])(project_access_required(verify_project_files))
project_bp.route('/<project_id>/clean-invalid-files', methods=['POST'])(project_access_required(clean_invalid_files))
project_bp.route('/<project_id>/download-package', methods=['GET'])(project_access_required(download_project_package))
project_bp.route('/<project_id>/versions', methods=['GET'])(project_access_required(list_config_versions))
project_bp.route('/<project_id>/versions', methods=['POST'])(pmo_admin_required(save_config_version))
project_bp.route('/<project_id>/versions/<version_filename>', methods=['GET'])(project_access_required(load_config_version))
project_bp.route('/<project_id>/versions/<version_filename>/switch', methods=['POST'])(pmo_admin_required(switch_config_version))
project_bp.route('/<project_id>/versions/<version_filename>', methods=['DELETE'])(pmo_admin_required(delete_config_version))
project_bp.route('/<project_id>/versions/<version_filename>/export', methods=['GET'])(project_access_required(export_config_version))
project_bp.route('/<project_id>/apply-template/<template_id>', methods=['POST'])(project_access_required(apply_template_to_project))
project_bp.route('/<project_id>/package-full', methods=['POST'])(project_access_required(package_full_project))
project_bp.route('/<project_id>/draft', methods=['POST'])(project_access_required(save_draft))
project_bp.route('/<project_id>/draft', methods=['GET'])(project_access_required(load_draft))
project_bp.route('/<project_id>/draft', methods=['DELETE'])(project_access_required(clear_draft))

# 归档审批相关路由
project_bp.route('/<project_id>/archive', methods=['POST'])(project_access_required(archive_project_document))
project_bp.route('/<project_id>/archive-request', methods=['POST'])(project_access_required(submit_archive_request))
project_bp.route('/<project_id>/archive-requests', methods=['GET'])(project_access_required(get_archive_requests))
project_bp.route('/<project_id>/archive-approve', methods=['POST'])(project_access_required(approve_archive_request))
project_bp.route('/<project_id>/archive-reject', methods=['POST'])(project_access_required(reject_archive_request))
project_bp.route('/<project_id>/archive-withdraw', methods=['POST'])(project_access_required(withdraw_archive_request))
project_bp.route('/<project_id>/archive-approvers', methods=['GET'])(project_access_required(get_archive_approvers))
project_bp.route('/<project_id>/archive-history', methods=['GET'])(project_access_required(get_approval_history))
project_bp.route('/archive/pending', methods=['GET'])(login_required(get_pending_archive_approvals))
project_bp.route('/archive/history', methods=['GET'])(login_required(get_all_approval_history))

# 项目定时报告路由
project_bp.route('/<project_id>/report-schedule', methods=['GET'])(project_access_required(get_project_report_schedule))
project_bp.route('/<project_id>/report-schedule', methods=['PATCH'])(project_access_required(update_project_report_schedule))
project_bp.route('/<project_id>/report-schedule/run', methods=['POST'])(project_access_required(run_project_report_now))

# 项目定时报告任务管理（新）
project_bp.route('/report-schedules/all', methods=['GET'])(login_required(list_all_report_tasks))
project_bp.route('/report-schedules/history', methods=['GET'])(login_required(get_report_send_history))
project_bp.route('/report-schedules/holidays/status', methods=['GET'])(login_required(get_holiday_status))
project_bp.route('/report-schedules/holidays/update', methods=['POST'])(login_required(update_holiday_data))
project_bp.route('/<project_id>/report-schedules', methods=['GET'])(project_access_required(list_project_report_tasks))
project_bp.route('/<project_id>/report-schedules', methods=['POST'])(project_access_required(create_project_report_task))
project_bp.route('/<project_id>/report-schedules/<task_id>', methods=['PATCH'])(project_access_required(update_project_report_task))
project_bp.route('/<project_id>/report-schedules/<task_id>', methods=['DELETE'])(project_access_required(delete_project_report_task))
project_bp.route('/<project_id>/report-schedules/<task_id>/toggle', methods=['POST'])(project_access_required(toggle_project_report_task))
project_bp.route('/<project_id>/report-schedules/<task_id>/run', methods=['POST'])(project_access_required(run_project_report_task_now))
project_bp.route('/<project_id>/report-schedules/<task_id>/skip-next', methods=['POST'])(project_access_required(skip_next_project_report_task))
project_bp.route('/<project_id>/report/send', methods=['POST'])(project_access_required(send_project_report))

# 文档目录映射相关路由
project_bp.route('/<project_id>/document-directories', methods=['GET'])(project_access_required(get_document_directories))
project_bp.route('/<project_id>/document-directories', methods=['POST'])(project_access_required(create_document_directory))
project_bp.route('/<project_id>/document-directories', methods=['DELETE'])(project_access_required(delete_document_directory))

# 模板管理相关路由（不含 project_id）
project_bp.route('/templates', methods=['GET'])(login_required(list_templates))
project_bp.route('/templates', methods=['POST'])(login_required(save_template))
project_bp.route('/templates/<template_id>', methods=['GET'])(login_required(load_template))
project_bp.route('/templates/<template_id>', methods=['PUT'])(login_required(update_template))
project_bp.route('/templates/<template_id>', methods=['DELETE'])(login_required(delete_template))
project_bp.route('/templates/<template_id>/export', methods=['GET'])(login_required(export_template))
project_bp.route('/templates/import', methods=['POST'])(login_required(import_template))

# 新版文档清单模式路由
project_bp.route('/new/create', methods=['POST'])(login_required(create_new_project))
project_bp.route('/new/<project_name>/load', methods=['GET'])(login_required(load_new_project))
project_bp.route('/new/<project_name>/archive', methods=['POST'])(login_required(archive_new_document))
project_bp.route('/new/<project_name>/export', methods=['GET'])(login_required(export_new_project_package))
project_bp.route('/new/list', methods=['GET'])(login_required(list_new_projects))
project_bp.route('/new/<project_name>', methods=['DELETE'])(login_required(delete_new_project))

# 导出
__all__ = ['project_bp', 'init_doc_manager']
