/**
 * 模块索引文件 - 用于导出所有模块
 */

// 导入各个模块
import { appState, elements } from './app-state.js';
import { setupEventListeners, initDocModalResizer, showProjectButtons, showNotification, toggleOperationLog, refreshOperationLog, closeConfirmModal, closeInputModal } from './ui.js';
import { loadProjectsList, loadProject, saveProject, deleteProject, loadProjectConfig, importJson, exportJson, packageProject, importPackage, confirmAcceptance, downloadPackage } from './api.js';
import { handleUploadDocument, handleFileSelect, handleEditDocument, handleDeleteDocument, handleReplaceDocument, loadUploadedDocuments, renderCycleDocuments, previewDocument, openUploadModal, openEditModal, archiveDocument, unarchiveDocument } from './document.js';
import { renderProjectsList, selectProject, handleCreateProject, handleLoadProject, handleImportJson, handleExportJson, handleSaveProject, handlePackageProject, handleImportPackage, handleConfirmAcceptance, handleDownloadPackage, handleDeleteProject, handleAddCycle, handleRenameCycle, handleDeleteCycle, handleAddDoc, handleDeleteDoc, populateProjectManageSelects, populateDocSelect, resetImportPackageModal } from './project.js';
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

    // 使用document.getElementById而不是elements缓存
    const projectSelect = document.getElementById('projectSelect');

    if (projectId) {
        // 等待项目列表加载完成后再检查
        setTimeout(() => {
            // 检查项目是否存在于列表中
            const option = projectSelect ? projectSelect.querySelector(`option[value="${projectId}"]`) : null;

            if (option) {
                // 项目在列表中，直接选中
                console.log('项目在列表中，选中它');
                projectSelect.value = projectId;
                selectProject(projectId);
            } else {
                // 项目不在列表中，尝试直接从服务器加载
                console.log('项目不在列表中，尝试直接加载:', projectId);
                try {
                    fetch(`/api/projects/${projectId}`)
                        .then(response => response.json())
                        .then(result => {
                            console.log('API响应:', result);
                            if (result.status === 'success') {
                                appState.currentProjectId = projectId;
                                appState.projectConfig = result.project;

                                // 更新下拉菜单
                                if (projectSelect) {
                                    const newOption = document.createElement('option');
                                    newOption.value = projectId;
                                    newOption.textContent = result.project.name + ' (已加载)';
                                    projectSelect.appendChild(newOption);
                                    projectSelect.value = projectId;
                                }

                                // 渲染周期
                                renderCycles();

                                showProjectButtons();
                                showNotification('已自动加载项目: ' + result.project.name, 'success');
                            } else {
                                showNotification('无法加载项目: ' + result.message, 'error');
                            }
                        })
                        .catch(error => {
                            console.error('自动加载项目失败:', error);
                            showNotification('自动加载项目失败', 'error');
                        });
                } catch (error) {
                    console.error('自动加载项目失败:', error);
                    showNotification('自动加载项目失败', 'error');
                }
            }
        }, 100); // 等待100ms确保DOM更新完成
    }

    console.log('应用初始化完成');
}
