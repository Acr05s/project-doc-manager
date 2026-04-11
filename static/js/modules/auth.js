"""认证模块"""

// 认证状态
let authState = {
    isAuthenticated: false,
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
            return true;
        } else {
            authState.isAuthenticated = false;
            authState.user = null;
            updateAuthUI();
            return false;
        }
    } catch (error) {
        console.error('检查认证状态失败:', error);
        authState.isAuthenticated = false;
        authState.user = null;
        updateAuthUI();
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
        return { success: true, message: result.message };
    } catch (error) {
        console.error('注销失败:', error);
        authState.isAuthenticated = false;
        authState.user = null;
        updateAuthUI();
        return { success: false, message: '注销失败，请稍后重试' };
    }
}

/**
 * 更新认证相关的UI
 */
function updateAuthUI() {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;
    
    if (authState.isAuthenticated) {
        // 显示用户信息和注销按钮
        authContainer.innerHTML = `
            <div class="auth-info">
                <span class="user-role">${authState.user.role}</span>
                <span class="username">${authState.user.username}</span>
                <button id="logoutBtn" class="btn btn-sm btn-outline-danger">注销</button>
            </div>
        `;
        
        // 添加注销按钮事件
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const result = await logout();
                if (result.success) {
                    showNotification('已注销', 'success');
                    // 跳转到登录页面
                    window.location.href = '/login';
                } else {
                    showNotification(result.message, 'error');
                }
            });
        }
    } else {
        // 显示登录按钮
        authContainer.innerHTML = `
            <div class="auth-info">
                <button id="loginBtn" class="btn btn-sm btn-outline-primary">登录</button>
            </div>
        `;
        
        // 添加登录按钮事件
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                openLoginModal();
            });
        }
    }
}

/**
 * 打开登录模态框
 */
export function openLoginModal() {
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
    await checkAuthStatus();
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
