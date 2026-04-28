/**
 * 文档归档审批模块
 */

import { showNotification, showInputModal, showConfirmModal } from './ui.js';
import { getCurrentUser, authState } from './auth.js';
import { getArchiveApprovers } from './api.js';
import { appState } from './app-state.js';
import { formatDateTimeDisplay } from './utils.js';

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
            container.innerHTML = '';
            await loadPendingAnnotationApprovals(container);
            if (!container.innerHTML.trim()) {
                container.innerHTML = '<div class="empty-tip">暂无待审批请求</div>';
            }
            return;
        }

        // 渲染待审批列表
        let html = '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
        html += '<thead><tr style="background:#f0f0f0; font-weight:bold;">';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">项目</th>';
        html += '<th style="padding:10px; border:1px solid #ddd; text-align:left;">类型</th>';
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
                    const roleName = s.required_role === 'project_admin' ? '项目经理' : s.required_role === 'pmo' ? 'PMO' : s.required_role === 'pmo_leader' ? 'PMO负责人' : s.required_role === 'admin' ? '管理员' : `Level${s.level || i + 1}`;
                    if (s.status === 'approved') return `✓ ${roleName}已审核`;
                    if (s.status === 'rejected') return `✗ ${roleName}已驳回`;
                    return `⏳ ${roleName}审批`;
                }).join(' → ');
                stageDisplay = statuses;
            }

            // 项目名称显示：项目名称@承建单位
            const projectDisplayName = (approval.project_name || approval.project_id || '-') + (approval.party_b ? '@' + approval.party_b : '');
            const typeLabel = approval.request_type === 'not_involved' ? '🚫 不涉及' : '📦 归档';
            const tz = appState.systemSettings?.timezone || 'Asia/Shanghai';
            const createdAt = formatDateTimeDisplay(approval.created_at, tz);

            // 创建数据属性以存储完整的批准对象（Base64编码，支持中文）
            const approvalDataBase64 = btoa(encodeURIComponent(JSON.stringify(approval)));

            html += '<tr>';
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(projectDisplayName)}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${typeLabel}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.cycle || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${escapeHtml(docDisplay || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd;">${escapeHtml(approval.requester_username || '-')}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${createdAt}</td>`;
            html += `<td style="padding:10px; border:1px solid #ddd; font-size:12px;">${stageDisplay}</td>`;
            html += '<td style="padding:10px; border:1px solid #ddd; text-align:center;">';
            html += `<button class="btn btn-sm btn-success" onclick="openArchiveApprovalConfirmModal('${escapeHtml(approval.id)}', 'approve', '${approvalDataBase64}')" style="margin-right:5px;">批准</button>`;
            html += `<button class="btn btn-sm btn-warning" onclick="openArchiveApprovalConfirmModal('${escapeHtml(approval.id)}', 'reject', '${approvalDataBase64}')">驳回</button>`;
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // 加载标注完成待审批
        await loadPendingAnnotationApprovals(container);
    } catch (error) {
        console.error('加载待审批列表失败:', error);
        container.innerHTML = '<div class="empty-tip">加载失败</div>';
    }
}

/**
 * 加载待审批的标注完成请求（追加到容器）
 */
async function loadPendingAnnotationApprovals(container) {
    try {
        const response = await fetch('/api/projects/annotation/pending');
        if (!response.ok) return;
        const result = await response.json();
        if (result.status !== 'success') return;

        const approvals = result.approvals || [];
        if (approvals.length === 0) return;

        let html = '<h4 style="margin:16px 0 8px;font-size:14px;color:#333;">标注完成审批</h4>';
        html += '<table style="width:100%; border-collapse:collapse; font-size:13px;">';
        html += '<thead><tr style="background:#e8f5e9; font-weight:bold;">';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:left;">项目</th>';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:left;">周期</th>';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:left;">文档</th>';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:left;">标注内容</th>';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:left;">完成说明</th>';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:left;">申请人</th>';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:left;">审批进度</th>';
        html += '<th style="padding:8px; border:1px solid #ddd; text-align:center;">操作</th>';
        html += '</tr></thead><tbody>';

        approvals.forEach(a => {
            const stages = a.approval_stages || [];
            let stageDisplay = '';
            if (stages.length > 0) {
                stageDisplay = stages.map((s, i) => {
                    const roleName = s.required_role === 'project_admin' ? '项目经理' : s.required_role === 'pmo' ? 'PMO' : s.required_role === 'pmo_leader' ? 'PMO负责人' : `Level${i+1}`;
                    if (s.status === 'approved') return `✓ ${roleName}`;
                    if (s.status === 'rejected') return `✗ ${roleName}`;
                    return `⏳ ${roleName}`;
                }).join(' → ');
            }

            const annDataBase64 = btoa(encodeURIComponent(JSON.stringify(a)));

            html += '<tr>';
            html += `<td style="padding:8px; border:1px solid #ddd;">${escapeHtml(a.project_name || a.project_id || '-')}</td>`;
            html += `<td style="padding:8px; border:1px solid #ddd;">${escapeHtml(a.cycle || '-')}</td>`;
            html += `<td style="padding:8px; border:1px solid #ddd; font-size:12px;">${escapeHtml(a.doc_name || '-')}</td>`;
            html += `<td style="padding:8px; border:1px solid #ddd; font-size:12px; max-width:150px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(a.entry_remark || '-')}</td>`;
            html += `<td style="padding:8px; border:1px solid #ddd; font-size:12px; max-width:150px;">${escapeHtml(a.complete_content || '-')}</td>`;
            html += `<td style="padding:8px; border:1px solid #ddd;">${escapeHtml(a.requester_username || '-')}</td>`;
            html += `<td style="padding:8px; border:1px solid #ddd; font-size:12px;">${stageDisplay}</td>`;
            html += '<td style="padding:8px; border:1px solid #ddd; text-align:center;">';
            html += `<button class="btn btn-sm btn-success" onclick="handleAnnotationApproval('${escapeHtml(a.id)}', 'approve', '${annDataBase64}')" style="margin-right:4px;">批准</button>`;
            html += `<button class="btn btn-sm btn-warning" onclick="handleAnnotationApproval('${escapeHtml(a.id)}', 'reject', '${annDataBase64}')">驳回</button>`;
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML += html;
    } catch (e) {
        console.warn('加载标注完成审批失败:', e);
    }
}

/**
 * 打开审批确认对话框
 */
export function openArchiveApprovalConfirmModal(approvalId, action, approvalDataBase64) {
    currentApprovalIdForConfirm = approvalId;
    currentApprovalActionForConfirm = action;

    // 解码批准对象（支持中文）
    let approvalObject = null;
    if (approvalDataBase64) {
        try {
            approvalObject = JSON.parse(decodeURIComponent(atob(approvalDataBase64)));
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
        const projectDisplay = (approvalObject.project_name || approvalObject.project_id || '-') + (approvalObject.party_b ? '@' + approvalObject.party_b : '');
        infoEl.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>项目：</strong>${escapeHtml(projectDisplay)}</div>
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

    // 先保存变量，因为 closeArchiveApprovalConfirmModal 会重置它们
    const savedApprovalId = currentApprovalIdForConfirm;
    const savedApprovalObject = currentApprovalObjectForConfirm;
    const approval = savedApprovalObject;
    const approvalStages = approval.approval_stages || [];
    const currentStage = approval.current_stage || 1;

    // 检查是否需要选择下一个审批人（即是否还有下一阶段）
    if (currentStage < approvalStages.length) {
        // 有下一阶段，需要选择PMO审批人
        closeArchiveApprovalConfirmModal();
        currentApprovalStagesForConfirm = approvalStages;
        // 恢复被 close 重置的变量
        currentApprovalIdForConfirm = savedApprovalId;
        currentApprovalObjectForConfirm = savedApprovalObject;
        await openSelectPMOApproverModal(approval.project_id);
        return;
    }

    // 没有下一阶段，需要先验证安全码
    closeArchiveApprovalConfirmModal();
    const codeResult = await promptArchiveApprovalCode(approval.project_id, savedApprovalId);
    if (!codeResult) return; // 用户取消
    await submitArchiveApproval(approval.project_id, savedApprovalId, null, codeResult.approver_id, codeResult.approval_code, codeResult.new_approval_code);
}

/**
 * 弹出审批安全码输入对话框
 */
async function promptArchiveApprovalCode(projectId, approvalId, errorMsg = null) {
    // 获取当前阶段的审批人列表
    let approvers = [];
    try {
        const approversResult = await getArchiveApprovers(projectId, approvalId);
        if (approversResult.status === 'success' && approversResult.approvers) {
            approvers = approversResult.approvers;
        }
    } catch (e) { /* ignore */ }

    // 自动匹配当前登录用户的身份
    const currentUserId = authState.user?.id;
    const currentUsername = authState.user?.username;
    let matchedApprover = null;
    if (currentUserId) {
        matchedApprover = approvers.find(a => String(a.id) === String(currentUserId));
    }
    if (!matchedApprover && currentUsername) {
        matchedApprover = approvers.find(a => a.username === currentUsername);
    }

    return new Promise((resolve) => {
        const fields = [];
        // 只有当无法自动匹配时才显示身份选择
        if (!matchedApprover && approvers.length > 1) {
            fields.push({
                label: '选择审批人身份',
                key: 'approver_id',
                type: 'select',
                options: approvers.map(a => ({
                    value: String(a.id),
                    label: `${a.display_name ? a.username + '（' + a.display_name + '）' : a.username}（${a.role === 'admin' ? '系统管理员' : a.role === 'pmo' ? '项目管理组织' : a.role === 'pmo_leader' ? 'PMO负责人' : '项目经理'}${a.organization ? ' - ' + a.organization : ''}）`
                })),
                placeholder: '请选择你的身份'
            });
        }
        if (errorMsg) {
            fields.push({
                label: `❌ ${errorMsg}，请重新输入`,
                key: '_err',
                type: 'info'
            });
        }
        fields.push({
            label: '审批安全码',
            key: 'approval_code',
            type: 'password',
            placeholder: '输入审批安全码'
        });
        const modalTitle = errorMsg ? '审批安全码错误 - 请重新输入' : '文档归档审批 - 请输入审批安全码';
        showInputModal(modalTitle, fields, (result) => {
            if (!result || !result.approval_code) {
                resolve(null);
                return;
            }
            if (matchedApprover) {
                result.approver_id = String(matchedApprover.id);
            } else if (approvers.length === 1) {
                result.approver_id = String(approvers[0].id);
            }
            resolve(result);
        });
    });
}

/**
 * 提交审批到服务器
 */
async function submitArchiveApproval(projectId, approvalId, selectPMOId = null, approverId = null, approvalCode = '', newApprovalCode = '') {
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

        // 添加审批人和安全码
        if (approverId) {
            body.approver_id = approverId;
        }
        if (approvalCode) {
            body.approval_code = approvalCode;
        }
        if (newApprovalCode) {
            body.new_approval_code = newApprovalCode;
        }
        if (approvalCode) {
            body.force_require_code = true;
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
        } else if (result.status === 'needs_change') {
            // 首次使用审批安全码需要设置新码
            const newCodeResult = await new Promise((resolve) => {
                showInputModal('首次使用审批安全码，请输入当前登录密码并设置新审批安全码', [
                    { label: '当前登录密码', key: 'approval_code', type: 'password', placeholder: '输入当前登录密码' },
                    { label: '新审批安全码', key: 'new_approval_code', type: 'password', placeholder: '至少8位，包含字母和数字' }
                ], resolve);
            });
            if (newCodeResult && newCodeResult.approval_code && newCodeResult.new_approval_code) {
                await submitArchiveApproval(projectId, approvalId, selectPMOId, approverId, newCodeResult.approval_code, newCodeResult.new_approval_code);
                return;
            }
            showNotification('已取消审批', 'info');
        } else {
            const errMsg = result.message || '未知错误';
            if (errMsg.includes('安全码')) {
                // 安全码错误：重新弹出输入框，不关闭
                const retryResult = await promptArchiveApprovalCode(projectId, approvalId, errMsg);
                if (!retryResult) {
                    showNotification('已取消审批', 'info');
                    closeArchiveApprovalConfirmModal();
                    closeSelectPMOApproverModal();
                    await loadPendingArchiveApprovals();
                } else {
                    await submitArchiveApproval(projectId, approvalId, selectPMOId, retryResult.approver_id, retryResult.approval_code, retryResult.new_approval_code);
                }
                return;
            }
            showNotification('批准失败: ' + errMsg, 'error');
        }
        closeArchiveApprovalConfirmModal();
        closeSelectPMOApproverModal();
        await loadPendingArchiveApprovals();
        // 刷新当前周期的文档列表
        try {
            const { appState } = await import('./app-state.js');
            if (appState.currentCycle) {
                const { renderCycleDocuments } = await import('./document.js');
                await renderCycleDocuments(appState.currentCycle);
            }
        } catch (e) { /* ignore */ }
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
                option.textContent = `${user.display_name ? user.username + '（' + user.display_name + '）' : user.username} (${user.organization || '未分配'})`;
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
                        <input type="checkbox" name="pmoApproverCheckbox" value="${userId}" style="margin-right: 8px;">
                        <strong>${escapeHtml(user.display_name ? user.username + '（' + user.display_name + '）' : user.username)}</strong> - ${escapeHtml(user.organization || '未分配')}
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
export async function handleSelectPMOApproverConfirm() {
    let selectedIds = [];

    // 从 checkbox 收集多个选中的 PMO 成员
    const checkboxes = document.querySelectorAll('input[name="pmoApproverCheckbox"]:checked');
    checkboxes.forEach(cb => {
        selectedIds.push(cb.value);
    });

    // 兼容下拉选择
    const selectVal = document.getElementById('pmoApproverSelect')?.value;
    if (selectVal && !selectedIds.includes(selectVal)) {
        selectedIds.push(selectVal);
    }

    // 传递逗号分隔的 ID 字符串，或 null 表示通知全部
    selectedPMOApproverIdForConfirm = selectedIds.length > 0 ? selectedIds.join(',') : null;

    if (currentApprovalIdForConfirm && currentApprovalObjectForConfirm) {
        const projectId = currentApprovalObjectForConfirm.project_id;
        const savedApprovalId = currentApprovalIdForConfirm;
        closeSelectPMOApproverModal();
        // 验证安全码
        const codeResult = await promptArchiveApprovalCode(projectId, savedApprovalId);
        if (!codeResult) return;
        submitArchiveApproval(projectId, savedApprovalId, selectedPMOApproverIdForConfirm, codeResult.approver_id, codeResult.approval_code, codeResult.new_approval_code);
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

    // 验证安全码
    closeArchiveApprovalConfirmModal();
    const codeResult = await promptArchiveApprovalCode(projectId, approvalId);
    if (!codeResult) return;

    showNotification('正在处理驳回请求...', 'info');

    try {
        const response = await fetch(`/api/projects/${projectId}/archive-reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                approval_id: approvalId,
                reject_reason: reason,
                approver_id: codeResult.approver_id || '',
                approval_code: codeResult.approval_code || ''
            })
        });

        const result = await response.json();
        if (result.status === 'success') {
            showNotification('✓ 已驳回此审批请求，申请人将收到通知', 'success');
        } else if (result.status === 'needs_change') {
            const newCodeResult = await new Promise((resolve) => {
                showInputModal('首次使用审批安全码，请输入当前登录密码并设置新审批安全码', [
                    { label: '当前登录密码', key: 'approval_code', type: 'password', placeholder: '输入当前登录密码' },
                    { label: '新审批安全码', key: 'new_approval_code', type: 'password', placeholder: '至少8位，包含字母和数字' }
                ], resolve);
            });
            if (newCodeResult && newCodeResult.approval_code && newCodeResult.new_approval_code) {
                const retryResp = await fetch(`/api/projects/${projectId}/archive-reject`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        approval_id: approvalId,
                        reject_reason: reason,
                        approver_id: codeResult.approver_id || '',
                        approval_code: newCodeResult.approval_code,
                        new_approval_code: newCodeResult.new_approval_code
                    })
                });
                const retryResult = await retryResp.json();
                if (retryResult.status === 'success') {
                    showNotification('✓ 已驳回此审批请求', 'success');
                } else {
                    showNotification('驳回失败: ' + (retryResult.message || ''), 'error');
                }
            }
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
    const confirmed = await new Promise(resolve => showConfirmModal('撤回归档', '确定要撤回此归档请求吗？', () => resolve(true), () => resolve(false)));
    if (!confirmed) {
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

/**
 * 处理标注完成审批（批准/驳回）
 */
async function handleAnnotationApproval(approvalId, action, approvalDataBase64) {
    let approval;
    try {
        approval = JSON.parse(decodeURIComponent(atob(approvalDataBase64)));
    } catch (e) {
        showNotification('数据解析失败', 'error');
        return;
    }

    const projectId = approval.project_id;
    if (!projectId) {
        showNotification('项目信息缺失', 'error');
        return;
    }

    if (action === 'reject') {
        // 驳回：先输入原因
        const reasonResult = await new Promise(resolve => {
            showInputModal('驳回标注完成', [
                { key: 'reject_reason', label: '驳回原因', type: 'textarea', placeholder: '请输入驳回原因' }
            ], resolve);
        });
        if (!reasonResult || !reasonResult.reject_reason) {
            showNotification('已取消', 'info');
            return;
        }

        // 获取审批安全码
        const codeResult = await promptAnnotationApprovalCode(projectId, approvalId);
        if (!codeResult) return;

        try {
            const resp = await fetch(`/api/projects/${projectId}/annotation-reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    approval_id: approvalId,
                    reject_reason: reasonResult.reject_reason,
                    approver_id: codeResult.approver_id,
                    approval_code: codeResult.approval_code,
                    new_approval_code: codeResult.new_approval_code || ''
                })
            });
            const result = await resp.json();
            if (result.status === 'success') {
                showNotification('已驳回', 'success');
            } else if (result.status === 'needs_change') {
                const newCodeResult = await new Promise(resolve => {
                    showInputModal('首次使用审批安全码，请设置', [
                        { label: '当前登录密码', key: 'approval_code', type: 'password', placeholder: '输入当前登录密码' },
                        { label: '新审批安全码', key: 'new_approval_code', type: 'password', placeholder: '至少8位，包含字母和数字' }
                    ], resolve);
                });
                if (newCodeResult && newCodeResult.approval_code && newCodeResult.new_approval_code) {
                    const retryResp = await fetch(`/api/projects/${projectId}/annotation-reject`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            approval_id: approvalId,
                            reject_reason: reasonResult.reject_reason,
                            approver_id: codeResult.approver_id,
                            approval_code: newCodeResult.approval_code,
                            new_approval_code: newCodeResult.new_approval_code
                        })
                    });
                    const retryResult = await retryResp.json();
                    if (retryResult.status === 'success') {
                        showNotification('已驳回', 'success');
                    } else {
                        showNotification('驳回失败: ' + (retryResult.message || ''), 'error');
                    }
                }
            } else {
                showNotification('驳回失败: ' + (result.message || ''), 'error');
            }
        } catch (e) {
            showNotification('驳回失败: ' + e.message, 'error');
        }
    } else {
        // 批准
        const codeResult = await promptAnnotationApprovalCode(projectId, approvalId);
        if (!codeResult) return;

        try {
            const resp = await fetch(`/api/projects/${projectId}/annotation-approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    approval_id: approvalId,
                    approver_id: codeResult.approver_id,
                    approval_code: codeResult.approval_code,
                    new_approval_code: codeResult.new_approval_code || '',
                    force_require_code: true
                })
            });
            const result = await resp.json();
            if (result.status === 'success') {
                showNotification(result.message || '审批通过', 'success');
            } else if (result.status === 'needs_change') {
                const newCodeResult = await new Promise(resolve => {
                    showInputModal('首次使用审批安全码，请设置', [
                        { label: '当前登录密码', key: 'approval_code', type: 'password', placeholder: '输入当前登录密码' },
                        { label: '新审批安全码', key: 'new_approval_code', type: 'password', placeholder: '至少8位，包含字母和数字' }
                    ], resolve);
                });
                if (newCodeResult && newCodeResult.approval_code && newCodeResult.new_approval_code) {
                    const retryResp = await fetch(`/api/projects/${projectId}/annotation-approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            approval_id: approvalId,
                            approver_id: codeResult.approver_id,
                            approval_code: newCodeResult.approval_code,
                            new_approval_code: newCodeResult.new_approval_code,
                            force_require_code: true
                        })
                    });
                    const retryResult = await retryResp.json();
                    if (retryResult.status === 'success') {
                        showNotification(retryResult.message || '审批通过', 'success');
                    } else {
                        showNotification('审批失败: ' + (retryResult.message || ''), 'error');
                    }
                }
            } else {
                showNotification('审批失败: ' + (result.message || ''), 'error');
            }
        } catch (e) {
            showNotification('审批失败: ' + e.message, 'error');
        }
    }

    await loadPendingArchiveApprovals();
    // 刷新文档列表
    try {
        if (appState.currentCycle) {
            const { renderCycleDocuments } = await import('./document.js');
            await renderCycleDocuments(appState.currentCycle);
        }
    } catch (e) { /* ignore */ }
}

/**
 * 标注完成审批安全码输入
 */
async function promptAnnotationApprovalCode(projectId, approvalId) {
    let approvers = [];
    try {
        const resp = await fetch(`/api/projects/${projectId}/annotation-approvers?approval_id=${encodeURIComponent(approvalId)}`);
        const data = await resp.json();
        if (data.status === 'success' && data.approvers) {
            approvers = data.approvers;
        }
    } catch (e) { /* ignore */ }

    const currentUserId = authState.user?.id;
    const currentUsername = authState.user?.username;
    let matchedApprover = null;
    if (currentUserId) {
        matchedApprover = approvers.find(a => String(a.id) === String(currentUserId));
    }
    if (!matchedApprover && currentUsername) {
        matchedApprover = approvers.find(a => a.username === currentUsername);
    }

    return new Promise((resolve) => {
        const fields = [];
        if (!matchedApprover && approvers.length > 1) {
            fields.push({
                label: '选择审批人身份',
                key: 'approver_id',
                type: 'select',
                options: approvers.map(a => ({
                    value: String(a.id),
                    label: `${a.display_name ? a.username + '（' + a.display_name + '）' : a.username}（${a.role === 'pmo' ? 'PMO' : a.role === 'pmo_leader' ? 'PMO负责人' : a.role === 'project_admin' ? '项目经理' : a.role}）`
                })),
                placeholder: '请选择你的身份'
            });
        }
        fields.push({
            label: '审批安全码',
            key: 'approval_code',
            type: 'password',
            placeholder: '输入审批安全码'
        });
        showInputModal('标注完成审批 - 请输入审批安全码', fields, (result) => {
            if (!result || !result.approval_code) {
                resolve(null);
                return;
            }
            if (matchedApprover) {
                result.approver_id = String(matchedApprover.id);
            } else if (approvers.length === 1) {
                result.approver_id = String(approvers[0].id);
            }
            resolve(result);
        });
    });
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
window.handleAnnotationApproval = handleAnnotationApproval;
