/**
 * 管理员模块 - 用户管理、承建单位管理、项目管理
 */

import {
    updateUserRole, fetchAllProjects,
    batchDeleteProjects as apiBatchDeleteProjects,
    batchUpdateProjects as apiBatchUpdateProjects,
    batchUpdateProjectStatus as apiBatchUpdateProjectStatus,
    batchDeleteUsers as apiBatchDeleteUsers,
    batchUpdateUserRoles as apiBatchUpdateUserRoles,
    batchUpdateUserStatus as apiBatchUpdateUserStatus,
    batchDeleteOrganizations as apiBatchDeleteOrganizations,
    fetchAdminLogs
} from './api.js';
import { authState } from './auth.js';
import { showNotification, showConfirmModal, showInputModal } from './ui.js';

const roleMap = {
    'admin': '系统管理员',
    'pmo': '项目管理组织',
    'pmo_leader': 'PMO负责人',
    'project_admin': '项目经理',
    'contractor': '一般员工'
};

const statusMap = {
    'active': { label: '正常', color: '#28a745' },
    'inactive': { label: '已禁用', color: '#6c757d' },
    'pending': { label: '待审核', color: '#fd7e14' },
    'rejected': { label: '已拒绝', color: '#dc3545' }
};

const projectStatusMap = {
    'approved': { label: '正常', color: '#28a745' },
    'pending': { label: '待审批', color: '#fd7e14' },
    'disabled': { label: '已停用', color: '#6c757d' }
};

// ============== 用户管理 ==============
export function openUserManagementModal() {
    const modal = document.getElementById('userManagementModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
        loadUserManagementList();
    }
}

export function closeUserManagementModal() {
    const modal = document.getElementById('userManagementModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function loadUserManagementList() {
    const tbody = document.getElementById('userManagementTableBody');
    if (!tbody) return;

    const keywordInput = document.getElementById('userSearchInput');
    const statusFilter = document.getElementById('userStatusFilter');
    const keyword = keywordInput ? keywordInput.value.trim() : '';
    const status = statusFilter ? statusFilter.value : '';

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">加载中...</td></tr>';

    try {
        const url = `/api/admin/users?keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}`;
        const response = await fetch(url, {
            timeout: 10000 // 10秒超时
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const result = await response.json();

        if (result.status !== 'success' || !result.users) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#dc3545;">加载失败</td></tr>`;
            return;
        }

        if (result.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">暂无用户</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        result.users.forEach((user, index) => {
            const roleLabel = roleMap[user.role] || user.role;
            const statusInfo = statusMap[user.status] || { label: user.status, color: '#333' };
            const tr = document.createElement('tr');
            
            // 创建复选框列
            const checkboxTd = document.createElement('td');
            checkboxTd.style.padding = '8px';
            checkboxTd.style.borderBottom = '1px solid #eee';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'user-checkbox';
            checkbox.value = user.id;
            checkboxTd.appendChild(checkbox);
            tr.appendChild(checkboxTd);
            
            // 创建序号列
            const idTd = document.createElement('td');
            idTd.style.padding = '8px';
            idTd.style.borderBottom = '1px solid #eee';
            idTd.textContent = index + 1;
            tr.appendChild(idTd);
            
            // 创建用户名列
            const usernameTd = document.createElement('td');
            usernameTd.style.padding = '8px';
            usernameTd.style.borderBottom = '1px solid #eee';
            usernameTd.textContent = user.display_name ? `${user.username}（${user.display_name}）` : user.username;
            tr.appendChild(usernameTd);
            
            // 创建角色列
            const roleTd = document.createElement('td');
            roleTd.style.padding = '8px';
            roleTd.style.borderBottom = '1px solid #eee';
            roleTd.textContent = roleLabel;
            tr.appendChild(roleTd);
            
            // 创建组织列
            const orgTd = document.createElement('td');
            orgTd.style.padding = '8px';
            orgTd.style.borderBottom = '1px solid #eee';
            orgTd.textContent = user.organization || '-';
            tr.appendChild(orgTd);
            
            // 创建状态列
            const statusTd = document.createElement('td');
            statusTd.style.padding = '8px';
            statusTd.style.borderBottom = '1px solid #eee';
            const statusSpan = document.createElement('span');
            statusSpan.style.color = statusInfo.color;
            statusSpan.style.fontWeight = 'bold';
            statusSpan.textContent = statusInfo.label;
            statusTd.appendChild(statusSpan);
            tr.appendChild(statusTd);
            
            // 创建邮箱列
            const emailTd = document.createElement('td');
            emailTd.style.padding = '8px';
            emailTd.style.borderBottom = '1px solid #eee';
            emailTd.textContent = user.email || '-';
            tr.appendChild(emailTd);
            
            // 创建操作列
            const actionTd = document.createElement('td');
            actionTd.style.padding = '8px';
            actionTd.style.borderBottom = '1px solid #eee';
            actionTd.style.whiteSpace = 'nowrap';
            
            // 创建角色选择器
            const roleSelect = document.createElement('select');
            roleSelect.className = 'role-select';
            roleSelect.dataset.id = user.id;
            roleSelect.style.marginRight = '4px';
            roleSelect.style.padding = '4px 6px';
            roleSelect.style.fontSize = '12px';
            roleSelect.style.borderRadius = '4px';
            roleSelect.style.border = '1px solid #ccc';

            const isProjectAdmin = authState.user?.role === 'project_admin';
            const isPmoLeader = authState.user?.role === 'pmo_leader';
            const roles = isProjectAdmin
                ? [
                    { value: 'project_admin', label: '项目经理' },
                    { value: 'contractor', label: '一般员工' }
                ]
                : isPmoLeader
                ? [
                    { value: 'pmo', label: '项目管理组织' },
                    { value: 'pmo_leader', label: 'PMO负责人' }
                ]
                : [
                    { value: 'admin', label: '系统管理员' },
                    { value: 'pmo', label: '项目管理组织' },
                    { value: 'pmo_leader', label: 'PMO负责人' },
                    { value: 'project_admin', label: '项目经理' },
                    { value: 'contractor', label: '一般员工' }
                ];
            
            roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role.value;
                option.textContent = role.label;
                if (user.role === role.value) {
                    option.selected = true;
                }
                roleSelect.appendChild(option);
            });
            
            actionTd.appendChild(roleSelect);
            
            // 创建重置密码按钮
            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn btn-sm btn-warning';
            resetBtn.style.marginRight = '4px';
            resetBtn.style.padding = '4px 8px';
            resetBtn.style.fontSize = '12px';
            resetBtn.textContent = '重置密码';
            actionTd.appendChild(resetBtn);
            
            // 创建启用/禁用按钮
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn btn-sm btn-info';
            toggleBtn.style.marginRight = '4px';
            toggleBtn.style.padding = '4px 8px';
            toggleBtn.style.fontSize = '12px';
            toggleBtn.textContent = user.status === 'active' ? '禁用' : '启用';
            actionTd.appendChild(toggleBtn);
            
            // 创建删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.style.padding = '4px 8px';
            deleteBtn.style.fontSize = '12px';
            deleteBtn.textContent = '删除';
            actionTd.appendChild(deleteBtn);
            
            tr.appendChild(actionTd);
            
            // 添加事件监听器
            roleSelect.addEventListener('change', async () => {
                const newRole = roleSelect.value;
                const result = await updateUserRole(user.id, newRole);
                showNotification(result.message || (result.status === 'success' ? '更新成功' : '更新失败'), result.status === 'success' ? 'success' : 'error');
                if (result.status === 'success') loadUserManagementList();
            });
            
            resetBtn.addEventListener('click', () => resetUserPassword(user.id));
            const resetApprovalBtn = document.createElement('button');
            resetApprovalBtn.className = 'btn btn-sm btn-secondary';
            resetApprovalBtn.style.marginRight = '4px';
            resetApprovalBtn.style.padding = '4px 8px';
            resetApprovalBtn.style.fontSize = '12px';
            resetApprovalBtn.textContent = '重置审批码';
            actionTd.appendChild(resetApprovalBtn);

            resetApprovalBtn.addEventListener('click', () => resetUserApprovalCode(user.id));
            toggleBtn.addEventListener('click', () => toggleUserStatus(user.id));
            deleteBtn.addEventListener('click', () => {
                showConfirmModal('删除用户', `确定删除用户"${user.username}"？此操作将永久删除该用户的所有数据，且不可恢复。`, () => {
                    deleteUser(user.id);
                });
            });
            
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('加载用户列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#dc3545;">加载失败，请稍后重试</td></tr>`;
    }
}

export function toggleSelectAllUsers() {
    const checked = document.getElementById('userSelectAll')?.checked || false;
    document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = checked);
}

function getSelectedUserIds() {
    return Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => parseInt(cb.value));
}

export async function batchUpdateUserRoles() {
    const userIds = getSelectedUserIds();
    const newRole = document.getElementById('userBatchRole')?.value;
    if (!userIds.length) { showNotification('请选择用户', 'warning'); return; }
    if (!newRole) { showNotification('请选择角色', 'warning'); return; }
    showConfirmModal('批量修改角色', `确定将选中的 ${userIds.length} 个用户角色修改为 ${roleMap[newRole] || newRole} 吗？`, async () => {
        const result = await apiBatchUpdateUserRoles(userIds, newRole);
        showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadUserManagementList();
    });
}

export async function batchUpdateUserStatus(newStatus) {
    const userIds = getSelectedUserIds();
    if (!userIds.length) { showNotification('请选择用户', 'warning'); return; }
    const actionName = newStatus === 'active' ? '启用' : '禁用';
    showConfirmModal('批量操作', `确定${actionName}选中的 ${userIds.length} 个用户吗？`, async () => {
        const result = await apiBatchUpdateUserStatus(userIds, newStatus);
        showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadUserManagementList();
    });
}

export async function batchDeleteUsers() {
    const userIds = getSelectedUserIds();
    if (!userIds.length) { showNotification('请选择用户', 'warning'); return; }
    showConfirmModal('批量删除用户', `确定删除选中的 ${userIds.length} 个用户吗？此操作不可恢复！`, async () => {
        const result = await apiBatchDeleteUsers(userIds);
        showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadUserManagementList();
    });
}

export async function resetUserPassword(userId) {
    showInputModal('重置密码', [
        { label: '新密码（至少6位）', key: 'password', placeholder: '请输入新密码', type: 'password' }
    ], async (values) => {
        if (!values) return;
        const pwd = values.password;
        if (!pwd || pwd.length < 6) {
            showNotification('密码长度不能少于6位', 'warning');
            return;
        }
        try {
            const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_password: pwd })
            });
            const result = await response.json();
            showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        } catch (error) {
            console.error('重置密码失败:', error);
            showNotification('重置密码失败，请稍后重试', 'error');
        }
    });
}

export async function resetUserApprovalCode(userId) {
    showConfirmModal('重置审批安全码', '确定要将该用户的审批安全码重置为登录密码，并要求其首次使用时修改吗？', async () => {
        try {
            const response = await fetch(`/api/admin/users/${userId}/reset-approval-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        } catch (error) {
            console.error('重置审批安全码失败:', error);
            showNotification('重置审批安全码失败，请稍后重试', 'error');
        }
    });
}

export async function toggleUserStatus(userId) {
    try {
        const response = await fetch(`/api/admin/users/${userId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadUserManagementList();
    } catch (error) {
        console.error('切换用户状态失败:', error);
        showNotification('操作失败，请稍后重试', 'error');
    }
}

export async function deleteUser(userId) {
    showConfirmModal('删除用户', '确定删除该用户？此操作不可恢复。', async () => {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
            const result = await response.json();
            showNotification(result.message || (result.status === 'success' ? '删除成功' : '删除失败'), result.status === 'success' ? 'success' : 'error');
            if (result.status === 'success') loadUserManagementList();
        } catch (error) {
            console.error('删除用户失败:', error);
            showNotification('删除失败，请稍后重试', 'error');
        }
    });
}

// ============== 承建单位管理 ==============
export function openOrgManagementModal() {
    const modal = document.getElementById('orgManagementModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
        loadOrgManagementList();
    }
}

export function closeOrgManagementModal() {
    const modal = document.getElementById('orgManagementModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function loadOrgManagementList() {
    const tbody = document.getElementById('orgManagementTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">加载中...</td></tr>';

    try {
        const response = await fetch('/api/admin/organizations');
        const result = await response.json();

        if (result.status !== 'success' || !result.organizations) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#dc3545;">加载失败</td></tr>`;
            return;
        }

        if (result.organizations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">暂无承建单位</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        result.organizations.forEach(org => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:8px;border-bottom:1px solid #eee;"><input type="checkbox" class="org-checkbox" value="${org.name}"></td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${org.name}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${org.admin_name || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${org.user_count || 0}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;white-space:nowrap;">
                    <button class="btn btn-sm btn-primary" style="margin-right:4px;padding:4px 8px;font-size:12px;">编辑</button>
                    <button class="btn btn-sm btn-danger" style="padding:4px 8px;font-size:12px;">删除</button>
                </td>
            `;
            const buttons = tr.querySelectorAll('button');
            buttons[0].addEventListener('click', () => openOrgEditModal(org));
            buttons[1].addEventListener('click', () => deleteOrganization(org.name));
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('加载承建单位列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#dc3545;">加载失败，请稍后重试</td></tr>`;
    }
}

export function toggleSelectAllOrgs() {
    const checked = document.getElementById('orgSelectAll')?.checked || false;
    document.querySelectorAll('.org-checkbox').forEach(cb => cb.checked = checked);
}

function getSelectedOrgNames() {
    return Array.from(document.querySelectorAll('.org-checkbox:checked')).map(cb => cb.value);
}

export async function batchDeleteOrganizations() {
    const names = getSelectedOrgNames();
    if (!names.length) { showNotification('请选择承建单位', 'warning'); return; }
    showConfirmModal('批量删除承建单位', `确定删除选中的 ${names.length} 个承建单位吗？`, async () => {
        const result = await apiBatchDeleteOrganizations(names);
        let msg = result.message || (result.status === 'success' ? '操作成功' : '操作失败');
        if (result.failed && result.failed.length) {
            msg += '\n失败: ' + result.failed.map(f => `${f.name}(${f.message})`).join(', ');
        }
        showNotification(msg, result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadOrgManagementList();
    });
}

export async function openOrgEditModal(org = null) {
    const modal = document.getElementById('orgEditModal');
    const title = document.getElementById('orgEditModalTitle');
    const oldNameInput = document.getElementById('orgEditOldName');
    const nameInput = document.getElementById('orgEditName');
    const adminSelect = document.getElementById('orgEditAdmin');

    if (!modal || !title || !nameInput || !adminSelect) return;

    adminSelect.innerHTML = '<option value="">暂无</option>';
    try {
        const response = await fetch('/api/admin/users?keyword=&status=active');
        const result = await response.json();
        if (result.status === 'success' && result.users) {
            result.users
                .filter(u => u.role === 'project_admin')
                .forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.id;
                    option.textContent = `${u.username} (${u.organization || '无单位'})`;
                    adminSelect.appendChild(option);
                });
        }
    } catch (error) {
        console.error('加载项目经理列表失败:', error);
    }

    if (org) {
        title.textContent = '编辑承建单位';
        if (oldNameInput) oldNameInput.value = org.name;
        nameInput.value = org.name;
        adminSelect.value = org.admin_id || '';
    } else {
        title.textContent = '新建承建单位';
        if (oldNameInput) oldNameInput.value = '';
        nameInput.value = '';
        adminSelect.value = '';
    }

    modal.classList.add('show');
    modal.style.display = 'block';
}

export function closeOrgEditModal() {
    const modal = document.getElementById('orgEditModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function saveOrganization() {
    const oldNameInput = document.getElementById('orgEditOldName');
    const nameInput = document.getElementById('orgEditName');
    const adminSelect = document.getElementById('orgEditAdmin');
    if (!nameInput) return;
    const oldName = oldNameInput ? oldNameInput.value.trim() : '';
    const newName = nameInput.value.trim();
    const adminId = adminSelect ? adminSelect.value : '';
    if (!newName) { showNotification('请输入承建单位名称', 'warning'); return; }
    try {
        let response;
        if (oldName) {
            response = await fetch('/api/admin/organizations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_name: oldName, new_name: newName, admin_id: adminId || null })
            });
        } else {
            response = await fetch('/api/admin/organizations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
        }
        const result = await response.json();
        showNotification(result.message || (result.status === 'success' ? '保存成功' : '保存失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') {
            closeOrgEditModal();
            loadOrgManagementList();
        }
    } catch (error) {
        console.error('保存承建单位失败:', error);
        showNotification('保存失败，请稍后重试', 'error');
    }
}

export async function deleteOrganization(name) {
    showConfirmModal('删除承建单位', '确定删除该承建单位？', async () => {
        try {
            const response = await fetch(`/api/admin/organizations?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
            const result = await response.json();
            showNotification(result.message || (result.status === 'success' ? '删除成功' : '删除失败'), result.status === 'success' ? 'success' : 'error');
            if (result.status === 'success') loadOrgManagementList();
        } catch (error) {
            console.error('删除承建单位失败:', error);
            showNotification('删除失败，请稍后重试', 'error');
        }
    });
}

// ============== 项目管理 ==============
let projectMgmtCache = [];
let currentBatchTransferProjectIds = [];

export function openProjectManagementModal() {
    const modal = document.getElementById('projectManagementModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
        loadProjectManagementList();
    }
}

export function closeProjectManagementModal() {
    const modal = document.getElementById('projectManagementModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function loadProjectManagementList() {
    const tbody = document.getElementById('projectManagementTableBody');
    const batchSelect = document.getElementById('projectBatchPartyB');
    if (!tbody) return;

    const keyword = (document.getElementById('projectMgmtSearch')?.value || '').trim();
    const statusFilter = document.getElementById('projectMgmtStatusFilter')?.value || '';

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">加载中...</td></tr>';

    try {
        const [projResult, orgResult] = await Promise.all([
            fetchAllProjects(),
            fetch('/organizations').then(r => r.json())
        ]);

        const isAdmin = authState.user?.role === 'admin';
        const isBusinessAdmin = authState.user?.role === 'admin' || authState.user?.role === 'pmo';
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });
        document.querySelectorAll('.business-admin-only').forEach(el => {
            el.style.display = isBusinessAdmin ? '' : 'none';
        });

        // 填充批量修改单位下拉框
        if (batchSelect) {
            batchSelect.innerHTML = '<option value="">批量修改单位</option>';
            if (orgResult.status === 'success' && Array.isArray(orgResult.organizations)) {
                orgResult.organizations.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    batchSelect.appendChild(opt);
                });
            }
        }

        if (projResult.status !== 'success' || !projResult.projects) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#dc3545;">加载失败</td></tr>`;
            return;
        }

        let projects = projResult.projects;
        if (keyword) {
            projects = projects.filter(p => (p.name || '').toLowerCase().includes(keyword.toLowerCase()));
        }
        if (statusFilter) {
            projects = projects.filter(p => (p.status || 'approved') === statusFilter);
        }

        projectMgmtCache = projects;

        if (projects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">暂无项目</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        projects.forEach((project, index) => {
            const statusInfo = projectStatusMap[project.status || 'approved'] || { label: project.status || '正常', color: '#333' };
            const tr = document.createElement('tr');
            const deleteButtonHtml = isBusinessAdmin ? `<button class="btn btn-sm btn-warning" style="padding:4px 8px;font-size:12px;" onclick="deleteSingleProject('${project.id}')">删除</button>` : '';
            tr.innerHTML = `
                <td style="padding:8px;border-bottom:1px solid #eee;"><input type="checkbox" class="project-checkbox" value="${project.id}"></td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${index + 1}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${project.name || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${project.party_b || 'PMO'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">
                    <span style="color:${statusInfo.color};font-weight:bold;">${statusInfo.label}</span>
                </td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${project.creator_username || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;white-space:nowrap;">
                    <button class="btn btn-sm btn-primary" style="margin-right:4px;padding:4px 8px;font-size:12px;" onclick="openProjectTransferFromMgmt('${project.id}')">移交</button>
                    ${deleteButtonHtml}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('加载项目列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#dc3545;">加载失败，请稍后重试</td></tr>`;
    }
}

export function toggleSelectAllProjects() {
    const checked = document.getElementById('projectSelectAll')?.checked || false;
    document.querySelectorAll('.project-checkbox').forEach(cb => cb.checked = checked);
}

function getSelectedProjectIds() {
    return Array.from(document.querySelectorAll('.project-checkbox:checked')).map(cb => cb.value);
}

export async function batchDeleteProjects() {
    const ids = getSelectedProjectIds();
    if (!ids.length) { showNotification('请选择项目', 'warning'); return; }
    showConfirmModal('批量删除项目', `确定删除选中的 ${ids.length} 个项目吗？此操作不可恢复！`, async () => {
        const result = await apiBatchDeleteProjects(ids);
        showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadProjectManagementList();
    });
}

export async function batchUpdateProjectPartyB() {
    const ids = getSelectedProjectIds();
    const partyB = document.getElementById('projectBatchPartyB')?.value;
    if (!ids.length) { showNotification('请选择项目', 'warning'); return; }
    if (!partyB) { showNotification('请选择目标承建单位', 'warning'); return; }
    showConfirmModal('批量修改承建单位', `确定将选中的 ${ids.length} 个项目承建单位修改为 "${partyB}" 吗？`, async () => {
        const result = await apiBatchUpdateProjects(ids, { party_b: partyB });
        showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadProjectManagementList();
    });
}

export async function batchUpdateProjectStatus(status) {
    const ids = getSelectedProjectIds();
    if (!ids.length) { showNotification('请选择项目', 'warning'); return; }
    const actionName = status === 'approved' ? '启用' : '停用';
    showConfirmModal('批量操作', `确定${actionName}选中的 ${ids.length} 个项目吗？`, async () => {
        const result = await apiBatchUpdateProjectStatus(ids, status);
        showNotification(result.message || (result.status === 'success' ? '操作成功' : '操作失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadProjectManagementList();
    });
}

export function openProjectTransferFromMgmt(projectId) {
    const ids = projectId ? [projectId] : getSelectedProjectIds();
    if (!ids.length) { showNotification('请选择项目', 'warning'); return; }
    currentBatchTransferProjectIds = ids;
    document.getElementById('batchTransferProjectCount').value = ids.length;
    const select = document.getElementById('batchTransferToOrg');
    select.innerHTML = '<option value="">-- 请选择 --</option>';
    fetch('/organizations')
        .then(r => r.json())
        .then(data => {
            if (data.status === 'success' && Array.isArray(data.organizations)) {
                data.organizations.forEach(name => {
                    if (name === 'PMO') return;
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    select.appendChild(opt);
                });
            }
        });
    const modal = document.getElementById('projectBatchTransferModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
}

export function closeProjectBatchTransferModal() {
    const modal = document.getElementById('projectBatchTransferModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function submitProjectBatchTransfer() {
    const toOrg = document.getElementById('batchTransferToOrg').value;
    if (!toOrg) { showNotification('请选择目标承建单位', 'warning'); return; }

    const ids = currentBatchTransferProjectIds;
    if (!ids.length) { showNotification('未选择项目', 'warning'); return; }

    let success = 0, failed = 0;
    for (const projectId of ids) {
        try {
            const response = await fetch(`/api/projects/${projectId}/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_org: toOrg })
            });
            const result = await response.json();
            if (result.status === 'success') success++;
            else failed++;
        } catch (e) {
            failed++;
        }
    }
    showNotification(`移交完成：成功 ${success} 个，失败 ${failed} 个`, failed === 0 ? 'success' : 'warning');
    closeProjectBatchTransferModal();
    loadProjectManagementList();
}

export async function deleteSingleProject(projectId) {
    showConfirmModal('删除项目', '确定删除该项目？此操作不可恢复。', async () => {
        const result = await apiBatchDeleteProjects([projectId]);
        showNotification(result.message || (result.status === 'success' ? '删除成功' : '删除失败'), result.status === 'success' ? 'success' : 'error');
        if (result.status === 'success') loadProjectManagementList();
    });
}

// ============== 日志管理 ==============
let logMgmtOffset = 0;
const logMgmtLimit = 50;

export function openLogManagementModal() {
    const modal = document.getElementById('logManagementModal');
    if (modal) {
        // 根据角色调整UI
        const isContractor = authState.user?.role === 'contractor';
        const usernameFilterWrap = document.getElementById('logUsernameFilter')?.parentElement;
        if (usernameFilterWrap && isContractor) {
            document.getElementById('logUsernameFilter').value = authState.user?.username || '';
            document.getElementById('logUsernameFilter').disabled = true;
        } else if (document.getElementById('logUsernameFilter')) {
            document.getElementById('logUsernameFilter').disabled = false;
        }
        modal.classList.add('show');
        modal.style.display = 'block';
        logMgmtOffset = 0;
        loadLogManagementList();
    }
}

export function closeLogManagementModal() {
    const modal = document.getElementById('logManagementModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export async function loadLogManagementList(append = false) {
    const tbody = document.getElementById('logManagementTableBody');
    const totalEl = document.getElementById('logManagementTotal');
    if (!tbody) return;

    const typeFilter = document.getElementById('logTypeFilter')?.value || '';
    let usernameFilter = document.getElementById('logUsernameFilter')?.value.trim() || '';
    if (authState.user?.role === 'contractor') {
        usernameFilter = authState.user?.username || '';
    }

    if (!append) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">加载中...</td></tr>';
    }

    try {
        const result = await fetchAdminLogs({
            limit: logMgmtLimit,
            offset: logMgmtOffset,
            type: typeFilter || undefined,
            username: usernameFilter || undefined
        });

        if (result.status !== 'success' || !result.logs) {
            if (!append) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#dc3545;">加载失败</td></tr>`;
            }
            return;
        }

        if (totalEl) totalEl.textContent = `共 ${result.total || 0} 条`;

        if (result.logs.length === 0 && !append) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">暂无日志</td></tr>';
            return;
        }

        if (!append) tbody.innerHTML = '';

        result.logs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:8px;border-bottom:1px solid #eee;white-space:nowrap;">${log.operation_time || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${log.username || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${log.operation_type || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${log.details || ''}">${log.details || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${log.target_name || log.target_id || '-'}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;">${log.ip_address || '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        const loadMoreBtn = document.getElementById('logLoadMoreBtn');
        if (loadMoreBtn) {
            const hasMore = (logMgmtOffset + result.logs.length) < (result.total || 0);
            loadMoreBtn.style.display = hasMore ? 'inline-block' : 'none';
        }
    } catch (error) {
        console.error('加载日志列表失败:', error);
        if (!append) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#dc3545;">加载失败，请稍后重试</td></tr>`;
        }
    }
}

export function loadMoreLogs() {
    logMgmtOffset += logMgmtLimit;
    loadLogManagementList(true);
}
