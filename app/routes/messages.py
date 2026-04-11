"""消息/站内信相关路由"""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.models.message import message_manager
from app.models.user import user_manager

message_bp = Blueprint('message', __name__, url_prefix='/api/messages')


@message_bp.route('/list', methods=['GET'])
@login_required
def list_messages():
    """获取当前用户的消息列表"""
    try:
        is_read = request.args.get('is_read')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        if is_read is not None:
            is_read = is_read.lower() == 'true'
        
        messages = message_manager.get_messages(
            user_id=int(current_user.id),
            is_read=is_read,
            limit=limit,
            offset=offset
        )
        return jsonify({'status': 'success', 'messages': messages})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@message_bp.route('/unread-count', methods=['GET'])
@login_required
def unread_count():
    """获取未读消息数量"""
    try:
        count = message_manager.get_unread_count(int(current_user.id))
        return jsonify({'status': 'success', 'count': count})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@message_bp.route('/read/<int:message_id>', methods=['POST'])
@login_required
def mark_read(message_id):
    """标记消息为已读"""
    try:
        success = message_manager.mark_as_read(message_id, int(current_user.id))
        if success:
            return jsonify({'status': 'success', 'message': '已标记为已读'})
        return jsonify({'status': 'error', 'message': '消息不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@message_bp.route('/read-all', methods=['POST'])
@login_required
def mark_all_read():
    """标记所有消息为已读"""
    try:
        count = message_manager.mark_all_as_read(int(current_user.id))
        return jsonify({'status': 'success', 'message': f'已标记 {count} 条消息为已读', 'count': count})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@message_bp.route('/<int:message_id>', methods=['DELETE'])
@login_required
def delete_message(message_id):
    """删除消息"""
    try:
        success = message_manager.delete_message(message_id, int(current_user.id))
        if success:
            return jsonify({'status': 'success', 'message': '已删除'})
        return jsonify({'status': 'error', 'message': '消息不存在'}), 404
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@message_bp.route('/send', methods=['POST'])
@login_required
def send_message():
    """发送站内信（当前用户 -> 指定接收人）"""
    try:
        data = request.get_json()
        receiver_id = data.get('receiver_id')
        title = data.get('title', '').strip()
        content = data.get('content', '').strip()
        
        # 验证接收人ID格式
        try:
            receiver_id = int(receiver_id)
        except (ValueError, TypeError):
            return jsonify({'status': 'error', 'message': '接收人ID格式错误'}), 400
        
        if not receiver_id or not content:
            return jsonify({'status': 'error', 'message': '缺少接收人或内容'}), 400
        msg_id = message_manager.send_message(
            receiver_id=receiver_id,
            title=title or '用户留言',
            content=content,
            sender_id=int(current_user.id),
            msg_type='message'
        )
        if msg_id:
            return jsonify({'status': 'success', 'message': '发送成功', 'message_id': msg_id})
        return jsonify({'status': 'error', 'message': '发送失败'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@message_bp.route('/send-to-approvers', methods=['POST'])
@login_required
def send_message_to_approvers():
    """待审核用户发送消息给审批人"""
    try:
        if current_user.status != 'pending':
            return jsonify({'status': 'error', 'message': '仅限待审核用户使用'}), 403
        data = request.get_json()
        content = data.get('content', '').strip()
        if not content:
            return jsonify({'status': 'error', 'message': '请输入留言内容'}), 400

        user = user_manager.get_user_by_id(int(current_user.id))
        org = user.organization or ''
        role = user.role
        is_new_org = (role == 'project_admin')

        approvers = user_manager.get_users_by_roles(['admin', 'pmo', 'project_admin'])
        sent_count = 0
        for approver in approvers:
            if approver['role'] == 'project_admin' and approver.get('organization') != org:
                continue
            message_manager.send_message(
                receiver_id=approver['id'],
                title=f'待审核用户 "{user.username}" 的留言',
                content=f'用户 "{user.username}"（单位：{org or "无"}）留言：\n\n{content}',
                sender_id=int(current_user.id),
                msg_type='message',
                related_id=str(current_user.id),
                related_type='user'
            )
            sent_count += 1

        if sent_count == 0:
            return jsonify({'status': 'error', 'message': '未找到可用的审核人'}), 400
        return jsonify({'status': 'success', 'message': f'消息已发送给 {sent_count} 位审核人'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
