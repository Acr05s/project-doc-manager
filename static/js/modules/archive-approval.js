/**
 * 文档归档审批模块
 */

import { showNotification } from './ui.js';
import { getCurrentUser } from './auth.js';

let currentApprovalIdForConfirm = null;
let currentApprovalActionForConfirm = null;
let currentApprovalObjectForConfirm = null;
let currentApprovalStagesForConfirm = null;
let selectedPMOApproverIdForConfirm = null;

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

            // 创建数据属性以存储完整的批准对象（Base64编码以避免HTML问题）
            const approvalDataBase64 = btoa(JSON.stringify(approval));

            html += '<tr>';
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.project_id || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.cycle || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${escapeHtml(docDisplay || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.requester_username || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${approval.created_at || '-'}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${stageDisplay}</td>`;
            html += '<td style="padding:10px; border:1px solid #ddd; text-align:center;">';
            html += `<button class="btn btn-sm btn-success" onclick="openArchiveApprovalConfirmModal('${escapeHtml(approval.id)}', 'approve', '${approvalDataBase64}')" style="margin-right:5px;">批准</button>`;
            html += `<button class="btn btn-sm btn-warning" onclick="openArchiveApprovalConfirmModal('${escapeHtml(approval.id)}', 'reject', '${approvalDataBase64}')">驳回</button>`;
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
export function openArchiveApprovalConfirmModal(approvalId, action, approvalDataBase64) {
    currentApprovalIdForConfirm = approvalId;
    currentApprovalActionForConfirm = action;

    // 解码批准对象
    let approvalObject = null;
    if (approvalDataBase64) {
        try {
            approvalObject = JSON.parse(atob(approvalDataBase64));
            currentApprovalObjectForConfirm = approvalObject;
        } catch (e) {
            console.error('解码批准对象失败:', e);
        }
    }

    const modal = document.getElementById('archiveApprovalConfirmModal');
    const titleEl = document.getElementById('archiveApprovalConfirmTitle');
    const infoEl = document.getElementById('archiveApprovalInfo');
    const confirmBtn = document.getElementById('archiveApprovalConfirmBtn');
    const rejectBtn = document.getElementById('archiveApprovalRejectBtn');
    const remark = document.getElementById('archiveApprovalRemark');

    const actionName = action === 'approve' ? '批准' : '驳回';
    if (titleEl) titleEl.textContent = `${actionName}文档归档`;

    // 显示批准详情
    if (infoEl && approvalObject) {
        const docNames = Array.isArray(approvalObject.doc_names) ? approvalObject.doc_names : [];
        const docList = docNames.length > 0 ? docNames.join('、') : '-';
        infoEl.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>项目：</strong>${escapeHtml(approvalObject.project_id || '-')}</div>
            <div style="margin-bottom: 8px;"><strong>周期：</strong>${escapeHtml(approvalObject.cycle || '-')}</div>
            <div style="margin-bottom: 8px;"><strong>文档：</strong>${escapeHtml(docList)}</div>
            <div style="margin-bottom: 8px;"><strong>申请人：</strong>${escapeHtml(approvalObject.requester_username || '-')}</div>
            <div style="margin-bottom: 8px; color:#f60;"><strong>操作：</strong>${actionName}</div>
        `;
    } else {
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
    if (!currentApprovalIdForConfirm || !currentApprovalObjectForConfirm) {
        showNotification('参数错误', 'error');
        return;
    }

    const approval = currentApprovalObjectForConfirm;
    const approvalStages = approval.approval_stages || [];
    const currentStage = approval.current_stage || 1;

    // 检查是否需要选择下一个审批人（即是否还有下一阶段）
    if (currentStage < approvalStages.length) {
        // 有下一阶段，需要选择PMO审批人
        closeArchiveApprovalConfirmModal();
        currentApprovalStagesForConfirm = approvalStages;
        await openSelectPMOApproverModal(approval.project_id);
        return;
    }

    // 没有下一阶段，直接批准
    await submitArchiveApproval(approval.project_id, currentApprovalIdForConfirm);
}

/**
 * 提交审批到服务器
 */
async function submitArchiveApproval(projectId, approvalId, selectPMOId = null) {
    const remark = document.getElementById('archiveApprovalRemark')?.value || '';

    showNotification('正在处理批准请求...', 'info');

    try {
        const body = {
            approval_id: approvalId,
            comment: remark
        };

        // 如果选择了特定的PMO，添加到请求中
        if (selectPMOId) {
            body.next_approver_id = selectPMOId;
        }

        const response = await fetch(`/api/projects/${projectId}/archive-approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const result = await response.json();
        if (result.status === 'success') {
            showNotification('✓ 已批准本阶段审批，文档已提交至下一阶段', 'success');
        } else if (result.status === 'stage_approved') {
            showNotification('✓ 已批准本阶段，等待下一阶段审批...', 'success');
        } else {
            showNotification('批准失败: ' + (result.message || '未知错误'), 'error');
        }
        closeArchiveApprovalConfirmModal();
        closeSelectPMOApproverModal();
        await loadPendingArchiveApprovals();
    } catch (error) {
        console.error('批准操作失败:', error);
        showNotification('批准操作失败: ' + error.message, 'error');
    }
}

/**
 * 打开选择PMO审批人的modal
 */
async function openSelectPMOApproverModal(projectId) {
    const modal = document.getElementById('selectPMOApproverModal');
    if (!modal) {
        showNotification('选择器模态框未找到', 'error');
        return;
    }

    showNotification('加载项目管理组织成员...', 'info');

    try {
        // 获取所有PMO成员
        const response = await fetch(`/api/users?role=pmo`);
        const result = await response.json();

        if (result.status !== 'success' || !result.users) {
            showNotification('加载项目管理组织成员失败', 'error');
            return;
        }

        const pmoUsers = result.users;
        console.log('PMO 成员列表:', pmoUsers);

        // 更新 dropdown 列表
        const selectEl = document.getElementById('pmoApproverSelect');
        if (selectEl) {
            selectEl.innerHTML = '<option value="">-- 默认（通知全部项目管理组织成员）--</option>';
            pmoUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id || user.uuid;
                option.textContent = `${user.username} (${user.organization || '未分配'})`;
                selectEl.appendChild(option);
            });
        }

        // 显示PMO成员列表
        const listContainer = document.getElementById('pmoListContainer');
        if (listContainer) {
            if (pmoUsers.length === 0) {
                listContainer.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">暂无项目管理组织成员</div>';
            } else {
                let html = '<div style="font-size: 13px;">';
                pmoUsers.forEach(user => {
                    const userId = user.id || user.uuid;
                    html += `<div style="padding: 8px; border-bottom: 1px solid #eee;">
                        <input type="radio" name="pmoApproverRadio" value="${userId}" style="margin-right: 8px;">
                        <strong>${escapeHtml(user.username)}</strong> - ${escapeHtml(user.organization || '未分配')}
                    </div>`;
                });
                html += '</div>';
                listContainer.innerHTML = html;
            }
        }

        selectedPMOApproverIdForConfirm = null;
        modal.classList.add('show');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch (error) {
        console.error('加载项目管理组织成员失败:', error);
        showNotification('加载项目管理组织成员失败: ' + error.message, 'error');
    }
}

/**
 * 关闭选择PMO审批人的modal
 */
export function closeSelectPMOApproverModal() {
    const modal = document.getElementById('selectPMOApproverModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

/**
 * 处理选择确认
 */
export function handleSelectPMOApproverConfirm() {
    let selectedId = document.getElementById('pmoApproverSelect')?.value;

    if (!selectedId) {
        const radioBtn = document.querySelector('input[name="pmoApproverRadio"]:checked');
        if (radioBtn) {
            selectedId = radioBtn.value;
        }
    }

    selectedPMOApproverIdForConfirm = selectedId || null;

    if (currentApprovalIdForConfirm && currentApprovalObjectForConfirm) {
        const projectId = currentApprovalObjectForConfirm.project_id;
        submitArchiveApproval(projectId, currentApprovalIdForConfirm, selectedPMOApproverIdForConfirm);
    }
}

/**
 * 处理驳回操作
 */
export async function handleArchiveApprovalReject() {
    if (!currentApprovalIdForConfirm || !currentApprovalObjectForConfirm) {
        showNotification('参数错误', 'error');
        return;
    }

    const approval = currentApprovalObjectForConfirm;
    const projectId = approval.project_id;
    const approvalId = currentApprovalIdForConfirm;
    const reason = document.getElementById('archiveApprovalRemark')?.value || '';

    if (!reason) {
        showNotification('请输入驳回原因', 'warning');
        return;
    }

    showNotification('正在处理驳回请求...', 'info');

    try {
        const response = await fetch(`/api/projects/${projectId}/archive-reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                approval_id: approvalId,
                reason: reason
            })
        });

        const result = await response.json();
        if (result.status === 'success') {
            showNotification('✓ 已驳回此审批请求，申请人将收到通知', 'success');
        } else {
            showNotification('驳回失败: ' + (result.message || '未知错误'), 'error');
        }
        closeArchiveApprovalConfirmModal();
        await loadPendingArchiveApprovals();
    } catch (error) {
        console.error('驳回操作失败:', error);
        showNotification('驳回操作失败: ' + error.message, 'error');
    }
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

/**
 * 撤回归档请求
 */
export async function handleWithdrawArchiveRequest(projectId, approvalId) {
    if (!confirm('确定要撤回此归档请求吗？')) {
        return;
    }

    showNotification('正在处理撤回请求...', 'info');

    try {
        const response = await fetch(`/api/projects/${projectId}/archive-withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approval_id: approvalId })
        });

        const result = await response.json();
        if (result.status === 'success') {
            showNotification('✓ 已撤回归档请求', 'success');
            closeArchiveApprovalModal();
            await loadPendingArchiveApprovals();
        } else {
            showNotification('撤回失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('撤回操作失败:', error);
        showNotification('撤回操作失败: ' + error.message, 'error');
    }
}

// 导出全局可访问的函数
window.openArchiveApprovalModal = openArchiveApprovalModal;
window.closeArchiveApprovalModal = closeArchiveApprovalModal;
window.openArchiveApprovalConfirmModal = openArchiveApprovalConfirmModal;
window.closeArchiveApprovalConfirmModal = closeArchiveApprovalConfirmModal;
window.closeSelectPMOApproverModal = closeSelectPMOApproverModal;
window.handleArchiveApprovalConfirm = handleArchiveApprovalConfirm;
window.handleSelectPMOApproverConfirm = handleSelectPMOApproverConfirm;
window.handleArchiveApprovalReject = handleArchiveApprovalReject;
window.handleWithdrawArchiveRequest = handleWithdrawArchiveRequest;
window.handleArchiveApprovalReject = handleArchiveApprovalReject;
