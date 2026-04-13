"""项目基本操作相关路由"""

from flask import request, jsonify
from flask_login import login_required, current_user
from app.models.user import user_manager
from app.models.message import message_manager
from app.services.report_service import ReportService
from .utils import get_doc_manager


def list_projects():
    """获取项目列表"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.get_projects_list()
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def create_project():
    """创建新项目"""
    try:
        doc_manager = get_doc_manager()
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

        # 默认归属 PMO 组织
        if not party_b:
            party_b = 'PMO'

        creator_id = int(current_user.id) if current_user.is_authenticated else None
        creator_username = current_user.username if current_user.is_authenticated else None
        creator_role = current_user.role if current_user.is_authenticated else None

        result = doc_manager.create_project(name, description,
                                          party_a=party_a, party_b=party_b,
                                          supervisor=supervisor, manager=manager,
                                          duration=duration,
                                          creator_id=creator_id,
                                          creator_username=creator_username,
                                          creator_role=creator_role)
        
        # 如果项目是 contractor 创建的 pending 项目，通知相关审批人
        if result.get('status') == 'success' and creator_role == 'contractor':
            project_id = result.get('project_id')
            _notify_project_approvers(project_id, name, party_b, creator_id, creator_username)

        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def _notify_project_approvers(project_id, project_name, party_b, creator_id, creator_username):
    """通知项目审批人"""
    try:
        # 通知 PMO 和 admin
        approvers = user_manager.get_users_by_roles(['admin', 'pmo', 'project_admin'])
        for approver in approvers:
            # project_admin 只通知同组织的
            if approver['role'] == 'project_admin' and approver.get('organization') != party_b:
                continue
            # 不通知自己
            if approver['id'] == creator_id:
                continue
            message_manager.send_message(
                receiver_id=approver['id'],
                title='新项目待审批',
                content=f'用户 "{creator_username}" 创建了项目 "{project_name}"（承建单位：{party_b}），请尽快审批。',
                msg_type='approval',
                related_id=str(project_id),
                related_type='project'
            )
    except Exception as e:
        print(f"通知项目审批人失败: {e}")


def get_accessible_projects():
    """获取当前用户可访问的项目列表"""
    try:
        doc_manager = get_doc_manager()
        if not current_user.is_authenticated:
            return jsonify([])
        
        user_id = int(current_user.id)
        user_role = current_user.role
        user_organization = getattr(current_user, 'organization', '') or ''
        
        result = doc_manager.get_user_accessible_projects(user_id, user_role, user_organization)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def approve_project():
    """审批项目（承建单位项目经理将 pending 项目改为 approved）"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'status': 'error', 'message': '项目ID不能为空'}), 400
        
        if not current_user.is_authenticated:
            return jsonify({'status': 'error', 'message': '请先登录'}), 401
        
        if current_user.role not in ('admin', 'pmo', 'project_admin'):
            return jsonify({'status': 'error', 'message': '权限不足，只有项目经理或管理员可以审批项目'}), 403
        
        result = doc_manager.projects.approve_project(project_id, int(current_user.id))
        
        # 审批成功后通知项目创建人
        if result.get('status') == 'success':
            _notify_project_creator(project_id, approved=True)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def _notify_project_creator(project_id, approved=True):
    """通知项目创建人审批结果"""
    try:
        doc_manager = get_doc_manager()
        project_config = doc_manager.projects.load(project_id)
        if not project_config:
            return
        
        creator_id = project_config.get('creator_id')
        project_name = project_config.get('name', '未命名')
        if not creator_id:
            return
        
        creator = user_manager.get_user_by_id(int(creator_id))
        if not creator:
            return
        
        if approved:
            title = '项目已通过审批'
            content = f'您的项目 "{project_name}" 已通过审批，现在可以正常使用了。'
        else:
            title = '项目未通过审批'
            content = f'您的项目 "{project_name}" 未通过审批，请联系管理员了解详情。'
        
        message_manager.send_message(
            receiver_id=creator.id,
            title=title,
            content=content,
            msg_type='system',
            related_id=str(project_id),
            related_type='project'
        )
    except Exception as e:
        print(f"通知项目创建人失败: {e}")


def get_project(project_id):
    """获取项目详情"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.load_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_project(project_id):
    """更新项目"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json()
        result = doc_manager.update_project(project_id, data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def update_project_config(project_id):
    """更新项目配置（PATCH端点）"""
    try:
        doc_manager = get_doc_manager()
        data = request.get_json() or {}

        # 加载项目
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目加载失败'}), 500

        project_config = project_result.get('project', {})

        # 更新配置字段
        if 'archive_approval_mode' in data:
            project_config['archive_approval_mode'] = data['archive_approval_mode']

        # 保存项目配置
        save_result = doc_manager.save_project(project_config)
        if save_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '配置保存失败'}), 500

        # 记录操作日志
        from app.routes.settings import now_with_timezone
        user_manager.add_operation_log(
            int(current_user.id), current_user.username,
            'update_project_config', project_id, '',
            f'archive_approval_mode={data.get("archive_approval_mode")}',
            request.remote_addr
        )

        return jsonify({
            'status': 'success',
            'config': {
                'archive_approval_mode': project_config.get('archive_approval_mode', 'two_level')
            }
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def delete_project(project_id):
    """删除项目"""
    try:
        doc_manager = get_doc_manager()
        result = doc_manager.delete_project(project_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_dashboard_stats():
    """获取首页看板统计数据（兼容旧接口）"""
    try:
        doc_manager = get_doc_manager()
        user_context = None
        if current_user.is_authenticated:
            user_context = {
                'id': int(current_user.id),
                'role': current_user.role,
                'organization': getattr(current_user, 'organization', '') or ''
            }
        report_service = ReportService(doc_manager, user_manager, user_context)
        data = report_service.generate_report('overview')
        return jsonify({'status': 'success', 'data': data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_report_types():
    """获取支持的报表类型列表"""
    try:
        report_service = ReportService(None, user_manager)
        configs = report_service.get_report_configs()
        return jsonify({'status': 'success', 'data': configs})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_report_data():
    """获取指定类型报表数据"""
    try:
        report_type = request.args.get('type', 'overview')
        doc_manager = get_doc_manager()
        user_context = None
        if current_user.is_authenticated:
            user_context = {
                'id': int(current_user.id),
                'role': current_user.role,
                'organization': getattr(current_user, 'organization', '') or ''
            }
        report_service = ReportService(doc_manager, user_manager, user_context)
        data = report_service.generate_report(report_type)
        return jsonify({'status': 'success', 'type': report_type, 'data': data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@login_required
def initiate_project_transfer(project_id):
    """发起项目所有权移交"""
    try:
        data = request.get_json() or {}
        to_org = data.get('to_org', '').strip()
        if not to_org:
            return jsonify({'status': 'error', 'message': '请选择目标承建单位'}), 400

        doc_manager = get_doc_manager()
        project_config = doc_manager.projects.load(project_id)
        if not project_config:
            return jsonify({'status': 'error', 'message': '项目不存在'}), 404

        # 权限检查
        user_role = current_user.role
        user_org = getattr(current_user, 'organization', '') or ''
        from_org = project_config.get('party_b', '') or ''
        creator_id = project_config.get('creator_id')

        can_transfer = False
        if user_role in ('admin', 'pmo'):
            can_transfer = True
        elif user_role == 'project_admin' and user_org == from_org:
            # 项目经理可以移交本单位项目
            can_transfer = True
        elif creator_id and int(creator_id) == int(current_user.id):
            can_transfer = True

        if not can_transfer:
            return jsonify({'status': 'error', 'message': '权限不足，只有管理员、本单位项目经理或项目创建人可以发起移交'}), 403

        # 检查是否已有 pending 移交
        existing = user_manager.get_pending_transfer_by_project(project_id)
        if existing:
            return jsonify({'status': 'error', 'message': '该项目已有待处理的移交申请'}), 400

        # 检查目标单位是否有项目经理
        target_users = user_manager.get_users_by_organization(to_org)
        target_admins = [u for u in target_users if u.get('role') == 'project_admin']
        if not target_admins:
            return jsonify({'status': 'error', 'message': f'目标承建单位 "{to_org}" 暂无项目经理，无法移交'}), 400

        # 创建移交记录
        project_name = project_config.get('name', '未命名')
        result = user_manager.create_project_transfer(
            project_id, project_name, from_org, to_org, int(current_user.id)
        )
        if result['status'] != 'success':
            return jsonify(result), 500

        transfer_uuid = result['transfer_uuid']

        # 通知目标单位的项目经理（project_admin）
        for u in target_admins:
            message_manager.send_message(
                receiver_id=u['id'],
                title='项目所有权移交申请',
                content=f'项目 "{project_name}"（原单位：{from_org or "无"}）申请移交到贵单位 "{to_org}"，请尽快处理。',
                msg_type='approval',
                related_id=str(transfer_uuid),
                related_type='project_transfer'
            )

        # 记录操作日志
        user_manager.add_operation_log(
            current_user.id, current_user.username, 'initiate_project_transfer',
            str(project_id), project_name, f'to_org={to_org}', request.remote_addr
        )

        return jsonify({'status': 'success', 'message': '移交申请已发起，等待目标单位确认', 'transfer_id': transfer_uuid})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@login_required
def respond_project_transfer():
    """响应项目所有权移交"""
    try:
        data = request.get_json() or {}
        transfer_id = data.get('transfer_id')
        action = data.get('action')  # 'accept' or 'reject'

        if not transfer_id:
            return jsonify({'status': 'error', 'message': '缺少移交申请ID'}), 400
        if action not in ('accept', 'reject'):
            return jsonify({'status': 'error', 'message': '操作类型无效'}), 400

        # 通过UUID查找移交申请
        transfer = user_manager.get_project_transfer_by_uuid(str(transfer_id))
        if not transfer:
            return jsonify({'status': 'error', 'message': '移交申请不存在'}), 404
        if transfer['status'] != 'pending':
            return jsonify({'status': 'error', 'message': f'移交申请已{transfer["status"]}'}), 400

        # 检查用户是否为目标单位的项目经理（或 admin/pmo）
        user_org = getattr(current_user, 'organization', '') or ''
        is_target_admin = False
        if current_user.role == 'project_admin' and user_org == transfer['to_org']:
            is_target_admin = True
        elif current_user.role in ('admin', 'pmo'):
            is_target_admin = True
        if not is_target_admin:
            return jsonify({'status': 'error', 'message': '只有目标单位的项目经理可以处理该移交申请'}), 403

        if action == 'accept':
            # 接受移交
            result = user_manager.accept_project_transfer(transfer['id'], int(current_user.id))
            if result['status'] != 'success':
                return jsonify(result), 500

            # 更新项目配置的 party_b
            doc_manager = get_doc_manager()
            project_config = doc_manager.projects.load(transfer['project_id'])
            if project_config:
                project_config['party_b'] = transfer['to_org']
                doc_manager.projects.save(transfer['project_id'], project_config)

            # 将接受用户关联到项目
            user_manager.add_user_project(int(current_user.id), transfer['project_id'])

            # 通知发起人
            creator = user_manager.get_user_by_id(transfer['created_by']) if transfer['created_by'] else None
            if creator:
                message_manager.send_message(
                    receiver_id=creator.id,
                    title='项目所有权移交成功',
                    content=f'项目 "{transfer["project_name"]}" 已成功移交给承建单位 "{transfer["to_org"]}"（由 {current_user.username} 确认接受）。',
                    msg_type='system',
                    related_id=str(transfer['project_id']),
                    related_type='project'
                )

            # 通知目标单位其他用户
            target_users = user_manager.get_users_by_organization(transfer['to_org'], status='active')
            for u in target_users:
                if u['id'] == int(current_user.id):
                    continue
                message_manager.send_message(
                    receiver_id=u['id'],
                    title='项目所有权移交完成',
                    content=f'项目 "{transfer["project_name"]}" 的移交申请已被 {current_user.username} 接受，项目现归属本单位。',
                    msg_type='system',
                    related_id=str(transfer['project_id']),
                    related_type='project'
                )

            # 记录日志
            user_manager.add_operation_log(
                current_user.id, current_user.username, 'accept_project_transfer',
                str(transfer_id), transfer['project_name'], f'project_id={transfer["project_id"]}', request.remote_addr
            )
            return jsonify({'status': 'success', 'message': '移交已接受，项目所有权已更新'})

        else:
            # 拒绝移交：更新状态并通知发起人
            result = user_manager.reject_project_transfer(transfer['id'], int(current_user.id))
            if result['status'] != 'success':
                return jsonify(result), 500

            creator = user_manager.get_user_by_id(transfer['created_by']) if transfer['created_by'] else None
            if creator:
                message_manager.send_message(
                    receiver_id=creator.id,
                    title='项目所有权移交被拒绝',
                    content=f'用户 {current_user.username} 拒绝了项目 "{transfer["project_name"]}" 的所有权移交申请。',
                    msg_type='system',
                    related_id=str(transfer_id),
                    related_type='project_transfer'
                )
            user_manager.add_operation_log(
                current_user.id, current_user.username, 'reject_project_transfer',
                str(transfer_id), transfer['project_name'], request.remote_addr
            )
            return jsonify({'status': 'success', 'message': '已拒绝该移交申请'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@login_required
def batch_delete_projects():
    """批量删除项目"""
    try:
        if current_user.role not in ('admin', 'pmo'):
            return jsonify({'status': 'error', 'message': '权限不足'}), 403
        data = request.get_json()
        project_ids = data.get('project_ids', [])
        if not project_ids:
            return jsonify({'status': 'error', 'message': '请选择要删除的项目'}), 400
        doc_manager = get_doc_manager()
        success_count = 0
        failed = []
        for project_id in project_ids:
            result = doc_manager.delete_project(project_id)
            if result.get('status') == 'success':
                success_count += 1
            else:
                failed.append(project_id)
        user_manager.add_operation_log(
            current_user.id, current_user.username, 'batch_delete_projects',
            None, None, f'count={success_count}', request.remote_addr
        )
        return jsonify({'status': 'success', 'message': f'已删除 {success_count} 个项目', 'failed': failed})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@login_required
def batch_update_projects():
    """批量更新项目字段（如 party_b）"""
    try:
        if current_user.role not in ('admin', 'pmo'):
            return jsonify({'status': 'error', 'message': '权限不足'}), 403
        data = request.get_json()
        project_ids = data.get('project_ids', [])
        updates = data.get('updates', {})
        if not project_ids:
            return jsonify({'status': 'error', 'message': '请选择要修改的项目'}), 400
        if not updates:
            return jsonify({'status': 'error', 'message': '没有要修改的字段'}), 400
        doc_manager = get_doc_manager()
        result = doc_manager.projects.batch_update_projects(project_ids, updates)
        user_manager.add_operation_log(
            current_user.id, current_user.username, 'batch_update_projects',
            None, None, f'count={result.get("success_count", 0)}', request.remote_addr
        )
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@login_required
def batch_update_project_status():
    """批量更新项目状态（启用/停用/审批）"""
    try:
        if current_user.role not in ('admin', 'pmo'):
            return jsonify({'status': 'error', 'message': '权限不足'}), 403
        data = request.get_json()
        project_ids = data.get('project_ids', [])
        status = data.get('status', '')
        if not project_ids:
            return jsonify({'status': 'error', 'message': '请选择项目'}), 400
        if status not in ('approved', 'pending', 'disabled'):
            return jsonify({'status': 'error', 'message': '无效的状态值'}), 400
        doc_manager = get_doc_manager()
        result = doc_manager.projects.batch_update_project_status(project_ids, status)
        user_manager.add_operation_log(
            current_user.id, current_user.username, 'batch_update_project_status',
            None, None, f'status={status}, count={result.get("success_count", 0)}', request.remote_addr
        )
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


@login_required
def list_all_projects():
    """列出所有项目（管理员/PMO）或本单位项目（项目经理）"""
    try:
        doc_manager = get_doc_manager()
        if current_user.role in ('admin', 'pmo'):
            projects = doc_manager.projects.list_all()
        elif current_user.role == 'project_admin':
            user_id = int(current_user.id)
            user_organization = getattr(current_user, 'organization', '') or ''
            projects = doc_manager.get_user_accessible_projects(user_id, current_user.role, user_organization)
        else:
            return jsonify({'status': 'error', 'message': '权限不足'}), 403

        for proj in projects:
            config = doc_manager.projects.load(proj['id'])
            if config:
                proj['status'] = config.get('status', 'approved')
                proj['party_b'] = config.get('party_b', '')
                proj['creator_username'] = config.get('creator_username', '')
        return jsonify({'status': 'success', 'projects': projects})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500
