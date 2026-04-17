import { appState } from './app-state.js';
import { showLoading, showNotification, showConfirmModal } from './ui.js';

let _modalProjects = [];
let _recipientOptions = [];
let _taskList = [];
let _allLoadedTasks = [];
let _currentProjectId = '';
let _currentProjectMeta = { party_b: '', project_name: '' };
let _editingTaskId = '';
let _pendingHighlightTaskId = '';

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

function populateProjectSelectOptions(select, projects, preferredProjectId, emptyText) {
    if (!select) return '';
    select.innerHTML = '';
    if (!Array.isArray(projects) || projects.length === 0) {
        select.innerHTML = `<option value="">${emptyText || '暂无可配置项目'}</option>`;
        return '';
    }
    projects.forEach((project) => {
        const projectId = String(project.id || '').trim();
        if (!projectId) return;
        const option = document.createElement('option');
        option.value = projectId;
        option.textContent = `${project.name || projectId} (${projectId})`;
        select.appendChild(option);
    });
    const preferred = String(preferredProjectId || '').trim();
    const matched = Array.from(select.options).some((opt) => opt.value === preferred);
    select.value = matched ? preferred : String(select.options[0]?.value || '');
    return String(select.value || '');
}

function populateTaskFilterOptions(tasks) {
    const orgFilter = document.getElementById('scheduledOrgFilter');
    const creatorFilter = document.getElementById('scheduledCreatorFilter');

    if (orgFilter) {
        const current = String(orgFilter.value || '');
        const orgs = Array.from(new Set((tasks || []).map((t) => String(t._party_b || '').trim()).filter(Boolean))).sort();
        orgFilter.innerHTML = '<option value="">全部承建单位</option>';
        orgs.forEach((org) => {
            const opt = document.createElement('option');
            opt.value = org;
            opt.textContent = org;
            orgFilter.appendChild(opt);
        });
        if (Array.from(orgFilter.options).some((o) => o.value === current)) {
            orgFilter.value = current;
        }
    }

    if (creatorFilter) {
        const current = String(creatorFilter.value || '');
        const creators = Array.from(new Set((tasks || []).map((t) => String(t._creator_name || '').trim()).filter(Boolean))).sort();
        creatorFilter.innerHTML = '<option value="">全部创建人</option>';
        creators.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            creatorFilter.appendChild(opt);
        });
        if (Array.from(creatorFilter.options).some((o) => o.value === current)) {
            creatorFilter.value = current;
        }
    }
}

function applyTaskFilters(tasks) {
    const orgValue = String(document.getElementById('scheduledOrgFilter')?.value || '').trim();
    const creatorValue = String(document.getElementById('scheduledCreatorFilter')?.value || '').trim();

    return (tasks || []).filter((task) => {
        if (orgValue && String(task._party_b || '').trim() !== orgValue) return false;
        if (creatorValue && String(task._creator_name || '').trim() !== creatorValue) return false;
        return true;
    });
}

function refreshTaskListByCurrentFilters() {
    const filtered = applyTaskFilters(_allLoadedTasks);
    _taskList = filtered;
    renderTaskList(filtered);
}

function highlightTaskRow(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return;
    const row = document.querySelector(`#scheduledTaskList tr[data-task-row-id="${id}"]`);
    if (!row) return;

    row.style.transition = 'background-color 240ms ease, box-shadow 240ms ease';
    row.style.backgroundColor = '#fff7d6';
    row.style.boxShadow = 'inset 0 0 0 2px #fbbf24';
    setTimeout(() => {
        row.style.backgroundColor = '';
        row.style.boxShadow = '';
    }, 3000);
}

function selectedTaskIds() {
    const checked = document.querySelectorAll('#scheduledTaskList input[type="checkbox"][data-task-select="1"]:checked');
    return Array.from(checked).map(x => String(x.dataset.taskId || '')).filter(Boolean);
}

function recipientGroups(task) {
    const selectedSet = new Set((task.recipient_user_ids || []).map(x => Number(x)));
    const partyB = String(task._party_b || _currentProjectMeta.party_b || '').trim();

    const contractor = [];
    const pmo = [];
    const taskRecipientOptions = Array.isArray(task._recipient_options) ? task._recipient_options : _recipientOptions;

    taskRecipientOptions.forEach((u) => {
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
        container.innerHTML = '<div style="font-size:12px; color:#777;">暂无任务，点击"新建任务"开始配置。</div>';
        return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:12px; table-layout:auto;';
    table.innerHTML = `
        <thead>
            <tr style="background:#f5f8fc;">
                <th style="border:1px solid #e2e8f0; padding:6px;"><input type="checkbox" id="scheduledTaskSelectAll"></th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">项目名称</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">任务名称</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">创建人</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">任务类型</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">频率</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">执行次数</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">承建单位</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">承建单位收件人</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">PMO组收件人</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">外部收件人</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">状态</th>
                <th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">操作</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    tasks.forEach((task) => {
        const groups = recipientGroups(task);
        const creatorName = task._creator_name || task.created_by_display_name || task.created_by_username || '-';
        const tr = document.createElement('tr');
        tr.dataset.taskRowId = String(task.task_id || '');
        const pid = escapeHtml(task.project_id || task._project_id || '');
        tr.innerHTML = `
            <td style="border:1px solid #e2e8f0; padding:6px; text-align:center;"><input type="checkbox" data-task-select="1" data-task-id="${escapeHtml(task.task_id)}"></td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">${escapeHtml(task._project_name || task.project_id || '-')}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">${escapeHtml(task.task_name || '未命名任务')}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">${escapeHtml(creatorName)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">${taskTypeLabel(task.task_type)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">${task.task_type === 'one_time' ? `一次性(${escapeHtml(task.run_date || '-')})` : `${frequencyLabel(task.frequency)} ${escapeHtml(task.send_time || '')}`}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; text-align:center;">${Number(task.run_count || 0)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">${escapeHtml(task._party_b || '-')}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(groups.contractor)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(groups.pmo)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px;">${escapeHtml(groups.external)}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">${task.enabled ? '启用' : '停用'}</td>
            <td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">
                <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-task-id="${escapeHtml(task.task_id)}" data-project-id="${pid}">编辑</button>
                <button type="button" class="btn btn-info btn-sm" data-action="toggle" data-task-id="${escapeHtml(task.task_id)}" data-project-id="${pid}">${task.enabled ? '停用' : '启用'}</button>
                <button type="button" class="btn btn-warning btn-sm" data-action="run" data-task-id="${escapeHtml(task.task_id)}" data-project-id="${pid}">执行</button>
                <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-task-id="${escapeHtml(task.task_id)}" data-project-id="${pid}">删除</button>
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
            const projectId = String(btn.dataset.projectId || '').trim();
            if (!taskId || !projectId) return;
            if (action === 'edit') {
                await openScheduledTaskEditorModal(taskId, projectId);
                return;
            }
            if (action === 'toggle') {
                await toggleTask(taskId, projectId);
                return;
            }
            if (action === 'run') {
                await runTaskNow(taskId, projectId);
                return;
            }
            if (action === 'delete') {
                await deleteTask(taskId, projectId);
            }
        };
    });

    if (_pendingHighlightTaskId) {
        const toHighlight = _pendingHighlightTaskId;
        _pendingHighlightTaskId = '';
        setTimeout(() => highlightTaskRow(toHighlight), 0);
    }
}

function renderRecipientUserList(recipientOptions, selectedIds) {
    const contractorContainer = document.getElementById('scheduledContractorUserList');
    const pmoContainer = document.getElementById('scheduledPmoUserList');
    const legacyContainer = document.getElementById('scheduledRecipientUserList');

    const empty = '<div style="font-size:12px; color:#777;">当前项目暂无可选收件人。</div>';

    if (!Array.isArray(recipientOptions) || recipientOptions.length === 0) {
        if (contractorContainer) contractorContainer.innerHTML = empty;
        if (pmoContainer) pmoContainer.innerHTML = empty;
        if (legacyContainer) legacyContainer.innerHTML = empty;
        return;
    }

    const selectedSet = new Set((selectedIds || []).map(x => Number(x)));

    const contractorUsers = [];
    const pmoUsers = [];
    recipientOptions.forEach((user) => {
        const role = String(user.role || '').toLowerCase();
        if (role === 'pmo' || role === 'pmo_leader') {
            pmoUsers.push(user);
        } else {
            contractorUsers.push(user);
        }
    });

    function buildUserRow(user) {
        const uid = Number(user.id || 0);
        if (!uid) return null;
        const row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; border:1px solid #e3edf9; border-radius:6px; padding:7px; background:#fff; cursor:pointer;';
        const checked = selectedSet.has(uid) ? 'checked' : '';
        row.innerHTML = `
            <input type="checkbox" data-recipient-user-id="${uid}" ${checked} style="margin-top:2px;">
            <span style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                <strong style="font-size:13px; color:#223;">${escapeHtml(user.display_name || user.username || `用户${uid}`)}</strong>
                <span style="font-size:11px; color:#607389;">${escapeHtml(user.role || '-')} | ${escapeHtml(user.organization || '-')}</span>
                <span style="font-size:11px; color:#607389;">${escapeHtml(user.email || '-')}</span>
            </span>
        `;
        return row;
    }

    function fillContainer(container, users) {
        if (!container) return;
        container.innerHTML = '';
        if (users.length === 0) {
            container.innerHTML = '<div style="font-size:12px; color:#aaa;">暂无</div>';
            return;
        }
        users.forEach((user) => {
            const row = buildUserRow(user);
            if (row) container.appendChild(row);
        });
    }

    fillContainer(contractorContainer, contractorUsers);
    fillContainer(pmoContainer, pmoUsers);

    if (legacyContainer) {
        legacyContainer.innerHTML = '';
        recipientOptions.forEach((user) => {
            const row = buildUserRow(user);
            if (row) legacyContainer.appendChild(row);
        });
    }
}

function collectSelectedRecipientUserIds() {
    const selectors = [
        '#scheduledContractorUserList input[type="checkbox"][data-recipient-user-id]:checked',
        '#scheduledPmoUserList input[type="checkbox"][data-recipient-user-id]:checked',
        '#scheduledRecipientUserList input[type="checkbox"][data-recipient-user-id]:checked'
    ];
    const ids = new Set();
    selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((item) => {
            const v = Number(item.dataset.recipientUserId || 0);
            if (v > 0) ids.add(v);
        });
    });
    return Array.from(ids);
}

window.toggleExternalEmailsInput = function () {
    const cb = document.getElementById('scheduledEnableExternalEmails');
    const wrapper = document.getElementById('scheduledExternalEmailsWrapper');
    if (!wrapper) return;
    wrapper.style.display = (cb && cb.checked) ? 'block' : 'none';
};

window.toggleValidUntilInput = function () {
    const cb = document.getElementById('scheduledEnableValidUntil');
    const input = document.getElementById('scheduledValidUntil');
    const hint = document.getElementById('scheduledValidUntilHint');
    const show = !!(cb && cb.checked);
    if (input) input.style.display = show ? 'inline-block' : 'none';
    if (hint) hint.style.display = show ? 'block' : 'none';
    if (show && input && !input.value) {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        input.value = d.toISOString().slice(0, 10);
    }
};

function fillEditorByTask(task) {
    _editingTaskId = String(task.task_id || '');
    const editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = _editingTaskId;

    const targetProjectId = String(task.project_id || task._project_id || _currentProjectId || '');
    _currentProjectId = targetProjectId;

    const projectIdInput = document.getElementById('scheduledEditorProjectId');
    if (projectIdInput) projectIdInput.value = targetProjectId;

    const editorProjectSelect = document.getElementById('scheduledEditorProjectSelect');
    if (editorProjectSelect) {
        populateProjectSelectOptions(editorProjectSelect, _modalProjects, targetProjectId, '-- 暂无可配置项目 --');
        editorProjectSelect.value = targetProjectId;
        editorProjectSelect.disabled = true;
    }

    const runAfterSaveWrap = document.getElementById('scheduledRunAfterSaveWrap');
    const runAfterSave = document.getElementById('scheduledRunAfterSaveOnce');
    if (runAfterSave) {
        runAfterSave.checked = false;
        runAfterSave.disabled = true;
        runAfterSave.title = '编辑任务不支持"保存后立即执行"，请使用列表中的"执行"按钮';
    }
    if (runAfterSaveWrap) runAfterSaveWrap.style.opacity = '0.55';

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
    const extVal = Array.isArray(task.external_emails) ? task.external_emails.join(', ') : '';
    if (ext) ext.value = extVal;
    const enableExtCb = document.getElementById('scheduledEnableExternalEmails');
    if (enableExtCb) {
        enableExtCb.checked = !!(extVal.trim());
        window.toggleExternalEmailsInput && window.toggleExternalEmailsInput();
    }

    const validUntilCb = document.getElementById('scheduledEnableValidUntil');
    const validUntilInput = document.getElementById('scheduledValidUntil');
    const validUntilVal = String(task.valid_until || '').trim().slice(0, 10);
    if (validUntilCb) validUntilCb.checked = !!(validUntilVal);
    if (validUntilInput) validUntilInput.value = validUntilVal;
    window.toggleValidUntilInput && window.toggleValidUntilInput();

    const typeRadio = document.querySelector(`input[name="scheduledTaskType"][value="${task.task_type || 'periodic'}"]`);
    if (typeRadio) typeRadio.checked = true;

    const freqRadio = document.querySelector(`input[name="scheduledFrequency"][value="${task.frequency || 'weekly'}"]`);
    if (freqRadio) freqRadio.checked = true;

    _recipientOptions = Array.isArray(task._recipient_options) ? task._recipient_options : _recipientOptions;
    renderRecipientUserList(_recipientOptions, task.recipient_user_ids || []);
    toggleEditorFields();
}

function clearEditorToNewTask() {
    _editingTaskId = '';
    const editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = '';

    const projectIdInput = document.getElementById('scheduledEditorProjectId');
    if (projectIdInput) projectIdInput.value = '';

    const editorProjectSelect = document.getElementById('scheduledEditorProjectSelect');
    if (editorProjectSelect) {
        const selected = populateProjectSelectOptions(editorProjectSelect, _modalProjects, appState.currentProjectId || '', '-- 暂无可配置项目 --');
        editorProjectSelect.disabled = false;
        if (projectIdInput) projectIdInput.value = selected;
    }

    const runAfterSaveWrap = document.getElementById('scheduledRunAfterSaveWrap');
    const runAfterSave = document.getElementById('scheduledRunAfterSaveOnce');
    if (runAfterSave) {
        runAfterSave.checked = false;
        runAfterSave.disabled = false;
        runAfterSave.title = '勾选后保存成功会自动执行一次';
    }
    if (runAfterSaveWrap) runAfterSaveWrap.style.opacity = '1';

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
    const enableExtCb = document.getElementById('scheduledEnableExternalEmails');
    if (enableExtCb) {
        enableExtCb.checked = false;
        window.toggleExternalEmailsInput && window.toggleExternalEmailsInput();
    }

    const validUntilCb = document.getElementById('scheduledEnableValidUntil');
    const validUntilInput = document.getElementById('scheduledValidUntil');
    if (validUntilCb) validUntilCb.checked = false;
    if (validUntilInput) validUntilInput.value = '';
    window.toggleValidUntilInput && window.toggleValidUntilInput();

    const periodic = document.querySelector('input[name="scheduledTaskType"][value="periodic"]');
    if (periodic) periodic.checked = true;

    const weekly = document.querySelector('input[name="scheduledFrequency"][value="weekly"]');
    if (weekly) weekly.checked = true;

    renderRecipientUserList([], []);
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

async function loadAccessibleProjects() {
    const resp = await fetch('/api/projects/accessible');
    if (!resp.ok) {
        throw new Error('加载项目列表失败');
    }
    const result = await resp.json();
    if (!Array.isArray(result)) {
        throw new Error(result.message || '项目列表数据格式错误');
    }
    _modalProjects = result;
}

/**
 * 从全局 API 一次性加载所有任务（平台级功能）。
 * 替代旧的 per-project 并发请求，彻底解决数据不一致问题。
 */
async function loadAllTasks() {
    _currentProjectId = '';
    _recipientOptions = [];
    _currentProjectMeta = { party_b: '', project_name: '' };

    const resp = await fetch('/api/projects/report-schedules/all', { cache: 'no-store' });
    const result = await safeParseJson(resp);
    if (result.status !== 'success') {
        throw new Error(result.message || '加载任务失败');
    }

    _allLoadedTasks = Array.isArray(result.tasks) ? result.tasks : [];
    populateTaskFilterOptions(_allLoadedTasks);
    refreshTaskListByCurrentFilters();
}

/**
 * 统一刷新入口：始终调用全局 API 获取最新数据。
 */
async function reloadAllTasks() {
    await loadAllTasks();
}

/**
 * 加载指定项目的收件人（编辑器切换项目时使用）。
 */
async function loadProjectRecipients(projectId) {
    if (!projectId) {
        _recipientOptions = [];
        return;
    }
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report-schedules`, { cache: 'no-store' });
    const result = await safeParseJson(resp);
    if (result.status === 'success') {
        _recipientOptions = Array.isArray(result.recipient_options) ? result.recipient_options : [];
        _currentProjectMeta = result.project_meta || { party_b: '', project_name: '' };
    }
}

function buildPayloadFromEditorForm() {
    const taskType = getTaskTypeValue();
    const frequency = getFrequencyValue();
    const freqLabels = { daily: '日报', weekly: '周报', monthly: '月报' };
    const projectSelect = document.getElementById('scheduledEditorProjectSelect');
    const projectName = projectSelect?.selectedOptions?.[0]?.textContent?.replace(/\s*\(.*\)$/, '') || '';
    const autoName = projectName ? `${projectName}-${freqLabels[frequency] || '报告'}` : (freqLabels[frequency] || '定时报告任务');
    const taskName = (document.getElementById('scheduledTaskName')?.value || '').trim() || autoName;
    return {
        task_name: taskName,
        task_type: taskType,
        enabled: !!document.getElementById('scheduledReportEnabled')?.checked,
        frequency: frequency,
        send_time: document.getElementById('scheduledSendTime')?.value || '09:00',
        weekday: Number(document.getElementById('scheduledWeekday')?.value || 1),
        day_of_month: Number(document.getElementById('scheduledDayOfMonth')?.value || 1),
        run_date: taskType === 'one_time' ? (document.getElementById('scheduledRunDate')?.value || todayDateString()) : '',
        include_pdf: !!document.getElementById('scheduledIncludePdf')?.checked,
        in_app_message_enabled: true,
        login_popup_enabled: !!document.getElementById('scheduledLoginPopupEnabled')?.checked,
        recipient_user_ids: collectSelectedRecipientUserIds(),
        external_emails: (() => {
            const enableExtCb = document.getElementById('scheduledEnableExternalEmails');
            if (!enableExtCb?.checked) return [];
            const rawVal = document.getElementById('scheduledExternalEmails')?.value || '';
            if (!rawVal.trim()) return [];
            return rawVal.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
        })(),
        valid_until: (() => {
            const cb = document.getElementById('scheduledEnableValidUntil');
            if (!cb || !cb.checked) return '';
            return document.getElementById('scheduledValidUntil')?.value || '';
        })()
    };
}

export async function openScheduledTaskEditorModal(taskId = '', projectId = '') {
    if (taskId) {
        let editingTask = _allLoadedTasks.find((x) => String(x.task_id) === String(taskId));
        const targetProjectId = String(projectId || editingTask?.project_id || editingTask?._project_id || '').trim();
        if (!editingTask || !targetProjectId) {
            showNotification('任务不存在', 'error');
            return;
        }
        _currentProjectId = targetProjectId;
        _recipientOptions = Array.isArray(editingTask._recipient_options) ? editingTask._recipient_options : [];
        fillEditorByTask(editingTask);
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

async function runTaskNow(taskId, projectId = '') {
    const targetProjectId = String(projectId || '').trim();
    if (!targetProjectId || !taskId) {
        showNotification('缺少任务信息', 'error');
        return;
    }
    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${encodeURIComponent(targetProjectId)}/report-schedules/${encodeURIComponent(taskId)}/run`, { method: 'POST' });
        const result = await safeParseJson(resp);
        if (result.status === 'success') {
            showNotification(result.message || '执行成功', 'success');
            await reloadAllTasks();
        } else {
            showNotification(result.message || '执行失败', 'error');
        }
    } catch (e) {
        showNotification(e.message || '执行失败', 'error');
    } finally {
        showLoading(false);
    }
}

async function toggleTask(taskId, projectId = '') {
    const task = _allLoadedTasks.find((x) => String(x.task_id) === String(taskId));
    if (!task) {
        showNotification('任务不存在', 'error');
        return;
    }
    const targetProjectId = String(projectId || task.project_id || task._project_id || '').trim();
    if (!targetProjectId) {
        showNotification('缺少任务所属项目', 'error');
        return;
    }
    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${encodeURIComponent(targetProjectId)}/report-schedules/${encodeURIComponent(taskId)}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !task.enabled })
        });
        const result = await safeParseJson(resp);
        if (result.status !== 'success') {
            showNotification(result.message || '更新状态失败', 'error');
            return;
        }
        await reloadAllTasks();
        showNotification(task.enabled ? '任务已停用' : '任务已启用', 'success');
    } catch (e) {
        showNotification(e.message || '更新状态失败', 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteTask(taskId, projectId = '') {
    const targetProjectId = String(projectId || '').trim();
    if (!targetProjectId || !taskId) return;
    const confirmed = await new Promise(resolve => showConfirmModal('删除任务', '确认删除该定时任务吗？', () => resolve(true), () => resolve(false)));
    if (!confirmed) return;

    try {
        showLoading(true);
        const resp = await fetch(`/api/projects/${encodeURIComponent(targetProjectId)}/report-schedules/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
        const result = await safeParseJson(resp);
        if (result.status !== 'success') {
            showNotification(result.message || '删除失败', 'error');
            return;
        }
        await reloadAllTasks();
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
        const selectedTasks = _allLoadedTasks.filter((t) => ids.includes(String(t.task_id || '')));
        const results = await Promise.all(selectedTasks.map(async (task) => {
            const pid = String(task.project_id || task._project_id || '');
            const resp = await fetch(
                `/api/projects/${encodeURIComponent(pid)}/report-schedules/${encodeURIComponent(task.task_id)}/toggle`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: true })
                }
            );
            const r = await safeParseJson(resp);
            return r.status === 'success';
        }));
        const successCount = results.filter(Boolean).length;
        const failCount = results.length - successCount;
        await reloadAllTasks();
        if (failCount > 0) {
            showNotification(`成功启用 ${successCount} 个，${failCount} 个失败`, 'warning');
        } else {
            showNotification(`已启用 ${successCount} 个任务`, 'success');
        }
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
    const confirmed = await new Promise(resolve => showConfirmModal('批量删除', `确认删除选中的 ${ids.length} 个任务吗？`, () => resolve(true), () => resolve(false)));
    if (!confirmed) return;

    try {
        showLoading(true);
        const selectedTasks = _allLoadedTasks.filter((t) => ids.includes(String(t.task_id || '')));
        const results = await Promise.all(selectedTasks.map(async (task) => {
            const pid = String(task.project_id || task._project_id || '');
            const resp = await fetch(
                `/api/projects/${encodeURIComponent(pid)}/report-schedules/${encodeURIComponent(task.task_id)}`,
                { method: 'DELETE' }
            );
            const r = await safeParseJson(resp);
            return r.status === 'success';
        }));
        const successCount = results.filter(Boolean).length;
        const failCount = results.length - successCount;
        await reloadAllTasks();
        if (failCount > 0) {
            showNotification(`成功删除 ${successCount} 个，${failCount} 个删除失败`, failCount === results.length ? 'error' : 'warning');
        } else {
            showNotification(`已删除 ${successCount} 个任务`, 'success');
        }
    } catch (e) {
        showNotification(e.message || '批量删除失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function openScheduledReportModal() {
    try {
        showLoading(true);
        _taskList = [];
        _allLoadedTasks = [];
        _recipientOptions = [];
        _editingTaskId = '';
        _currentProjectMeta = { party_b: '', project_name: '' };

        await loadAccessibleProjects();

        const orgFilter = document.getElementById('scheduledOrgFilter');
        if (orgFilter) {
            orgFilter.onchange = () => refreshTaskListByCurrentFilters();
        }

        const creatorFilter = document.getElementById('scheduledCreatorFilter');
        if (creatorFilter) {
            creatorFilter.onchange = () => refreshTaskListByCurrentFilters();
        }

        await reloadAllTasks();

        const newTaskBtn = document.getElementById('scheduledTaskNewBtn');
        if (newTaskBtn) {
            newTaskBtn.onclick = () => openScheduledTaskEditorModal('');
        }

        const editorProjectSelect = document.getElementById('scheduledEditorProjectSelect');
        if (editorProjectSelect) {
            editorProjectSelect.onchange = async () => {
                const selectedId = String(editorProjectSelect.value || '').trim();
                const projectIdInput = document.getElementById('scheduledEditorProjectId');
                if (projectIdInput) projectIdInput.value = selectedId;
                if (!selectedId) {
                    _recipientOptions = [];
                    renderRecipientUserList([], []);
                    return;
                }
                await loadProjectRecipients(selectedId);
                renderRecipientUserList(_recipientOptions, []);
            };
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

    const projectId = (document.getElementById('scheduledEditorProjectId')?.value || '').trim();
    if (!projectId) {
        showNotification('请先选择任务所属项目', 'error');
        return;
    }

    const payload = buildPayloadFromEditorForm();
    const editingTaskId = document.getElementById('scheduledEditingTaskId')?.value || _editingTaskId;
    const isEdit = !!editingTaskId;
    const runAfterSave = !isEdit && !!document.getElementById('scheduledRunAfterSaveOnce')?.checked;

    try {
        showLoading(true);
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

        const savedTaskId = String(result.data?.task_id || editingTaskId || '').trim();

        if (!isEdit && savedTaskId) {
            _pendingHighlightTaskId = savedTaskId;
        }

        if (!isEdit) {
            const orgFilter = document.getElementById('scheduledOrgFilter');
            const creatorFilter = document.getElementById('scheduledCreatorFilter');
            if (orgFilter) orgFilter.value = '';
            if (creatorFilter) creatorFilter.value = '';
        }

        await reloadAllTasks();

        if (!isEdit && runAfterSave && savedTaskId) {
            const runResp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/report-schedules/${encodeURIComponent(savedTaskId)}/run`, {
                method: 'POST'
            });
            const runResult = await safeParseJson(runResp);
            if (runResult.status === 'success') {
                showNotification('任务已创建并立即执行一次', 'success');
            } else {
                showNotification(`任务已创建，但立即执行失败：${runResult.message || '未知错误'}`, 'warning');
            }
            await reloadAllTasks();
        }

        closeScheduledTaskEditorModal();
        if (!(runAfterSave && !isEdit)) {
            showNotification(isEdit ? '任务已更新' : '任务已创建', 'success');
        }
    } catch (e) {
        console.error('保存定时任务失败:', e);
        showNotification(e.message || '保存失败', 'error');
    } finally {
        showLoading(false);
    }
}

export async function runScheduledReportNow() {
    const taskId = document.getElementById('scheduledEditingTaskId')?.value || _editingTaskId;
    const projectId = (document.getElementById('scheduledEditorProjectId')?.value || '').trim() || _currentProjectId;
    if (!taskId) {
        showNotification('请先在任务列表中选择一个任务', 'warning');
        return;
    }
    await runTaskNow(taskId, projectId);
}

export async function applyScheduledReportConfigToSelected() {
    showNotification('已升级为"任务列表管理模式"', 'info');
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
