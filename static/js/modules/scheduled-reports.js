import { appState } from './app-state.js';
import { showLoading, showNotification } from './ui.js';

let _modalProjects = [];
let _projectScheduleCache = {};

function getFrequencyValue() {
    const selected = document.querySelector('input[name="scheduledFrequency"]:checked');
    return selected ? selected.value : 'weekly';
}

function toggleFrequencyFields() {
    const frequency = getFrequencyValue();
    const weekWrap = document.getElementById('scheduledWeekdayWrap');
    const monthWrap = document.getElementById('scheduledMonthdayWrap');
    if (weekWrap) {
        weekWrap.style.display = frequency === 'weekly' ? 'block' : 'none';
    }
    if (monthWrap) {
        monthWrap.style.display = frequency === 'monthly' ? 'block' : 'none';
    }
}

function getSelectedProjectIds() {
    const list = document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]:checked');
    return Array.from(list).map(item => item.dataset.projectId).filter(Boolean);
}

function getConfigProjectId() {
    const configSelect = document.getElementById('scheduledConfigProjectId');
    const selectedProjectIds = getSelectedProjectIds();
    if (configSelect && selectedProjectIds.includes(configSelect.value)) {
        return configSelect.value;
    }
    return selectedProjectIds[0] || '';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updateSelectedProjectCount() {
    const el = document.getElementById('scheduledSelectedProjectCount');
    if (el) {
        el.textContent = String(getSelectedProjectIds().length);
    }
}

function syncConfigProjectSelect() {
    const select = document.getElementById('scheduledConfigProjectId');
    if (!select) return;
    const selectedProjectIds = getSelectedProjectIds();
    const previous = select.value;
    const selectedSet = new Set(selectedProjectIds);
    select.innerHTML = '';

    if (selectedProjectIds.length === 0) {
        select.innerHTML = '<option value="">-- 请先从上方选择项目 --</option>';
        renderRecipientUserList([], []);
        return;
    }

    selectedProjectIds.forEach((projectId) => {
        const project = _modalProjects.find(item => String(item.id) === String(projectId));
        const opt = document.createElement('option');
        opt.value = projectId;
        opt.textContent = project ? `${project.name || projectId} (${projectId})` : projectId;
        select.appendChild(opt);
    });

    const nextValue = selectedSet.has(previous) ? previous : selectedProjectIds[0];
    select.value = nextValue;
}

function renderRecipientUserList(recipientOptions, selectedIds) {
    const container = document.getElementById('scheduledRecipientUserList');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(recipientOptions) || recipientOptions.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:#777;">当前项目暂无可选收件人，请补充外部邮箱。</div>';
        return;
    }

    const selectedSet = new Set((selectedIds || []).map(x => Number(x)));
    recipientOptions.forEach((user) => {
        const uid = Number(user.id || 0);
        if (!uid) return;
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; border:1px solid #e3edf9; border-radius:6px; padding:7px; background:#fff;';
        const role = escapeHtml(user.role || '-');
        const name = escapeHtml(user.display_name || user.username || `用户${uid}`);
        const org = escapeHtml(user.organization || '-');
        const email = escapeHtml(user.email || '-');
        const source = escapeHtml(user.source || '项目相关');
        const checked = selectedSet.has(uid) ? 'checked' : '';
        row.innerHTML = `
            <input type="checkbox" data-recipient-user-id="${uid}" ${checked} style="margin-top:2px;">
            <span style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                <strong style="font-size:13px; color:#223;">${name}</strong>
                <span style="font-size:11px; color:#607389;">${role} | ${org}</span>
                <span style="font-size:11px; color:#607389;">${email}</span>
                <span style="font-size:11px; color:#8899aa;">来源：${source}</span>
            </span>
        `;
        container.appendChild(row);
    });
}

function collectSelectedRecipientUserIds() {
    const list = document.querySelectorAll('#scheduledRecipientUserList input[type="checkbox"][data-recipient-user-id]:checked');
    return Array.from(list)
        .map(item => Number(item.dataset.recipientUserId || 0))
        .filter(item => item > 0);
}

function renderProjectList(projects, preferredProjectId) {
    const container = document.getElementById('scheduledProjectList');
    if (!container) {
        return;
    }
    container.innerHTML = '';

    if (!Array.isArray(projects) || projects.length === 0) {
        container.innerHTML = '<div style="grid-column:1 / -1; color:#777; font-size:13px;">暂无可配置项目</div>';
        updateSelectedProjectCount();
        return;
    }

    const fallbackProjectId = preferredProjectId || appState.currentProjectId;
    projects.forEach((project, index) => {
        const projectId = String(project.id || '').trim();
        if (!projectId) return;
        const projectName = String(project.name || projectId);
        const escapedProjectId = escapeHtml(projectId);
        const escapedProjectName = escapeHtml(projectName);
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; border:1px solid #e4ebf5; border-radius:8px; background:#fff; padding:8px; cursor:pointer;';
        row.innerHTML = `
            <input type="checkbox" data-project-id="${escapedProjectId}" style="margin-top:2px;">
            <span style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                <strong style="font-size:13px; color:#224; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapedProjectName}</strong>
                <span style="font-size:11px; color:#789;">ID: ${escapedProjectId}</span>
            </span>
        `;
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox) {
            const shouldCheck = projectId === fallbackProjectId || (!fallbackProjectId && index === 0);
            checkbox.checked = !!shouldCheck;
            checkbox.addEventListener('change', async () => {
                updateSelectedProjectCount();
                syncConfigProjectSelect();
                const configProjectId = getConfigProjectId();
                if (configProjectId) {
                    await loadScheduleForProject(configProjectId);
                }
            });
        }
        container.appendChild(row);
    });
    updateSelectedProjectCount();
    syncConfigProjectSelect();
}

async function loadAccessibleProjects(preferredProjectId) {
    const resp = await fetch('/api/projects/accessible');
    if (!resp.ok) {
        throw new Error('加载项目列表失败');
    }
    const result = await resp.json();
    if (!Array.isArray(result)) {
        throw new Error(result.message || '项目列表数据格式错误');
    }
    _modalProjects = result;
    renderProjectList(_modalProjects, preferredProjectId);
    return _modalProjects;
}

async function safeParseJson(resp) {
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`服务器返回非JSON（HTTP ${resp.status}）`);
    }
}

async function loadScheduleForProject(projectId) {
    if (!projectId) {
        return;
    }
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report-schedule`);
    const result = await safeParseJson(resp);
    if (result.status !== 'success') {
        throw new Error(result.message || '加载定时报告配置失败');
    }

    const data = result.data || {};
    const recipientOptions = Array.isArray(result.recipient_options) ? result.recipient_options : [];
    _projectScheduleCache[projectId] = {
        data,
        recipient_options: recipientOptions
    };

    document.getElementById('scheduledReportProjectId').value = projectId;
    document.getElementById('scheduledReportEnabled').checked = !!data.enabled;
    document.getElementById('scheduledSendTime').value = data.send_time || '09:00';
    document.getElementById('scheduledWeekday').value = String(data.weekday || 1);
    document.getElementById('scheduledDayOfMonth').value = String(data.day_of_month || 1);
    document.getElementById('scheduledIncludePdf').checked = data.include_pdf !== false;
    document.getElementById('scheduledLoginPopupEnabled').checked = data.login_popup_enabled !== false;
    document.getElementById('scheduledExternalEmails').value = (data.external_emails || []).join(', ');
    renderRecipientUserList(recipientOptions, data.recipient_user_ids || []);

    const frequency = data.frequency || 'weekly';
    const radio = document.querySelector(`input[name="scheduledFrequency"][value="${frequency}"]`);
    if (radio) {
        radio.checked = true;
    }
    toggleFrequencyFields();
}

export async function openScheduledReportModal() {
    const projectId = appState.currentProjectId;

    try {
        showLoading(true);
        _projectScheduleCache = {};
        await loadAccessibleProjects(projectId);

        const configProjectSelect = document.getElementById('scheduledConfigProjectId');
        if (configProjectSelect) {
            configProjectSelect.onchange = async () => {
                const configProjectId = getConfigProjectId();
                if (configProjectId) {
                    await loadScheduleForProject(configProjectId);
                }
            };
        }

        const configProjectId = getConfigProjectId();
        if (configProjectId) {
            await loadScheduleForProject(configProjectId);
        } else {
            document.getElementById('scheduledReportProjectId').value = '';
            document.getElementById('scheduledReportEnabled').checked = false;
            document.getElementById('scheduledSendTime').value = '09:00';
            document.getElementById('scheduledWeekday').value = '1';
            document.getElementById('scheduledDayOfMonth').value = '1';
            document.getElementById('scheduledIncludePdf').checked = true;
            document.getElementById('scheduledLoginPopupEnabled').checked = true;
            document.getElementById('scheduledExternalEmails').value = '';
            renderRecipientUserList([], []);
            const weekly = document.querySelector('input[name="scheduledFrequency"][value="weekly"]');
            if (weekly) {
                weekly.checked = true;
            }
            toggleFrequencyFields();
        }

        const selectAllBtn = document.getElementById('scheduledProjectSelectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.onclick = async () => {
                document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]').forEach(cb => {
                    cb.checked = true;
                });
                updateSelectedProjectCount();
                syncConfigProjectSelect();
                const selectedConfigProjectId = getConfigProjectId();
                if (selectedConfigProjectId) {
                    await loadScheduleForProject(selectedConfigProjectId);
                }
            };
        }

        const clearBtn = document.getElementById('scheduledProjectClearBtn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]').forEach(cb => {
                    cb.checked = false;
                });
                updateSelectedProjectCount();
                syncConfigProjectSelect();
                document.getElementById('scheduledReportProjectId').value = '';
                renderRecipientUserList([], []);
            };
        }

        const modal = document.getElementById('scheduledReportModal');
        if (modal) {
            modal.classList.add('show');
            modal.style.display = 'flex';
        }
    } catch (e) {
        console.error('加载定时报告配置失败:', e);
        showNotification('加载定时报告配置失败', 'error');
    } finally {
        showLoading(false);
    }
}

export function closeScheduledReportModal() {
    const modal = document.getElementById('scheduledReportModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function saveScheduledReportConfig(e) {
    e.preventDefault();
    const projectId = getConfigProjectId();
    if (!projectId) {
        showNotification('请先选择“当前配置项目”', 'error');
        return;
    }

    const recipientUserIds = collectSelectedRecipientUserIds();
    const frequency = getFrequencyValue();
    const payload = {
        enabled: document.getElementById('scheduledReportEnabled').checked,
        frequency,
        send_time: document.getElementById('scheduledSendTime').value || '09:00',
        weekday: Number(document.getElementById('scheduledWeekday').value || 1),
        day_of_month: Number(document.getElementById('scheduledDayOfMonth').value || 1),
        include_pdf: document.getElementById('scheduledIncludePdf').checked,
        in_app_message_enabled: true,
        login_popup_enabled: document.getElementById('scheduledLoginPopupEnabled').checked,
        recipient_user_ids: recipientUserIds,
        external_emails: (document.getElementById('scheduledExternalEmails').value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
    };

    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report-schedule`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await safeParseJson(resp);
        if (result.status === 'success') {
            showNotification('当前项目定时报告配置已保存', 'success');
            closeScheduledReportModal();
        } else {
            showNotification(result.message || '保存失败', 'error');
        }
    } catch (e) {
        console.error('保存定时报告失败:', e);
        showNotification(e.message || '保存失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function applyScheduledReportConfigToSelected() {
    const selectedProjectIds = getSelectedProjectIds();
    if (selectedProjectIds.length === 0) {
        showNotification('请至少选择一个项目', 'error');
        return;
    }

    const payload = {
        enabled: document.getElementById('scheduledReportEnabled').checked,
        frequency: getFrequencyValue(),
        send_time: document.getElementById('scheduledSendTime').value || '09:00',
        weekday: Number(document.getElementById('scheduledWeekday').value || 1),
        day_of_month: Number(document.getElementById('scheduledDayOfMonth').value || 1),
        include_pdf: document.getElementById('scheduledIncludePdf').checked,
        in_app_message_enabled: true,
        login_popup_enabled: document.getElementById('scheduledLoginPopupEnabled').checked,
        recipient_user_ids: collectSelectedRecipientUserIds(),
        external_emails: (document.getElementById('scheduledExternalEmails').value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
    };

    try {
        showLoading(true);
        const results = await Promise.all(selectedProjectIds.map(async (projectId) => {
            const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report-schedule`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await safeParseJson(resp);
            return { projectId, result };
        }));

        const failed = results.filter(item => item.result.status !== 'success');
        if (failed.length === 0) {
            showNotification(`已批量应用到 ${results.length} 个项目`, 'success');
        } else {
            const first = failed[0];
            showNotification(`部分项目保存失败（${failed.length}/${results.length}）：${first.projectId} - ${first.result.message || '未知错误'}`, 'error');
        }
    } catch (e) {
        console.error('批量保存定时报告失败:', e);
        showNotification(e.message || '批量保存失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function runScheduledReportNow() {
    const selectedProjectIds = getSelectedProjectIds();
    if (selectedProjectIds.length === 0) {
        showNotification('请至少选择一个项目', 'error');
        return;
    }

    try {
        showLoading(true);
        const results = await Promise.all(selectedProjectIds.map(async (projectId) => {
            const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report-schedule/run`, { method: 'POST' });
            const result = await safeParseJson(resp);
            return { projectId, result };
        }));

        const successCount = results.filter(item => item.result.status === 'success').length;
        const failed = results.filter(item => item.result.status !== 'success');
        if (failed.length === 0) {
            showNotification(`发送成功：${successCount}/${results.length}`, 'success');
        } else {
            const first = failed[0];
            showNotification(`发送完成：${successCount}/${results.length}，失败示例 ${first.projectId}: ${first.result.message || '未知错误'}`, 'error');
        }
    } catch (e) {
        console.error('立即发送报告失败:', e);
        showNotification(e.message || '发送失败', 'error');
    } finally {
        showLoading(false);
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target && target.name === 'scheduledFrequency') {
            toggleFrequencyFields();
        }
    });
}
