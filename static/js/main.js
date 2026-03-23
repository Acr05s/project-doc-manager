/**
 * 主应用入口 - 使用ES6模块
 */

import { initApp } from './modules/index.js';

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);

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
