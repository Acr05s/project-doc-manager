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

            if (result.security?.password_expired || result.user?.password_expired) {
                import('./profile.js').then(m => {
                    m.setForcePasswordChangeRequired(true, '密码已过期，请先修改密码再继续操作');
                    m.openProfileModal();
                    m.switchProfileTab('profile-password');
                });
            }
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
            const passwordExpired = !!(result.security?.password_expired || result.user?.password_expired);
            if (passwordExpired) {
                import('./profile.js').then(m => {
                    m.setForcePasswordChangeRequired(true, '密码已过期，请先修改密码再继续操作');
                    m.openProfileModal();
                    m.switchProfileTab('profile-password');
                });
            } else {
                import('./profile.js').then(m => m.setForcePasswordChangeRequired(false));
            }
            return { success: true, message: result.message, needsApproval: !!result.needs_approval, passwordExpired };
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
        await fetch('/logout');
    } catch (error) {
        console.error('注销请求异常:', error);
    }
    authState.isAuthenticated = false;
    authState.user = null;
    // 直接跳转到登录页面
    window.location.href = '/login';
    return { success: true };
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
            'admin': '系统管理员',
            'pmo': '项目管理组织',
            'pmo_leader': 'PMO负责人',
            'project_admin': '项目经理',
            'contractor': '一般员工'
        };
        const roleLabel = roleMap[authState.user.role] || authState.user.role;
        const orgLabel = authState.user.organization ? authState.user.organization : '';
        authContainer.innerHTML = `
            <div class="dropdown" id="userProfileDropdown" style="position:relative;display:inline-block;">
                <button class="dropdown-toggle" type="button" id="userProfileBtn" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:4px;padding:5px 12px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <span class="user-role" style="font-size:11px;color:#fff;font-weight:bold;background:rgba(255,255,255,0.25);padding:1px 6px;border-radius:3px;">${roleLabel}</span>
                    <span class="username" style="font-size:12px;color:#fff;">${authState.user.display_name ? `${authState.user.username}（${authState.user.display_name}）` : authState.user.username}</span>
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
        
        // messageCenterBtn已废弃，使用headerBellBtn代替
        const msgBtn = document.getElementById('messageCenterBtn');
        if (msgBtn) msgBtn.style.display = 'none';
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
 * 缓存的菜单权限配置
 */
let _cachedPermissions = null;
const ALL_PERMISSION_ROLES = ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor'];
const SAFE_FALLBACK_PERMISSIONS = {
    scheduledReportTaskMenuItem: { roles: ['admin', 'pmo', 'pmo_leader'], group: 'sidebar', label: '🗓️ 定时报告任务' },
    systemSettingsMenuItem: { roles: ['admin'], group: 'sidebar', label: '⚙️ 系统设置' },
    userManagementMenuItem: { roles: ['admin', 'pmo', 'pmo_leader', 'project_admin'], group: 'sidebar', label: '👤 用户管理' },
    orgManagementMenuItem: { roles: ['admin', 'pmo', 'pmo_leader'], group: 'sidebar', label: '🏢 承建单位管理' },
    projectManagementMenuItem: { roles: ['admin', 'pmo', 'pmo_leader', 'project_admin'], group: 'sidebar', label: '📁 项目管理' },
    userApprovalBtn: { roles: ['admin', 'pmo', 'pmo_leader', 'project_admin'], group: 'sidebar', label: '👤 用户审核' },
    userApprovalHistoryMenuItem: { roles: ['admin', 'pmo', 'pmo_leader', 'project_admin'], group: 'sidebar', label: '👥 用户审批历史' },
    archiveApprovalBtn: { roles: ['admin', 'pmo', 'pmo_leader', 'project_admin'], group: 'sidebar', label: '📋 文档归档审批' },
    approvalHistoryBtn: { roles: ['admin', 'pmo', 'pmo_leader', 'project_admin'], group: 'sidebar', label: '📊 审批历史' },
    logManagementMenuItem: { roles: ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor'], group: 'sidebar', label: '📝 操作日志' }
};

/**
 * 获取菜单权限配置（带缓存，平台级）
 */
async function fetchMenuPermissions(forceRefresh = false) {
    if (_cachedPermissions && !forceRefresh) return _cachedPermissions;
    try {
        const resp = await fetch('/api/settings/permissions');
        const data = await resp.json();
        if (data.status === 'success') {
            _cachedPermissions = data.data;
        } else if (!_cachedPermissions) {
            _cachedPermissions = { ...SAFE_FALLBACK_PERMISSIONS };
        }
    } catch (e) {
        if (!_cachedPermissions) {
            _cachedPermissions = { ...SAFE_FALLBACK_PERMISSIONS };
        }
    }
    return _cachedPermissions;
}

/**
 * 检查角色是否有某菜单的权限
 */
function hasMenuPermission(permissions, menuKey, role) {
    if (!permissions || !permissions[menuKey]) return false;
    return permissions[menuKey].roles.includes(role);
}

function _extractMenuLabel(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.menu-badge').forEach(node => node.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function _collectRuntimeMenuDefinitions() {
    const defs = {};
    const order = { top: [], sidebar: [] };
    const excludedIds = new Set([
        'systemManagementBtn',
        'documentRequirementsBtn',
        'documentManagementBtn',
        'acceptanceBtn',
        'archiveAndApprovalBtn',
        'permissionConfigMenuItem'
    ]);

    const addDef = (el, group) => {
        const id = el?.id;
        if (!id || excludedIds.has(id)) return;
        if (!/(Menu|Btn|MenuItem)$/.test(id)) return;

        let parent = null;
        if (group === 'top' && el.closest('.dropdown-menu')) {
            const parentDropdown = el.closest('.dropdown');
            parent = parentDropdown ? parentDropdown.id : null;
        }

        const label = _extractMenuLabel(el) || id;
        defs[id] = {
            label,
            group,
            parent: parent || undefined
        };
        order[group].push(id);
    };

    document.querySelectorAll('.header-right [id]').forEach(el => addDef(el, 'top'));
    document.querySelectorAll('#systemManagementDropdown .sidebar-menu-item[id]').forEach(el => addDef(el, 'sidebar'));
    return { defs, order };
}

function _buildMergedPermissions(basePermissions) {
    const permissions = {};
    if (basePermissions) {
        for (const [key, val] of Object.entries(basePermissions)) {
            permissions[key] = {
                label: val.label || key,
                group: val.group || 'sidebar',
                roles: Array.isArray(val.roles) ? [...val.roles] : []
            };
            if (val.parent) {
                permissions[key].parent = val.parent;
            }
        }
    }

    const runtime = _collectRuntimeMenuDefinitions();
    for (const [id, meta] of Object.entries(runtime.defs)) {
        if (!permissions[id]) {
            permissions[id] = {
                label: meta.label,
                group: meta.group,
                roles: meta.parent && permissions[meta.parent]
                    ? [...(permissions[meta.parent].roles || ['admin'])]
                    : ['admin']
            };
            if (meta.parent) {
                permissions[id].parent = meta.parent;
            }
        } else {
            permissions[id].label = meta.label || permissions[id].label;
            permissions[id].group = meta.group || permissions[id].group;
            if (meta.parent) {
                permissions[id].parent = meta.parent;
            }
        }
    }

    return { permissions, order: runtime.order };
}

/**
 * 根据用户角色更新页面功能显示
 */
export async function updateRoleBasedUI() {
    const role = authState.user?.role;
    const isAdmin = role === 'admin';
    const isPending = authState.user?.status === 'pending';

    // messageCenterBtn已废弃，始终隐藏
    const msgBtn = document.getElementById('messageCenterBtn');
    if (msgBtn) {
        msgBtn.style.display = 'none';
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

    // 获取权限配置
    const permissions = await fetchMenuPermissions();

    // 应用所有菜单权限（含二级菜单）
    _applyMenuPermissions(permissions);

    // 侧边栏事件委托
    const systemManagementDropdown = document.getElementById('systemManagementDropdown');
    if (systemManagementDropdown) {
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
                    case 'approvalHistoryBtn':
                        import('./document.js').then(m => m.showGlobalApprovalHistory());
                        break;
                    case 'scheduledReportTaskMenuItem':
                        import('./scheduled-reports.js').then(m => m.openScheduledReportModal());
                        break;
                    case 'userApprovalHistoryMenuItem':
                        import('./admin.js').then(m => m.openUserApprovalHistoryModal());
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
                    case 'moduleManagementMenuItem':
                        import('./module-management.js').then(m => m.openModuleManagementModal());
                        break;
                    case 'logManagementMenuItem':
                        import('./admin.js').then(m => m.openLogManagementModal());
                        break;
                    case 'permissionConfigMenuItem':
                        openPermissionConfigModal();
                        break;
                }
            });
        }
    }
    
    // 项目选择模态框中的权限控制
    const deletedProjectsSection = document.querySelector('.deleted-projects-section');
    
    if (deletedProjectsSection) {
        deletedProjectsSection.style.display = (isAdmin || role === 'project_admin') ? 'block' : 'none';
    }
}

/**
 * 打开权限配置模态框（双标签页：系统菜单 / 项目菜单）
 */
async function openPermissionConfigModal() {
    const modal = document.getElementById('permissionConfigModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const tbody = document.getElementById('permissionConfigBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">加载中...</td></tr>';

    // 强制刷新权限数据
    const permissions = await fetchMenuPermissions(true);
    if (!permissions) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#c00;">加载权限配置失败</td></tr>';
        return;
    }

    const roles = [...ALL_PERMISSION_ROLES];
    let currentTab = 'sidebar'; // 默认显示系统菜单权限
    const merged = _buildMergedPermissions(permissions);
    const mergedPermissions = merged.permissions;
    const menuOrderByGroup = merged.order;

    function getOrderedEntries(group) {
        const entries = Object.entries(mergedPermissions).filter(([, d]) => d.group === group);
        const order = menuOrderByGroup[group] || [];
        const orderMap = new Map(order.map((id, idx) => [id, idx]));
        return entries.sort(([aKey], [bKey]) => {
            const aIdx = orderMap.has(aKey) ? orderMap.get(aKey) : Number.MAX_SAFE_INTEGER;
            const bIdx = orderMap.has(bKey) ? orderMap.get(bKey) : Number.MAX_SAFE_INTEGER;
            if (aIdx !== bIdx) return aIdx - bIdx;
            return aKey.localeCompare(bKey, 'zh-Hans-CN');
        });
    }

    function renderTab(group, targetBody) {
        currentTab = group;
        targetBody.innerHTML = '';

        // 过滤并按菜单顺序渲染
        const orderedEntries = getOrderedEntries(group);
        let isFirstParent = true;
        for (const [menuKey, menuData] of orderedEntries) {
            const isChild = !!menuData.parent;

            // 父菜单前插入浅色分隔线（第一个父菜单除外）
            if (!isChild && !isFirstParent) {
                const sepTr = document.createElement('tr');
                const sepTd = document.createElement('td');
                sepTd.colSpan = roles.length + 1;
                sepTd.style.cssText = 'padding:0;height:2px;background:linear-gradient(to right,#d0daea,#e8edf5,#d0daea);border:none;';
                sepTr.appendChild(sepTd);
                targetBody.appendChild(sepTr);
            }
            if (!isChild) isFirstParent = false;

            const tr = document.createElement('tr');
            tr.dataset.menu = menuKey;
            tr.dataset.group = menuData.group || group;
            tr.dataset.label = menuData.label || menuKey;
            tr.dataset.parent = menuData.parent || '';
            tr.style.borderBottom = '1px solid #f0f0f0';
            if (isChild) tr.style.background = '#fafbfc';
            const indent = isChild ? 'padding-left:36px;color:#555;font-size:13px;' : 'padding:8px 12px;font-weight:500;';
            let cells = `<td style="padding:8px 12px;${indent}">${isChild ? '└ ' : ''}${menuData.label}</td>`;
            roles.forEach(r => {
                const checked = menuData.roles.includes(r) ? 'checked' : '';
                cells += `<td style="text-align:center;padding:8px 12px;"><input type="checkbox" data-menu="${menuKey}" data-role="${r}" ${checked} style="width:18px;height:18px;cursor:pointer;"></td>`;
            });
            tr.innerHTML = cells;
            targetBody.appendChild(tr);
        }

        if (!targetBody.children.length) {
            targetBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">暂无配置项</td></tr>';
        }

        // 更新标签页高亮
        document.querySelectorAll('.perm-tab-btn').forEach(btn => {
            if (btn.dataset.tab === group) {
                btn.classList.add('active');
                btn.style.color = '#1a73e8';
                btn.style.borderBottomColor = '#1a73e8';
            } else {
                btn.classList.remove('active');
                btn.style.color = '#666';
                btn.style.borderBottomColor = 'transparent';
            }
        });
    }

    // 初始渲染
    renderTab('sidebar', tbody);

    // 标签页点击
    document.querySelectorAll('.perm-tab-btn').forEach(btn => {
        btn.onclick = () => {
            const body = document.getElementById('permissionConfigBody');
            if (body) renderTab(btn.dataset.tab, body);
        };
    });

    // 实时保存：每个checkbox变化时自动保存
    let saveTimer = null;
    const statusEl = document.getElementById('permissionSaveStatus');

    // 使用 onchange 覆盖旧处理器，避免重复绑定
    tbody.onchange = (e) => {
        if (e.target.type !== 'checkbox') return;
        // 高亮当前已编辑行
        const row = e.target.closest('tr');
        if (row && !row.dataset.edited) {
            row.dataset.edited = '1';
            const isChild = row.style.background === 'rgb(250, 251, 252)' || row.style.background === '#fafbfc';
            row.style.background = isChild ? '#fffbe6' : '#fff8e1';
            row.style.boxShadow = 'inset 3px 0 0 #f0a500';
            row.style.transition = 'background 0.2s';
        }
        if (saveTimer) clearTimeout(saveTimer);
        if (statusEl) { statusEl.textContent = '保存中...'; statusEl.style.color = '#999'; }
        saveTimer = setTimeout(() => _savePermissionsFromTable(tbody, statusEl), 300);
    };
}

/**
 * 从表格收集权限数据并保存（仅更新当前标签页的数据，保留其他标签页）
 */
async function _savePermissionsFromTable(tbody, statusEl) {
    // 从当前标签页的 checkbox 收集
    const checkboxes = tbody.querySelectorAll('input[type="checkbox"]');
    const tabPermissions = {};
    checkboxes.forEach(cb => {
        const menu = cb.dataset.menu;
        const role = cb.dataset.role;
        const row = cb.closest('tr');
        if (!tabPermissions[menu]) {
            tabPermissions[menu] = {
                roles: [],
                label: row?.dataset.label || menu,
                group: row?.dataset.group || 'sidebar',
                parent: row?.dataset.parent || undefined
            };
        }
        if (cb.checked) tabPermissions[menu].roles.push(role);
    });

    // 合并：用缓存中的完整数据 + 当前标签页的修改
    const mergedPermissions = {};
    if (_cachedPermissions) {
        for (const [key, val] of Object.entries(_cachedPermissions)) {
            mergedPermissions[key] = {
                roles: [...(val.roles || [])],
                label: val.label || key,
                group: val.group || 'sidebar'
            };
            if (val.parent) {
                mergedPermissions[key].parent = val.parent;
            }
        }
    }
    // 用当前标签页数据覆盖对应的 key
    for (const [key, val] of Object.entries(tabPermissions)) {
        mergedPermissions[key] = val;
    }

    try {
        const resp = await fetch('/api/settings/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mergedPermissions)
        });
        const data = await resp.json();
        if (data.status === 'success') {
            _cachedPermissions = data.data;
            if (statusEl) { statusEl.textContent = '✓ 已保存'; statusEl.style.color = '#28a745'; }
            // 刷新菜单显示（不影响项目状态）
            _applyMenuPermissions();
        } else {
            if (statusEl) { statusEl.textContent = '保存失败'; statusEl.style.color = '#dc3545'; }
            showNotification('保存失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (e) {
        if (statusEl) { statusEl.textContent = '保存失败'; statusEl.style.color = '#dc3545'; }
        showNotification('保存失败: ' + e.message, 'error');
    }
}

/**
 * 仅刷新菜单显示，不重新加载权限（避免影响项目状态）
 * @param {Object} permissions - 权限配置，不传时使用缓存
 */
function _applyMenuPermissions(permissions) {
    const role = authState.user?.role;
    const isAdmin = role === 'admin';
    permissions = permissions || _cachedPermissions;
    if (!permissions || !role) return;

    // 判断是否有项目打开（顶部项目菜单仅在项目打开时显示）
    const hasProject = !!(window._appState?.currentProjectId || document.querySelector('.cycle-nav-item[data-cycle]'));

    // 遍历所有权限项，对每个元素应用显示/隐藏
    for (const [menuKey, menuData] of Object.entries(permissions)) {
        const el = document.getElementById(menuKey);
        if (el) {
            if (menuData.group === 'top') {
                // 顶部菜单：仅在有项目打开且有权限时显示
                el.style.display = (hasProject && hasMenuPermission(permissions, menuKey, role)) ? '' : 'none';
            } else {
                el.style.display = hasMenuPermission(permissions, menuKey, role) ? '' : 'none';
            }
        }
    }

    // 侧边栏菜单项列表（用于判断四叶草是否显示）
    const sidebarMenus = Object.entries(permissions)
        .filter(([, d]) => d.group === 'sidebar' && !d.parent)
        .map(([k]) => k);

    // 四叶草和系统管理按钮
    const canSeeAnySidebarMenu = sidebarMenus.some(key => hasMenuPermission(permissions, key, role));
    const systemManagementBtn = document.getElementById('systemManagementBtn');
    if (systemManagementBtn) systemManagementBtn.style.display = canSeeAnySidebarMenu ? 'inline-block' : 'none';
    const sidebarCloverBtn = document.getElementById('sidebarCloverBtn');
    if (sidebarCloverBtn) sidebarCloverBtn.style.display = canSeeAnySidebarMenu ? 'flex' : 'none';

    // 启动菜单通知角标定期刷新
    if (canSeeAnySidebarMenu) {
        refreshMenuBadges();
        if (!window._menuBadgeInterval) {
            window._menuBadgeInterval = setInterval(refreshMenuBadges, 30000);
        }
    }

    // 权限配置菜单项（仅admin）
    const permissionConfigMenuItem = document.getElementById('permissionConfigMenuItem');
    if (permissionConfigMenuItem) permissionConfigMenuItem.style.display = isAdmin ? '' : 'none';

    // 侧边栏分组标题：如果该分组下无可见菜单项，则隐藏标题
    const sidebar = document.getElementById('systemManagementDropdown');
    if (sidebar) {
        const children = Array.from(sidebar.children);
        let currentSection = null;
        let hasVisibleItem = false;

        children.forEach((node) => {
            if (node.classList && node.classList.contains('sidebar-menu-section')) {
                if (currentSection) {
                    currentSection.style.display = hasVisibleItem ? '' : 'none';
                }
                currentSection = node;
                hasVisibleItem = false;
                return;
            }

            if (node.classList && node.classList.contains('sidebar-menu-item')) {
                const visible = window.getComputedStyle(node).display !== 'none';
                if (visible) {
                    hasVisibleItem = true;
                }
            }
        });

        if (currentSection) {
            currentSection.style.display = hasVisibleItem ? '' : 'none';
        }
    }
}

/**
 * 刷新菜单角标（待审核用户数、待审批归档数）
 */
async function refreshMenuBadges() {
    let totalBadge = 0;

    // 获取待审核用户数
    try {
        const resp = await fetch('/pending-users');
        const data = await resp.json();
        const count = (data.status === 'success' && Array.isArray(data.users)) ? data.users.length : 0;
        const badge = document.getElementById('userApprovalBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
        totalBadge += count;
    } catch (e) { /* ignore */ }

    // 获取待审批归档数
    try {
        const resp = await fetch('/api/projects/archive/pending');
        const data = await resp.json();
        const count = (data.status === 'success' && Array.isArray(data.approvals)) ? data.approvals.length : 0;
        const badge = document.getElementById('archiveApprovalBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
        totalBadge += count;
    } catch (e) { /* ignore */ }

    // 更新四叶草角标
    const cloverBadge = document.getElementById('cloverBadge');
    if (cloverBadge) {
        if (totalBadge > 0) {
            cloverBadge.textContent = totalBadge > 99 ? '99+' : totalBadge;
            cloverBadge.classList.add('show');
        } else {
            cloverBadge.classList.remove('show');
        }
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
    modal.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.25);width:360px;max-width:90vw;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#0066cc,#004d99);padding:24px 28px 20px;color:#fff;">
                <h3 style="margin:0;font-size:18px;font-weight:600;">📁 项目资料管理平台</h3>
                <p style="margin:6px 0 0;font-size:13px;opacity:0.85;">请登录以继续使用</p>
            </div>
            <div style="padding:24px 28px 28px;">
                <div id="loginMessage" style="display:none;padding:10px 12px;border-radius:6px;background:#fee;color:#c00;font-size:13px;margin-bottom:16px;border:1px solid #fcc;"></div>
                <form id="loginForm">
                    <div style="margin-bottom:16px;">
                        <label style="display:block;font-size:13px;color:#555;margin-bottom:6px;font-weight:500;">用户名</label>
                        <input type="text" id="loginUsername" required placeholder="请输入用户名"
                            style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;transition:border-color 0.2s;"
                            onfocus="this.style.borderColor='#0066cc';this.style.boxShadow='0 0 0 3px rgba(0,102,204,0.1)'"
                            onblur="this.style.borderColor='#ddd';this.style.boxShadow='none'">
                    </div>
                    <div style="margin-bottom:20px;">
                        <label style="display:block;font-size:13px;color:#555;margin-bottom:6px;font-weight:500;">密码</label>
                        <input type="password" id="loginPassword" required placeholder="请输入密码"
                            style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;transition:border-color 0.2s;"
                            onfocus="this.style.borderColor='#0066cc';this.style.boxShadow='0 0 0 3px rgba(0,102,204,0.1)'"
                            onblur="this.style.borderColor='#ddd';this.style.boxShadow='none'">
                    </div>
                    <button type="submit" style="width:100%;padding:11px;background:linear-gradient(135deg,#0066cc,#004d99);color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;transition:opacity 0.2s;"
                        onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">登 录</button>
                </form>
                <div style="text-align:center;margin-top:14px;">
                    <a href="/login" style="font-size:12px;color:#999;text-decoration:none;">前往注册页面 →</a>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // 点击背景不关闭（防误关）
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            // 不关闭，提示用户需要登录
        }
    });
    
    // 自动聚焦用户名
    setTimeout(() => {
        const usernameInput = document.getElementById('loginUsername');
        if (usernameInput) usernameInput.focus();
    }, 100);
    
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
