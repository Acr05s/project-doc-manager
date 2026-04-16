import { appState } from './app-state.js';
import { showLoading, showNotification } from './ui.js';

let _modalProjects = [];
let _recipientOptions = [];
let _taskList = [];
let _currentProjectId = '';
let _currentProjectMeta = { party_b: '', project_name: '' };
let _editingTaskId = '';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function todayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getFrequencyValue() {
    const selected = document.querySelector('input[name="scheduledFrequency"]:checked');
    return selected ? selected.value : 'weekly';
}

function getTaskTypeValue() {
    const selected = document.querySelector('input[name="scheduledTaskType"]:checked');
    return selected ? selected.value : 'periodic';
}

function taskTypeLabel(taskType) {
    return taskType === 'one_time' ? '一次性' : '周期性';
}

function frequencyLabel(frequency) {
    if (frequency === 'daily') return '日报';
    if (frequency === 'monthly') return '月报';
    return '周报';
}

function toggleEditorFields() {
    const taskType = getTaskTypeValue();
    const frequency = getFrequencyValue();

    const weekWrap = document.getElementById('scheduledWeekdayWrap');
    const monthWrap = document.getElementById('scheduledMonthdayWrap');
    const runDateWrap = document.getElementById('scheduledRunDateWrap');

    if (runDateWrap) {
        runDateWrap.style.display = taskType === 'one_time' ? 'block' : 'none';
    }
    if (weekWrap) {
        weekWrap.style.display = taskType === 'periodic' && frequency === 'weekly' ? 'block' : 'none';
    }
    if (monthWrap) {
        monthWrap.style.display = taskType === 'periodic' && frequency === 'monthly' ? 'block' : 'none';
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

        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; border:1px solid #e4ebf5; border-radius:8px; background:#fff; padding:8px; cursor:pointer;';
        row.innerHTML = `
            <input type="checkbox" data-project-id="${escapeHtml(projectId)}" style="margin-top:2px;">
            <span style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                <strong style="font-size:13px; color:#224; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(projectName)}</strong>
                <span style="font-size:11px; color:#789;">ID: ${escapeHtml(projectId)}</span>
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
                    _taskList = [];
                    renderTaskList(_taskList);
                }
            });
        }

        container.appendChild(row);
    });

    updateSelectedProjectCount();
    syncConfigProjectSelect();
}

function selectedTaskIds() {
    const checked = document.querySelectorAll('#scheduledTaskList input[type="checkbox"][data-task-select="1"]:checked');
    return Array.from(checked).map(x => String(x.dataset.taskId || '')).filter(Boolean);
}

function recipientGroups(task) {
    const selectedSet = new Set((task.recipient_user_ids || []).map(x => Number(x)));
    const partyB = String(_currentProjectMeta.party_b || '').trim();

    const contractor = [];
    const pmo = [];

    _recipientOptions.forEach((u) => {
        const uid = Number(u.id || 0);
        if (!uid || !selectedSet.has(uid)) return;
        const name = String(u.display_name || u.username || uid);
        const role = String(u.role || '').toLowerCase();
        const org = String(u.organization || '').trim();
        if (role === 'pmo' || role === 'pmo_leader') {
            pmo.push(name);
            return;
        }
        if (partyB && org === partyB) {
            contractor.push(name);
            return;
        }
        contractor.push(name);
    });

    const external = (task.external_emails || []).map(x => String(x).trim()).filter(Boolean);
    return {
        contractor: contractor.join('、') || '-',
        pmo: pmo.join('、') || '-',
        external: external.join(', ') || '-'
    };
}

function renderTaskList(tasks) {
    const container = document.getElementById('scheduledTaskList');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(tasks) || tasks.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:#777;">当前项目暂无任务，点击“新建任务”开始配置。</div>';
        return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:12px;';
    table.innerHTML = `
        <thead>
            <tr style="background:#f5f8fc;">
                <th style="border:1px solid #e2e8f0; padding:6px;"><input type="checkbox" id="scheduledTaskSelectAll"></th>
                <th style="border:1px solid #e2e8f0; padding:6px;">任务名称</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">任务类型</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">频率</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">执行次数</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">承建单位</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">承建单位收件人</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">PMO组收件人</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">外部收件人</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">状态</th>
                <th style="border:1px solid #e2e8f0; padding:6px;">操作</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    tasks.forEach((task) => {
        const groups = recipientGroups(task);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="border:1px solid #e2e8f0; padding:6px; text-align:center;"><input type="checkbox" data-task-select="1" data-task-id="${escapeHtml(task.task_id)}"></td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(task.task_name || '未命名任务')}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${taskTypeLabel(task.task_type)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${task.task_type === 'one_time' ? `一次性(${escapeHtml(task.run_date || '-')})` : `${frequencyLabel(task.frequency)} ${escapeHtml(task.send_time || '')}`}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; text-align:center;">${Number(task.run_count || 0)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(_currentProjectMeta.party_b || '-')}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(groups.contractor)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(groups.pmo)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(groups.external)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${task.enabled ? '启用' : '停用'}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">
                <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-task-id="${escapeHtml(task.task_id)}">编辑</button>
                <button type="button" class="btn btn-info btn-sm" data-action="toggle" data-task-id="${escapeHtml(task.task_id)}">${task.enabled ? '停用' : '启用'}</button>
                <button type="button" class="btn btn-warning btn-sm" data-action="run" data-task-id="${escapeHtml(task.task_id)}">执行</button>
                <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-task-id="${escapeHtml(task.task_id)}">删除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    container.appendChild(table);

    const selectAll = document.getElementById('scheduledTaskSelectAll');
    if (selectAll) {
        selectAll.onchange = () => {
            const checked = !!selectAll.checked;
            container.querySelectorAll('input[data-task-select="1"]').forEach((cb) => {
                cb.checked = checked;
            });
        };
    }

    container.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.onclick = async () => {
            const action = btn.dataset.action;
            const taskId = btn.dataset.taskId;
            if (!taskId) return;
            if (action === 'edit') {
                openScheduledTaskEditorModal(taskId);
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
        const checked = selectedSet.has(uid) ? 'checked' : '';
        row.innerHTML = `
            <input type="checkbox" data-recipient-user-id="${uid}" ${checked} style="margin-top:2px;">
            <span style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                <strong style="font-size:13px; color:#223;">${escapeHtml(user.display_name || user.username || `用户${uid}`)}</strong>
                <span style="font-size:11px; color:#607389;">${escapeHtml(user.role || '-')} | ${escapeHtml(user.organization || '-')}</span>
                <span style="font-size:11px; color:#607389;">${escapeHtml(user.email || '-')}</span>
            </span>
        `;
        container.appendChild(row);
    });
}

function collectSelectedRecipientUserIds() {
    const list = document.querySelectorAll('#scheduledRecipientUserList input[type="checkbox"][data-recipient-user-id]:checked');
    return Array.from(list).map((item) => Number(item.dataset.recipientUserId || 0)).filter((item) => item > 0);
}

function fillEditorByTask(task) {
    _editingTaskId = String(task.task_id || '');
    const editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = _editingTaskId;

    const projectIdInput = document.getElementById('scheduledEditorProjectId');
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

    const runDate = document.getElementById('scheduledRunDate');
    if (runDate) runDate.value = task.run_date || '';

    const includePdf = document.getElementById('scheduledIncludePdf');
    if (includePdf) includePdf.checked = task.include_pdf !== false;

    const popupEnabled = document.getElementById('scheduledLoginPopupEnabled');
    if (popupEnabled) popupEnabled.checked = task.login_popup_enabled !== false;

    const ext = document.getElementById('scheduledExternalEmails');
    if (ext) ext.value = Array.isArray(task.external_emails) ? task.external_emails.join(', ') : '';

    const typeRadio = document.querySelector(`input[name="scheduledTaskType"][value="${task.task_type || 'periodic'}"]`);
    if (typeRadio) typeRadio.checked = true;

    const freqRadio = document.querySelector(`input[name="scheduledFrequency"][value="${task.frequency || 'weekly'}"]`);
    if (freqRadio) freqRadio.checked = true;

    renderRecipientUserList(_recipientOptions, task.recipient_user_ids || []);
    toggleEditorFields();
}

function clearEditorToNewTask() {
    _editingTaskId = '';
    const editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = '';

    const projectIdInput = document.getElementById('scheduledEditorProjectId');
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

    const runDate = document.getElementById('scheduledRunDate');
    if (runDate) runDate.value = todayDateString();

    const includePdf = document.getElementById('scheduledIncludePdf');
    if (includePdf) includePdf.checked = true;

    const popupEnabled = document.getElementById('scheduledLoginPopupEnabled');
    if (popupEnabled) popupEnabled.checked = true;

    const ext = document.getElementById('scheduledExternalEmails');
    if (ext) ext.value = '';

    const periodic = document.querySelector('input[name="scheduledTaskType"][value="periodic"]');
    if (periodic) periodic.checked = true;

    const weekly = document.querySelector('input[name="scheduledFrequency"][value="weekly"]');
    if (weekly) weekly.checked = true;

    renderRecipientUserList(_recipientOptions, []);
    toggleEditorFields();
}

async function safeParseJson(resp) {
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`服务器返回非JSON（HTTP ${resp.status})`);
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
    _currentProjectMeta = result.project_meta || { party_b: '', project_name: '' };

    renderTaskList(_taskList);

    if (preferredTaskId) {
        const task = _taskList.find((x) => String(x.task_id) === String(preferredTaskId));
        if (task) fillEditorByTask(task);
    }
}

function buildPayloadFromEditorForm() {
    const taskType = getTaskTypeValue();
    return {
        task_name: (document.getElementById('scheduledTaskName')?.value || '').trim() || '定时报告任务',
        task_type: taskType,
        enabled: !!document.getElementById('scheduledReportEnabled')?.checked,
        frequency: getFrequencyValue(),
        send_time: document.getElementById('scheduledSendTime')?.value || '09:00',
        weekday: Number(document.getElementById('scheduledWeekday')?.value || 1),
        day_of_month: Number(document.getElementById('scheduledDayOfMonth')?.value || 1),
        run_date: taskType === 'one_time' ? (document.getElementById('scheduledRunDate')?.value || todayDateString()) : '',
        include_pdf: !!document.getElementById('scheduledIncludePdf')?.checked,
        in_app_message_enabled: true,
        login_popup_enabled: !!document.getElementById('scheduledLoginPopupEnabled')?.checked,
        recipient_user_ids: collectSelectedRecipientUserIds(),
        external_emails: (document.getElementById('scheduledExternalEmails')?.value || '').split(',').map((item) => item.trim()).filter(Boolean)
    };
}

export function openScheduledTaskEditorModal(taskId = '') {
    if (!_currentProjectId) {
        showNotification('请先在任务管理页选择一个项目', 'warning');
        return;
    }

    if (taskId) {
        const task = _taskList.find((x) => String(x.task_id) === String(taskId));
        if (!task) {
            showNotification('任务不存在', 'error');
            return;
        }
        fillEditorByTask(task);
    } else {
        clearEditorToNewTask();
    }

    const form = document.getElementById('scheduledTaskEditorForm');
    if (form) {
        form.onsubmit = saveScheduledReportConfig;
    }

    const modal = document.getElementById('scheduledTaskEditorModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
}

export function closeScheduledTaskEditorModal() {
    const modal = document.getElementById('scheduledTaskEditorModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
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
            await loadTasksForProject(_currentProjectId, taskId);
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
    const task = _taskList.find((x) => String(x.task_id) === String(taskId));
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
        const resp = await fetch(`/api/projects/${encodeURIComponent(_currentProjectId)}/report-schedules/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
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

async function batchEnableTasks() {
    const ids = selectedTaskIds();
    if (!ids.length) {
        showNotification('请先勾选任务', 'warning');
        return;
    }
    try {
        showLoading(true);
        await Promise.all(ids.map((taskId) => fetch(`/api/projects/${encodeURIComponent(_currentProjectId)}/report-schedules/${encodeURIComponent(taskId)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        })));
        await loadTasksForProject(_currentProjectId, '');
        showNotification(`已启用 ${ids.length} 个任务`, 'success');
    } catch (e) {
        showNotification(e.message || '批量启用失败', 'error');
    } finally {
        showLoading(false);
    }
}

async function batchDeleteTasks() {
    const ids = selectedTaskIds();
    if (!ids.length) {
        showNotification('请先勾选任务', 'warning');
        return;
    }
    if (!window.confirm(`确认删除选中的 ${ids.length} 个任务吗？`)) return;

    try {
        showLoading(true);
        await Promise.all(ids.map((taskId) => fetch(`/api/projects/${encodeURIComponent(_currentProjectId)}/report-schedules/${encodeURIComponent(taskId)}`, { method: 'DELETE' })));
        await loadTasksForProject(_currentProjectId, '');
        showNotification(`已删除 ${ids.length} 个任务`, 'success');
    } catch (e) {
        showNotification(e.message || '批量删除失败', 'error');
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
        _currentProjectMeta = { party_b: '', project_name: '' };

        await loadAccessibleProjects(projectId);

        const configProjectSelect = document.getElementById('scheduledConfigProjectId');
        if (configProjectSelect) {
            configProjectSelect.onchange = async () => {
                const configProjectId = getConfigProjectId();
                if (configProjectId) await loadTasksForProject(configProjectId, '');
            };
        }

        const selectedProjectId = getConfigProjectId();
        if (selectedProjectId) {
            await loadTasksForProject(selectedProjectId, '');
        } else {
            _taskList = [];
            renderTaskList(_taskList);
        }

        const selectAllBtn = document.getElementById('scheduledProjectSelectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.onclick = async () => {
                document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]').forEach((cb) => {
                    cb.checked = true;
                });
                updateSelectedProjectCount();
                syncConfigProjectSelect();
                const projectIdToLoad = getConfigProjectId();
                if (projectIdToLoad) await loadTasksForProject(projectIdToLoad, '');
            };
        }

        const clearBtn = document.getElementById('scheduledProjectClearBtn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                document.querySelectorAll('#scheduledProjectList input[type="checkbox"][data-project-id]').forEach((cb) => {
                    cb.checked = false;
                });
                updateSelectedProjectCount();
                syncConfigProjectSelect();
                _taskList = [];
                renderTaskList(_taskList);
            };
        }

        const newTaskBtn = document.getElementById('scheduledTaskNewBtn');
        if (newTaskBtn) {
            newTaskBtn.onclick = () => openScheduledTaskEditorModal('');
        }

        const taskSelectAllBtn = document.getElementById('scheduledTaskSelectAllBtn');
        if (taskSelectAllBtn) {
            taskSelectAllBtn.onclick = () => {
                const selectAll = document.getElementById('scheduledTaskSelectAll');
                if (selectAll) {
                    selectAll.checked = true;
                    selectAll.dispatchEvent(new Event('change'));
                }
            };
        }

        const batchEnableBtn = document.getElementById('scheduledTaskBatchEnableBtn');
        if (batchEnableBtn) {
            batchEnableBtn.onclick = batchEnableTasks;
        }

        const batchDeleteBtn = document.getElementById('scheduledTaskBatchDeleteBtn');
        if (batchDeleteBtn) {
            batchDeleteBtn.onclick = batchDeleteTasks;
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
    closeScheduledTaskEditorModal();
}

export async function saveScheduledReportConfig(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }

    const projectId = _currentProjectId || getConfigProjectId();
    if (!projectId) {
        showNotification('请先选择“当前配置项目”', 'error');
        return;
    }

    const payload = buildPayloadFromEditorForm();
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
        closeScheduledTaskEditorModal();
        showNotification(isEdit ? '任务已更新' : '任务已创建', 'success');
    } catch (e) {
        console.error('保存定时任务失败:', e);
        showNotification(e.message || '保存失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function runScheduledReportNow() {
    const taskId = document.getElementById('scheduledEditingTaskId')?.value || _editingTaskId;
    if (!taskId) {
        showNotification('请先在任务列表中选择一个任务', 'warning');
        return;
    }
    await runTaskNow(taskId);
}

// 兼容旧入口
export async function applyScheduledReportConfigToSelected() {
    showNotification('已升级为“任务列表管理模式”', 'info');
}

if (typeof document !== 'undefined') {
    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target && (target.name === 'scheduledFrequency' || target.name === 'scheduledTaskType')) {
            toggleEditorFields();
        }
    });

    window.openScheduledTaskEditorModal = openScheduledTaskEditorModal;
    window.closeScheduledTaskEditorModal = closeScheduledTaskEditorModal;
}
