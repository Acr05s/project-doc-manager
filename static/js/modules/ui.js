/**
 * UI模块 - 处理界面相关功能
 */

import { appState, elements } from './app-state.js';
import { getCurrentUser } from './auth.js';
import { renderSimpleMarkdown } from './markdown.js';
import { 
    handleCreateProject, handleLoadProject, handleImportJson, handleExportJson, 
    handleSaveProject, handleClearRequirements, updateClearRequirementsBtnState,
    handlePackageProject, handleImportPackage, 
    selectProject, populateProjectManageSelects, handleAddCycle, 
    handleRenameCycle, handleDeleteCycle, handleAddDoc, handleDeleteDoc, 
    populateDocSelect, handleConfirmAcceptance, handleDownloadPackage, 
    handleRematchFileManagement, resetImportPackageModal, loadZipRecords, handleRematchFromZip, handleDeleteZipRecord,
    handlePackageFileSelect, handlePackageFileSelectInModal, handleImportPackageInModal
} from './project.js';

import { 
    handleUploadDocument, handleFileSelect, handleEditDocument, 
    handleDeleteDocument, handleReplaceDocument, loadUploadedDocuments, renderCycleDocuments
} from './document.js';
import { 
    handleZipArchive, handleZipUpload, handleBackgroundMatch, handleImportMatchedFiles, 
    handleConfirmPendingFiles, handleRejectPendingFiles, loadZipPackagesList, 
    searchZipFilesInPackage
} from './zip.js';
import { 
    handleGenerateReport, handleCheckCompliance, handleExportReport
} from './report.js';
import { 
    openConfigVersionModal, closeConfigVersionModal, 
    openSaveVersionModal, closeSaveVersionModal, handleSaveVersion
} from './version.js';
import {
    openTreeEditor, closeTreeEditor,
    saveTreeConfig, saveTreeAsTemplate, loadTemplateToTree,
    openImportModuleModal, exportTreeConfig,
    closeAttributePanel, saveAttributes
} from './tree-editor.js';
import { handleSaveTemplate } from './requirement-editor.js';

let watermarkTimer = null;
let agreementMarkdownDraft = '';

/**
 * 设置事件监听器
 */
export function setupEventListeners() {
    console.log('设置事件监听器...');

    // 系统管理侧边栏
    const systemManagementBtn = document.getElementById('systemManagementBtn');
    const operationSidebar = document.getElementById('operationSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebarCloverBtn = document.getElementById('sidebarCloverBtn');

    function openSidebar() {
        if (operationSidebar) operationSidebar.classList.add('open');
        if (sidebarOverlay) sidebarOverlay.classList.add('show');
    }
    function closeSidebar() {
        if (operationSidebar) operationSidebar.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }

    // 四叶草按钮打开侧边栏
    if (sidebarCloverBtn) {
        sidebarCloverBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSidebar();
        });
    }

    if (systemManagementBtn) {
        systemManagementBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSidebar();
        });
    }
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // 文档需求下拉菜单
    const docReqBtn = document.getElementById('documentRequirementsBtn');
    const docReqDropdown = document.getElementById('documentRequirementsDropdown');
    if (docReqBtn && docReqDropdown) {
        docReqBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            docReqDropdown.classList.toggle('show');
        });
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!docReqBtn.contains(e.target) && !docReqDropdown.contains(e.target)) {
                docReqDropdown.classList.remove('show');
            }
        });
    }

    // 文档管理下拉菜单
    const docManageBtn = document.getElementById('documentManagementBtn');
    const docManageDropdown = document.getElementById('documentManagementDropdown');
    if (docManageBtn && docManageDropdown) {
        docManageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            docManageDropdown.classList.toggle('show');
        });
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!docManageBtn.contains(e.target) && !docManageDropdown.contains(e.target)) {
                docManageDropdown.classList.remove('show');
            }
        });
    }

    // 数据备份导入下拉菜单
    const dataBackupBtn = document.getElementById('dataBackupBtn');
    const dataBackupDropdown = document.getElementById('dataBackupDropdown');
    if (dataBackupBtn && dataBackupDropdown) {
        dataBackupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dataBackupDropdown.classList.toggle('show');
        });
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!dataBackupBtn.contains(e.target) && !dataBackupDropdown.contains(e.target)) {
                dataBackupDropdown.classList.remove('show');
            }
        });
    }

    // 清理重复文档按钮
    const cleanupDuplicatesBtn = document.getElementById('cleanupDuplicatesBtn');
    if (cleanupDuplicatesBtn) {
        cleanupDuplicatesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docManageDropdown = document.getElementById('documentManagementDropdown');
            if (docManageDropdown) docManageDropdown.classList.remove('show');
            // 打开清理模态框
            openCleanupDuplicatesModal();
        });
    }

    // 验收项目文件下拉菜单
    const acceptanceBtn = document.getElementById('acceptanceBtn');
    const acceptanceDropdown = document.getElementById('acceptanceDropdown');
    if (acceptanceBtn && acceptanceDropdown) {
        acceptanceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            acceptanceDropdown.classList.toggle('show');
        });
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!acceptanceBtn.contains(e.target) && !acceptanceDropdown.contains(e.target)) {
                acceptanceDropdown.classList.remove('show');
            }
        });
    }

    // 文档归档与审批下拉菜单
    const archiveAndApprovalBtn = document.getElementById('archiveAndApprovalBtn');
    const archiveAndApprovalDropdown = document.getElementById('archiveAndApprovalDropdown');
    if (archiveAndApprovalBtn && archiveAndApprovalDropdown) {
        archiveAndApprovalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            archiveAndApprovalDropdown.classList.toggle('show');
        });
        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', (e) => {
            if (!archiveAndApprovalBtn.contains(e.target) && !archiveAndApprovalDropdown.contains(e.target)) {
                archiveAndApprovalDropdown.classList.remove('show');
            }
        });
    }

    // 配置审批流程按钮
    const openArchiveConfigBtn = document.getElementById('openArchiveConfigBtn');
    if (openArchiveConfigBtn) {
        openArchiveConfigBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            import('./project.js').then(({ openArchiveApprovalConfigModal }) => {
                const projectId = appState?.currentProjectId;
                if (projectId) {
                    openArchiveApprovalConfigModal(projectId);
                } else {
                    showNotification('请先选择项目', 'error');
                }
            });
            // 关闭下拉菜单
            if (archiveAndApprovalDropdown) {
                archiveAndApprovalDropdown.classList.remove('show');
            }
        });
    }

    // 查看审批请求按钮
    const viewArchiveRequestsBtn = document.getElementById('viewArchiveRequestsBtn');
    if (viewArchiveRequestsBtn) {
        viewArchiveRequestsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            import('./archive-approval.js').then(m => m.openArchiveApprovalModal());
            if (archiveAndApprovalDropdown) {
                archiveAndApprovalDropdown.classList.remove('show');
            }
        });
    }

    // 审批历史按钮
    const viewApprovalHistoryBtn = document.getElementById('viewApprovalHistoryBtn');
    if (viewApprovalHistoryBtn) {
        viewApprovalHistoryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            import('./document.js').then(m => {
                const projectId = appState?.currentProjectId;
                if (projectId) {
                    m.showApprovalHistoryList(projectId);
                } else {
                    showNotification('请先选择项目', 'error');
                }
            });
            if (archiveAndApprovalDropdown) {
                archiveAndApprovalDropdown.classList.remove('show');
            }
        });
    }

    // 新建项目 - 使用document.getElementById确保获取到元素
    const newProjectBtn = document.getElementById('newProjectBtn');
    const newProjectModal = document.getElementById('newProjectModal');
    console.log('newProjectBtn:', newProjectBtn);
    console.log('newProjectModal:', newProjectModal);
    if (newProjectBtn && newProjectModal) {
        newProjectBtn.addEventListener('click', () => {
            console.log('点击了新建项目按钮');
            openModal(newProjectModal);
        });
    }

    // 新建项目表单提交
    const newProjectForm = document.getElementById('newProjectForm');
    if (newProjectForm) {
        newProjectForm.addEventListener('submit', handleCreateProject);
    }

    // 编辑项目表单提交
    const editProjectForm = document.getElementById('editProjectForm');
    if (editProjectForm) {
        editProjectForm.addEventListener('submit', (e) => {
            e.preventDefault();
            import('./project.js').then(({ handleEditProjectSave }) => {
                handleEditProjectSave(e);
            });
        });
    }

    // 归档审批配置表单提交
    const archiveApprovalConfigForm = document.getElementById('archiveApprovalConfigForm');
    if (archiveApprovalConfigForm) {
        archiveApprovalConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            import('./project.js').then(({ handleArchiveApprovalConfigSave }) => {
                handleArchiveApprovalConfigSave(e);
            });
        });
    }

    // 定时报告表单提交
    const scheduledReportForm = document.getElementById('scheduledReportForm');
    if (scheduledReportForm) {
        scheduledReportForm.addEventListener('submit', (e) => {
            import('./scheduled-reports.js').then(({ saveScheduledReportConfig }) => {
                saveScheduledReportConfig(e);
            });
        });
    }

    // 归档审批确认按钮
    const archiveApprovalConfirmBtn = document.getElementById('archiveApprovalConfirmBtn');
    if (archiveApprovalConfirmBtn) {
        archiveApprovalConfirmBtn.addEventListener('click', (e) => {
            import('./archive-approval.js').then(({ handleArchiveApprovalConfirm }) => {
                handleArchiveApprovalConfirm();
            });
        });
    }

    // 归档审批驳回按钮
    const archiveApprovalRejectBtn = document.getElementById('archiveApprovalRejectBtn');
    if (archiveApprovalRejectBtn) {
        archiveApprovalRejectBtn.addEventListener('click', (e) => {
            import('./archive-approval.js').then(({ handleArchiveApprovalReject }) => {
                handleArchiveApprovalReject();
            });
        });
    }

    // 选择PMO审批人确认按钮
    const selectPMOConfirmBtn = document.getElementById('selectPMOConfirmBtn');
    if (selectPMOConfirmBtn) {
        selectPMOConfirmBtn.addEventListener('click', (e) => {
            import('./archive-approval.js').then(({ handleSelectPMOApproverConfirm }) => {
                handleSelectPMOApproverConfirm();
            });
        });
    }

    // 加载项目配置（Excel）
    const loadProjectBtn = document.getElementById('loadProjectBtn');
    const loadProjectModal = document.getElementById('loadProjectModal');
    if (loadProjectBtn && loadProjectModal) {
        loadProjectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docReqDropdown = document.getElementById('documentRequirementsDropdown');
            if (docReqDropdown) docReqDropdown.classList.remove('show');
            openModal(loadProjectModal);
        });
    }

    // 加载项目表单提交
    const loadProjectForm = document.getElementById('loadProjectForm');
    if (loadProjectForm) {
        loadProjectForm.addEventListener('submit', handleLoadProject);
    }

    // 导入JSON
    const importJsonBtn = document.getElementById('importJsonBtn');
    const importJsonModal = document.getElementById('importJsonModal');
    if (importJsonBtn && importJsonModal) {
        importJsonBtn.addEventListener('click', () => {
            openModal(importJsonModal);
        });
    }

    // 导入JSON表单提交
    const importJsonForm = document.getElementById('importJsonForm');
    if (importJsonForm) {
        importJsonForm.addEventListener('submit', handleImportJson);
    }

    // 导出JSON
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docReqDropdown = document.getElementById('documentRequirementsDropdown');
            if (docReqDropdown) docReqDropdown.classList.remove('show');
            handleExportJson();
        });
    }

    // 保存项目状态
    const saveProjectBtn = document.getElementById('saveProjectBtn');
    if (saveProjectBtn) {
        saveProjectBtn.addEventListener('click', handleSaveProject);
    }

    // 删除当前需求
    const clearRequirementsBtn = document.getElementById('clearRequirementsBtn');
    if (clearRequirementsBtn) {
        clearRequirementsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docReqDropdown = document.getElementById('documentRequirementsDropdown');
            if (docReqDropdown) docReqDropdown.classList.remove('show');
            handleClearRequirements();
        });
    }

    // 编辑文档需求
    const editRequirementsBtn = document.getElementById('editRequirementsBtn');
    if (editRequirementsBtn) {
        editRequirementsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docReqDropdown = document.getElementById('documentRequirementsDropdown');
            if (docReqDropdown) docReqDropdown.classList.remove('show');
            openTreeEditor();
        });
    }

    // 配置版本管理
    const manageVersionsBtn = document.getElementById('manageVersionsBtn');
    if (manageVersionsBtn) {
        manageVersionsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docReqDropdown = document.getElementById('documentRequirementsDropdown');
            if (docReqDropdown) docReqDropdown.classList.remove('show');
            openConfigVersionModal();
        });
    }

    // 保存新版本按钮
    const saveNewVersionBtn = document.getElementById('saveNewVersionBtn');
    if (saveNewVersionBtn) {
        saveNewVersionBtn.addEventListener('click', () => {
            openSaveVersionModal();
        });
    }

    // 保存新版本表单提交
    const saveVersionForm = document.getElementById('saveVersionForm');
    if (saveVersionForm) {
        saveVersionForm.addEventListener('submit', handleSaveVersion);
    }

    // 配置版本管理模态框关闭按钮
    const configVersionModal = document.getElementById('configVersionModal');
    if (configVersionModal) {
        const closeBtn = configVersionModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeConfigVersionModal);
        }
    }

    // 保存新版本模态框关闭按钮
    const saveVersionModal = document.getElementById('saveVersionModal');
    if (saveVersionModal) {
        const closeBtn = saveVersionModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeSaveVersionModal);
        }
    }

    // ========== 树形编辑器事件绑定 ==========
    
    // 树形编辑器模态框关闭按钮
    const treeEditorModal = document.getElementById('treeEditorModal');
    if (treeEditorModal) {
        const closeBtn = treeEditorModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeTreeEditor);
        }
    }
    
    // 工具栏按钮
    const toolbarAddCycle = document.getElementById('toolbarAddCycle');
    if (toolbarAddCycle) {
        toolbarAddCycle.addEventListener('click', () => window.addTreeNode('cycle'));
    }
    
    const toolbarAddDoc = document.getElementById('toolbarAddDoc');
    if (toolbarAddDoc) {
        toolbarAddDoc.addEventListener('click', () => window.addTreeNode('document'));
    }
    
    const toolbarAddFolder = document.getElementById('toolbarAddFolder');
    if (toolbarAddFolder) {
        toolbarAddFolder.addEventListener('click', () => window.addTreeNode('folder'));
    }
    
    const toolbarEdit = document.getElementById('toolbarEdit');
    if (toolbarEdit) {
        toolbarEdit.addEventListener('click', () => {
            if (!window._treeSelectedNode) {
                showNotification('请先在下方树中选择要编辑的节点', 'info');
                return;
            }
            window.editTreeNode(window._treeSelectedNode);
        });
    }
    
    const toolbarAttr = document.getElementById('toolbarAttr');
    if (toolbarAttr) {
        toolbarAttr.addEventListener('click', () => {
            if (!window._treeSelectedNode) {
                showNotification('请先选择一个文档节点', 'info');
                return;
            }
            window.openAttributePanel(window._treeSelectedNode);
        });
    }
    
    const toolbarDelete = document.getElementById('toolbarDelete');
    if (toolbarDelete) {
        toolbarDelete.addEventListener('click', () => {
            // 支持多选删除
            if (window._treeSelectedNodes && window._treeSelectedNodes.length > 1) {
                const count = window._treeSelectedNodes.length;
                showConfirmModal('确认批量删除', `确定要删除选中的 ${count} 个节点吗？`, () => {
                    window.deleteTreeNodes(window._treeSelectedNodes);
                });
            } else if (window._treeSelectedNode) {
                window.deleteTreeNode(window._treeSelectedNode);
            } else {
                showNotification('请先在下方树中选择要删除的节点', 'info');
            }
        });
    }
    
    const toolbarExpandAll = document.getElementById('toolbarExpandAll');
    if (toolbarExpandAll) {
        console.log('[UI] 绑定展开全部按钮事件 (动态导入)');
        toolbarExpandAll.addEventListener('click', () => {
            console.log('[UI] 展开全部按钮被点击 (动态导入)');
            import('./tree-editor.js').then(mod => {
                if (typeof mod.expandAll === 'function') {
                    mod.expandAll();
                } else {
                    console.error('[UI] tree-editor 模块中未导出 expandAll');
                }
            }).catch(err => console.error('[UI] 动态导入 tree-editor 失败:', err));
        });
    } else {
        console.log('[UI] 未找到展开全部按钮');
    }
    
    const toolbarCollapseAll = document.getElementById('toolbarCollapseAll');
    if (toolbarCollapseAll) {
        console.log('[UI] 绑定折叠全部按钮事件 (动态导入)');
        toolbarCollapseAll.addEventListener('click', () => {
            console.log('[UI] 折叠全部按钮被点击 (动态导入)');
            import('./tree-editor.js').then(mod => {
                if (typeof mod.collapseAll === 'function') {
                    mod.collapseAll();
                } else {
                    console.error('[UI] tree-editor 模块中未导出 collapseAll');
                }
            }).catch(err => console.error('[UI] 动态导入 tree-editor 失败:', err));
        });
    } else {
        console.log('[UI] 未找到折叠全部按钮');
    }
    
    const toolbarSave = document.getElementById('toolbarSave');
    if (toolbarSave) {
        toolbarSave.addEventListener('click', saveTreeConfig);
    }
    
    const toolbarSaveAsTemplate = document.getElementById('toolbarSaveAsTemplate');
    if (toolbarSaveAsTemplate) {
        toolbarSaveAsTemplate.addEventListener('click', saveTreeAsTemplate);
    }
    
    const toolbarImportModule = document.getElementById('toolbarImportModule');
    if (toolbarImportModule) {
        toolbarImportModule.addEventListener('click', openImportModuleModal);
    }
    
    const toolbarExportModule = document.getElementById('toolbarExportModule');
    if (toolbarExportModule) {
        toolbarExportModule.addEventListener('click', exportTreeConfig);
    }
    
    const toolbarLoadTemplate = document.getElementById('toolbarLoadTemplate');
    if (toolbarLoadTemplate) {
        toolbarLoadTemplate.addEventListener('click', loadTemplateToTree);
    }
    
    // 筛选功能
    const treeFilterInput = document.getElementById('treeFilterInput');
    const treeFilterType = document.getElementById('treeFilterType');
    
    if (treeFilterInput) {
        treeFilterInput.addEventListener('input', (e) => {
            clearTimeout(window.filterDebounceTimer);
            window.filterDebounceTimer = setTimeout(() => {
                const type = treeFilterType ? treeFilterType.value : 'all';
                if (window.setTreeFilter) {
                    window.setTreeFilter(e.target.value, type);
                }
            }, 300);
        });
    }
    
    if (treeFilterType) {
        treeFilterType.addEventListener('change', (e) => {
            const text = treeFilterInput ? treeFilterInput.value : '';
            if (window.setTreeFilter) {
                window.setTreeFilter(text, e.target.value);
            }
        });
    }
    
    // 保存模板模态框
    const saveTemplateModal = document.getElementById('saveTemplateModal');
    if (saveTemplateModal) {
        const closeBtn = saveTemplateModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeModal(saveTemplateModal);
            });
        }
    }
    
    // 保存模板表单提交
    const saveTemplateForm = document.getElementById('saveTemplateForm');
    if (saveTemplateForm) {
        saveTemplateForm.addEventListener('submit', handleSaveTemplate);
    }

    // 属性面板 - 保存按钮
    const saveAttributesBtn = document.getElementById('saveAttributesBtn');
    if (saveAttributesBtn) {
        saveAttributesBtn.addEventListener('click', saveAttributes);
    }
    
    // 模板库模态框
    const templateLibraryModal = document.getElementById('templateLibraryModal');
    if (templateLibraryModal) {
        const closeBtn = templateLibraryModal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeModal(templateLibraryModal);
            });
        }
    }

    // 打包项目
    const packageProjectBtn = document.getElementById('packageProjectBtn');
    if (packageProjectBtn) {
        packageProjectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const dataBackupDropdown = document.getElementById('dataBackupDropdown');
            if (dataBackupDropdown) dataBackupDropdown.classList.remove('show');
            handlePackageProject();
        });
    }

    // 导入包按钮
    const importPackageBtn = document.getElementById('importPackageBtn');
    const importPackageModal = document.getElementById('importPackageModal');
    if (importPackageBtn && importPackageModal) {
        importPackageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const dataBackupDropdown = document.getElementById('dataBackupDropdown');
            if (dataBackupDropdown) dataBackupDropdown.classList.remove('show');
            resetImportPackageModal();
            openModal(importPackageModal);
        });
    }

    // 导入包弹窗 - 冲突处理选项联动
    document.querySelectorAll('input[name="conflictAction"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const nameInput = document.getElementById('importPackageName');
            if (e.target.value === 'manual') {
                nameInput.disabled = false;
                nameInput.focus();
            } else if (e.target.value === 'overwrite') {
                nameInput.disabled = true;
            } else if (e.target.value === 'rename') {
                nameInput.disabled = true;
                nameInput.value = '';
            }
        });
    });
    
    // 文件选择处理 - 检测项目名称和重名
    const packageFileInput = document.getElementById('packageFile');
    if (packageFileInput) {
        packageFileInput.addEventListener('change', handlePackageFileSelect);
    }

    console.log('事件监听器设置完成');


    // ---- 日志框拖拽调整高度 ----
    initLogResize();

    // ---- ESC 键关闭弹窗 ----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.show').forEach(modal => {
                modal.classList.remove('show');
            });
        }
    });

    // ---- 文档上传弹窗：文件来源 Tab 切换 ----
    document.querySelectorAll('.upload-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchUploadTab(btn.dataset.tab));
    });

    // ---- 主标签页切换 ----
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchMainTab(btn.dataset.tab));
    });

    // ZIP 包选择器（用于 ZIP 包管理页面）
            const zipPackageSelect = document.getElementById('zipPackageSelect');
            if (zipPackageSelect) {
                zipPackageSelect.addEventListener('change', () => {
                    const selectedOption = zipPackageSelect.options[zipPackageSelect.selectedIndex];
                    appState.currentZipPackagePath = zipPackageSelect.value;
                    appState.currentZipPackageName = selectedOption ? selectedOption.textContent.replace(/（\d+个文件）$/, '').trim() : '';
                    // 切换包后重置多选状态，重新搜索
                    appState.zipSelectedFile = null;
                    appState.zipSelectedFiles = [];
                    const si = document.getElementById('zipSelectedInfo');
                    const ab = document.getElementById('zipArchiveBtn');
                    if (si) si.style.display = 'none';
                    if (ab) {
                        ab.disabled = true;
                        ab.textContent = '✅ 确认选择';
                    }
                    const kw = document.getElementById('zipFileSearch')?.value?.trim() || '';
                    searchZipFilesInPackage(kw, zipPackageSelect.value);
                });
            }

            // ZIP 包删除按钮
            const deleteZipBtn = document.getElementById('deleteZipPackageBtn');
            if (deleteZipBtn) {
                deleteZipBtn.addEventListener('click', async () => {
                    if (appState.currentZipPackagePath) {
                        try {
                            // 首先检查是否有引用
                            const response = await fetch('/api/documents/delete-zip-package', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ package_path: appState.currentZipPackagePath })
                            });
                            const result = await response.json();
                            
                            if (result.status === 'warning') {
                                // 有引用记录，显示确认对话框
                                const references = result.referenced_docs;
                                const totalReferences = result.total_references;
                                
                                let message = `该ZIP包中有 ${totalReferences} 个文件被文档引用。\n\n`;
                                message += '引用的文档：\n';
                                references.slice(0, 5).forEach(doc => {
                                    message += `- ${doc.doc_name} (${doc.cycle})\n`;
                                });
                                if (references.length > 5) {
                                    message += `... 还有 ${references.length - 5} 个引用`;
                                }
                                message += '\n\n删除ZIP包的同时会删除这些引用记录，确定要继续吗？';
                                
                                showConfirmModal(
                                    '确认删除',
                                    message,
                                    async () => {
                                        try {
                                            // 确认删除
                                            const confirmResponse = await fetch('/api/documents/delete-zip-package', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ 
                                                    package_path: appState.currentZipPackagePath,
                                                    confirm_delete: true 
                                                })
                                            });
                                            const confirmResult = await confirmResponse.json();
                                            
                                            if (confirmResult.status === 'success') {
                                                showNotification(`ZIP包删除成功，同时删除了 ${confirmResult.deleted_references} 个引用记录`, 'success');
                                                // 重新加载ZIP包列表
                                                loadZipPackagesList();
                                            } else {
                                                showNotification('删除失败: ' + confirmResult.message, 'error');
                                            }
                                        } catch (error) {
                                            console.error('删除ZIP包失败:', error);
                                            showNotification('删除失败: ' + error.message, 'error');
                                        }
                                    }
                                );
                            } else if (result.status === 'success') {
                                // 没有引用，直接删除
                                showNotification('ZIP包删除成功', 'success');
                                // 重新加载ZIP包列表
                                loadZipPackagesList();
                            } else {
                                showNotification('删除失败: ' + result.message, 'error');
                            }
                        } catch (error) {
                            console.error('删除ZIP包失败:', error);
                            showNotification('删除失败: ' + error.message, 'error');
                        }
                    } else {
                        showNotification('请先选择一个ZIP包', 'warning');
                    }
                });
            }

    // ZIP 搜索按钮
    const zipSearchBtn = document.getElementById('zipSearchBtn');
    if (zipSearchBtn) {
        zipSearchBtn.addEventListener('click', () => {
            const kw = document.getElementById('zipFileSearch')?.value?.trim() || '';
            searchZipFilesInPackage(kw, appState.currentZipPackagePath || '');
        });
    }

    // ZIP 搜索框回车触发搜索
    const zipFileSearch = document.getElementById('zipFileSearch');
    if (zipFileSearch) {
        zipFileSearch.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchZipFilesInPackage(zipFileSearch.value.trim(), appState.currentZipPackagePath || '');
            }
        });
        // 输入时实时搜索（300ms 防抖）
        let zipSearchTimer = null;
        zipFileSearch.addEventListener('input', () => {
            clearTimeout(zipSearchTimer);
            zipSearchTimer = setTimeout(() => {
                searchZipFilesInPackage(zipFileSearch.value.trim(), appState.currentZipPackagePath || '');
            }, 300);
        });
    }

    // ZIP 清除已选
    const zipClearSelectedBtn = document.getElementById('zipClearSelectedBtn');
    if (zipClearSelectedBtn) {
        zipClearSelectedBtn.addEventListener('click', () => {
            appState.zipSelectedFile = null;
            appState.zipSelectedFiles = [];
            // 清除所有复选框和选中状态
            document.querySelectorAll('.zip-file-item').forEach(i => {
                i.classList.remove('selected');
                const cb = i.querySelector('.zip-file-checkbox');
                if (cb) cb.checked = false;
            });
            const si = document.getElementById('zipSelectedInfo');
            const ab = document.getElementById('zipArchiveBtn');
            if (si) si.style.display = 'none';
            if (ab) {
                ab.disabled = true;
                ab.textContent = '✅ 确认选择';
            }
        });
    }

    // ZIP 确认归档
    const zipArchiveBtn = document.getElementById('zipArchiveBtn');
    if (zipArchiveBtn) {
        zipArchiveBtn.addEventListener('click', handleZipArchive);
    }





    // 项目选择Modal中的导入功能
    const importPackageFormInModal = document.getElementById('importPackageFormInModal');
    if (importPackageFormInModal) {
        importPackageFormInModal.addEventListener('submit', (e) => {
            e.preventDefault();
            handleImportPackageInModal(e);
        });
    }
    
    // 文件选择处理 - 检测项目名称和重名（Modal中）
    const packageFileInputInModal = document.getElementById('packageFileInModal');
    if (packageFileInputInModal) {
        packageFileInputInModal.addEventListener('change', handlePackageFileSelectInModal);
    }

    // 项目管理
    const projectManageBtn = document.getElementById('projectManageBtn');
    const projectManageModal = document.getElementById('projectManageModal');
    if (projectManageBtn && projectManageModal) {
        projectManageBtn.addEventListener('click', () => {
            populateProjectManageSelects();
            openModal(projectManageModal);
        });
    }

    // 项目管理Tab切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
        });
    });

    // 添加周期
    const addCycleForm = document.getElementById('addCycleForm');
    if (addCycleForm) addCycleForm.addEventListener('submit', handleAddCycle);

    // 重命名周期
    const renameCycleForm = document.getElementById('renameCycleForm');
    if (renameCycleForm) renameCycleForm.addEventListener('submit', handleRenameCycle);

    // 删除周期
    const deleteCycleForm = document.getElementById('deleteCycleForm');
    if (deleteCycleForm) deleteCycleForm.addEventListener('submit', handleDeleteCycle);

    // 添加文档
    const addDocForm = document.getElementById('addDocForm');
    if (addDocForm) addDocForm.addEventListener('submit', handleAddDoc);

    // 删除文档
    const deleteDocForm = document.getElementById('deleteDocForm');
    if (deleteDocForm) deleteDocForm.addEventListener('submit', handleDeleteDoc);

    // 周期选择变化时更新文档下拉框
    const deleteDocCycleSelect = document.getElementById('deleteDocCycleSelect');
    if (deleteDocCycleSelect) {
        deleteDocCycleSelect.addEventListener('change', (e) => {
            populateDocSelect(e.target.value, 'deleteDocSelect');
        });
    }

    // 批量导入ZIP
    const zipUploadBtn = document.getElementById('zipUploadBtn');
    const zipUploadModal = document.getElementById('zipUploadModal');
    if (zipUploadBtn && zipUploadModal) {
        zipUploadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docManageDropdown = document.getElementById('documentManagementDropdown');
            if (docManageDropdown) docManageDropdown.classList.remove('show');
            openModal(zipUploadModal);
        });
    }

    // ZIP上传表单提交
    const zipUploadForm = document.getElementById('zipUploadForm');
    if (zipUploadForm) {
        zipUploadForm.addEventListener('submit', handleZipUpload);
    }

    // 后台匹配按钮
    const startBackgroundMatchBtn = document.getElementById('startBackgroundMatchBtn');
    if (startBackgroundMatchBtn) {
        startBackgroundMatchBtn.addEventListener('click', handleBackgroundMatch);
    }

    // 导入匹配文件按钮
    const importMatchedBtn = document.getElementById('importMatchedBtn');
    if (importMatchedBtn) {
        importMatchedBtn.addEventListener('click', handleImportMatchedFiles);
    }

    // 确认待确认文件按钮
    const confirmPendingBtn = document.getElementById('confirmPendingBtn');
    if (confirmPendingBtn) {
        confirmPendingBtn.addEventListener('click', handleConfirmPendingFiles);
    }

    // 拒绝待确认文件按钮
    const rejectPendingBtn = document.getElementById('rejectPendingBtn');
    if (rejectPendingBtn) {
        rejectPendingBtn.addEventListener('click', handleRejectPendingFiles);
    }

    // 生成报告（从下拉菜单）
    const generateReportMenuItem = document.getElementById('generateReportMenuItem');
    if (generateReportMenuItem) {
        generateReportMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const acceptanceDropdown = document.getElementById('acceptanceDropdown');
            if (acceptanceDropdown) acceptanceDropdown.classList.remove('show');
            handleGenerateReport();
        });
    }



    // 确认验收
    const confirmAcceptanceBtn = document.getElementById('confirmAcceptanceBtn');
    if (confirmAcceptanceBtn) {
        confirmAcceptanceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const acceptanceDropdown = document.getElementById('acceptanceDropdown');
            if (acceptanceDropdown) acceptanceDropdown.classList.remove('show');
            handleConfirmAcceptance();
        });
    }

    // 打包下载
    const downloadPackageBtn = document.getElementById('downloadPackageBtn');
    if (downloadPackageBtn) {
        downloadPackageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const acceptanceDropdown = document.getElementById('acceptanceDropdown');
            if (acceptanceDropdown) acceptanceDropdown.classList.remove('show');
            handleDownloadPackage();
        });
    }

    // 删除项目
    const deleteProjectBtn = document.getElementById('deleteProjectBtn');
    if (deleteProjectBtn) {
        deleteProjectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 关闭下拉菜单
            const docManageDropdown = document.getElementById('documentManagementDropdown');
            if (docManageDropdown) docManageDropdown.classList.remove('show');
            if (appState.currentProjectId) {
                handleRematchFileManagement();
            } else {
                showNotification('请先选择一个项目', 'warning');
            }
        });
    }

    // 文档上传表单提交
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUploadDocument);
    }

    // 文件选择后显示预览
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // 替换文件按钮
    const replaceArchiveBtn = document.getElementById('replaceArchiveBtn');
    if (replaceArchiveBtn) {
        replaceArchiveBtn.addEventListener('click', () => {
            showNotification('该功能正在开发中', 'info');
        });
    }

    // 文档编辑表单提交：用 onsubmit 赋值绑定（不重复；generateDynamicEditForm 也用 onsubmit 覆盖）
    const editDocForm = document.getElementById('editDocForm');
    if (editDocForm) {
        editDocForm.onsubmit = handleEditDocument;
    }

    // 文档替换表单提交
    const replaceDocForm = document.getElementById('replaceDocForm');
    if (replaceDocForm) {
        replaceDocForm.addEventListener('submit', handleReplaceDocument);
    }

    // 导出报告
    const exportReportBtn = document.getElementById('exportReportBtn');
    if (exportReportBtn) {
        exportReportBtn.addEventListener('click', handleExportReport);
    }

    // 关闭模态框
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            closeModal(modal);
        });
    });

    // 点击模态框外部关闭（需要确认，防止误关闭）
        // 关闭模态框（close-modal类按钮，如取消按钮）
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) closeModal(modal);
            });
        });

        // 点击模态框外部关闭（需要确认，防止误关闭）
    // 安全码验证等关键弹窗不允许点击背景关闭
    const noBackdropCloseIds = ['inputModal', 'confirmModal', 'archiveApprovalConfirmModal', 'selectPMOApproverModal', 'newProjectModal', 'editProjectModal', 'systemSettingsModal', 'editDocModal', 'zipUploadModal', 'archiveApprovalConfigModal', 'scheduledReportModal', 'scheduledTaskEditorModal', 'packageProgressModal'];
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                // 关键弹窗不允许点击背景关闭
                if (noBackdropCloseIds.includes(modal.id)) return;
                // 检查模态框内是否有未保存的更改
                const hasUnsavedChanges = checkUnsavedChanges(modal);
                if (hasUnsavedChanges) {
                    showConfirmModal(
                        '确认关闭',
                        '您有未保存的更改，确定要关闭吗？',
                        () => closeModal(modal)
                    );
                } else {
                    closeModal(modal);
                }
            }
        });
    });

    // 设置今天的日期为默认值
    const today = new Date().toISOString().split('T')[0];
    if (elements.docDate) {
        elements.docDate.value = today;
    }
    if (elements.signDate) {
        elements.signDate.value = today;
    }
    
    // 项目下拉菜单选择
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', (e) => {
            const projectId = e.target.value;
            if (projectId) {
                selectProject(projectId);
            } else {
                // 选择了"-- 选择项目 --"
                appState.currentProjectId = null;
                appState.projectConfig = null;
                appState.currentCycle = null;
                if (elements.cycleNavList) elements.cycleNavList.innerHTML = '';
                if (elements.contentArea) {
                    elements.contentArea.innerHTML = `
                        <div class="welcome-message">
                            <h2>欢迎使用项目文档管理中心</h2>
                            <p>请在顶部选择项目，加载配置文件</p>
                            <p>然后在顶部周期导航中选择周期，管理文档</p>
                        </div>
                    `;
                }
                hideProjectButtons();
                // 清除URL参数
                const url = new URL(window.location);
                url.searchParams.delete('project');
                window.history.replaceState({}, '', url);
            }
        });
    }

    // 系统设置按钮
    const systemSettingsMenuItem = document.getElementById('systemSettingsMenuItem');
    const systemSettingsModal = document.getElementById('systemSettingsModal');
    if (systemSettingsMenuItem && systemSettingsModal) {
        systemSettingsMenuItem.addEventListener('click', async (e) => {
            e.preventDefault();
            const user = getCurrentUser();
            if (user && user.role === 'admin') {
                // 刷新最新的系统设置
                try {
                    const latestResp = await fetch('/api/settings', { cache: 'no-store' });
                    const latestResult = await latestResp.json();
                    if (latestResult.status === 'success' && latestResult.data) {
                        appState.systemSettings = latestResult.data;
                    }
                } catch (error) {
                    console.warn('读取最新系统设置失败，使用本地缓存继续:', error);
                }
                // 检查是否需要验证安全码
                const verified = await checkAdminApprovalCodeIfNeeded();
                if (!verified) return;
            }
            loadSystemSettings();
            openModal(systemSettingsModal);
        });
    }

    // 保存设置按钮
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSystemSettings);
    }

    const agreementMarkdownInput = document.getElementById('agreementMarkdownInput');
    if (agreementMarkdownInput) {
        agreementMarkdownInput.addEventListener('input', () => {
            agreementMarkdownDraft = agreementMarkdownInput.value;
            renderAgreementMarkdownPreview(agreementMarkdownDraft);
        });
    }

    // 检查更新按钮
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', checkSystemUpdate);
    }

    // 供模板内联 onchange 调用
    if (typeof window !== 'undefined') {
        window.toggleEmailConfigEditable = toggleEmailConfigEditable;
    }

    // 设置标签页切换
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有active类
            document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
            
            // 添加active类到当前按钮和对应内容
            btn.classList.add('active');
            const tabId = 'settingsTab-' + btn.dataset.tab;
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }
        });
    });
}

function toggleWatermarkConfigRows(enabled) {
    const opacityRow = document.getElementById('watermarkOpacityRow');
    if (opacityRow) opacityRow.style.display = enabled ? 'flex' : 'none';
    const fieldRow = document.getElementById('watermarkFieldRow');
    if (fieldRow) fieldRow.style.display = enabled ? 'flex' : 'none';
    const colorRow = document.getElementById('watermarkColorRow');
    if (colorRow) colorRow.style.display = enabled ? 'flex' : 'none';
}

function getWatermarkFieldSelectionFromDom() {
    const mapping = [
        { id: 'watermarkFieldUsername', value: 'username' },
        { id: 'watermarkFieldDisplayName', value: 'display_name' },
        { id: 'watermarkFieldOrganization', value: 'organization' },
        { id: 'watermarkFieldDatetime', value: 'datetime' },
        { id: 'watermarkFieldCopyright', value: 'copyright' }
    ];
    const selected = mapping
        .filter(item => {
            const el = document.getElementById(item.id);
            return !!el && !!el.checked;
        })
        .map(item => item.value);
    return selected.length > 0 ? selected : ['username', 'display_name', 'organization', 'datetime'];
}

function applyWatermarkFieldSelectionToDom(fields) {
    const selected = new Set(Array.isArray(fields) && fields.length > 0
        ? fields
        : ['username', 'display_name', 'organization', 'datetime']);
    const mapping = [
        { id: 'watermarkFieldUsername', value: 'username' },
        { id: 'watermarkFieldDisplayName', value: 'display_name' },
        { id: 'watermarkFieldOrganization', value: 'organization' },
        { id: 'watermarkFieldDatetime', value: 'datetime' },
        { id: 'watermarkFieldCopyright', value: 'copyright' }
    ];
    mapping.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) el.checked = selected.has(item.value);
    });
}

export async function loadIpBlacklist() {
    const tbody = document.getElementById('ipBlacklistBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:10px;">加载中...</td></tr>';
    try {
        const resp = await fetch('/api/security/blacklist');
        const result = await resp.json();
        if (result.status !== 'success' || !Array.isArray(result.blacklist) || result.blacklist.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:10px;color:#666;">暂无封禁IP</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        result.blacklist.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.ip_address || '-'}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.reason || '-'}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.blocked_at ? String(item.blocked_at).slice(0, 19) : '-'}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;">
                    <button class="btn btn-sm btn-warning" data-unban-ip="${item.ip_address}">解封</button>
                </td>
            `;
            const btn = tr.querySelector('[data-unban-ip]');
            if (btn) btn.addEventListener('click', () => _unbanIp(item.ip_address));
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:10px;color:#dc3545;">加载失败</td></tr>';
    }
}

async function _unbanIp(ip) {
    try {
        const resp = await fetch('/api/security/blacklist/unblock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip_address: ip })
        });
        const result = await resp.json();
        if (result.status === 'success') {
            showNotification('IP解封成功', 'success');
            loadIpBlacklist();
        } else {
            showNotification(result.message || '解封失败', 'error');
        }
    } catch (e) {
        showNotification('解封请求失败', 'error');
    }
}

// 安全码验证缓存：验证通过后一段时间内免再次输入
let _approvalCodeVerifiedAt = 0;
const APPROVAL_CODE_CACHE_MINUTES = 5; // 默认缓存时间(分钟)

async function verifyApprovalCodeForAdminSettings() {
    // 检查缓存是否有效
    const cacheMinutes = Number(appState.systemSettings?.approval_code_cache_minutes) || APPROVAL_CODE_CACHE_MINUTES;
    const elapsed = (Date.now() - _approvalCodeVerifiedAt) / 60000;
    if (_approvalCodeVerifiedAt > 0 && elapsed < cacheMinutes) {
        return true; // 缓存有效，免再次输入
    }

    const askCode = () => new Promise((resolve) => {
        showInputModal('安全校验', [
            { label: '审批安全码', key: 'code', type: 'password', placeholder: '请输入审批安全码' }
        ], (values) => resolve(values || null));
    });

    const askResetCode = () => new Promise((resolve) => {
        showInputModal('首次使用审批安全码，请先完成设置', [
            { label: '当前登录密码', key: 'code', type: 'password', placeholder: '请输入当前登录密码' },
            { label: '新审批安全码', key: 'new_code', type: 'password', placeholder: '至少8位，包含字母和数字' }
        ], (values) => resolve(values || null));
    });

    let payload = await askCode();
    if (!payload || !payload.code) {
        showNotification('已取消安全校验', 'info');
        return false;
    }

    while (true) {
        try {
            const response = await fetch('/api/me/approval-code/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.status === 'success') {
                _approvalCodeVerifiedAt = Date.now();
                return true;
            }

            if (result.status === 'needs_change') {
                const resetValues = await askResetCode();
                if (!resetValues || !resetValues.code || !resetValues.new_code) {
                    showNotification('已取消安全校验', 'info');
                    return false;
                }
                payload = { code: resetValues.code, new_code: resetValues.new_code };
                continue;
            }

            showNotification(result.message || '审批安全码校验失败', 'error');
            return false;
        } catch (error) {
            console.error('审批安全码校验失败:', error);
            showNotification('审批安全码校验失败', 'error');
            return false;
        }
    }
}

/**
 * 检查 admin 访问系统管理功能是否需要验证安全码
 * 返回 true 表示通过验证或无需验证，false 表示验证失败或被取消
 */
export async function checkAdminApprovalCodeIfNeeded() {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        return true; // 非admin不需要验证
    }
    
    // 检查系统设置中是否为 admin 管理功能启用了安全码验证
    const needApprovalCheck = !!(appState.systemSettings && appState.systemSettings.admin_system_settings_require_approval_code);
    if (!needApprovalCheck) {
        return true; // 未启用安全码验证
    }
    
    return await verifyApprovalCodeForAdminSettings();
}

function toggleEmailConfigEditable(enabled) {
    document.querySelectorAll('.email-config-input').forEach((el) => {
        const shouldDisable = !enabled;
        if (el.tagName === 'BUTTON') {
            el.disabled = shouldDisable;
            el.style.opacity = shouldDisable ? '0.6' : '';
            el.style.cursor = shouldDisable ? 'not-allowed' : '';
        } else {
            el.disabled = shouldDisable;
            el.style.backgroundColor = shouldDisable ? '#f3f4f6' : '';
            el.style.color = shouldDisable ? '#999' : '';
        }
    });
}


/**
 * 将系统名称应用到页面标题（供初始化时调用）
 */
function _applySystemNameToPage(systemName) {
    if (!systemName) return;
    document.title = systemName;
    const projectTitle = document.getElementById('projectTitle');
    if (projectTitle) {
        // 保留版本号徽章 span
        const badge = projectTitle.querySelector('span#appVersion');
        projectTitle.innerHTML = '📁 ' + systemName + ' ';
        if (badge) {
            projectTitle.appendChild(badge);
        }
    }
}

/**
 * 页面初始化时读取系统设置并应用到标题（不打开弹窗）
 */
export async function applySystemSettingsToPage() {
    try {
        const response = await fetch('/api/settings', { cache: 'no-store' });
        const result = await response.json();
        if (result.status === 'success' && result.data) {
            const settings = result.data;
            _applySystemNameToPage(settings.system_name);
            // 存储到 appState 供其他地方使用
            appState.systemSettings = settings;
            applyDynamicWatermark(settings);
        }
    } catch (error) {
        console.warn('初始化系统设置失败（不影响主流程）:', error);
    }
}

function ensureWatermarkLayer(opacity) {
    let layer = document.getElementById('globalWatermarkLayer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'globalWatermarkLayer';
        layer.style.position = 'fixed';
        layer.style.inset = '0';
        layer.style.pointerEvents = 'none';
        layer.style.backgroundRepeat = 'repeat';
        layer.style.backgroundPosition = '0 0';
        document.body.appendChild(layer);
    }
    // 水印必须覆盖在所有元素（包括模态框、菜单）之上
    layer.style.zIndex = '2147483647';
    if (opacity !== undefined) {
        layer.style.opacity = String(Math.max(0.02, Math.min(1, opacity)));
    }
    return layer;
}

function formatNow() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function buildWatermarkImage(text, color = '#3c3c3c') {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px Microsoft YaHei';
    ctx.fillStyle = color || '#3c3c3c';
    // 支持多行：按 \n 分割
    const lines = text.split('\n');
    const lineHeight = 22;
    const startY = -((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, 0, startY + i * lineHeight);
    });
    return canvas.toDataURL('image/png');
}

function applyDynamicWatermark(settings) {
    const enabled = !!settings?.watermark_enabled;
    const existing = document.getElementById('globalWatermarkLayer');

    if (!enabled) {
        if (watermarkTimer) {
            clearInterval(watermarkTimer);
            watermarkTimer = null;
        }
        if (existing) existing.remove();
        return;
    }

    // watermark_opacity 存储为 5-60 的整数，转成 0-1 浮点
    const opacityPct = Number(settings?.watermark_opacity ?? 15);
    const opacity = Math.max(0.02, Math.min(1, opacityPct / 100));

    const user = getCurrentUser();
    const username = user?.username || 'unknown';
    const displayName = user?.display_name || user?.username || '-';
    const org = user?.organization || '-';
    const copyrightText = settings?.author || '-';
    const wmColor = typeof settings?.watermark_color === 'string' ? settings.watermark_color : '#3c3c3c';
    const selectedFieldsRaw = settings?.watermark_content_fields;
    const selectedFields = Array.isArray(selectedFieldsRaw) && selectedFieldsRaw.length > 0
        ? selectedFieldsRaw
        : ['username', 'display_name', 'organization', 'datetime'];

    const render = () => {
        const layer = ensureWatermarkLayer(opacity);
        const line1Parts = [];
        const line2Parts = [];
        if (selectedFields.includes('username')) line1Parts.push(username);
        if (selectedFields.includes('display_name')) line1Parts.push(displayName);
        if (selectedFields.includes('organization')) line1Parts.push(org);
        if (selectedFields.includes('datetime')) line2Parts.push(formatNow());
        if (selectedFields.includes('copyright')) line2Parts.push(`版权所有:${copyrightText}`);
        let text;
        if (line1Parts.length > 0 || line2Parts.length > 0) {
            const l1 = line1Parts.length > 0 ? line1Parts.join(' | ') : '';
            const l2 = line2Parts.length > 0 ? line2Parts.join(' | ') : '';
            text = [l1, l2].filter(Boolean).join('\n');
        } else {
            text = `${username} | ${displayName} | ${org}\n${formatNow()}`;
        }
        layer.style.backgroundImage = `url(${buildWatermarkImage(text, wmColor)})`;
        layer.style.display = 'block';
    };
    const watermarkEnabled = document.getElementById('watermarkEnabled');
    if (watermarkEnabled) {
        watermarkEnabled.addEventListener('change', () => {
            toggleWatermarkConfigRows(!!watermarkEnabled.checked);
        });
    }

    render();
    if (watermarkTimer) clearInterval(watermarkTimer);
    watermarkTimer = setInterval(render, 1000);
}

/**
 * 加载系统设置（打开设置弹窗时调用，填充表单）
 */
async function loadSystemSettings() {
    try {
        const response = await fetch('/api/settings', { cache: 'no-store' });
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            const settings = result.data;
            
            // 填充基本信息
            const systemName = document.getElementById('systemName');
            const systemVersion = document.getElementById('systemVersion');
            const systemAuthor = document.getElementById('systemAuthor');
            const currentVersionDisplay = document.getElementById('currentVersionDisplay');
            
            if (systemName) systemName.value = settings.system_name || '';
            if (systemVersion) systemVersion.value = settings.version || '';
            if (systemAuthor) systemAuthor.value = settings.author || '';
            if (currentVersionDisplay) currentVersionDisplay.textContent = settings.current_version || '-';
            
            // 填充功能设置
            const fastPreviewThreshold = document.getElementById('fastPreviewThreshold');
            if (fastPreviewThreshold) {
                // 从设置中读取，默认5MB
                const thresholdMB = settings.fast_preview_threshold || 5;
                fastPreviewThreshold.value = thresholdMB;
            }
            
            const emailNotificationEnabled = document.getElementById('emailNotificationEnabled');
            if (emailNotificationEnabled) {
                emailNotificationEnabled.checked = !!settings.email_notification_enabled;
                toggleEmailConfigEditable(emailNotificationEnabled.checked);
            }

            const forceAgreementOnLogin = document.getElementById('forceAgreementOnLogin');
            if (forceAgreementOnLogin) {
                forceAgreementOnLogin.checked = !!settings.force_agreement_on_login;
            }

            const adminArchiveApprovalEnabled = document.getElementById('adminArchiveApprovalEnabled');
            if (adminArchiveApprovalEnabled) {
                // 确保正确识别 false：只要不是严格等于 true，就认为是 false
                adminArchiveApprovalEnabled.checked = settings.admin_archive_approval_enabled === true;
            }

            const adminSystemSettingsRequireApprovalCode = document.getElementById('adminSystemSettingsRequireApprovalCode');
            if (adminSystemSettingsRequireApprovalCode) {
                adminSystemSettingsRequireApprovalCode.checked = settings.admin_system_settings_require_approval_code === true;
            }

            const watermarkEnabled = document.getElementById('watermarkEnabled');
            if (watermarkEnabled) {
                watermarkEnabled.checked = !!settings.watermark_enabled;
                toggleWatermarkConfigRows(!!settings.watermark_enabled);
            }
            const watermarkOpacity = document.getElementById('watermarkOpacity');
            const watermarkOpacityValue = document.getElementById('watermarkOpacityValue');
            if (watermarkOpacity) {
                const opacityVal = Number(settings.watermark_opacity ?? 15);
                watermarkOpacity.value = opacityVal;
                if (watermarkOpacityValue) watermarkOpacityValue.textContent = opacityVal;
            }
            const watermarkColor = document.getElementById('watermarkColor');
            const watermarkColorValue = document.getElementById('watermarkColorValue');
            if (watermarkColor) {
                const colorVal = String(settings.watermark_color || '#3c3c3c');
                watermarkColor.value = colorVal;
                if (watermarkColorValue) watermarkColorValue.textContent = colorVal;
            }
            applyWatermarkFieldSelectionToDom(settings.watermark_content_fields);

            agreementMarkdownDraft = settings.agreement_markdown || '';
            const agreementMarkdownInput = document.getElementById('agreementMarkdownInput');
            if (agreementMarkdownInput) {
                agreementMarkdownInput.value = agreementMarkdownDraft;
            }
            renderAgreementMarkdownPreview(agreementMarkdownDraft);

            const logRetentionDays = document.getElementById('logRetentionDays');
            if (logRetentionDays) {
                logRetentionDays.value = settings.log_retention_days || 30;
            }

            const systemTimezone = document.getElementById('systemTimezone');
            if (systemTimezone) {
                systemTimezone.value = settings.timezone || 'Asia/Shanghai';
            }

            const passwordMinLength = document.getElementById('passwordMinLength');
            if (passwordMinLength) {
                passwordMinLength.value = Number(settings.password_min_length ?? 8);
            }
            const passwordRequireLetterDigit = document.getElementById('passwordRequireLetterDigit');
            if (passwordRequireLetterDigit) {
                passwordRequireLetterDigit.checked = settings.password_require_letter_digit !== false;
            }
            const approvalCodeMustDifferFromPassword = document.getElementById('approvalCodeMustDifferFromPassword');
            if (approvalCodeMustDifferFromPassword) {
                approvalCodeMustDifferFromPassword.checked = settings.approval_code_must_differ_from_password !== false;
            }
            const passwordExpireDays = document.getElementById('passwordExpireDays');
            if (passwordExpireDays) {
                passwordExpireDays.value = Number(settings.password_expire_days ?? 0);
            }

            // 填充邮件配置
            const smtpHost = document.getElementById('smtpHost');
            if (smtpHost) smtpHost.value = settings.smtp_host || '';
            const smtpPort = document.getElementById('smtpPort');
            if (smtpPort) smtpPort.value = settings.smtp_port || 465;
            const smtpUsername = document.getElementById('smtpUsername');
            if (smtpUsername) smtpUsername.value = settings.smtp_username || '';
            const smtpPassword = document.getElementById('smtpPassword');
            if (smtpPassword) smtpPassword.value = settings.smtp_password || '';
            const smtpSender = document.getElementById('smtpSender');
            if (smtpSender) smtpSender.value = settings.smtp_sender || '';
            const smtpEncryption = document.getElementById('smtpEncryption');
            if (smtpEncryption) smtpEncryption.value = settings.smtp_encryption || 'ssl';
        }
    } catch (error) {
        console.error('加载系统设置失败:', error);
        showNotification('加载设置失败', 'error');
    }
}

/**
 * 保存系统设置
 */
async function saveSystemSettings() {
    try {
        const systemName = document.getElementById('systemName');
        const systemAuthor = document.getElementById('systemAuthor');
        const fastPreviewThreshold = document.getElementById('fastPreviewThreshold');
        
        const settings = {
            system_name: systemName ? systemName.value : '',
            author: systemAuthor ? systemAuthor.value : ''
        };
        
        // 添加功能设置
        if (fastPreviewThreshold) {
            const thresholdValue = parseInt(fastPreviewThreshold.value, 10);
            settings.fast_preview_threshold = isNaN(thresholdValue) || thresholdValue < 1 ? 5 : thresholdValue;
        }
        
        const emailNotificationEnabled = document.getElementById('emailNotificationEnabled');
        if (emailNotificationEnabled) {
            settings.email_notification_enabled = emailNotificationEnabled.checked;
        }
        // require_approval_code 不在此处设置，保留服务端现有值

        const forceAgreementOnLogin = document.getElementById('forceAgreementOnLogin');
        if (forceAgreementOnLogin) {
            settings.force_agreement_on_login = forceAgreementOnLogin.checked;
        }

        const adminArchiveApprovalEnabled = document.getElementById('adminArchiveApprovalEnabled');
        if (adminArchiveApprovalEnabled) {
            settings.admin_archive_approval_enabled = adminArchiveApprovalEnabled.checked;
        }

        const adminSystemSettingsRequireApprovalCode = document.getElementById('adminSystemSettingsRequireApprovalCode');
        if (adminSystemSettingsRequireApprovalCode) {
            settings.admin_system_settings_require_approval_code = adminSystemSettingsRequireApprovalCode.checked;
        }

        const watermarkEnabled = document.getElementById('watermarkEnabled');
        if (watermarkEnabled) {
            settings.watermark_enabled = watermarkEnabled.checked;
        }
        const watermarkOpacity = document.getElementById('watermarkOpacity');
        if (watermarkOpacity) {
            settings.watermark_opacity = parseInt(watermarkOpacity.value, 10) || 15;
        }
        const watermarkColor = document.getElementById('watermarkColor');
        if (watermarkColor) {
            settings.watermark_color = watermarkColor.value || '#3c3c3c';
        }
        settings.watermark_content_fields = getWatermarkFieldSelectionFromDom();

        const agreementMarkdownInput = document.getElementById('agreementMarkdownInput');
        if (agreementMarkdownInput) {
            agreementMarkdownDraft = agreementMarkdownInput.value;
        }
        settings.agreement_markdown = agreementMarkdownDraft;

        const logRetentionDays = document.getElementById('logRetentionDays');
        if (logRetentionDays) {
            const daysValue = parseInt(logRetentionDays.value, 10);
            settings.log_retention_days = isNaN(daysValue) || daysValue < 1 ? 30 : daysValue;
        }

        const systemTimezone = document.getElementById('systemTimezone');
        if (systemTimezone) {
            settings.timezone = systemTimezone.value || 'Asia/Shanghai';
        }

        const passwordMinLength = document.getElementById('passwordMinLength');
        if (passwordMinLength) {
            settings.password_min_length = Math.max(6, parseInt(passwordMinLength.value, 10) || 8);
        }
        const passwordRequireLetterDigit = document.getElementById('passwordRequireLetterDigit');
        if (passwordRequireLetterDigit) {
            settings.password_require_letter_digit = passwordRequireLetterDigit.checked;
        }
        const approvalCodeMustDifferFromPassword = document.getElementById('approvalCodeMustDifferFromPassword');
        if (approvalCodeMustDifferFromPassword) {
            settings.approval_code_must_differ_from_password = approvalCodeMustDifferFromPassword.checked;
        }
        const passwordExpireDays = document.getElementById('passwordExpireDays');
        if (passwordExpireDays) {
            settings.password_expire_days = Math.max(0, parseInt(passwordExpireDays.value, 10) || 0);
        }

        // SMTP 邮件配置
        const smtpHost = document.getElementById('smtpHost');
        if (smtpHost) settings.smtp_host = smtpHost.value.trim();
        const smtpPort = document.getElementById('smtpPort');
        if (smtpPort) settings.smtp_port = parseInt(smtpPort.value, 10) || 465;
        const smtpUsername = document.getElementById('smtpUsername');
        if (smtpUsername) settings.smtp_username = smtpUsername.value.trim();
        const smtpPassword = document.getElementById('smtpPassword');
        if (smtpPassword) settings.smtp_password = smtpPassword.value;
        const smtpSender = document.getElementById('smtpSender');
        if (smtpSender) settings.smtp_sender = smtpSender.value.trim();
        const smtpEncryption = document.getElementById('smtpEncryption');
        if (smtpEncryption) settings.smtp_encryption = smtpEncryption.value;

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('设置已保存', 'success');
            
            // 更新页面标题
            _applySystemNameToPage(settings.system_name);
            appState.systemSettings = result.data || settings;
            applyDynamicWatermark(appState.systemSettings);
            
            closeModal(document.getElementById('systemSettingsModal'));
        } else {
            showNotification('保存失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('保存系统设置失败:', error);
        showNotification('保存设置失败', 'error');
    }
}

/**
 * 立即归档旧日志
 */
async function archiveLogsNow() {
    showConfirmModal('归档日志', '确定要立即归档超过保留天数的日志吗？', async () => {
        try {
            const response = await fetch('/api/admin/logs/archive', { method: 'POST' });
            const result = await response.json();
            if (result.status === 'success') {
                showNotification(result.message || '归档完成', 'success');
            } else {
                showNotification('归档失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('归档日志失败:', error);
            showNotification('归档请求失败', 'error');
        }
    });
}

function renderAgreementMarkdownPreview(markdownText) {
    const preview = document.getElementById('agreementMarkdownPreview');
    if (!preview) return;
    preview.innerHTML = renderSimpleMarkdown(markdownText || '');
}

export function openAgreementEditorModal() {
    const modal = document.getElementById('agreementEditorModal');
    if (!modal) return;

    agreementMarkdownDraft = appState.systemSettings?.agreement_markdown || agreementMarkdownDraft || '';
    const input = document.getElementById('agreementMarkdownInput');
    if (input) {
        input.value = agreementMarkdownDraft;
    }
    renderAgreementMarkdownPreview(agreementMarkdownDraft);
    openModal(modal);
}

export function closeAgreementEditorModal() {
    const modal = document.getElementById('agreementEditorModal');
    if (modal) {
        closeModal(modal);
    }
}

export async function saveAgreementMarkdown() {
    const input = document.getElementById('agreementMarkdownInput');
    agreementMarkdownDraft = input ? input.value : agreementMarkdownDraft;

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ agreement_markdown: agreementMarkdownDraft })
        });
        const result = await response.json();
        if (result.status === 'success') {
            appState.systemSettings = {
                ...(appState.systemSettings || {}),
                ...(result.data || {}),
                agreement_markdown: agreementMarkdownDraft
            };
            showNotification('协议内容已保存', 'success');
            closeAgreementEditorModal();
        } else {
            showNotification('保存失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('保存协议内容失败:', error);
        showNotification('保存协议内容失败', 'error');
    }
}

export async function importAgreementMarkdown(fileInput) {
    const file = fileInput?.files?.[0];
    if (!file) return;

    try {
        agreementMarkdownDraft = await file.text();
        const input = document.getElementById('agreementMarkdownInput');
        if (input) {
            input.value = agreementMarkdownDraft;
        }
        renderAgreementMarkdownPreview(agreementMarkdownDraft);
        showNotification('协议内容已导入', 'success');
    } catch (error) {
        console.error('导入协议内容失败:', error);
        showNotification('协议导入失败', 'error');
    } finally {
        if (fileInput) {
            fileInput.value = '';
        }
    }
}

/**
 * 导入日志文件
 */
async function importLogsFile(input) {
    const file = input.files[0];
    if (!file) return;
    showConfirmModal('导入日志', `确定要导入日志文件 "${file.name}" 吗？`, async () => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch('/api/admin/logs/import', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.status === 'success') {
                showNotification(result.message || '导入成功', 'success');
            } else {
                showNotification('导入失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('导入日志失败:', error);
            showNotification('导入请求失败', 'error');
        } finally {
            input.value = '';
        }
    }, () => {
        input.value = '';
    });
}

/**
 * 检查系统更新
 */
async function checkSystemUpdate() {
    const updateMessage = document.getElementById('updateMessage');
    const latestVersionInfo = document.getElementById('latestVersionInfo');
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    
    if (updateMessage) {
        updateMessage.style.display = 'block';
        updateMessage.className = 'info';
        updateMessage.textContent = '正在检查更新...';
    }
    
    if (checkUpdateBtn) {
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.textContent = '检查中...';
    }
    
    try {
        const response = await fetch('/api/settings/check-update');
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            const data = result.data;
            
            if (data.has_update) {
                if (updateMessage) {
                    updateMessage.className = 'warning';
                    updateMessage.innerHTML = `
                        <strong>发现新版本！</strong><br>
                        当前版本: ${data.current_version}<br>
                        最新版本: ${data.latest_version}<br>
                        <a href="${data.download_url}" target="_blank" style="color: #1890ff;">点击下载更新</a>
                    `;
                }
                if (latestVersionInfo) {
                    latestVersionInfo.innerHTML = `<span style="color: #ff4d4f;">有新版本: ${data.latest_version}</span>`;
                }
            } else {
                if (updateMessage) {
                    updateMessage.className = 'success';
                    updateMessage.textContent = '已是最新版本！';
                }
                if (latestVersionInfo) {
                    latestVersionInfo.textContent = '已是最新版本';
                }
            }
        } else {
            if (updateMessage) {
                updateMessage.className = 'error';
                updateMessage.textContent = '检查更新失败: ' + (result.message || '未知错误');
            }
        }
    } catch (error) {
        console.error('检查更新失败:', error);
        if (updateMessage) {
            updateMessage.className = 'error';
            updateMessage.textContent = '检查更新失败: 网络错误';
        }
    } finally {
        if (checkUpdateBtn) {
            checkUpdateBtn.disabled = false;
            checkUpdateBtn.textContent = '检查更新';
        }
    }
}

/**
 * 初始化文档模态框宽度调整器
 */
export function initDocModalResizer() {
    const resizer = document.getElementById('docModalResizer');
    if (!resizer) return;
    
    let isResizing = false;
    let startX, startWidth;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        const leftPanel = resizer.previousElementSibling;
        startWidth = leftPanel.offsetWidth;
        
        // 添加全局鼠标事件监听
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // 防止文本选择
        e.preventDefault();
    });
    
    function handleMouseMove(e) {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX;
        const leftPanel = resizer.previousElementSibling;
        const rightPanel = resizer.nextElementSibling;
        const container = resizer.parentElement;
        const containerWidth = container.offsetWidth;
        const newLeftWidth = startWidth + deltaX;
        
        // 限制最小宽度和最大宽度
        if (newLeftWidth > 400 && newLeftWidth < containerWidth - 350) {
            leftPanel.style.width = newLeftWidth + 'px';
            leftPanel.style.flex = 'none';
            
            // 计算右侧面板的新宽度
            const newRightWidth = containerWidth - newLeftWidth - resizer.offsetWidth;
            rightPanel.style.width = newRightWidth + 'px';
            rightPanel.style.flex = 'none';
        }
    }
    
    function handleMouseUp() {
        isResizing = false;
        // 移除全局鼠标事件监听
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}

/**
 * 初始化日志框拖拽调整高度
 */
export function initLogResize() {
    const resizer = document.getElementById('logResizeHandle');
    if (!resizer) return;
    
    let isResizing = false;
    let startY, startHeight;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        const logPanel = resizer.parentElement;
        startHeight = logPanel.offsetHeight;
        
        // 添加全局鼠标事件监听
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // 防止文本选择
        e.preventDefault();
    });
    
    function handleMouseMove(e) {
        if (!isResizing) return;
        
        const deltaY = e.clientY - startY;
        const logPanel = resizer.parentElement;
        const newHeight = startHeight - deltaY;
        
        // 限制最小高度
        if (newHeight > 100) {
            logPanel.style.height = newHeight + 'px';
        }
    }
    
    function handleMouseUp() {
        isResizing = false;
        // 移除全局鼠标事件监听
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}

/**
 * 显示确认弹窗
 * @param {string} title - 弹窗标题
 * @param {string} message - 弹窗内容（支持HTML）
 * @param {Function} onConfirm - 确认回调
 * @param {Function} onCancel - 取消回调
 * @param {Object} options - 额外选项 { allowHtml: boolean, okText: string, cancelText: string }
 */
export function showConfirmModal(title, message, onConfirm, onCancel, options = {}) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const okBtn = document.getElementById('confirmOkBtn');
    
    titleEl.textContent = title;
    
    // 支持HTML内容或纯文本
    if (options.allowHtml) {
        messageEl.innerHTML = message;
    } else {
        messageEl.textContent = message;
    }
    
    // 自定义按钮文字
    if (options.okText) okBtn.textContent = options.okText;
    else okBtn.textContent = '确定';
    
    if (options.cancelText) cancelBtn.textContent = options.cancelText;
    else cancelBtn.textContent = '取消';
    
    // 清除之前的绑定，避免重复绑定
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    // 取消按钮
    newCancelBtn.addEventListener('click', () => {
        closeConfirmModal();
        if (onCancel) onCancel();
    });
    
    // 确认按钮
    newOkBtn.addEventListener('click', () => {
        closeConfirmModal();
        if (onConfirm) onConfirm();
    });
    
    modal.classList.add('show');
}

/**
 * 关闭确认弹窗
 */
export function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
}

/**
 * 显示通用输入框模态框
 * @param {string} title - 弹窗标题
 * @param {Array} fields - 字段数组，每项格式：{ label, key, value, placeholder }
 * @param {Function} onConfirm - 确认回调，参数为 { key: value } 对象
 */
export function showInputModal(title, fields, onConfirm) {
    const modal = document.getElementById('inputModal');
    const titleEl = document.getElementById('inputModalTitle');
    const fieldsEl = document.getElementById('inputModalFields');
    const okBtn = document.getElementById('inputModalOkBtn');
    const cancelBtn = document.getElementById('inputModalCancelBtn');

    titleEl.textContent = title;

    // 渲染字段
    fieldsEl.innerHTML = fields.map(f => {
        if (f.type === 'select' && f.options) {
            return `
                <div class="input-modal-field">
                    <label class="input-modal-label">${f.label}</label>
                    <select class="input-modal-input" data-key="${f.key}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
                        ${f.placeholder ? `<option value="">${f.placeholder}</option>` : ''}
                        ${f.options.map(opt => `<option value="${(opt.value || '').replace(/"/g, '&quot;')}">${opt.label || opt.value}</option>`).join('')}
                    </select>
                </div>
            `;
        }
        return `
            <div class="input-modal-field">
                <label class="input-modal-label">${f.label}</label>
                <input type="${f.type || 'text'}" class="input-modal-input" data-key="${f.key}"
                    value="${(f.value || '').replace(/"/g, '&quot;')}"
                    placeholder="${(f.placeholder || '').replace(/"/g, '&quot;')}" />
            </div>
        `;
    }).join('');

    // 聚焦第一个输入框
    const firstInput = fieldsEl.querySelector('input, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 80);

    // 重绑确认按钮（cloneNode 避免重复事件）
    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    const doConfirm = () => {
        const result = {};
        fieldsEl.querySelectorAll('[data-key]').forEach(el => {
            result[el.dataset.key] = el.value;
        });
        closeInputModal();
        if (onConfirm) onConfirm(result);
    };

    newOkBtn.addEventListener('click', doConfirm);
    newCancelBtn.addEventListener('click', () => {
        closeInputModal();
        if (onConfirm) onConfirm(null);
    });

    // 回车确认
    fieldsEl.addEventListener('keydown', function handler(e) {
        if (e.key === 'Enter') {
            fieldsEl.removeEventListener('keydown', handler);
            doConfirm();
        }
    });

    modal.classList.add('show');
}

/**
 * 关闭输入框模态框
 */
export function closeInputModal() {
    document.getElementById('inputModal').classList.remove('show');
}

/**
 * 显示目录选择模态框
 * @param {string} title - 弹窗标题
 * @param {Array} existingDirectories - 已存在的目录列表
 * @param {Function} onConfirm - 确认回调，参数为选择的目录
 */
export function showDirectorySelectModal(title, existingDirectories, onConfirm) {
    const modal = document.getElementById('directorySelectModal');
    const titleEl = document.getElementById('directorySelectModalTitle');
    const selectEl = document.getElementById('existingDirectorySelect');
    const inputEl = document.getElementById('newDirectoryInput');
    const okBtn = document.getElementById('directorySelectOkBtn');

    titleEl.textContent = title;

    // 渲染已存在的目录选项
    selectEl.innerHTML = '<option value="">-- 选择已存在的目录 --</option>';
    existingDirectories.forEach(dir => {
        const option = document.createElement('option');
        option.value = dir;
        option.textContent = dir;
        selectEl.appendChild(option);
    });

    // 清空输入框
    inputEl.value = '';

    // 重绑确认按钮（cloneNode 避免重复事件）
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    const doConfirm = () => {
        let directory = '';
        
        // 优先使用下拉框选择，如果下拉框为空则使用输入框
        if (selectEl.value) {
            directory = selectEl.value;
        } else if (inputEl.value.trim()) {
            directory = inputEl.value.trim();
        }
        
        closeDirectorySelectModal();
        if (onConfirm) onConfirm(directory);
    };

    newOkBtn.addEventListener('click', doConfirm);

    // 监听下拉框变化，清空输入框
    selectEl.addEventListener('change', () => {
        if (selectEl.value) {
            inputEl.value = '';
        }
    });

    // 监听输入框变化，清空下拉框
    inputEl.addEventListener('input', () => {
        if (inputEl.value.trim()) {
            selectEl.value = '';
        }
    });

    // 回车确认
    inputEl.addEventListener('keydown', function handler(e) {
        if (e.key === 'Enter') {
            inputEl.removeEventListener('keydown', handler);
            doConfirm();
        }
    });

    modal.classList.add('show');
}

/**
 * 关闭目录选择模态框
 */
export function closeDirectorySelectModal() {
    document.getElementById('directorySelectModal').classList.remove('show');
}

/**
 * 打开模态框
 */
export function openModal(modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭模态框
 */
export function closeModal(modal) {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
}

/**
 * 检查模态框内是否有未保存的更改
 */
function checkUnsavedChanges(modal) {
    if (!modal) return false;
    
    // 检查表单输入
    const inputs = modal.querySelectorAll('input[type="text"], input[type="date"], textarea');
    for (const input of inputs) {
        if (input.value && input.value.trim() !== '') {
            return true;
        }
    }
    
    // 检查复选框
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
        if (checkbox.checked) {
            return true;
        }
    }
    
    // 检查文件选择
    const fileInputs = modal.querySelectorAll('input[type="file"]');
    for (const fileInput of fileInputs) {
        if (fileInput.files && fileInput.files.length > 0) {
            return true;
        }
    }
    
    return false;
}

/**
 * 显示加载指示器
 */
export function showLoading(show = true) {
    if (elements.loadingIndicator) {
        if (show) {
            elements.loadingIndicator.classList.add('show');
        } else {
            elements.loadingIndicator.classList.remove('show');
        }
    }
}

/**
 * 显示通知
 */
export function showNotification(message, type = 'info', duration = 3000) {
    if (elements.notification) {
        elements.notification.textContent = message;
        elements.notification.className = `notification show ${type}`;

        // 指定时间后自动隐藏（默认3秒）
        setTimeout(() => {
            if (elements.notification) {
                elements.notification.classList.remove('show');
            }
        }, duration);
    } else {
        console.log('Notification element not found:', message);
    }
}

/**
 * 显示操作进度
 */
export function showOperationProgress(id, title) {
    const container = document.getElementById('operationProgress');
    if (!container) {
        console.warn('operationProgress 容器未找到');
        return null;
    }
    const progressEl = document.createElement('div');
    progressEl.id = `progress-${id}`;
    progressEl.className = 'operation-progress-item';
    progressEl.innerHTML = `
        <div class="progress-title">${title}</div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: 0%"></div>
        </div>
        <div class="progress-text">准备中...</div>
    `;
    
    container.appendChild(progressEl);
    
    return {
        update: function(percent, text) {
            const bar = progressEl.querySelector('.progress-bar');
            const textEl = progressEl.querySelector('.progress-text');
            if (bar) bar.style.width = percent + '%';
            if (textEl) textEl.textContent = text;
        },
        close: function() {
            if (progressEl.parentNode) {
                progressEl.parentNode.removeChild(progressEl);
            }
        },
        complete: function(text) {
            const textEl = progressEl.querySelector('.progress-text');
            if (textEl) textEl.textContent = text;
            setTimeout(() => {
                if (progressEl.parentNode) {
                    progressEl.parentNode.removeChild(progressEl);
                }
            }, 2000);
        },
        error: function(text) {
            const textEl = progressEl.querySelector('.progress-text');
            if (textEl) {
                textEl.textContent = text;
                textEl.style.color = '#dc3545';
            }
            setTimeout(() => {
                if (progressEl.parentNode) {
                    progressEl.parentNode.removeChild(progressEl);
                }
            }, 3000);
        }
    };
}

/**
 * 切换操作日志显示
 */
export function toggleOperationLog() {
    const logPanel = document.getElementById('operationLog');
    if (logPanel) {
        logPanel.style.display = logPanel.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * 刷新操作日志
 */
export function refreshOperationLog() {
    const logContent = document.getElementById('logContent');
    if (logContent) {
        logContent.innerHTML = '<p class="placeholder">暂无操作日志</p>';
    }
}

/**
 * 切换上传来源 Tab（local / zip）
 */
export function switchUploadTab(tab) {
    document.querySelectorAll('.upload-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const localPanel = document.getElementById('uploadSourceLocal');
    const zipPanel = document.getElementById('uploadSourceZip');
    if (localPanel) localPanel.style.display = tab === 'local' ? 'block' : 'none';
    if (zipPanel) zipPanel.style.display = tab === 'zip' ? 'block' : 'none';

    // 切到 ZIP 面板时自动加载
    if (tab === 'zip') {
        loadZipPackagesList();
        // 自动执行搜索
        setTimeout(() => {
            const zipFileSearch = document.getElementById('zipFileSearch');
            if (zipFileSearch) {
                const kw = zipFileSearch.value.trim();
                searchZipFilesInPackage(kw, appState.currentZipPackagePath || '');
            }
        }, 500);
    }
}

/**
 * 切换主标签页
 */
export function switchMainTab(tabName) {
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.main-tab-content').forEach(content => content.style.display = 'none');
    
    document.querySelector(`.main-tab-btn[data-tab="${tabName}"]`).classList.add('active');
    
    // 处理标签页ID，将upload-select转换为uploadSelectTab
    let tabId;
    if (tabName === 'upload-select') {
        tabId = 'uploadSelectTab';
    } else {
        tabId = `${tabName}Tab`;
    }
    
    document.getElementById(tabId).style.display = 'block';
    
    // 如果切换到维护标签页，更新已选择文档列表
    if (tabName === 'maintain') {
        updateSelectedDocumentsList();
    }
}

/**
 * 更新已选择文档列表
 */
export function updateSelectedDocumentsList() {
    // 当切换到维护标签页时，加载实际的已归档文档
    const cycle = appState.currentCycle;
    const docName = appState.currentDocument;
    if (cycle && docName) {
        loadUploadedDocuments(cycle, docName);
    }
    
    // 更新选择计数
    const selectedCount = document.getElementById('selectedCount');
    if (selectedCount) {
        // 这里可以根据实际选择的文档数量更新
        selectedCount.textContent = '已选择 0 个文档';
    }
}

/**
 * 显示项目按钮
 */
export function showProjectButtons() {
    const user = getCurrentUser();
    const isContractor = user && user.role === 'contractor';

    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu',
        'acceptanceMenu', 'archiveAndApprovalMenu'
    ];

    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (!menu) return;
        // contractor 不显示文档需求和验收菜单
        if (isContractor && (menuId === 'documentRequirementsMenu' || menuId === 'acceptanceMenu')) {
            menu.style.display = 'none';
        } else {
            menu.style.display = 'inline-block';
        }
    });
    
    // 显示生成报告按钮
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) {
        generateReportBtn.style.display = isContractor ? 'none' : 'inline-block';
    }
    
    // 显示备份项目按钮
    const packageProjectBtn = document.getElementById('packageProjectBtn');
    if (packageProjectBtn) {
        packageProjectBtn.style.display = isContractor ? 'none' : 'inline-block';
    }
}

/**
 * 隐藏项目按钮
 */
export function hideProjectButtons() {
    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu',
        'acceptanceMenu', 'archiveAndApprovalMenu'
    ];

    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'none';
    });
    
    // 隐藏生成报告按钮
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) generateReportBtn.style.display = 'none';
    
    // 隐藏备份项目按钮
    const packageProjectBtn = document.getElementById('packageProjectBtn');
    if (packageProjectBtn) packageProjectBtn.style.display = 'none';
}

/**
 * 打开清理重复文档模态框
 */
export function openCleanupDuplicatesModal() {
    const modal = document.getElementById('cleanupDuplicatesModal');
    if (!modal) return;
    
    // 重置状态
    document.getElementById('cleanupInitialState').style.display = 'block';
    document.getElementById('cleanupProgressState').style.display = 'none';
    document.getElementById('cleanupResultState').style.display = 'none';
    document.getElementById('cleanupProgressBar').style.width = '0%';
    document.getElementById('cleanupProgressMessage').textContent = '准备中...';
    
    modal.classList.add('show');
}

/**
 * 关闭清理重复文档模态框
 */
export function closeCleanupDuplicatesModal() {
    const modal = document.getElementById('cleanupDuplicatesModal');
    if (modal) modal.classList.remove('show');
}

/**
 * 开始清理重复文档
 */
export async function startCleanupDuplicates() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 显示进度状态
    document.getElementById('cleanupInitialState').style.display = 'none';
    document.getElementById('cleanupProgressState').style.display = 'block';
    document.getElementById('cleanupProgressBar').style.width = '30%';
    document.getElementById('cleanupProgressMessage').textContent = '正在锁定项目...';
    
    try {
        // 先锁定项目
        const lockResponse = await fetch('/api/tasks/lock-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                session_id: appState.sessionId
            })
        });
        
        const lockResult = await lockResponse.json();
        if (lockResult.status === 'error' && lockResult.locked) {
            document.getElementById('cleanupProgressBar').style.width = '100%';
            document.getElementById('cleanupProgressMessage').textContent = '项目已被其他会话锁定，无法处理';
            showNotification('项目正在被其他用户使用，请稍后再试', 'error');
            setTimeout(() => {
                closeCleanupDuplicatesModal();
            }, 2000);
            return;
        }
        
        document.getElementById('cleanupProgressBar').style.width = '50%';
        document.getElementById('cleanupProgressMessage').textContent = '正在扫描重复文档...';
        
        // 调用清理API
        const response = await fetch('/api/documents/cleanup-duplicates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                project_name: appState.projectConfig?.name
            })
        });
        
        document.getElementById('cleanupProgressBar').style.width = '80%';
        document.getElementById('cleanupProgressMessage').textContent = '正在处理结果...';
        
        const result = await response.json();
        
        // 解锁项目
        await fetch('/api/tasks/unlock-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                session_id: appState.sessionId
            })
        });
        
        document.getElementById('cleanupProgressBar').style.width = '100%';
        
        if (result.status === 'success') {
            const data = result.data;
            
            // 显示结果
            document.getElementById('cleanupProgressState').style.display = 'none';
            document.getElementById('cleanupResultState').style.display = 'block';
            
            // 设置摘要
            const summaryText = `
                总文档数：<strong>${data.total}</strong><br>
                发现重复组：<strong>${data.duplicates_found}</strong><br>
                已删除重复：<strong style="color: #dc3545;">${data.removed}</strong><br>
                剩余文档：<strong style="color: #28a745;">${data.remaining}</strong>
            `;
            document.getElementById('cleanupSummaryText').innerHTML = summaryText;
            
            // 设置详细记录
            const detailsList = document.getElementById('cleanupDetailsList');
            if (data.duplicate_groups.length > 0) {
                detailsList.innerHTML = data.duplicate_groups.map(group => `
                    <div style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; overflow: hidden;">
                        <div style="background: #f8f9fa; padding: 10px; font-weight: bold; border-bottom: 1px solid #ddd;">
                            📄 ${group.filename}
                        </div>
                        <div style="padding: 10px;">
                            <div style="color: #28a745; margin-bottom: 8px;">
                                ✅ <strong>保留</strong>：${group.kept.doc_id}<br>
                                <span style="font-size: 12px; color: #666; margin-left: 24px;">
                                    周期：${group.kept.cycle || '未知'} | 时间：${group.kept.upload_time || '未知'}
                                </span>
                            </div>
                            <div style="color: #dc3545;">
                                ❌ <strong>删除</strong>：${group.removed.doc_id}<br>
                                <span style="font-size: 12px; color: #666; margin-left: 24px;">
                                    周期：${group.removed.cycle || '未知'} | 时间：${group.removed.upload_time || '未知'}
                                </span>
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                detailsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">未发现重复文档</p>';
            }
            
            showNotification(`清理完成：已删除 ${data.removed} 个重复文档`, 'success');
        } else {
            document.getElementById('cleanupProgressMessage').textContent = '处理失败：' + result.message;
            showNotification('清理失败：' + result.message, 'error');
        }
    } catch (error) {
        console.error('清理重复文档失败:', error);
        document.getElementById('cleanupProgressBar').style.width = '100%';
        document.getElementById('cleanupProgressMessage').textContent = '处理失败：' + error.message;
        showNotification('清理失败：' + error.message, 'error');
        
        // 尝试解锁项目
        try {
            await fetch('/api/tasks/unlock-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: appState.currentProjectId,
                    session_id: appState.sessionId
                })
            });
        } catch (e) {}
    }
}

/**
 * 清理完成后刷新页面
 */
export function refreshAfterCleanup() {
    closeCleanupDuplicatesModal();
    // 刷新当前周期的文档列表
    if (appState.currentCycle) {
        import('./document.js').then(module => {
            module.renderCycleDocuments(appState.currentCycle);
        });
    }
}

// 将日志归档/导入函数挂载到全局，供 HTML onclick 调用
if (typeof window !== 'undefined') {
    window.archiveLogsNow = archiveLogsNow;
    window.importLogsFile = importLogsFile;
    window.openAgreementEditorModal = openAgreementEditorModal;
    window.closeAgreementEditorModal = closeAgreementEditorModal;
    window.saveAgreementMarkdown = saveAgreementMarkdown;
    window.importAgreementMarkdown = importAgreementMarkdown;
    window.testSmtpConnection = testSmtpConnection;
    window.loadIpBlacklist = loadIpBlacklist;
}
/**
 * 测试SMTP邮件连接
 */
async function testSmtpConnection() {
    const resultEl = document.getElementById('smtpTestResult');
    if (resultEl) {
        resultEl.textContent = '测试中...';
        resultEl.style.color = '#666';
    }
    try {
        const smtpConfig = {
            smtp_host: (document.getElementById('smtpHost')?.value || '').trim(),
            smtp_port: parseInt(document.getElementById('smtpPort')?.value, 10) || 465,
            smtp_username: (document.getElementById('smtpUsername')?.value || '').trim(),
            smtp_password: document.getElementById('smtpPassword')?.value || '',
            smtp_encryption: document.getElementById('smtpEncryption')?.value || 'ssl',
            smtp_sender: (document.getElementById('smtpSender')?.value || '').trim()
        };
        if (!smtpConfig.smtp_host || !smtpConfig.smtp_username) {
            if (resultEl) {
                resultEl.textContent = '❌ 请先填写SMTP服务器地址和用户名';
                resultEl.style.color = '#dc3545';
            }
            return;
        }
        const response = await fetch('/api/settings/test-smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(smtpConfig)
        });
        const result = await response.json();
        if (resultEl) {
            if (result.status === 'success') {
                resultEl.textContent = '✅ 连接成功';
                resultEl.style.color = '#28a745';
            } else {
                resultEl.textContent = '❌ ' + (result.message || '连接失败');
                resultEl.style.color = '#dc3545';
            }
        }
    } catch (error) {
        if (resultEl) {
            resultEl.textContent = '❌ 测试请求失败';
            resultEl.style.color = '#dc3545';
        }
    }
}

/**
 * 为表格列添加拖拽调整宽度功能
 * @param {HTMLTableElement} tableEl - 目标表格元素
 * @param {string} [storageKey] - sessionStorage 存储键名，用于记住列宽
 */
export function initResizableColumns(tableEl, storageKey) {
    if (!tableEl) return;
    const ths = tableEl.querySelectorAll('thead tr th');
    if (!ths.length) return;

    // 恢复上次保存的列宽
    if (storageKey) {
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey));
            if (Array.isArray(saved)) {
                ths.forEach((th, i) => {
                    if (saved[i]) th.style.width = saved[i];
                });
            }
        } catch (_) {}
    }

    // 给每个有效列（非最后列）添加 resize 手柄
    ths.forEach((th, i) => {
        if (i === ths.length - 1) return; // 最后一列不加手柄

        // 避免重复初始化
        if (th.querySelector('.col-resize-handle')) return;

        th.style.position = 'relative';
        th.style.userSelect = 'none';

        const handle = document.createElement('div');
        handle.className = 'col-resize-handle';
        handle.style.cssText = (
            'position:absolute;right:0;top:0;bottom:0;width:6px;' +
            'cursor:col-resize;z-index:1;background:transparent;'
        );
        th.appendChild(handle);

        let startX = 0;
        let startWidth = 0;
        let nextTh = null;
        let nextStartWidth = 0;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = th.offsetWidth;
            nextTh = ths[i + 1] || null;
            nextStartWidth = nextTh ? nextTh.offsetWidth : 0;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            function onMouseMove(e) {
                const dx = e.clientX - startX;
                const newWidth = Math.max(60, startWidth + dx);
                th.style.width = newWidth + 'px';
                // 相邻列同步收缩/扩张
                if (nextTh) {
                    const newNextWidth = Math.max(60, nextStartWidth - dx);
                    nextTh.style.width = newNextWidth + 'px';
                }
            }

            function onMouseUp() {
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                // 持久化列宽
                if (storageKey) {
                    try {
                        const widths = Array.from(ths).map(t => t.style.width || '');
                        sessionStorage.setItem(storageKey, JSON.stringify(widths));
                    } catch (_) {}
                }
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

/**
 * 加载权限配置
 */
export async function loadPermissionsConfig() {
    try {
        const response = await fetch('/api/settings/permissions');
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            renderPermissionsConfig(result.data);
        } else {
            document.getElementById('permissionsContent').innerHTML = '<p style="text-align: center; color: #dc3545;">加载权限配置失败</p>';
        }
    } catch (error) {
        console.error('加载权限配置失败:', error);
        document.getElementById('permissionsContent').innerHTML = '<p style="text-align: center; color: #dc3545;">加载失败，请稍后重试</p>';
    }
}

/**
 * 渲染权限配置界面
 */
function renderPermissionsConfig(permissions) {
    const content = document.getElementById('permissionsContent');
    if (!content) return;
    
    const roles = ['admin', 'pmo', 'pmo_leader', 'project_admin', 'contractor'];
    const roleLabels = {
        'admin': '系统管理员',
        'pmo': '项目管理组织',
        'pmo_leader': 'PMO负责人',
        'project_admin': '项目经理',
        'contractor': '一般员工'
    };
    
    // 按分组排序
    const groupedPermissions = {
        'top': [],
        'sidebar': []
    };
    
    Object.entries(permissions).forEach(([key, config]) => {
        const group = config.group || 'sidebar';
        if (groupedPermissions[group]) {
            groupedPermissions[group].push({ key, ...config });
        }
    });
    
    let html = '';
    
    // 渲染顶部菜单权限
    if (groupedPermissions.top.length > 0) {
        html += '<div style="margin-bottom: 20px;"><h4 style="margin-bottom: 10px; color: #333;">顶部菜单权限</h4>';
        groupedPermissions.top.forEach(({ key, label, roles: menuRoles }) => {
            html += `
                <div style="margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <div style="font-weight: 500; margin-bottom: 8px;">${label || key}</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${roles.map(role => `
                            <label style="display: flex; align-items: center; gap: 4px; font-size: 13px;">
                                <input type="checkbox" name="${key}" value="${role}" ${menuRoles.includes(role) ? 'checked' : ''}>
                                <span>${roleLabels[role]}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // 渲染侧边栏菜单权限
    if (groupedPermissions.sidebar.length > 0) {
        html += '<div><h4 style="margin-bottom: 10px; color: #333;">侧边栏菜单权限</h4>';
        groupedPermissions.sidebar.forEach(({ key, label, roles: menuRoles }) => {
            html += `
                <div style="margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <div style="font-weight: 500; margin-bottom: 8px;">${label || key}</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${roles.map(role => `
                            <label style="display: flex; align-items: center; gap: 4px; font-size: 13px;">
                                <input type="checkbox" name="${key}" value="${role}" ${menuRoles.includes(role) ? 'checked' : ''}>
                                <span>${roleLabels[role]}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    content.innerHTML = html;
}

/**
 * 保存权限配置
 */
export async function savePermissionsConfig() {
    try {
        const permissions = {};
        
        // 收集所有权限设置
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            const menuKey = checkbox.name;
            const role = checkbox.value;
            
            if (!permissions[menuKey]) {
                permissions[menuKey] = {
                    roles: []
                };
            }
            
            if (checkbox.checked) {
                permissions[menuKey].roles.push(role);
            }
        });
        
        const response = await fetch('/api/settings/permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(permissions)
        });
        
        const result = await response.json();
        if (result.status === 'success') {
            showNotification('权限配置已保存', 'success');
        } else {
            showNotification('保存失败: ' + (result.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('保存权限配置失败:', error);
        showNotification('保存失败，请稍后重试', 'error');
    }
}
