/**
 * 模块索引文件 - 用于导出所有模块
 */

// 导入各个模块
import { appState, elements } from './app-state.js';
import { setupEventListeners, initDocModalResizer, showProjectButtons, showNotification, toggleOperationLog, refreshOperationLog, closeConfirmModal, closeInputModal } from './ui.js';
import { loadProjectsList, loadProject, saveProject, deleteProject, loadProjectConfig, importJson, exportJson, packageProject, importPackage, confirmAcceptance, downloadPackage } from './api.js';
import { handleUploadDocument, handleFileSelect, handleEditDocument, handleDeleteDocument, handleReplaceDocument, loadUploadedDocuments, renderCycleDocuments, previewDocument, openUploadModal, openEditModal, archiveDocument, unarchiveDocument } from './document.js';
import { renderProjectsList, selectProject, handleCreateProject, handleLoadProject, handleImportJson, handleExportJson, handleSaveProject, handlePackageProject, handleImportPackage, handleConfirmAcceptance, handleDownloadPackage, handleDeleteProject, handleAddCycle, handleRenameCycle, handleDeleteCycle, handleAddDoc, handleDeleteDoc, populateProjectManageSelects, populateDocSelect, resetImportPackageModal, openProjectSelectModal, closeProjectSelectModal, handleOpenProject, handleSoftDeleteProject, handleRestoreProject, handlePermanentDeleteProject, toggleDeletedProjects, openNewProjectModal } from './project.js';
import { renderCycles, renderInitialContent } from './cycle.js';
import { handleZipArchive, handleZipUpload, handleImportMatchedFiles, handleConfirmPendingFiles, handleRejectPendingFiles, loadZipPackagesList, searchZipFilesInPackage, fixZipSelectionIssue } from './zip.js';
import { handleGenerateReport, handleCheckCompliance, handleExportReport } from './report.js';
import { formatDate, formatDateToMonth, getFileExtension, isValidEmail } from './utils.js';

// 导出所有模块
export * from './app-state.js';
export * from './ui.js';
export * from './api.js';
export * from './document.js';
export * from './project.js';
export * from './cycle.js';
export * from './zip.js';
export * from './report.js';
export * from './utils.js';

/**
 * 初始化应用
 */
export async function initApp() {
    console.log('开始初始化应用...');
    setupEventListeners();
    console.log('事件监听器已设置');
    const projects = await loadProjectsList();
    renderProjectsList(projects);
    console.log('项目列表已加载');
    
    // 初始化宽度调整器
    initDocModalResizer();
    
    // 修复ZIP文件选择问题
    fixZipSelectionIssue();

    // 检查URL参数是否有项目ID
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    console.log('URL中的projectId:', projectId);

    if (projectId) {
        // 直接使用selectProject加载项目
        setTimeout(async () => {
            try {
                await selectProject(projectId);
            } catch (err) {
                console.error('通过URL加载项目失败:', err);
                showNotification('加载项目失败: ' + err.message, 'error');
                // 加载失败，显示项目选择模态框
                openProjectSelectModal();
            }
        }, 300);
    } else {
        // 没有指定项目ID，显示项目选择模态框
        setTimeout(() => {
            openProjectSelectModal();
        }, 200);
    }

    console.log('应用初始化完成');
}
