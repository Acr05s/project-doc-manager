/**
 * 主应用入口 - 使用ES6模块
 */

import { initApp } from './modules/index.js';
import { unlockCurrentProject, appState } from './modules/app-state.js';

// 页面关闭或刷新时解锁项目
window.addEventListener('beforeunload', async () => {
    if (appState.currentProjectId) {
        // 使用 navigator.sendBeacon 异步发送解锁请求
        const data = JSON.stringify({
            project_id: appState.currentProjectId,
            session_id: appState.sessionId
        });
        navigator.sendBeacon('/api/tasks/unlock-project', data);
    }
});

// 加载版本信息
function loadVersionInfo() {
    fetch('/api/version')
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            const version = lines[0].trim();
            const appVersion = document.getElementById('appVersion');
            if (appVersion) {
                appVersion.textContent = `v${version}`;
            }
        })
        .catch(error => {
            console.error('加载版本信息失败:', error);
        });
}

// 打开版本信息模态框
function openVersionModal() {
    fetch('/api/version')
        .then(response => response.text())
        .then(data => {
            const versionContent = document.getElementById('versionContent');
            if (versionContent) {
                versionContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace; padding: 15px; background: #f8f9fa; border-radius: 4px;">${data}</pre>`;
            }
            
            const modal = document.getElementById('versionModal');
            if (modal) {
                modal.classList.add('show');
                document.body.style.overflow = 'hidden';
            }
        })
        .catch(error => {
            console.error('加载版本信息失败:', error);
            const versionContent = document.getElementById('versionContent');
            if (versionContent) {
                versionContent.innerHTML = '<p style="color: red;">加载版本信息失败</p>';
            }
        });
}

// 关闭版本信息模态框
function closeVersionModal() {
    const modal = document.getElementById('versionModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    
    // 加载版本信息
    loadVersionInfo();
    
    // 添加项目标题点击事件
    const projectTitle = document.getElementById('projectTitle');
    if (projectTitle) {
        projectTitle.addEventListener('click', async function() {
            // 检查是否有当前打开的项目
            const appState = (await import('./modules/app-state.js')).appState;
            const { showNotification, showLoading } = await import('./modules/ui.js');
            const { saveProject } = await import('./modules/api.js');
            
            if (appState.currentProjectId && appState.projectConfig) {
                // 保存当前项目
                showLoading(true);
                try {
                    await saveProject(appState.currentProjectId, appState.projectConfig);
                    
                    // 重置应用状态
                    appState.currentProjectId = null;
                    appState.projectConfig = null;
                    appState.currentCycle = null;
                    
                    // 隐藏项目相关按钮
                    const hideProjectButtons = (await import('./modules/project.js')).hideProjectButtons;
                    hideProjectButtons();
                    
                    // 清空当前项目名称显示
                    const nameEl = document.getElementById('currentProjectName');
                    if (nameEl) {
                        nameEl.textContent = '';
                        nameEl.style.display = 'none';
                    }
                    
                    // 重置项目选择下拉框
                    const projectSelect = document.getElementById('projectSelect');
                    if (projectSelect) {
                        projectSelect.value = '';
                    }
                    
                    // 清空周期导航栏
                    const cycleNavBar = document.getElementById('cycleNavBar');
                    const cycleNavList = document.getElementById('cycleNavList');
                    if (cycleNavBar) cycleNavBar.style.display = 'none';
                    if (cycleNavList) cycleNavList.innerHTML = '';
                    
                    // 清空周期列表侧边栏
                    const cycleListEl = document.getElementById('cycleList');
                    if (cycleListEl) cycleListEl.innerHTML = '<div class="empty-state">请先选择项目</div>';
                    
                    // 清空内容区域，显示欢迎信息
                    const contentArea = document.getElementById('contentArea');
                    if (contentArea) {
                        contentArea.innerHTML = `
                            <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                                <h2>欢迎使用项目文档管理中心</h2>
                                <p>请在顶部选择项目，加载配置文件</p>
                                <p>然后在顶部周期导航中选择周期，管理文档</p>
                            </div>
                        `;
                    }
                    
                    // 清空文档容器
                    const docContainer = document.getElementById('documentContainer');
                    if (docContainer) docContainer.innerHTML = '<div class="empty-state">请先选择项目</div>';
                    
                    // 更新URL，移除项目参数
                    const url = new URL(window.location);
                    url.searchParams.delete('project');
                    window.history.replaceState({}, '', url);
                    
                    showNotification('当前项目已保存并关闭', 'success');
                } catch (error) {
                    console.error('保存项目失败:', error);
                    showNotification('保存项目失败: ' + error.message, 'error');
                    return; // 出错时不打开项目选择模态框
                } finally {
                    showLoading(false);
                }
            }
            
            // 打开项目选择模态框
            const module = await import('./modules/project.js');
            module.openProjectSelectModal();
        });
    }
    
    // 添加版本号点击事件
    const appVersion = document.getElementById('appVersion');
    if (appVersion) {
        appVersion.addEventListener('click', function(e) {
            e.stopPropagation(); // 阻止事件冒泡
            openVersionModal();
        });
    }
    
    // 添加版本模态框关闭事件
    const versionModal = document.getElementById('versionModal');
    if (versionModal) {
        const closeBtn = versionModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeVersionModal);
        }
        
        // 点击模态框外部关闭
        versionModal.addEventListener('click', function(e) {
            if (e.target === versionModal) {
                closeVersionModal();
            }
        });
    }
});

// 全局函数，用于在HTML中调用模块化的函数
window.previewDocument = function(docId) {
    import('./modules/document.js').then(module => {
        module.previewDocument(docId);
    });
};

window.openUploadModal = function(cycle, docName) {
    import('./modules/document.js').then(module => {
        module.openUploadModal(cycle, docName);
    });
};

window.openEditModal = function(docId, cycle, docName) {
    import('./modules/document.js').then(module => {
        module.openEditModal(docId, cycle, docName);
    });
};

window.handleDeleteDocument = function(docId) {
    import('./modules/document.js').then(module => {
        module.handleDeleteDocument(docId);
    });
};

window.archiveDocument = function(cycle, docName) {
    import('./modules/document.js').then(module => {
        module.archiveDocument(cycle, docName);
    });
};

window.unarchiveDocument = function(cycle, docName) {
    import('./modules/document.js').then(module => {
        module.unarchiveDocument(cycle, docName);
    });
};

window.loadMaintainDocuments = function() {
    import('./modules/document.js').then(module => {
        module.loadMaintainDocuments();
    });
};

window.loadZipPackages = function() {
    import('./modules/zip.js').then(module => {
        module.loadZipPackagesList();
    });
};

window.searchZipFiles = function(keyword, packagePath) {
    import('./modules/zip.js').then(module => {
        module.searchZipFilesInPackage(keyword, packagePath);
    });
};

// 关闭预览模态框
window.closePreviewModal = function() {
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
};

// 关闭编辑模态框
window.closeEditModal = function() {
    const modal = document.getElementById('editDocModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
};

// 切换操作日志显示
window.toggleOperationLog = function() {
    import('./modules/ui.js').then(module => {
        module.toggleOperationLog();
    });
};

// 刷新操作日志
window.refreshOperationLog = function() {
    import('./modules/ui.js').then(module => {
        module.refreshOperationLog();
    });
};

// 生成报告
window.generateReport = function() {
    // 直接调用全局的generateReport函数
    generateReport();
};

// 关闭确认模态框
window.closeConfirmModal = function() {
    import('./modules/ui.js').then(module => {
        module.closeConfirmModal();
    });
};

// 关闭输入模态框
window.closeInputModal = function() {
    import('./modules/ui.js').then(module => {
        module.closeInputModal();
    });
};

// 项目选择模态框相关
window.openProjectSelectModal = function() {
    import('./modules/project.js').then(module => {
        module.openProjectSelectModal();
    });
};

window.closeProjectSelectModal = function() {
    import('./modules/project.js').then(module => {
        module.closeProjectSelectModal();
    });
};

// 关闭打包进度模态框
window.closePackageProgressModal = function() {
    import('./modules/project.js').then(module => {
        module.closePackageProgressModal();
    });
};

window.handleOpenProject = function(projectId) {
    import('./modules/project.js').then(module => {
        module.handleOpenProject(projectId);
    });
};

window.handleClearPackaging = function(projectId) {
    import('./modules/project.js').then(module => {
        module.handleClearPackaging(projectId);
    });
};

window.handleSoftDeleteProject = function(projectId, projectName) {
    import('./modules/project.js').then(module => {
        module.handleSoftDeleteProject(projectId, projectName);
    });
};

window.handleRestoreProject = function(projectId) {
    import('./modules/project.js').then(module => {
        module.handleRestoreProject(projectId);
    });
};

window.handlePermanentDeleteProject = function(projectId, projectName) {
    import('./modules/project.js').then(module => {
        module.handlePermanentDeleteProject(projectId, projectName);
    });
};

window.toggleDeletedProjects = function() {
    import('./modules/project.js').then(module => {
        module.toggleDeletedProjects();
    });
};

window.openNewProjectModal = function() {
    import('./modules/project.js').then(module => {
        module.openNewProjectModal();
    });
};

// 重新匹配文件管理相关
window.handleRematchFromZip = function(zipId, filename, path) {
    import('./modules/project.js').then(module => {
        module.handleRematchFromZip(zipId, filename, path);
    });
};

window.handleDeleteZipRecord = function(zipId, filename) {
    import('./modules/project.js').then(module => {
        module.handleDeleteZipRecord(zipId, filename);
    });
};

// 清理重复文档相关函数
window.openCleanupDuplicatesModal = function() {
    import('./modules/ui.js').then(module => {
        module.openCleanupDuplicatesModal();
    });
};

window.closeCleanupDuplicatesModal = function() {
    import('./modules/ui.js').then(module => {
        module.closeCleanupDuplicatesModal();
    });
};

window.startCleanupDuplicates = function() {
    import('./modules/ui.js').then(module => {
        module.startCleanupDuplicates();
    });
};

window.refreshAfterCleanup = function() {
    import('./modules/ui.js').then(module => {
        module.refreshAfterCleanup();
    });
};
