/**
 * 用户审核模块
 */

import { getPendingUsers, approveUserAccount, rejectUserAccount } from './api.js';
import { showNotification } from './ui.js';

let currentAuditUserId = null;

export function openUserApprovalModal() {
    const modal = document.getElementById('userApprovalModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        loadPendingUsers();
    }
}

export function closeUserApprovalModal() {
    const modal = document.getElementById('userApprovalModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    closeAuditConfirmModal();
}

async function loadPendingUsers() {
    const container = document.getElementById('pendingUsersContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        const result = await getPendingUsers();
        if (result.status !== 'success') {
            container.innerHTML = `<div class="empty-tip">加载失败: ${result.message || ''}</div>`;
            return;
        }
        
        const users = result.users || [];
        if (users.length === 0) {
            container.innerHTML = '<div class="empty-tip">暂无待审核用户</div>';
            return;
        }
        
        let html = '<table style="width:100%; border-collapse:collapse; font-size:14px;">';
        html += '<thead><tr style="background:#f8f9fa;">';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">用户名</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">角色</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">承建单位</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">申请时间</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:center;">操作</th>';
        html += '</tr></thead><tbody>';
        
        users.forEach(user => {
            const roleMap = { 'contractor': '一般员工', 'project_admin': '项目经理', 'pmo': '项目管理组织', 'admin': '系统管理员' };
            const roleLabel = roleMap[user.role] || user.role;
            html += `<tr>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(user.display_name ? user.username + '（' + user.display_name + '）' : user.username)}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${roleLabel}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(user.organization || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${user.created_at || '-'}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; text-align:center;">`;
            html += `<button class="btn btn-success btn-sm" onclick="openAuditConfirmModal(${user.id}, '${escapeHtml(user.username)}', '${escapeHtml(user.role)}', '${escapeHtml(user.organization || '')}', '${escapeHtml(user.email || '')}', '${user.created_at || ''}', 'approve')" style="margin-right:6px;">通过</button>`;
            html += `<button class="btn btn-danger btn-sm" onclick="openAuditConfirmModal(${user.id}, '${escapeHtml(user.username)}', '${escapeHtml(user.role)}', '${escapeHtml(user.organization || '')}', '${escapeHtml(user.email || '')}', '${user.created_at || ''}', 'reject')">拒绝</button>`;
            html += `</td>`;
            html += `</tr>`;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div class="empty-tip">加载失败</div>';
    }
}

export function openAuditConfirmModal(userId, username, role, organization, email, createdAt, action) {
    currentAuditUserId = userId;
    const modal = document.getElementById('auditConfirmModal');
    const titleEl = document.getElementById('auditConfirmTitle');
    const infoEl = document.getElementById('auditUserInfo');
    const actionName = action === 'approve' ? '通过' : '拒绝';
    const roleMap = { 'contractor': '普通用户', 'project_admin': '项目经理' };
    const roleLabel = roleMap[role] || role;
    
    if (titleEl) titleEl.textContent = `${actionName}用户审核`;
    if (infoEl) {
        infoEl.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>用户名：</strong>${escapeHtml(username)}</div>
            <div style="margin-bottom: 8px;"><strong>角色：</strong>${roleLabel}</div>
            <div style="margin-bottom: 8px;"><strong>承建单位：</strong>${escapeHtml(organization || '-')}</div>
            <div style="margin-bottom: 8px;"><strong>邮箱：</strong>${escapeHtml(email || '-')}</div>
            <div style="margin-bottom: 8px;"><strong>申请时间：</strong>${createdAt || '-'}</div>
        `;
    }
    
    const confirmBtn = document.getElementById('auditConfirmBtn');
    if (confirmBtn) {
        confirmBtn.textContent = `确认${actionName}`;
        confirmBtn.className = action === 'approve' ? 'btn btn-success' : 'btn btn-danger';
        confirmBtn.onclick = () => {
            const remark = document.getElementById('auditRemark').value.trim();
            if (action === 'approve') {
                handleApproveUserAccount(userId, remark);
            } else {
                handleRejectUserAccount(userId, remark);
            }
        };
    }
    
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

export function closeAuditConfirmModal() {
    currentAuditUserId = null;
    const modal = document.getElementById('auditConfirmModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    const remarkInput = document.getElementById('auditRemark');
    if (remarkInput) remarkInput.value = '';
}

export async function handleApproveUserAccount(userId, remark = '') {
    const result = await approveUserAccount(userId, remark);
    if (result.status === 'success') {
        showNotification('审核通过', 'success');
        closeAuditConfirmModal();
        loadPendingUsers();
    } else {
        showNotification('审核失败: ' + result.message, 'error');
    }
}

export async function handleRejectUserAccount(userId, remark = '') {
    const result = await rejectUserAccount(userId, remark);
    if (result.status === 'success') {
        showNotification('已拒绝', 'success');
        closeAuditConfirmModal();
        loadPendingUsers();
    } else {
        showNotification('操作失败: ' + result.message, 'error');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
