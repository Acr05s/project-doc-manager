/**
 * 认证模块
 */

// 认证状态：null 表示尚未确定
let authState = {
    isAuthenticated: null,
    user: null
};

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
            updateAuthUI();
            updateRoleBasedUI();
            return true;
        } else {
            authState.isAuthenticated = false;
            authState.user = null;
            updateAuthUI();
            updateRoleBasedUI();
            return false;
        }
    } catch (error) {
        console.error('检查认证状态失败:', error);
        authState.isAuthenticated = false;
        authState.user = null;
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
            updateAuthUI();
            updateRoleBasedUI();
            return { success: true, message: result.message };
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
        // 显示用户信息和注销按钮
        const roleMap = {
            'admin': '管理员',
            'pmo': 'PMO',
            'project_admin': '项目经理',
            'contractor': '普通用户'
        };
        const roleLabel = roleMap[authState.user.role] || authState.user.role;
        authContainer.innerHTML = `
            <div class="auth-info" style="display: flex; align-items: center; gap: 8px;">
                <span class="user-role" style="font-size: 12px; color: #28a745; font-weight: bold;">${roleLabel}</span>
                <span class="username" style="font-size: 12px; color: #333;">${authState.user.username}</span>
                <button id="logoutBtn" class="btn btn-sm btn-outline-danger" style="padding: 4px 10px; font-size: 12px;">注销</button>
            </div>
        `;
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const result = await logout();
                if (result.success) {
                    showNotification('已注销', 'success');
                    window.location.href = '/login';
                } else {
                    showNotification(result.message, 'error');
                }
            });
        }
    } else {
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
    const isAdmin = role === 'admin' || role === 'pmo';
    const isProjectAdmin = role === 'project_admin';
    const isContractor = role === 'contractor';
    
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
    } else {
        // 管理员、PMO、项目经理：显示所有功能（当有项目选中时由 showProjectButtons 控制）
        // 这里先保持现有逻辑，不主动显示，避免覆盖 hideProjectButtons
    }
    
    // 项目选择模态框中的权限控制
    const systemSettingsBtn = document.getElementById('systemSettingsBtn');
    const deletedProjectsSection = document.querySelector('.deleted-projects-section');
    
    if (systemSettingsBtn) {
        systemSettingsBtn.style.display = (isAdmin || isProjectAdmin) ? 'inline-block' : 'none';
    }
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
                    <button type="button" class="close" onclick="document.getElementById('loginModal').remove()">&times;</button>
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
    
    // 点击模态框外部关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            document.body.style.overflow = 'auto';
        }
    });
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
 */
export async function initAuth() {
    console.log('开始初始化认证模块');
    
    // 初始状态设为未知，避免闪烁显示登录按钮
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
    
    // 先显示加载状态
    updateAuthUI();
    
    // 异步检查认证状态，拿到结果后再更新UI
    try {
        await checkAuthStatus();
    } catch (error) {
        console.error('检查认证状态失败:', error);
        authState.isAuthenticated = false;
        authState.user = null;
        updateAuthUI();
        updateRoleBasedUI();
    }
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
