/**
 * 主应用入口 - 使用ES6模块
 */

import { initApp } from './modules/index.js';

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
        projectTitle.addEventListener('click', function() {
            import('./modules/project.js').then(module => {
                module.openProjectSelectModal();
            });
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
