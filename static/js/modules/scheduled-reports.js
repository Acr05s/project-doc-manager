import { appState } from './app-state.js';
import { showLoading, showNotification, showConfirmModal } from './ui.js';
import { formatDateTimeDisplay } from './utils.js';

// --- 弹窗尺寸记忆工具 ---
function _saveModalSize(storageKey, modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    var inner = modal.querySelector('.modal-content');
    if (!inner) return;
    try {
        localStorage.setItem(storageKey, JSON.stringify({ width: inner.offsetWidth, height: inner.offsetHeight }));
    } catch (e) { /* ignore */ }
}
function _restoreModalSize(storageKey, modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    var inner = modal.querySelector('.modal-content');
    if (!inner) return;
    try {
        var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved && saved.width && saved.height) {
            inner.style.width = saved.width + 'px';
            inner.style.height = saved.height + 'px';
        }
    } catch (e) { /* ignore */ }
}
function _setupModalResizeListener(modalId, storageKey) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    var inner = modal.querySelector('.modal-content');
    if (!inner) return;
    
    let resizeTimer = null;
    inner.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            _saveModalSize(storageKey, modalId);
        }, 200);
    });
}

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

function enableColumnResize(table) {
    if (!table) return;
    var ths = table.querySelectorAll('thead th');
    ths.forEach(function(th) {
        th.style.position = 'relative';
        var handle = document.createElement('div');
        handle.className = 'col-resize-handle';
        th.appendChild(handle);
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var startX = e.pageX;
            var startWidth = th.offsetWidth;
            handle.classList.add('active');
            table.style.tableLayout = 'fixed';
            // Snapshot widths so other columns stay put
            Array.from(table.querySelectorAll('thead th')).forEach(function(h) {
                h.style.width = h.offsetWidth + 'px';
            });
            function onMove(ev) {
                var diff = ev.pageX - startX;
                var newWidth = Math.max(40, startWidth + diff);
                th.style.width = newWidth + 'px';
            }
            function onUp() {
                handle.classList.remove('active');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

function todayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getFrequencyValue() {
    var selected = document.querySelector('input[name="scheduledFrequency"]:checked');
    return selected ? selected.value : 'weekly';
}

function getTaskTypeValue() {
    var selected = document.querySelector('input[name="scheduledTaskType"]:checked');
    return selected ? selected.value : 'periodic';
}

function taskTypeLabel(taskType) {
    return taskType === 'one_time' ? '\u4e00\u6b21\u6027' : '\u5468\u671f\u6027';
}

function frequencyLabel(frequency) {
    if (frequency === 'daily') return '\u65e5\u62a5';
    if (frequency === 'monthly') return '\u6708\u62a5';
    return '\u5468\u62a5';
}

function toggleEditorFields() {
    var taskType = getTaskTypeValue();
    var frequency = getFrequencyValue();
    var weekWrap = document.getElementById('scheduledWeekdayWrap');
    var monthWrap = document.getElementById('scheduledMonthdayWrap');
    var runDateWrap = document.getElementById('scheduledRunDateWrap');
    var skipHolidaysWrap = document.getElementById('scheduledSkipHolidaysWrap');
    if (runDateWrap) runDateWrap.style.display = taskType === 'one_time' ? 'block' : 'none';
    if (weekWrap) weekWrap.style.display = taskType === 'periodic' && frequency === 'weekly' ? 'block' : 'none';
    if (monthWrap) monthWrap.style.display = taskType === 'periodic' && frequency === 'monthly' ? 'block' : 'none';
    if (skipHolidaysWrap) skipHolidaysWrap.style.display = taskType === 'periodic' ? 'block' : 'none';
}

function populateProjectSelectOptions(select, projects, preferredProjectId, emptyText) {
    if (!select) return '';
    select.innerHTML = '';
    if (!Array.isArray(projects) || projects.length === 0) {
        select.innerHTML = '<option value="">' + (emptyText || '\u6682\u65e0\u53ef\u914d\u7f6e\u9879\u76ee') + '</option>';
        return '';
    }
    projects.forEach(function(project) {
        var projectId = String(project.id || '').trim();
        if (!projectId) return;
        var option = document.createElement('option');
        option.value = projectId;
        option.textContent = (project.name || projectId) + ' (' + projectId + ')';
        select.appendChild(option);
    });
    var preferred = String(preferredProjectId || '').trim();
    var matched = Array.from(select.options).some(function(opt) { return opt.value === preferred; });
    select.value = matched ? preferred : String(select.options[0] && select.options[0].value || '');
    return String(select.value || '');
}

function populateTaskFilterOptions(tasks) {
    var orgFilter = document.getElementById('scheduledOrgFilter');
    var creatorFilter = document.getElementById('scheduledCreatorFilter');
    if (orgFilter) {
        var current = String(orgFilter.value || '');
        var orgs = Array.from(new Set((tasks || []).map(function(t) { return String(t._party_b || '').trim(); }).filter(Boolean))).sort();
        orgFilter.innerHTML = '<option value="">\u5168\u90e8\u627f\u5efa\u5355\u4f4d</option>';
        orgs.forEach(function(org) {
            var opt = document.createElement('option');
            opt.value = org;
            opt.textContent = org;
            orgFilter.appendChild(opt);
        });
        if (Array.from(orgFilter.options).some(function(o) { return o.value === current; })) orgFilter.value = current;
    }
    if (creatorFilter) {
        var current2 = String(creatorFilter.value || '');
        var creators = Array.from(new Set((tasks || []).map(function(t) { return String(t._creator_name || '').trim(); }).filter(Boolean))).sort();
        creatorFilter.innerHTML = '<option value="">\u5168\u90e8\u521b\u5efa\u4eba</option>';
        creators.forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            creatorFilter.appendChild(opt);
        });
        if (Array.from(creatorFilter.options).some(function(o) { return o.value === current2; })) creatorFilter.value = current2;
    }
    // 项目筛选复选框
    populateProjectFilterCheckboxes(tasks);
}

function populateProjectFilterCheckboxes(tasks) {
    var area = document.getElementById('scheduledProjectFilterArea');
    if (!area) return;
    // 提取去重项目列表
    var projectMap = {};
    (tasks || []).forEach(function(t) {
        var pid = String(t.project_id || t._project_id || '').trim();
        if (!pid) return;
        if (!projectMap[pid]) {
            projectMap[pid] = String(t._project_name || pid);
        }
    });
    var projectIds = Object.keys(projectMap).sort(function(a, b) { return projectMap[a].localeCompare(projectMap[b]); });
    // 读取 localStorage 上次选中
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem('scheduledProjectFilter') || '[]'); } catch(e) {}
    var savedSet = new Set(Array.isArray(saved) ? saved : []);
    // 如果没有保存过，默认全选
    var useAll = savedSet.size === 0;
    area.innerHTML = '';
    projectIds.forEach(function(pid) {
        var label = document.createElement('label');
        label.style.cssText = 'display:inline-flex; align-items:center; gap:4px; font-size:12px; padding:2px 6px; border:1px solid #dde6f2; border-radius:4px; background:#fff; cursor:pointer; white-space:nowrap;';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.projectFilterId = pid;
        cb.checked = useAll || savedSet.has(pid);
        cb.onchange = function() {
            saveProjectFilterToLocalStorage();
            refreshTaskListByCurrentFilters();
        };
        label.appendChild(cb);
        label.appendChild(document.createTextNode(projectMap[pid]));
        area.appendChild(label);
    });
}

function saveProjectFilterToLocalStorage() {
    var area = document.getElementById('scheduledProjectFilterArea');
    if (!area) return;
    var checked = Array.from(area.querySelectorAll('input[data-project-filter-id]:checked'));
    var ids = checked.map(function(cb) { return cb.dataset.projectFilterId; });
    localStorage.setItem('scheduledProjectFilter', JSON.stringify(ids));
}

function getSelectedProjectFilterIds() {
    var area = document.getElementById('scheduledProjectFilterArea');
    if (!area) return null;
    var all = area.querySelectorAll('input[data-project-filter-id]');
    var checked = area.querySelectorAll('input[data-project-filter-id]:checked');
    // 全不选则显示全部
    if (checked.length === 0 || checked.length === all.length) return null;
    return Array.from(checked).map(function(cb) { return cb.dataset.projectFilterId; });
}

function applyTaskFilters(tasks) {
    var orgValue = String((document.getElementById('scheduledOrgFilter') || {}).value || '').trim();
    var creatorValue = String((document.getElementById('scheduledCreatorFilter') || {}).value || '').trim();
    var freqValue = String((document.getElementById('scheduledFreqFilter') || {}).value || '').trim();
    var projectIds = getSelectedProjectFilterIds();
    return (tasks || []).filter(function(task) {
        if (orgValue && String(task._party_b || '').trim() !== orgValue) return false;
        if (creatorValue && String(task._creator_name || '').trim() !== creatorValue) return false;
        if (freqValue) {
            var taskFreq = task.task_type === 'one_time' ? 'one_time' : String(task.frequency || '').trim();
            if (taskFreq !== freqValue) return false;
        }
        if (projectIds) {
            var pid = String(task.project_id || task._project_id || '').trim();
            if (projectIds.indexOf(pid) === -1) return false;
        }
        return true;
    });
}

function refreshTaskListByCurrentFilters() {
    var filtered = applyTaskFilters(_allLoadedTasks);
    _taskList = filtered;
    renderTaskList(filtered);
}

function highlightTaskRow(taskId) {
    var id = String(taskId || '').trim();
    if (!id) return;
    var row = document.querySelector('#scheduledTaskList tr[data-task-row-id="' + id + '"]');
    if (!row) return;
    row.style.transition = 'background-color 240ms ease, box-shadow 240ms ease';
    row.style.backgroundColor = '#fff7d6';
    row.style.boxShadow = 'inset 0 0 0 2px #fbbf24';
    setTimeout(function() { row.style.backgroundColor = ''; row.style.boxShadow = ''; }, 3000);
}

function selectedTaskIds() {
    var checked = document.querySelectorAll('#scheduledTaskList input[type="checkbox"][data-task-select="1"]:checked');
    return Array.from(checked).map(function(x) { return String(x.dataset.taskId || ''); }).filter(Boolean);
}

function recipientGroups(task) {
    var selectedSet = new Set((task.recipient_user_ids || []).map(function(x) { return Number(x); }));
    var partyB = String(task._party_b || _currentProjectMeta.party_b || '').trim();
    var contractor = [];
    var pmo = [];
    var opts = Array.isArray(task._recipient_options) ? task._recipient_options : _recipientOptions;
    opts.forEach(function(u) {
        var uid = Number(u.id || 0);
        if (!uid || !selectedSet.has(uid)) return;
        var name = String(u.display_name || u.username || uid);
        var role = String(u.role || '').toLowerCase();
        var org = String(u.organization || '').trim();
        if (role === 'pmo' || role === 'pmo_leader') { pmo.push(name); return; }
        contractor.push(name);
    });
    var external = (task.external_emails || []).map(function(x) { return String(x).trim(); }).filter(Boolean);
    var externalEnabled = task.hasOwnProperty('external_emails_enabled') ? !!task.external_emails_enabled : external.length > 0;
    return { contractor: contractor.join('\u3001') || '-', pmo: pmo.join('\u3001') || '-', external: external.join(', ') || '-', externalEnabled: externalEnabled };
}

function renderTaskList(tasks) {
    var container = document.getElementById('scheduledTaskList');
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(tasks) || tasks.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:#777;">\u6682\u65e0\u4efb\u52a1\uff0c\u70b9\u51fb\u201c\u65b0\u5efa\u4efb\u52a1\u201d\u5f00\u59cb\u914d\u7f6e\u3002</div>';
        return;
    }
    var table = document.createElement('table');
    table.style.cssText = 'width:100%; border-collapse:collapse; font-size:12px; table-layout:auto;';
    var headHtml = '<thead><tr style="background:#f5f8fc;">';
    headHtml += '<th style="border:1px solid #e2e8f0; padding:6px;"><input type="checkbox" id="scheduledTaskSelectAll"></th>';
    ['\u9879\u76ee\u540d\u79f0','\u4efb\u52a1\u540d\u79f0','\u521b\u5efa\u4eba','\u4efb\u52a1\u7c7b\u578b','\u9891\u7387','\u6267\u884c\u6b21\u6570','\u4e0b\u4e00\u6b21\u6267\u884c','\u627f\u5efa\u5355\u4f4d','\u627f\u5efa\u5355\u4f4d\u6536\u4ef6\u4eba','PMO\u7ec4\u6536\u4ef6\u4eba','\u5916\u90e8\u6536\u4ef6\u4eba','\u72b6\u6001','\u64cd\u4f5c'].forEach(function(h) {
        headHtml += '<th style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + h + '</th>';
    });
    headHtml += '</tr></thead><tbody></tbody>';
    table.innerHTML = headHtml;
    var tbody = table.querySelector('tbody');
    tasks.forEach(function(task) {
        var groups = recipientGroups(task);
        var creatorName = task._creator_name || task.created_by_display_name || task.created_by_username || '-';
        var tr = document.createElement('tr');
        tr.dataset.taskRowId = String(task.task_id || '');
        var pid = escapeHtml(task.project_id || task._project_id || '');
        var tid = escapeHtml(task.task_id);
        var freqText = task.task_type === 'one_time'
            ? '\u4e00\u6b21\u6027(' + escapeHtml(task.run_date || '-') + ')'
            : frequencyLabel(task.frequency) + ' ' + escapeHtml(task.send_time || '');
        var cells = '';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; text-align:center;"><input type="checkbox" data-task-select="1" data-task-id="' + tid + '"></td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + escapeHtml(task._project_name || task.project_id || '-') + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + escapeHtml(task.task_name || '\u672a\u547d\u540d\u4efb\u52a1') + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + escapeHtml(creatorName) + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + taskTypeLabel(task.task_type) + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + freqText + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; text-align:center;">' + Number(task.run_count || 0) + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap; font-size:11px;">' + (task._next_execution ? formatDateTimeDisplay(task._next_execution) : '-') + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + escapeHtml(task._party_b || '-') + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px;">' + escapeHtml(groups.contractor) + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px;">' + escapeHtml(groups.pmo) + '</td>';
        var externalCell;
        if (groups.external === '-') {
            externalCell = '-';
        } else if (groups.externalEnabled) {
            externalCell = escapeHtml(groups.external);
        } else {
            externalCell = '<span style="color:#aaa; text-decoration:line-through;" title="外部收件人已保存但未启用">' + escapeHtml(groups.external) + '</span><span style="margin-left:4px; font-size:11px; color:#bbb;">(未启用)</span>';
        }
        cells += '<td style="border:1px solid #e2e8f0; padding:6px;">' + externalCell + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + (task.enabled ? '\u542f\u7528' : '\u505c\u7528') + '</td>';
        cells += '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">';
        cells += '<button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-task-id="' + tid + '" data-project-id="' + pid + '">\u7f16\u8f91</button> ';
        cells += '<button type="button" class="btn btn-info btn-sm" data-action="toggle" data-task-id="' + tid + '" data-project-id="' + pid + '">' + (task.enabled ? '\u505c\u7528' : '\u542f\u7528') + '</button> ';
        cells += '<button type="button" class="btn btn-warning btn-sm" data-action="run" data-task-id="' + tid + '" data-project-id="' + pid + '">\u6267\u884c</button> ';
        cells += '<button type="button" class="btn btn-sm" style="background:#6366f1;color:#fff;border:none;" data-action="history" data-task-id="' + tid + '" data-project-id="' + pid + '">\u5386\u53f2</button> ';
        cells += '<button type="button" class="btn btn-sm" style="background:#f59e0b;color:#fff;border:none;" data-action="skip-next" data-task-id="' + tid + '" data-project-id="' + pid + '">\u8df3\u8fc7\u4e0b\u6b21</button> ';
        cells += '<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-task-id="' + tid + '" data-project-id="' + pid + '">\u5220\u9664</button>';
        cells += '</td>';
        tr.innerHTML = cells;
        tbody.appendChild(tr);
    });
    container.appendChild(table);
    enableColumnResize(table);
    var selectAll = document.getElementById('scheduledTaskSelectAll');
    if (selectAll) {
        selectAll.onchange = function() {
            container.querySelectorAll('input[data-task-select="1"]').forEach(function(cb) { cb.checked = !!selectAll.checked; });
        };
    }
    container.querySelectorAll('button[data-action]').forEach(function(btn) {
        btn.onclick = async function() {
            var action = btn.dataset.action;
            var taskId = btn.dataset.taskId;
            var projectId = String(btn.dataset.projectId || '').trim();
            if (!taskId || !projectId) return;
            if (action === 'edit') { await openScheduledTaskEditorModal(taskId, projectId); return; }
            if (action === 'toggle') { await toggleTask(taskId, projectId); return; }
            if (action === 'run') { await runTaskNow(taskId, projectId); return; }
            if (action === 'history') { openScheduledTaskHistoryModal(taskId, projectId); return; }
            if (action === 'skip-next') { await skipNextTask(taskId, projectId); return; }
            if (action === 'delete') { await deleteTask(taskId, projectId); }
        };
    });
    if (_pendingHighlightTaskId) {
        var toHighlight = _pendingHighlightTaskId;
        _pendingHighlightTaskId = '';
        setTimeout(function() { highlightTaskRow(toHighlight); }, 0);
    }
}

function renderRecipientUserList(recipientOptions, selectedIds) {
    var contractorContainer = document.getElementById('scheduledContractorUserList');
    var pmoContainer = document.getElementById('scheduledPmoUserList');
    var legacyContainer = document.getElementById('scheduledRecipientUserList');
    var empty = '<div style="font-size:12px; color:#777;">\u5f53\u524d\u9879\u76ee\u6682\u65e0\u53ef\u9009\u6536\u4ef6\u4eba\u3002</div>';
    if (!Array.isArray(recipientOptions) || recipientOptions.length === 0) {
        if (contractorContainer) contractorContainer.innerHTML = empty;
        if (pmoContainer) pmoContainer.innerHTML = empty;
        if (legacyContainer) legacyContainer.innerHTML = empty;
        return;
    }
    var selectedSet = new Set((selectedIds || []).map(function(x) { return Number(x); }));
    var contractorUsers = [];
    var pmoUsers = [];
    recipientOptions.forEach(function(user) {
        var role = String(user.role || '').toLowerCase();
        if (role === 'pmo' || role === 'pmo_leader') pmoUsers.push(user);
        else contractorUsers.push(user);
    });
    function buildUserRow(user) {
        var uid = Number(user.id || 0);
        if (!uid) return null;
        var row = document.createElement('label');
        row.style.cssText = 'display:flex; align-items:flex-start; gap:8px; border:1px solid #e3edf9; border-radius:6px; padding:7px; background:#fff; cursor:pointer;';
        var checked = selectedSet.has(uid) ? 'checked' : '';
        row.innerHTML = '<input type="checkbox" data-recipient-user-id="' + uid + '" ' + checked + ' style="margin-top:2px;">' +
            '<span style="display:flex; flex-direction:column; gap:2px; min-width:0;">' +
            '<strong style="font-size:13px; color:#223;">' + escapeHtml(user.display_name || user.username || '\u7528\u6237' + uid) + '</strong>' +
            '<span style="font-size:11px; color:#607389;">' + escapeHtml(user.role || '-') + ' | ' + escapeHtml(user.organization || '-') + '</span>' +
            '<span style="font-size:11px; color:#607389;">' + escapeHtml(user.email || '-') + '</span>' +
            '</span>';
        return row;
    }
    function fillContainer(ct, users) {
        if (!ct) return;
        ct.innerHTML = '';
        if (users.length === 0) { ct.innerHTML = '<div style="font-size:12px; color:#aaa;">\u6682\u65e0</div>'; return; }
        users.forEach(function(user) { var row = buildUserRow(user); if (row) ct.appendChild(row); });
    }
    fillContainer(contractorContainer, contractorUsers);
    fillContainer(pmoContainer, pmoUsers);
    if (legacyContainer) {
        legacyContainer.innerHTML = '';
        recipientOptions.forEach(function(user) { var row = buildUserRow(user); if (row) legacyContainer.appendChild(row); });
    }
}

function collectSelectedRecipientUserIds() {
    var selectors = [
        '#scheduledContractorUserList input[type="checkbox"][data-recipient-user-id]:checked',
        '#scheduledPmoUserList input[type="checkbox"][data-recipient-user-id]:checked',
        '#scheduledRecipientUserList input[type="checkbox"][data-recipient-user-id]:checked'
    ];
    var ids = new Set();
    selectors.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(item) {
            var v = Number(item.dataset.recipientUserId || 0);
            if (v > 0) ids.add(v);
        });
    });
    return Array.from(ids);
}

window.toggleExternalEmailsInput = function() {
    var cb = document.getElementById('scheduledEnableExternalEmails');
    var wrapper = document.getElementById('scheduledExternalEmailsWrapper');
    if (!wrapper) return;
    wrapper.style.display = (cb && cb.checked) ? 'block' : 'none';
};

window.toggleValidUntilInput = function() {
    var cb = document.getElementById('scheduledEnableValidUntil');
    var input = document.getElementById('scheduledValidUntil');
    var hint = document.getElementById('scheduledValidUntilHint');
    var show = !!(cb && cb.checked);
    if (input) input.style.display = show ? 'inline-block' : 'none';
    if (hint) hint.style.display = show ? 'block' : 'none';
    if (show && input && !input.value) {
        var d = new Date();
        d.setMonth(d.getMonth() + 1);
        input.value = d.toISOString().slice(0, 10);
    }
};

function fillEditorByTask(task) {
    _editingTaskId = String(task.task_id || '');
    var editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = _editingTaskId;
    var targetProjectId = String(task.project_id || task._project_id || _currentProjectId || '');
    _currentProjectId = targetProjectId;
    var projectIdInput = document.getElementById('scheduledEditorProjectId');
    if (projectIdInput) projectIdInput.value = targetProjectId;
    var editorProjectSelect = document.getElementById('scheduledEditorProjectSelect');
    if (editorProjectSelect) {
        populateProjectSelectOptions(editorProjectSelect, _modalProjects, targetProjectId, '-- \u6682\u65e0\u53ef\u914d\u7f6e\u9879\u76ee --');
        editorProjectSelect.value = targetProjectId;
        editorProjectSelect.disabled = true;
    }
    var runAfterSaveWrap = document.getElementById('scheduledRunAfterSaveWrap');
    var runAfterSave = document.getElementById('scheduledRunAfterSaveOnce');
    if (runAfterSave) { runAfterSave.checked = false; runAfterSave.disabled = true; runAfterSave.title = '\u7f16\u8f91\u4efb\u52a1\u4e0d\u652f\u6301\u201c\u4fdd\u5b58\u540e\u7acb\u5373\u6267\u884c\u201d\uff0c\u8bf7\u4f7f\u7528\u5217\u8868\u4e2d\u7684\u201c\u6267\u884c\u201d\u6309\u94ae'; }
    if (runAfterSaveWrap) runAfterSaveWrap.style.opacity = '0.55';
    var taskName = document.getElementById('scheduledTaskName');
    if (taskName) taskName.value = task.task_name || '';
    var enabled = document.getElementById('scheduledReportEnabled');
    if (enabled) enabled.checked = !!task.enabled;
    var sendTime = document.getElementById('scheduledSendTime');
    if (sendTime) sendTime.value = task.send_time || '09:00';
    var weekday = document.getElementById('scheduledWeekday');
    if (weekday) weekday.value = String(task.weekday || 1);
    var dayOfMonth = document.getElementById('scheduledDayOfMonth');
    if (dayOfMonth) dayOfMonth.value = String(task.day_of_month || 1);
    var runDate = document.getElementById('scheduledRunDate');
    if (runDate) runDate.value = task.run_date || '';
    var includePdf = document.getElementById('scheduledIncludePdf');
    if (includePdf) includePdf.checked = task.include_pdf !== false;
    var emailEnabled = document.getElementById('scheduledEmailEnabled');
    if (emailEnabled) emailEnabled.checked = task.email_enabled !== false;
    var inAppEnabled = document.getElementById('scheduledInAppEnabled');
    if (inAppEnabled) inAppEnabled.checked = task.in_app_message_enabled !== false;
    var popupEnabled = document.getElementById('scheduledLoginPopupEnabled');
    if (popupEnabled) popupEnabled.checked = task.login_popup_enabled !== false;
    var skipHolidays = document.getElementById('scheduledSkipHolidays');
    if (skipHolidays) skipHolidays.checked = !!task.skip_holidays;
    var skipWeekends = document.getElementById('scheduledSkipWeekends');
    if (skipWeekends) skipWeekends.checked = !!task.skip_weekends;
    var ext = document.getElementById('scheduledExternalEmails');
    var extVal = Array.isArray(task.external_emails) ? task.external_emails.join(', ') : '';
    if (ext) ext.value = extVal;
    var enableExtCb = document.getElementById('scheduledEnableExternalEmails');
    if (enableExtCb) {
        // Use explicit external_emails_enabled flag if present; fall back to whether emails are non-empty
        var extEnabled = task.hasOwnProperty('external_emails_enabled') ? !!task.external_emails_enabled : !!(extVal.trim());
        enableExtCb.checked = extEnabled;
        window.toggleExternalEmailsInput && window.toggleExternalEmailsInput();
    }
    var validUntilCb = document.getElementById('scheduledEnableValidUntil');
    var validUntilInput2 = document.getElementById('scheduledValidUntil');
    var validUntilVal = String(task.valid_until || '').trim().slice(0, 10);
    if (validUntilCb) validUntilCb.checked = !!(validUntilVal);
    if (validUntilInput2) validUntilInput2.value = validUntilVal;
    window.toggleValidUntilInput && window.toggleValidUntilInput();
    var typeRadio = document.querySelector('input[name="scheduledTaskType"][value="' + (task.task_type || 'periodic') + '"]');
    if (typeRadio) typeRadio.checked = true;
    var freqRadio = document.querySelector('input[name="scheduledFrequency"][value="' + (task.frequency || 'weekly') + '"]');
    if (freqRadio) freqRadio.checked = true;
    _recipientOptions = Array.isArray(task._recipient_options) ? task._recipient_options : _recipientOptions;
    renderRecipientUserList(_recipientOptions, task.recipient_user_ids || []);
    toggleEditorFields();
}

function clearEditorToNewTask() {
    _editingTaskId = '';
    var editingId = document.getElementById('scheduledEditingTaskId');
    if (editingId) editingId.value = '';
    var projectIdInput = document.getElementById('scheduledEditorProjectId');
    if (projectIdInput) projectIdInput.value = '';
    var editorProjectSelect = document.getElementById('scheduledEditorProjectSelect');
    if (editorProjectSelect) {
        var selected = populateProjectSelectOptions(editorProjectSelect, _modalProjects, appState.currentProjectId || '', '-- \u6682\u65e0\u53ef\u914d\u7f6e\u9879\u76ee --');
        editorProjectSelect.disabled = false;
        if (projectIdInput) projectIdInput.value = selected;
        // 加载默认项目的收件人列表（包含PMO成员）
        if (selected) {
            loadProjectRecipients(selected).then(function() {
                renderRecipientUserList(_recipientOptions, []);
            });
        }
    }
    var runAfterSaveWrap = document.getElementById('scheduledRunAfterSaveWrap');
    var runAfterSave = document.getElementById('scheduledRunAfterSaveOnce');
    if (runAfterSave) { runAfterSave.checked = false; runAfterSave.disabled = false; runAfterSave.title = '\u52fe\u9009\u540e\u4fdd\u5b58\u6210\u529f\u4f1a\u81ea\u52a8\u6267\u884c\u4e00\u6b21'; }
    if (runAfterSaveWrap) runAfterSaveWrap.style.opacity = '1';
    var taskName = document.getElementById('scheduledTaskName');
    if (taskName) taskName.value = '';
    var enabled = document.getElementById('scheduledReportEnabled');
    if (enabled) enabled.checked = true;
    var sendTime = document.getElementById('scheduledSendTime');
    if (sendTime) sendTime.value = '09:00';
    var weekday = document.getElementById('scheduledWeekday');
    if (weekday) weekday.value = '1';
    var dayOfMonth = document.getElementById('scheduledDayOfMonth');
    if (dayOfMonth) dayOfMonth.value = '1';
    var runDate = document.getElementById('scheduledRunDate');
    if (runDate) runDate.value = todayDateString();
    var includePdf = document.getElementById('scheduledIncludePdf');
    if (includePdf) includePdf.checked = true;
    var popupEnabled = document.getElementById('scheduledLoginPopupEnabled');
    if (popupEnabled) popupEnabled.checked = true;
    var skipHolidays = document.getElementById('scheduledSkipHolidays');
    if (skipHolidays) skipHolidays.checked = false;
    var skipWeekends = document.getElementById('scheduledSkipWeekends');
    if (skipWeekends) skipWeekends.checked = false;
    var ext = document.getElementById('scheduledExternalEmails');
    if (ext) ext.value = '';
    var enableExtCb = document.getElementById('scheduledEnableExternalEmails');
    if (enableExtCb) { enableExtCb.checked = false; window.toggleExternalEmailsInput && window.toggleExternalEmailsInput(); }
    var validUntilCb = document.getElementById('scheduledEnableValidUntil');
    var validUntilInput2 = document.getElementById('scheduledValidUntil');
    if (validUntilCb) validUntilCb.checked = false;
    if (validUntilInput2) validUntilInput2.value = '';
    window.toggleValidUntilInput && window.toggleValidUntilInput();
    var periodic = document.querySelector('input[name="scheduledTaskType"][value="periodic"]');
    if (periodic) periodic.checked = true;
    var weekly = document.querySelector('input[name="scheduledFrequency"][value="weekly"]');
    if (weekly) weekly.checked = true;
    // 自动加载PMO成员，即使未选择项目
    var editorProjectSelect = document.getElementById('scheduledEditorProjectSelect');
    if (editorProjectSelect) {
        var selected = editorProjectSelect.value;
        if (selected) {
            loadProjectRecipients(selected).then(function() {
                renderRecipientUserList(_recipientOptions, []);
            });
        } else {
            // 加载所有PMO成员
            loadPMOMembers().then(function() {
                renderRecipientUserList(_recipientOptions, []);
            });
        }
    }
    toggleEditorFields();
}

async function loadPMOMembers() {
    try {
        var resp = await fetch('/api/users/pmo', { cache: 'no-store' });
        var result = await safeParseJson(resp);
        if (result.status === 'success') {
            _recipientOptions = Array.isArray(result.users) ? result.users : [];
        }
    } catch (e) {
        console.error('加载PMO成员失败:', e);
        _recipientOptions = [];
    }
}

async function safeParseJson(resp) {
    var text = await resp.text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error('\u670d\u52a1\u5668\u8fd4\u56de\u975eJSON\uff08HTTP ' + resp.status + ')'); }
}

async function loadAccessibleProjects() {
    var resp = await fetch('/api/projects/accessible');
    if (!resp.ok) throw new Error('\u52a0\u8f7d\u9879\u76ee\u5217\u8868\u5931\u8d25');
    var result = await resp.json();
    if (!Array.isArray(result)) throw new Error(result.message || '\u9879\u76ee\u5217\u8868\u6570\u636e\u683c\u5f0f\u9519\u8bef');
    _modalProjects = result;
}

async function loadAllTasks() {
    _currentProjectId = '';
    _recipientOptions = [];
    _currentProjectMeta = { party_b: '', project_name: '' };
    var resp = await fetch('/api/projects/report-schedules/all', { cache: 'no-store' });
    var result = await safeParseJson(resp);
    if (result.status !== 'success') throw new Error(result.message || '\u52a0\u8f7d\u4efb\u52a1\u5931\u8d25');
    _allLoadedTasks = Array.isArray(result.tasks) ? result.tasks : [];
    populateTaskFilterOptions(_allLoadedTasks);
    refreshTaskListByCurrentFilters();
}

async function reloadAllTasks() {
    await loadAllTasks();
}

async function loadAllPmoUsers() {
    try {
        var resp = await fetch('/api/admin/users?status=active');
        if (!resp.ok) return [];
        var result = await resp.json();
        if (result.status === 'success') {
            return (result.users || []).filter(function(u) {
                var role = String(u.role || '').toLowerCase();
                return role === 'pmo' || role === 'pmo_leader';
            });
        }
    } catch (e) { console.error('加载PMO用户失败:', e); }
    return [];
}

async function loadProjectRecipients(projectId) {
    if (!projectId) { _recipientOptions = []; return; }
    var resp = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/report-schedules', { cache: 'no-store' });
    var result = await safeParseJson(resp);
    if (result.status === 'success') {
        _recipientOptions = Array.isArray(result.recipient_options) ? result.recipient_options : [];
        _currentProjectMeta = result.project_meta || { party_b: '', project_name: '' };
    }
    // 合并全局PMO用户（PMO成员管理所有项目）
    var pmoUsers = await loadAllPmoUsers();
    if (pmoUsers.length > 0) {
        var existingIds = new Set(_recipientOptions.map(function(u) { return Number(u.id); }));
        pmoUsers.forEach(function(u) {
            if (!existingIds.has(Number(u.id))) {
                _recipientOptions.push(u);
            }
        });
    }
}

function buildPayloadFromEditorForm() {
    var taskType = getTaskTypeValue();
    var frequency = getFrequencyValue();
    var freqLabels = { daily: '\u65e5\u62a5', weekly: '\u5468\u62a5', monthly: '\u6708\u62a5' };
    var projectSelect = document.getElementById('scheduledEditorProjectSelect');
    var projectName = '';
    if (projectSelect && projectSelect.selectedOptions && projectSelect.selectedOptions[0]) {
        projectName = projectSelect.selectedOptions[0].textContent.replace(/\s*\(.*\)$/, '');
    }
    var autoName = projectName ? projectName + '-' + (freqLabels[frequency] || '\u62a5\u544a') : (freqLabels[frequency] || '\u5b9a\u65f6\u62a5\u544a\u4efb\u52a1');
    var taskNameEl = document.getElementById('scheduledTaskName');
    var taskName = (taskNameEl ? taskNameEl.value : '').trim() || autoName;
    var enabledEl = document.getElementById('scheduledReportEnabled');
    var sendTimeEl = document.getElementById('scheduledSendTime');
    var weekdayEl = document.getElementById('scheduledWeekday');
    var dayOfMonthEl = document.getElementById('scheduledDayOfMonth');
    var runDateEl = document.getElementById('scheduledRunDate');
    var includePdfEl = document.getElementById('scheduledIncludePdf');
    var popupEl = document.getElementById('scheduledLoginPopupEnabled');
    var extEmails = [];
    var enableExtCb = document.getElementById('scheduledEnableExternalEmails');
    var rawVal = (document.getElementById('scheduledExternalEmails') || {}).value || '';
    if (rawVal.trim()) extEmails = rawVal.split(/[,\uff0c\n]/).map(function(s) { return s.trim(); }).filter(Boolean);
    var externalEmailsEnabled = !!(enableExtCb && enableExtCb.checked);
    var validUntil = '';
    var vuCb = document.getElementById('scheduledEnableValidUntil');
    if (vuCb && vuCb.checked) validUntil = (document.getElementById('scheduledValidUntil') || {}).value || '';
    var skipHolidaysEl = document.getElementById('scheduledSkipHolidays');
    var skipWeekendsEl = document.getElementById('scheduledSkipWeekends');
    return {
        task_name: taskName,
        task_type: taskType,
        enabled: !!(enabledEl && enabledEl.checked),
        frequency: frequency,
        send_time: sendTimeEl ? sendTimeEl.value : '09:00',
        weekday: Number(weekdayEl ? weekdayEl.value : 1),
        day_of_month: Number(dayOfMonthEl ? dayOfMonthEl.value : 1),
        run_date: taskType === 'one_time' ? (runDateEl ? runDateEl.value : todayDateString()) : '',
        include_pdf: !!(includePdfEl && includePdfEl.checked),
        email_enabled: !!(document.getElementById('scheduledEmailEnabled')?.checked),
        in_app_message_enabled: !!(document.getElementById('scheduledInAppEnabled')?.checked),
        login_popup_enabled: !!(popupEl && popupEl.checked),
        recipient_user_ids: collectSelectedRecipientUserIds(),
        external_emails: extEmails,
        external_emails_enabled: externalEmailsEnabled,
        valid_until: validUntil,
        skip_holidays: !!(skipHolidaysEl && skipHolidaysEl.checked),
        skip_weekends: !!(skipWeekendsEl && skipWeekendsEl.checked)
    };
}

export async function openScheduledTaskEditorModal(taskId, projectId) {
    taskId = taskId || '';
    projectId = projectId || '';
    if (taskId) {
        var editingTask = _allLoadedTasks.find(function(x) { return String(x.task_id) === String(taskId); });
        var targetProjectId = String(projectId || (editingTask && editingTask.project_id) || (editingTask && editingTask._project_id) || '').trim();
        if (!editingTask || !targetProjectId) { showNotification('\u4efb\u52a1\u4e0d\u5b58\u5728', 'error'); return; }
        _currentProjectId = targetProjectId;
        _recipientOptions = Array.isArray(editingTask._recipient_options) ? editingTask._recipient_options : [];
        fillEditorByTask(editingTask);
    } else {
        clearEditorToNewTask();
    }
    var form = document.getElementById('scheduledTaskEditorForm');
    if (form) form.onsubmit = saveScheduledReportConfig;
    var modal = document.getElementById('scheduledTaskEditorModal');
    if (modal) { modal.classList.add('show'); modal.style.display = 'flex'; _restoreModalSize('scheduledTaskEditorModalSize', 'scheduledTaskEditorModal'); _setupModalResizeListener('scheduledTaskEditorModal', 'scheduledTaskEditorModalSize'); }
}

export function closeScheduledTaskEditorModal() {
    _saveModalSize('scheduledTaskEditorModalSize', 'scheduledTaskEditorModal');
    var modal = document.getElementById('scheduledTaskEditorModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
}

async function runTaskNow(taskId, projectId) {
    var targetProjectId = String(projectId || '').trim();
    if (!targetProjectId || !taskId) { showNotification('\u7f3a\u5c11\u4efb\u52a1\u4fe1\u606f', 'error'); return; }
    try {
        showLoading(true);
        var resp = await fetch('/api/projects/' + encodeURIComponent(targetProjectId) + '/report-schedules/' + encodeURIComponent(taskId) + '/run', { method: 'POST' });
        var result = await safeParseJson(resp);
        if (result.status === 'success') { showNotification(result.message || '\u6267\u884c\u6210\u529f', 'success'); await reloadAllTasks(); }
        else showNotification(result.message || '\u6267\u884c\u5931\u8d25', 'error');
    } catch (e) { showNotification(e.message || '\u6267\u884c\u5931\u8d25', 'error'); }
    finally { showLoading(false); }
}

async function toggleTask(taskId, projectId) {
    var task = _allLoadedTasks.find(function(x) { return String(x.task_id) === String(taskId); });
    if (!task) { showNotification('\u4efb\u52a1\u4e0d\u5b58\u5728', 'error'); return; }
    var targetProjectId = String(projectId || task.project_id || task._project_id || '').trim();
    if (!targetProjectId) { showNotification('\u7f3a\u5c11\u4efb\u52a1\u6240\u5c5e\u9879\u76ee', 'error'); return; }
    try {
        showLoading(true);
        var resp = await fetch('/api/projects/' + encodeURIComponent(targetProjectId) + '/report-schedules/' + encodeURIComponent(taskId) + '/toggle', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !task.enabled })
        });
        var result = await safeParseJson(resp);
        if (result.status !== 'success') { showNotification(result.message || '\u66f4\u65b0\u72b6\u6001\u5931\u8d25', 'error'); return; }
        await reloadAllTasks();
        showNotification(task.enabled ? '\u4efb\u52a1\u5df2\u505c\u7528' : '\u4efb\u52a1\u5df2\u542f\u7528', 'success');
    } catch (e) { showNotification(e.message || '\u66f4\u65b0\u72b6\u6001\u5931\u8d25', 'error'); }
    finally { showLoading(false); }
}

async function skipNextTask(taskId, projectId) {
    var targetProjectId = String(projectId || '').trim();
    if (!targetProjectId || !taskId) return;
    try {
        showLoading(true);
        var resp = await fetch('/api/projects/' + encodeURIComponent(targetProjectId) + '/report-schedules/' + encodeURIComponent(taskId) + '/skip-next', { method: 'POST' });
        var result = await safeParseJson(resp);
        if (result.status !== 'success') { showNotification(result.message || '\u8df3\u8fc7\u5931\u8d25', 'error'); return; }
        await reloadAllTasks();
        showNotification(result.message || '\u5df2\u8df3\u8fc7\u4e0b\u4e00\u6b21\u6267\u884c', 'success');
    } catch (e) { showNotification(e.message || '\u8df3\u8fc7\u5931\u8d25', 'error'); }
    finally { showLoading(false); }
}

async function deleteTask(taskId, projectId) {
    var targetProjectId = String(projectId || '').trim();
    if (!targetProjectId || !taskId) return;
    var confirmed = await new Promise(function(resolve) { showConfirmModal('\u5220\u9664\u4efb\u52a1', '\u786e\u8ba4\u5220\u9664\u8be5\u5b9a\u65f6\u4efb\u52a1\u5417\uff1f', function() { resolve(true); }, function() { resolve(false); }); });
    if (!confirmed) return;
    try {
        showLoading(true);
        var resp = await fetch('/api/projects/' + encodeURIComponent(targetProjectId) + '/report-schedules/' + encodeURIComponent(taskId), { method: 'DELETE' });
        var result = await safeParseJson(resp);
        if (result.status !== 'success') { showNotification(result.message || '\u5220\u9664\u5931\u8d25', 'error'); return; }
        await reloadAllTasks();
        showNotification('\u4efb\u52a1\u5df2\u5220\u9664', 'success');
    } catch (e) { showNotification(e.message || '\u5220\u9664\u5931\u8d25', 'error'); }
    finally { showLoading(false); }
}

async function batchEnableTasks() {
    var ids = selectedTaskIds();
    if (!ids.length) { showNotification('\u8bf7\u5148\u52fe\u9009\u4efb\u52a1', 'warning'); return; }
    try {
        showLoading(true);
        var selectedTasks = _allLoadedTasks.filter(function(t) { return ids.includes(String(t.task_id || '')); });
        var results = await Promise.all(selectedTasks.map(async function(task) {
            var pid = String(task.project_id || task._project_id || '');
            var resp = await fetch('/api/projects/' + encodeURIComponent(pid) + '/report-schedules/' + encodeURIComponent(task.task_id) + '/toggle', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true })
            });
            return (await safeParseJson(resp)).status === 'success';
        }));
        var ok = results.filter(Boolean).length;
        var fail = results.length - ok;
        await reloadAllTasks();
        showNotification(fail > 0 ? '\u6210\u529f\u542f\u7528 ' + ok + ' \u4e2a\uff0c' + fail + ' \u4e2a\u5931\u8d25' : '\u5df2\u542f\u7528 ' + ok + ' \u4e2a\u4efb\u52a1', fail > 0 ? 'warning' : 'success');
    } catch (e) { showNotification(e.message || '\u6279\u91cf\u542f\u7528\u5931\u8d25', 'error'); }
    finally { showLoading(false); }
}

async function batchDeleteTasks() {
    var ids = selectedTaskIds();
    if (!ids.length) { showNotification('\u8bf7\u5148\u52fe\u9009\u4efb\u52a1', 'warning'); return; }
    var confirmed = await new Promise(function(resolve) { showConfirmModal('\u6279\u91cf\u5220\u9664', '\u786e\u8ba4\u5220\u9664\u9009\u4e2d\u7684 ' + ids.length + ' \u4e2a\u4efb\u52a1\u5417\uff1f', function() { resolve(true); }, function() { resolve(false); }); });
    if (!confirmed) return;
    try {
        showLoading(true);
        var selectedTasks = _allLoadedTasks.filter(function(t) { return ids.includes(String(t.task_id || '')); });
        var results = await Promise.all(selectedTasks.map(async function(task) {
            var pid = String(task.project_id || task._project_id || '');
            var resp = await fetch('/api/projects/' + encodeURIComponent(pid) + '/report-schedules/' + encodeURIComponent(task.task_id), { method: 'DELETE' });
            return (await safeParseJson(resp)).status === 'success';
        }));
        var ok = results.filter(Boolean).length;
        var fail = results.length - ok;
        await reloadAllTasks();
        showNotification(fail > 0 ? '\u6210\u529f\u5220\u9664 ' + ok + ' \u4e2a\uff0c' + fail + ' \u4e2a\u5220\u9664\u5931\u8d25' : '\u5df2\u5220\u9664 ' + ok + ' \u4e2a\u4efb\u52a1', fail > 0 ? (fail === results.length ? 'error' : 'warning') : 'success');
    } catch (e) { showNotification(e.message || '\u6279\u91cf\u5220\u9664\u5931\u8d25', 'error'); }
    finally { showLoading(false); }
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
        var orgFilter = document.getElementById('scheduledOrgFilter');
        if (orgFilter) orgFilter.onchange = function() { refreshTaskListByCurrentFilters(); };
        var creatorFilter = document.getElementById('scheduledCreatorFilter');
        if (creatorFilter) creatorFilter.onchange = function() { refreshTaskListByCurrentFilters(); };
        var freqFilter = document.getElementById('scheduledFreqFilter');
        if (freqFilter) freqFilter.onchange = function() { refreshTaskListByCurrentFilters(); };
        await reloadAllTasks();
        var newTaskBtn = document.getElementById('scheduledTaskNewBtn');
        if (newTaskBtn) newTaskBtn.onclick = function() { openScheduledTaskEditorModal(''); };
        var editorProjectSelect = document.getElementById('scheduledEditorProjectSelect');
        if (editorProjectSelect) {
            editorProjectSelect.onchange = async function() {
                var selectedId = String(editorProjectSelect.value || '').trim();
                var projectIdInput = document.getElementById('scheduledEditorProjectId');
                if (projectIdInput) projectIdInput.value = selectedId;
                if (!selectedId) { _recipientOptions = []; renderRecipientUserList([], []); return; }
                await loadProjectRecipients(selectedId);
                renderRecipientUserList(_recipientOptions, []);
            };
        }
        var taskSelectAllBtn = document.getElementById('scheduledTaskSelectAllBtn');
        if (taskSelectAllBtn) {
            taskSelectAllBtn.onclick = function() {
                var sa = document.getElementById('scheduledTaskSelectAll');
                if (sa) { sa.checked = true; sa.dispatchEvent(new Event('change')); }
            };
        }
        var batchEnableBtn = document.getElementById('scheduledTaskBatchEnableBtn');
        if (batchEnableBtn) batchEnableBtn.onclick = batchEnableTasks;
        var batchDeleteBtn = document.getElementById('scheduledTaskBatchDeleteBtn');
        if (batchDeleteBtn) batchDeleteBtn.onclick = batchDeleteTasks;
        var allHistoryBtn = document.getElementById('scheduledAllHistoryBtn');
        if (allHistoryBtn) allHistoryBtn.onclick = openAllHistoryModal;
        var holidayBtn = document.getElementById('scheduledHolidayMgmtBtn');
        if (holidayBtn) holidayBtn.onclick = openHolidayModal;
        var modal = document.getElementById('scheduledReportModal');
        if (modal) { modal.classList.add('show'); modal.style.display = 'flex'; _restoreModalSize('scheduledReportModalSize', 'scheduledReportModal'); }
    } catch (e) {
        console.error('\u52a0\u8f7d\u5b9a\u65f6\u62a5\u544a\u4efb\u52a1\u5931\u8d25:', e);
        showNotification('\u52a0\u8f7d\u5b9a\u65f6\u62a5\u544a\u4efb\u52a1\u5931\u8d25', 'error');
    } finally { showLoading(false); }
}

export function closeScheduledReportModal() {
    _saveModalSize('scheduledReportModalSize', 'scheduledReportModal');
    var modal = document.getElementById('scheduledReportModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
    closeScheduledTaskEditorModal();
}

export async function saveScheduledReportConfig(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    var projectIdEl = document.getElementById('scheduledEditorProjectId');
    var projectId = (projectIdEl ? projectIdEl.value : '').trim();
    if (!projectId) { showNotification('\u8bf7\u5148\u9009\u62e9\u4efb\u52a1\u6240\u5c5e\u9879\u76ee', 'error'); return; }
    var payload = buildPayloadFromEditorForm();
    var editingTaskIdEl = document.getElementById('scheduledEditingTaskId');
    var editingId = (editingTaskIdEl ? editingTaskIdEl.value : '') || _editingTaskId;
    var isEdit = !!editingId;
    var runAfterSaveEl = document.getElementById('scheduledRunAfterSaveOnce');
    var runAfterSave = !isEdit && !!(runAfterSaveEl && runAfterSaveEl.checked);
    try {
        showLoading(true);
        var url = isEdit
            ? '/api/projects/' + encodeURIComponent(projectId) + '/report-schedules/' + encodeURIComponent(editingId)
            : '/api/projects/' + encodeURIComponent(projectId) + '/report-schedules';
        var method = isEdit ? 'PATCH' : 'POST';
        var resp = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        var result = await safeParseJson(resp);
        if (result.status !== 'success') { showNotification(result.message || '\u4fdd\u5b58\u5931\u8d25', 'error'); return; }
        var savedTaskId = String((result.data && result.data.task_id) || editingId || '').trim();
        if (!isEdit && savedTaskId) _pendingHighlightTaskId = savedTaskId;
        if (!isEdit) {
            var of2 = document.getElementById('scheduledOrgFilter');
            var cf2 = document.getElementById('scheduledCreatorFilter');
            if (of2) of2.value = '';
            if (cf2) cf2.value = '';
        }
        await reloadAllTasks();
        if (!isEdit && runAfterSave && savedTaskId) {
            var runResp = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/report-schedules/' + encodeURIComponent(savedTaskId) + '/run', { method: 'POST' });
            var runResult = await safeParseJson(runResp);
            if (runResult.status === 'success') showNotification('\u4efb\u52a1\u5df2\u521b\u5efa\u5e76\u7acb\u5373\u6267\u884c\u4e00\u6b21', 'success');
            else showNotification('\u4efb\u52a1\u5df2\u521b\u5efa\uff0c\u4f46\u7acb\u5373\u6267\u884c\u5931\u8d25\uff1a' + (runResult.message || '\u672a\u77e5\u9519\u8bef'), 'warning');
            await reloadAllTasks();
        }
        closeScheduledTaskEditorModal();
        if (!(runAfterSave && !isEdit)) showNotification(isEdit ? '\u4efb\u52a1\u5df2\u66f4\u65b0' : '\u4efb\u52a1\u5df2\u521b\u5efa', 'success');
    } catch (e) {
        console.error('\u4fdd\u5b58\u5b9a\u65f6\u4efb\u52a1\u5931\u8d25:', e);
        showNotification(e.message || '\u4fdd\u5b58\u5931\u8d25', 'error');
    } finally { showLoading(false); }
}

export async function runScheduledReportNow() {
    var taskIdEl = document.getElementById('scheduledEditingTaskId');
    var taskId = (taskIdEl ? taskIdEl.value : '') || _editingTaskId;
    var projectIdEl = document.getElementById('scheduledEditorProjectId');
    var projectId = ((projectIdEl ? projectIdEl.value : '') || '').trim() || _currentProjectId;
    if (!taskId) { showNotification('\u8bf7\u5148\u5728\u4efb\u52a1\u5217\u8868\u4e2d\u9009\u62e9\u4e00\u4e2a\u4efb\u52a1', 'warning'); return; }
    await runTaskNow(taskId, projectId);
}

export async function applyScheduledReportConfigToSelected() {
    showNotification('\u5df2\u5347\u7ea7\u4e3a\u201c\u4efb\u52a1\u5217\u8868\u7ba1\u7406\u6a21\u5f0f\u201d', 'info');
}

// ============== 发送历史 ==============
let _historyProjectId = '';
let _historyOffset = 0;
let _historyDays = 7;
const _historyLimit = 200;

function openScheduledTaskHistoryModal(taskId, projectId) {
    _historyProjectId = projectId || '';
    _historyOffset = 0;
    var task = _allLoadedTasks.find(function(x) { return String(x.task_id) === String(taskId); });
    var infoEl = document.getElementById('scheduledHistoryTaskInfo');
    if (infoEl) {
        var taskName = task ? (task.task_name || '\u672a\u547d\u540d') : taskId;
        var projectName = task ? (task._project_name || projectId) : projectId;
        infoEl.textContent = '\u9879\u76ee: ' + projectName + ' | \u4efb\u52a1: ' + taskName;
    }
    var daysFilter = document.getElementById('scheduledHistoryDaysFilter');
    if (daysFilter) daysFilter.value = '7';
    _historyDays = 7;
    var modal = document.getElementById('scheduledTaskHistoryModal');
    if (modal) { modal.classList.add('show'); modal.style.display = 'flex'; }
    loadScheduledHistory(false);
}

function openAllHistoryModal() {
    _historyProjectId = '';
    _historyOffset = 0;
    var infoEl = document.getElementById('scheduledHistoryTaskInfo');
    if (infoEl) infoEl.textContent = '\u5168\u90e8\u53d1\u9001\u8bb0\u5f55';
    var daysFilter = document.getElementById('scheduledHistoryDaysFilter');
    if (daysFilter) daysFilter.value = '3';
    _historyDays = 3;
    var modal = document.getElementById('scheduledTaskHistoryModal');
    if (modal) { modal.classList.add('show'); modal.style.display = 'flex'; }
    loadScheduledHistory(false);
}

window.applyHistoryDaysFilter = function() {
    var daysFilter = document.getElementById('scheduledHistoryDaysFilter');
    _historyDays = daysFilter ? Number(daysFilter.value) : 0;
    _historyOffset = 0;
    loadScheduledHistory(false);
};

function closeScheduledTaskHistoryModal() {
    var modal = document.getElementById('scheduledTaskHistoryModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
}
window.closeScheduledTaskHistoryModal = closeScheduledTaskHistoryModal;

async function loadScheduledHistory(append) {
    var tbody = document.getElementById('scheduledHistoryTableBody');
    if (!tbody) return;
    if (!append) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">\u52a0\u8f7d\u4e2d...</td></tr>';
    try {
        var query = 'limit=' + _historyLimit + '&offset=' + _historyOffset;
        if (_historyProjectId) query += '&project_id=' + encodeURIComponent(_historyProjectId);
        if (_historyDays > 0) query += '&days=' + _historyDays;
        var resp = await fetch('/api/projects/report-schedules/history?' + query, { cache: 'no-store' });
        var result = await safeParseJson(resp);
        if (result.status !== 'success') {
            if (!append) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#dc3545;">\u52a0\u8f7d\u5931\u8d25</td></tr>';
            return;
        }
        var totalEl = document.getElementById('scheduledHistoryTotal');
        if (totalEl) totalEl.textContent = '\u5171 ' + (result.total || 0) + ' \u6761';
        var logs = result.logs || [];
        if (logs.length === 0 && !append) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">\u6682\u65e0\u53d1\u9001\u8bb0\u5f55</td></tr>';
            return;
        }
        if (!append) tbody.innerHTML = '';
        var freqMap = { daily: '\u65e5\u62a5', weekly: '\u5468\u62a5', monthly: '\u6708\u62a5' };
        logs.forEach(function(log) {
            var tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            var tz = (appState.systemSettings && appState.systemSettings.timezone) || 'Asia/Shanghai';
            var displayTime = formatDateTimeDisplay(log.operation_time, tz);
            var displayStart = formatDateTimeDisplay(log.period_start, tz);
            var displayEnd = formatDateTimeDisplay(log.period_end, tz);
            var successColor = Number(log.success_count) >= Number(log.total) ? '#28a745' : '#dc3545';
            tr.innerHTML = '<td style="border:1px solid #e2e8f0; padding:6px; white-space:nowrap;">' + escapeHtml(displayTime) + '</td>' +
                '<td style="border:1px solid #e2e8f0; padding:6px;">' + escapeHtml(log.target_name || log.target_id || '-') + '</td>' +
                '<td style="border:1px solid #e2e8f0; padding:6px;">' + (freqMap[log.frequency] || escapeHtml(log.frequency)) + '</td>' +
                '<td style="border:1px solid #e2e8f0; padding:6px;">' + escapeHtml(log.trigger_type || '-') + '</td>' +
                '<td style="border:1px solid #e2e8f0; padding:6px; text-align:center;"><span style="color:' + successColor + ';">' + log.success_count + '/' + log.total + '</span></td>' +
                '<td style="border:1px solid #e2e8f0; padding:6px; font-size:11px;">' + escapeHtml(displayStart) + ' ~ ' + escapeHtml(displayEnd) + '</td>';
            tr.addEventListener('click', function() { showHistoryDetail(log, tz); });
            tr.addEventListener('mouseenter', function() { tr.style.background = '#f0f4ff'; });
            tr.addEventListener('mouseleave', function() { tr.style.background = ''; });
            tbody.appendChild(tr);
        });
        var loadMoreBtn = document.getElementById('scheduledHistoryLoadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = (_historyOffset + logs.length) < (result.total || 0) ? 'inline-block' : 'none';
        }
    } catch (e) {
        if (!append) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#dc3545;">' + escapeHtml(e.message || '\u52a0\u8f7d\u5931\u8d25') + '</td></tr>';
    }
}

window.loadMoreScheduledHistory = function() {
    _historyOffset += _historyLimit;
    loadScheduledHistory(true);
};

function showHistoryDetail(log, tz) {
    var freqMap = { daily: '日报', weekly: '周报', monthly: '月报' };
    var displayTime = formatDateTimeDisplay(log.operation_time, tz);
    var displayStart = formatDateTimeDisplay(log.period_start, tz);
    var displayEnd = formatDateTimeDisplay(log.period_end, tz);

    var emailList = '';
    var recipients = log.recipients || [];
    if (recipients.length > 0) {
        emailList = recipients.map(function(e) { return '<li style="padding:2px 0;">' + escapeHtml(typeof e === 'string' ? e : e.email || e) + '</li>'; }).join('');
    } else {
        emailList = '<li style="color:#999;">无</li>';
    }

    var siteList = '';
    var siteReceivers = log.site_receivers || [];
    if (siteReceivers.length > 0) {
        siteList = siteReceivers.map(function(r) {
            var name = r.display_name || r.username || ('用户#' + r.id);
            return '<li style="padding:2px 0;">' + escapeHtml(name) + ' <span style="color:#888;font-size:11px;">(ID: ' + r.id + ')</span></li>';
        }).join('');
    } else {
        siteList = '<li style="color:#999;">无</li>';
    }

    var emailStatus = log.email_enabled !== false ? ('成功 ' + (log.success_count || 0) + '/' + (log.total || 0)) : '未启用';
    var siteStatus = log.in_app_enabled !== false ? ('成功 ' + (log.site_sent_count || 0) + '/' + (log.site_total || 0)) : '未启用';

    var html = '<div style="padding:16px;font-size:13px;line-height:1.6;">' +
        '<h3 style="margin:0 0 12px 0;font-size:15px;">执行详情</h3>' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">' +
        '<tr><td style="padding:4px 8px;color:#666;width:80px;">执行时间</td><td style="padding:4px 8px;">' + escapeHtml(displayTime) + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#666;">项目</td><td style="padding:4px 8px;">' + escapeHtml(log.target_name || '-') + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#666;">类型</td><td style="padding:4px 8px;">' + (freqMap[log.frequency] || escapeHtml(log.frequency || '-')) + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#666;">触发方式</td><td style="padding:4px 8px;">' + escapeHtml(log.trigger_type || '-') + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#666;">统计区间</td><td style="padding:4px 8px;">' + escapeHtml(displayStart) + ' ~ ' + escapeHtml(displayEnd) + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#666;">邮件发送</td><td style="padding:4px 8px;">' + emailStatus + '</td></tr>' +
        '<tr><td style="padding:4px 8px;color:#666;">站内信</td><td style="padding:4px 8px;">' + siteStatus + '</td></tr>' +
        '</table>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><div style="font-weight:600;margin-bottom:4px;">邮件收件人 (' + recipients.length + ')</div><ul style="margin:0;padding-left:18px;max-height:150px;overflow:auto;">' + emailList + '</ul></div>' +
        '<div><div style="font-weight:600;margin-bottom:4px;">站内信收件人 (' + siteReceivers.length + ')</div><ul style="margin:0;padding-left:18px;max-height:150px;overflow:auto;">' + siteList + '</ul></div>' +
        '</div></div>';

    // 使用浮层展示详情
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:10100;display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.2);max-width:600px;width:90%;max-height:80vh;overflow:auto;position:relative;';
    box.innerHTML = '<div style="display:flex;justify-content:flex-end;padding:8px 12px 0;"><span style="cursor:pointer;font-size:20px;color:#666;" id="historyDetailClose">&times;</span></div>' + html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    box.querySelector('#historyDetailClose').addEventListener('click', function() { overlay.remove(); });
}

// ============================================================================
// 节假日数据管理
// ============================================================================
async function openHolidayModal() {
    var modal = document.getElementById('scheduledHolidayModal');
    if (!modal) return;
    modal.classList.add('show');
    modal.style.display = 'flex';
    // 填充年份选项
    var sel = document.getElementById('holidayUpdateYear');
    if (sel) {
        sel.innerHTML = '';
        var curYear = new Date().getFullYear();
        for (var y = curYear; y <= curYear + 2; y++) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y + '\u5e74';
            sel.appendChild(opt);
        }
    }
    document.getElementById('holidayUpdateResult').style.display = 'none';
    document.getElementById('holidayFetchStatus').textContent = '';
    await loadHolidayStatus();
}

function closeHolidayModal() {
    var modal = document.getElementById('scheduledHolidayModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
}
window.closeHolidayModal = closeHolidayModal;

async function loadHolidayStatus() {
    var area = document.getElementById('holidayStatusArea');
    if (!area) return;
    area.innerHTML = '<div style="font-size:12px; color:#999;">\u52a0\u8f7d\u4e2d...</div>';
    try {
        var resp = await fetch('/api/projects/report-schedules/holidays/status', { cache: 'no-store' });
        var result = await safeParseJson(resp);
        if (result.status !== 'success') {
            area.innerHTML = '<div style="color:#dc3545; font-size:13px;">\u52a0\u8f7d\u5931\u8d25</div>';
            return;
        }
        var data = result.data || {};
        var years = data.years || {};
        var html = '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
        html += '<thead><tr style="background:#f0fdf4;">';
        html += '<th style="border:1px solid #d1fae5; padding:5px;">年份</th>';
        html += '<th style="border:1px solid #d1fae5; padding:5px;">数据来源</th>';
        html += '<th style="border:1px solid #d1fae5; padding:5px;">假日数</th>';
        html += '<th style="border:1px solid #d1fae5; padding:5px;">调休数</th>';
        html += '</tr></thead><tbody>';
        var yearKeys = Object.keys(years).sort();
        if (yearKeys.length === 0) {
            html += '<tr><td colspan="4" style="text-align:center; padding:10px; color:#999;">暂无数据</td></tr>';
        }
        for (var i = 0; i < yearKeys.length; i++) {
            var yr = yearKeys[i];
            var info = years[yr];
            var srcLabel = info.source === 'builtin' ? '内置' : info.source === 'online' ? '在线' : '内置+在线';
            var srcColor = info.source === 'builtin' ? '#6b7280' : '#059669';
            html += '<tr>';
            html += '<td style="border:1px solid #e5e7eb; padding:5px; text-align:center;">' + yr + '</td>';
            html += '<td style="border:1px solid #e5e7eb; padding:5px; text-align:center; color:' + srcColor + ';">' + srcLabel + '</td>';
            html += '<td style="border:1px solid #e5e7eb; padding:5px; text-align:center;">' + (info.holidays || 0) + '</td>';
            html += '<td style="border:1px solid #e5e7eb; padding:5px; text-align:center;">' + (info.shifts || 0) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        if (data.cache_updated_at) {
            html += '<div style="font-size:11px; color:#999; margin-top:6px;">缓存更新时间: ' + data.cache_updated_at.replace('T', ' ').substring(0, 19) + '</div>';
        }
        area.innerHTML = html;
    } catch (e) {
        area.innerHTML = '<div style="color:#dc3545; font-size:13px;">加载异常: ' + e.message + '</div>';
    }
}

async function fetchHolidayData() {
    var sel = document.getElementById('holidayUpdateYear');
    var year = sel ? parseInt(sel.value) : new Date().getFullYear();
    var statusEl = document.getElementById('holidayFetchStatus');
    var resultEl = document.getElementById('holidayUpdateResult');
    var btn = document.getElementById('holidayFetchBtn');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = '\u6b63\u5728\u83b7\u53d6...';
    if (resultEl) resultEl.style.display = 'none';
    try {
        var resp = await fetch('/api/projects/report-schedules/holidays/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year: year }),
        });
        var result = await safeParseJson(resp);
        if (statusEl) statusEl.textContent = '';
        if (resultEl) {
            resultEl.style.display = 'block';
            if (result.status === 'success') {
                resultEl.style.background = '#f0fdf4';
                resultEl.style.color = '#065f46';
                resultEl.style.border = '1px solid #a7f3d0';
                resultEl.textContent = result.message || (year + '\u5e74\u6570\u636e\u5df2\u66f4\u65b0');
            } else {
                resultEl.style.background = '#fef2f2';
                resultEl.style.color = '#991b1b';
                resultEl.style.border = '1px solid #fecaca';
                resultEl.textContent = result.message || '\u83b7\u53d6\u5931\u8d25';
            }
        }
        await loadHolidayStatus();
    } catch (e) {
        if (statusEl) statusEl.textContent = '';
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.background = '#fef2f2';
            resultEl.style.color = '#991b1b';
            resultEl.style.border = '1px solid #fecaca';
            resultEl.textContent = '\u7f51\u7edc\u8bf7\u6c42\u5931\u8d25: ' + e.message;
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}
window.fetchHolidayData = fetchHolidayData;

if (typeof document !== 'undefined') {
    document.addEventListener('change', function(e) {
        var target = e.target;
        if (target && (target.name === 'scheduledFrequency' || target.name === 'scheduledTaskType')) toggleEditorFields();
    });
    window.openScheduledTaskEditorModal = openScheduledTaskEditorModal;
    window.closeScheduledTaskEditorModal = closeScheduledTaskEditorModal;
}
