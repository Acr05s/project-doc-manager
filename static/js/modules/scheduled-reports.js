import { appState } from './app-state.js';
import { showLoading, showNotification } from './ui.js';

let _modalProjects = [];
let _recipientOptions = [];
let _taskList = [];
let _currentProjectId = '';
let _editingTaskId = '';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

function updateSelectedProjectCount() {
    const countEl = document.getElementById('scheduledSelectedProjectCount');
    if (!countEl) return;
    const checked = document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]:checked');
    countEl.textContent = String(checked.length);
}

function getSelectedProjectIds() {
    const checked = document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]:checked');
    return Array.from(checked).map(x => x.dataset.projectId).filter(Boolean);
}

function getConfigProjectId() {
    const select = document.getElementById('scheduledConfigProjectId');
    const selectedIds = getSelectedProjectIds();
    if (select && selectedIds.includes(select.value)) {
        return select.value;
    }
    return selectedIds[0] || '';
}

function syncConfigProjectSelect() {
    const select = document.getElementById('scheduledConfigProjectId');
    if (!select) return;

    const selectedIds = getSelectedProjectIds();
    const previous = select.value;
    const selectedSet = new Set(selectedIds);
    select.innerHTML = '';

    if (selectedIds.length === 0) {
        select.innerHTML = '<option value="">-- 请先从上方选择项目 --</option>';
        _currentProjectId = '';
        return;
    }

    selectedIds.forEach((projectId) => {
        const project = _modalProjects.find(item => String(item.id) === String(projectId));
        const opt = document.createElement('option');
        opt.value = projectId;
        opt.textContent = project ? `${project.name || projectId} (${projectId})` : projectId;
        select.appendChild(opt);
    });

    const nextValue = selectedSet.has(previous) ? previous : selectedIds[0];
    select.value = nextValue;
    _currentProjectId = nextValue;
}

function renderProjectList(projects, preferredProjectId) {
    const container = document.getElementById('scheduledProjectList');
    if (!container) return;
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
            checkbox.checked = projectId === fallbackProjectId || (!fallbackProjectId && index === 0);
            checkbox.addEventListener('change', async () => {
                updateSelectedProjectCount();
                syncConfigProjectSelect();
                const configProjectId = getConfigProjectId();
                if (configProjectId) {
                    await loadTasksForProject(configProjectId, '');
                } else {
                    clearEditorToNewTask();
                    renderTaskList([]);
                    renderRecipientUserList([], []);
                }
            });
        }

        container.appendChild(row);
    });

    updateSelectedProjectCount();
    syncConfigProjectSelect();
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

function getTaskLabel(task) {
    const f = String(task.frequency || 'weekly');
    const fLabel = f === 'daily' ? '日报' : (f === 'monthly' ? '月报' : '周报');
    const status = task.enabled ? '启用' : '停用';
    return `${fLabel} | ${task.send_time || '09:00'} | ${status}`;
}

function renderTaskList(tasks) {
    const container = document.getElementById('scheduledTaskList');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(tasks) || tasks.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:#777;">当前项目暂无任务，点击“新建任务”开始配置。</div>';
        return;
    }

    tasks.forEach((task) => {
        const taskId = String(task.task_id || '');
        const activeStyle = taskId === _editingTaskId ? 'border:1px solid #7aa7ea; background:#eef6ff;' : 'border:1px solid #e3edf9; background:#fff;';
        const row = document.createElement('div');
        row.style.cssText = `${activeStyle} border-radius:8px; padding:8px; display:flex; justify-content:space-between; gap:8px; align-items:flex-start;`;

        const taskName = escapeHtml(task.task_name || '未命名任务');
        const label = escapeHtml(getTaskLabel(task));
        const toggleText = task.enabled ? '停用' : '启用';

        row.innerHTML = `
            <div style="min-width:0; display:flex; flex-direction:column; gap:3px;">
                <strong style="font-size:13px; color:#223; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${taskName}</strong>
                <span style="font-size:11px; color:#607389;">${label}</span>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                <button type="button" class="btn btn-secondary btn-sm" data-task-action="edit" data-task-id="${taskId}">编辑</button>
                <button type="button" class="btn btn-info btn-sm" data-task-action="toggle" data-task-id="${taskId}">${toggleText}</button>
                <button type="button" class="btn btn-warning btn-sm" data-task-action="run" data-task-id="${taskId}">执行</button>
                <button type="button" class="btn btn-danger btn-sm" data-task-action="delete" data-task-id="${taskId}">删除</button>
            </div>
        `;
        container.appendChild(row);
    });

    container.querySelectorAll('button[data-task-action]').forEach((btn) => {
        btn.onclick = async () => {
            const action = btn.dataset.taskAction;
            const taskId = btn.dataset.taskId;
            if (!taskId) return;
            if (action === 'edit') {
                const task = _taskList.find(x => String(x.task_id) === String(taskId));
                if (task) {
                    fillEditorByTask(task);
                    renderTaskList(_taskList);
                }
                return;
            }
            if (action === 'toggle') {
                await toggleTask(taskId);
                return;
            }
            if (action === 'run') {
                await runTaskNow(taskId);
                return;
            }
            if (action === 'delete') {
                await deleteTask(taskId);
            }
        };
    });
}

function fillEditorByTask(task) {
    _editingTaskId = String(task.task_id || '');
    const editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = _editingTaskId;

    const projectIdInput = document.getElementById('scheduledReportProjectId');
    if (projectIdInput) projectIdInput.value = _currentProjectId;

    const taskName = document.getElementById('scheduledTaskName');
    if (taskName) taskName.value = task.task_name || '';

    const enabled = document.getElementById('scheduledReportEnabled');
    if (enabled) enabled.checked = !!task.enabled;

    const sendTime = document.getElementById('scheduledSendTime');
    if (sendTime) sendTime.value = task.send_time || '09:00';

    const weekday = document.getElementById('scheduledWeekday');
    if (weekday) weekday.value = String(task.weekday || 1);

    const dayOfMonth = document.getElementById('scheduledDayOfMonth');
    if (dayOfMonth) dayOfMonth.value = String(task.day_of_month || 1);

    const includePdf = document.getElementById('scheduledIncludePdf');
    if (includePdf) includePdf.checked = task.include_pdf !== false;

    const popupEnabled = document.getElementById('scheduledLoginPopupEnabled');
    if (popupEnabled) popupEnabled.checked = task.login_popup_enabled !== false;

    const ext = document.getElementById('scheduledExternalEmails');
    if (ext) ext.value = Array.isArray(task.external_emails) ? task.external_emails.join(', ') : '';

    const freq = String(task.frequency || 'weekly');
    const radio = document.querySelector(`input[name="scheduledFrequency"][value="${freq}"]`);
    if (radio) radio.checked = true;
    toggleFrequencyFields();

    renderRecipientUserList(_recipientOptions, task.recipient_user_ids || []);
}

function clearEditorToNewTask() {
    _editingTaskId = '';
    const editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = '';

    const projectIdInput = document.getElementById('scheduledReportProjectId');
    if (projectIdInput) projectIdInput.value = _currentProjectId || '';

    const taskName = document.getElementById('scheduledTaskName');
    if (taskName) taskName.value = '';

    const enabled = document.getElementById('scheduledReportEnabled');
    if (enabled) enabled.checked = true;

    const sendTime = document.getElementById('scheduledSendTime');
    if (sendTime) sendTime.value = '09:00';

    const weekday = document.getElementById('scheduledWeekday');
    if (weekday) weekday.value = '1';

    const dayOfMonth = document.getElementById('scheduledDayOfMonth');
    if (dayOfMonth) dayOfMonth.value = '1';

    const includePdf = document.getElementById('scheduledIncludePdf');
    if (includePdf) includePdf.checked = true;

    const popupEnabled = document.getElementById('scheduledLoginPopupEnabled');
    if (popupEnabled) popupEnabled.checked = true;

    const ext = document.getElementById('scheduledExternalEmails');
    if (ext) ext.value = '';

    const weekly = document.querySelector('input[name="scheduledFrequency"][value="weekly"]');
    if (weekly) weekly.checked = true;
    toggleFrequencyFields();

    renderRecipientUserList(_recipientOptions, []);
}

async function safeParseJson(resp) {
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`服务器返回非JSON（HTTP ${resp.status}）`);
    }
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
}

async function loadTasksForProject(projectId, preferredTaskId = '') {
    _currentProjectId = projectId;
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report-schedules`);
    const result = await safeParseJson(resp);
    if (result.status !== 'success') {
        throw new Error(result.message || '加载任务失败');
    }

    _taskList = Array.isArray(result.tasks) ? result.tasks : [];
    _recipientOptions = Array.isArray(result.recipient_options) ? result.recipient_options : [];

    renderTaskList(_taskList);

    if (_taskList.length === 0) {
        clearEditorToNewTask();
        return;
    }

    const task = _taskList.find(x => String(x.task_id) === String(preferredTaskId)) || _taskList[0];
    fillEditorByTask(task);
    renderTaskList(_taskList);
}

function buildPayloadFromForm() {
    return {
        task_name: (document.getElementById('scheduledTaskName')?.value || '').trim() || '定时报告任务',
        enabled: !!document.getElementById('scheduledReportEnabled')?.checked,
        frequency: getFrequencyValue(),
        send_time: document.getElementById('scheduledSendTime')?.value || '09:00',
        weekday: Number(document.getElementById('scheduledWeekday')?.value || 1),
        day_of_month: Number(document.getElementById('scheduledDayOfMonth')?.value || 1),
        include_pdf: !!document.getElementById('scheduledIncludePdf')?.checked,
        in_app_message_enabled: true,
        login_popup_enabled: !!document.getElementById('scheduledLoginPopupEnabled')?.checked,
        recipient_user_ids: collectSelectedRecipientUserIds(),
        external_emails: (document.getElementById('scheduledExternalEmails')?.value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
    };
}

async function runTaskNow(taskId) {
    if (!_currentProjectId || !taskId) {
        showNotification('请先选择项目和任务', 'error');
        return;
    }
    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${encodeURIComponent(_currentProjectId)}/report-schedules/${encodeURIComponent(taskId)}/run`, { method: 'POST' });
        const result = await safeParseJson(resp);
        if (result.status === 'success') {
            showNotification(result.message || '执行成功', 'success');
        } else {
            showNotification(result.message || '执行失败', 'error');
        }
    } catch (e) {
        showNotification(e.message || '执行失败', 'error');
    } finally {
        showLoading(false);
    }
}

async function toggleTask(taskId) {
    const task = _taskList.find(x => String(x.task_id) === String(taskId));
    if (!task) {
        showNotification('任务不存在', 'error');
        return;
    }
    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${encodeURIComponent(_currentProjectId)}/report-schedules/${encodeURIComponent(taskId)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !task.enabled })
        });
        const result = await safeParseJson(resp);
        if (result.status !== 'success') {
            showNotification(result.message || '更新状态失败', 'error');
            return;
        }
        await loadTasksForProject(_currentProjectId, taskId);
        showNotification(task.enabled ? '任务已停用' : '任务已启用', 'success');
    } catch (e) {
        showNotification(e.message || '更新状态失败', 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteTask(taskId) {
    if (!_currentProjectId || !taskId) return;
    if (!window.confirm('确认删除该定时任务吗？')) return;

    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${encodeURIComponent(_currentProjectId)}/report-schedules/${encodeURIComponent(taskId)}`, {
            method: 'DELETE'
        });
        const result = await safeParseJson(resp);
        if (result.status !== 'success') {
            showNotification(result.message || '删除失败', 'error');
            return;
        }
        await loadTasksForProject(_currentProjectId, '');
        showNotification('任务已删除', 'success');
    } catch (e) {
        showNotification(e.message || '删除失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function openScheduledReportModal() {
    const projectId = appState.currentProjectId;

    try {
        showLoading(true);
        _taskList = [];
        _recipientOptions = [];
        _editingTaskId = '';

        await loadAccessibleProjects(projectId);

        const configProjectSelect = document.getElementById('scheduledConfigProjectId');
        if (configProjectSelect) {
            configProjectSelect.onchange = async () => {
                const configProjectId = getConfigProjectId();
                if (configProjectId) {
                    await loadTasksForProject(configProjectId, '');
                }
            };
        }

        const selectedProjectId = getConfigProjectId();
        if (selectedProjectId) {
            await loadTasksForProject(selectedProjectId, '');
        } else {
            clearEditorToNewTask();
            renderTaskList([]);
            renderRecipientUserList([], []);
        }

        const selectAllBtn = document.getElementById('scheduledProjectSelectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.onclick = async () => {
                document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]').forEach(cb => {
                    cb.checked = true;
                });
                updateSelectedProjectCount();
                syncConfigProjectSelect();
                const projectIdToLoad = getConfigProjectId();
                if (projectIdToLoad) {
                    await loadTasksForProject(projectIdToLoad, '');
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
                _taskList = [];
                _recipientOptions = [];
                clearEditorToNewTask();
                renderTaskList([]);
                renderRecipientUserList([], []);
            };
        }

        const newTaskBtn = document.getElementById('scheduledTaskNewBtn');
        if (newTaskBtn) {
            newTaskBtn.onclick = () => {
                clearEditorToNewTask();
                renderTaskList(_taskList);
            };
        }

        const modal = document.getElementById('scheduledReportModal');
        if (modal) {
            modal.classList.add('show');
            modal.style.display = 'flex';
        }
    } catch (e) {
        console.error('加载定时报告任务失败:', e);
        showNotification('加载定时报告任务失败', 'error');
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

    const payload = buildPayloadFromForm();
    const editingTaskId = document.getElementById('scheduledEditingTaskId')?.value || _editingTaskId;

    try {
        showLoading(true);
        const isEdit = !!editingTaskId;
        const url = isEdit
            ? `/api/projects/${encodeURIComponent(projectId)}/report-schedules/${encodeURIComponent(editingTaskId)}`
            : `/api/projects/${encodeURIComponent(projectId)}/report-schedules`;
        const method = isEdit ? 'PATCH' : 'POST';

        const resp = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await safeParseJson(resp);

        if (result.status !== 'success') {
            showNotification(result.message || '保存失败', 'error');
            return;
        }

        const savedTaskId = result.data?.task_id || editingTaskId || '';
        await loadTasksForProject(projectId, savedTaskId);
        showNotification(isEdit ? '任务已更新' : '任务已创建', 'success');
    } catch (e) {
        console.error('保存定时任务失败:', e);
        showNotification(e.message || '保存失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function runScheduledReportNow() {
    const projectId = getConfigProjectId();
    const taskId = document.getElementById('scheduledEditingTaskId')?.value || _editingTaskId;
    if (!projectId || !taskId) {
        showNotification('请先在任务列表中选择一个任务', 'warning');
        return;
    }
    await runTaskNow(taskId);
}

// 兼容旧入口：当前改为按任务管理，不再做跨项目批量覆盖。
export async function applyScheduledReportConfigToSelected() {
    showNotification('已升级为“任务管理模式”，请直接保存当前任务。', 'info');
}

if (typeof document !== 'undefined') {
    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target && target.name === 'scheduledFrequency') {
            toggleFrequencyFields();
        }
    });
}
