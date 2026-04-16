import { appState } from './app-state.js';
import { showLoading, showNotification } from './ui.js';

let _modalProjects = [];

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
            checkbox.addEventListener('change', updateSelectedProjectCount);
        }
        container.appendChild(row);
    });
    updateSelectedProjectCount();
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
    document.getElementById('scheduledReportProjectId').value = projectId;
    document.getElementById('scheduledReportEnabled').checked = !!data.enabled;
    document.getElementById('scheduledSendTime').value = data.send_time || '09:00';
    document.getElementById('scheduledWeekday').value = String(data.weekday || 1);
    document.getElementById('scheduledDayOfMonth').value = String(data.day_of_month || 1);
    document.getElementById('scheduledIncludePdf').checked = data.include_pdf !== false;
    document.getElementById('scheduledLoginPopupEnabled').checked = data.login_popup_enabled !== false;
    document.getElementById('scheduledExternalEmails').value = (data.external_emails || []).join(', ');

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
        await loadAccessibleProjects(projectId);

        const selectedIds = getSelectedProjectIds();
        if (selectedIds.length > 0) {
            await loadScheduleForProject(selectedIds[0]);
        } else {
            document.getElementById('scheduledReportProjectId').value = '';
            document.getElementById('scheduledReportEnabled').checked = false;
            document.getElementById('scheduledSendTime').value = '09:00';
            document.getElementById('scheduledWeekday').value = '1';
            document.getElementById('scheduledDayOfMonth').value = '1';
            document.getElementById('scheduledIncludePdf').checked = true;
            document.getElementById('scheduledLoginPopupEnabled').checked = true;
            document.getElementById('scheduledExternalEmails').value = '';
            const weekly = document.querySelector('input[name="scheduledFrequency"][value="weekly"]');
            if (weekly) {
                weekly.checked = true;
            }
            toggleFrequencyFields();
        }

        const selectAllBtn = document.getElementById('scheduledProjectSelectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]').forEach(cb => {
                    cb.checked = true;
                });
                updateSelectedProjectCount();
            };
        }

        const clearBtn = document.getElementById('scheduledProjectClearBtn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]').forEach(cb => {
                    cb.checked = false;
                });
                updateSelectedProjectCount();
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
    const selectedProjectIds = getSelectedProjectIds();
    if (selectedProjectIds.length === 0) {
        showNotification('请至少选择一个项目', 'error');
        return;
    }

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
            showNotification(`已保存 ${results.length} 个项目的定时报告配置`, 'success');
            closeScheduledReportModal();
        } else {
            const first = failed[0];
            showNotification(`部分项目保存失败（${failed.length}/${results.length}）：${first.projectId} - ${first.result.message || '未知错误'}`, 'error');
        }
    } catch (e) {
        console.error('保存定时报告失败:', e);
        showNotification(e.message || '保存失败', 'error');
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
        });

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
