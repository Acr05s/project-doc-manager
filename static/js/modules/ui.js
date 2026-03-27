/**
 * UI模块 - 处理界面相关功能
 */

import { appState, elements } from './app-state.js';
import { 
    handleCreateProject, handleLoadProject, handleImportJson, handleExportJson, 
    handleSaveProject, handleClearRequirements, updateClearRequirementsBtnState,
    handlePackageProject, handleImportPackage, 
    selectProject, populateProjectManageSelects, handleAddCycle, 
    handleRenameCycle, handleDeleteCycle, handleAddDoc, handleDeleteDoc, 
    populateDocSelect, handleConfirmAcceptance, handleDownloadPackage, 
    handleDeleteProject, resetImportPackageModal, loadZipRecords, handleRematchFromZip, handleDeleteZipRecord
} from './project.js';

import { 
    handleUploadDocument, handleFileSelect, handleEditDocument, 
    handleDeleteDocument, handleReplaceDocument, loadUploadedDocuments
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
    expandAll, collapseAll,
    saveTreeConfig, saveTreeAsTemplate, loadTemplateToTree,
    closeAttributePanel, saveAttributes
} from './tree-editor.js';
import { handleSaveTemplate } from './requirement-editor.js';

/**
 * 设置事件监听器
 */
export function setupEventListeners() {
    console.log('设置事件监听器...');

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
            if (!window._treeSelectedNode) {
                showNotification('请先在下方树中选择要删除的节点', 'info');
                return;
            }
            window.deleteTreeNode(window._treeSelectedNode);
        });
    }
    
    const toolbarExpandAll = document.getElementById('toolbarExpandAll');
    if (toolbarExpandAll) {
        toolbarExpandAll.addEventListener('click', expandAll);
    }
    
    const toolbarCollapseAll = document.getElementById('toolbarCollapseAll');
    if (toolbarCollapseAll) {
        toolbarCollapseAll.addEventListener('click', collapseAll);
    }
    
    const toolbarSave = document.getElementById('toolbarSave');
    if (toolbarSave) {
        toolbarSave.addEventListener('click', saveTreeConfig);
    }
    
    const toolbarSaveAsTemplate = document.getElementById('toolbarSaveAsTemplate');
    if (toolbarSaveAsTemplate) {
        toolbarSaveAsTemplate.addEventListener('click', saveTreeAsTemplate);
    }
    
    const toolbarLoadTemplate = document.getElementById('toolbarLoadTemplate');
    if (toolbarLoadTemplate) {
        toolbarLoadTemplate.addEventListener('click', loadTemplateToTree);
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



    // 导入包表单
    const importPackageForm = document.getElementById('importPackageForm');
    if (importPackageForm) {
        importPackageForm.addEventListener('submit', handleImportPackage);
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
                handleDeleteProject();
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
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
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

    titleEl.textContent = title;

    // 渲染字段
    fieldsEl.innerHTML = fields.map(f => `
        <div class="input-modal-field">
            <label class="input-modal-label">${f.label}</label>
            <input type="text" class="input-modal-input" data-key="${f.key}"
                value="${(f.value || '').replace(/"/g, '&quot;')}"
                placeholder="${(f.placeholder || '').replace(/"/g, '&quot;')}" />
        </div>
    `).join('');

    // 聚焦第一个输入框
    const firstInput = fieldsEl.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 80);

    // 重绑确认按钮（cloneNode 避免重复事件）
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    const doConfirm = () => {
        const result = {};
        fieldsEl.querySelectorAll('input[data-key]').forEach(inp => {
            result[inp.dataset.key] = inp.value;
        });
        closeInputModal();
        if (onConfirm) onConfirm(result);
    };

    newOkBtn.addEventListener('click', doConfirm);

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
export function showNotification(message, type = 'info') {
    if (elements.notification) {
        elements.notification.textContent = message;
        elements.notification.className = `notification show ${type}`;

        // 3秒后自动隐藏
        setTimeout(() => {
            if (elements.notification) {
                elements.notification.classList.remove('show');
            }
        }, 3000);
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
    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu', 
        'dataBackupMenu', 'acceptanceMenu'
    ];
    
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'inline-block';
    });
    
    // 显示生成报告按钮
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) generateReportBtn.style.display = 'inline-block';
}

/**
 * 隐藏项目按钮
 */
export function hideProjectButtons() {
    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu', 
        'dataBackupMenu', 'acceptanceMenu'
    ];
    
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'none';
    });
    
    // 隐藏生成报告按钮
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) generateReportBtn.style.display = 'none';
}
