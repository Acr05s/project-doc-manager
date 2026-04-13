/**
 * 认证模块
 */

// 认证状态：null 表示尚未确定
export let authState = {
    isAuthenticated: null,
    user: null,
    needsApproval: false
};

let authResolveCallback = null;

/**
 * 检查用户是否已登录
 */
export async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const result = await response.json();

        if (result.status === 'success' && result.user) {
            authState.isAuthenticated = true;
            authState.user = result.user;
            authState.needsApproval = result.user.status === 'pending';
            updateAuthUI();
            updateRoleBasedUI();
            return true;
        } else {
            authState.isAuthenticated = false;
            authState.user = null;
            authState.needsApproval = false;
            updateAuthUI();
            updateRoleBasedUI();
            return false;
        }
    } catch (error) {
        console.error('检查认证状态失败:', error);
        authState.isAuthenticated = false;
        authState.user = null;
        authState.needsApproval = false;
        updateAuthUI();
        updateRoleBasedUI();
        return false;
    }
}

/**
 * 登录
 */
export async function login(username, password) {
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (result.status === 'success') {
            authState.isAuthenticated = true;
            authState.user = result.user;
            authState.needsApproval = !!result.needs_approval;
            updateAuthUI();
            updateRoleBasedUI();
            if (authResolveCallback) {
                authResolveCallback();
                authResolveCallback = null;
            }
            return { success: true, message: result.message, needsApproval: !!result.needs_approval };
        } else {
            return { success: false, message: result.message };
        }
    } catch (error) {
        console.error('登录失败:', error);
        return { success: false, message: '登录失败，请稍后重试' };
    }
}

/**
 * 注销
 */
export async function logout() {
    try {
        const response = await fetch('/logout');
        const result = await response.json();
        
        authState.isAuthenticated = false;
        authState.user = null;
        updateAuthUI();
        updateRoleBasedUI();
        return { success: true, message: result.message };
    } catch (error) {
        console.error('注销失败:', error);
        authState.isAuthenticated = false;
        authState.user = null;
        updateAuthUI();
        updateRoleBasedUI();
        return { success: false, message: '注销失败，请稍后重试' };
    }
}

/**
 * 更新认证相关的UI
 */
function updateAuthUI() {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) {
        setTimeout(updateAuthUI, 100);
        return;
    }
    
    if (authState.isAuthenticated === null) {
        // 未知状态，显示加载中
        authContainer.innerHTML = `
            <div class="auth-info" style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #333; font-size: 12px;">加载中...</span>
            </div>
        `;
        return;
    }
    
    if (authState.isAuthenticated) {
        const roleMap = {
            'admin': '管理员',
            'pmo': 'PMO',
            'project_admin': '项目经理',
            'contractor': '普通用户'
        };
        const roleLabel = roleMap[authState.user.role] || authState.user.role;
        const orgLabel = authState.user.organization ? authState.user.organization : '';
        authContainer.innerHTML = `
            <div class="dropdown" id="userProfileDropdown" style="position:relative;display:inline-block;">
                <button class="dropdown-toggle" type="button" id="userProfileBtn" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <span class="user-role" style="font-size:11px;color:#fff;font-weight:bold;background:rgba(255,255,255,0.25);padding:1px 6px;border-radius:3px;">${roleLabel}</span>
                    <span class="username" style="font-size:12px;color:#fff;">${authState.user.username}</span>
                    ${orgLabel ? `<span style="font-size:11px;color:rgba(255,255,255,0.75);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${orgLabel}">${orgLabel}</span>` : ''}
                    <span style="font-size:10px;">▼</span>
                </button>
                <div class="dropdown-menu" id="userProfileMenu" style="display:none;position:absolute;right:0;top:110%;background:#fff;border:1px solid #ddd;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:120px;z-index:9999;">
                    <a href="#" class="dropdown-item" id="profileMenuItem" style="display:block;padding:8px 12px;font-size:13px;color:#333;text-decoration:none;">⚙️ 个人设置</a>
                    <a href="#" class="dropdown-item" id="logoutMenuItem" style="display:block;padding:8px 12px;font-size:13px;color:#333;text-decoration:none;">🚪 注销</a>
                </div>
            </div>
        `;

        const userProfileBtn = document.getElementById('userProfileBtn');
        const userProfileMenu = document.getElementById('userProfileMenu');
        if (userProfileBtn && userProfileMenu) {
            userProfileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShown = userProfileMenu.style.display === 'block';
                userProfileMenu.style.display = isShown ? 'none' : 'block';
            });
            document.addEventListener('click', () => {
                userProfileMenu.style.display = 'none';
            });
        }

        const profileMenuItem = document.getElementById('profileMenuItem');
        if (profileMenuItem) {
            profileMenuItem.addEventListener('click', (e) => {
                e.preventDefault();
                import('./profile.js').then(m => m.openProfileModal());
            });
        }

        const logoutMenuItem = document.getElementById('logoutMenuItem');
        if (logoutMenuItem) {
            logoutMenuItem.addEventListener('click', async (e) => {
                e.preventDefault();
                const result = await logout();
                if (result.success) {
                    showNotification('已注销', 'success');
                    window.location.href = '/login';
                } else {
                    showNotification(result.message, 'error');
                }
            });
        }
        
        const msgBtn = document.getElementById('messageCenterBtn');
        if (msgBtn) msgBtn.style.display = 'flex';
    } else {
        // 隐藏消息中心按钮
        const msgBtn = document.getElementById('messageCenterBtn');
        if (msgBtn) msgBtn.style.display = 'none';
        // 显示登录按钮
        authContainer.innerHTML = `
            <div class="auth-info" style="display: flex; align-items: center; gap: 8px;">
                <button id="loginBtn" style="display: block; visibility: visible; opacity: 1; padding: 6px 12px; font-size: 12px; background: transparent; border: 1px solid white; color: white; border-radius: 4px; cursor: pointer;">登录</button>
            </div>
        `;
        
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                openLoginModal();
            });
        }
    }
}

/**
 * 根据用户角色更新页面功能显示
 */
export function updateRoleBasedUI() {
    const role = authState.user?.role;
    const isAdmin = role === 'admin';
    const isPMO = role === 'pmo';
    const isProjectAdmin = role === 'project_admin';
    const isContractor = role === 'contractor';
    const isPending = authState.user?.status === 'pending';

    // 消息中心按钮
    const msgBtn = document.getElementById('messageCenterBtn');
    if (msgBtn) {
        msgBtn.style.display = authState.isAuthenticated ? 'flex' : 'none';
    }

    // 待审核用户隐藏所有功能菜单
    if (isPending) {
        const menusToHide = ['documentRequirementsMenu', 'generateReportBtn', 'packageProjectBtn', 'acceptanceMenu', 'systemManagementBtn', 'backToDashboardBtn'];
        menusToHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        return;
    }

    // 顶部功能菜单
    const documentRequirementsMenu = document.getElementById('documentRequirementsMenu');
    const generateReportBtn = document.getElementById('generateReportBtn');
    const packageProjectBtn = document.getElementById('packageProjectBtn');
    const acceptanceMenu = document.getElementById('acceptanceMenu');

    if (isContractor) {
        // 承建单位普通用户：隐藏高级功能
        if (documentRequirementsMenu) documentRequirementsMenu.style.display = 'none';
        if (generateReportBtn) generateReportBtn.style.display = 'none';
        if (packageProjectBtn) packageProjectBtn.style.display = 'none';
        if (acceptanceMenu) acceptanceMenu.style.display = 'none';
    }
    
    // 系统管理菜单（侧边栏）
    const canSeeSystemMenu = isAdmin || isPMO || isProjectAdmin;
    const systemManagementBtn = document.getElementById('systemManagementBtn');
    if (systemManagementBtn) {
        systemManagementBtn.style.display = canSeeSystemMenu ? 'inline-block' : 'none';
    }

    const systemManagementDropdown = document.getElementById('systemManagementDropdown');
    if (systemManagementDropdown) {
        const existingSysSettings = document.getElementById('systemSettingsMenuItem');
        const existingUserApproval = document.getElementById('userApprovalBtn');
        const existingUserMgmt = document.getElementById('userManagementMenuItem');
        const existingOrgMgmt = document.getElementById('orgManagementMenuItem');
        const existingProjectMgmt = document.getElementById('projectManagementMenuItem');
        const existingLogMgmt = document.getElementById('logManagementMenuItem');

        if (!canSeeSystemMenu) {
            if (existingSysSettings) existingSysSettings.remove();
            if (existingUserApproval) existingUserApproval.remove();
            if (existingUserMgmt) existingUserMgmt.remove();
            if (existingOrgMgmt) existingOrgMgmt.remove();
            if (existingProjectMgmt) existingProjectMgmt.remove();
            if (existingLogMgmt) existingLogMgmt.remove();
        } else {
            if (isAdmin) {
                // admin 保留系统设置和用户审核（已在 HTML 中静态存在）
            } else if (isPMO) {
                // PMO：业务管理员，移除系统设置，保留用户审核、用户管理、承建单位管理、项目管理、日志管理
                if (existingSysSettings) existingSysSettings.remove();
                if (!existingUserMgmt) {
                    const userMgmtA = document.createElement('a');
                    userMgmtA.href = '#';
                    userMgmtA.className = 'sidebar-menu-item';
                    userMgmtA.id = 'userManagementMenuItem';
                    userMgmtA.textContent = '👤 用户管理';
                    systemManagementDropdown.appendChild(userMgmtA);
                }
                if (!existingOrgMgmt) {
                    const orgMgmtA = document.createElement('a');
                    orgMgmtA.href = '#';
                    orgMgmtA.className = 'sidebar-menu-item';
                    orgMgmtA.id = 'orgManagementMenuItem';
                    orgMgmtA.textContent = '🏢 承建单位管理';
                    systemManagementDropdown.appendChild(orgMgmtA);
                }
                if (!existingProjectMgmt) {
                    const projectMgmtA = document.createElement('a');
                    projectMgmtA.href = '#';
                    projectMgmtA.className = 'sidebar-menu-item';
                    projectMgmtA.id = 'projectManagementMenuItem';
                    projectMgmtA.textContent = '📁 项目管理';
                    systemManagementDropdown.appendChild(projectMgmtA);
                }
            } else if (isProjectAdmin) {
                // 项目经理：移除系统设置，保留用户审核、项目管理和日志管理
                if (existingSysSettings) existingSysSettings.remove();
                if (existingUserMgmt) existingUserMgmt.remove();
                if (existingOrgMgmt) existingOrgMgmt.remove();
                if (!existingProjectMgmt) {
                    const projectMgmtA = document.createElement('a');
                    projectMgmtA.href = '#';
                    projectMgmtA.className = 'sidebar-menu-item';
                    projectMgmtA.id = 'projectManagementMenuItem';
                    projectMgmtA.textContent = '📁 项目管理';
                    systemManagementDropdown.appendChild(projectMgmtA);
                }
            } else {
                // 普通用户：只保留日志管理
                if (existingSysSettings) existingSysSettings.remove();
                if (existingUserApproval) existingUserApproval.remove();
                if (existingUserMgmt) existingUserMgmt.remove();
                if (existingOrgMgmt) existingOrgMgmt.remove();
                if (existingProjectMgmt) existingProjectMgmt.remove();
            }

            if (isAdmin) {
                if (!existingUserMgmt) {
                    const userMgmtA = document.createElement('a');
                    userMgmtA.href = '#';
                    userMgmtA.className = 'sidebar-menu-item';
                    userMgmtA.id = 'userManagementMenuItem';
                    userMgmtA.textContent = '👤 用户管理';
                    systemManagementDropdown.appendChild(userMgmtA);
                }

                if (!existingOrgMgmt) {
                    const orgMgmtA = document.createElement('a');
                    orgMgmtA.href = '#';
                    orgMgmtA.className = 'sidebar-menu-item';
                    orgMgmtA.id = 'orgManagementMenuItem';
                    orgMgmtA.textContent = '🏢 承建单位管理';
                    systemManagementDropdown.appendChild(orgMgmtA);
                }
            }

            if (!existingLogMgmt) {
                const logMgmtA = document.createElement('a');
                logMgmtA.href = '#';
                logMgmtA.className = 'sidebar-menu-item';
                logMgmtA.id = 'logManagementMenuItem';
                logMgmtA.textContent = '📋 日志管理';
                systemManagementDropdown.appendChild(logMgmtA);
            }
        }

        // 使用事件委托绑定菜单项点击，避免动态元素绑定失效
        if (!systemManagementDropdown._hasClickDelegate) {
            systemManagementDropdown._hasClickDelegate = true;
            systemManagementDropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.sidebar-menu-item');
                if (!item) return;
                e.preventDefault();
                // 关闭侧边栏
                const sidebar = document.getElementById('operationSidebar');
                const overlay = document.getElementById('sidebarOverlay');
                if (sidebar) sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('show');
                switch (item.id) {
                    case 'userApprovalBtn':
                        import('./user-approval.js').then(m => m.openUserApprovalModal());
                        break;
                    case 'archiveApprovalBtn':
                        import('./archive-approval.js').then(m => m.openArchiveApprovalModal());
                        break;
                    case 'userManagementMenuItem':
                        import('./admin.js').then(m => m.openUserManagementModal());
                        break;
                    case 'orgManagementMenuItem':
                        import('./admin.js').then(m => m.openOrgManagementModal());
                        break;
                    case 'projectManagementMenuItem':
                        import('./admin.js').then(m => m.openProjectManagementModal());
                        break;
                    case 'logManagementMenuItem':
                        import('./admin.js').then(m => m.openLogManagementModal());
                        break;
                }
            });
        }
    }
    
    // 项目选择模态框中的权限控制
    const deletedProjectsSection = document.querySelector('.deleted-projects-section');
    
    if (deletedProjectsSection) {
        deletedProjectsSection.style.display = (isAdmin || isProjectAdmin) ? 'block' : 'none';
    }
}

/**
 * 打开登录模态框
 */
export function openLoginModal() {
    // 如果已登录则不打开
    if (authState.isAuthenticated) return;
    
    // 移除已存在的登录模态框
    const existingModal = document.getElementById('loginModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.className = 'modal show';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">登录</h5>
                </div>
                <div class="modal-body">
                    <div id="loginMessage" class="alert alert-danger" style="display: none;"></div>
                    <form id="loginForm">
                        <div class="form-group">
                            <label for="loginUsername">用户名</label>
                            <input type="text" class="form-control" id="loginUsername" required>
                        </div>
                        <div class="form-group">
                            <label for="loginPassword">密码</label>
                            <input type="password" class="form-control" id="loginPassword" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block">登录</button>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // 添加表单提交事件
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const messageDiv = document.getElementById('loginMessage');
            
            messageDiv.style.display = 'none';
            
            const result = await login(username, password);
            if (result.success) {
                modal.remove();
                document.body.style.overflow = 'auto';
                showNotification('登录成功', 'success');
            } else {
                messageDiv.textContent = result.message;
                messageDiv.style.display = 'block';
            }
        });
    }
}

/**
 * 检查用户是否有指定角色
 */
export function hasRole(roles) {
    if (!authState.isAuthenticated) return false;
    if (authState.user.role === 'admin') return true;
    if (Array.isArray(roles)) {
        return roles.includes(authState.user.role);
    } else {
        return authState.user.role === roles;
    }
}

/**
 * 获取当前用户
 */
export function getCurrentUser() {
    return authState.user;
}

/**
 * 初始化认证模块
 * 如果用户未登录，会自动弹出登录框并等待登录成功后 resolve
 */
export function initAuth() {
    console.log('开始初始化认证模块');
    
    authState.isAuthenticated = null;
    authState.user = null;
    
    let authContainer = document.getElementById('authContainer');
    if (!authContainer) {
        authContainer = document.createElement('div');
        authContainer.id = 'authContainer';
        authContainer.style.display = 'flex';
        authContainer.style.alignItems = 'center';
        authContainer.style.gap = '10px';
        authContainer.style.zIndex = '10000';
        authContainer.style.position = 'fixed';
        authContainer.style.top = '20px';
        authContainer.style.right = '20px';
        authContainer.style.padding = '10px 15px';
        authContainer.style.borderRadius = '5px';
        authContainer.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        document.body.appendChild(authContainer);
    }
    
    updateAuthUI();
    
    return new Promise(async (resolve, reject) => {
        try {
            const isAuth = await checkAuthStatus();
            if (isAuth) {
                resolve();
                return;
            }
            
            // 未登录：无论是否主页，都跳转到独立登录页面
            const currentUrl = window.location.pathname + window.location.search;
            const loginUrl = '/login?next=' + encodeURIComponent(currentUrl);
            window.location.href = loginUrl;
        } catch (error) {
            console.error('检查认证状态失败:', error);
            authState.isAuthenticated = false;
            authState.user = null;
            updateAuthUI();
            updateRoleBasedUI();
            reject(error);
        }
    });
}

// 辅助函数：显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type}`;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.padding = '15px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transition = 'opacity 0.5s ease';
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 3000);
}
