/**
 * 模块索引文件 - 用于导出所有模块
 */

// 导入各个模块
import { appState, elements, initSession } from './app-state.js';
import { authState } from './auth.js';
import { setupEventListeners, initDocModalResizer, showProjectButtons, hideProjectButtons, showNotification, toggleOperationLog, refreshOperationLog, closeConfirmModal, showConfirmModal, closeInputModal, applySystemSettingsToPage } from './ui.js';
import { loadProjectsList, loadProject, saveProject, deleteProject, loadProjectConfig, importJson, exportJson, packageProject, importPackage, confirmAcceptance, downloadPackage, getDashboardStats, getReportTypes, getReportData, getDocChangesData, getMessages, getUnreadMessageCount, markMessageAsRead, markAllMessagesAsRead, deleteMessage, batchMarkMessagesAsRead, batchDeleteMessages, respondProjectTransfer, sendMessageToApprovers, getPendingUsers, approveUserAccount, rejectUserAccount } from './api.js';
import { handleUploadDocument, handleFileSelect, handleEditDocument, handleDeleteDocument, handleReplaceDocument, loadUploadedDocuments, renderCycleDocuments, previewDocument, openUploadModal, openEditModal, archiveDocument, unarchiveDocument, generateReport } from './document.js';
import { renderProjectsList, selectProject, handleCreateProject, handleLoadProject, handleImportJson, handleExportJson, handleSaveProject, handlePackageProject, handleImportPackage, handleConfirmAcceptance, handleDownloadPackage, handleRematchFileManagement, handleAddCycle, handleRenameCycle, handleDeleteCycle, handleAddDoc, handleDeleteDoc, populateProjectManageSelects, populateDocSelect, resetImportPackageModal, openProjectSelectModal, closeProjectSelectModal, handleOpenProject, handleSoftDeleteProject, handleRestoreProject, handlePermanentDeleteProject, toggleDeletedProjects, openNewProjectModal, handlePackageFileSelect, handlePackageFileSelectInModal, handleImportPackageInModal } from './project.js';
import { renderCycles, renderInitialContent } from './cycle.js';
import { handleZipArchive, handleZipUpload, handleImportMatchedFiles, handleConfirmPendingFiles, handleRejectPendingFiles, loadZipPackagesList, searchZipFilesInPackage, fixZipSelectionIssue } from './zip.js';
import { handleGenerateReport, handleCheckCompliance, handleExportReport } from './report.js';
import { formatDate, formatDateToMonth, formatDateTimeDisplay, getFileExtension, isValidEmail } from './utils.js';

// 导出所有模块
export * from './app-state.js';
export * from './ui.js';
export * from './api.js';
export * from './document.js';
export * from './project.js';
export * from './cycle.js';
export * from './zip.js';
export * from './report.js';
export * from './utils.js';

// 报表配置缓存
let reportConfigsCache = [];
let currentReportType = 'overview';
let lastUnreadCountSnapshot = null;
const shownScheduledPopupIds = new Set();

/**
 * 渲染首页看板
 */
export async function renderDashboard() {
    try {
        // 加载报表类型配置
        await loadReportTypes();
        // 渲染当前选中的报表
        await switchReport(currentReportType);
    } catch (error) {
        console.error('渲染看板失败:', error);
    }
}

async function loadReportTypes() {
    const result = await getReportTypes();
    if (result.status === 'success' && result.data) {
        reportConfigsCache = result.data;
    }
}

export async function switchReport(reportType) {
    currentReportType = reportType;
    const result = await getReportData(reportType);
    if (result.status !== 'success' || !result.data) return;
    
    const data = result.data;
    const container = document.getElementById('dashboardContent');
    if (!container) return;
    
    // 更新标签页激活状态
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === reportType);
    });
    
    // 根据报表类型渲染不同内容
    switch (reportType) {
        case 'overview':
            container.innerHTML = renderOverviewReport(data);
            break;
        case 'projects':
            container.innerHTML = renderProjectsReport(data);
            break;
        case 'organizations':
            container.innerHTML = renderOrganizationsReport(data);
            break;
        case 'documents':
            container.innerHTML = renderDocumentsReport(data);
            break;
        case 'acceptance':
            container.innerHTML = renderAcceptanceReport(data);
            break;
        case 'trends':
            container.innerHTML = renderTrendsReport(data);
            break;
        default:
            container.innerHTML = renderOverviewReport(data);
    }
    
    // 如果有图表需要初始化
    if (reportType === 'trends' && data.months && data.months.length > 0) {
        initTrendsChart(data);
    }
}

function renderReportTabs() {
    if (!reportConfigsCache.length) return '';
    return `
        <div class="report-tabs">
            ${reportConfigsCache.map(cfg => `
                <button class="report-tab ${cfg.key === 'overview' ? 'active' : ''}" data-type="${cfg.key}" title="${cfg.description}">
                    <span class="tab-icon">${cfg.icon}</span>
                    <span class="tab-label">${cfg.name}</span>
                </button>
            `).join('')}
        </div>
    `;
}

function renderOverviewReport(data) {
    const acc = data.acceptance;
    const docs = data.document_completeness;
    const accTotal = acc.accepted + acc.partial + acc.pending || 1;
    const docsTotal = docs.complete + docs.partial + docs.empty || 1;
    
    // 获取用户角色和组织
    const { authState } = window;
    const userRole = authState?.user?.role || '';
    const userOrganization = authState?.user?.organization || '';
    
    let cardsHTML = `
        <div class="dashboard-card primary">
            <div class="card-icon">📁</div>
            <div class="card-info">
                <div class="card-value">${data.total_projects}</div>
                <div class="card-label">项目总数</div>
            </div>
        </div>`;
    
    // 只有 admin 和 pmo 角色显示承建单位卡片
    // project_admin 和 contractor 角色不显示
    if (userRole === 'admin' || userRole === 'pmo' || userRole === 'pmo_leader') {
        cardsHTML += `
            <div class="dashboard-card success">
                <div class="card-icon">🏢</div>
                <div class="card-info">
                    <div class="card-value">${data.total_organizations}</div>
                    <div class="card-label">承建单位</div>
                </div>
            </div>`;
    }
    
    cardsHTML += `
            <div class="dashboard-card warning">
                <div class="card-icon">✅</div>
                <div class="card-info">
                    <div class="card-value">${acc.accepted}</div>
                    <div class="card-label">已验收项目</div>
                </div>
            </div>
            <div class="dashboard-card info">
                <div class="card-icon">📈</div>
                <div class="card-info">
                    <div class="card-value">${docs.completion_rate}%</div>
                    <div class="card-label">资料完整率</div>
                </div>
            </div>`;
    
    return `
        <div class="dashboard-cards">
            ${cardsHTML}
        </div>
        
        <div class="dashboard-charts">
            <div class="chart-box">
                <h3>验收情况分布</h3>
                <div class="progress-list">
                    <div class="progress-item">
                        <span class="progress-label">已验收</span>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill success" style="width:${acc.accepted / accTotal * 100}%"></div>
                        </div>
                        <span class="progress-value">${acc.accepted}</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-label">部分验收</span>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill warning" style="width:${acc.partial / accTotal * 100}%"></div>
                        </div>
                        <span class="progress-value">${acc.partial}</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-label">未验收</span>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill pending" style="width:${acc.pending / accTotal * 100}%"></div>
                        </div>
                        <span class="progress-value">${acc.pending}</span>
                    </div>
                </div>
            </div>
            
            <div class="chart-box">
                <h3>资料完整情况</h3>
                <div class="progress-list">
                    <div class="progress-item">
                        <span class="progress-label">资料完整</span>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill success" style="width:${docs.complete / docsTotal * 100}%"></div>
                        </div>
                        <span class="progress-value">${docs.complete}</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-label">部分完整</span>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill warning" style="width:${docs.partial / docsTotal * 100}%"></div>
                        </div>
                        <span class="progress-value">${docs.partial}</span>
                    </div>
                    <div class="progress-item">
                        <span class="progress-label">待补充</span>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill pending" style="width:${docs.empty / docsTotal * 100}%"></div>
                        </div>
                        <span class="progress-value">${docs.empty}</span>
                    </div>
                </div>
        <div class="chart-summary" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #666;">
                <span>需求文档总数: <strong>${docs.total_required}</strong></span>
                <span>已归档文档数: <strong>${docs.total_completed}</strong></span>
            </div>
        </div>
            </div>
        </div>
        
        <!-- 文档变化统计 -->
        <div class="dashboard-charts" style="margin-top: 20px;">
            <div class="chart-box" style="width: 100%;">
                <h3>文档变化情况统计</h3>
                <div class="doc-changes-tabs" style="margin-bottom: 15px;">
                    <button class="doc-change-tab active" data-period="day">今日</button>
                    <button class="doc-change-tab" data-period="3days">最近3天</button>
                    <button class="doc-change-tab" data-period="7days">最近7天</button>
                    <button class="doc-change-tab" data-period="month">最近1个月</button>
                </div>
                <div class="doc-changes-content" style="width: 100%; max-width: 1200px;">
                    <div class="doc-changes-chart" style="height: 300px; margin-bottom: 20px;">
                        <canvas id="docChangesChart"></canvas>
                    </div>
                    <div class="doc-changes-details" style="width: 100%;">
                        <h4>变化明细</h4>
                        <div class="doc-changes-list" id="docChangesList" style="width: 100%;">
                            <div class="loading" style="padding: 20px; text-align: center;">加载中...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderProjectsReport(data) {
    const orgEntries = Object.entries(data.organization_distribution || {});
    const monthlyEntries = Object.entries(data.monthly_creation || {});
    const status = data.status_distribution || {};
    
    return `
        <div class="dashboard-cards">
            <div class="dashboard-card primary">
                <div class="card-icon">📁</div>
                <div class="card-info">
                    <div class="card-value">${data.total}</div>
                    <div class="card-label">项目总数</div>
                </div>
            </div>
            <div class="dashboard-card success">
                <div class="card-icon">✅</div>
                <div class="card-info">
                    <div class="card-value">${status.approved || 0}</div>
                    <div class="card-label">已审批</div>
                </div>
            </div>
            <div class="dashboard-card warning">
                <div class="card-icon">⏳</div>
                <div class="card-info">
                    <div class="card-value">${status.pending || 0}</div>
                    <div class="card-label">待审批</div>
                </div>
            </div>
        </div>
        
        <div class="dashboard-charts">
            <div class="chart-box">
                <h3>按承建单位分布</h3>
                <div class="stat-table">
                    ${orgEntries.length ? orgEntries.map(([name, count]) => `
                        <div class="stat-row">
                            <span class="stat-name">${name}</span>
                            <span class="stat-count">${count} 个项目</span>
                        </div>
                    `).join('') : '<p class="empty-tip">暂无数据</p>'}
                </div>
            </div>
            <div class="chart-box">
                <h3>按月创建趋势</h3>
                <div class="stat-table">
                    ${monthlyEntries.length ? monthlyEntries.map(([month, count]) => `
                        <div class="stat-row">
                            <span class="stat-name">${month}</span>
                            <span class="stat-count">${count} 个项目</span>
                        </div>
                    `).join('') : '<p class="empty-tip">暂无数据</p>'}
                </div>
            </div>
        </div>
    `;
}

function renderOrganizationsReport(data) {
    // 获取用户角色和组织
    const { authState } = window;
    const userRole = authState?.user?.role || '';
    const userOrganization = authState?.user?.organization || '';
    
    // 过滤组织数据：project_admin 只能看到本单位的数据
    let orgs = data.organizations || [];
    if (userRole === 'project_admin' && userOrganization) {
        orgs = orgs.filter(org => org.name === userOrganization);
    }
    
    return `
        <div class="dashboard-cards">
            <div class="dashboard-card primary">
                <div class="card-icon">🏢</div>
                <div class="card-info">
                    <div class="card-value">${orgs.length}</div>
                    <div class="card-label">${userRole === 'project_admin' ? '本单位' : '承建单位数'}</div>
                </div>
            </div>
        </div>
        <div class="chart-box" style="margin-top: 20px;">
            <h3>${userRole === 'project_admin' ? '本单位统计' : '承建单位统计'}</h3>
            <div class="org-table">
                <div class="org-header">
                    <span>单位名称</span>
                    <span>项目数</span>
                    <span>已验收</span>
                    <span>资料完整率</span>
                </div>
                ${orgs.length ? orgs.map(o => `
                    <div class="org-row">
                        <span>${o.name}</span>
                        <span>${o.project_count}</span>
                        <span>${o.accepted_projects}</span>
                        <span>${o.completion_rate}%</span>
                    </div>
                `).join('') : '<p class="empty-tip">暂无数据</p>'}
            </div>
        </div>
    `;
}

function renderDocumentsReport(data) {
    const types = Object.entries(data.doc_type_stats || {});
    const cycles = Object.entries(data.completion_by_cycle || {});
    const missing = data.missing_docs_top || [];
    
    return `
        <div class="dashboard-cards">
            <div class="dashboard-card warning">
                <div class="card-icon">📄</div>
                <div class="card-info">
                    <div class="card-value">${data.total_missing}</div>
                    <div class="card-label">缺失文档数</div>
                </div>
            </div>
        </div>
        <div class="dashboard-charts">
            <div class="chart-box">
                <h3>按文档类型完整率</h3>
                <div class="stat-table">
                    ${types.length ? types.map(([type, stat]) => `
                        <div class="stat-row">
                            <span class="stat-name">${type}</span>
                            <span class="stat-count">${stat.completed}/${stat.total} (${stat.rate}%)</span>
                        </div>
                    `).join('') : '<p class="empty-tip">暂无数据</p>'}
                </div>
            </div>
            <div class="chart-box">
                <h3>按周期完整率</h3>
                <div class="stat-table">
                    ${cycles.length ? cycles.map(([cycle, stat]) => `
                        <div class="stat-row">
                            <span class="stat-name">${cycle}</span>
                            <span class="stat-count">${stat.completed}/${stat.total} (${stat.rate}%)</span>
                        </div>
                    `).join('') : '<p class="empty-tip">暂无数据</p>'}
                </div>
            </div>
        </div>
        ${missing.length ? `
        <div class="chart-box" style="margin-top: 20px;">
            <h3>缺失文档 TOP ${missing.length}</h3>
            <div class="missing-docs-list">
                ${missing.map(m => `
                    <div class="missing-doc-item">
                        <span class="doc-project">${m.project_name}</span>
                        <span class="doc-cycle">${m.cycle}</span>
                        <span class="doc-name">${m.doc_name}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
    `;
}

function renderAcceptanceReport(data) {
    const pending = data.pending_projects || [];
    const accepted = data.accepted_projects || [];
    const monthly = Object.entries(data.acceptance_by_month || {});
    
    return `
        <div class="dashboard-cards">
            <div class="dashboard-card success">
                <div class="card-icon">✅</div>
                <div class="card-info">
                    <div class="card-value">${data.accepted_count}</div>
                    <div class="card-label">已验收</div>
                </div>
            </div>
            <div class="dashboard-card warning">
                <div class="card-icon">⏳</div>
                <div class="card-info">
                    <div class="card-value">${data.pending_count}</div>
                    <div class="card-label">待验收</div>
                </div>
            </div>
        </div>
        <div class="dashboard-charts">
            <div class="chart-box">
                <h3>待验收项目</h3>
                <div class="project-mini-list">
                    ${pending.length ? pending.map(p => `
                        <div class="project-mini-item">
                            <span class="p-name">${p.name}</span>
                            <span class="p-org">${p.party_b}</span>
                            <span class="p-progress">${p.cycle_progress} 周期</span>
                        </div>
                    `).join('') : '<p class="empty-tip">暂无待验收项目</p>'}
                </div>
            </div>
            <div class="chart-box">
                <h3>验收按月统计</h3>
                <div class="stat-table">
                    ${monthly.length ? monthly.map(([m, c]) => `
                        <div class="stat-row">
                            <span class="stat-name">${m}</span>
                            <span class="stat-count">${c} 个项目</span>
                        </div>
                    `).join('') : '<p class="empty-tip">暂无数据</p>'}
                </div>
            </div>
        </div>
    `;
}

function renderTrendsReport(data) {
    return `
        <div class="chart-box" style="margin-top: 20px;">
            <h3>平台趋势分析</h3>
            <div style="height: 320px;">
                <canvas id="trendsChart"></canvas>
            </div>
        </div>
    `;
}

function initTrendsChart(data) {
    const ctx = document.getElementById('trendsChart');
    if (!ctx) return;
    if (window.trendsChartInstance) {
        window.trendsChartInstance.destroy();
    }
    window.trendsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.months,
            datasets: [
                {
                    label: '新建项目',
                    data: data.creation,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: '验收项目',
                    data: data.acceptance,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: '文档上传',
                    data: data.doc_uploads,
                    borderColor: '#17a2b8',
                    backgroundColor: 'rgba(23, 162, 184, 0.1)',
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

// 消息中心相关
let messagesCache = [];

async function handleUserMessageClick(message) {
    const userId = message.related_id;
    if (!userId) return;
    const result = await getPendingUsers();
    if (result.status !== 'success' || !result.users) {
        showNotification('无法加载待审核用户列表', 'error');
        return;
    }
    const user = result.users.find(u => String(u.id) === String(userId));
    if (!user) {
        showNotification('该用户可能已被处理', 'info');
        return;
    }
    if (!message.is_read) {
        await markMessageAsRead(message.id);
        await loadMessages();
    }
    const { openAuditConfirmModal } = await import('./user-approval.js');
    openAuditConfirmModal(user.id, user.username, user.role, user.organization || '', user.email || '', user.created_at || '', 'approve');
}

async function handleTransferMessageClick(message) {
    const transferId = message.related_id;
    if (!transferId) return;
    if (!message.is_read) {
        await markMessageAsRead(message.id);
        await loadMessages();
    }
    showConfirmModal('项目移交', '是否接受该项目所有权移交？', async () => {
        const result = await respondProjectTransfer(transferId, 'accept');
        if (result.status === 'success') {
            showNotification('已接受移交', 'success');
            await loadMessages();
        } else {
            showNotification(result.message || '操作失败', 'error');
        }
    }, async () => {
        const result = await respondProjectTransfer(transferId, 'reject');
        if (result.status === 'success') {
            showNotification('已拒绝移交', 'success');
            await loadMessages();
        } else {
            showNotification(result.message || '操作失败', 'error');
        }
    }, { okText: '接受', cancelText: '拒绝' });
}

function isScheduledReportMessage(message) {
    const msgType = String(message?.type || '').toLowerCase();
    return msgType === 'scheduled_report' || msgType === 'scheduled_report_popup';
}

function openScheduledReportMessageModal(message) {
    let modal = document.getElementById('scheduledReportMessageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'scheduledReportMessageModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }

    const tz = appState.systemSettings?.timezone || 'Asia/Shanghai';
    const createdAt = formatDateTimeDisplay(message?.created_at, tz);
    const title = escapeHtml(message?.title || '定时报告通知');
    // 总是对内容进行HTML转义，屏蔽HTML代码
    const rawContent = message?.content || '';

    modal.innerHTML = `
        <div class="modal-content" style="max-width:760px;border-radius:12px;border:1px solid #dbe7f5;box-shadow:0 20px 50px rgba(8,36,74,.25);">
            <span class="close" id="scheduledReportMessageCloseBtn">&times;</span>
            <h2 style="margin:0;padding:14px 16px;background:linear-gradient(135deg,#f8fbff,#edf5ff);border-bottom:1px solid #dde8f6;">📄 报告详情</h2>
            <div style="padding:16px;max-height:60vh;overflow:auto;background:#f9fcff;">
                <div style="font-size:16px;font-weight:600;color:#153a6b;">${title}</div>
                <div style="font-size:12px;color:#6c7b90;margin-top:4px;">${createdAt}</div>
                <div style="margin-top:12px;font-size:13px;line-height:1.7;color:#334;">${escapeHtml(rawContent).replace(/\n/g, '<br>') || '-'}</div>
            </div>
            <div style="padding:12px 16px;border-top:1px solid #e6eef8;display:flex;justify-content:flex-end;gap:10px;">
                <button type="button" class="btn btn-secondary" id="scheduledReportMessageCloseBtn2">关闭</button>
                <button type="button" class="btn btn-primary" id="scheduledReportMessageOpenProjectBtn">打开项目</button>
            </div>
        </div>
    `;

    const closeModalInner = () => {
        modal.classList.remove('show');
        modal.style.display = 'none';
    };

    const closeBtn = document.getElementById('scheduledReportMessageCloseBtn');
    if (closeBtn) closeBtn.onclick = closeModalInner;
    const closeBtn2 = document.getElementById('scheduledReportMessageCloseBtn2');
    if (closeBtn2) closeBtn2.onclick = closeModalInner;

    const openProjectBtn = document.getElementById('scheduledReportMessageOpenProjectBtn');
    if (openProjectBtn) {
        openProjectBtn.onclick = () => {
            closeModalInner();
            const projectId = message?.related_id;
            if (projectId) navigateToProject(projectId, null);
        };
    }

    modal.classList.add('show');
    modal.style.display = 'block';
}

async function handleProjectMessageClick(message) {
    const projectId = message.related_id;
    if (!projectId) return;
    if (!message.is_read) {
        await markMessageAsRead(message.id);
        await loadMessages();
    }

    if (isScheduledReportMessage(message)) {
        openScheduledReportMessageModal(message);
        return;
    }

    showNotification('请在项目列表中查看该项目', 'info');
}

async function handleArchiveApprovalMessageClick(message) {
    const projectId = message.related_id;
    if (!message.is_read) {
        await markMessageAsRead(message.id);
        await loadMessages();
    }
    closeMessageModal();
    const isPending = (message.title || '').includes('待审批');
    const isApprover = ['admin', 'pmo', 'pmo_leader', 'project_admin'].includes(authState.user?.role);
    if (isPending && isApprover) {
        // 待审批消息 + 审批角色：打开审批界面
        try {
            const m = await import('./archive-approval.js');
            m.openArchiveApprovalModal();
        } catch (e) {
            console.error('打开审批界面失败:', e);
            if (projectId) {
                let cycle = null;
                if (message.content) {
                    const match = message.content.match(/周期\s*["""」]([^"""」]+)["""」]/);
                    if (match) cycle = match[1];
                }
                navigateToProject(projectId, cycle);
            }
        }
    } else {
        // 已完成/已驳回/阶段通知/一般员工：导航到项目文档
        if (projectId) {
            let cycle = null;
            if (message.content) {
                const match = message.content.match(/周期\s*["""」]([^"""」]+)["""」]/);
                if (match) cycle = match[1];
            }
            navigateToProject(projectId, cycle);
        }
    }
}

function navigateToProject(projectId, cycle) {
    if (!projectId) return;
    // 仅保留白名单参数，避免把无关参数带入URL
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('project', projectId);
    if (cycle) {
        url.searchParams.set('cycle', cycle);
    }
    window.location.href = url.toString();
}

export async function initMessageCenter() {
    await refreshUnreadCount();
    await refreshHeaderMarquee();
    // 绑定消息中心事件
    const msgBtn = document.getElementById('messageCenterBtn');
    if (msgBtn) {
        msgBtn.addEventListener('click', openMessageModal);
    }
    // 绑定顶部铃铛和滚动消息点击
    const bellBtn = document.getElementById('headerBellBtn');
    if (bellBtn) {
        bellBtn.addEventListener('click', openMessageModal);
    }
    const marqueeWrap = document.getElementById('marqueeWrap');
    if (marqueeWrap) {
        marqueeWrap.addEventListener('click', openMessageModal);
    }
    // 显示header-center
    const headerCenter = document.getElementById('headerCenter');
    if (headerCenter) {
        headerCenter.style.display = 'flex';
    }
    // 初始化批量操作工具栏
    initMsgBatchToolbar();
    setInterval(async () => {
        await refreshUnreadCount();
        await maybeShowScheduledReportLoginPopup();
    }, 30000);
    setInterval(refreshHeaderMarquee, 60000);
    await maybeShowScheduledReportLoginPopup();
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function summarizeMessageContent(message) {
    const raw = String(message?.content || '');
    // 去除 HTML 标签并压缩空白
    const plain = raw
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!plain) return '点击查看详情';
    const maxLen = 88;
    return plain.length > maxLen ? `${plain.slice(0, maxLen)}...` : plain;
}

async function maybeShowScheduledReportLoginPopup() {
    if (!authState?.isAuthenticated || !authState?.user) {
        return;
    }

    try {
        const result = await getMessages(false, 50, 0);
        if (result.status !== 'success' || !Array.isArray(result.messages)) {
            return;
        }
        const popupMessages = result.messages.filter(m => m && m.type === 'scheduled_report_popup');
        if (!popupMessages.length) {
            return;
        }
        const newPopupMessages = popupMessages.filter(m => m.id && !shownScheduledPopupIds.has(m.id));
        if (!newPopupMessages.length) {
            return;
        }
        newPopupMessages.forEach(m => shownScheduledPopupIds.add(m.id));
        renderScheduledReportLoginPopup(newPopupMessages);
    } catch (_) {
        // ignore
    }
}

function renderScheduledReportLoginPopup(messages) {
    let modal = document.getElementById('scheduledReportLoginPopupModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'scheduledReportLoginPopupModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }

    const listHtml = messages.slice(0, 8).map(m => {
        const title = escapeHtml(m.title || '周报/月报提醒');
        const content = escapeHtml((m.content || '').replace(/\n/g, ' ').slice(0, 140));
        const tz = appState.systemSettings?.timezone || 'Asia/Shanghai';
        const timeText = m.created_at ? escapeHtml(formatDateTimeDisplay(m.created_at, tz)) : '';
        return `
            <div style="padding:10px 12px; border:1px solid #e4ebf5; border-radius:8px; background:#fff; margin-bottom:8px;">
                <div style="font-size:13px; color:#153a6b; font-weight:600;">${title}</div>
                <div style="font-size:12px; color:#6c7b90; margin-top:4px;">${timeText}</div>
                <div style="font-size:12px; color:#445; margin-top:6px; line-height:1.5;">${content}</div>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:640px; border-radius:12px; border:1px solid #dbe7f5; box-shadow:0 20px 50px rgba(8,36,74,.25);">
            <span class="close" id="scheduledReportPopupCloseBtn">&times;</span>
            <h2 style="margin:0; padding:14px 16px; background:linear-gradient(135deg,#f8fbff,#edf5ff); border-bottom:1px solid #dde8f6;">📬 周报/月报提醒</h2>
            <div style="padding:14px 16px; max-height:340px; overflow:auto; background:#f9fcff;">
                ${listHtml}
            </div>
            <div style="padding:12px 16px; border-top:1px solid #e6eef8; display:flex; justify-content:flex-end; gap:10px;">
                <button type="button" class="btn btn-secondary" id="scheduledReportPopupLaterBtn">稍后查看</button>
                <button type="button" class="btn btn-primary" id="scheduledReportPopupOpenMsgBtn">打开消息中心</button>
            </div>
        </div>
    `;

    const closePopup = () => {
        modal.classList.remove('show');
        modal.style.display = 'none';
    };

    const closeBtn = document.getElementById('scheduledReportPopupCloseBtn');
    if (closeBtn) {
        closeBtn.onclick = closePopup;
    }
    const laterBtn = document.getElementById('scheduledReportPopupLaterBtn');
    if (laterBtn) {
        laterBtn.onclick = closePopup;
    }
    const openMsgBtn = document.getElementById('scheduledReportPopupOpenMsgBtn');
    if (openMsgBtn) {
        openMsgBtn.onclick = async () => {
            closePopup();
            await openMessageModal();
        };
    }

    modal.classList.add('show');
    modal.style.display = 'block';
}

async function refreshUnreadCount() {
    const result = await getUnreadMessageCount();
    const count = result.status === 'success' ? result.count : 0;
    if (lastUnreadCountSnapshot !== null && count > lastUnreadCountSnapshot) {
        showNotification(`你有 ${count} 条未读消息`, 'info');
    }
    lastUnreadCountSnapshot = count;
    // 更新原始badge
    const badge = document.getElementById('messageBadge');
    if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    // 更新顶部铃铛badge
    const bellBadge = document.getElementById('headerBellBadge');
    if (bellBadge) {
        bellBadge.textContent = count > 99 ? '99+' : count;
        bellBadge.style.display = count > 0 ? 'flex' : 'none';
    }
}

async function refreshHeaderMarquee() {
    const marqueeText = document.getElementById('marqueeText');
    if (!marqueeText) return;
    try {
        // 仅滚动未读消息
        const result = await getMessages(false, 10, 0);
        const marqueeWrap = document.getElementById('marqueeWrap');
        if (result.status === 'success' && result.messages && result.messages.length > 0) {
            const texts = result.messages.slice(0, 5).map(m => {
                const prefix = '🔴 ';
                return prefix + m.title + '：' + (m.content || '').substring(0, 40);
            });
            marqueeText.textContent = texts.join('　　｜　　');
            marqueeText.classList.remove('no-scroll');
            if (marqueeWrap) marqueeWrap.style.visibility = 'visible';
        } else {
            marqueeText.textContent = '';
            marqueeText.classList.add('no-scroll');
            if (marqueeWrap) marqueeWrap.style.visibility = 'hidden';
        }
    } catch (e) {
        marqueeText.textContent = '';
        marqueeText.classList.add('no-scroll');
    }
}

async function openMessageModal() {
    const modal = document.getElementById('messageModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
    await loadMessages();
}

export function backToDashboard() {
    // 清除当前项目状态
    appState.currentProjectId = null;
    appState.projectConfig = null;
    appState.currentCycle = null;
    
    // 更新URL
    const url = new URL(window.location);
    url.searchParams.delete('project');
    window.history.replaceState({}, '', url);
    
    // 隐藏周期导航
    const cycleNavBar = document.getElementById('cycleNavBar');
    if (cycleNavBar) cycleNavBar.style.display = 'none';
    
    // 隐藏项目相关按钮
    hideProjectButtons();
    
    // 隐藏当前项目名和返回按钮
    const nameEl = document.getElementById('currentProjectName');
    if (nameEl) nameEl.style.display = 'none';
    const backBtn = document.getElementById('backToDashboardBtn');
    if (backBtn) backBtn.style.display = 'none';
    
    // 恢复看板内容
    const contentArea = document.getElementById('contentArea');
    if (contentArea) {
        contentArea.innerHTML = `
            <div id="dashboardPanel" class="dashboard-panel">
                <h2 class="dashboard-title">📊 平台数据看板</h2>
                <div class="report-tabs">
                    <button class="report-tab active" data-type="overview" title="平台概览"><span class="tab-icon">📊</span><span class="tab-label">概览</span></button>
                    <button class="report-tab" data-type="projects" title="项目分析"><span class="tab-icon">📁</span><span class="tab-label">项目</span></button>
                    <button class="report-tab" data-type="organizations" title="承建单位分析"><span class="tab-icon">🏢</span><span class="tab-label">单位</span></button>
                    <button class="report-tab" data-type="documents" title="文档分析"><span class="tab-icon">📄</span><span class="tab-label">文档</span></button>
                    <button class="report-tab" data-type="acceptance" title="验收分析"><span class="tab-icon">✅</span><span class="tab-label">验收</span></button>
                    <button class="report-tab" data-type="trends" title="趋势分析"><span class="tab-icon">📈</span><span class="tab-label">趋势</span></button>
                </div>
                <div id="dashboardContent"><div class="loading" style="padding: 40px; text-align: center;">加载中...</div></div>
                <div class="welcome-hint" style="margin-top: 20px;"><p>💡 提示：点击左上角 <strong>项目文档管理中心</strong> 打开项目列表，选择或创建项目</p></div>
            </div>
            <div class="welcome-message" style="display:none;">
                <h2>欢迎使用项目文档管理中心</h2>
                <p>请在顶部选择项目，加载配置文件</p>
                <p>然后在顶部周期导航中选择周期，管理文档</p>
            </div>
        `;
        // 重新绑定标签页事件
        contentArea.querySelectorAll('.report-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                switchReport(tab.dataset.type);
            });
        });
    }
    
    // 重新渲染看板
    renderDashboard();
}

export function closeMessageModal() {
    const modal = document.getElementById('messageModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

async function loadMessages() {
    const result = await getMessages(null, 50, 0);
    const container = document.getElementById('messageListContainer');
    if (!container) return;
    
    if (result.status !== 'success' || !result.messages) {
        container.innerHTML = '<p class="empty-tip">加载失败</p>';
        return;
    }
    
    messagesCache = result.messages;
    renderMessageList(messagesCache);
    await refreshUnreadCount();
}

function renderMessageList(messages) {
    const container = document.getElementById('messageListContainer');
    if (!messages.length) {
        container.innerHTML = '<p class="empty-tip">暂无消息</p>';
        updateMsgBatchUI();
        return;
    }

    container.innerHTML = messages.map(m => {
        const isTransfer = m.related_type === 'project_transfer' && !m.is_read;
        const isUserApproval = m.type === 'approval' && m.related_type === 'user' && !m.is_read;
        const isArchiveApproval = m.related_type === 'archive_approval';
        const isScheduledReport = isScheduledReportMessage(m);
        // 区分审批消息状态：只有标题含"待审批"才是待处理
        const isArchivePending = isArchiveApproval && (m.title || '').includes('待审批');
        const isArchiveDone = isArchiveApproval && !isArchivePending;
        const clickable = m.related_type === 'user' || m.related_type === 'project_transfer' || m.related_type === 'project' || m.related_type === 'archive_approval';
        const tz = appState.systemSettings?.timezone || 'Asia/Shanghai';
        const createdAtText = formatDateTimeDisplay(m.created_at, tz);
        // 确定审批消息的按钮文案和样式
        let archiveBtnHtml = '';
        if (isArchivePending && ['admin','pmo','project_admin'].includes(authState.user?.role)) {
            archiveBtnHtml = `<button class="btn btn-sm btn-primary msg-archive-goto-btn" data-id="${m.id}" data-related="${m.related_id || ''}" data-action="approve">去审批</button>`;
        } else if (isArchiveApproval) {
            archiveBtnHtml = `<button class="btn btn-sm btn-outline-secondary msg-archive-goto-btn" data-id="${m.id}" data-related="${m.related_id || ''}" data-action="view" style="border:1px solid #ccc;background:#fff;color:#555;">查看文档</button>`;
        }
        return `
        <div class="message-item ${m.is_read ? 'read' : 'unread'}${clickable ? ' clickable' : ''}" data-id="${m.id}">
            <div style="display:flex;gap:8px;align-items:flex-start;">
                <input type="checkbox" class="msg-item-checkbox" data-id="${m.id}" onclick="event.stopPropagation()">
                <div style="flex:1;min-width:0;">
                    <div class="message-header">
                        <span class="message-title">${m.title}</span>
                        <span class="message-time">${createdAtText}</span>
                    </div>
                    <div class="message-content" style="color:#5f6b7a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(summarizeMessageContent(m))}</div>
                    <div class="message-actions">
                        ${isTransfer ? `
                            <button class="btn btn-sm btn-success msg-transfer-accept-btn" data-id="${m.id}" data-related="${m.related_id || ''}">同意接受</button>
                            <button class="btn btn-sm btn-secondary msg-transfer-reject-btn" data-id="${m.id}" data-related="${m.related_id || ''}">拒绝</button>
                        ` : ''}
                        ${isUserApproval ? `
                            <button class="btn btn-sm btn-success msg-user-accept-btn" data-id="${m.id}" data-related="${m.related_id || ''}">审批通过</button>
                            <button class="btn btn-sm btn-danger msg-user-reject-btn" data-id="${m.id}" data-related="${m.related_id || ''}">拒绝</button>
                        ` : ''}
                        ${archiveBtnHtml}
                        ${isScheduledReport ? `<button class="btn btn-sm btn-primary msg-report-view-btn" data-id="${m.id}">查看报告</button>` : ''}
                        ${!m.is_read && !isTransfer && !isUserApproval ? `<button class="btn btn-sm btn-primary msg-read-btn" data-id="${m.id}">标为已读</button>` : ''}
                        <button class="btn btn-sm btn-secondary msg-del-btn" data-id="${m.id}">删除</button>
                    </div>
                </div>
            </div>
        </div>
    `}).join('');

    // 绑定标为已读按钮事件
    container.querySelectorAll('.msg-read-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            await markMessageAsRead(id);
            await loadMessages();
        });
    });
    // 绑定删除按钮事件
    container.querySelectorAll('.msg-del-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            await deleteMessage(id);
            await loadMessages();
        });
    });
    // 绑定报告查看按钮
    container.querySelectorAll('.msg-report-view-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const msg = messagesCache.find((item) => String(item.id) === String(id));
            if (!msg) return;
            if (!msg.is_read) {
                await markMessageAsRead(id);
                await loadMessages();
            }
            openScheduledReportMessageModal(msg);
        });
    });

    // 绑定移交同意事件
    container.querySelectorAll('.msg-transfer-accept-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const relatedId = btn.dataset.related;
            if (!relatedId) return;
            const result = await respondProjectTransfer(relatedId, 'accept');
            if (result.status === 'success') {
                await markMessageAsRead(id);
                await loadMessages();
                showNotification('已同意接受项目所有权移交', 'success');
            } else {
                showNotification(result.message || '操作失败', 'error');
            }
        });
    });
    // 绑定移交拒绝事件
    container.querySelectorAll('.msg-transfer-reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const relatedId = btn.dataset.related;
            if (!relatedId) return;
            const result = await respondProjectTransfer(relatedId, 'reject');
            if (result.status === 'success') {
                await markMessageAsRead(id);
                await loadMessages();
                showNotification('已拒绝项目所有权移交', 'info');
            } else {
                showNotification(result.message || '操作失败', 'error');
            }
        });
    });
    container.querySelectorAll('.msg-user-accept-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const relatedId = btn.dataset.related;
            if (!relatedId) return;
            const result = await approveUserAccount(relatedId);
            if (result.status === 'success') {
                await markMessageAsRead(id);
                await loadMessages();
                showNotification('已同意用户审核', 'success');
            } else {
                showNotification(result.message || '操作失败', 'error');
            }
        });
    });
    container.querySelectorAll('.msg-user-reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const relatedId = btn.dataset.related;
            if (!relatedId) return;
            const result = await rejectUserAccount(relatedId);
            if (result.status === 'success') {
                await markMessageAsRead(id);
                await loadMessages();
                showNotification('已拒绝用户审核', 'info');
            } else {
                showNotification(result.message || '操作失败', 'error');
            }
        });
    });
    // 绑定归档审批按钮（区分"去审批"和"查看文档"）
    container.querySelectorAll('.msg-archive-goto-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const action = btn.dataset.action;
            await markMessageAsRead(id);
            await loadMessages();
            closeMessageModal();
            if (action === 'approve') {
                // 待审批：打开审批界面
                try {
                    const m = await import('./archive-approval.js');
                    m.openArchiveApprovalModal();
                } catch (err) {
                    console.error('打开审批界面失败:', err);
                }
            } else {
                // 已完成/已驳回/阶段通知：导航到对应项目文档
                const msg = messagesCache.find(m => m.id === id);
                if (msg) {
                    const projectId = msg.related_id;
                    let cycle = null;
                    if (msg.content) {
                        const match = msg.content.match(/周期\s*["""」]([^"""」]+)["""」]/);
                        if (match) cycle = match[1];
                    }
                    navigateToProject(projectId, cycle);
                }
            }
        });
    });
    // 绑定消息项点击跳转
    container.querySelectorAll('.message-item.clickable').forEach(item => {
        item.addEventListener('click', async (e) => {
            if (e.target.closest('button')) return;
            const id = item.dataset.id;
            const m = messagesCache.find(msg => msg.id === id);
            if (!m) return;
            if (m.related_type === 'user') {
                await handleUserMessageClick(m);
            } else if (m.related_type === 'project_transfer') {
                await handleTransferMessageClick(m);
            } else if (m.related_type === 'project') {
                await handleProjectMessageClick(m);
            } else if (m.related_type === 'archive_approval') {
                await handleArchiveApprovalMessageClick(m);
            }
        });
    });
    // 绑定复选框变更事件
    container.querySelectorAll('.msg-item-checkbox').forEach(cb => {
        cb.addEventListener('change', updateMsgBatchUI);
    });
}

function getSelectedMsgIds() {
    const checkboxes = document.querySelectorAll('.msg-item-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.dataset.id);
}

function updateMsgBatchUI() {
    const selected = getSelectedMsgIds();
    const countEl = document.getElementById('msgSelectedCount');
    const batchReadBtn = document.getElementById('msgBatchRead');
    const batchDeleteBtn = document.getElementById('msgBatchDelete');
    const selectAllCb = document.getElementById('msgSelectAll');
    if (countEl) countEl.textContent = `已选 ${selected.length} 条`;
    if (batchReadBtn) batchReadBtn.disabled = selected.length === 0;
    if (batchDeleteBtn) batchDeleteBtn.disabled = selected.length === 0;
    // 更新全选状态
    const allCbs = document.querySelectorAll('.msg-item-checkbox');
    if (selectAllCb && allCbs.length > 0) {
        selectAllCb.checked = selected.length === allCbs.length;
        selectAllCb.indeterminate = selected.length > 0 && selected.length < allCbs.length;
    }
}

function initMsgBatchToolbar() {
    const selectAllCb = document.getElementById('msgSelectAll');
    if (selectAllCb) {
        selectAllCb.addEventListener('change', () => {
            const checked = selectAllCb.checked;
            document.querySelectorAll('.msg-item-checkbox').forEach(cb => { cb.checked = checked; });
            updateMsgBatchUI();
        });
    }
    const invertBtn = document.getElementById('msgInvertSelect');
    if (invertBtn) {
        invertBtn.addEventListener('click', () => {
            document.querySelectorAll('.msg-item-checkbox').forEach(cb => { cb.checked = !cb.checked; });
            updateMsgBatchUI();
        });
    }
    const batchReadBtn = document.getElementById('msgBatchRead');
    if (batchReadBtn) {
        batchReadBtn.addEventListener('click', async () => {
            const ids = getSelectedMsgIds();
            if (!ids.length) return;
            const result = await batchMarkMessagesAsRead(ids);
            if (result.status === 'success') {
                showNotification(result.message || `已标记 ${ids.length} 条为已读`, 'success');
                await loadMessages();
            } else {
                showNotification(result.message || '操作失败', 'error');
            }
        });
    }
    const batchDeleteBtn = document.getElementById('msgBatchDelete');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', async () => {
            const ids = getSelectedMsgIds();
            if (!ids.length) return;
            showConfirmModal('批量删除消息', `确定要删除选中的 ${ids.length} 条消息吗？`, async () => {
                const result = await batchDeleteMessages(ids);
                if (result.status === 'success') {
                    showNotification(result.message || `已删除 ${ids.length} 条消息`, 'success');
                    await loadMessages();
                } else {
                    showNotification(result.message || '操作失败', 'error');
                }
            });
        });
    }
}

export async function initApp() {
    console.log('开始初始化应用...');
    
    // 初始化会话ID（每次页面加载生成新的会话，刷新后自动失效）
    initSession();
    console.log('会话已初始化');
    
    setupEventListeners();
    console.log('事件监听器已设置');
    
    // 初始化时从服务端读取系统设置并应用到页面标题
    applySystemSettingsToPage();

    // 待审核用户界面处理
    if (authState.isAuthenticated && authState.user && authState.user.status === 'pending') {
        const pendingPanel = document.getElementById('pendingApprovalPanel');
        const contentArea = document.getElementById('contentArea');
        const cycleNavBar = document.getElementById('cycleNavBar');
        const backToDashboardBtn = document.getElementById('backToDashboardBtn');
        const projectTitle = document.getElementById('projectTitle');
        const systemManagementMenu = document.getElementById('systemManagementMenu');
        const documentRequirementsMenu = document.getElementById('documentRequirementsMenu');
        const generateReportBtn = document.getElementById('generateReportBtn');
        const packageProjectBtn = document.getElementById('packageProjectBtn');
        const acceptanceMenu = document.getElementById('acceptanceMenu');

        if (pendingPanel) pendingPanel.style.display = 'block';
        if (contentArea) contentArea.style.display = 'none';
        if (cycleNavBar) cycleNavBar.style.display = 'none';
        if (backToDashboardBtn) backToDashboardBtn.style.display = 'none';
        if (projectTitle) projectTitle.style.pointerEvents = 'none';
        if (systemManagementMenu) systemManagementMenu.style.display = 'none';
        if (documentRequirementsMenu) documentRequirementsMenu.style.display = 'none';
        if (generateReportBtn) generateReportBtn.style.display = 'none';
        if (packageProjectBtn) packageProjectBtn.style.display = 'none';
        if (acceptanceMenu) acceptanceMenu.style.display = 'none';

        initMessageCenter();
        initDocModalResizer();
        return;
    }

    const projects = await loadProjectsList();
    renderProjectsList(projects);
    console.log('项目列表已加载');
    
    // 加载看板数据
    renderDashboard();
    
    // 初始化消息中心
    initMessageCenter();
    
    // 初始化宽度调整器
    initDocModalResizer();
    
    // 修复ZIP文件选择问题
    fixZipSelectionIssue();
    
    // 绑定报表标签页事件
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchReport(tab.dataset.type);
        });
    });
    
    // 绑定消息中心事件
    const readAllBtn = document.getElementById('markAllReadBtn');
    if (readAllBtn) {
        readAllBtn.addEventListener('click', async () => {
            await markAllMessagesAsRead();
            await loadMessages();
        });
    }
    
    // 绑定返回看板按钮
    const backToDashboardBtn = document.getElementById('backToDashboardBtn');
    if (backToDashboardBtn) {
        backToDashboardBtn.addEventListener('click', backToDashboard);
    }

    // 检查URL参数是否有项目ID
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    const urlCycle = urlParams.get('cycle');

    // 仅保留白名单参数，避免URL暴露无关业务参数造成误解
    const cleanUrl = new URL(window.location.origin + window.location.pathname);
    if (projectId) cleanUrl.searchParams.set('project', projectId);
    if (urlCycle) cleanUrl.searchParams.set('cycle', urlCycle);
    if (cleanUrl.toString() !== window.location.href) {
        window.history.replaceState({}, '', cleanUrl.toString());
    }
    console.log('URL中的projectId:', projectId, 'cycle:', urlCycle);

    if (projectId) {
        // 直接使用selectProject加载项目
        setTimeout(async () => {
            try {
                await selectProject(projectId);
                // 如果URL中指定了周期，自动选择该周期
                if (urlCycle) {
                    const { selectCycle } = await import('./cycle.js');
                    selectCycle(urlCycle);
                    // 清除URL中的cycle参数，避免刷新时重复跳转
                    const cleanUrl = new URL(window.location);
                    cleanUrl.searchParams.delete('cycle');
                    window.history.replaceState({}, '', cleanUrl);
                }
            } catch (err) {
                console.error('通过URL加载项目失败:', err);
                showNotification('加载项目失败: ' + err.message, 'error');
                // 加载失败，显示项目选择模态框
                openProjectSelectModal();
            }
        }, 300);
    } else {
        // 没有指定项目ID，所有角色默认显示看板
        console.log('默认显示看板，点击系统名称打开项目管理');
        // 显示动画箭头提示
        showProjectHintArrow();
    }

    // 将generateReport函数添加到全局作用域
    if (typeof window !== 'undefined') {
        window.generateReport = generateReport;
        window.closeMessageModal = closeMessageModal;
    }
    
    console.log('应用初始化完成');
    console.log('generateReport函数是否已添加到全局作用域:', typeof window.generateReport === 'function');
}


/**
 * 待审核用户发送留言给审核人
 */
export async function sendApproverMessage() {
    const textarea = document.getElementById('approverMessageContent');
    if (!textarea) return;
    const content = textarea.value.trim();
    if (!content) {
        showNotification('请输入留言内容', 'error');
        return;
    }
    const result = await sendMessageToApprovers(content);
    if (result.status === 'success') {
        showNotification(result.message || '发送成功', 'success');
        textarea.value = '';
    } else {
        showNotification(result.message || '发送失败', 'error');
    }
}

/**
 * 显示指向系统名称的动画箭头提示
 */
function showProjectHintArrow() {
    // 如果已有箭头，不重复创建
    if (document.getElementById('projectHintArrow')) return;

    const arrow = document.createElement('div');
    arrow.id = 'projectHintArrow';
    arrow.innerHTML = `
        <div style="
            position: fixed;
            top: 50px;
            left: 20px;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: hintBounce 1.5s ease-in-out infinite;
            pointer-events: none;
            transition: opacity 0.5s;
        ">
            <span style="font-size: 28px; transform: rotate(-45deg); display: inline-block;">👆</span>
            <span style="
                background: rgba(0,0,0,0.75);
                color: #fff;
                padding: 6px 14px;
                border-radius: 16px;
                font-size: 13px;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            ">点击此处开始项目管理</span>
        </div>
    `;
    document.body.appendChild(arrow);

    // 注入动画
    if (!document.getElementById('hintBounceStyle')) {
        const style = document.createElement('style');
        style.id = 'hintBounceStyle';
        style.textContent = `
            @keyframes hintBounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
        `;
        document.head.appendChild(style);
    }

    // 点击projectTitle时移除箭头
    const title = document.getElementById('projectTitle');
    if (title) {
        title.addEventListener('click', removeProjectHintArrow, { once: true });
    }

    // 10秒后自动消失
    setTimeout(() => {
        removeProjectHintArrow();
    }, 10000);
}

function removeProjectHintArrow() {
    const arrow = document.getElementById('projectHintArrow');
    if (arrow) {
        arrow.style.opacity = '0';
        setTimeout(() => arrow.remove(), 500);
    }
}

// 文档变化统计功能
let docChangesChartInstance = null;

/**
 * 初始化文档变化统计
 */
export function initDocChangesStats() {
    // 绑定标签页事件
    document.querySelectorAll('.doc-change-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.doc-change-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadDocChangesData(tab.dataset.period);
        });
    });
    
    // 初始加载今日数据
    loadDocChangesData('day');
}

/**
 * 加载文档变化数据
 */
async function loadDocChangesData(period) {
    try {
        const result = await getDocChangesData(period);
        if (result.status !== 'success' || !result.data) {
            document.getElementById('docChangesList').innerHTML = '<p class="empty-tip">加载失败</p>';
            return;
        }
        const data = result.data;
        // 更新图表
        updateDocChangesChart(data);
        // 更新明细列表
        updateDocChangesList(data.details || []);
    } catch (error) {
        console.error('加载文档变化数据失败:', error);
        document.getElementById('docChangesList').innerHTML = '<p class="empty-tip">加载失败</p>';
    }
}

/**
 * 更新文档变化图表
 */
function updateDocChangesChart(data) {
    const ctx = document.getElementById('docChangesChart');
    if (!ctx) return;
    
    if (docChangesChartInstance) {
        docChangesChartInstance.destroy();
    }
    
    docChangesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: '新增文档',
                    data: data.added,
                    backgroundColor: 'rgba(40, 167, 69, 0.6)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 1
                },
                {
                    label: '更新文档',
                    data: data.updated,
                    backgroundColor: 'rgba(23, 162, 184, 0.6)',
                    borderColor: 'rgba(23, 162, 184, 1)',
                    borderWidth: 1
                },
                {
                    label: '归档文档',
                    data: data.deleted,
                    backgroundColor: 'rgba(220, 53, 69, 0.6)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

/**
 * 更新文档变化明细列表
 */
let currentPage = 1;
const itemsPerPage = 10;
let allDocChanges = [];

function updateDocChangesList(details) {
    const container = document.getElementById('docChangesList');
    if (!container) return;
    
    allDocChanges = details;
    currentPage = 1;
    
    if (!details.length) {
        container.innerHTML = '<p class="empty-tip">暂无变化记录</p>';
        return;
    }
    
    renderDocChangesPage();
}

function renderDocChangesPage() {
    const container = document.getElementById('docChangesList');
    if (!container) return;
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedDetails = allDocChanges.slice(start, end);
    
    const html = paginatedDetails.map(item => `
        <div class="doc-change-item" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 10px; border-bottom: 1px solid #eee; min-height: 80px;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; margin-bottom: 4px; word-break: break-word;">${item.doc_name}</div>
                ${item.filename ? `<div style="font-size: 11px; color: #888; margin-bottom: 4px; word-break: break-all;">${item.filename}</div>` : ''}
                <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${item.project_name} - ${item.cycle}</div>
                <div style="font-size: 11px; color: #999;">${item.time}</div>
            </div>
            <div style="display: flex; gap: 8px; flex-shrink: 0; margin-left: 10px;">
                <span class="doc-change-type" style="padding: 2px 8px; border-radius: 12px; font-size: 12px; background-color: ${getChangeTypeColor(item.type)}; color: white; align-self: center;">
                    ${item.type === 'added' ? '新增' : item.type === 'updated' ? '更新' : item.type === 'archived' ? '归档' : '删除'}
                </span>
                <button class="btn btn-sm btn-primary" onclick="previewDocument('${item.doc_id}')" style="padding: 4px 8px; font-size: 12px; align-self: center;">预览</button>
                <button class="btn btn-sm btn-secondary" onclick="jumpToDocument('${item.project_id}', '${item.cycle}', '${item.doc_name}')" style="padding: 4px 8px; font-size: 12px; align-self: center;">管理</button>
            </div>
        </div>
    `).join('');
    
    const totalPages = Math.ceil(allDocChanges.length / itemsPerPage);
    const paginationHtml = totalPages > 1 ? `
        <div class="pagination" style="margin-top: 15px; display: flex; justify-content: center; gap: 5px;">
            <button ${currentPage === 1 ? 'disabled' : ''} onclick="changeDocChangesPage(${currentPage - 1})" class="btn btn-sm btn-secondary" style="padding: 4px 10px;">上一页</button>
            ${Array.from({ length: totalPages }, (_, i) => i + 1).map(page => `
                <button onclick="changeDocChangesPage(${page})" class="btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-secondary'}" style="padding: 4px 10px; min-width: 30px;">${page}</button>
            `).join('')}
            <button ${currentPage === totalPages ? 'disabled' : ''} onclick="changeDocChangesPage(${currentPage + 1})" class="btn btn-sm btn-secondary" style="padding: 4px 10px;">下一页</button>
        </div>
    ` : '';
    
    container.innerHTML = html + paginationHtml;
}

function changeDocChangesPage(page) {
    currentPage = page;
    renderDocChangesPage();
}

/**
 * 获取变化类型的颜色
 */
function getChangeTypeColor(type) {
    switch (type) {
        case 'added': return '#28a745';
        case 'updated': return '#17a2b8';
        case 'archived': return '#dc3545';
        case 'deleted': return '#dc3545';
        default: return '#6c757d';
    }
}

/**
 * 跳转到文档管理界面
 */
function jumpToDocument(projectId, cycle, docName) {
    // 加载项目
    selectProject(projectId).then(() => {
        // 切换到指定周期
        appState.currentCycle = cycle;
        // 这里可以添加更多逻辑来定位到具体文档
        showNotification(`已跳转到项目: ${projectId}, 周期: ${cycle}`, 'success');
    }).catch(error => {
        console.error('跳转失败:', error);
        showNotification('跳转失败: ' + error.message, 'error');
    });
}

// 确保在页面加载后初始化文档变化统计
document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，确保DOM已完全加载
    setTimeout(() => {
        if (document.querySelector('.doc-change-tab')) {
            initDocChangesStats();
        }
    }, 1000);
});
