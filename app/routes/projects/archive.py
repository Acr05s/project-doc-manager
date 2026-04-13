"""归档审批相关路由"""

import json
import sqlite3
import logging
from flask import request, jsonify
from flask_login import current_user
from werkzeug.security import check_password_hash, generate_password_hash

from app.models.user import user_manager
from app.models.message import message_manager
from app.routes.settings import now_with_timezone
from .utils import get_doc_manager

logger = logging.getLogger(__name__)


# ===== 多级审批 Helper 函数 =====

def initialize_approval_stages(project_config):
    """根据项目配置初始化审批阶段结构"""
    approval_mode = project_config.get('archive_approval_mode', 'two_level')
    approval_chain = project_config.get('archive_approval_chain', [])

    stages = []
    for stage_config in approval_chain:
        stages.append({
            'level': stage_config.get('level', 1),
            'required_role': stage_config.get('required_role'),
            'org_match': stage_config.get('org_match'),
            'status': 'pending',
            'assigned_to_id': None,
            'assigned_to_username': None,
            'approved_by_id': None,
            'approved_by_username': None,
            'approved_at': None,
            'reject_reason': None
        })
    return stages


def get_next_stage_approvers(project_id, current_stage, approval_chain, project_config):
    """获取下一阶段的审批人列表

    Args:
        project_id: 项目ID
        current_stage: 当前完成的阶段（0表示第一阶段开始）
        approval_chain: 审批链配置
        project_config: 项目配置

    Returns:
        list: 符合条件的审批人列表
    """
    if current_stage >= len(approval_chain):
        return []

    next_stage_config = approval_chain[current_stage]
    required_role = next_stage_config.get('required_role')
    org_match = next_stage_config.get('org_match')

    # 获取具有指定角色的所有活跃用户
    approvers = user_manager.get_users_by_roles([required_role])
    result = []

    for approver in approvers:
        if approver.get('status') != 'active':
            continue

        # 如果配置了组织匹配，检查组织
        if org_match == 'party_b':
            user_org = (approver.get('organization') or '').strip()
            project_org = (project_config.get('party_b') or '').strip()
            if project_org and user_org and user_org != project_org:
                continue

        result.append({
            'id': approver.get('uuid', approver.get('id')),
            'username': approver['username'],
            'role': approver['role'],
            'organization': approver.get('organization', '')
        })

    return result


def should_proceed_to_next_stage(approval_stages):
    """检查是否所有阶段都已完成

    Returns:
        tuple: (is_all_completed, next_stage_index)
    """
    for i, stage in enumerate(approval_stages):
        if stage['status'] == 'pending':
            return False, i
    return True, len(approval_stages)


def complete_archive_if_all_stages_done(approval_id, project_id, approval_record, doc_manager):
    """如果所有阶段都完成，执行文档归档"""
    approval_stages = json.loads(approval_record.get('approval_stages', '[]'))

    # 检查所有阶段是否都已批准
    for stage in approval_stages:
        if stage['status'] != 'approved':
            return False

    # 所有阶段都已批准，执行归档
    project_result = doc_manager.load_project(project_id)
    if project_result.get('status') != 'success':
        return False

    project_config = project_result.get('project', {})
    cycle = approval_record.get('cycle')
    doc_names = json.loads(approval_record.get('doc_names', '[]'))

    if 'documents_archived' not in project_config:
        project_config['documents_archived'] = {}
    if cycle not in project_config['documents_archived']:
        project_config['documents_archived'][cycle] = {}

    for doc_name in doc_names:
        if isinstance(doc_name, str) and doc_name:
            project_config['documents_archived'][cycle][doc_name] = True

    save_result = doc_manager.save_project(project_config)
    return save_result.get('status') == 'success'


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
    """提交归档审核请求（自动路由到第一阶段审批人）"""
    try:
        import sys
        data = request.get_json() or {}
        cycle = (data.get('cycle') or '').strip()
        doc_names = data.get('doc_names', [])
        doc_name = data.get('doc_name')

        print(f'[DEBUG] submit_archive_request - project_id: {project_id}, cycle: {cycle}, doc_names: {doc_names}', file=sys.stderr, flush=True)

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

        # 加载项目配置以获取审批链
        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目加载失败'}), 500

        project_config = project_result.get('project', {})
        project_name = project_config.get('name', project_id)
        approval_chain = project_config.get('archive_approval_chain', [])

        # 初始化audit approval_stages
        approval_stages = initialize_approval_stages(project_config)
        if not approval_stages:
            return jsonify({'status': 'error', 'message': '审批链配置错误'}), 400

        print(f'[DEBUG] Initialized {len(approval_stages)} approval stages', file=sys.stderr, flush=True)

        # 获取第一阶段的审批人
        level_1_approvers = get_next_stage_approvers(project_id, 0, approval_chain, project_config)
        if not level_1_approvers:
            print(f'[DEBUG] No Level 1 approvers found', file=sys.stderr, flush=True)
            return jsonify({'status': 'error', 'message': '未找到项目经理，请联系管理员配置'}), 400

        print(f'[DEBUG] Found {len(level_1_approvers)} Level 1 approvers', file=sys.stderr, flush=True)

        # 创建归档审批记录（带有approval_stages）
        result = user_manager.create_archive_approval(
            project_id, cycle, doc_names,
            requester_id, requester_username,
            []  # 不再使用target_approver_ids，自动路由
        )

        if result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '创建审批记录失败'}), 500

        approval_id = result['id']
        approval_uuid = result['uuid']

        # 更新approval_stages到数据库
        import sqlite3
        from pathlib import Path
        db_path = Path(user_manager.db_path)
        with sqlite3.connect(str(db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE archive_approvals SET approval_stages = ?, current_stage = 1, stage_completed = 0 WHERE id = ?',
                (json.dumps(approval_stages, ensure_ascii=False), approval_id)
            )
            conn.commit()

        print(f'[DEBUG] Updated approval_stages for approval_id: {approval_id}', file=sys.stderr, flush=True)

        # 向第一阶段的所有审批人发送通知
        doc_list = '、'.join(doc_names[:5])
        if len(doc_names) > 5:
            doc_list += f'等{len(doc_names)}个文档'

        for approver in level_1_approvers:
            approver_id = int(approver['id']) if isinstance(approver['id'], str) and approver['id'].isdigit() else approver['id']
            if approver_id != requester_id:
                print(f'[DEBUG] Sending notification to Level 1 approver {approver_id}', file=sys.stderr, flush=True)
                message_manager.send_message(
                    receiver_id=approver_id,
                    title='待审批：文档归档申请',
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

        print(f'[DEBUG] Archive request created successfully - approval_uuid: {approval_uuid}', file=sys.stderr, flush=True)

        return jsonify({
            'status': 'success',
            'approval_id': approval_uuid,
            'current_stage': 1,
            'total_stages': len(approval_stages),
            'message': f'归档审批请求已提交，等待项目经理审批'
        })

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


def get_pending_archive_approvals():
    """获取当前用户需要审批的文档归档请求"""
    try:
        user_id = int(current_user.id)
        user_role = current_user.role

        # 获取当前用户待审批的记录（status='pending' 且 current_stage 对应用户角色）
        pending_approvals = user_manager.get_pending_archive_approvals_for_user(user_id, user_role)

        # 格式化返回数据
        formatted = []
        for approval in pending_approvals:
            approval['id'] = approval.get('uuid', approval['id'])
            # 解析approval_stages JSON
            if isinstance(approval.get('approval_stages'), str):
                try:
                    approval['approval_stages'] = json.loads(approval['approval_stages'])
                except:
                    approval['approval_stages'] = []
            # 解析stage_history JSON
            if isinstance(approval.get('stage_history'), str):
                try:
                    approval['stage_history'] = json.loads(approval['stage_history'])
                except:
                    approval['stage_history'] = []
            formatted.append(approval)

        return jsonify({'status': 'success', 'approvals': formatted})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500



def approve_archive_request(project_id):
    """审批当前阶段的归档请求（支持多级审批）"""
    try:
        import sys
        import sqlite3
        from pathlib import Path

        data = request.get_json() or {}
        approval_id = data.get('approval_id')
        approver_id = data.get('approver_id')
        approval_code = data.get('approval_code', '')
        new_approval_code = data.get('new_approval_code', '')

        if not approval_id:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400
        if not approval_code:
            return jsonify({'status': 'error', 'message': '请输入审批安全码'}), 400

        # 确定实际审批人
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

        # 获取审批记录
        approval = user_manager.get_archive_approval_by_uuid(str(approval_id))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404
        if approval['status'] != 'pending':
            return jsonify({'status': 'error', 'message': '该请求已处理'}), 400
        if approval['project_id'] != project_id:
            return jsonify({'status': 'error', 'message': '审批请求与项目不匹配'}), 400

        # 加载项目配置
        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目加载失败'}), 500

        project_config = project_result.get('project', {})
        cycle = approval['cycle']
        doc_names = json.loads(approval.get('doc_names', '[]'))
        approval_chain = project_config.get('archive_approval_chain', [])

        # 加载当前approval_stages
        approval_stages = json.loads(approval.get('approval_stages', '[]'))
        current_stage_idx = approval.get('current_stage', 1) - 1

        if current_stage_idx < 0 or current_stage_idx >= len(approval_stages):
            return jsonify({'status': 'error', 'message': '审批阶段异常'}), 400

        # 更新当前阶段为已批准
        approval_stages[current_stage_idx]['status'] = 'approved'
        approval_stages[current_stage_idx]['approved_by_id'] = actual_approver_id
        approval_stages[current_stage_idx]['approved_by_username'] = approver.username
        approval_stages[current_stage_idx]['approved_at'] = now_with_timezone().isoformat()

        print(f'[DEBUG] Stage {current_stage_idx + 1} approved by {approver.username}', file=sys.stderr, flush=True)

        # 检查是否所有阶段都已完成
        all_completed = all(stage['status'] == 'approved' for stage in approval_stages)

        if all_completed:
            # 执行最终归档
            print(f'[DEBUG] All stages completed - executing archive', file=sys.stderr, flush=True)
            if complete_archive_if_all_stages_done(approval['id'], project_id, approval, doc_manager):
                # 更新审批状态为已完成
                user_manager.resolve_archive_approval(approval['id'], 'approved', actual_approver_id, approver.username)

                # 通知申请人
                message_manager.send_message(
                    receiver_id=approval['requester_id'],
                    title='文档已归档',
                    content=f'您申请的 "{cycle}" 周期文档归档已完成所有审批，文档已归档。',
                    sender_id=actual_approver_id,
                    msg_type='archive_approval',
                    related_id=str(approval_id),
                    related_type='archive_approval'
                )

                # 更新数据库的approval_stages
                db_path = Path(user_manager.db_path)
                with sqlite3.connect(str(db_path)) as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        'UPDATE archive_approvals SET approval_stages = ?, stage_completed = 1 WHERE id = ?',
                        (json.dumps(approval_stages, ensure_ascii=False), approval['id'])
                    )
                    conn.commit()

                user_manager.add_operation_log(
                    actual_approver_id, approver.username,
                    'archive_approve', project_id, cycle,
                    json.dumps(doc_names, ensure_ascii=False),
                    request.remote_addr
                )

                return jsonify({
                    'status': 'success',
                    'message': '文档已归档',
                    'current_stage': current_stage_idx + 1,
                    'total_stages': len(approval_stages),
                    'all_complete': True
                })
            else:
                return jsonify({'status': 'error', 'message': '执行归档失败'}), 500

        else:
            # 还有更多阶段，通知下一阶段审批人
            next_stage_idx = current_stage_idx + 1
            next_stage_config = approval_chain[next_stage_idx] if next_stage_idx < len(approval_chain) else None

            if not next_stage_config:
                return jsonify({'status': 'error', 'message': '审批链配置不一致'}), 400

            # 获取下一阶段的审批人
            next_approvers = get_next_stage_approvers(project_id, next_stage_idx, approval_chain, project_config)
            if not next_approvers:
                return jsonify({'status': 'error', 'message': '未找到下一级审批人'}), 400

            print(f'[DEBUG] Moving to stage {next_stage_idx + 1}, found {len(next_approvers)} approvers', file=sys.stderr, flush=True)

            # 更新审批记录的当前阶段和approval_stages
            db_path = Path(user_manager.db_path)
            with sqlite3.connect(str(db_path)) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE archive_approvals SET approval_stages = ?, current_stage = ? WHERE id = ?',
                    (json.dumps(approval_stages, ensure_ascii=False), next_stage_idx + 1, approval['id'])
                )
                conn.commit()

            # 通知下一阶段审批人
            doc_list = '、'.join(doc_names[:5])
            if len(doc_names) > 5:
                doc_list += f'等{len(doc_names)}个文档'

            project_name = project_config.get('name', project_id)
            for approver_info in next_approvers:
                approver_next_id = int(approver_info['id']) if isinstance(approver_info['id'], str) and approver_info['id'].isdigit() else approver_info['id']
                message_manager.send_message(
                    receiver_id=approver_next_id,
                    title='待审批：文档归档申请',
                    content=f'项目 "{project_name}" 周期 "{cycle}" 的文档归档申请（{doc_list}）已通过项目经理审批，现需您（PMO）审批。',
                    sender_id=actual_approver_id,
                    msg_type='archive_approval',
                    related_id=str(approval_id),
                    related_type='archive_approval'
                )

            # 通知申请人阶段通过
            message_manager.send_message(
                receiver_id=approval['requester_id'],
                title='归档申请已通过第一级审批',
                content=f'您申请的 "{cycle}" 周期文档归档已由 "{approver.username}" 审批通过，现等待PMO审批。',
                sender_id=actual_approver_id,
                msg_type='archive_approval',
                related_id=str(approval_id),
                related_type='archive_approval'
            )

            user_manager.add_operation_log(
                actual_approver_id, approver.username,
                'archive_stage_approve', project_id, cycle,
                json.dumps({'stage': current_stage_idx + 1, 'doc_names': doc_names}, ensure_ascii=False),
                request.remote_addr
            )

            return jsonify({
                'status': 'stage_approved',
                'message': f'第 {current_stage_idx + 1} 阶段已批准，等待第 {next_stage_idx + 1} 阶段审批',
                'current_stage': current_stage_idx + 1,
                'next_stage': next_stage_idx + 1,
                'total_stages': len(approval_stages),
                'all_complete': False
            })

    except Exception as e:
        import traceback
        import sys
        print(f'[ERROR] approve_archive_request failed: {e}', file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
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


def withdraw_archive_request(project_id):
    """撤回归档请求（仅申请人可操作，且请求状态必须为pending）"""
    try:
        data = request.get_json() or {}
        approval_id = data.get('approval_id')

        if not approval_id:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400

        # 获取审批请求
        approval = user_manager.get_archive_approval_by_uuid(str(approval_id))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404

        # 检查权限：只有申请人可撤回
        if approval['requester_id'] != int(current_user.id):
            return jsonify({'status': 'error', 'message': '只有申请人才能撤回请求'}), 403

        # 检查状态：只有pending状态的请求才能撤回
        if approval['status'] != 'pending':
            return jsonify({'status': 'error', 'message': '只有待审批的请求才能撤回'}), 400

        # 更新状态为withdrawn
        with sqlite3.connect(str(user_manager.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE archive_approvals SET status = ? WHERE id = ?',
                ('withdrawn', approval['id'])
            )
            conn.commit()

        # 记录操作日志
        user_manager.add_operation_log(
            int(current_user.id), current_user.username,
            'withdraw_archive_request', project_id, approval.get('cycle', ''),
            f'approval_id={approval_id}', request.remote_addr
        )

        return jsonify({'status': 'success', 'message': '已撤回归档请求'})
    except Exception as e:
        logger.error(f"撤回归档请求失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500
