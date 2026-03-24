/**
 * 主应用入口 - 使用ES6模块
 */

import { initApp } from './modules/index.js';

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    
    // 添加项目标题点击事件
    const projectTitle = document.getElementById('projectTitle');
    if (projectTitle) {
        projectTitle.addEventListener('click', function() {
            import('./modules/project.js').then(module => {
                module.openProjectSelectModal();
            });
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

window.openEditModal = function(docId) {
    import('./modules/document.js').then(module => {
        module.openEditModal(docId);
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

window.handleDeleteZipRecord = function(path, filename) {
    import('./modules/project.js').then(module => {
        module.handleDeleteZipRecord(path, filename);
    });
};
