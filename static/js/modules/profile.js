/**
 * 用户自助资料管理模块
 * static/js/modules/profile.js
 */

let forcePasswordChangeRequired = false;
let forcePasswordChangeMessage = '';

export function setForcePasswordChangeRequired(required, message = '') {
    forcePasswordChangeRequired = !!required;
    forcePasswordChangeMessage = message || '密码已过期，请先修改密码后再继续';
}

function showProfileNotice(message, type = 'info') {
    const div = document.createElement('div');
    div.textContent = message;
    div.style.position = 'fixed';
    div.style.top = '20px';
    div.style.right = '20px';
    div.style.zIndex = '9999';
    div.style.padding = '12px 20px';
    div.style.borderRadius = '4px';
    div.style.color = '#fff';
    div.style.background = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
    div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    document.body.appendChild(div);
    setTimeout(() => {
        div.remove();
    }, 3000);
}

export async function openProfileModal() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.classList.add('show');
    modal.style.display = 'block';

    // 清空密码与注销确认输入框
    const profileOldPassword = document.getElementById('profileOldPassword');
    const profileNewPassword = document.getElementById('profileNewPassword');
    const profileConfirmPassword = document.getElementById('profileConfirmPassword');
    const profileDeactivateConfirm = document.getElementById('profileDeactivateConfirm');
    const profileCurrentApprovalCode = document.getElementById('profileCurrentApprovalCode');
    const profileNewApprovalCode = document.getElementById('profileNewApprovalCode');
    const profileConfirmApprovalCode = document.getElementById('profileConfirmApprovalCode');
    if (profileOldPassword) profileOldPassword.value = '';
    if (profileNewPassword) profileNewPassword.value = '';
    if (profileConfirmPassword) profileConfirmPassword.value = '';
    if (profileDeactivateConfirm) profileDeactivateConfirm.value = '';
    if (profileCurrentApprovalCode) profileCurrentApprovalCode.value = '';
    if (profileNewApprovalCode) profileNewApprovalCode.value = '';
    if (profileConfirmApprovalCode) profileConfirmApprovalCode.value = '';

    // 切换到基本信息标签页
    switchProfileTab(forcePasswordChangeRequired ? 'profile-password' : 'profile-basic');

    if (forcePasswordChangeRequired) {
        showProfileNotice(forcePasswordChangeMessage, 'error');
    }

    try {
        const resp = await fetch('/api/me');
        const data = await resp.json();
        if (data.status === 'success' && data.user) {
            const u = data.user;
            const profileUsername = document.getElementById('profileUsername');
            const profileRole = document.getElementById('profileRole');
            const profileOrg = document.getElementById('profileOrg');
            const profileEmail = document.getElementById('profileEmail');
            if (profileUsername) profileUsername.value = u.username || '';
            if (profileRole) {
                const roleMap = { 'admin': '系统管理员', 'pmo': '项目管理组织', 'project_admin': '项目经理', 'contractor': '一般员工' };
                profileRole.value = roleMap[u.role] || u.role || '';
            }
            if (profileOrg) profileOrg.value = u.organization || '';
            if (profileEmail) profileEmail.value = u.email || '';
        } else {
            showProfileNotice(data.message || '获取用户信息失败', 'error');
        }
    } catch (err) {
        showProfileNotice('网络错误，无法获取用户信息', 'error');
    }
}

export function closeProfileModal() {
    if (forcePasswordChangeRequired) {
        showProfileNotice(forcePasswordChangeMessage || '请先修改密码', 'error');
        return;
    }
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

export function switchProfileTab(tabId) {
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    if (forcePasswordChangeRequired && tabId !== 'profile-password') {
        showProfileNotice(forcePasswordChangeMessage || '请先修改密码', 'error');
        return;
    }

    // 切换按钮 active 状态
    modal.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // 切换内容面板 active 状态及显示
    modal.querySelectorAll('.settings-tab-content').forEach(content => {
        const isTarget = content.id === 'profileTab-' + tabId;
        content.classList.toggle('active', isTarget);
        content.style.display = isTarget ? 'block' : 'none';
    });
}

export async function saveProfileEmail() {
    const emailInput = document.getElementById('profileEmail');
    const email = emailInput ? emailInput.value.trim() : ''; // allow empty

    try {
        const resp = await fetch('/api/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await resp.json();
        if (data.status === 'success') {
            showProfileNotice(data.message || '邮箱更新成功', 'success');
            closeProfileModal();
        } else {
            showProfileNotice(data.message || '邮箱更新失败', 'error');
        }
    } catch (err) {
        showProfileNotice('网络错误，请稍后再试', 'error');
    }
}

export async function changeProfilePassword() {
    const oldInput = document.getElementById('profileOldPassword');
    const newInput = document.getElementById('profileNewPassword');
    const confirmInput = document.getElementById('profileConfirmPassword');

    const old_password = oldInput ? oldInput.value : '';
    const new_password = newInput ? newInput.value : '';
    const confirm_password = confirmInput ? confirmInput.value : '';

    if (!old_password || !new_password || !confirm_password) {
        showProfileNotice('请填写所有密码字段', 'error');
        return;
    }

    if (new_password.length < 6) {
        showProfileNotice('新密码长度不能少于6位', 'error');
        return;
    }

    if (new_password !== confirm_password) {
        showProfileNotice('两次输入的新密码不一致', 'error');
        return;
    }

    try {
        const resp = await fetch('/api/me/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password, new_password })
        });
        const data = await resp.json();
        if (data.status === 'success') {
            showProfileNotice(data.message || '密码修改成功', 'success');
            setForcePasswordChangeRequired(false);
            if (oldInput) oldInput.value = '';
            if (newInput) newInput.value = '';
            if (confirmInput) confirmInput.value = '';
            closeProfileModal();
        } else {
            showProfileNotice(data.message || '密码修改失败', 'error');
        }
    } catch (err) {
        showProfileNotice('网络错误，请稍后再试', 'error');
    }
}

export async function changeApprovalCode() {
    const currentInput = document.getElementById('profileCurrentApprovalCode');
    const newInput = document.getElementById('profileNewApprovalCode');
    const confirmInput = document.getElementById('profileConfirmApprovalCode');

    const current_code = currentInput ? currentInput.value : '';
    const new_code = newInput ? newInput.value : '';
    const confirm_code = confirmInput ? confirmInput.value : '';

    if (!current_code || !new_code || !confirm_code) {
        showProfileNotice('请填写所有字段', 'error');
        return;
    }

    if (new_code.length < 8) {
        showProfileNotice('新审批安全码长度不能少于8位', 'error');
        return;
    }

    const hasLetter = /[a-zA-Z]/.test(new_code);
    const hasDigit = /[0-9]/.test(new_code);
    if (!hasLetter || !hasDigit) {
        showProfileNotice('新审批安全码需同时包含字母和数字', 'error');
        return;
    }

    if (new_code !== confirm_code) {
        showProfileNotice('两次输入的新审批安全码不一致', 'error');
        return;
    }

    try {
        const resp = await fetch('/api/me/approval-code/change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_code, new_code })
        });
        const data = await resp.json();
        if (data.status === 'success') {
            showProfileNotice(data.message || '审批安全码修改成功', 'success');
            if (currentInput) currentInput.value = '';
            if (newInput) newInput.value = '';
            if (confirmInput) confirmInput.value = '';
            closeProfileModal();
        } else {
            showProfileNotice(data.message || '修改失败', 'error');
        }
    } catch (err) {
        showProfileNotice('网络错误，请稍后再试', 'error');
    }
}

export async function deactivateAccount() {
    const confirmInput = document.getElementById('profileDeactivateConfirm');
    if (!confirmInput || confirmInput.value !== '注销账号') {
        showProfileNotice('请输入确认文字', 'warning');
        return;
    }

    try {
        const resp = await fetch('/api/me/deactivate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await resp.json();
        if (data.status === 'success') {
            showProfileNotice(data.message || '账号已注销', 'success');
            window.location.href = '/login';
        } else {
            showProfileNotice(data.message || '注销失败', 'error');
        }
    } catch (err) {
        showProfileNotice('网络错误，请稍后再试', 'error');
    }
}
