/**
 * 文档归档审批模块
 */

import { showNotification } from './ui.js';
import { getCurrentUser } from './auth.js';

let currentApprovalIdForConfirm = null;
let currentApprovalActionForConfirm = null;

/**
 * 打开文档归档审批模态框
 */
export function openArchiveApprovalModal() {
    const modal = document.getElementById('archiveApprovalModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        loadPendingArchiveApprovals();
    }
}

/**
 * 关闭文档归档审批模态框
 */
export function closeArchiveApprovalModal() {
    const modal = document.getElementById('archiveApprovalModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    closeArchiveApprovalConfirmModal();
}

/**
 * 加载待审批的文档归档请求
 */
async function loadPendingArchiveApprovals() {
    const container = document.getElementById('pendingArchiveApprovalsContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await fetch('/api/projects/archive/pending');
        if (!response.ok) {
            container.innerHTML = '<div class="empty-tip">加载失败</div>';
            return;
        }

        const result = await response.json();
        if (result.status !== 'success') {
            container.innerHTML = `<div class="empty-tip">加载失败: ${result.message || ''}</div>`;
            return;
        }

        const approvals = result.approvals || [];
        if (approvals.length === 0) {
            container.innerHTML = '<div class="empty-tip">暂无待审批的文档归档请求</div>';
            return;
        }

        // 渲染待审批列表
        let html = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
        html += '<thead><tr style="background:#f0f0f0; font-weight:bold;">';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">项目</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">周期</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">文档</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">申请人</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">申请时间</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">审批进度</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:center;">操作</th>';
        html += '</tr></thead><tbody>';

        approvals.forEach(approval => {
            const docList = Array.isArray(approval.doc_names) ? approval.doc_names.slice(0, 3).join('、') : '';
            const docDisplay = Array.isArray(approval.doc_names) && approval.doc_names.length > 3
                ? docList + `...等${approval.doc_names.length}个`
                : docList;

            // 获取审批进度信息
            const archiveApprovalStages = approval.approval_stages || [];
            let stageDisplay = '未知';
            if (archiveApprovalStages.length > 0) {
                const statuses = archiveApprovalStages.map((s, i) => {
                    const statusIcon = s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✗' : '⏳';
                    const levelLabel = `Level${s.level || i + 1}`;
                    return `${statusIcon} ${levelLabel}`;
                }).join(' → ');
                stageDisplay = statuses;
            }

            html += '<tr>';
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.project_id || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.cycle || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${escapeHtml(docDisplay || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.requester_username || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${approval.created_at || '-'}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${stageDisplay}</td>`;
            html += '<td style="padding:10px; border:1px solid #ddd; text-align:center;">';
            html += `<button class="btn btn-sm btn-success" onclick="openArchiveApprovalConfirmModal('${escapeHtml(approval.id)}', 'approve')" style="margin-right:5px;">批准</button>`;
            html += `<button class="btn btn-sm btn-warning" onclick="openArchiveApprovalConfirmModal('${escapeHtml(approval.id)}', 'reject')">驳回</button>`;
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (error) {
        console.error('加载待审批列表失败:', error);
        container.innerHTML = '<div class="empty-tip">加载失败</div>';
    }
}

/**
 * 打开审批确认对话框
 */
export function openArchiveApprovalConfirmModal(approvalId, action) {
    currentApprovalIdForConfirm = approvalId;
    currentApprovalActionForConfirm = action;

    const modal = document.getElementById('archiveApprovalConfirmModal');
    const titleEl = document.getElementById('archiveApprovalConfirmTitle');
    const infoEl = document.getElementById('archiveApprovalInfo');
    const confirmBtn = document.getElementById('archiveApprovalConfirmBtn');
    const rejectBtn = document.getElementById('archiveApprovalRejectBtn');
    const remark = document.getElementById('archiveApprovalRemark');

    const actionName = action === 'approve' ? '批准' : '驳回';
    if (titleEl) titleEl.textContent = `${actionName}文档归档`;

    // 从列表中查找该批准记录的详情（简化处理，直接显示ID）
    if (infoEl) {
        infoEl.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>批准ID：</strong>${escapeHtml(approvalId)}</div>
            <div style="margin-bottom: 8px; color:#f60;"><strong>操作：</strong>${actionName}</div>
        `;
    }

    if (remark) remark.value = '';

    if (confirmBtn) {
        if (action === 'approve') {
            confirmBtn.style.display = 'inline-block';
            confirmBtn.textContent = '确认批准';
        } else {
            confirmBtn.style.display = 'none';
        }
    }

    if (rejectBtn) {
        if (action === 'reject') {
            rejectBtn.style.display = 'inline-block';
            rejectBtn.textContent = '确认驳回';
        } else {
            rejectBtn.style.display = 'none';
        }
    }

    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

/**
 * 关闭审批确认对话框
 */
export function closeArchiveApprovalConfirmModal() {
    const modal = document.getElementById('archiveApprovalConfirmModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    currentApprovalIdForConfirm = null;
    currentApprovalActionForConfirm = null;
}

/**
 * 处理批准操作
 */
export async function handleArchiveApprovalConfirm() {
    if (!currentApprovalIdForConfirm) {
        showNotification('参数错误', 'error');
        return;
    }

    // 需要从模态框中获取所需信息
    // 实际应用中需要从某处获取project_id等
    showNotification('正在处理批准请求...', 'info');

    // TODO: 调用后端API进行批准操作
    closeArchiveApprovalConfirmModal();
    await loadPendingArchiveApprovals();
}

/**
 * 处理驳回操作
 */
export async function handleArchiveApprovalReject() {
    if (!currentApprovalIdForConfirm) {
        showNotification('参数错误', 'error');
        return;
    }

    const remark = document.getElementById('archiveApprovalRemark')?.value || '';
    showNotification('正在处理驳回请求...', 'info');

    // TODO: 调用后端API进行驳回操作
    closeArchiveApprovalConfirmModal();
    await loadPendingArchiveApprovals();
}

/**
 * HTML转义函数
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// 导出全局可访问的函数
window.openArchiveApprovalModal = openArchiveApprovalModal;
window.closeArchiveApprovalModal = closeArchiveApprovalModal;
window.openArchiveApprovalConfirmModal = openArchiveApprovalConfirmModal;
window.closeArchiveApprovalConfirmModal = closeArchiveApprovalConfirmModal;
window.handleArchiveApprovalConfirm = handleArchiveApprovalConfirm;
window.handleArchiveApprovalReject = handleArchiveApprovalReject;
