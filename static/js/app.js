/**
 * 项目文档管理中心 - 主应用脚本
 * Version: 2.1.1
 * Last updated: 2026-03-30
 */

// 全局状态
let appState = {
    projectConfig: null,
    currentProjectId: null,
    currentCycle: null,
    currentDocument: null,
    documents: {},
    zipSelectedFile: null,       // 从ZIP中选择的单个文件（兼容旧代码）
    zipSelectedFiles: [],        // 从ZIP中选择的多个文件数组 [{path, name}]
    currentZipPackagePath: '',   // 当前选中的ZIP包路径
    currentZipPackageName: ''    // 当前选中的ZIP包名称
};

// DOM元素缓存（延迟获取，避免在DOM加载前访问）
const elements = {
    // 按钮 - 使用 getter 延迟获取
    get newProjectBtn() { return document.getElementById('newProjectBtn'); },
    get loadProjectBtn() { return document.getElementById('loadProjectBtn'); },
    get importJsonBtn() { return document.getElementById('importJsonBtn'); },
    get exportJsonBtn() { return document.getElementById('exportJsonBtn'); },
    get packageProjectBtn() { return document.getElementById('packageProjectBtn'); },
    get importPackageBtn() { return document.getElementById('importPackageBtn'); },
    get projectManageBtn() { return document.getElementById('projectManageBtn'); },
    get zipUploadBtn() { return document.getElementById('zipUploadBtn'); },
    get generateReportBtn() { return document.getElementById('generateReportBtn'); },
    get checkComplianceBtn() { return document.getElementById('checkComplianceBtn'); },
    get deleteProjectBtn() { return document.getElementById('deleteProjectBtn'); },
    get saveProjectBtn() { return document.getElementById('saveProjectBtn'); },
    get uploadBtn() { return document.getElementById('uploadBtn'); },
    get exportReportBtn() { return document.getElementById('exportReportBtn'); },
    get confirmAcceptanceBtn() { return document.getElementById('confirmAcceptanceBtn'); },
    get downloadPackageBtn() { return document.getElementById('downloadPackageBtn'); },

    // 输入框
    get fileInput() { return document.getElementById('fileInput'); },
    get projectFile() { return document.getElementById('projectFile'); },
    get docDate() { return document.getElementById('docDate'); },
    get signDate() { return document.getElementById('signDate'); },
    get signer() { return document.getElementById('signer'); },
    get hasSeal() { return document.getElementById('hasSeal'); },
    get partyASeal() { return document.getElementById('partyASeal'); },
    get partyBSeal() { return document.getElementById('partyBSeal'); },
    get otherSeal() { return document.getElementById('otherSeal'); },

    // 容器
    get contentArea() { return document.getElementById('contentArea'); },
    get cycleNavList() { return document.getElementById('cycleNavList'); },
    get projectSelect() { return document.getElementById('projectSelect'); },
    get documentsList() { return document.getElementById('documentsList'); },
    get reportContent() { return document.getElementById('reportContent'); },
    get modalTitle() { return document.getElementById('modalTitle'); },
    get docCount() { return document.getElementById('docCount'); },

    // 表单
    get uploadForm() { return document.getElementById('uploadForm'); },
    get loadProjectForm() { return document.getElementById('loadProjectForm'); },

    // 模态框
    get documentModal() { return document.getElementById('documentModal'); },
    get reportModal() { return document.getElementById('reportModal'); },
    get loadProjectModal() { return document.getElementById('loadProjectModal'); },
    get newProjectModal() { return document.getElementById('newProjectModal'); },
    get importJsonModal() { return document.getElementById('importJsonModal'); },
    get importPackageModal() { return document.getElementById('importPackageModal'); },
    get projectManageModal() { return document.getElementById('projectManageModal'); },
    get zipUploadModal() { return document.getElementById('zipUploadModal'); },
    get editDocModal() { return document.getElementById('editDocModal'); },
    get replaceDocModal() { return document.getElementById('replaceDocModal'); },

    // 其他
    get loadingIndicator() { return document.getElementById('loadingIndicator'); },
    get notification() { return document.getElementById('notification'); }
};

/**
 * 初始化应用
 */
async function initApp() {
    console.log('开始初始化应用...');
    setupEventListeners();
    console.log('事件监听器已设置');
    await loadProjectsList();
    console.log('项目列表已加载');
    
    // 初始化宽度调整器
    initDocModalResizer();
    
    // 修复ZIP文件选择问题
    fixZipSelectionIssue();
    
    // 初始化拖拽上传功能
    initDragAndDrop();
    console.log('拖拽上传功能已初始化');

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
    
    // 添加刷新按钮
    addRefreshButton();
}

/**
 * 添加刷新按钮
 */
function addRefreshButton() {
    const currentProjectName = document.getElementById('currentProjectName');
    if (!currentProjectName) return;
    
    // 检查是否已经存在刷新按钮
    if (document.getElementById('refreshBtn')) return;
    
    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'refreshBtn';
    refreshBtn.className = 'btn btn-primary';
    refreshBtn.innerHTML = '🔄 刷新数据';
    refreshBtn.style.marginLeft = '10px';
    refreshBtn.style.display = 'inline-block';
    refreshBtn.onclick = async function() {
        if (!appState.currentProjectId) {
            showNotification('请先选择项目', 'warning');
            return;
        }
        
        showLoading(true);
        try {
            // 重新加载项目配置
            const response = await fetch(`/api/projects/${appState.currentProjectId}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                appState.projectConfig = result.project;
                showNotification('数据刷新成功', 'success');
                
                // 重新渲染周期和文档
                renderCycles();
                if (appState.currentCycle) {
                    renderCycleDocuments(appState.currentCycle);
                }
            } else {
                showNotification('刷新失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('刷新数据失败:', error);
            showNotification('刷新数据失败', 'error');
        } finally {
            showLoading(false);
        }
    };
    
    currentProjectName.parentNode.insertBefore(refreshBtn, currentProjectName.nextSibling);
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
    console.log('设置事件监听器...');

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
        loadProjectBtn.addEventListener('click', () => {
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
        exportJsonBtn.addEventListener('click', handleExportJson);
    }

    // 保存项目状态
    const saveProjectBtn = document.getElementById('saveProjectBtn');
    if (saveProjectBtn) {
        saveProjectBtn.addEventListener('click', handleSaveProject);
    }

    // 打包项目
    const packageProjectBtn = document.getElementById('packageProjectBtn');
    if (packageProjectBtn) {
        packageProjectBtn.addEventListener('click', handlePackageProject);
    }

    // 导入包按钮
    const importPackageBtn = document.getElementById('importPackageBtn');
    const importPackageModal = document.getElementById('importPackageModal');
    if (importPackageBtn && importPackageModal) {
        importPackageBtn.addEventListener('click', () => {
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
                    searchZipFiles(kw, zipPackageSelect.value);
                });
            }

            // ZIP 包删除按钮
            const deleteZipBtn = document.getElementById('deleteZipPackageBtn');
            if (deleteZipBtn) {
                deleteZipBtn.addEventListener('click', () => {
                    if (appState.currentZipPackagePath) {
                        showConfirmModal(
                            '确认删除',
                            '确定要删除这个ZIP包吗？此操作不可恢复。',
                            async () => {
                                try {
                                    const response = await fetch('/api/documents/delete-zip-package', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ package_path: appState.currentZipPackagePath })
                                    });
                                    const result = await response.json();
                                    
                                    if (result.status === 'success') {
                                        showNotification('ZIP包删除成功', 'success');
                                        // 重新加载ZIP包列表
                                        loadZipPackages();
                                    } else {
                                        showNotification('删除失败: ' + result.message, 'error');
                                    }
                                } catch (error) {
                                    console.error('删除ZIP包失败:', error);
                                    showNotification('删除失败: ' + error.message, 'error');
                                }
                            }
                        );
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
            searchZipFiles(kw, appState.currentZipPackagePath || '');
        });
    }

    // ZIP 搜索框回车触发搜索
    const zipFileSearch = document.getElementById('zipFileSearch');
    if (zipFileSearch) {
        zipFileSearch.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchZipFiles(zipFileSearch.value.trim(), appState.currentZipPackagePath || '');
            }
        });
        // 输入时实时搜索（300ms 防抖）
        let zipSearchTimer = null;
        zipFileSearch.addEventListener('input', () => {
            clearTimeout(zipSearchTimer);
            zipSearchTimer = setTimeout(() => {
                searchZipFiles(zipFileSearch.value.trim(), appState.currentZipPackagePath || '');
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
    document.getElementById('importPackageForm').addEventListener('submit', handleImportPackage);

    // 项目管理
    const projectManageBtn = document.getElementById('projectManageBtn');
    const projectManageModal = document.getElementById('projectManageModal');
    if (projectManageBtn && projectManageModal) {
        projectManageBtn.addEventListener('click', () => {
            populateProjectManageSelects();
            openModal(projectManageModal);
        });
    }

    // 系统设置
    const systemSettingsMenuItem = document.getElementById('systemSettingsMenuItem');
    const systemSettingsModal = document.getElementById('systemSettingsModal');
    if (systemSettingsMenuItem && systemSettingsModal) {
        systemSettingsMenuItem.addEventListener('click', (e) => {
            e.preventDefault();
            loadSystemSettings();
            openModal(systemSettingsModal);
        });
    }

    // 保存设置
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSystemSettings);
    }

    // 检查更新
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', checkSystemUpdate);
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
        zipUploadBtn.addEventListener('click', () => {
            openModal(zipUploadModal);
        });
    }

    // ZIP上传表单提交
    document.getElementById('zipUploadForm').addEventListener('submit', handleZipUpload);

    // 导入匹配文件按钮
    document.getElementById('importMatchedBtn').addEventListener('click', handleImportMatchedFiles);

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

    // 生成报告
    const generateReportBtn = document.getElementById('generateReportBtn');
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', handleGenerateReport);
    }

    // 检查异常
    const checkComplianceBtn = document.getElementById('checkComplianceBtn');
    if (checkComplianceBtn) {
        checkComplianceBtn.addEventListener('click', handleCheckCompliance);
    }

    // 确认验收
    const confirmAcceptanceBtn = document.getElementById('confirmAcceptanceBtn');
    if (confirmAcceptanceBtn) {
        confirmAcceptanceBtn.addEventListener('click', handleConfirmAcceptance);
    }

    // 打包下载
    const downloadPackageBtn = document.getElementById('downloadPackageBtn');
    if (downloadPackageBtn) {
        downloadPackageBtn.addEventListener('click', handleDownloadPackage);
    }

    // 删除项目
    const deleteProjectBtn = document.getElementById('deleteProjectBtn');
    if (deleteProjectBtn) {
        deleteProjectBtn.addEventListener('click', () => {
            if (appState.currentProjectId) {
                deleteProject(appState.currentProjectId);
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
        replaceArchiveBtn.addEventListener('click', handleReplaceArchive);
    }

    // 文档编辑表单提交
    const editDocForm = document.getElementById('editDocForm');
    if (editDocForm) {
        editDocForm.addEventListener('submit', handleEditDocument);
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
    // 安全码验证等关键弹窗不允许点击背景关闭
    const noBackdropCloseIds = ['inputModal', 'confirmModal', 'archiveApprovalConfirmModal', 'selectPMOApproverModal', 'newProjectModal', 'editProjectModal', 'systemSettingsModal', 'editDocModal', 'zipUploadModal', 'archiveApprovalConfigModal', 'packageProgressModal'];
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
}

/**
 * 初始化文档模态框宽度调整器
 */
function initDocModalResizer() {
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
 * 修复ZIP文件选择问题，确保选中的文件能够正确保存和显示
 */
function fixZipSelectionIssue() {
    // 修复确认选择按钮的状态更新
    const originalHandleZipArchive = handleZipArchive;
    handleZipArchive = function() {
        // 确保所有选中的文件都被正确处理
        const selectedCheckboxes = document.querySelectorAll('.zip-file-checkbox:checked');
        const selectedFiles = Array.from(selectedCheckboxes).map(cb => {
            const item = cb.closest('.zip-file-item');
            return {
                path: item.dataset.path,
                name: item.dataset.name
            };
        });
        
        appState.zipSelectedFiles = selectedFiles;
        
        // 调用原始函数
        originalHandleZipArchive();
    };
}

/**
 * 加载项目列表
 */
async function loadProjectsList() {
    try {
        const response = await fetch('/api/projects/list');
        const result = await response.json();

        // 检查响应格式，兼容不同的API返回格式
        if (Array.isArray(result)) {
            // 直接返回数组的格式（如 Flask 直接返回 list）
            renderProjectsList(result);
        } else if (result.projects) {
            // 直接返回projects数组的格式
            renderProjectsList(result.projects);
        } else if (result.status === 'success' && result.data && result.data.projects) {
            // 包含status和data的格式
            renderProjectsList(result.data.projects);
        } else {
            renderProjectsList([]);
        }
    } catch (error) {
        console.error('加载项目列表失败:', error);
        renderProjectsList([]);
    }
}

/**
 * 渲染项目列表（下拉菜单）
 */
function renderProjectsList(projects) {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;
    
    // 保存当前选中的值
    const currentValue = projectSelect.value;
    
    // 清空并添加默认选项
    projectSelect.innerHTML = '<option value="">-- 选择项目 --</option>';
    
    if (!projects || projects.length === 0) {
        return;
    }
    
    // 添加项目选项
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        option.title = project.description || project.name;
        projectSelect.appendChild(option);
    });
    
    // 恢复选中状态
    if (currentValue) {
        projectSelect.value = currentValue;
    } else if (appState.currentProjectId) {
        projectSelect.value = appState.currentProjectId;
    }
}

/**
 * 选择项目（带打包状态检查）
 */
async function selectProject(projectId) {
    // 检查是否正在打包当前项目（前端状态）
    if (appState.isPackaging && appState.packagingProjectId === projectId) {
        showNotification('该项目正在打包中，请等待打包完成后再打开', 'warning');
        return;
    }
    
    // 先检查后端的项目状态
    try {
        const statusResponse = await fetch(`/api/tasks/project-status/${projectId}`);
        const statusResult = await statusResponse.json();
        if (statusResult.status === 'success' && statusResult.packaging) {
            showNotification('该项目正在打包中，请等待打包完成后再打开', 'warning');
            return;
        }
    } catch (e) {
        console.error('检查项目状态失败:', e);
    }
    
    try {
        showLoading(true);
        const response = await fetch(`/api/projects/${projectId}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            appState.currentProjectId = projectId;
            appState.projectConfig = result.project;
            appState.currentCycle = null; // 重置周期选择
            
            // 更新下拉菜单选中状态
            const projectSelectEl = document.getElementById('projectSelect');
            if (projectSelectEl) {
                projectSelectEl.value = projectId;
            }
            
            // 更新URL参数
            const url = new URL(window.location);
            url.searchParams.set('project', projectId);
            window.history.replaceState({}, '', url);
            
            // 恢复周期导航栏显示
            const cycleNavBar = document.getElementById('cycleNavBar');
            if (cycleNavBar) cycleNavBar.style.display = '';
            
            // 渲染周期（同步操作）
            renderCycles();
            
            // 渲染初始内容
            renderInitialContent();
            
            // 等待DOM更新完成
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 确保周期导航渲染完成
            const cycleNavListEl = document.getElementById('cycleNavList');
            if (cycleNavListEl) {
                console.log('周期导航元素存在，检查内容:', cycleNavListEl.innerHTML);
            } else {
                console.error('周期导航元素不存在');
            }
            
            // 确保内容区域更新
            const contentAreaEl = document.getElementById('contentArea');
            if (contentAreaEl) {
                console.log('内容区域元素存在，检查内容:', contentAreaEl.innerHTML);
            } else {
                console.error('内容区域元素不存在');
            }
            
            // 更新当前项目名显示
            updateCurrentProjectName();
            
            showProjectButtons();
            
            // 检查项目是否有数据
            if (result.project.cycles && result.project.cycles.length > 0) {
                console.log('项目已有周期数据:', result.project.cycles);
            }
            if (result.project.documents && Object.keys(result.project.documents).length > 0) {
                console.log('项目已有文档数据:', result.project.documents);
            }
            
            console.log('项目加载完成，周期导航已渲染');
            showNotification('已加载项目: ' + result.project.name, 'success');
        } else {
            showNotification('加载项目失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('选择项目失败:', error);
        showNotification('加载项目失败', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 删除项目（使用确认弹窗）
 */
async function deleteProject(projectId) {
    showConfirmModal(
        '确认删除',
        '确定要删除这个项目吗？此操作不可恢复。',
        async () => {
            try {
                const response = await fetch(`/api/projects/${projectId}`, {
                    method: 'DELETE'
                });
                const result = await response.json();
                
                if (result.status === 'success') {
                    showNotification('项目已删除', 'success');
                    
                    // 如果删除的是当前项目，清除状态
                    if (appState.currentProjectId === projectId) {
                        appState.currentProjectId = null;
                        appState.projectConfig = null;
                        appState.currentCycle = null;
                        const projectSelectEl = document.getElementById('projectSelect');
                        if (projectSelectEl) projectSelectEl.value = '';
                        const cycleNavListEl = document.getElementById('cycleNavList');
                        if (cycleNavListEl) cycleNavListEl.innerHTML = '';
                        hideProjectButtons();
                        // 清除URL参数
                        const url = new URL(window.location);
                        url.searchParams.delete('project');
                        window.history.replaceState({}, '', url);
                    }
                    
                    // 刷新项目列表
                loadProjectsList();
                
                // 更新当前项目名显示
                updateCurrentProjectName();
                } else {
                    showNotification('删除失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('删除项目失败:', error);
                showNotification('删除项目失败', 'error');
            }
        }
    );
}

/**
 * 显示确认弹窗
 */
function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const okBtn = document.getElementById('confirmOkBtn');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // 清除之前的绑定，避免重复绑定
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    // 取消按钮
    newCancelBtn.addEventListener('click', () => {
        closeConfirmModal();
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
function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
}

/**
 * 显示通用输入框模态框
 * @param {string} title - 弹窗标题
 * @param {Array} fields - 字段数组，每项格式：{ label, key, value, placeholder }
 * @param {Function} onConfirm - 确认回调，参数为 { key: value } 对象
 */
function showInputModal(title, fields, onConfirm) {
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
function closeInputModal() {
    document.getElementById('inputModal').classList.remove('show');
}

/**
 * 更新当前项目名显示
 */
function updateCurrentProjectName() {
    const projectNameElement = document.getElementById('currentProjectName');
    if (projectNameElement) {
        if (appState.projectConfig) {
            projectNameElement.textContent = `当前项目: ${appState.projectConfig.name}`;
            projectNameElement.style.display = 'block';
            // 确保添加刷新按钮
            addRefreshButton();
        } else {
            projectNameElement.textContent = '';
            projectNameElement.style.display = 'none';
        }
    }
}

/**
 * 处理加载项目
 */
async function handleLoadProject(e) {
    e.preventDefault();

    const file = elements.projectFile.files[0];
    if (!file) {
        showNotification('请选择文件', 'error');
        return;
    }

    // 检查是否选择了项目
    if (!appState.currentProjectId) {
        showNotification('请先选择项目或新建项目', 'error');
        return;
    }

    const progress = showOperationProgress('load-' + Date.now(), '正在导入文档需求...');
    progress.update(20, '正在上传文件...');

    showLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/project/load', {
            method: 'POST',
            body: formData
        });

        progress.update(50, '正在解析文件...');

        const result = await response.json();

        if (result.status === 'success') {
            progress.update(70, '正在保存配置...');
            
            // 更新当前选中的项目
            result.data.id = appState.currentProjectId;
            result.data.name = appState.projectConfig ? appState.projectConfig.name : '未命名项目';
            
            // 保存项目配置
            const saveResponse = await fetch(`/api/projects/${appState.currentProjectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.data)
            });
            
            if (!saveResponse.ok) {
                console.error('保存项目配置失败');
                showNotification('保存配置失败', 'error');
                return;
            }
            
            appState.projectConfig = result.data;
            renderCycles();
            renderInitialContent();
            closeModal(elements.loadProjectModal);
            elements.loadProjectForm.reset();
            
            progress.complete('文档需求导入成功');
            showNotification('文档结构更新成功！', 'success');
            console.log('项目配置:', appState.projectConfig);
        } else {
            progress.error('导入失败: ' + result.message);
            showNotification('加载失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('加载项目错误:', error);
        progress.error('导入失败: ' + error.message);
        showNotification('加载项目出错: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染项目周期列表
 */
function renderCycles() {
    console.log('开始渲染周期导航');
    console.log('appState.projectConfig:', appState.projectConfig);
    
    if (!appState.projectConfig || !appState.projectConfig.cycles) {
        console.log('项目配置或周期数据不存在');
        // 确保cycleNavList元素存在
        const cycleNavListEl = document.getElementById('cycleNavList');
        if (cycleNavListEl) {
            console.log('找到cycleNavList元素，设置为空周期状态');
            cycleNavListEl.innerHTML = '<span class="placeholder">无可用周期</span>';
        } else {
            console.error('cycleNavList元素未找到');
        }
        return;
    }

    const cycles = appState.projectConfig.cycles;
    const docsData = appState.projectConfig.documents || {};
    
    console.log('周期数据:', cycles);
    console.log('文档数据:', docsData);

    // 确保cycleNavList元素存在
    const cycleNavListEl = document.getElementById('cycleNavList');
    if (!cycleNavListEl) {
        console.error('cycleNavList元素未找到，无法渲染周期导航');
        return;
    }
    
    console.log('找到cycleNavList元素，开始加载周期进度');
    
    // 异步加载每个周期的进度
    loadCycleProgresses(cycles, docsData);
}

/**
 * 计算周期状态
 * 返回: 'complete' (绿色-完整无误), 'partial' (橙色-文件对属性不对), 'incomplete' (红色-文件不完整)
 */
async function calculateCycleStatus(cycle) {
    const docsInfo = appState.projectConfig.documents[cycle];
    if (!docsInfo) return 'incomplete';

    const requiredDocs = docsInfo.required_docs || [];
    const uploadedDocs = await getCycleDocuments(cycle);
    
    // 按文档类型分组
    const docsByName = {};
    for (const doc of uploadedDocs) {
        const key = doc.doc_name;
        if (!docsByName[key]) docsByName[key] = [];
        docsByName[key].push(doc);
    }

    let allFilesComplete = true;
    let allAttributesComplete = true;

    for (const doc of requiredDocs) {
        const docsList = docsByName[doc.name] || [];
        const requirement = doc.requirement || '';
        
        // 检查文件数量
        if (docsList.length === 0) {
            allFilesComplete = false;
            allAttributesComplete = false;
            break;
        }

        // 检查附加属性
        const requireSigner = requirement.includes('签名') || requirement.includes('签字');
        const requireSeal = requirement.includes('盖章') || requirement.includes('章');
        
        if (requireSigner && !docsList.some(d => d.signer)) {
            allAttributesComplete = false;
        }
        if (requireSeal && !docsList.some(d => d.has_seal_marked || d.has_seal || d.party_a_seal || d.party_b_seal)) {
            allAttributesComplete = false;
        }
    }

    if (!allFilesComplete) {
        return 'incomplete';
    } else if (!allAttributesComplete) {
        return 'partial';
    } else {
        return 'complete';
    }
}

/**
 * 刷新周期进度显示（从当前项目配置重新加载）
 */
async function refreshCycleProgress() {
    if (!appState.projectConfig || !appState.projectConfig.cycles) return;
    const cycles = appState.projectConfig.cycles;
    const docsData = appState.projectConfig.documents || {};
    await loadCycleProgresses(cycles, docsData);
}

/**
 * 加载所有周期的进度
 */
async function loadCycleProgresses(cycles, docsData) {
    console.log('开始加载周期进度');
    console.log('周期列表:', cycles);
    
    // 并行获取所有周期的状态和进度
    const statusPromises = cycles.map(async (cycle) => {
        console.log('处理周期:', cycle);
        try {
            const status = await calculateCycleStatus(cycle);
            console.log('周期', cycle, '状态:', status);
            
            try {
                const response = await fetch(`/api/documents/progress?cycle=${encodeURIComponent(cycle)}`);
                const result = await response.json();
                const progressPercent = result.total_required > 0
                    ? Math.round((result.completed_count / result.total_required) * 100)
                    : 0;
                console.log('周期', cycle, '进度:', progressPercent);
                return { cycle, status, progress: progressPercent, data: result };
            } catch (e) {
                console.error(`获取周期 ${cycle} 进度失败:`, e);
                return { cycle, status, progress: 0, data: null };
            }
        } catch (e) {
            console.error(`计算周期 ${cycle} 状态失败:`, e);
            return { cycle, status: 'incomplete', progress: 0, data: null };
        }
    });

    try {
        const statusResults = await Promise.all(statusPromises);
        console.log('所有周期状态结果:', statusResults);
        
        const statusMap = {};
        const progressMap = {};
        statusResults.forEach(r => {
            statusMap[r.cycle] = r.status;
            progressMap[r.cycle] = r.progress;
        });

        // 渲染顶部导航栏：横向排列，用箭头连接
        // 计算哪些周期后面需要显示虚线箭线
        const incompleteIndices = [];
        cycles.forEach((cycle, index) => {
            const status = statusMap[cycle] || 'incomplete';
            if (status !== 'complete') {
                incompleteIndices.push(index);
            }
        });

        // 渲染周期和箭线
        let html = '';
        cycles.forEach((cycle, index) => {
            const status = statusMap[cycle] || 'incomplete';
            
            // 渲染周期项
            html += `
                <div class="cycle-nav-item status-${status}" data-cycle="${cycle}" data-status="${status}">
                    <span class="cycle-index" style="font-size:11px;opacity:0.8;">${index + 1}</span>
                    <span class="cycle-name" style="text-align:center;">${cycle}</span>
                </div>
            `;
            
            // 运维和其它之间不需要箭线，但需要保持间距
            if (index < cycles.length - 1) {
                if ((cycle.includes('运维') || cycle.includes('运营')) && (cycles[index + 1].includes('其它') || cycles[index + 1].includes('其他'))) {
                    // 运维和其它之间添加占位元素
                    html += `<span class="cycle-nav-placeholder"></span>`;
                } else {
                    // 检查是否需要显示虚线箭线
                    const isDashed = incompleteIndices.some(incompleteIndex => index >= incompleteIndex);
                    html += `<span class="cycle-nav-arrow ${isDashed ? 'dashed' : ''}">→</span>`;
                }
            }
        });

        // 添加颜色说明方块作为最后一个周期项（图例，不可点击）
        html += `
            <div class="cycle-nav-item status-legend" style="cursor:default;pointer-events:none;">
                <span class="cycle-index" style="font-size:11px;opacity:0.8;"></span>
                <div class="status-legend-content">
                    <div class="status-item">
                        <span class="status-dot" style="background:#17a2b8;"></span>
                        <span>完整无误</span>
                    </div>
                    <div class="status-item">
                        <span class="status-dot" style="background:#ffc107;"></span>
                        <span>属性待补</span>
                    </div>
                    <div class="status-item">
                        <span class="status-dot" style="background:#dc3545;"></span>
                        <span>文件不全</span>
                    </div>
                </div>
            </div>
        `;

        // 确保cycleNavList元素存在
        const cycleNavListEl = document.getElementById('cycleNavList');
        if (cycleNavListEl) {
            console.log('找到cycleNavList元素，设置HTML内容');
            cycleNavListEl.innerHTML = html;

            // 添加周期点击事件（排除图例项）
            console.log('添加周期点击事件');
            document.querySelectorAll('.cycle-nav-item:not(.status-legend)').forEach(item => {
                item.addEventListener('click', () => {
                    console.log('点击周期:', item.dataset.cycle);
                    selectCycle(item.dataset.cycle);
                });
            });

            // 初始化周期文档搜索框
            initCycleSearch();
        } else {
            console.error('cycleNavList元素未找到，无法渲染周期导航');
        }

        // 不默认选中任何周期，只显示周期数据
        const currentCycle = appState.currentCycle;
        if (currentCycle) {
            // 确保当前选中周期仍然可见
            const currentItem = document.querySelector(`.cycle-nav-item[data-cycle="${currentCycle}"]`);
            if (currentItem) {
                currentItem.classList.add('active');
            }
        }
        
        // 清空内容区域，不显示文档
        const contentAreaEl = document.getElementById('contentArea');
        if (contentAreaEl) {
            console.log('更新内容区域');
            contentAreaEl.innerHTML = `
                <div class="welcome-message">
                    <h2>📋 ${appState.projectConfig.name}</h2>
                    <p>请在上方周期导航中选择一个周期，查看详细文档</p>
                </div>
            `;
        } else {
            console.error('contentArea元素未找到');
        }
        
        console.log('周期导航渲染完成');
    } catch (error) {
        console.error('加载周期进度失败:', error);
        // 显示错误信息
        const cycleNavListEl = document.getElementById('cycleNavList');
        if (cycleNavListEl) {
            cycleNavListEl.innerHTML = '<span class="placeholder">加载周期失败，请刷新页面</span>';
        }
    }
}

/**
 * 选定一个周期
 */
function selectCycle(cycle) {
    appState.currentCycle = cycle;

    // 更新顶部导航UI
    document.querySelectorAll('.cycle-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`.cycle-nav-item[data-cycle="${cycle}"]`).classList.add('active');

    // 渲染该周期的文档
    renderCycleDocuments(cycle);
}

/**
 * 初始化周期文档搜索框 - Excel筛选风格
 */
function initCycleSearch() {
    const searchBox = document.getElementById('cycleSearchBox');
    const searchTrigger = document.getElementById('cycleSearchTrigger');
    const searchPanel = document.getElementById('cycleSearchPanel');
    const searchInput = document.getElementById('cycleSearchInput');
    const searchDropdown = document.getElementById('cycleSearchDropdown');
    const searchClear = document.getElementById('cycleSearchClear');
    const searchResultInfo = document.getElementById('cycleSearchResultInfo');
    if (!searchBox || !searchTrigger || !searchInput) return;

    // 显示搜索框
    searchBox.style.display = '';

    // 构建搜索索引：所有周期的所有文档名
    const searchIndex = [];
    const cycles = appState.projectConfig.cycles || [];
    const documents = appState.projectConfig.documents || {};
    cycles.forEach(cycle => {
        const docsInfo = documents[cycle];
        if (docsInfo && docsInfo.required_docs) {
            docsInfo.required_docs.forEach(doc => {
                searchIndex.push({ cycle, docName: doc.name });
            });
        }
    });

    let activeIndex = -1;
    let filteredResults = [];
    let debounceTimer = null;

    function highlightMatch(text, keyword) {
        if (!keyword) return text;
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    }

    function renderDropdown(items, keyword) {
        if (!items.length) {
            searchDropdown.innerHTML = '<div class="cycle-search-no-result">未找到匹配的文档</div>';
            if (searchResultInfo) {
                searchResultInfo.textContent = '无匹配结果';
                searchResultInfo.style.display = '';
            }
            return;
        }

        // 按周期分组，保持 cycles 顺序
        const grouped = {};
        items.forEach(item => {
            if (!grouped[item.cycle]) grouped[item.cycle] = [];
            grouped[item.cycle].push(item);
        });

        if (searchResultInfo) {
            searchResultInfo.textContent = keyword
                ? `找到 ${items.length} 个匹配文档`
                : `共 ${items.length} 个文档`;
            searchResultInfo.style.display = '';
        }

        let html = '';
        let globalIdx = 0;
        cycles.forEach(cycle => {
            if (!grouped[cycle]) return;
            html += `<div class="cycle-search-group-header">📁 ${cycle}（${grouped[cycle].length}）</div>`;
            grouped[cycle].forEach(item => {
                const docDisplay = keyword ? highlightMatch(item.docName, keyword) : item.docName;
                html += `<div class="cycle-search-item${globalIdx === activeIndex ? ' active' : ''}" data-index="${globalIdx}" data-cycle="${item.cycle}" data-doc="${item.docName}">
                    <div class="search-path">
                        <span class="search-cycle-tag">${cycle}</span>
                        <span class="search-path-sep">›</span>
                        <span class="search-doc-name">${docDisplay}</span>
                    </div>
                </div>`;
                globalIdx++;
            });
        });

        searchDropdown.innerHTML = html;

        // 绑定点击事件
        searchDropdown.querySelectorAll('.cycle-search-item').forEach(el => {
            el.addEventListener('click', () => {
                navigateToCycleDoc(el.dataset.cycle, el.dataset.doc);
            });
        });
    }

    function navigateToCycleDoc(cycle, docName) {
        // 关闭搜索面板
        closePanel();
        // 切换到对应周期
        selectCycle(cycle);

        // 延迟等待文档表格渲染完成后滚动到对应行并高亮
        setTimeout(() => {
            const rows = document.querySelectorAll('.doc-row');
            for (const row of rows) {
                const docTypeEl = row.querySelector('.doc-type');
                if (docTypeEl && docTypeEl.textContent.trim() === docName) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.transition = 'background 0.3s';
                    row.style.background = '#fff3cd';
                    setTimeout(() => {
                        row.style.background = '';
                    }, 2000);
                    break;
                }
            }
        }, 500);
    }

    function doSearch() {
        const keyword = searchInput.value.trim().toLowerCase();
        searchClear.style.display = keyword ? '' : 'none';

        if (!keyword) {
            // 无关键字时显示全部文档列表
            filteredResults = [...searchIndex];
            activeIndex = -1;
            renderDropdown(filteredResults, '');
            return;
        }

        // 同时搜索周期名和文档名
        filteredResults = searchIndex.filter(item =>
            item.docName.toLowerCase().includes(keyword) ||
            item.cycle.toLowerCase().includes(keyword)
        );
        activeIndex = -1;
        renderDropdown(filteredResults, keyword);
    }

    function openPanel() {
        searchPanel.classList.add('show');
        searchTrigger.classList.add('active');
        // 初始显示全部
        filteredResults = [...searchIndex];
        renderDropdown(filteredResults, '');
        setTimeout(() => searchInput.focus(), 50);
    }

    function closePanel() {
        searchPanel.classList.remove('show');
        searchTrigger.classList.remove('active');
        searchInput.value = '';
        searchClear.style.display = 'none';
        filteredResults = [];
        activeIndex = -1;
    }

    // 点击触发按钮 toggle 面板
    searchTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (searchPanel.classList.contains('show')) {
            closePanel();
        } else {
            openPanel();
        }
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doSearch, 200);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!filteredResults.length) return;
            activeIndex = Math.min(activeIndex + 1, filteredResults.length - 1);
            renderDropdown(filteredResults, searchInput.value.trim());
            const activeEl = searchDropdown.querySelector('.cycle-search-item.active');
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!filteredResults.length) return;
            activeIndex = Math.max(activeIndex - 1, 0);
            renderDropdown(filteredResults, searchInput.value.trim());
            const activeEl = searchDropdown.querySelector('.cycle-search-item.active');
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filteredResults.length) {
                const item = filteredResults[activeIndex];
                navigateToCycleDoc(item.cycle, item.docName);
            }
        } else if (e.key === 'Escape') {
            closePanel();
        }
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        // 重新显示全部
        filteredResults = [...searchIndex];
        activeIndex = -1;
        renderDropdown(filteredResults, '');
        searchInput.focus();
    });

    // 点击外部关闭面板
    document.addEventListener('click', (e) => {
        if (!searchBox.contains(e.target)) {
            closePanel();
        }
    });
}

/**
 * 渲染初始内容
 */
function renderInitialContent() {
    if (!appState.projectConfig) return;

    // 始终显示欢迎信息，让用户手动选择周期
    if (!appState.currentCycle) {
        // 如果正在打包，显示备份提示
        if (appState.isPackaging) {
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>正在备份项目...</h2>
                    <p>项目数据暂时不可操作</p>
                </div>
            `;
        } else {
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>欢迎使用文档管理系统</h2>
                    <p>请从上方选择一个周期开始管理文档</p>
                </div>
            `;
        }
    }
}

/**
 * 计算周期文档完成进度
 * 进度 = (文档数 + 签名数 + 盖章数) / (需求文档数 × 3) × 100%
 */
async function calculateCycleProgress(cycle) {
    try {
        const response = await fetch(`/api/documents/progress?cycle=${encodeURIComponent(cycle)}`);
        const result = await response.json();
        return result;
    } catch (e) {
        console.error('获取进度失败:', e);
        return { doc_count: 0, signer_count: 0, seal_count: 0, total_required: 0 };
    }
}

/**
 * 获取周期内所有文档列表
 */
async function getCycleDocuments(cycle) {
    try {
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(cycle)}`);
        const result = await response.json();
        return result.data || [];
    } catch (e) {
        console.error('获取文档列表失败:', e);
        return [];
    }
}

/**
 * 渲染周期内的文档
 */
async function renderCycleDocuments(cycle) {
    const docsInfo = appState.projectConfig.documents[cycle];
    if (!docsInfo) {
        elements.contentArea.innerHTML = '<p class="placeholder">该周期暂无文档</p>';
        return;
    }

    // 按序号排序
    const requiredDocs = (docsInfo.required_docs || []).sort((a, b) => (a.index || 0) - (b.index || 0));

    // 获取已上传的文档
    const uploadedDocs = await getCycleDocuments(cycle);
    
    // 按文档类型分组
    const docsByName = {};
    for (const doc of uploadedDocs) {
        const key = doc.doc_name;
        if (!docsByName[key]) docsByName[key] = [];
        docsByName[key].push(doc);
    }
    
    // 获取所有已上传文档的类型名称
    const uploadedDocTypes = new Set(uploadedDocs.map(doc => doc.doc_name));
    
    // 合并required_docs和已上传的文档类型
    const allDocTypes = [...requiredDocs];
    
    // 添加已上传但不在required_docs中的文档类型
    uploadedDocTypes.forEach(docType => {
        if (!requiredDocs.some(reqDoc => reqDoc.name === docType)) {
            allDocTypes.push({
                name: docType,
                requirement: '无要求',
                index: 9999 // 放在最后
            });
        }
    });
    
    // 重新排序
    allDocTypes.sort((a, b) => (a.index || 0) - (b.index || 0));

    // 新布局：左侧组织机构人员，中间文件名+附加属性，右侧确认按钮
    const html = `
        <h2>📋 ${cycle} - 文档管理</h2>
        
        <!-- 新文档管理布局 -->
        <div class="new-documents-layout">
            <table class="documents-table">
                <thead>
                    <tr>
                        <th class="col-org">组织机构/文档类型</th>
                        <th class="col-files">文件列表</th>
                        <th class="col-action">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${allDocTypes.map(doc => {
                        const docsList = docsByName[doc.name] || [];
                        
                        // 检查是否已归档
                        const isArchived = appState.projectConfig.documents_archived?.[cycle]?.[doc.name];
                        
                        // 生成文件列表显示
                        const fileListHtml = docsList.length > 0 ? docsList.map(d => {
                            const attrParts = [];
                            if (d.doc_date) attrParts.push(`📅${formatDateToMonth(d.doc_date)}`);
                            if (d.signer) attrParts.push(`✍️${d.signer}`);
                            if (d.sign_date) attrParts.push(`📆${formatDateToMonth(d.sign_date)}`);
                            if (d.no_signature) attrParts.push('❌不签字');
                            if (d.party_a_seal) attrParts.push('🏢甲');
                            if (d.party_b_seal) attrParts.push('🏭乙');
                            if (d.has_seal_marked || d.has_seal) attrParts.push('🔖');
                            if (d.no_seal) attrParts.push('❌不盖章');
                            if (d.other_seal) attrParts.push(`📍${d.other_seal}`);
                            
                            return `<div class="doc-file-row">
                                <span class="doc-file-name" onclick="previewDocument('${d.id}')" 
                                      title="点击预览文件" 
                                      style="cursor: pointer; text-decoration: underline;">
                                    ${d.original_filename || d.filename}
                                </span>
                                ${attrParts.length > 0 ? `<span class="doc-attrs">${attrParts.join(' ')}</span>` : ''}
                            </div>`;
                        }).join('') : '<span class="doc-no-files">暂无文件</span>';
                        
                        return `
                        <tr class="doc-row ${isArchived ? 'archived' : ''}">
                            <td class="col-org">
                                <div class="org-cell" onclick="${isArchived ? `confirmUnarchive('${cycle}', '${doc.name}')` : `openDocumentModal('${cycle}', '${doc.name}')`}" 
                                     title="${isArchived ? '点击撤销归档并管理文档' : '点击上传/管理文档'}">
                                    <span class="doc-index">${doc.index || ''}</span>
                                    <span class="doc-name">${doc.name}</span>
                                    ${isArchived ? '<span class="archived-badge">已归档</span>' : ''}
                                </div>
                                ${doc.requirement ? `<div class="doc-req">${doc.requirement}</div>` : ''}
                            </td>
                            <td class="col-files">
                                <div class="files-container">
                                    ${fileListHtml}
                                </div>
                            </td>
                            <td class="col-action">
                                ${!isArchived && docsList.length > 0 ? 
                                    `<button class="btn btn-success btn-sm" onclick="archiveDocument('${cycle}', '${doc.name}')">
                                        确认归档
                                    </button>` : 
                                    (isArchived ? 
                                        `<div class="action-buttons">
                                            <span class="status-text">已归档</span>
                                            <button class="btn btn-warning btn-sm" onclick="unarchiveDocument('${cycle}', '${doc.name}')">
                                                撤销归档
                                            </button>
                                        </div>` : 
                                     '<span class="status-text">等待上传</span>')
                                }
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    elements.contentArea.innerHTML = html;
}

/**
 * 确认归档文档
 */
async function archiveDocument(cycle, docName) {
    if (!appState.projectConfig.documents_archived) {
        appState.projectConfig.documents_archived = {};
    }
    if (!appState.projectConfig.documents_archived[cycle]) {
        appState.projectConfig.documents_archived[cycle] = {};
    }
    
    appState.projectConfig.documents_archived[cycle][docName] = {
        archived: true,
        archived_time: new Date().toISOString()
    };
    
    // 保存到服务器
    try {
        const response = await fetch('/api/projects/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.projectConfig)
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification(`文档 "${docName}" 已归档`, 'success');
            renderCycleDocuments(cycle);
            refreshCycleProgress();
        } else {
            showNotification('归档失败: ' + result.message, 'error');
        }
    } catch (e) {
        console.error('归档失败:', e);
        showNotification('归档失败', 'error');
    }
}

/**
 * 确认撤销归档
 */
function confirmUnarchive(cycle, docName) {
    showConfirmModal(
        '确认撤销归档',
        '当前文档已归档，需要编辑状态需撤销归档。是否撤销？',
        async () => {
            // 撤销归档
            await unarchiveDocument(cycle, docName);
            // 进入文件选择/上传界面
            openDocumentModal(cycle, docName);
        }
    );
}

/**
 * 撤销归档文档
 */
async function unarchiveDocument(cycle, docName) {
    if (appState.projectConfig.documents_archived && 
        appState.projectConfig.documents_archived[cycle]) {
        delete appState.projectConfig.documents_archived[cycle][docName];
        
        // 如果该周期没有已归档文档，删除整个周期的归档记录
        if (Object.keys(appState.projectConfig.documents_archived[cycle]).length === 0) {
            delete appState.projectConfig.documents_archived[cycle];
        }
        
        // 如果没有任何归档文档，删除整个归档记录
        if (Object.keys(appState.projectConfig.documents_archived).length === 0) {
            delete appState.projectConfig.documents_archived;
        }
    }
    
    // 保存到服务器
    try {
        const response = await fetch('/api/projects/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.projectConfig)
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification(`文档 "${docName}" 已撤销归档`, 'success');
            renderCycleDocuments(cycle);
            refreshCycleProgress();
        } else {
            showNotification('撤销归档失败: ' + result.message, 'error');
        }
    } catch (e) {
        console.error('撤销归档失败:', e);
        showNotification('撤销归档失败', 'error');
    }
}

/**
 * 处理文件拖放
 */
function handleFileDrop(e) {
    e.preventDefault();
    e.target.closest('.upload-area').classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const uploadArea = e.target.closest('.upload-area');
        const cycle = uploadArea.dataset.cycle;
        const docName = uploadArea.dataset.docName;

        // 打开模态框并设置文件
        openDocumentModal(cycle, docName, files[0]);
    }
}

/**
 * 打开文档管理模态框
 */
function openDocumentModal(cycle, docName, draggedFile = null) {
    appState.currentCycle = cycle;
    appState.currentDocument = docName;

    elements.modalTitle.textContent = `文档管理 - ${cycle} - ${docName}`;
    elements.uploadForm.dataset.cycle = cycle;
    elements.uploadForm.dataset.docName = docName;
    
    // 加载并显示分类管理
    loadCategories(cycle, docName);

    // 获取当前文档的要求，根据要求显示/隐藏签名和盖章字段
    const docsInfo = appState.projectConfig?.documents?.[cycle];
    const docConfig = docsInfo?.required_docs?.find(d => d.name === docName);
    const requirement = docConfig?.requirement || '';
    
    // 更详细的要求识别
    const requireSigner = requirement.includes('签名') || requirement.includes('签字');
    const requireSeal = requirement.includes('盖章') || requirement.includes('章');
    const requirePartyASigner = requirement.includes('甲方') && (requirement.includes('签名') || requirement.includes('签字'));
    const requirePartyBSigner = requirement.includes('乙方') && (requirement.includes('签名') || requirement.includes('签字'));
    const requirePartyASeal = requirement.includes('甲方') && (requirement.includes('盖章') || requirement.includes('章'));
    const requirePartyBSeal = requirement.includes('乙方') && (requirement.includes('盖章') || requirement.includes('章'));
    const requireOwnerSigner = requirement.includes('业主') && (requirement.includes('签名') || requirement.includes('签字'));
    
    // 根据要求显示/隐藏签名和盖章字段
    const signerGroup = document.getElementById('uploadForm').querySelector('#signer')?.closest('.form-group') || 
                        document.querySelector('#uploadForm .form-group:has(#signer)');
    const sealGroup = document.querySelector('#uploadForm .form-group:has(#hasSeal)');
    
    // 显示/隐藏签名相关字段
    const signerFields = document.querySelectorAll('#uploadForm .form-group:has(#signer), #uploadForm .form-group:has(#signDate)');
    signerFields.forEach(el => el.style.display = requireSigner ? 'block' : 'none');
    
    // 显示/隐藏盖章相关字段
    if (sealGroup) {
        sealGroup.style.display = requireSeal ? 'block' : 'none';
    }
    
    // 根据要求自动设置默认值
    if (requirePartyASeal) {
        document.getElementById('partyASeal').checked = true;
    } else {
        document.getElementById('partyASeal').checked = false;
    }
    
    if (requirePartyBSeal) {
        document.getElementById('partyBSeal').checked = true;
    } else {
        document.getElementById('partyBSeal').checked = false;
    }

    // 如果从拖放传入了文件
    if (draggedFile) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(draggedFile);
        elements.fileInput.files = dataTransfer.files;
    } else {
        elements.fileInput.value = '';
    }

    // 重置 ZIP 搜索面板状态
    resetZipPanel();

    // 默认切到本地上传 Tab
    switchUploadTab('local');

    // 加载已上传的文档
    loadUploadedDocuments(cycle, docName);

    // 更新文件预览
    updateFilePreview();

    // 自动将文档名称填入ZIP搜索框
    const zipFileSearch = document.getElementById('zipFileSearch');
    if (zipFileSearch) {
        zipFileSearch.value = docName;
    }

    openModal(elements.documentModal);
}

/**
 * 切换上传来源 Tab（local / zip）
 */
function switchUploadTab(tab) {
    document.querySelectorAll('.upload-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    const localPanel = document.getElementById('uploadSourceLocal');
    const zipPanel = document.getElementById('uploadSourceZip');
    if (localPanel) localPanel.style.display = tab === 'local' ? 'block' : 'none';
    if (zipPanel) zipPanel.style.display = tab === 'zip' ? 'block' : 'none';

    // 切到 ZIP 面板时自动加载
    if (tab === 'zip') {
        loadZipPackages();
        // 自动执行搜索
        setTimeout(() => {
            const zipFileSearch = document.getElementById('zipFileSearch');
            if (zipFileSearch) {
                const kw = zipFileSearch.value.trim();
                searchZipFiles(kw, appState.currentZipPackagePath || '');
            }
        }, 500);
    }
}

/**
 * 切换主标签页
 */
function switchMainTab(tabName) {
    try {
        document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.main-tab-content').forEach(content => content.style.display = 'none');
        
        const tabBtn = document.querySelector(`.main-tab-btn[data-tab="${tabName}"]`);
        if (tabBtn) tabBtn.classList.add('active');
        
        // 处理标签页ID，将upload-select转换为uploadSelectTab
        let tabId;
        if (tabName === 'upload-select') {
            tabId = 'uploadSelectTab';
        } else {
            tabId = `${tabName}Tab`;
        }
        
        const tabContent = document.getElementById(tabId);
        if (tabContent) tabContent.style.display = 'block';
        
        // 如果切换到上传/选择文档标签页，确保子标签页事件已绑定
        if (tabName === 'upload-select') {
            if (typeof initUploadMethodTabs === 'function') {
                initUploadMethodTabs();
            }
        }
        
        // 如果切换到维护标签页，更新已选择文档列表
        if (tabName === 'maintain') {
            updateSelectedDocumentsList();
        }
    } catch (error) {
        console.error('[switchMainTab] 切换标签页失败:', error);
    }
}

/**
 * 更新已选择文档列表
 */
function updateSelectedDocumentsList() {
    try {
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
    } catch (error) {
        console.error('[updateSelectedDocumentsList] 更新失败:', error);
    }
}

/**
 * 加载ZIP包列表，若只有一个包则直接展示文件，若多个则显示选择器
 */
async function loadZipPackages() {
    const fileList = document.getElementById('zipFileList');
    const packageSelector = document.getElementById('zipPackageSelector');
    if (fileList) fileList.innerHTML = '<p class="placeholder">加载中...</p>';

    try {
        const res = await fetch('/api/documents/list-zip-packages');
        const result = await res.json();

        if (result.status !== 'success') {
            if (fileList) fileList.innerHTML = `<p class="zip-no-result">加载失败: ${result.message}</p>`;
            return;
        }

        const packages = result.packages || [];

        if (packages.length === 0) {
            if (packageSelector) packageSelector.style.display = 'none';
            if (fileList) fileList.innerHTML = '<p class="zip-no-result">暂无已上传的ZIP文件，请先点顶部"批量导入ZIP"上传</p>';
            return;
        }

        if (packages.length === 1) {
            // 只有一个包，直接展示文件
            if (packageSelector) packageSelector.style.display = 'none';
            appState.currentZipPackagePath = packages[0].path;
            appState.currentZipPackageName = packages[0].name;
            // 自动执行搜索，使用当前搜索框内容
            const zipFileSearch = document.getElementById('zipFileSearch');
            const kw = zipFileSearch ? zipFileSearch.value.trim() : '';
            searchZipFiles(kw, packages[0].path);
        } else {
            // 多个包，显示选择器
            if (packageSelector) {
                packageSelector.style.display = 'flex';
                const select = document.getElementById('directorySelect');
                if (select) {
                    select.innerHTML = packages.map(p =>
                        `<option value="${escapeHtml(p.path)}">${escapeHtml(p.name)}（${p.file_count}个文件）</option>`
                    ).join('');
                    // 默认选第一个
                    appState.currentZipPackagePath = packages[0].path;
                    appState.currentZipPackageName = packages[0].name;
                    // 自动执行搜索，使用当前搜索框内容
                    const zipFileSearch = document.getElementById('zipFileSearch');
                    const kw = zipFileSearch ? zipFileSearch.value.trim() : '';
                    searchZipFiles(kw, packages[0].path);
                }
            } else {
                // 降级：直接搜全部
                appState.currentZipPackagePath = '';
                // 自动执行搜索，使用当前搜索框内容
                const zipFileSearch = document.getElementById('zipFileSearch');
                const kw = zipFileSearch ? zipFileSearch.value.trim() : '';
                searchZipFiles(kw, '');
            }
        }
    } catch (e) {
        if (fileList) fileList.innerHTML = `<p class="zip-no-result">加载失败: ${e.message}</p>`;
    }
}



/**
 * 重置 ZIP 搜索面板
 */
function resetZipPanel() {
    const searchInput = document.getElementById('zipFileSearch');
    const fileList = document.getElementById('zipFileList');
    const selectedInfo = document.getElementById('zipSelectedInfo');
    const archiveBtn = document.getElementById('zipArchiveBtn');
    const packageSelector = document.getElementById('zipPackageSelector');
    if (searchInput) searchInput.value = '';
    if (fileList) fileList.innerHTML = '<p class="placeholder">加载中...</p>';
    if (packageSelector) packageSelector.style.display = 'none';
    
    // 清空所有选择状态
    appState.zipSelectedFile = null;
    appState.zipSelectedFiles = [];
    appState.currentZipPackagePath = '';
    appState.currentZipPackageName = '';
    
    // 重置按钮状态
    if (selectedInfo) selectedInfo.style.display = 'none';
    if (archiveBtn) {
        archiveBtn.disabled = true;
        archiveBtn.textContent = '✅ 确认选择';
    }
}




/**
 * 切换 ZIP 文件多选状态（通过复选框）
 */
function toggleZipFileSelect(checkbox, filePath, fileName) {
    try {
        if (!appState.zipSelectedFiles) {
            appState.zipSelectedFiles = [];
        }

        const existingIndex = appState.zipSelectedFiles.findIndex(sf => sf.path === filePath);
        const itemEl = checkbox.closest('.zip-file-item');

        if (checkbox.checked) {
            // 添加到已选列表
            if (existingIndex === -1) {
                appState.zipSelectedFiles.push({ path: filePath, name: fileName });
            }
            if (itemEl) itemEl.classList.add('selected');
        } else {
            // 从已选列表移除
            if (existingIndex > -1) {
                appState.zipSelectedFiles.splice(existingIndex, 1);
            }
            if (itemEl) itemEl.classList.remove('selected');
        }

        // 更新界面
        updateZipSelectedUI();
    } catch (e) {
        console.error('切换选择失败:', e);
        showNotification('选择文件失败: ' + e.message, 'error');
    }
}

/**
 * 通过点击文件信息区域切换选择（复选框联动）
 */
function toggleZipFileCheck(divEl) {
    const checkbox = divEl.parentElement.querySelector('.zip-file-checkbox');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        const itemEl = divEl.closest('.zip-file-item');
        const filePath = itemEl?.dataset.path;
        const fileName = itemEl?.dataset.name;
        if (filePath && fileName) {
            toggleZipFileSelect(checkbox, filePath, fileName);
        }
    }
}

/**
 * 选择 ZIP 文件（单选兼容）
 */
function selectZipFile(el, filePath, fileName) {
    // 切换复选框状态
    const checkbox = el.querySelector('.zip-file-checkbox');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        toggleZipFileSelect(checkbox, filePath, fileName);
    } else {
        // 降级：单选模式
        document.querySelectorAll('.zip-file-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
        appState.zipSelectedFile = { path: filePath, name: fileName };
        if (!appState.zipSelectedFiles) appState.zipSelectedFiles = [];
        if (!appState.zipSelectedFiles.some(sf => sf.path === filePath)) {
            appState.zipSelectedFiles.push({ path: filePath, name: fileName });
        }
        updateZipSelectedUI();
    }
}

/**
 * 更新 ZIP 已选文件 UI 状态
 */
function updateZipSelectedUI() {
    try {
        const files = appState.zipSelectedFiles || [];
        const count = files.length;

        const selectedInfo = document.getElementById('zipSelectedInfo');
        const selectedName = document.getElementById('zipSelectedName');
        const archiveBtn = document.getElementById('zipArchiveBtn');

        if (count > 0) {
            if (selectedInfo) selectedInfo.style.display = 'flex';
            if (selectedName) {
                if (count === 1) {
                    selectedName.textContent = '✅ 已选择：' + files[0].name;
                } else {
                    selectedName.textContent = `✅ 已选择 ${count} 个文件`;
                }
            }
            if (archiveBtn) {
                archiveBtn.disabled = false;
                archiveBtn.textContent = count === 1 ? '✅ 确认归档' : `✅ 确认选择 (${count})`;
            }
        } else {
            if (selectedInfo) selectedInfo.style.display = 'none';
            if (archiveBtn) {
                archiveBtn.disabled = true;
                archiveBtn.textContent = '✅ 确认选择';
            }
        }
    } catch (e) {
        console.error('更新选择UI失败:', e);
    }
}

/**
 * 从 ZIP 归档已选文件（支持多选）
 */
async function handleZipArchive() {
    const files = appState.zipSelectedFiles || [];
    if (files.length === 0) {
        // 兼容旧代码：尝试使用单选
        if (appState.zipSelectedFile) {
            files.push(appState.zipSelectedFile);
        } else {
            showNotification('请先从列表中选择文件', 'warning');
            return;
        }
    }

    const archiveBtn = document.getElementById('zipArchiveBtn');
    if (archiveBtn) archiveBtn.disabled = true;

    showLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
        for (const file of files) {
            const payload = {
                source_path: file.path,
                cycle: appState.currentCycle,
                doc_name: appState.currentDocument,
                doc_date: document.getElementById('docDate')?.value || '',
                sign_date: document.getElementById('signDate')?.value || '',
                signer: document.getElementById('signer')?.value || '',
                no_signature: document.getElementById('noSignature')?.checked || false,
                has_seal: document.getElementById('hasSeal')?.checked || false,
                party_a_seal: document.getElementById('partyASeal')?.checked || false,
                party_b_seal: document.getElementById('partyBSeal')?.checked || false,
                no_seal: document.getElementById('noSeal')?.checked || false,
                other_seal: document.getElementById('otherSeal')?.value || '',
                project_id: appState.currentProjectId
            };

            const response = await fetch('/api/documents/archive-from-zip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.status === 'success') {
                successCount++;
            } else {
                failCount++;
            }
        }

        if (failCount === 0) {
            showNotification(`成功归档 ${successCount} 个文件！`, 'success');
        } else {
            showNotification(`归档完成：成功 ${successCount}，失败 ${failCount}`, failCount > 0 ? 'warning' : 'success');
        }

        resetZipPanel();
        loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
        // 刷新周期进度显示
        refreshCycleProgress();
    } catch (e) {
        showNotification('归档失败: ' + e.message, 'error');
        if (archiveBtn) archiveBtn.disabled = false;
    } finally {
        showLoading(false);
    }
}

/** 工具函数：HTML 转义 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** 工具函数：正则转义 */
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 处理文件选择 - 显示预览
 */
function handleFileSelect(e) {
    updateFilePreview();
}

/**
 * 更新文件预览区域
 */
function updateFilePreview() {
    const fileInput = elements.fileInput;
    const fileInfo = document.getElementById('selectedFileInfo');
    const confirmBtn = document.getElementById('uploadBtn');
    const replaceBtn = document.getElementById('replaceArchiveBtn');
    
    // 如果元素不存在，直接返回
    if (!fileInfo) return;
    
    if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileName = file.name;
        const fileSize = formatFileSize(file.size);
        
        // 根据文件类型显示不同图标
        let icon = '📄';
        if (fileName.endsWith('.pdf')) icon = '📕';
        else if (fileName.match(/\.(doc|docx)$/i)) icon = '📝';
        else if (fileName.match(/\.(xls|xlsx)$/i)) icon = '📊';
        else if (fileName.match(/\.(jpg|jpeg|png|gif)$/i)) icon = '🖼️';
        
        fileInfo.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name" title="${escapeHtml(fileName)}">${fileName}</div>
            <div class="file-size">${fileSize}</div>
        `;
        
        if (confirmBtn) confirmBtn.disabled = false;
        
        // 如果已有归档文档，显示替换按钮
        const docCount = parseInt(elements.docCount?.textContent) || 0;
        if (replaceBtn) replaceBtn.style.display = docCount > 0 ? 'inline-block' : 'none';
    } else {
        fileInfo.innerHTML = '<p class="placeholder">请选择文件</p>';
        if (confirmBtn) confirmBtn.disabled = true;
        if (replaceBtn) replaceBtn.style.display = 'none';
    }
}

/**
 * 确认归档 - 提交表单
 */
function handleConfirmArchive(e) {
    e.preventDefault();
    // 直接触发表单提交
    handleUploadDocument(e);
}

/**
 * 替换归档文件
 */
function handleReplaceArchive() {
    // 触发文件上传表单提交，替换已有文件
    handleUploadDocument({ preventDefault: () => {} });
}

/**
 * 加载已上传的文档
 */
async function loadUploadedDocuments(cycle, docName) {
    try {
        // 检查必要元素是否存在
        if (!elements.documentsList) {
            console.error('[loadUploadedDocuments] documentsList 元素不存在');
            return;
        }
        
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(cycle)}&doc_name=${encodeURIComponent(docName)}`);
        const result = await response.json();

        if (result.status === 'success') {
            const docs = result.data || [];
            if (elements.docCount) {
                elements.docCount.textContent = docs.length;
            }

            if (docs.length === 0) {
                elements.documentsList.innerHTML = '<p class="placeholder">暂无已上传的文档</p>';
            } else {
                // 按分类分组文档
                const docsByCategory = {};
                docs.forEach(doc => {
                    const category = doc.category || '未分类';
                    if (!docsByCategory[category]) {
                        docsByCategory[category] = [];
                    }
                    docsByCategory[category].push(doc);
                });
                
                let html = `
                    <div class="batch-actions" style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="selectAllDocs" onchange="toggleSelectAll()" style="width: 18px; height: 18px;">
                        <label for="selectAllDocs" style="margin: 0; cursor: pointer;">全选</label>
                        <button class="btn btn-primary btn-sm" onclick="batchUpdateDocuments('seal')" disabled id="batchSealBtn" style="margin-left: 10px;">批量标记已盖章</button>
                        <button class="btn btn-success btn-sm" onclick="batchUpdateDocuments('sign')" disabled id="batchSignBtn" style="margin-left: 5px;">批量标记已签字</button>
                        <button class="btn btn-danger btn-sm" onclick="batchDeleteDocuments()" disabled id="batchDeleteBtn" style="margin-left: auto;">批量删除</button>
                    </div>
                `;
                
                // 渲染每个分类的文档
                for (const [category, categoryDocs] of Object.entries(docsByCategory)) {
                    html += `
                        <div style="margin-bottom: 20px;">
                            <h4 style="margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #0066cc; color: #333;">
                                📁 ${category} <span style="font-size: 12px; font-weight: normal; color: #666;">(${categoryDocs.length}个文件)</span>
                            </h4>
                            ${categoryDocs.map(doc => `
                                <div class="document-item" data-doc-id="${doc.id}">
                                    <div style="margin-right: 10px; flex-shrink: 0;">
                                        <input type="checkbox" class="doc-checkbox" data-doc-id="${doc.id}" onchange="updateBatchButtons()" style="width: 18px; height: 18px;">
                                    </div>
                                    <div class="document-info">
                                        <div class="file-name" onclick="previewDocument('${doc.id}')" title="点击预览文件: ${doc.original_filename || doc.filename}" style="cursor: pointer; text-decoration: underline;">📎 ${doc.original_filename || doc.filename}</div>
                                        <div class="file-meta">
                                            上传于: ${new Date(doc.upload_time).toLocaleString('zh-CN')}
                                            <span style="margin-left:10px;">大小: ${formatFileSize(doc.file_size)}</span>
                                        </div>
                                        <div class="document-badges">
                                            ${doc.no_signature ? `<span class="badge badge-secondary">❌ 不涉及签字</span>` : ''}
                                            ${doc.signer ? `<span class="badge badge-success">✅ 签署人: ${doc.signer}</span>` : ''}
                                            ${doc.doc_date ? `<span class="badge badge-info">📅 文档日期: ${formatDateToMonth(doc.doc_date)}</span>` : ''}
                                            ${doc.sign_date && !doc.no_signature ? `<span class="badge badge-info">✍️ 签字日期: ${formatDateToMonth(doc.sign_date)}</span>` : ''}
                                            ${doc.no_seal ? `<span class="badge badge-secondary">❌ 不涉及盖章</span>` : ''}
                                            ${doc.has_seal_marked ? `<span class="badge badge-success">🔖 已盖章</span>` : ''}
                                            ${doc.party_a_seal ? `<span class="badge badge-success">🏢 甲方盖章</span>` : ''}
                                            ${doc.party_b_seal ? `<span class="badge badge-success">🏭 乙方盖章</span>` : ''}
                                            ${doc.other_seal ? `<span class="badge badge-warning">📍 其它盖章: ${doc.other_seal}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="document-actions">
                                        <button class="btn btn-primary" onclick="previewDocument('${doc.id}')" title="预览文件">👁️ 预览</button>
                                        <button class="btn btn-info" onclick="openEditModal('${doc.id}')">✏️ 编辑</button>
                                        <button class="btn btn-warning" onclick="openReplaceModal('${doc.id}')">🔄 替换</button>
                                        <button class="btn btn-danger" onclick="deleteDocument('${doc.id}')">🗑️ 删除</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }
                
                elements.documentsList.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('加载文档列表错误:', error);
        if (elements.documentsList) {
            elements.documentsList.innerHTML = '<p class="placeholder">加载文档列表失败</p>';
        }
    }
}

/**
 * 获取文件类型图标
 */
function getFileIcon(fileExt) {
    const iconMap = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'xls': '📊',
        'xlsx': '📊',
        'ppt': '📑',
        'pptx': '📑',
        'png': '🖼️',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'gif': '🖼️',
        'webp': '🖼️',
        'bmp': '🖼️'
    };
    return iconMap[fileExt.toLowerCase()] || '📄';
}

/**
 * 预览文档 - 带进度条
 */
function previewDocument(docId) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const content = document.getElementById('previewContent');
    const downloadBtn = document.getElementById('previewDownloadBtn');

    // 显示增强版加载界面
    title.textContent = '正在准备预览...';
    downloadBtn.href = `/api/documents/download/${encodeURIComponent(docId)}`;
    
    // 使用增强版加载界面
    content.innerHTML = `
        <div class="preview-loading-enhanced" id="previewLoadingEnhanced">
            <div class="preview-file-info">
                <div class="file-icon" id="previewFileIcon">📄</div>
                <div class="file-name" id="previewFileName">正在获取文件信息...</div>
            </div>
            <div class="loading-icon">⚡</div>
            <div class="loading-title" id="loadingTitle">正在准备预览...</div>
            <div class="loading-status" id="loadingStatus">正在连接服务器...</div>
            <div class="preview-progress-container">
                <div class="preview-progress-bar">
                    <div class="preview-progress-indeterminate" id="progressBar"></div>
                </div>
                <div class="preview-progress-text" id="progressText">初始化中...</div>
            </div>
            <div class="loading-hint">
                <span class="hint-icon">💡</span>
                <span id="loadingHint">首次预览需要转换文档格式，请稍候</span>
            </div>
        </div>
    `;
    modal.classList.add('show');
    
    fetch(`/api/documents/preview/${encodeURIComponent(docId)}`)
        .then(response => response.json())
        .then(result => {
            if (result.status === 'success') {
                // 更新文件名和图标
                const filename = result.data.filename || '文档';
                const fileExt = filename.split('.').pop().toLowerCase();
                const fileIconEl = document.getElementById('previewFileIcon');
                const fileNameEl = document.getElementById('previewFileName');
                if (fileIconEl) fileIconEl.textContent = getFileIcon(fileExt);
                if (fileNameEl) fileNameEl.textContent = filename;
                
                // 显示加载完成状态
                const loadingTitle = document.getElementById('loadingTitle');
                const loadingStatus = document.getElementById('loadingStatus');
                if (loadingTitle) loadingTitle.textContent = '加载完成，正在渲染...';
                if (loadingStatus) loadingStatus.textContent = '正在显示预览内容';
                
                // 延迟后显示内容
                setTimeout(() => {
                    title.textContent = `预览: ${filename}`;
                    renderPreviewContent(result.data, content);
                }, 200);
            } else {
                // API返回错误，显示友好的错误界面
                const errorMessage = result.message || '预览加载失败';
                const downloadUrl = `/api/documents/download/${encodeURIComponent(docId)}`;
                
                // 根据错误类型选择不同的图标和提示
                let icon = '📄';
                let hint = '您可以下载文件后使用本地软件查看';
                
                if (errorMessage.includes('不存在') || errorMessage.includes('移动') || errorMessage.includes('删除')) {
                    icon = '❌';
                    hint = '文件可能已被移动或删除，请检查文件是否存在';
                } else if (errorMessage.includes('权限')) {
                    icon = '🔒';
                    hint = '无法访问该文件，请检查文件权限';
                } else if (errorMessage.includes('损坏')) {
                    icon = '⚠️';
                    hint = '文件可能已损坏，请尝试下载后查看';
                } else if (errorMessage.includes('转换')) {
                    icon = '🔄';
                    hint = 'PDF转换服务暂时不可用，请下载后查看';
                }
                
                title.textContent = '预览失败';
                content.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); min-height: 400px; border-radius: 12px;">
                        <div style="font-size: 64px; margin-bottom: 24px;">${icon}</div>
                        <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 12px;">预览失败</div>
                        <div style="font-size: 14px; color: #666; margin-bottom: 8px; text-align: center; max-width: 400px;">${errorMessage}</div>
                        <div style="font-size: 13px; color: #999; margin-bottom: 24px; text-align: center;">${hint}</div>
                        <a href="${downloadUrl}" class="btn btn-primary" target="_blank" style="padding: 12px 32px; font-size: 14px; text-decoration: none; border-radius: 6px; background: #4f8ef7; color: white;">⬇️ 下载文件查看</a>
                        <div style="font-size: 12px; color: #aaa; margin-top: 20px; padding-top: 16px; border-top: 1px solid #ddd;">
                            💡 提示：下载后可用 Word、WPS 等软件打开
                        </div>
                    </div>
                `;
            }
        })
        .catch(error => {
            console.error('预览加载失败:', error);
            const downloadUrl = `/api/documents/download/${encodeURIComponent(docId)}`;
            title.textContent = '预览失败';
            content.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); min-height: 400px; border-radius: 12px;">
                    <div style="font-size: 64px; margin-bottom: 24px;">⚠️</div>
                    <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 12px;">加载失败</div>
                    <div style="font-size: 14px; color: #666; margin-bottom: 8px; text-align: center;">${error.message || '网络错误或服务器无响应'}</div>
                    <div style="font-size: 13px; color: #999; margin-bottom: 24px; text-align: center;">请检查网络连接后重试，或直接下载文件查看</div>
                    <a href="${downloadUrl}" class="btn btn-primary" target="_blank" style="padding: 12px 32px; font-size: 14px; text-decoration: none; border-radius: 6px; background: #4f8ef7; color: white;">⬇️ 下载文件查看</a>
                </div>
            `;
        });
}

function renderPreviewContent(result, content) {
    const type = result.type;
    const data = result.content;

    switch (type) {
        case 'image':
            content.innerHTML = `<div class="image-preview-container">
                <img src="${data}" alt="文档预览" style="max-width:100%;max-height:80vh;object-fit:contain;">
            </div>`;
            break;

        case 'pdf':
            if (Array.isArray(data) && data.length > 0) {
                let html = '<div class="pdf-preview-container">';
                data.forEach((img, index) => {
                    html += `<div class="pdf-page">
                        <p style="font-size:12px;color:#666;margin-bottom:5px;">第 ${index + 1} 页</p>
                        <img src="${img}" alt="第${index + 1}页" style="max-width:100%;">
                    </div>`;
                });
                html += '</div>';
                content.innerHTML = html;
            } else {
                content.innerHTML = `<div class="preview-placeholder">
                    <p>PDF无法转换为图片预览</p>
                    <p style="font-size:14px;margin-top:10px;">请使用下载按钮查看文件</p>
                </div>`;
            }
            break;

        case 'docx':
            content.innerHTML = `<div class="docx-preview-wrapper">
                <style>
                    .docx-preview { font-family: 'Microsoft YaHei', sans-serif; padding: 20px; line-height: 1.6; }
                    .docx-preview p { margin: 10px 0; }
                    .docx-h1 { font-size: 24px; font-weight: bold; margin: 20px 0 10px; }
                    .docx-h2 { font-size: 20px; font-weight: bold; margin: 18px 0 8px; }
                    .docx-h3 { font-size: 18px; font-weight: bold; margin: 16px 0 6px; }
                </style>
                ${data}
            </div>`;
            break;

        case 'xlsx':
            content.innerHTML = `<div class="xlsx-preview-wrapper">
                <style>
                    .xlsx-preview { overflow-x: auto; }
                    .data-table { border-collapse: collapse; width: 100%; font-size: 13px; }
                    .data-table th, .data-table td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
                    .data-table th { background-color: #f5f5f5; font-weight: bold; position: sticky; top: 0; }
                    .data-table tr:nth-child(even) { background-color: #f9f9f9; }
                    .data-table tr:hover { background-color: #f0f0f0; }
                </style>
                ${data}
            </div>`;
            break;

        case 'text':
            content.innerHTML = `<div class="text-preview-container">
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; line-height: 1.5; padding: 20px; background: #f5f5f5; border-radius: 4px; overflow: auto; max-height: 70vh;">${escapeHtml(data)}</pre>
            </div>`;
            break;

        case 'unsupported':
            content.innerHTML = `<div class="preview-placeholder">
                <p style="font-size:48px;margin-bottom:20px;">📄</p>
                <p>${data}</p>
                <p style="font-size:14px;margin-top:10px;">请使用下载按钮查看文件</p>
            </div>`;
            break;

        default:
            content.innerHTML = `<div class="preview-error">
                <p>未知的预览类型: ${type}</p>
            </div>`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openPreviewModal(docId, fileName, fileExt, filePath) {
    previewDocument(docId);
}

/**
 * 关闭预览模态框
 */
function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    const content = document.getElementById('previewContent');
    modal.classList.remove('show');
    // 清空内容
    content.innerHTML = '';
}

/**
 * 处理上传文档（支持分片上传和断点续传）
 */
async function handleUploadDocument(e) {
    e.preventDefault();

    const file = elements.fileInput.files[0];
    if (!file) {
        showNotification('请选择文件', 'error');
        return;
    }

    // 文件大小阈值：10MB，超过则使用分片上传
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    const fileSize = file.size;

    if (fileSize > CHUNK_SIZE) {
        // 使用分片上传
        await handleChunkedUpload(file);
    } else {
        // 使用普通上传
        await handleNormalUpload(file);
    }
}

/**
 * 普通上传（小文件）
 */
async function handleNormalUpload(file) {
    // 获取选中的分类
    const selectedCategory = document.querySelector('input[name="documentCategory"]:checked');
    const category = selectedCategory ? selectedCategory.value : '';
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cycle', appState.currentCycle);
    formData.append('doc_name', appState.currentDocument);
    formData.append('category', category);
    formData.append('doc_date', elements.docDate.value);
    formData.append('sign_date', elements.signDate.value);
    formData.append('signer', elements.signer.value);
    formData.append('no_signature', document.getElementById('noSignature')?.checked || false);
    formData.append('has_seal', elements.hasSeal.checked);
    formData.append('party_a_seal', elements.partyASeal.checked);
    formData.append('party_b_seal', elements.partyBSeal.checked);
    formData.append('no_seal', document.getElementById('noSeal')?.checked || false);
    formData.append('other_seal', elements.otherSeal.value);
    formData.append('project_id', appState.currentProjectId || '');

    showLoading(true);

    try {
        const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.status === 'success') {
            showNotification('文档归档成功！', 'success');
            elements.uploadForm.reset();

            // 设置今天的日期为默认值
            const today = new Date().toISOString().split('T')[0];
            elements.docDate.value = today;
            elements.signDate.value = today;

            // 刷新已上传文档列表
            loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
            
            // 重置文件预览
            updateFilePreview();
            
            // 刷新周期进度显示
            refreshCycleProgress();

            console.log('文档信息:', result.metadata);
        } else {
            showNotification('上传失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('上传文档错误:', error);
        showNotification('上传文档出错: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 分片上传（大文件支持断点续传）
 */
async function handleChunkedUpload(file) {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // 创建进度显示元素
    const progressContainer = createProgressContainer(file.name);
    const progressBar = progressContainer.querySelector('.progress-bar');
    const progressText = progressContainer.querySelector('.progress-text');
    const uploadArea = document.querySelector('.upload-area');
    if (uploadArea) {
        uploadArea.appendChild(progressContainer);
    }

    try {
        // 1. 初始化上传会话
        const initResponse = await fetch('/api/upload/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: file.name,
                total_chunks: totalChunks,
                file_size: file.size
            })
        });

        const initResult = await initResponse.json();
        if (initResult.status !== 'success') {
            throw new Error(initResult.message);
        }

        const uploadId = initResult.upload_id;

        // 2. 检查断点续传（已有上传历史）
        let uploadedChunks = [];
        try {
            const checkResponse = await fetch(`/api/upload/check?upload_id=${uploadId}`);
            const checkResult = await checkResponse.json();
            if (checkResult.status === 'success') {
                uploadedChunks = checkResult.uploaded_chunks || [];
            }
        } catch (e) {
            // 如果检查失败，从头开始上传
            console.log('未找到之前的上传进度，将从头开始');
        }

        // 3. 逐个上传分片
        const startChunk = uploadedChunks.length;
        
        for (let i = startChunk; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('upload_id', uploadId);
            formData.append('chunk_index', i);
            formData.append('file', chunk);

            const chunkResponse = await fetch('/api/upload/chunk', {
                method: 'POST',
                body: formData
            });

            const chunkResult = await chunkResponse.json();
            
            if (chunkResult.status !== 'success') {
                throw new Error(`分片 ${i + 1} 上传失败: ${chunkResult.message}`);
            }

            // 更新进度
            const progress = ((i + 1) / totalChunks) * 100;
            progressBar.style.width = progress + '%';
            progressText.textContent = `上传中 ${formatFileSize(end)} / ${formatFileSize(file.size)} (${Math.round(progress)}%)`;
        }

        // 4. 合并分片
        progressText.textContent = '正在处理文件...';
        
        // 获取选中的分类
        const selectedCategory = document.querySelector('input[name="documentCategory"]:checked');
        const category = selectedCategory ? selectedCategory.value : '';
        
        const mergeResponse = await fetch('/api/upload/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                upload_id: uploadId,
                cycle: appState.currentCycle,
                doc_name: appState.currentDocument,
                category: category,
                doc_date: elements.docDate.value,
                sign_date: elements.signDate.value,
                signer: elements.signer.value,
                has_seal: elements.hasSeal.checked,
                party_a_seal: elements.partyASeal.checked,
                party_b_seal: elements.partyBSeal.checked,
                other_seal: elements.otherSeal.value,
                project_id: appState.currentProjectId || ''
            })
        });

        const mergeResult = await mergeResponse.json();

        if (mergeResult.status === 'success') {
            showNotification('文档上传成功！', 'success');
            elements.uploadForm.reset();

            // 设置今天的日期为默认值
            const today = new Date().toISOString().split('T')[0];
            elements.docDate.value = today;
            elements.signDate.value = today;

            // 刷新已上传文档列表
            loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
            
            // 刷新周期进度显示
            refreshCycleProgress();

            console.log('文档信息:', mergeResult.metadata);
        } else {
            throw new Error(mergeResult.message);
        }

    } catch (error) {
        console.error('分片上传错误:', error);
        showNotification('上传失败: ' + error.message, 'error');
    } finally {
        // 移除进度条
        if (progressContainer && progressContainer.parentNode) {
            progressContainer.parentNode.removeChild(progressContainer);
        }
    }
}

/**
 * 创建进度条容器
 */
function createProgressContainer(filename) {
    const container = document.createElement('div');
    container.className = 'upload-progress-container';
    container.innerHTML = `
        <div class="progress-info">
            <span class="progress-filename">${filename}</span>
            <span class="progress-text">准备上传...</span>
        </div>
        <div class="progress-bar-bg">
            <div class="progress-bar" style="width: 0%"></div>
        </div>
    `;
    return container;
}

/**
 * 删除文档
 */
async function deleteDocument(docId) {
    console.log('deleteDocument 被调用，docId:', docId);
    
    // 确保确认模态框显示在最上层
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.style.zIndex = '9999';
        confirmModal.style.position = 'fixed';
    }
    
    showConfirmModal('确认删除', '确定要删除此文档吗？', async () => {
        console.log('确认删除回调执行');
        try {
            const response = await fetch(`/api/documents/${docId}`, {
                method: 'DELETE'
            });
            console.log('删除响应状态:', response.status);

            const result = await response.json();
            console.log('删除结果:', result);

            if (result.status === 'success') {
                showNotification('文档已删除', 'success');
                // 刷新列表
                const cycle = appState.currentCycle;
                const docName = appState.currentDocument;
                console.log('刷新列表，cycle:', cycle, 'docName:', docName);
                
                // 强制刷新文档列表
                if (cycle && docName) {
                    await loadUploadedDocuments(cycle, docName);
                    // 刷新周期进度显示
                    refreshCycleProgress();
                    // 重新计算已选择文档数量
                    updateBatchButtons();
                }
            } else {
                showNotification('删除失败: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('删除文档错误:', error);
            showNotification('删除文档出错: ' + error.message, 'error');
        }
    });
}

/**
 * 切换全选/取消全选
 */
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllDocs');
    const checkboxes = document.querySelectorAll('.doc-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    
    updateBatchButtons();
}

/**
 * 更新批量操作按钮状态
 */
function updateBatchButtons() {
    const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
    const selectedCount = checkboxes.length;
    
    // 更新批量操作按钮状态
    const batchEditBtn = document.getElementById('batchEditBtn');
    const batchReplaceBtn = document.getElementById('batchReplaceBtn');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    const selectedCountEl = document.getElementById('selectedCount');
    
    if (batchEditBtn) batchEditBtn.disabled = selectedCount === 0;
    if (batchReplaceBtn) batchReplaceBtn.disabled = selectedCount === 0;
    if (batchDeleteBtn) batchDeleteBtn.disabled = selectedCount === 0;
    if (selectedCountEl) selectedCountEl.textContent = `已选择 ${selectedCount} 个文档`;
}

/**
 * 批量更新文档属性
 */
async function batchUpdateDocuments(action) {
    const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
    const selectedDocIds = Array.from(checkboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择要操作的文档', 'error');
        return;
    }
    
    showConfirmModal('批量操作', `确定要${action === 'seal' ? '标记已盖章' : '标记已签字'}选中的 ${selectedDocIds.length} 个文档吗？`, async () => {
        try {
            const response = await fetch('/api/documents/batch-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doc_ids: selectedDocIds,
                    action: action
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                showNotification(`已成功${action === 'seal' ? '标记已盖章' : '标记已签字'}选中的文档`, 'success');
                // 刷新文档列表
                if (appState.currentCycle && appState.currentDocument) {
                    loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
                }
            } else {
                showNotification(result.message || '操作失败', 'error');
            }
        } catch (error) {
            console.error('批量操作失败:', error);
            showNotification('批量操作时发生错误', 'error');
        }
    });
}

/**
 * 批量删除文档
 */
async function batchDeleteDocuments() {
    const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
    const selectedDocIds = Array.from(checkboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择要删除的文档', 'error');
        return;
    }
    
    showConfirmModal('批量删除', `确定要删除选中的 ${selectedDocIds.length} 个文档吗？`, async () => {
        try {
            const response = await fetch('/api/documents/batch-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doc_ids: selectedDocIds
                })
            });

            const result = await response.json();

            if (result.status === 'success') {
                showNotification(`已成功删除 ${selectedDocIds.length} 个文档`, 'success');
                // 刷新文档列表
                if (appState.currentCycle && appState.currentDocument) {
                    loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
                }
            } else {
                showNotification(result.message || '删除失败', 'error');
            }
        } catch (error) {
            console.error('批量删除失败:', error);
            showNotification('批量删除时发生错误', 'error');
        }
    });
}

/**
 * 加载分类
 */
async function loadCategories(cycle, docName) {
    try {
        const projectId = appState.currentProjectId;
        const response = await fetch(`/api/documents/categories?cycle=${encodeURIComponent(cycle)}&doc_name=${encodeURIComponent(docName)}&project_id=${encodeURIComponent(projectId)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const categories = result.data || [];
            renderCategoryManagement(categories, cycle, docName);
        }
    } catch (error) {
        console.error('加载分类失败:', error);
    }
}

/**
 * 渲染分类管理界面
 */
function renderCategoryManagement(categories, cycle, docName) {
    // 检查是否已存在分类管理区域
    let categorySection = document.getElementById('categoryManagement');
    if (!categorySection) {
        // 创建分类管理区域
        categorySection = document.createElement('div');
        categorySection.id = 'categoryManagement';
        categorySection.style.marginTop = '20px';
        categorySection.style.padding = '15px';
        categorySection.style.background = '#f8f9fa';
        categorySection.style.borderRadius = '8px';
        
        // 插入到上传表单之前
        const uploadForm = document.getElementById('uploadForm');
        uploadForm.parentNode.insertBefore(categorySection, uploadForm);
    }
    
    // 渲染分类管理内容
    categorySection.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 15px; color: #333;">分类管理</h3>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <input type="text" id="newCategoryName" placeholder="输入新分类名称" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <button class="btn btn-primary btn-sm" onclick="createCategory('${cycle}', '${docName}')">添加分类</button>
        </div>
        <div id="categoriesList" style="margin-bottom: 15px;">
            ${categories.length > 0 ? 
                categories.map(category => `
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px; padding: 8px; background: white; border-radius: 4px;">
                        <input type="radio" name="documentCategory" value="${category}" style="margin: 0;">
                        <span>${category}</span>
                        <button class="btn btn-danger btn-sm" onclick="deleteCategory('${cycle}', '${docName}', '${category}')" style="margin-left: auto;">删除</button>
                    </div>
                `).join('') : 
                '<p style="color: #666; font-size: 13px;">暂无分类，点击添加分类按钮创建</p>'
            }
        </div>
        <div style="font-size: 12px; color: #666;">
            <p>说明：创建分类后，上传文档时会自动按分类组织文件</p>
        </div>
    `;
}

/**
 * 创建分类
 */
async function createCategory(cycle, docName) {
    const categoryName = document.getElementById('newCategoryName').value.trim();
    if (!categoryName) {
        showNotification('请输入分类名称', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/documents/category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cycle: cycle,
                doc_name: docName,
                category: categoryName,
                project_id: appState.currentProjectId
            })
        });
        
        const result = await response.json();
        if (result.status === 'success') {
            showNotification('分类创建成功', 'success');
            document.getElementById('newCategoryName').value = '';
            loadCategories(cycle, docName);
        } else {
            showNotification(result.message || '创建分类失败', 'error');
        }
    } catch (error) {
        console.error('创建分类失败:', error);
        showNotification('创建分类时发生错误', 'error');
    }
}

/**
 * 删除分类
 */
async function deleteCategory(cycle, docName, category) {
    showConfirmModal('确认删除', `确定要删除分类 "${category}" 吗？`, async () => {
        try {
            const response = await fetch('/api/documents/category', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cycle: cycle,
                    doc_name: docName,
                    category: category,
                    project_id: appState.currentProjectId
                })
            });
            
            const result = await response.json();
            if (result.status === 'success') {
                showNotification('分类删除成功', 'success');
                loadCategories(cycle, docName);
            } else {
                showNotification(result.message || '删除分类失败', 'error');
            }
        } catch (error) {
            console.error('删除分类失败:', error);
            showNotification('删除分类时发生错误', 'error');
        }
    });
}

/**
 * 生成报告
 */
async function handleGenerateReport() {
    if (!appState.projectConfig) {
        showNotification('请先加载项目配置', 'error');
        return;
    }

    const progress = showOperationProgress('report-' + Date.now(), '正在生成报告...');
    progress.update(20, '正在收集数据...');

    showLoading(true);

    try {
        const response = await fetch('/api/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_config: appState.projectConfig
            })
        });

        progress.update(60, '正在生成报告...');

        const result = await response.json();

        if (result.status === 'success') {
            progress.complete('报告生成成功');
            renderReport(result.data);
            openModal(elements.reportModal);
        } else {
            progress.error('生成失败: ' + result.message);
            showNotification('生成报告失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('生成报告错误:', error);
        progress.error('生成失败: ' + error.message);
        showNotification('生成报告出错: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染报告
 */
function renderReport(reportData) {
    const cyclesDetail = reportData.cycles_detail || {};
    const projectName = reportData.project_name || '未命名项目';
    
    // 获取周期顺序（从项目配置）
    const cycleOrder = appState.projectConfig?.cycles || Object.keys(cyclesDetail);
    
    // 按顺序遍历周期
    const cyclesHTML = cycleOrder.map(cycle => {
        const stats = cyclesDetail[cycle];
        if (!stats) return '';
        const completionRate = stats.completion_rate || 0;
        return `
            <div class="cycle-report">
                <h4>${cycle}</h4>
                <div class="cycle-report-bar">
                    <div class="cycle-report-progress" style="width: ${completionRate}%">
                        ${completionRate.toFixed(1)}%
                    </div>
                </div>
                <div class="cycle-report-stats">
                    <span>✅ 已上传: ${stats.uploaded}个</span>
                    <span>📋 需要: ${stats.required}个</span>
                    <span>❌ 缺失: ${stats.missing}个</span>
                </div>
            </div>
        `;
    }).join('');

    const html = `
        <h2>📊 ${projectName} - 文档管理报告</h2>
        <div class="report-summary">
            <div class="summary-item highlight">
                <div class="label">总体完成率</div>
                <div class="value">${reportData.completion_rate.toFixed(1)}%</div>
            </div>
            <div class="summary-item">
                <div class="label">项目周期数</div>
                <div class="value">${reportData.total_cycles}</div>
            </div>
            <div class="summary-item">
                <div class="label">已上传文档</div>
                <div class="value">${reportData.total_uploaded_documents}</div>
            </div>
            <div class="summary-item">
                <div class="label">需求文档总数</div>
                <div class="value">${reportData.total_required_documents}</div>
            </div>
        </div>

        <h3>各周期详情</h3>
        ${cyclesHTML}
    `;

    elements.reportContent.innerHTML = html;
}

/**
 * 导出报告
 */
async function handleExportReport() {
    if (!appState.projectConfig) {
        showNotification('请先加载项目配置', 'error');
        return;
    }

    try {
        const response = await fetch('/api/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_config: appState.projectConfig
            })
        });

        const reportData = await response.json();

        if (reportData.status === 'success') {
            const html = generateReportHTML(reportData.data);
            downloadHTML(html, '文档管理报告.html');
            showNotification('报告已导出', 'success');
        }
    } catch (error) {
        console.error('导出报告错误:', error);
        showNotification('导出报告出错: ' + error.message, 'error');
    }
}

/**
 * 生成报告HTML
 */
function generateReportHTML(reportData) {
    const cyclesDetail = reportData.cycles_detail || {};
    const projectName = reportData.project_name || '未命名项目';
    
    // 获取周期顺序（从项目配置）
    const cycleOrder = appState.projectConfig?.cycles || Object.keys(cyclesDetail);
    
    // 按顺序遍历周期
    const cyclesHTML = cycleOrder.map(cycle => {
        const stats = cyclesDetail[cycle];
        if (!stats) return '';
        const completionRate = stats.completion_rate || 0;
        return `
            <tr>
                <td>${cycle}</td>
                <td>${stats.required}</td>
                <td>${stats.uploaded}</td>
                <td>${stats.missing}</td>
                <td>${completionRate.toFixed(1)}%</td>
            </tr>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <title>${projectName} - 文档管理报告</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    color: #333;
                }
                h1 {
                    color: #0066cc;
                    border-bottom: 2px solid #0066cc;
                    padding-bottom: 10px;
                }
                .summary {
                    background: #f5f5f5;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .summary-item {
                    display: inline-block;
                    margin-right: 30px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background: #0066cc;
                    color: white;
                    padding: 12px;
                    text-align: left;
                }
                td {
                    padding: 10px;
                    border-bottom: 1px solid #ddd;
                }
                tr:hover {
                    background: #f9f9f9;
                }
                .footer {
                    margin-top: 30px;
                    font-size: 12px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <h1>${projectName} - 文档管理报告</h1>
            
            <div class="summary">
                <div class="summary-item"><strong>报告生成时间:</strong> ${new Date(reportData.generate_time).toLocaleString('zh-CN')}</div>
                <div class="summary-item"><strong>总体完成率:</strong> ${reportData.completion_rate.toFixed(1)}%</div>
            </div>

            <h2>统计摘要</h2>
            <p>
                <strong>项目周期数:</strong> ${reportData.total_cycles}<br>
                <strong>已上传文档:</strong> ${reportData.total_uploaded_documents}<br>
                <strong>需求文档总数:</strong> ${reportData.total_required_documents}
            </p>

            <h2>各周期详情</h2>
            <table>
                <thead>
                    <tr>
                        <th>周期</th>
                        <th>需求文档数</th>
                        <th>已上传数</th>
                        <th>缺失数</th>
                        <th>完成率</th>
                    </tr>
                </thead>
                <tbody>
                    ${cyclesHTML}
                </tbody>
            </table>

            <div class="footer">
                <p>此报告由项目文档管理中心自动生成</p>
            </div>
        </body>
        </html>
    `;
}

/**
 * 下载HTML文件
 */
function downloadHTML(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

/**
 * 打开模态框
 */
function openModal(modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭模态框
 */
function closeModal(modal) {
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
function showLoading(show = true) {
    if (show) {
        elements.loadingIndicator.classList.add('show');
    } else {
        elements.loadingIndicator.classList.remove('show');
    }
}

/**
 * 显示通知
 */
function showNotification(message, type = 'info') {
    elements.notification.textContent = message;
    elements.notification.className = `notification show ${type}`;

    // 3秒后自动隐藏
    setTimeout(() => {
        elements.notification.classList.remove('show');
    }, 3000);
}

/**
 * 根据文件名获取文件图标
 */
function getFileIcon(filename) {
    if (!filename) return '📄';
    if (filename.endsWith('.pdf')) return '📕';
    if (filename.match(/\.(doc|docx)$/i)) return '📝';
    if (filename.match(/\.(xls|xlsx)$/i)) return '📊';
    if (filename.match(/\.(jpg|jpeg|png|gif|bmp)$/i)) return '🖼️';
    if (filename.match(/\.(ppt|pptx)$/i)) return '📊';
    if (filename.match(/\.zip$/i)) return '🗜️';
    if (filename.match(/\.txt$/i)) return '📃';
    return '📄';
}

/**
 * 格式化日期为年月格式（YYYY年MM月）
 * @param {string} dateStr - 日期字符串，格式为 YYYY-MM-DD
 * @returns {string} 格式化后的日期，如 "2021年3月"
 */
function formatDateToMonth(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        return `${year}年${month}月`;
    } catch (e) {
        return dateStr;
    }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

/**
 * 打开文档编辑弹窗
 */
async function openEditModal(docId) {
    try {
        // 检查当前周期和文档是否存在
        if (!appState.currentCycle || !appState.currentDocument) {
            console.error('当前周期或文档未设置');
            showNotification('请先选择周期和文档', 'error');
            return;
        }
        
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(appState.currentCycle)}&doc_name=${encodeURIComponent(appState.currentDocument)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const doc = result.data.find(d => d.id === docId);
            if (!doc) {
                showNotification('文档不存在', 'error');
                return;
            }
            
            // 使用 document.getElementById 确保获取到元素
            const editDocId = document.getElementById('editDocId');
            const editDocDate = document.getElementById('editDocDate');
            const editSignDate = document.getElementById('editSignDate');
            const editSigner = document.getElementById('editSigner');
            const editNoSignature = document.getElementById('editNoSignature');
            const editHasSeal = document.getElementById('editHasSeal');
            const editPartyASeal = document.getElementById('editPartyASeal');
            const editPartyBSeal = document.getElementById('editPartyBSeal');
            const editNoSeal = document.getElementById('editNoSeal');
            const editOtherSeal = document.getElementById('editOtherSeal');
            const editDocModal = document.getElementById('editDocModal');
            
            // 检查所有元素是否存在
            if (!editDocId || !editDocDate || !editSignDate || !editSigner || !editNoSignature || 
                !editHasSeal || !editPartyASeal || !editPartyBSeal || !editNoSeal || !editOtherSeal || !editDocModal) {
                console.error('编辑模态框元素缺失');
                showNotification('编辑模态框初始化失败', 'error');
                return;
            }
            
            editDocId.value = docId;
            editDocDate.value = doc.doc_date || '';
            editSignDate.value = doc.sign_date || '';
            editSigner.value = doc.signer || '';
            editNoSignature.checked = doc.no_signature || false;
            editHasSeal.checked = doc.has_seal_marked || false;
            editPartyASeal.checked = doc.party_a_seal || false;
            editPartyBSeal.checked = doc.party_b_seal || false;
            editNoSeal.checked = doc.no_seal || false;
            editOtherSeal.value = doc.other_seal || '';
            
            // 直接使用获取到的模态框元素
            editDocModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        } else {
            console.error('API 请求失败:', result.message);
            showNotification('获取文档信息失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('获取文档信息失败:', error);
        showNotification('获取文档信息失败: ' + error.message, 'error');
    }
}

/**
 * 关闭编辑弹窗
 */
function closeEditModal() {
    const editDocModal = document.getElementById('editDocModal');
    if (editDocModal) {
        editDocModal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

/**
 * 处理文档编辑
 */
async function handleEditDocument(e) {
    e.preventDefault();
    
    const docId = document.getElementById('editDocId').value;
    const data = {
        doc_date: document.getElementById('editDocDate').value,
        sign_date: document.getElementById('editSignDate').value,
        signer: document.getElementById('editSigner').value,
        no_signature: document.getElementById('editNoSignature').checked,
        has_seal_marked: document.getElementById('editHasSeal').checked,
        party_a_seal: document.getElementById('editPartyASeal').checked,
        party_b_seal: document.getElementById('editPartyBSeal').checked,
        no_seal: document.getElementById('editNoSeal').checked,
        other_seal: document.getElementById('editOtherSeal').value
    };
    
    try {
        const response = await fetch(`/api/documents/${docId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('文档信息已更新', 'success');
            closeEditModal();
            loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
        } else {
            showNotification('更新失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('更新文档失败:', error);
        showNotification('更新文档失败', 'error');
    }
}

/**
 * 打开文档替换弹窗
 */
async function openReplaceModal(docId) {
    try {
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(appState.currentCycle)}&doc_name=${encodeURIComponent(appState.currentDocument)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const doc = result.data.find(d => d.id === docId);
            if (!doc) {
                showNotification('文档不存在', 'error');
                return;
            }
            
            document.getElementById('replaceDocId').value = docId;
            document.getElementById('replaceDocDate').value = doc.doc_date || '';
            document.getElementById('replaceSignDate').value = doc.sign_date || '';
            document.getElementById('replaceSigner').value = doc.signer || '';
            document.getElementById('replaceNoSignature').checked = doc.no_signature || false;
            document.getElementById('replaceHasSeal').checked = doc.has_seal_marked || false;
            document.getElementById('replacePartyASeal').checked = doc.party_a_seal || false;
            document.getElementById('replacePartyBSeal').checked = doc.party_b_seal || false;
            document.getElementById('replaceNoSeal').checked = doc.no_seal || false;
            document.getElementById('replaceOtherSeal').value = doc.other_seal || '';
            
            openModal(elements.replaceDocModal);
        }
    } catch (error) {
        console.error('获取文档信息失败:', error);
        showNotification('获取文档信息失败', 'error');
    }
}

/**
 * 处理文档替换
 */
async function handleReplaceDocument(e) {
    e.preventDefault();
    
    const docId = document.getElementById('replaceDocId').value;
    const file = document.getElementById('replaceFile').files[0];
    
    if (!file) {
        showNotification('请选择文件', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_date', document.getElementById('replaceDocDate').value);
    formData.append('sign_date', document.getElementById('replaceSignDate').value);
    formData.append('signer', document.getElementById('replaceSigner').value);
    formData.append('no_signature', document.getElementById('replaceNoSignature').checked || false);
    formData.append('has_seal', document.getElementById('replaceHasSeal').checked);
    formData.append('party_a_seal', document.getElementById('replacePartyASeal').checked);
    formData.append('party_b_seal', document.getElementById('replacePartyBSeal').checked);
    formData.append('no_seal', document.getElementById('replaceNoSeal').checked || false);
    formData.append('other_seal', document.getElementById('replaceOtherSeal').value);
    
    try {
        const response = await fetch(`/api/documents/${docId}/replace`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('文档已替换', 'success');
            closeModal(elements.replaceDocModal);
            document.getElementById('replaceDocForm').reset();
            loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
        } else {
            showNotification('替换失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('替换文档失败:', error);
        showNotification('替换文档失败', 'error');
    }
}

/**
 * 处理ZIP上传（支持分片上传）
 */
async function handleZipUpload(e) {
    e.preventDefault();

    // 检查是否选择了项目
    if (!appState.currentProjectId || !appState.projectConfig) {
        showNotification('请先选择项目再上传ZIP文件', 'error');
        return;
    }

    // 检查项目是否有文档配置
    if (!appState.projectConfig.documents || Object.keys(appState.projectConfig.documents).length === 0) {
        showNotification('当前项目没有配置文档要求，请先导入Excel配置', 'error');
        return;
    }

    const file = document.getElementById('zipFile').files[0];
    if (!file) {
        showNotification('请选择ZIP文件', 'error');
        return;
    }

    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    
    // 如果文件超过分片阈值，使用分片上传
    if (file.size > CHUNK_SIZE) {
        await handleZipChunkedUpload(file);
    } else {
        await handleZipNormalUpload(file);
    }
}

/**
 * 普通ZIP上传（小文件）
 */
async function handleZipNormalUpload(file) {
    // 创建进度显示
    const progress = showOperationProgress('zip-upload-' + Date.now(), '正在上传并解压: ' + file.name);
    progress.update(10, '正在上传文件...');

    const formData = new FormData();
    formData.append('file', file);

    if (appState.projectConfig) {
        formData.append('project_config', JSON.stringify(appState.projectConfig));
    }
    
    // 添加项目ID用于跟踪待确认文件
    if (appState.currentProjectId) {
        formData.append('project_id', appState.currentProjectId);
    }

    try {
        const response = await fetch('/api/documents/zip-upload', {
            method: 'POST',
            body: formData
        });

        progress.update(50, '正在匹配文档...');

        const result = await response.json();

        if (result.status === 'success') {
            // 新逻辑：文件进入待确认状态，不自动导入
            if (result.new_matched_files && result.new_matched_files.length > 0) {
                progress.update(100, `匹配完成: ${result.new_matched_files.length} 个文件需要确认`);
                progress.complete(`解压完成，新匹配 ${result.new_matched_files.length} 个待确认文件`);
                showNotification(result.message, 'success');
                // 渲染待确认文件列表
                renderPendingFiles(result.new_matched_files);
            } else if (result.already_confirmed_files && result.already_confirmed_files.length > 0) {
                progress.update(100, `所有文件已确认过`);
                progress.complete(`${result.already_confirmed_files.length} 个文件已确认过，无需重复操作`);
                showNotification(`${result.already_confirmed_files.length} 个文件已确认过`, 'info');
            } else {
                progress.update(100, `匹配完成`);
                progress.complete('没有新匹配的文件');
                showNotification('没有新匹配的文件', 'info');
            }
            
            // 同时显示已确认过的文件提示
            if (result.already_confirmed_files && result.already_confirmed_files.length > 0) {
                renderAlreadyConfirmedFiles(result.already_confirmed_files);
            }
            
            // 刷新日志
            refreshOperationLog();
        } else {
            progress.error(result.message);
            showNotification('解析失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('上传ZIP失败:', error);
        progress.error(error.message);
        showNotification('上传ZIP失败', 'error');
    }
}

/**
 * 分片上传ZIP（大文件支持断点续传）
 */
async function handleZipChunkedUpload(file) {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 使用新的进度显示面板
    const chunkedProgress = showOperationProgress('zip-chunked-' + Date.now(), '正在上传: ' + file.name);

    try {
        // 1. 先创建临时上传（不解压）然后手动处理
        // 这里我们使用简化的方式：分片上传到临时目录
        
        const initResponse = await fetch('/api/upload/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: file.name,
                total_chunks: totalChunks,
                file_size: file.size
            })
        });

        const initResult = await initResponse.json();
        if (initResult.status !== 'success') {
            throw new Error(initResult.message);
        }

        const uploadId = initResult.upload_id;

        // 2. 逐个上传分片
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('upload_id', uploadId);
            formData.append('chunk_index', i);
            formData.append('file', chunk);

            const chunkResponse = await fetch('/api/upload/chunk', {
                method: 'POST',
                body: formData
            });

            const chunkResult = await chunkResponse.json();
            
            if (chunkResult.status !== 'success') {
                throw new Error(`分片 ${i + 1} 上传失败: ${chunkResult.message}`);
            }

            // 更新进度
            const progressPercent = ((i + 1) / totalChunks) * 100;
            chunkedProgress.update(progressPercent, `上传中 ${formatFileSize(end)} / ${formatFileSize(file.size)}`);
        }

        // 3. 合并分片
        chunkedProgress.update(90, '正在解压ZIP文件...');

        // 调用merge API，但传递特殊参数让后端返回文件路径而不是直接上传文档
        const mergeResponse = await fetch('/api/upload/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                upload_id: uploadId,
                cycle: '_temp_',
                doc_name: '_temp_zip_'
            })
        });

        const mergeResult = await mergeResponse.json();

        if (mergeResult.status !== 'success') {
            throw new Error(mergeResult.message || '合并分片失败');
        }

        const mergedFilePath = mergeResult.file_path;

        if (!mergedFilePath) {
            throw new Error('无法获取上传的文件');
        }

        // 4. 调用后端API进行解压和匹配
        const zipFormData = new FormData();
        // 添加一个标记，让后端知道从哪里读取已上传的文件
        zipFormData.append('uploaded_file_path', mergedFilePath);
        if (appState.projectConfig) {
            zipFormData.append('project_config', JSON.stringify(appState.projectConfig));
        }

        const processResponse = await fetch('/api/documents/zip-upload', {
            method: 'POST',
            body: zipFormData
        });

        const processResult = await processResponse.json();

        if (processResult.status === 'success') {
            chunkedProgress.update(100, '匹配完成');
            chunkedProgress.complete(`解压完成，匹配 ${processResult.matched_files?.length || 0} 个文件`);
            showNotification(processResult.message, 'success');
            renderZipMatchResult(processResult);
            refreshOperationLog();
        } else {
            chunkedProgress.error(processResult.message);
            showNotification('解析失败: ' + processResult.message, 'error');
        }

    } catch (error) {
        console.error('ZIP分片上传错误:', error);
        if (chunkedProgress) {
            chunkedProgress.error(error.message);
        }
        showNotification('ZIP上传失败: ' + error.message, 'error');
    }
}

/**
 * 渲染ZIP匹配结果 - 按文档类型分组显示
 */
function renderZipMatchResult(result) {
    const matchResultDiv = document.getElementById('zipMatchResult');
    const matchedDiv = document.getElementById('matchedFiles');
    const unmatchedDiv = document.getElementById('unmatchedFiles');

    // 按周期和文档类型分组匹配结果
    const groupedMatches = {};
    const matchedFiles = result.matched_files || result.new_matched || [];
    if (matchedFiles.length > 0) {
        matchedFiles.forEach(file => {
            const key = `${file.cycle}|${file.doc_name}`;
            if (!groupedMatches[key]) {
                groupedMatches[key] = {
                    cycle: file.cycle,
                    doc_name: file.doc_name,
                    files: []
                };
            }
            groupedMatches[key].files.push(file);
        });
    }

    // 构建分组HTML
    let matchedHtml = '';
    if (Object.keys(groupedMatches).length > 0) {
        matchedHtml = `<h4>✅ 已匹配文档 (${Object.keys(groupedMatches).length}种)</h4>`;

        for (const key in groupedMatches) {
            const group = groupedMatches[key];
            const groupId = `group_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
            matchedHtml += `
                <div class="match-group">
                    <div class="match-group-header">
                        <label class="match-group-title">
                            <input type="checkbox" class="match-group-checkbox" data-group="${groupId}" checked>
                            <span class="cycle-badge">${group.cycle}</span>
                            <span class="doc-name">${group.doc_name}</span>
                            <span class="file-count">(${group.files.length}个文件)</span>
                        </label>
                    </div>
                    <div class="match-group-files" id="${groupId}">
                        ${group.files.map((file, idx) => {
                            try {
                                const fileJson = JSON.stringify(file);
                                const escapedJson = fileJson.replace(/"/g, '&quot;');
                                return `
                                    <div class="file-match-item">
                                        <input type="checkbox"
                                               id="match_${groupId}_${idx}"
                                               data-file="${escapedJson}"
                                               class="match-file-checkbox"
                                               data-group="${groupId}"
                                               checked>
                                        <div class="file-match-info">
                                            <div class="filename">${file.filename}</div>
                                        </div>
                                    </div>
                                `;
                            } catch (e) {
                                console.error('序列化文件数据失败:', e, file);
                                return '';
                            }
                        }).join('')}
                    </div>
                </div>
            `;
        }
    } else {
        matchedHtml = '<p class="no-match">没有匹配到任何文档</p>';
    }

    matchedDiv.innerHTML = matchedHtml;

    // 添加分组全选/全取消功能
    document.querySelectorAll('.match-group-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const groupId = e.target.dataset.group;
            const groupFiles = document.querySelectorAll(`.match-file-checkbox[data-group="${groupId}"]`);
            groupFiles.forEach(cb => cb.checked = e.target.checked);
        });
    });

    // 文件checkbox状态变化时更新分组checkbox状态
    document.querySelectorAll('.match-file-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const groupId = e.target.dataset.group;
            const groupFiles = document.querySelectorAll(`.match-file-checkbox[data-group="${groupId}"]`);
            const groupCheckbox = document.querySelector(`.match-group-checkbox[data-group="${groupId}"]`);
            const checkedCount = Array.from(groupFiles).filter(cb => cb.checked).length;
            groupCheckbox.checked = checkedCount === groupFiles.length;
            groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupFiles.length;
        });
    });

    // 构建文档类型下拉选项（按序号排序）
    let docTypeOptions = '';
    if (appState.projectConfig && appState.projectConfig.documents) {
        for (const [cycle, docsInfo] of Object.entries(appState.projectConfig.documents)) {
            // 按序号排序
            const docs = (docsInfo.required_docs || []).sort((a, b) => (a.index || 0) - (b.index || 0));
            for (const doc of docs) {
                docTypeOptions += `<option value="${cycle}|${doc.name}">${doc.index || ''}. ${cycle} - ${doc.name}</option>`;
            }
        }
    }

    // 显示未匹配的文件
    const unmatchedFiles = result.unmatched_files || result.unmatched || [];
    if (unmatchedFiles.length > 0) {
        unmatchedDiv.innerHTML = `
            <h4>⚠️ 未匹配到文档的文件 (${unmatchedFiles.length}个) - 可手动选择文档类型</h4>
            <div class="unmatched-files-list">
                ${unmatchedFiles.map((file, idx) => {
                    try {
                        const fileJson = JSON.stringify(file);
                        const escapedJson = fileJson.replace(/"/g, '&quot;');
                        return `
                            <div class="unmatched-file-item manual-match">
                                <input type="checkbox" id="unmatched_${idx}" data-file="${escapedJson}">
                                <span class="filename">${file.filename}</span>
                                <select class="doc-type-select" data-idx="${idx}">
                                    <option value="">-- 选择文档类型 --</option>
                                    ${docTypeOptions}
                                </select>
                            </div>
                        `;
                    } catch (e) {
                        console.error('序列化文件数据失败:', e, file);
                        return '';
                    }
                }).join('')}
            </div>
            <p class="manual-match-hint">💡 提示：选择文件后，在下拉框中选择对应的文档类型，然后点击"导入"按钮</p>
        `;
    } else {
        unmatchedDiv.innerHTML = '<p class="all-matched">所有文件都已匹配！</p>';
    }

    // 显示结果区域
    matchResultDiv.style.display = 'block';


    // 保存匹配结果到全局状态
    appState.zipMatchResult = result;
}

/**
 * 渲染待确认文件列表
 */
function renderPendingFiles(pendingFiles) {
    const section = document.getElementById('pendingFilesSection');
    const listDiv = document.getElementById('pendingFilesList');
    const confirmBtn = document.getElementById('confirmPendingBtn');
    const rejectBtn = document.getElementById('rejectPendingBtn');
    const countSpan = document.getElementById('pendingSelectedCount');
    
    if (!pendingFiles || pendingFiles.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    // 保存待确认文件到全局状态
    appState.pendingFiles = pendingFiles;
    
    let html = '';
    pendingFiles.forEach((file, idx) => {
        const uploadTime = file.upload_time ? new Date(file.upload_time).toLocaleString('zh-CN') : '';
        const fileIcon = getFileIcon(file.filename);
        html += `
            <div class="pending-file-item">
                <input type="checkbox" class="pending-file-checkbox" data-idx="${idx}" id="pending_${idx}">
                <div class="file-icon">${fileIcon}</div>
                <div class="pending-file-info">
                    <div class="filename" title="${escapeHtml(file.filename)}">${file.filename}</div>
                    <div class="match-detail">
                        <span class="cycle-badge">${file.cycle}</span>
                        <span class="doc-name">${file.doc_name}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    listDiv.innerHTML = html;
    section.style.display = 'block';
    
    // 添加checkbox事件监听
    document.querySelectorAll('.pending-file-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updatePendingSelection);
    });
    
    updatePendingSelection();
}

/**
 * 更新待确认文件选择状态
 */
function updatePendingSelection() {
    const checkboxes = document.querySelectorAll('.pending-file-checkbox:checked');
    const count = checkboxes.length;
    const confirmBtn = document.getElementById('confirmPendingBtn');
    const rejectBtn = document.getElementById('rejectPendingBtn');
    const countSpan = document.getElementById('pendingSelectedCount');
    
    // 保存选中的索引
    appState.selectedPendingIndexes = Array.from(checkboxes).map(cb => parseInt(cb.dataset.idx));
    
    if (confirmBtn) confirmBtn.disabled = count === 0;
    if (rejectBtn) rejectBtn.disabled = count === 0;
    if (countSpan) countSpan.textContent = `已选 ${count} 个文件`;
}

/**
 * 确认选中的待确认文件
 */
async function handleConfirmPendingFiles() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    if (!appState.selectedPendingIndexes || appState.selectedPendingIndexes.length === 0) {
        showNotification('请选择要确认的文件', 'error');
        return;
    }
    
    const confirmBtn = document.getElementById('confirmPendingBtn');
    const originalText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '确认中...';
    
    try {
        const response = await fetch('/api/documents/confirm-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                file_ids: appState.selectedPendingIndexes
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification(result.message, 'success');
            
            // 从本地待确认列表中移除已确认的文件
            const remainingPending = appState.pendingFiles.filter((_, idx) => !appState.selectedPendingIndexes.includes(idx));
            
            // 重新渲染待确认列表
            if (remainingPending.length > 0) {
                renderPendingFiles(remainingPending);
            } else {
                document.getElementById('pendingFilesSection').style.display = 'none';
                appState.pendingFiles = [];
            }
            
            // 刷新文档列表显示
            if (typeof loadProjectDocuments === 'function') {
                loadProjectDocuments();
            }
            
            refreshOperationLog();
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('确认文件失败:', error);
        showNotification('确认文件失败', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
    }
}

/**
 * 拒绝选中的待确认文件
 */
async function handleRejectPendingFiles() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    if (!appState.selectedPendingIndexes || appState.selectedPendingIndexes.length === 0) {
        showNotification('请选择要移除的文件', 'error');
        return;
    }
    
    const rejectBtn = document.getElementById('rejectPendingBtn');
    const originalText = rejectBtn.textContent;
    rejectBtn.disabled = true;
    rejectBtn.textContent = '移除中...';
    
    try {
        const response = await fetch('/api/documents/reject-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                file_ids: appState.selectedPendingIndexes
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification(result.message, 'success');
            
            // 从本地待确认列表中移除
            const remainingPending = appState.pendingFiles.filter((_, idx) => !appState.selectedPendingIndexes.includes(idx));
            
            if (remainingPending.length > 0) {
                renderPendingFiles(remainingPending);
            } else {
                document.getElementById('pendingFilesSection').style.display = 'none';
                appState.pendingFiles = [];
            }
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('拒绝文件失败:', error);
        showNotification('拒绝文件失败', 'error');
    } finally {
        rejectBtn.disabled = false;
        rejectBtn.textContent = originalText;
    }
}

/**
 * 渲染已确认过的文件提示
 */
function renderAlreadyConfirmedFiles(files) {
    if (!files || files.length === 0) return;
    
    let html = '<div class="already-confirmed-notice" style="margin-top: 15px; padding: 10px; background: #e8f5e9; border-radius: 6px; color: #2e7d32;">';
    html += `<strong>以下 ${files.length} 个文件已确认过，不会重复匹配：</strong><ul style="margin: 5px 0 0 20px;">`;
    files.forEach(file => {
        html += `<li>${file.filename} (${file.cycle} - ${file.doc_name})</li>`;
    });
    html += '</ul></div>';
    
    // 插入到匹配结果后面
    const matchResult = document.getElementById('zipMatchResult');
    if (matchResult) {
        const noticeDiv = matchResult.querySelector('.already-confirmed-notice');
        if (noticeDiv) noticeDiv.remove();
        matchResult.insertAdjacentHTML('beforeend', html);
    }
}

/**
 * 导入匹配的文件
 */
async function handleImportMatchedFiles() {
    console.log('开始导入文件...');

    // 获取导入按钮并显示进度
    const importBtn = document.getElementById('importMatchedBtn');
    const originalBtnText = importBtn.innerHTML;
    importBtn.disabled = true;

    // 按钮进度条动画
    let progressInterval = null;
    let progressPercent = 0;
    const startButtonProgress = () => {
        importBtn.innerHTML = `<span class="btn-progress-text">正在处理... 0%</span>
            <span class="btn-progress-bar" style="width: 0%"></span>`;
        progressInterval = setInterval(() => {
            progressPercent += Math.random() * 15;
            if (progressPercent > 90) progressPercent = 90;
            importBtn.querySelector('.btn-progress-text').textContent = `正在处理... ${Math.floor(progressPercent)}%`;
            importBtn.querySelector('.btn-progress-bar').style.width = progressPercent + '%';
        }, 200);
    };
    const stopButtonProgress = (success) => {
        if (progressInterval) clearInterval(progressInterval);
        if (success) {
            importBtn.querySelector('.btn-progress-bar').style.backgroundColor = '#28a745';
            importBtn.querySelector('.btn-progress-text').textContent = '完成!';
            importBtn.querySelector('.btn-progress-bar').style.width = '100%';
        } else {
            importBtn.querySelector('.btn-progress-bar').style.backgroundColor = '#dc3545';
            importBtn.querySelector('.btn-progress-text').textContent = '失败';
        }
        setTimeout(() => {
            importBtn.innerHTML = originalBtnText;
            importBtn.disabled = false;
        }, 1500);
    };

    // 选择已匹配文件中的checkbox
    const matchedCheckboxes = document.querySelectorAll('#matchedFiles input.match-file-checkbox:checked');
    console.log('选中的checkbox数量:', matchedCheckboxes.length);

    // 选择未匹配文件中已选中且有选择文档类型的checkbox
    const unmatchedCheckboxes = document.querySelectorAll('#unmatchedFiles input[type="checkbox"]:checked');
    const manualMatchedFiles = [];
    for (const cb of unmatchedCheckboxes) {
        const select = cb.closest('.unmatched-file-item')?.querySelector('.doc-type-select');
        const docType = select?.value;
        if (!docType) {
            showNotification('请为所有选中的文件选择文档类型', 'error');
            stopButtonProgress(false);
            return;
        }
        try {
            const [cycle, doc_name] = docType.split('|');
            // 检查data-file属性是否存在且不为空
            if (!cb.dataset.file) {
                console.error('文件数据为空');
                return;
            }
            const fileData = JSON.parse(cb.dataset.file);
            manualMatchedFiles.push({
                ...fileData,
                cycle: cycle,
                doc_name: doc_name,
                is_manual_match: true
            });
        } catch (e) {
            console.error('解析文件数据失败:', e, '数据:', cb.dataset.file);
        }
    }

    if (matchedCheckboxes.length === 0 && manualMatchedFiles.length === 0) {
        showNotification('请选择要导入的文件', 'error');
        stopButtonProgress(false);
        return;
    }

    const filesToImport = [];
    for (const cb of matchedCheckboxes) {
        try {
            // 检查data-file属性是否存在且不为空
            if (!cb.dataset.file) {
                console.error('文件数据为空');
                continue;
            }
            const fileData = JSON.parse(cb.dataset.file);
            filesToImport.push(fileData);
        } catch (e) {
            console.error('解析文件数据失败:', e, '数据:', cb.dataset.file);
        }
    }
    // 添加手动匹配的文件
    filesToImport.push(...manualMatchedFiles);

    console.log('要导入的文件:', filesToImport);

    if (filesToImport.length === 0) {
        showNotification('没有有效的文件数据', 'error');
        stopButtonProgress(false);
        return;
    }

    // 创建进度显示
    const progress = showOperationProgress('zip-import-' + Date.now(), '正在导入文件...');
    progress.update(10, '准备导入文件...');
    startButtonProgress();

    showLoading(true);

    try {
        // 获取项目名称
        const projectName = appState.projectConfig ? appState.projectConfig.name : '';
        const projectId = appState.currentProjectId;

        console.log('发送导入请求, 项目:', projectName, projectId);

        const response = await fetch('/api/documents/zip-import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: filesToImport,
                project_name: projectName,
                project_id: projectId
            })
        });

        console.log('响应状态:', response.status);

        progress.update(50, '正在保存文件...');

        const result = await response.json();
        console.log('导入结果:', result);

        if (result.status === 'success') {
            progress.update(100, '导入完成');
            progress.complete(`成功导入 ${result.imported_count} 个文件`);
            stopButtonProgress(true);
            showNotification(result.message, 'success');
            document.getElementById('zipMatchResult').style.display = 'none';
            document.getElementById('zipUploadForm').reset();
            closeModal(elements.zipUploadModal);

            // 刷新当前周期的文档列表
            if (appState.currentCycle) {
                renderCycleDocuments(appState.currentCycle);
            }
            
            // 刷新周期进度显示
            refreshCycleProgress();
            
            // 刷新日志
            refreshOperationLog();
        } else {
            progress.error(result.message);
            stopButtonProgress(false);
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入文件失败:', error);
        progress.error(error.message);
        stopButtonProgress(false);
        showNotification('导入文件失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 检查文档合规性（异常检测）
 */
async function handleCheckCompliance() {
    if (!appState.projectConfig) {
        showNotification('请先加载项目配置', 'error');
        return;
    }
    
    const progress = showOperationProgress('check-' + Date.now(), '正在检查异常...');
    progress.update(20, '正在分析文档状态...');
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/documents/compliance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ project_config: appState.projectConfig })
        });
        
        progress.update(60, '正在生成异常报告...');
        
        const result = await response.json();
        
        if (result.status === 'success') {
            progress.complete('异常检查完成');
            renderComplianceResult(result.data);
        } else {
            progress.error('检查失败: ' + result.message);
            showNotification('检查失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('检查合规性失败:', error);
        progress.error('检查失败: ' + error.message);
        showNotification('检查合规性失败', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 渲染合规性检查结果
 */
function renderComplianceResult(data) {
    let html = '<div class="compliance-report">';
    
    for (const [cycle, docs] of Object.entries(data)) {
        html += `<h3>${cycle}</h3>`;
        
        for (const docInfo of docs) {
            const hasException = docInfo.documents.some(d => !d.is_compliant);
            const exceptionCount = docInfo.documents.filter(d => !d.is_compliant).length;
            
            html += `
                <div class="document-category ${hasException ? 'exception' : ''}">
                    <h4>${docInfo.doc_name}</h4>
                    <div class="doc-requirement">
                        <strong>要求：</strong> ${docInfo.requirement || '无特殊要求'}
                    </div>
                    <div>已上传: ${docInfo.uploaded_count}个</div>
                    ${hasException ? `<div class="exception-count">异常: ${exceptionCount}个</div>` : ''}
            `;
            
            if (hasException) {
                html += '<ul class="exception-list">';
                for (const doc of docInfo.documents) {
                    if (!doc.is_compliant) {
                        html += `<li>${doc.filename}: ${doc.issues.join(', ')}</li>`;
                    }
                }
                html += '</ul>';
            }
            
            html += '</div>';
        }
    }
    
    html += '</div>';
    
    // 在内容区域显示结果
    elements.contentArea.innerHTML = `
        <h2>📋 文档合规性检查结果</h2>
        ${html}
        <button class="btn btn-primary" onclick="selectCycle(appState.currentCycle)" style="margin-top:20px;">返回文档列表</button>
    `;
}

// ========== 项目管理功能 ==========

/**
 * 创建新项目
 */
async function handleCreateProject(e) {
    e.preventDefault();
    
    const name = document.getElementById('newProjectName').value;
    const description = document.getElementById('newProjectDesc').value;
    
    if (!name) {
        showNotification('请输入项目名称', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/projects/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('项目创建成功', 'success');
            closeModal(elements.newProjectModal);
            document.getElementById('newProjectForm').reset();
            
            // 加载新创建的项目
            appState.projectConfig = result.project;
            appState.currentProjectId = result.project.id;
            
            // 刷新项目列表并选中
            loadProjectsList();
            
            // 更新下拉菜单选中状态
            if (elements.projectSelect) {
                elements.projectSelect.value = result.project.id;
            }
            
            // 更新URL参数
            const url = new URL(window.location);
            url.searchParams.set('project', result.project.id);
            window.history.replaceState({}, '', url);
            
            renderCycles();
            renderInitialContent();
            showProjectButtons();
            
            console.log('项目配置:', appState.projectConfig);
        } else {
            showNotification('创建失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('创建项目错误:', error);
        showNotification('创建项目出错', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 导入JSON
 */
async function handleImportJson(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('jsonFile');
    const jsonContent = document.getElementById('jsonContent').value.trim();
    const newName = document.getElementById('importProjectName').value;
    
    let jsonData = null;
    
    // 优先使用文件上传
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        try {
            jsonData = JSON.parse(await new Promise((resolve, reject) => {
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsText(file);
            }));
        } catch (err) {
            showNotification('无效的JSON文件', 'error');
            return;
        }
    } else if (jsonContent) {
        try {
            jsonData = JSON.parse(jsonContent);
        } catch (err) {
            showNotification('无效的JSON内容', 'error');
            return;
        }
    } else {
        showNotification('请选择JSON文件或输入JSON内容', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/projects/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...jsonData, name: newName || undefined })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('项目导入成功', 'success');
            closeModal(elements.importJsonModal);
            document.getElementById('importJsonForm').reset();
            
            // 加载导入的项目
            appState.projectConfig = result.project;
            appState.currentProjectId = result.project.id;
            
            // 刷新项目列表并更新下拉菜单选中状态
            loadProjectsList();
            if (elements.projectSelect) {
                elements.projectSelect.value = appState.currentProjectId;
            }
            
            // 更新URL参数
            const url = new URL(window.location);
            url.searchParams.set('project', result.project.id);
            window.history.replaceState({}, '', url);
            
            renderCycles();
            renderInitialContent();
            showProjectButtons();
            
            console.log('项目配置:', appState.projectConfig);
        } else {
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入JSON错误:', error);
        showNotification('导入JSON出错', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 保存项目状态
 */
async function handleSaveProject() {
    if (!appState.currentProjectId || !appState.projectConfig) {
        showNotification('请先创建或加载项目', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // 调用保存API
        const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(appState.projectConfig)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('项目状态已保存！', 'success');
        } else {
            showNotification('保存失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('保存项目错误:', error);
        showNotification('保存项目出错: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 导出JSON
 */
async function handleExportJson() {
    if (!appState.currentProjectId) {
        showNotification('请先创建或加载项目', 'error');
        return;
    }
    
    const progress = showOperationProgress('export-' + Date.now(), '正在导出需求清单...');
    progress.update(20, '正在准备数据...');
    
    showLoading(true);
    
    try {
        // 使用新的导出需求清单API
        const response = await fetch(`/api/project/export-requirements?project_id=${encodeURIComponent(appState.currentProjectId)}`);
        
        progress.update(60, '正在生成文件...');
        
        if (!response.ok) {
            throw new Error('导出失败');
        }
        
        // 直接从响应下载文件
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // 从响应头获取文件名或使用默认名称
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'requirements.json';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
            
        progress.complete('需求清单导出成功');
        showNotification('需求清单导出成功', 'success');
    } catch (error) {
        console.error('导出需求清单错误:', error);
        progress.error('导出需求清单出错');
        showNotification('导出需求清单出错', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 打包项目（导出配置+文档）
 */
async function handlePackageProject() {
    if (!appState.currentProjectId) {
        showNotification('请先创建或加载项目', 'error');
        return;
    }
    
    const progress = showOperationProgress('package-' + Date.now(), '正在打包项目...');
    progress.update(10, '正在准备项目文件...');
    
    showLoading(true);
    showNotification('正在打包项目，请稍候...', 'info');
    
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}/package`);
        
        progress.update(50, '正在压缩文件...');
        
        // 检查响应状态
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `服务器错误: ${response.status}`);
        }
        
        // 检查内容类型
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('zip')) {
            const text = await response.text().catch(() => '');
            throw new Error('服务器返回的不是ZIP文件: ' + (text.substring(0, 200) || contentType));
        }
        
        progress.update(80, '正在生成下载链接...');
        
        // 获取ZIP二进制数据
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // 触发下载
        const link = document.createElement('a');
        link.href = url;
        const projectName = appState.projectConfig?.name || 'project';
        link.download = `${projectName}_backup.zip`;
        link.click();
        URL.revokeObjectURL(url);
        
        progress.complete('项目打包成功');
        showNotification('项目打包成功', 'success');
    } catch (error) {
        console.error('打包项目错误:', error);
        progress.error('打包失败: ' + error.message);
        showNotification('打包项目失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 确认验收
 */
async function handleConfirmAcceptance() {
    if (!appState.currentProjectId) {
        showNotification('请先加载项目', 'error');
        return;
    }

    const cycles = appState.projectConfig?.cycles || [];
    if (cycles.length === 0) {
        showNotification('没有可验收的周期', 'warning');
        return;
    }

    // 使用模态框让用户选择验收范围
    showConfirmModal(
        '确认验收',
        `确定要验收"${appState.projectConfig.name}"吗？<br><br>将验收所有 ${cycles.length} 个周期的文档。`,
        async () => {
            try {
                showLoading(true);
                const response = await fetch(`/api/projects/${appState.currentProjectId}/confirm-acceptance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const result = await response.json();

                if (result.status === 'success') {
                    showNotification(result.message, 'success');
                    // 重新加载项目配置刷新状态
                    await selectProject(appState.currentProjectId);
                } else {
                    showNotification(result.message || '验收失败', 'error');
                }
            } catch (error) {
                console.error('验收失败:', error);
                showNotification('验收失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 打包下载项目所有文档
 */
async function handleDownloadPackage() {
    if (!appState.currentProjectId) {
        showNotification('请先加载项目', 'error');
        return;
    }

    try {
        showLoading(true);
        const response = await fetch(`/api/projects/${appState.currentProjectId}/download-package`);

        if (!response.ok) {
            const err = await response.json();
            showNotification(err.message || '打包失败', 'error');
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const projectName = appState.projectConfig?.name || 'project';
        link.download = `${projectName}_${new Date().toISOString().slice(0, 10)}.zip`;
        link.click();
        URL.revokeObjectURL(url);

        showNotification('打包下载成功！', 'success');
    } catch (error) {
        console.error('打包下载失败:', error);
        showNotification('打包下载失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 导入项目包
 */
async function handleImportPackage(e) {
    e.preventDefault();

    const fileInput = document.getElementById('packageFile');
    const nameInput = document.getElementById('importPackageName');
    const conflictOptions = document.getElementById('conflictOptions');
    const conflictAction = document.querySelector('input[name="conflictAction"]:checked')?.value || 'rename';

    if (!fileInput.files[0]) {
        showNotification('请选择ZIP文件', 'error');
        return;
    }

    const progress = showOperationProgress('import-' + Date.now(), '正在导入项目...');
    progress.update(10, '正在上传文件...');

    showLoading(true);

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    if (nameInput.value) {
        formData.append('name', nameInput.value);
    }
    formData.append('conflict_action', conflictAction);

    try {
        const response = await fetch('/api/projects/package/import', {
            method: 'POST',
            body: formData
        });

        progress.update(50, '正在解析项目文件...');

        const result = await response.json();

        if (result.status === 'success') {
            progress.update(80, '正在加载项目...');
            
            showNotification(result.message, 'success');
            closeModal(elements.importPackageModal);

            // 隐藏冲突选项
            if (conflictOptions) conflictOptions.style.display = 'none';

            // 加载新导入的项目
            appState.currentProjectId = result.project_id;
            await loadProject(result.project_id);
            await loadProjectsList();

            // 更新URL参数
            const url = new URL(window.location);
            url.searchParams.set('project', result.project_id);
            window.history.replaceState({}, '', url);
            
            progress.complete('项目导入成功');
        } else if (result.status === 'conflict') {
            // 显示冲突选项
            if (conflictOptions) {
                conflictOptions.style.display = 'block';
                const hint = document.getElementById('importPackageNameHint');
                if (hint) {
                    hint.textContent = `检测到同名项目: "${result.existing_name}"`;
                    hint.style.display = 'block';
                }
            }
            progress.error('检测到同名项目，请选择处理方式');
            showNotification(result.message, 'warning');
        } else {
            progress.error('导入失败: ' + result.message);
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入项目包错误:', error);
        progress.error('导入项目包失败');
        showNotification('导入项目包失败', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 重置导入包弹窗状态
 */
function resetImportPackageModal() {
    const fileInput = document.getElementById('packageFile');
    const nameInput = document.getElementById('importPackageName');
    const conflictOptions = document.getElementById('conflictOptions');
    const hint = document.getElementById('importPackageNameHint');

    if (fileInput) fileInput.value = '';
    if (nameInput) {
        nameInput.value = '';
        nameInput.disabled = false;
    }
    if (conflictOptions) conflictOptions.style.display = 'none';
    if (hint) hint.style.display = 'none';
}

/**
 * 显示项目相关按钮
 */
function showProjectButtons() {
    const menus = ['documentRequirementsMenu', 'documentManagementMenu', 'dataBackupMenu', 'acceptanceMenu'];
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'inline-block';
    });
}

/**
 * 隐藏项目相关按钮
 */
function hideProjectButtons() {
    const menus = ['documentRequirementsMenu', 'documentManagementMenu', 'dataBackupMenu', 'acceptanceMenu'];
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'none';
    });
}

/**
 * 填充项目管理下拉框
 */
function populateProjectManageSelects() {
    if (!appState.projectConfig) return;
    
    const cycles = appState.projectConfig.cycles || [];
    
    // 填充周期选择下拉框
    const docManageCycleSelect = document.getElementById('docManageCycleSelect');
    
    const options = cycles.map(c => `<option value="${c}">${c}</option>`).join('');
    docManageCycleSelect.innerHTML = '<option value="">-- 选择周期 --</option>' + options;
    
    // 渲染周期排序列表
    renderCyclesSortableList();
    
    // 周期选择变更时渲染文档列表
    docManageCycleSelect.addEventListener('change', function() {
        const selectedCycle = this.value;
        const docManageSection = document.getElementById('docManageSection');
        if (selectedCycle) {
            docManageSection.style.display = 'block';
            renderDocsSortableList(selectedCycle);
        } else {
            docManageSection.style.display = 'none';
        }
    });
}

/**
 * 渲染周期排序列表
 */
function renderCyclesSortableList() {
    const container = document.getElementById('cyclesSortableList');
    const cycles = appState.projectConfig.cycles || [];
    const docsInfo = appState.projectConfig.documents || {};
    
    container.innerHTML = cycles.map((cycle, index) => {
        const docCount = docsInfo[cycle]?.required_docs?.length || 0;
        return `
            <div class="sortable-item" draggable="true" data-cycle="${cycle}" data-index="${index}">
                <span class="drag-handle">☰</span>
                <div class="item-content">
                    <div class="item-name">${cycle}</div>
                    <div class="item-meta">包含 ${docCount} 个文档类型</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-primary btn-sm" onclick="openEditCycleModal('${cycle}')">编辑</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteCycle('${cycle}')">删除</button>
                </div>
            </div>
        `;
    }).join('');
    
    initSortable(container, 'cycles');
}

/**
 * 渲染文档排序列表
 */
function renderDocsSortableList(cycle) {
    const container = document.getElementById('docsSortableList');
    const docs = appState.projectConfig.documents[cycle]?.required_docs || [];
    
    container.innerHTML = docs.map((doc, index) => `
        <div class="sortable-item" draggable="true" data-doc-name="${doc.name}" data-index="${index}">
            <span class="drag-handle">☰</span>
            <div class="item-content">
                <div class="item-name">${doc.index || (index + 1)}. ${doc.name}</div>
                <div class="item-meta">要求: ${doc.requirement || '无'}</div>
            </div>
            <div class="item-actions">
                <button class="btn btn-primary btn-sm" onclick="openEditDocModal('${cycle}', '${doc.name}')">编辑</button>
                <button class="btn btn-danger btn-sm" onclick="deleteDoc('${cycle}', '${doc.name}')">删除</button>
            </div>
        </div>
    `).join('');
    
    initSortable(container, 'docs', cycle);
}

/**
 * 初始化拖拽排序
 */
function initSortable(container, type, cycle = null) {
    let draggedItem = null;
    
    container.querySelectorAll('.sortable-item').forEach(item => {
        item.addEventListener('dragstart', function(e) {
            draggedItem = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        item.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            draggedItem = null;
            
            // 保存排序结果
            if (type === 'cycles') {
                saveCyclesOrder();
            } else if (type === 'docs' && cycle) {
                saveDocsOrder(cycle);
            }
        });
        
        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        item.addEventListener('drop', function(e) {
            e.preventDefault();
            if (draggedItem && draggedItem !== this) {
                const allItems = [...container.querySelectorAll('.sortable-item')];
                const draggedIndex = allItems.indexOf(draggedItem);
                const dropIndex = allItems.indexOf(this);
                
                if (draggedIndex < dropIndex) {
                    this.after(draggedItem);
                } else {
                    this.before(draggedItem);
                }
            }
        });
    });
}

/**
 * 保存周期排序
 */
async function saveCyclesOrder() {
    const container = document.getElementById('cyclesSortableList');
    const items = container.querySelectorAll('.sortable-item');
    const newOrder = Array.from(items).map(item => item.dataset.cycle);
    
    appState.projectConfig.cycles = newOrder;
    
    // 重新排序documents中的顺序
    const newDocs = {};
    newOrder.forEach(cycle => {
        if (appState.projectConfig.documents[cycle]) {
            newDocs[cycle] = appState.projectConfig.documents[cycle];
        }
    });
    appState.projectConfig.documents = newDocs;
    
    await updateProjectConfig();
    renderCycles();
    showNotification('周期顺序已更新', 'success');
}

/**
 * 保存文档排序
 */
async function saveDocsOrder(cycle) {
    const container = document.getElementById('docsSortableList');
    const items = container.querySelectorAll('.sortable-item');
    const newOrder = Array.from(items).map(item => item.dataset.docName);
    
    const docs = appState.projectConfig.documents[cycle]?.required_docs || [];
    const reorderedDocs = newOrder.map(name => docs.find(d => d.name === name)).filter(d => d);
    
    // 更新序号
    reorderedDocs.forEach((doc, index) => {
        doc.index = index + 1;
    });
    
    appState.projectConfig.documents[cycle].required_docs = reorderedDocs;
    
    await updateProjectConfig();
    renderCycles();
    showNotification('文档顺序已更新', 'success');
}

/**
 * 更新项目配置
 */
async function updateProjectConfig() {
    try {
        await fetch(`/api/projects/${appState.currentProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.projectConfig)
        });
    } catch (error) {
        console.error('保存配置失败:', error);
    }
}

/**
 * 编辑周期弹窗
 */
function openEditCycleModal(cycleName) {
    showInputModal(
        '编辑周期名称',
        [{ label: '周期名称', key: 'name', value: cycleName, placeholder: '请输入周期名称' }],
        ({ name }) => {
            if (name && name !== cycleName) {
                handleRenameCycleDirect(cycleName, name);
            }
        }
    );
}

/**
 * 直接重命名周期
 */
async function handleRenameCycleDirect(oldName, newName) {
    const result = await updateProjectStructure('rename_cycle', { 
        old_name: oldName, 
        new_name: newName 
    });
    
    if (result.status === 'success') {
        showNotification('周期重命名成功', 'success');
        populateProjectManageSelects();
        renderCycles();
    } else {
        showNotification(result.message, 'error');
    }
}

/**
 * 删除周期
 */
async function deleteCycle(cycleName) {
    showConfirmModal('确认删除', `确定要删除周期"${cycleName}"吗？`, async () => {
        const result = await updateProjectStructure('delete_cycle', { cycle_name: cycleName });
        if (result.status === 'success') {
            showNotification('周期删除成功', 'success');
            populateProjectManageSelects();
            renderCycles();
        } else {
            showNotification(result.message, 'error');
        }
    });
}

/**
 * 编辑文档弹窗
 */
function openEditDocModal(cycle, docName) {
    const docs = appState.projectConfig.documents[cycle]?.required_docs || [];
    const doc = docs.find(d => d.name === docName);
    if (!doc) return;

    showInputModal(
        '编辑文档',
        [
            { label: '文档名称', key: 'name', value: docName, placeholder: '请输入文档名称' },
            { label: '文档要求（如：签名、盖章）', key: 'requirement', value: doc.requirement || '', placeholder: '可留空' }
        ],
        ({ name, requirement }) => {
            if (name !== docName || requirement !== doc.requirement) {
                handleEditDocDirect(cycle, docName, name, requirement);
            }
        }
    );
}

/**
 * 直接编辑文档
 */
async function handleEditDocDirect(cycle, oldName, newName, newRequirement) {
    // 更新文档名称
    const docs = appState.projectConfig.documents[cycle]?.required_docs || [];
    const doc = docs.find(d => d.name === oldName);
    if (doc) {
        doc.name = newName || oldName;
        doc.requirement = newRequirement || '';
    }
    
    await updateProjectConfig();
    populateProjectManageSelects();
    renderCycles();
    showNotification('文档更新成功', 'success');
}

/**
 * 删除文档
 */
async function deleteDoc(cycle, docName) {
    showConfirmModal('确认删除', `确定要删除文档类型"${docName}"吗？`, async () => {
        const result = await updateProjectStructure('delete_doc', { 
            cycle_name: cycle, 
            doc_name: docName 
        });
        
        if (result.status === 'success') {
            showNotification('文档删除成功', 'success');
            populateProjectManageSelects();
            renderCycles();
        } else {
            showNotification(result.message, 'error');
        }
    });
}

/**
 * 填充文档选择下拉框
 */
function populateDocSelect(cycle, selectId) {
    if (!appState.projectConfig || !cycle) return;
    
    const select = document.getElementById(selectId);
    const docs = appState.projectConfig.documents[cycle]?.required_docs || [];
    select.innerHTML = docs.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
}

/**
 * 添加周期
 */
async function handleAddCycle(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('newCycleName').value;
    
    if (!cycleName) {
        showNotification('请输入周期名称', 'error');
        return;
    }
    
    const result = await updateProjectStructure('add_cycle', { cycle_name: cycleName });
    
    if (result.status === 'success') {
        showNotification('周期添加成功', 'success');
        document.getElementById('newCycleName').value = '';
        populateProjectManageSelects();
        renderCycles();
    } else {
        showNotification(result.message, 'error');
    }
}

/**
 * 重命名周期
 */
async function handleRenameCycle(e) {
    e.preventDefault();
    
    const oldName = document.getElementById('renameCycleSelect').value;
    const newName = document.getElementById('renameCycleNewName').value;
    
    if (!newName) {
        showNotification('请输入新名称', 'error');
        return;
    }
    
    const result = await updateProjectStructure('rename_cycle', { 
        old_name: oldName, 
        new_name: newName 
    });
    
    if (result.status === 'success') {
        showNotification('周期重命名成功', 'success');
        document.getElementById('renameCycleNewName').value = '';
        populateProjectManageSelects();
        renderCycles();
    } else {
        showNotification(result.message, 'error');
    }
}

/**
 * 删除周期
 */
async function handleDeleteCycle(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('deleteCycleSelect').value;
    
    showConfirmModal('确认删除', `确定要删除周期"${cycleName}"吗？`, async () => {
        const result = await updateProjectStructure('delete_cycle', { cycle_name: cycleName });
        
        if (result.status === 'success') {
            showNotification('周期删除成功', 'success');
            populateProjectManageSelects();
            renderCycles();
        } else {
            showNotification(result.message, 'error');
        }
    });
}

/**
 * 添加文档
 */
async function handleAddDoc(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('docManageCycleSelect').value;
    const docName = document.getElementById('addDocName').value;
    const requirement = document.getElementById('addDocRequirement').value;
    
    if (!cycleName) {
        showNotification('请先选择周期', 'error');
        return;
    }
    
    if (!docName) {
        showNotification('请输入文档名称', 'error');
        return;
    }
    
    const result = await updateProjectStructure('add_doc', { 
        cycle_name: cycleName, 
        doc_name: docName,
        requirement: requirement
    });
    
    if (result.status === 'success') {
        showNotification('文档添加成功', 'success');
        document.getElementById('addDocName').value = '';
        document.getElementById('addDocRequirement').value = '';
        populateProjectManageSelects();
        // 保持当前选中周期
        document.getElementById('docManageCycleSelect').value = cycleName;
        document.getElementById('docManageSection').style.display = 'block';
        renderDocsSortableList(cycleName);
        renderCycleDocuments(cycleName);
    } else {
        showNotification(result.message, 'error');
    }
}

/**
 * 删除文档
 */
async function handleDeleteDoc(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('deleteDocCycleSelect').value;
    const docName = document.getElementById('deleteDocSelect').value;
    
    showConfirmModal('确认删除', `确定要删除文档"${docName}"吗？`, async () => {
        const result = await updateProjectStructure('delete_doc', { 
            cycle_name: cycleName, 
            doc_name: docName 
        });
        
        if (result.status === 'success') {
            showNotification('文档删除成功', 'success');
            populateProjectManageSelects();
            renderCycleDocuments(cycleName);
        } else {
            showNotification(result.message, 'error');
        }
    });
}

/**
 * 更新项目结构
 */
async function updateProjectStructure(action, data) {
    if (!appState.currentProjectId) {
        return { status: 'error', message: '请先创建项目' };
    }
    
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}/structure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...data })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // 更新本地配置
            appState.projectConfig = result.project;
        }

        return result;
    } catch (error) {
        console.error('更新项目结构错误:', error);
        return { status: 'error', message: '更新失败' };
    }
}

/**
 * 切换操作日志显示
 */
function toggleOperationLog() {
    const logPanel = document.getElementById('operationLog');
    if (logPanel.style.display === 'none') {
        logPanel.style.display = 'block';
        refreshOperationLog();
    } else {
        logPanel.style.display = 'none';
    }
}

/**
 * 刷新操作日志
 */
async function refreshOperationLog() {
    try {
        const response = await fetch('/api/logs?limit=50');
        const result = await response.json();

        if (result.status === 'success') {
            renderOperationLogs(result.logs);
        }
    } catch (error) {
        console.error('获取操作日志失败:', error);
    }
}

/**
 * 渲染操作日志
 */
function renderOperationLogs(logs) {
    const logContent = document.getElementById('logContent');

    if (!logs || logs.length === 0) {
        logContent.innerHTML = '<p class="placeholder">暂无操作日志</p>';
        return;
    }

    let html = '';
    // 最新的显示在前面
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i];
        const statusClass = log.status === 'success' ? 'success' : (log.status === 'error' ? 'error' : 'info');
        html += `
            <div class="log-entry">
                <span class="log-time">${log.timestamp}</span>
                <span class="log-status ${statusClass}">${log.status}</span>
                <span class="log-operation">${log.operation}</span>
                ${log.details ? `<span class="log-details"> - ${log.details}</span>` : ''}
            </div>
        `;
    }

    logContent.innerHTML = html;
}

/**
 * 显示操作进度
 */
function showOperationProgress(operationId, message) {
    const progressContainer = document.getElementById('operationProgress');

    const progressItem = document.createElement('div');
    progressItem.className = 'operation-progress-item';
    progressItem.id = `progress-${operationId}`;
    progressItem.innerHTML = `
        <div class="progress-info">
            <div class="progress-text">${message}</div>
            <div class="progress-bar-bg">
                <div class="progress-bar" style="width: 0%"></div>
            </div>
        </div>
        <span class="progress-percent">0%</span>
    `;

    progressContainer.appendChild(progressItem);

    return {
        update: (percent, message) => {
            const item = document.getElementById(`progress-${operationId}`);
            if (item) {
                item.querySelector('.progress-bar').style.width = percent + '%';
                item.querySelector('.progress-percent').textContent = percent + '%';
                if (message) {
                    item.querySelector('.progress-text').textContent = message;
                }
            }
        },
        complete: (message) => {
            const item = document.getElementById(`progress-${operationId}`);
            if (item) {
                item.querySelector('.progress-bar').style.width = '100%';
                item.querySelector('.progress-percent').textContent = '完成';
                if (message) {
                    item.querySelector('.progress-text').textContent = message;
                }
                // 3秒后移除
                setTimeout(() => {
                    item.remove();
                    // 如果没有其他进度项，显示占位符
                    const container = document.getElementById('operationProgress');
                    if (container.children.length === 0) {
                        container.innerHTML = '<p class="placeholder">暂无进行中的操作</p>';
                    }
                }, 3000);
            }
        },
        error: (message) => {
            const item = document.getElementById(`progress-${operationId}`);
            if (item) {
                item.querySelector('.progress-bar').style.background = 'linear-gradient(90deg, #dc3545 0%, #c82333 100%)';
                item.querySelector('.progress-text').textContent = '失败: ' + message;
                item.querySelector('.progress-percent').textContent = '错误';
            }
        }
    };
}

/**
 * 确认当前周期所有文档无误
 */
async function confirmAllDocuments() {
    if (!appState.currentCycle) {
        showNotification('请先选择一个周期', 'error');
        return;
    }

    const cycle = appState.currentCycle;
    const docName = appState.currentDocument;
    
    // 获取当前周期已上传的文档
    try {
        let url = `/api/documents/list?cycle=${encodeURIComponent(cycle)}`;
        if (docName) {
            url += `&doc_name=${encodeURIComponent(docName)}`;
        }
        const response = await fetch(url);
        const result = await response.json();
        
        const uploadedDocs = result.data || [];
        
        if (uploadedDocs.length === 0) {
            showNotification('当前周期没有任何已归档的文档', 'error');
            return;
        }

        showConfirmModal('确认文档无误', `确定要确认当前周期"${cycle}"的所有 ${uploadedDocs.length} 个文档已归档无误吗？`, async () => {
            try {
                // 标记周期为已确认
                const response = await fetch(`/api/projects/${appState.currentProjectId}/confirm-cycle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cycle_name: cycle })
                });

                const result = await response.json();

                if (result.status === 'success') {
                    showNotification(`已确认周期"${cycle}"的全部文档`, 'success');
                    // 刷新显示
                    if (appState.projectConfig.cycles) {
                        const cycleIndex = appState.projectConfig.cycles.indexOf(cycle);
                        if (cycleIndex !== -1 && !appState.projectConfig.cycle_confirmed) {
                            appState.projectConfig.cycle_confirmed = {};
                        }
                        if (appState.projectConfig.cycle_confirmed) {
                            appState.projectConfig.cycle_confirmed[cycle] = {
                                confirmed: true,
                                confirmed_time: new Date().toISOString()
                            };
                        }
                    }
                    renderCycles();
                } else {
                    showNotification(result.message || '确认失败', 'error');
                }
            } catch (error) {
                console.error('确认文档失败:', error);
                showNotification('确认文档时发生错误', 'error');
            }
        });
    } catch (error) {
        console.error('检查已归档文档失败:', error);
        showNotification('检查已归档文档失败', 'error');
    }
}

/**
 * 初始化日志框拖拽调整高度
 */
function initLogResize() {
    const resizeHandle = document.getElementById('logResizeHandle');
    const operationLog = document.getElementById('operationLog');
    const logContent = document.getElementById('logContent');

    if (!resizeHandle || !operationLog || !logContent) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    // 最小和最大高度
    const MIN_HEIGHT = 100;
    const MAX_HEIGHT = 600;
    const DEFAULT_HEIGHT = 200;

    // 初始化日志内容高度
    logContent.style.maxHeight = DEFAULT_HEIGHT + 'px';

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = logContent.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        let newHeight = startHeight + deltaY;

        // 限制范围
        newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight));

        logContent.style.maxHeight = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // 双击重置大小
    resizeHandle.addEventListener('dblclick', () => {
        logContent.style.maxHeight = DEFAULT_HEIGHT + 'px';
        showNotification('日志框已重置为默认大小', 'info');
    });
}


// ========== 系统设置功能 ==========

/**
 * 加载系统设置
 */
async function loadSystemSettings() {
    try {
        const response = await fetch('/api/settings');
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            const settings = result.data;
            
            // 填充表单
            const systemName = document.getElementById('systemName');
            const systemVersion = document.getElementById('systemVersion');
            const systemAuthor = document.getElementById('systemAuthor');
            const currentVersionDisplay = document.getElementById('currentVersionDisplay');
            const fastPreviewThreshold = document.getElementById('fastPreviewThreshold');
            const emailNotificationEnabled = document.getElementById('emailNotificationEnabled');
            
            if (systemName) systemName.value = settings.system_name || '';
            if (systemVersion) systemVersion.value = settings.version || '';
            if (systemAuthor) systemAuthor.value = settings.author || '';
            if (currentVersionDisplay) currentVersionDisplay.textContent = settings.current_version || '-';
            if (fastPreviewThreshold) fastPreviewThreshold.value = settings.fast_preview_threshold || 5;
            if (emailNotificationEnabled) emailNotificationEnabled.checked = !!settings.email_notification_enabled;
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
        const emailNotificationEnabled = document.getElementById('emailNotificationEnabled');
        
        const settings = {
            system_name: systemName ? systemName.value : '',
            author: systemAuthor ? systemAuthor.value : ''
        };
        
        if (fastPreviewThreshold) {
            const thresholdValue = parseInt(fastPreviewThreshold.value, 10);
            settings.fast_preview_threshold = isNaN(thresholdValue) || thresholdValue < 1 ? 5 : thresholdValue;
        }
        
        if (emailNotificationEnabled) {
            settings.email_notification_enabled = emailNotificationEnabled.checked;
        }
        
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
