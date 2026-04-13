"""归档审批相关路由"""

import json
from flask import request, jsonify
from flask_login import current_user
from werkzeug.security import check_password_hash, generate_password_hash

from app.models.user import user_manager
from app.models.message import message_manager
from app.routes.settings import now_with_timezone
from .utils import get_doc_manager


def get_archive_approvers(project_id):
    """获取可审批的项目经理列表（同组织的 project_admin + admin + pmo）"""
    try:
        import sys
        print(f'[DEBUG] get_archive_approvers called - project_id: {project_id}', file=sys.stderr, flush=True)
        approvers = user_manager.get_users_by_roles(['admin', 'pmo', 'project_admin'])
        print(f'[DEBUG] Found {len(approvers) if approvers else 0} approvers with roles', file=sys.stderr, flush=True)

        # 加载项目获取承建单位信息
        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        party_b = ''
        if project_result.get('status') == 'success':
            party_b = (project_result.get('project', {}).get('party_b', '') or '').strip()
            print(f'[DEBUG] Project party_b: {party_b}', file=sys.stderr, flush=True)

        result = []
        for a in approvers:
            if a.get('status') != 'active':
                print(f'[DEBUG] Skipping user {a.get("username")} - status not active: {a.get("status")}', file=sys.stderr, flush=True)
                continue
            # project_admin 需要组织匹配（同承建单位）
            if a['role'] == 'project_admin':
                user_org = (a.get('organization') or '').strip()
                if party_b and user_org and user_org != party_b:
                    print(f'[DEBUG] Skipping project_admin {a.get("username")} - org mismatch: {user_org} != {party_b}', file=sys.stderr, flush=True)
                    continue
                # 如果项目未设置承建单位或用户无组织，也允许
            print(f'[DEBUG] Including approver: {a.get("username")} ({a.get("role")})', file=sys.stderr, flush=True)
            result.append({
                'id': a.get('uuid', a['id']),
                'username': a['username'],
                'role': a['role'],
                'organization': a.get('organization', '')
            })

        print(f'[DEBUG] Returning {len(result)} approvers', file=sys.stderr, flush=True)
        return jsonify({'status': 'success', 'approvers': result})
    except Exception as e:
        import traceback
        print(f'[ERROR] get_archive_approvers failed: {e}', file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'status': 'error', 'message': str(e)}), 500


def submit_archive_request(project_id):
    """提交归档审核请求"""
    try:
        import sys
        data = request.get_json() or {}
        cycle = (data.get('cycle') or '').strip()
        doc_names = data.get('doc_names', [])
        doc_name = data.get('doc_name')
        target_approver_ids = data.get('target_approver_ids', [])

        print(f'[DEBUG] submit_archive_request - project_id: {project_id}, cycle: {cycle}, doc_names: {doc_names}, target_approver_ids: {target_approver_ids}', file=sys.stderr, flush=True)

        if doc_name and not doc_names:
            doc_names = [doc_name]

        if not cycle or not doc_names:
            print(f'[DEBUG] Invalid parameters - cycle: {cycle}, doc_names: {doc_names}', file=sys.stderr, flush=True)
            return jsonify({'status': 'error', 'message': '归档参数不完整'}), 400

        # 检查是否已存在相同的待审批请求
        if user_manager.has_pending_archive_approval(project_id, cycle, doc_names):
            print(f'[DEBUG] Duplicate pending request found', file=sys.stderr, flush=True)
            return jsonify({'status': 'error', 'message': '已存在相同的待审批请求，请勿重复提交'}), 400

        requester_id = int(current_user.id)
        requester_username = current_user.username

        result = user_manager.create_archive_approval(
            project_id, cycle, doc_names,
            requester_id, requester_username,
            target_approver_ids
        )

        print(f'[DEBUG] create_archive_approval result: {result}', file=sys.stderr, flush=True)

        if result.get('status') == 'success':
            approval_uuid = result['uuid']
            doc_manager = get_doc_manager()
            project_result = doc_manager.load_project(project_id)
            project_name = project_id
            if project_result.get('status') == 'success':
                project_name = project_result.get('project', {}).get('name', project_id)

            doc_list = '、'.join(doc_names[:5])
            if len(doc_names) > 5:
                doc_list += f'等{len(doc_names)}个文档'

            # 向指定审批人发送消息
            if target_approver_ids:
                for approver_id in target_approver_ids:
                    if approver_id != requester_id:
                        print(f'[DEBUG] Sending message to approver {approver_id}', file=sys.stderr, flush=True)
                        message_manager.send_message(
                            receiver_id=approver_id,
                            title='归档审批请求',
                            content=f'用户 "{requester_username}" 申请归档项目 "{project_name}" 周期 "{cycle}" 的文档：{doc_list}，请审批。',
                            sender_id=requester_id,
                            msg_type='archive_approval',
                            related_id=str(approval_uuid),
                            related_type='archive_approval'
                        )

            user_manager.add_operation_log(
                requester_id, requester_username,
                'archive_request', project_id, cycle,
                json.dumps(doc_names, ensure_ascii=False),
                request.remote_addr
            )

        return jsonify(result)
    except Exception as e:
        import traceback
        import sys
        print(f'[ERROR] submit_archive_request failed: {e}', file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_archive_requests(project_id):
    """查询归档审批列表"""
    try:
        status_filter = request.args.get('status')
        approvals = user_manager.get_archive_approvals(project_id, status=status_filter)
        # 用UUID替代内部ID返回给前端
        for a in approvals:
            a['id'] = a.get('uuid', a['id'])
        return jsonify({'status': 'success', 'requests': approvals})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def approve_archive_request(project_id):
    """审批通过归档请求（快速审批 - 需要审批安全码）"""
    try:
        data = request.get_json() or {}
        approval_id = data.get('approval_id')
        approver_id = data.get('approver_id')  # 选择的审批人身份 ID
        approval_code = data.get('approval_code', '')
        new_approval_code = data.get('new_approval_code', '')

        if not approval_id:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400
        if not approval_code:
            return jsonify({'status': 'error', 'message': '请输入审批安全码'}), 400

        # 确定实际审批人：通过UUID解析
        if approver_id:
            approver = user_manager.get_user_by_uuid(str(approver_id))
        else:
            approver = user_manager.get_user_by_id(int(current_user.id))
        actual_approver_id = approver.id if approver else None

        # 验证审批人权限
        if not approver:
            return jsonify({'status': 'error', 'message': '审批人不存在'}), 404
        if approver.role not in ('admin', 'pmo', 'project_admin'):
            return jsonify({'status': 'error', 'message': '该用户无审批权限'}), 403

        # 验证审批安全码
        if getattr(approver, 'approval_code_needs_change', 1) == 1:
            if not check_password_hash(approver.password_hash, approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码验证失败'}), 400
            if not new_approval_code:
                return jsonify({'status': 'needs_change', 'message': '首次使用审批安全码需重新设置'}), 200
            if len(new_approval_code) < 8 or not any(c.isalpha() for c in new_approval_code) or not any(c.isdigit() for c in new_approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码需至少8位，且必须包含字母和数字'}), 400
            user_manager.update_approval_code(actual_approver_id, generate_password_hash(new_approval_code), needs_change=0)
        elif not approver.approval_code_hash or not check_password_hash(approver.approval_code_hash, approval_code):
            return jsonify({'status': 'error', 'message': '审批安全码错误'}), 400

        # 获取审批请求（通过UUID查找）
        approval = user_manager.get_archive_approval_by_uuid(str(approval_id))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404
        if approval['status'] != 'pending':
            return jsonify({'status': 'error', 'message': '该请求已处理'}), 400
        if approval['project_id'] != project_id:
            return jsonify({'status': 'error', 'message': '审批请求与项目不匹配'}), 400

        # 执行归档
        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目加载失败'}), 500

        project_config = project_result.get('project', {})
        cycle = approval['cycle']
        doc_names = approval['doc_names']

        if 'documents' not in project_config or cycle not in project_config.get('documents', {}):
            return jsonify({'status': 'error', 'message': '归档周期不存在'}), 400

        if 'documents_archived' not in project_config:
            project_config['documents_archived'] = {}
        if cycle not in project_config['documents_archived']:
            project_config['documents_archived'][cycle] = {}

        for name in doc_names:
            if isinstance(name, str) and name:
                project_config['documents_archived'][cycle][name] = True

        save_result = doc_manager.save_project(project_config)
        if save_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': save_result.get('message', '归档保存失败')}), 500

        # 更新审批状态
        user_manager.resolve_archive_approval(approval['id'], 'approved', actual_approver_id, approver.username)

        # 通知申请人
        message_manager.send_message(
            receiver_id=approval['requester_id'],
            title='归档审批已通过',
            content=f'您申请的 "{cycle}" 周期文档归档已由 "{approver.username}" 审批通过。',
            sender_id=actual_approver_id,
            msg_type='archive_approval',
            related_id=str(approval_id),
            related_type='archive_approval'
        )

        user_manager.add_operation_log(
            actual_approver_id, approver.username,
            'archive_approve', project_id, cycle,
            json.dumps(doc_names, ensure_ascii=False),
            request.remote_addr
        )

        return jsonify({'status': 'success', 'message': '归档审批通过'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def reject_archive_request(project_id):
    """驳回归档请求"""
    try:
        data = request.get_json() or {}
        approval_id = data.get('approval_id')
        approver_id = data.get('approver_id')
        approval_code = data.get('approval_code', '')
        new_approval_code = data.get('new_approval_code', '')
        reject_reason = data.get('reject_reason', '')

        if not approval_id:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400
        if not approval_code:
            return jsonify({'status': 'error', 'message': '请输入审批安全码'}), 400

        # 通过UUID解析审批人
        if approver_id:
            approver = user_manager.get_user_by_uuid(str(approver_id))
        else:
            approver = user_manager.get_user_by_id(int(current_user.id))
        actual_approver_id = approver.id if approver else None

        if not approver:
            return jsonify({'status': 'error', 'message': '审批人不存在'}), 404
        if approver.role not in ('admin', 'pmo', 'project_admin'):
            return jsonify({'status': 'error', 'message': '该用户无审批权限'}), 403

        # 验证审批安全码
        if getattr(approver, 'approval_code_needs_change', 1) == 1:
            if not check_password_hash(approver.password_hash, approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码验证失败'}), 400
            if not new_approval_code:
                return jsonify({'status': 'needs_change', 'message': '首次使用审批安全码需重新设置'}), 200
            if len(new_approval_code) < 8 or not any(c.isalpha() for c in new_approval_code) or not any(c.isdigit() for c in new_approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码需至少8位，且必须包含字母和数字'}), 400
            user_manager.update_approval_code(actual_approver_id, generate_password_hash(new_approval_code), needs_change=0)
        elif not approver.approval_code_hash or not check_password_hash(approver.approval_code_hash, approval_code):
            return jsonify({'status': 'error', 'message': '审批安全码错误'}), 400

        approval = user_manager.get_archive_approval_by_uuid(str(approval_id))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404
        if approval['status'] != 'pending':
            return jsonify({'status': 'error', 'message': '该请求已处理'}), 400
        if approval['project_id'] != project_id:
            return jsonify({'status': 'error', 'message': '审批请求与项目不匹配'}), 400

        user_manager.resolve_archive_approval(approval['id'], 'rejected', actual_approver_id, approver.username, reject_reason)

        # 通知申请人
        reason_text = f'（原因：{reject_reason}）' if reject_reason else ''
        message_manager.send_message(
            receiver_id=approval['requester_id'],
            title='归档审批被驳回',
            content=f'您申请的 "{approval["cycle"]}" 周期文档归档已由 "{approver.username}" 驳回{reason_text}。',
            sender_id=actual_approver_id,
            msg_type='archive_approval',
            related_id=str(approval_id),
            related_type='archive_approval'
        )

        user_manager.add_operation_log(
            actual_approver_id, approver.username,
            'archive_reject', project_id, approval['cycle'],
            json.dumps({'doc_names': approval['doc_names'], 'reason': reject_reason}, ensure_ascii=False),
            request.remote_addr
        )

        return jsonify({'status': 'success', 'message': '归档审批已驳回'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def archive_project_document(project_id):
    """直接归档文档（保留旧接口兼容 - 需审批安全码）"""
    try:
        data = request.get_json() or {}
        cycle = (data.get('cycle') or '').strip()
        doc_name = data.get('doc_name')
        doc_names = data.get('doc_names')
        approval_code = data.get('approval_code', '')
        new_approval_code = data.get('new_approval_code', '')

        if not cycle or not (doc_name or (isinstance(doc_names, list) and len(doc_names) > 0)):
            return jsonify({'status': 'error', 'message': '归档参数不完整'}), 400
        if not approval_code:
            return jsonify({'status': 'error', 'message': '请输入审批安全码'}), 400
        if current_user.role not in ('admin', 'pmo', 'project_admin'):
            return jsonify({'status': 'error', 'message': '权限不足'}), 403

        user = user_manager.get_user_by_id(int(current_user.id))
        if not user:
            return jsonify({'status': 'error', 'message': '用户不存在'}), 404

        if getattr(user, 'approval_code_needs_change', 1) == 1:
            if not check_password_hash(user.password_hash, approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码验证失败'}), 400
            if not new_approval_code:
                return jsonify({'status': 'needs_change', 'message': '首次使用审批安全码需重新设置'}), 400
            if len(new_approval_code) < 8 or not any(c.isalpha() for c in new_approval_code) or not any(c.isdigit() for c in new_approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码需至少8位，且必须包含字母和数字'}), 400
            user_manager.update_approval_code(int(current_user.id), generate_password_hash(new_approval_code), needs_change=0)
        elif not user.approval_code_hash or not check_password_hash(user.approval_code_hash, approval_code):
            return jsonify({'status': 'error', 'message': '审批安全码错误'}), 400

        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': project_result.get('message', '项目加载失败')}), 500

        project_config = project_result.get('project', {})
        if 'documents' not in project_config or cycle not in project_config['documents']:
            return jsonify({'status': 'error', 'message': '归档周期不存在'}), 400

        if 'documents_archived' not in project_config:
            project_config['documents_archived'] = {}
        if cycle not in project_config['documents_archived']:
            project_config['documents_archived'][cycle] = {}

        target_names = [doc_name] if doc_name else (doc_names or [])
        for name in target_names:
            if isinstance(name, str) and name:
                project_config['documents_archived'][cycle][name] = True

        save_result = doc_manager.save_project(project_config)
        if save_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': save_result.get('message', '归档保存失败')}), 500

        user_manager.add_operation_log(
            int(current_user.id), current_user.username,
            'archive_document', project_id, cycle,
            json.dumps(target_names, ensure_ascii=False),
            request.remote_addr
        )

        return jsonify({'status': 'success', 'message': '文档归档成功'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
