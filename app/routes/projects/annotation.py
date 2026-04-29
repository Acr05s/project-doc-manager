"""标注完成审批相关路由

审批流程：
- 项目经理(project_admin)发起 → PMO成员(pmo/pmo_leader)审核
- PMO成员(pmo)发起 → PMO负责人(pmo_leader)审核，可终结或流转到其他人
"""

import json
import sqlite3
import logging
from pathlib import Path
from flask import request, jsonify
from flask_login import current_user
from werkzeug.security import check_password_hash, generate_password_hash

from app.models.user import user_manager
from app.models.message import message_manager
from app.routes.settings import now_with_timezone, load_settings
from .utils import get_doc_manager
from .archive import (
    initialize_approval_stages,
    get_next_stage_approvers,
    _can_user_handle_archive_approval,
    _is_eligible_current_stage_approver,
)

logger = logging.getLogger(__name__)


def _append_annotation_stage_history(approval_id, action, user_id=None, username=None, stage=None, detail=None, display_name=None):
    """追加流程历史记录到 annotation_approvals.stage_history"""
    db_path = Path(user_manager.db_path)
    try:
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT stage_history FROM annotation_approvals WHERE id = ?', (approval_id,))
            row = cursor.fetchone()
            if not row:
                return
            history = []
            if row['stage_history']:
                try:
                    history = json.loads(row['stage_history'])
                except:
                    history = []
            entry = {
                'action': action,
                'timestamp': now_with_timezone().strftime('%Y-%m-%d %H:%M:%S'),
                'user_id': user_id,
                'username': username,
                'display_name': display_name or username,
            }
            if stage is not None:
                entry['stage'] = stage
            if detail:
                entry['detail'] = detail
            history.append(entry)
            cursor.execute(
                'UPDATE annotation_approvals SET stage_history = ? WHERE id = ?',
                (json.dumps(history, ensure_ascii=False), approval_id)
            )
            conn.commit()
    except Exception as e:
        logger.error(f'_append_annotation_stage_history failed: {e}')


def _build_annotation_approval_chain(requester_role, requester_org, project_config):
    """根据发起人角色构建标注完成审批链"""
    if requester_role == 'pmo' and requester_org == 'PMO':
        # PMO成员发起 → PMO负责人审核（可终结或流转）
        return [
            {'level': 1, 'required_role': 'pmo_leader', 'org_match': 'pmo'},
        ]
    # 项目经理或其他角色发起 → PMO成员审核（pmo_leader也是PMO成员）
    return [
        {'level': 1, 'required_role': 'pmo', 'org_match': 'pmo'},
    ]


def _complete_annotation(approval_id, approval_record, doc_manager):
    """审批通过后，将标注完成信息写入文档的 custom_attrs"""
    doc_id = approval_record.get('doc_id')
    entry_id = approval_record.get('entry_id')
    content = approval_record.get('complete_content', '')
    requester_username = approval_record.get('requester_username', '')

    if not doc_id or not entry_id:
        return False

    try:
        # 通过 documents_db 或项目配置查找文档
        doc_data = None
        if doc_id in doc_manager.documents_db:
            doc_data = doc_manager.documents_db[doc_id]
        else:
            if hasattr(doc_manager, 'projects') and doc_manager.projects:
                for pid, pdata in doc_manager.projects.projects_db.items():
                    if 'documents' in pdata:
                        for cycle, cycle_info in pdata['documents'].items():
                            for doc in cycle_info.get('uploaded_docs', []):
                                if doc.get('doc_id') == doc_id:
                                    doc_data = doc
                                    break

        if not doc_data:
            logger.warning(f'标注完成：文档 {doc_id} 不存在')
            return False

        custom_attrs = doc_data.get('custom_attrs', {})
        if isinstance(custom_attrs, str):
            try:
                custom_attrs = json.loads(custom_attrs)
            except:
                custom_attrs = {}

        annotation_complete = custom_attrs.get('_annotationComplete', {})
        annotation_complete[entry_id] = {
            'user': requester_username,
            'time': now_with_timezone().strftime('%Y-%m-%d %H:%M:%S'),
            'content': content,
            'approved': True,
            'approval_uuid': approval_record.get('uuid', ''),
        }
        custom_attrs['_annotationComplete'] = annotation_complete

        doc_manager.update_document(doc_id, {'custom_attrs': custom_attrs})
        return True
    except Exception as e:
        logger.error(f'_complete_annotation failed: {e}')
        return False


def _try_auto_archive_after_annotation(approval, project_id, project_config, doc_manager, db_path):
    """标注审批通过后，检查该文档类型下所有标注是否都已完成，如果是则自动发起归档"""
    auto_archive_doc_name = approval.get('auto_archive_doc_name', '')
    if not auto_archive_doc_name:
        return False

    cycle = approval.get('cycle', '')
    if not cycle:
        return False

    try:
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                'SELECT id, status, auto_archive_doc_name FROM annotation_approvals '
                'WHERE project_id = ? AND cycle = ? AND auto_archive_doc_name = ? AND status = ?',
                (project_id, cycle, auto_archive_doc_name, 'pending')
            )
            pending_rows = cursor.fetchall()

        if len(pending_rows) > 0:
            logger.info(f'自动归档：文档 {auto_archive_doc_name} 还有 {len(pending_rows)} 条标注审批未完成，暂不归档')
            return False

        # 所有标注审批都已完成，检查是否已归档
        archived_map = project_config.get('documents_archived', {})
        cycle_archived = archived_map.get(cycle, {}) if isinstance(archived_map, dict) else {}
        if cycle_archived.get(auto_archive_doc_name):
            logger.info(f'自动归档：文档 {auto_archive_doc_name} 已归档，跳过')
            return False

        # 自动发起归档审核请求
        requester_id = approval.get('requester_id')
        requester_username = approval.get('requester_username', '')

        from .archive import submit_archive_request_internal
        result = submit_archive_request_internal(
            project_id, cycle, [auto_archive_doc_name],
            requester_id, requester_username, project_config, doc_manager,
            request_type='archive'
        )

        if result.get('status') == 'success':
            logger.info(f'自动归档：文档 {auto_archive_doc_name} 归档请求已自动提交')
            message_manager.send_message(
                receiver_id=requester_id,
                title='标注全部完成，归档已自动发起',
                content=f'文档类型 "{auto_archive_doc_name}" 的所有标注审批已通过，系统已自动发起归档审核请求。',
                sender_id=requester_id,
                msg_type='archive_approval',
                related_id=project_id,
                related_type='archive_auto'
            )
            return True
        else:
            logger.warning(f'自动归档失败：{result.get("message", "")}')
            return False
    except Exception as e:
        logger.error(f'_try_auto_archive_after_annotation failed: {e}')
        import traceback
        traceback.print_exc()
        return False


# --- PLACEHOLDER_SUBMIT ---


def submit_annotation_complete(project_id):
    """提交标注完成审批请求"""
    try:
        data = request.get_json() or {}
        cycle = (data.get('cycle') or '').strip()
        doc_id = (data.get('doc_id') or '').strip()
        doc_name = (data.get('doc_name') or '').strip()
        entry_id = (data.get('entry_id') or '').strip()
        entry_remark = (data.get('entry_remark') or '').strip()
        complete_content = (data.get('content') or '').strip()
        auto_archive_doc_name = (data.get('auto_archive_doc_name') or '').strip()

        if not cycle or not doc_id or not entry_id:
            return jsonify({'status': 'error', 'message': '参数不完整'}), 400
        if not complete_content:
            return jsonify({'status': 'error', 'message': '请输入完成情况说明'}), 400

        # 检查重复
        if user_manager.has_pending_annotation_approval(project_id, doc_id, entry_id):
            return jsonify({'status': 'error', 'message': '该标注已有待审批的完成请求，请勿重复提交'}), 400

        requester_id = int(current_user.id)
        requester_username = getattr(current_user, 'display_name', None) or current_user.username
        requester_role = getattr(current_user, 'role', '')
        requester_org = (getattr(current_user, 'organization', '') or '').strip()

        # 加载项目配置
        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目加载失败'}), 500
        project_config = project_result.get('project', {})
        project_name = project_config.get('name', project_id)

        # 检查是否启用批注审批流程
        require_annotation_approval = project_config.get('require_annotation_approval', True)
        if require_annotation_approval is False:
            # 直接完成标注，跳过审批
            approval_record = {
                'doc_id': doc_id,
                'entry_id': entry_id,
                'complete_content': complete_content,
                'requester_username': requester_username,
                'uuid': '',
            }
            _complete_annotation(None, approval_record, doc_manager)
            user_manager.add_operation_log(
                requester_id, requester_username,
                'annotation_complete_direct',
                project_id, f'{project_name}-{cycle}-{doc_name}',
                json.dumps({'entry_id': entry_id, 'entry_remark': entry_remark[:100] if entry_remark else ''}, ensure_ascii=False),
                request.remote_addr
            )
            return jsonify({
                'status': 'success',
                'message': '标注已直接完成（审批流程已关闭）',
                'completed': True
            })

        # 构建审批链
        approval_chain = _build_annotation_approval_chain(requester_role, requester_org, project_config)
        approval_stages = initialize_approval_stages(project_config, approval_chain)
        if not approval_stages:
            return jsonify({'status': 'error', 'message': '审批链配置错误'}), 400

        # 获取第一阶段审批人
        level_1_approvers = get_next_stage_approvers(project_id, 0, approval_chain, project_config)
        if not level_1_approvers:
            return jsonify({'status': 'error', 'message': '未找到审批人，请联系管理员配置'}), 400

        # 创建审批记录
        result = user_manager.create_annotation_approval(
            project_id, cycle, doc_id, doc_name, entry_id, entry_remark,
            complete_content, requester_id, requester_username
        )
        if result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '创建审批记录失败'}), 500

        approval_id = result['id']
        approval_uuid = result['uuid']

        # 写入第一阶段处理人
        if approval_stages:
            first_ids = [str(a.get('internal_id') or a.get('id')) for a in level_1_approvers]
            first_names = [a.get('display_name') or a.get('username') or '' for a in level_1_approvers]
            approval_stages[0]['assigned_to_id'] = ','.join([x for x in first_ids if x])
            approval_stages[0]['assigned_to_username'] = '、'.join([x for x in first_names if x])

        # 更新 approval_stages 到数据库
        db_path = Path(user_manager.db_path)
        with sqlite3.connect(str(db_path)) as conn:
            sql = 'UPDATE annotation_approvals SET approval_stages = ?, current_stage = 1, stage_completed = 0'
            params = [json.dumps(approval_stages, ensure_ascii=False)]
            if auto_archive_doc_name:
                sql += ', auto_archive_doc_name = ?'
                params.append(auto_archive_doc_name)
            sql += ' WHERE id = ?'
            params.append(approval_id)
            conn.execute(sql, params)
            conn.commit()

        # 记录流程历史
        _append_annotation_stage_history(
            approval_id, 'submit', requester_id, requester_username,
            detail=f'提交标注完成申请：{doc_name} - {entry_remark[:50] if entry_remark else ""}',
            display_name=requester_username
        )

        # 记录操作日志
        user_manager.add_operation_log(
            requester_id, requester_username,
            'annotation_complete_request',
            project_id, f'{project_name}-{cycle}-{doc_name}',
            json.dumps({'entry_id': entry_id, 'entry_remark': entry_remark[:100] if entry_remark else ''}, ensure_ascii=False),
            request.remote_addr
        )

        # 通知审批人
        for approver in level_1_approvers:
            approver_id = approver.get('internal_id') or approver['id']
            if approver_id != requester_id:
                message_manager.send_message(
                    receiver_id=approver_id,
                    title='待审批：标注完成申请',
                    content=f'用户 "{requester_username}" 申请将项目 "{project_name}" 周期 "{cycle}" 的文档 "{doc_name}" 标注为完成，请审批。',
                    sender_id=requester_id,
                    msg_type='annotation_approval',
                    related_id=project_id,
                    related_type='annotation_approval'
                )

        first_role = approval_stages[0].get('required_role', '') if approval_stages else ''
        first_role_label = {'project_admin': '项目经理', 'pmo': 'PMO', 'pmo_leader': 'PMO负责人'}.get(first_role, '审批人')

        return jsonify({
            'status': 'success',
            'approval_id': approval_uuid,
            'current_stage': 1,
            'total_stages': len(approval_stages),
            'message': f'标注完成审批已提交，等待{first_role_label}审批'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


# --- PLACEHOLDER_APPROVE ---


def approve_annotation_complete(project_id):
    """审批标注完成请求"""
    try:
        data = request.get_json() or {}
        approval_id = data.get('approval_id')
        approver_id = data.get('approver_id')
        approval_code = data.get('approval_code', '')
        new_approval_code = data.get('new_approval_code', '')
        force_require_code = bool(data.get('force_require_code', False))

        if not approval_id:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400
        if not approver_id:
            return jsonify({'status': 'error', 'message': '缺少审批人身份'}), 400

        # 审批安全码验证
        settings = load_settings()
        require_code = settings.get('require_approval_code', True)
        if force_require_code:
            require_code = True
        code_diff_pwd = settings.get('approval_code_must_differ_from_password', True)
        min_len = int(settings.get('password_min_length', 8) or 8)
        require_mix = bool(settings.get('password_require_letter_digit', True))

        if require_code and not approval_code:
            return jsonify({'status': 'error', 'message': '请输入审批安全码'}), 400

        approver = user_manager.get_user_by_uuid(str(approver_id))
        if not approver:
            return jsonify({'status': 'error', 'message': '审批人不存在'}), 404
        actual_approver_id = approver.id

        if not _can_user_handle_archive_approval(approver):
            return jsonify({'status': 'error', 'message': '该用户无审批权限'}), 403

        # 验证审批安全码
        if require_code:
            if getattr(approver, 'approval_code_needs_change', 1) == 1:
                if not check_password_hash(approver.password_hash, approval_code):
                    return jsonify({'status': 'error', 'message': '审批安全码验证失败'}), 400
                if not new_approval_code:
                    return jsonify({'status': 'needs_change', 'message': '首次使用审批安全码需重新设置'}), 200
                if len(new_approval_code) < min_len:
                    return jsonify({'status': 'error', 'message': f'审批安全码需至少{min_len}位'}), 400
                if require_mix and (not any(c.isalpha() for c in new_approval_code) or not any(c.isdigit() for c in new_approval_code)):
                    return jsonify({'status': 'error', 'message': f'审批安全码需至少{min_len}位，且必须包含字母和数字'}), 400
                if code_diff_pwd and check_password_hash(approver.password_hash, new_approval_code):
                    return jsonify({'status': 'error', 'message': '审批安全码不能与登录密码相同'}), 400
                user_manager.update_approval_code(actual_approver_id, generate_password_hash(new_approval_code), needs_change=0)
            elif not approver.approval_code_hash or not check_password_hash(approver.approval_code_hash, approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码错误'}), 400

        # 获取审批记录
        approval = user_manager.get_annotation_approval_by_uuid(str(approval_id))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404
        if approval['status'] not in ('pending', 'stage_approved'):
            return jsonify({'status': 'error', 'message': '该请求已处理'}), 400
        if approval['project_id'] != project_id:
            return jsonify({'status': 'error', 'message': '审批请求与项目不匹配'}), 400

        # 加载项目配置
        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目加载失败'}), 500
        project_config = project_result.get('project', {})

        approval_stages = approval.get('approval_stages') or []
        if isinstance(approval_stages, str):
            approval_stages = json.loads(approval_stages)
        current_stage_idx = approval.get('current_stage', 1) - 1

        if current_stage_idx < 0 or current_stage_idx >= len(approval_stages):
            return jsonify({'status': 'error', 'message': '审批阶段异常'}), 400

        # 验证审批人属于当前阶段
        if approver.role != 'admin' and not _is_eligible_current_stage_approver(
            project_id, approval, approval_stages, current_stage_idx, project_config, actual_approver_id
        ):
            return jsonify({'status': 'error', 'message': '当前审批人不在本阶段可处理人列表中'}), 403

        # 不能审批自己的请求
        if actual_approver_id == approval.get('requester_id'):
            return jsonify({'status': 'error', 'message': '不能审批自己的请求'}), 400

        approver_display = getattr(approver, 'display_name', None) or approver.username

        # 标记当前阶段为已通过
        approval_stages[current_stage_idx]['status'] = 'approved'
        approval_stages[current_stage_idx]['approved_by_id'] = actual_approver_id
        approval_stages[current_stage_idx]['approved_by_username'] = approver_display
        approval_stages[current_stage_idx]['approved_at'] = now_with_timezone().isoformat()

        # 检查是否所有阶段完成
        all_done = all(s['status'] == 'approved' for s in approval_stages)
        next_stage_idx = current_stage_idx + 1

        db_path = Path(user_manager.db_path)

        if all_done or next_stage_idx >= len(approval_stages):
            # 所有阶段完成，执行标注完成
            with sqlite3.connect(str(db_path)) as conn:
                conn.execute(
                    'UPDATE annotation_approvals SET approval_stages = ?, current_stage = ?, stage_completed = 1, '
                    'status = ?, approved_by_id = ?, approved_by_username = ?, resolved_at = ? WHERE id = ?',
                    (json.dumps(approval_stages, ensure_ascii=False), next_stage_idx,
                     'approved', actual_approver_id, approver_display,
                     now_with_timezone().isoformat(), approval['id'])
                )
                conn.commit()

            _append_annotation_stage_history(
                approval['id'], 'approve', actual_approver_id, approver_display,
                stage=current_stage_idx + 1, detail='审批通过（最终阶段）',
                display_name=approver_display
            )

            # 记录操作日志
            project_name = project_config.get('name', project_id)
            user_manager.add_operation_log(
                actual_approver_id, approver_display,
                'annotation_complete_approve',
                project_id, f'{project_name}-{approval.get("cycle","")}-{approval.get("doc_name","")}',
                json.dumps({'entry_id': approval.get('entry_id',''), 'entry_remark': approval.get('entry_remark','')}, ensure_ascii=False),
                request.remote_addr
            )

            # 执行标注完成写入
            _complete_annotation(approval['id'], approval, doc_manager)

            # 通知申请人
            message_manager.send_message(
                receiver_id=approval['requester_id'],
                title='标注完成审批已通过',
                content=f'您提交的文档 "{approval.get("doc_name", "")}" 标注完成申请已通过审批。',
                sender_id=actual_approver_id,
                msg_type='annotation_approval',
                related_id=project_id,
                related_type='annotation_approval'
            )

            # 检查是否需要自动触发归档
            auto_archive_triggered = _try_auto_archive_after_annotation(
                approval, project_id, project_config, doc_manager, db_path
            )

            return jsonify({
                'status': 'success',
                'message': '审批通过，标注已完成' + ('，归档流程已自动发起' if auto_archive_triggered else ''),
                'completed': True
            })
        else:
            # 流转到下一阶段
            requester_role = ''
            requester_org = ''
            try:
                requester_user = user_manager.get_user_by_id(approval['requester_id'])
                if requester_user:
                    requester_role = getattr(requester_user, 'role', '')
                    requester_org = (getattr(requester_user, 'organization', '') or '').strip()
            except:
                pass

            next_chain = _build_annotation_approval_chain(requester_role, requester_org, project_config)
            next_approvers = get_next_stage_approvers(project_id, next_stage_idx, next_chain, project_config)

            if next_approvers:
                next_ids = [str(a.get('internal_id') or a.get('id')) for a in next_approvers]
                next_names = [a.get('display_name') or a.get('username') or '' for a in next_approvers]
                approval_stages[next_stage_idx]['assigned_to_id'] = ','.join([x for x in next_ids if x])
                approval_stages[next_stage_idx]['assigned_to_username'] = '、'.join([x for x in next_names if x])

            with sqlite3.connect(str(db_path)) as conn:
                conn.execute(
                    'UPDATE annotation_approvals SET approval_stages = ?, current_stage = ?, status = ? WHERE id = ?',
                    (json.dumps(approval_stages, ensure_ascii=False), next_stage_idx + 1, 'pending', approval['id'])
                )
                conn.commit()

            _append_annotation_stage_history(
                approval['id'], 'stage_approve', actual_approver_id, approver_display,
                stage=current_stage_idx + 1, detail=f'阶段{current_stage_idx + 1}审批通过，流转到下一阶段',
                display_name=approver_display
            )

            # 记录操作日志
            project_name = project_config.get('name', project_id)
            user_manager.add_operation_log(
                actual_approver_id, approver_display,
                'annotation_complete_stage_approve',
                project_id, f'{project_name}-{approval.get("cycle","")}-{approval.get("doc_name","")}',
                json.dumps({'stage': current_stage_idx + 1, 'entry_id': approval.get('entry_id','')}, ensure_ascii=False),
                request.remote_addr
            )

            # 通知下一阶段审批人
            for approver_info in (next_approvers or []):
                aid = approver_info.get('internal_id') or approver_info['id']
                if aid != actual_approver_id:
                    message_manager.send_message(
                        receiver_id=aid,
                        title='待审批：标注完成申请',
                        content=f'文档 "{approval.get("doc_name", "")}" 的标注完成申请已流转到您，请审批。',
                        sender_id=actual_approver_id,
                        msg_type='annotation_approval',
                        related_id=project_id,
                        related_type='annotation_approval'
                    )

            return jsonify({
                'status': 'success',
                'message': '当前阶段审批通过，已流转到下一阶段',
                'completed': False,
                'current_stage': next_stage_idx + 1,
                'total_stages': len(approval_stages)
            })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


# --- PLACEHOLDER_REJECT ---


def reject_annotation_complete(project_id):
    """驳回标注完成请求"""
    try:
        data = request.get_json() or {}
        approval_id = data.get('approval_id')
        approver_id = data.get('approver_id')
        approval_code = data.get('approval_code', '')
        new_approval_code = data.get('new_approval_code', '')
        reject_reason = (data.get('reject_reason') or '').strip()

        if not approval_id:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400
        if not approver_id:
            return jsonify({'status': 'error', 'message': '缺少审批人身份'}), 400
        if not reject_reason:
            return jsonify({'status': 'error', 'message': '请输入驳回原因'}), 400

        # 审批安全码验证
        settings = load_settings()
        require_code = settings.get('require_approval_code', True)
        min_len = int(settings.get('password_min_length', 8) or 8)
        require_mix = bool(settings.get('password_require_letter_digit', True))
        code_diff_pwd = settings.get('approval_code_must_differ_from_password', True)

        if require_code and not approval_code:
            return jsonify({'status': 'error', 'message': '请输入审批安全码'}), 400

        approver = user_manager.get_user_by_uuid(str(approver_id))
        if not approver:
            return jsonify({'status': 'error', 'message': '审批人不存在'}), 404
        actual_approver_id = approver.id

        if not _can_user_handle_archive_approval(approver):
            return jsonify({'status': 'error', 'message': '该用户无审批权限'}), 403

        if require_code:
            if getattr(approver, 'approval_code_needs_change', 1) == 1:
                if not check_password_hash(approver.password_hash, approval_code):
                    return jsonify({'status': 'error', 'message': '审批安全码验证失败'}), 400
                if not new_approval_code:
                    return jsonify({'status': 'needs_change', 'message': '首次使用审批安全码需重新设置'}), 200
                if len(new_approval_code) < min_len:
                    return jsonify({'status': 'error', 'message': f'审批安全码需至少{min_len}位'}), 400
                if require_mix and (not any(c.isalpha() for c in new_approval_code) or not any(c.isdigit() for c in new_approval_code)):
                    return jsonify({'status': 'error', 'message': f'审批安全码需至少{min_len}位，且必须包含字母和数字'}), 400
                if code_diff_pwd and check_password_hash(approver.password_hash, new_approval_code):
                    return jsonify({'status': 'error', 'message': '审批安全码不能与登录密码相同'}), 400
                user_manager.update_approval_code(actual_approver_id, generate_password_hash(new_approval_code), needs_change=0)
            elif not approver.approval_code_hash or not check_password_hash(approver.approval_code_hash, approval_code):
                return jsonify({'status': 'error', 'message': '审批安全码错误'}), 400

        approval = user_manager.get_annotation_approval_by_uuid(str(approval_id))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404
        if approval['status'] not in ('pending', 'stage_approved'):
            return jsonify({'status': 'error', 'message': '该请求已处理'}), 400

        approver_display = getattr(approver, 'display_name', None) or approver.username

        approval_stages = approval.get('approval_stages') or []
        if isinstance(approval_stages, str):
            approval_stages = json.loads(approval_stages)
        current_stage_idx = approval.get('current_stage', 1) - 1

        if 0 <= current_stage_idx < len(approval_stages):
            approval_stages[current_stage_idx]['status'] = 'rejected'
            approval_stages[current_stage_idx]['approved_by_id'] = actual_approver_id
            approval_stages[current_stage_idx]['approved_by_username'] = approver_display
            approval_stages[current_stage_idx]['reject_reason'] = reject_reason

        db_path = Path(user_manager.db_path)
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute(
                'UPDATE annotation_approvals SET status = ?, approved_by_id = ?, approved_by_username = ?, '
                'reject_reason = ?, resolved_at = ?, approval_stages = ? WHERE id = ?',
                ('rejected', actual_approver_id, approver_display, reject_reason,
                 now_with_timezone().isoformat(),
                 json.dumps(approval_stages, ensure_ascii=False), approval['id'])
            )
            conn.commit()

        _append_annotation_stage_history(
            approval['id'], 'reject', actual_approver_id, approver_display,
            stage=current_stage_idx + 1, detail=f'驳回：{reject_reason}',
            display_name=approver_display
        )

        # 记录操作日志
        user_manager.add_operation_log(
            actual_approver_id, approver_display,
            'annotation_complete_reject',
            project_id, f'{approval.get("doc_name","")}-{approval.get("entry_remark","")}',
            json.dumps({'entry_id': approval.get('entry_id',''), 'reason': reject_reason}, ensure_ascii=False),
            request.remote_addr
        )

        # 通知申请人
        message_manager.send_message(
            receiver_id=approval['requester_id'],
            title='标注完成审批被驳回',
            content=f'您提交的文档 "{approval.get("doc_name", "")}" 标注完成申请被驳回。原因：{reject_reason}',
            sender_id=actual_approver_id,
            msg_type='annotation_approval',
            related_id=project_id,
            related_type='annotation_approval'
        )

        return jsonify({'status': 'success', 'message': '已驳回'})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_pending_annotation_approvals():
    """获取当前用户待审批的标注完成请求"""
    try:
        user_role = getattr(current_user, 'role', '')
        user_id = int(current_user.id)
        approvals = user_manager.get_pending_annotation_approvals_for_user(user_id, user_role)

        result = []
        doc_manager = get_doc_manager()
        for a in approvals:
            project_name = a.get('project_id', '')
            try:
                pr = doc_manager.load_project(a['project_id'])
                if pr.get('status') == 'success':
                    project_name = pr.get('project', {}).get('name', project_name)
            except:
                pass

            result.append({
                'id': a.get('uuid', a.get('id')),
                'project_id': a['project_id'],
                'project_name': project_name,
                'cycle': a.get('cycle', ''),
                'doc_id': a.get('doc_id', ''),
                'doc_name': a.get('doc_name', ''),
                'entry_id': a.get('entry_id', ''),
                'entry_remark': a.get('entry_remark', ''),
                'complete_content': a.get('complete_content', ''),
                'requester_username': a.get('requester_username', ''),
                'status': a.get('status', ''),
                'approval_stages': a.get('approval_stages', []),
                'current_stage': a.get('current_stage', 1),
                'created_at': a.get('created_at', ''),
            })

        return jsonify({'status': 'success', 'approvals': result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_annotation_approvers(project_id):
    """获取标注完成审批的可选审批人"""
    try:
        approval_uuid = request.args.get('approval_id')
        if not approval_uuid:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400

        approval = user_manager.get_annotation_approval_by_uuid(str(approval_uuid))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404

        doc_manager = get_doc_manager()
        project_result = doc_manager.load_project(project_id)
        if project_result.get('status') != 'success':
            return jsonify({'status': 'error', 'message': '项目加载失败'}), 500
        project_config = project_result.get('project', {})

        approval_stages = approval.get('approval_stages') or []
        if isinstance(approval_stages, str):
            approval_stages = json.loads(approval_stages)
        current_stage_idx = approval.get('current_stage', 1) - 1

        if current_stage_idx < 0 or current_stage_idx >= len(approval_stages):
            return jsonify({'status': 'success', 'approvers': []})

        approvers = get_next_stage_approvers(project_id, current_stage_idx, approval_stages, project_config)

        # 排除上一阶段审批人和申请人
        if current_stage_idx > 0:
            prev_stage = approval_stages[current_stage_idx - 1]
            prev_approver_id = prev_stage.get('approved_by_id')
            if prev_approver_id is not None:
                approvers = [a for a in approvers if str(a.get('internal_id', a.get('id'))) != str(prev_approver_id)]

        requester_id = approval.get('requester_id')
        if requester_id is not None:
            approvers = [a for a in approvers if str(a.get('internal_id', a.get('id'))) != str(requester_id)]

        return jsonify({'status': 'success', 'approvers': approvers})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def withdraw_annotation_complete(project_id):
    """撤回标注完成审批请求"""
    try:
        data = request.get_json() or {}
        approval_uuid = data.get('approval_id')
        if not approval_uuid:
            return jsonify({'status': 'error', 'message': '缺少审批ID'}), 400

        approval = user_manager.get_annotation_approval_by_uuid(str(approval_uuid))
        if not approval:
            return jsonify({'status': 'error', 'message': '审批请求不存在'}), 404
        if approval['status'] not in ('pending',):
            return jsonify({'status': 'error', 'message': '只能撤回待审批的请求'}), 400
        if int(approval['requester_id']) != int(current_user.id):
            return jsonify({'status': 'error', 'message': '只能撤回自己的请求'}), 403

        db_path = Path(user_manager.db_path)
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute(
                'UPDATE annotation_approvals SET status = ?, resolved_at = ? WHERE id = ?',
                ('withdrawn', now_with_timezone().isoformat(), approval['id'])
            )
            conn.commit()

        _append_annotation_stage_history(
            approval['id'], 'withdraw', int(current_user.id), current_user.username,
            detail='申请人撤回',
            display_name=getattr(current_user, 'display_name', None) or current_user.username
        )

        # 记录操作日志
        user_manager.add_operation_log(
            int(current_user.id), getattr(current_user, 'display_name', None) or current_user.username,
            'annotation_complete_withdraw',
            project_id, f'{approval.get("doc_name","")}-{approval.get("entry_remark","")}',
            json.dumps({'approval_uuid': approval.get('uuid','')}, ensure_ascii=False),
            request.remote_addr
        )

        return jsonify({'status': 'success', 'message': '已撤回'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_annotation_approval_history(project_id):
    """获取项目的标注完成审批历史"""
    try:
        approvals = user_manager.get_annotation_approvals(project_id)
        result = []
        for a in approvals:
            result.append({
                'id': a.get('uuid', a.get('id')),
                'project_id': a['project_id'],
                'cycle': a.get('cycle', ''),
                'doc_id': a.get('doc_id', ''),
                'doc_name': a.get('doc_name', ''),
                'entry_id': a.get('entry_id', ''),
                'entry_remark': a.get('entry_remark', ''),
                'complete_content': a.get('complete_content', ''),
                'requester_username': a.get('requester_username', ''),
                'status': a.get('status', ''),
                'approval_stages': a.get('approval_stages', []),
                'current_stage': a.get('current_stage', 1),
                'stage_history': a.get('stage_history', []),
                'approved_by_username': a.get('approved_by_username', ''),
                'reject_reason': a.get('reject_reason', ''),
                'created_at': a.get('created_at', ''),
                'resolved_at': a.get('resolved_at', ''),
            })
        return jsonify({'status': 'success', 'approvals': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def get_annotation_requests(project_id):
    """获取项目的标注完成审批列表（含状态过滤）"""
    try:
        status_filter = request.args.get('status')
        approvals = user_manager.get_annotation_approvals(project_id, status=status_filter)
        result = []
        for a in approvals:
            result.append({
                'id': a.get('uuid', a.get('id')),
                'project_id': a['project_id'],
                'cycle': a.get('cycle', ''),
                'doc_id': a.get('doc_id', ''),
                'doc_name': a.get('doc_name', ''),
                'entry_id': a.get('entry_id', ''),
                'entry_remark': a.get('entry_remark', ''),
                'complete_content': a.get('complete_content', ''),
                'requester_username': a.get('requester_username', ''),
                'status': a.get('status', ''),
                'approval_stages': a.get('approval_stages', []),
                'current_stage': a.get('current_stage', 1),
                'created_at': a.get('created_at', ''),
            })
        return jsonify({'status': 'success', 'approvals': result})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def log_annotation_operation(project_id):
    """记录标注操作日志（增删改）"""
    try:
        data = request.get_json() or {}
        action = data.get('action', '')
        doc_name = data.get('doc_name', '')
        entry_id = data.get('entry_id', '')
        remark = data.get('remark', '')

        op_type_map = {
            'add_annotation': 'annotation_add',
            'edit_annotation': 'annotation_edit',
            'delete_annotation': 'annotation_delete',
        }
        op_type = op_type_map.get(action, f'annotation_{action}')

        user_id = int(current_user.id)
        username = getattr(current_user, 'display_name', None) or current_user.username

        user_manager.add_operation_log(
            user_id, username, op_type,
            project_id, doc_name or project_id,
            json.dumps({'entry_id': entry_id, 'remark': remark[:200] if remark else ''}, ensure_ascii=False),
            request.remote_addr
        )

        # 新增批注时通知项目相关人员
        if action == 'add_annotation':
            try:
                doc_manager = get_doc_manager()
                project_result = doc_manager.load_project(project_id)
                project_name = project_id
                notify_user_ids = set()
                if project_result.get('status') == 'success':
                    pc = project_result.get('project', {})
                    project_name = pc.get('name', project_id)
                    owner_id = pc.get('owner_id')
                    if owner_id and int(owner_id) != user_id:
                        notify_user_ids.add(int(owner_id))
                    for m in (pc.get('members') or []):
                        mid = m.get('user_id')
                        if mid and int(mid) != user_id:
                            notify_user_ids.add(int(mid))

                for nid in notify_user_ids:
                    message_manager.send_message(
                        receiver_id=nid,
                        title='新增核验标注',
                        content=f'用户 "{username}" 在项目 "{project_name}" 的文档 "{doc_name}" 中新增了核验标注。',
                        sender_id=user_id,
                        msg_type='annotation',
                        related_id=project_id,
                        related_type='annotation'
                    )
            except Exception as e:
                logger.warning(f'发送标注通知失败: {e}')

        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


def mark_auto_archive_annotations(project_id):
    """将已有的 pending 标注审批标记为自动归档（当所有标注都已在审批中时使用）"""
    try:
        data = request.get_json() or {}
        cycle = (data.get('cycle') or '').strip()
        doc_name = (data.get('doc_name') or '').strip()

        if not cycle or not doc_name:
            return jsonify({'status': 'error', 'message': '参数不完整'}), 400

        db_path = Path(user_manager.db_path)
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute(
                'UPDATE annotation_approvals SET auto_archive_doc_name = ? '
                'WHERE project_id = ? AND cycle = ? AND status = ? AND (auto_archive_doc_name IS NULL OR auto_archive_doc_name = ?)',
                (doc_name, project_id, cycle, 'pending', '')
            )
            conn.commit()

        return jsonify({'status': 'success', 'message': '已标记自动归档'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
