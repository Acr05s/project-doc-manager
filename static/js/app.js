// 导入模块
import { initProjectManager, addProject, updateProjectSelect, selectProject, createProject, saveProjectState } from './project.js';

// 应用状态
const appState = {
    currentProjectId: '',
    projectConfig: null,
    projects: [],
    currentCycle: '',
    currentDocument: '',
    zipSelectedFile: null,
    zipSelectedFiles: [],
    currentZipPackagePath: '',
    currentZipPackageName: ''
};

// DOM 元素
const elements = {
    contentArea: document.getElementById('contentArea'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    notification: document.getElementById('notification'),
    modalTitle: document.getElementById('modalTitle'),
    uploadForm: document.getElementById('uploadForm'),
    fileInput: document.getElementById('fileInput'),
    documentModal: document.getElementById('documentModal'),
    reportModal: document.getElementById('reportModal'),
    reportContent: document.getElementById('reportContent'),
    editDocModal: document.getElementById('editDocModal'),
    replaceDocModal: document.getElementById('replaceDocModal')
};

/**
 * 初始化应用
 */
function initApp() {
    // 初始化项目管理
    initProjectManager(appState);
    
    // 加载项目配置
    loadProjectConfig();
    
    // 绑定事件
    bindEvents();
    
    // 更新项目选择下拉框
    updateProjectSelect(appState);
}

/**
 * 加载项目配置
 */
async function loadProjectConfig() {
    try {
        const response = await fetch('/api/project/config');
        const result = await response.json();
        
        if (result.status === 'success') {
            appState.projectConfig = result.data;
            renderProjectDashboard();
        }
    } catch (error) {
        console.error('加载项目配置失败:', error);
    }
}

/**
 * 渲染项目仪表盘
 */
function renderProjectDashboard() {
    if (!appState.projectConfig) return;
    
    const cycles = appState.projectConfig.cycles || [];
    const html = `
        <h1>📁 ${appState.projectConfig.project_name || '未命名项目'} - 文档管理</h1>
        
        <div class="cycles-container">
            ${cycles.map((cycle, index) => `
                <div class="cycle-card"
                     onclick="selectCycle('${cycle}')"
                     data-cycle="${cycle}">
                    <div class="cycle-number">${index + 1}</div>
                    <div class="cycle-info">
                        <h3>${cycle}</h3>
                        <p>点击查看文档</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    elements.contentArea.innerHTML = html;
}

/**
 * 选择周期
 */
async function selectCycle(cycle) {
    appState.currentCycle = cycle;
    await renderCycleDocuments(cycle);
}

/**
 * 绑定事件
 */
function bindEvents() {
    // 绑定文件选择事件
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', handleFileSelect);
    }
    
    // 绑定表单提交事件
    if (elements.uploadForm) {
        elements.uploadForm.addEventListener('submit', handleUploadDocument);
    }
    
    // 绑定拖放事件
    document.querySelectorAll('.upload-area').forEach(area => {
        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('drag-over');
        });
        
        area.addEventListener('dragleave', (e) => {
            e.preventDefault();
            area.classList.remove('drag-over');
        });
        
        area.addEventListener('drop', handleFileDrop);
    });
    
    // 绑定项目选择事件
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', (e) => {
            const projectId = e.target.value;
            if (projectId) {
                selectProject(appState, projectId, renderProjectDashboard);
            } else {
                appState.currentProjectId = '';
                appState.projectConfig = null;
                elements.contentArea.innerHTML = `
                    <div class="welcome-message">
                        <h2>欢迎使用项目文档管理中心</h2>
                        <p>请在顶部选择项目，加载配置文件</p>
                        <p>然后在顶部周期导航中选择周期，管理文档</p>
                    </div>
                `;
                saveProjectState(appState);
            }
        });
    }
    
    // 绑定新建项目按钮事件
    const newProjectBtn = document.getElementById('newProjectBtn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', () => {
            const newProjectModal = document.getElementById('newProjectModal');
            if (newProjectModal) {
                newProjectModal.classList.add('show');
            }
        });
    }
    
    // 绑定新建项目表单提交事件
    const newProjectForm = document.getElementById('newProjectForm');
    if (newProjectForm) {
        newProjectForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const projectName = document.getElementById('newProjectName').value.trim();
            const projectDesc = document.getElementById('newProjectDesc').value.trim();
            
            if (projectName) {
                const project = createProject(appState, projectName, projectDesc);
                addProject(appState, project);
                
                // 关闭模态框
                const newProjectModal = document.getElementById('newProjectModal');
                if (newProjectModal) {
                    newProjectModal.classList.remove('show');
                }
                
                // 重置表单
                newProjectForm.reset();
                
                showNotification('项目创建成功！', 'success');
            }
        });
    }
}

/**
 * 刷新周期进度显示
 */
async function refreshCycleProgress() {
    if (!appState.currentCycle) return;
    
    try {
        // 重新渲染当前周期的文档列表
        await renderCycleDocuments(appState.currentCycle);
    } catch (error) {
        console.error('刷新周期进度失败:', error);
    }
}

/**
 * 渲染周期文档列表
 */
async function renderCycleDocuments(cycle) {
    if (!appState.projectConfig) return;
    
    appState.currentCycle = cycle;
    
    try {
        // 获取当前周期的文档要求
        const docsInfo = appState.projectConfig.documents[cycle];
        if (!docsInfo) {
            elements.contentArea.innerHTML = `<h2>📋 ${cycle} - 文档管理</h2><p>该周期暂无文档要求</p>`;
            return;
        }
        
        const requiredDocs = docsInfo.required_docs || [];
        const totalRequired = requiredDocs.length;
        
        // 获取已上传的文档
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(cycle)}`);
        const result = await response.json();
        
        const docs = result.data || [];
        
        // 按文档类型分组
        const docsByName = {};
        docs.forEach(doc => {
            const docName = doc.doc_name;
            if (!docsByName[docName]) {
                docsByName[docName] = [];
            }
            docsByName[docName].push(doc);
        });
        
        // 计算进度
        let completedCount = 0;
        const cycleConfirmed = appState.projectConfig.cycle_confirmed?.[cycle]; 
        
        if (cycleConfirmed?.confirmed) {
            completedCount = totalRequired;
        } else {
            for (const doc of requiredDocs) {
                const docsList = docsByName[doc.name] || [];
                const docProgress = getDocProgress(doc.name, docsList, doc.requirement);
                if (docProgress.isComplete) {
                    completedCount++;
                }
            }
        }
        
        const progressPercent = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 0;
        let progressColor = '#dc3545';
        if (progressPercent >= 100) progressColor = '#28a745';
        else if (progressPercent >= 50) progressColor = '#ffc107';
        
        // 计算已上传的文档数
        let uploadedCount = 0;
        for (const doc of requiredDocs) {
            const docsList = docsByName[doc.name] || [];
            if (docsList.length > 0) {
                uploadedCount++;
            }
        }
        
        // 显示文档清单区域
        const html = `
            <h2>📋 ${cycle} - 文档管理</h2>
            
            <!-- 整体进度 -->
            <div class="cycle-progress-container">
                <div class="cycle-progress-label">
                    <span>文档完整度</span>
                    <span class="cycle-progress-percent">${progressPercent}%</span>
                </div>
                <div class="cycle-progress-bar">
                    <div class="cycle-progress-fill" style="width: ${progressPercent}%; background: ${progressColor};"></div>
                </div>
                <div class="cycle-progress-stats">
                    <span>✅ 已完成 ${completedCount}/${totalRequired}</span>
                    <span>📄 已上传 ${uploadedCount}/${totalRequired}</span>
                </div>
            </div>
            
            <!-- 文档列表 -->
            <div class="documents-list">
                <div id="documentListArea">
                    <h3 id="cycleTitle">📋 ${cycle} - 文档管理</h3>
                    <div class="progress-section">
                        <div class="progress-info">
                            <span>进度: <strong id="progressPercentage">${progressPercent}%</strong></span>
                            <span id="completedDocs">✅ 已完成 ${completedCount}/${totalRequired}</span>
                            <span id="uploadedDocs">📄 已上传 ${uploadedCount}/${totalRequired}</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" id="progressBar" style="width: ${progressPercent}%; background: ${progressColor};"></div>
                        </div>
                    </div>
                    <div id="documentsList">
                        ${requiredDocs.map(doc => {
                            const docsList = docsByName[doc.name] || [];
                            const docProgress = getDocProgress(doc.name, docsList, doc.requirement);
                            const isComplete = docProgress.percent >= 100;
                            
                            // 无要求时显示特殊样式
                            const noReq = docProgress.noRequirement;
                            
                            // 生成文件信息显示
                            const fileInfoHtml = docsList.length > 0 ? docsList.map(d => {
                                const infoParts = [];
                                if (d.doc_date) infoParts.push(`📅 ${formatDateToMonth(d.doc_date)}`);
                                if (d.signer) infoParts.push(`✍️ ${d.signer}`);
                                if (d.sign_date) infoParts.push(`📆 ${formatDateToMonth(d.sign_date)}`);
                                if (d.no_signature) infoParts.push('📝 不涉及签名');
                                if (d.party_a_seal) infoParts.push('🏢 甲方章');
                                if (d.party_b_seal) infoParts.push('🏭 乙方章');
                                if (d.has_seal_marked || d.has_seal) infoParts.push('🔖 已盖章');
                                if (d.no_seal) infoParts.push('📝 不涉及盖章');
                                if (d.other_seal) infoParts.push(`📍${d.other_seal}`);
                                return `<div class="doc-file-info">
                                    <span class="doc-file-name" onclick="previewDocument('${d.id}')" title="点击预览文件: ${d.original_filename || d.filename}" style="cursor: pointer; text-decoration: underline;">${d.original_filename || d.filename}</span>
                                    ${infoParts.length > 0 ? `<span class="doc-file-tags">${infoParts.join(' ')}</span>` : ''}
                                    ${doc.requirement ? `<div class="doc-requirements" style="font-size: 12px; color: #666; margin-top: 4px;">📋 ${doc.requirement}</div>` : ''}
                                </div>`;
                            }).join('') : '';
                            
                            // 状态显示
                            let statusHtml = '';
                            if (docsList.length === 0) {
                                if (noReq) {
                                    statusHtml = '<span class="badge badge-success">✅ 无要求</span>';
                                } else {
                                    statusHtml = '<span class="badge badge-danger">未上传</span>';
                                }
                            } else if (isComplete) {
                                statusHtml = '<span class="badge badge-success">✅ 已完成</span>';
                            } else {
                                statusHtml = '<span class="badge badge-warning">进行中</span>';
                            }

                            // 左侧颜色：无要求直接绿色（跳过），有文档完成绿色，进行中有文档黄色，无文档未完成红色
                            const leftColor = isComplete ? '#28a745' : (docsList.length > 0 ? '#ffc107' : (noReq ? '#28a745' : '#dc3545'));
                            
                            return `
                            <div class="document-row">
                                <!-- 文档类型名称 - 变绿色表示完成 -->
                                <div class="doc-type-progress" 
                                     style="background: ${leftColor};">
                                    <div class="doc-type-progress-fill" style="width: ${docProgress.percent}%;"></div>
                                    <span class="doc-type-index">${doc.index || ''}</span>
                                    <span class="doc-type-name" 
                                          onclick="openDocumentModal('${cycle}', '${doc.name}')"
                                          title="${doc.requirement || '无特定要求'}\n点击上传/管理文档">
                                        ${doc.name}
                                    </span>
                                    ${isComplete ? '<span class="complete-icon">✅</span>' : ''}
                                </div>
                                
                                <!-- 已匹配文件名和详情 -->
                                <div class="doc-file-area">
                                    ${docsList.length > 0 ?
                                        `<div class="doc-file-list-full">${fileInfoHtml}</div>` :
                                        `<span class="doc-file-placeholder" style="color: ${noReq ? '#28a745' : '#999'}">${noReq ? '✅ 无要求' : '点击左侧上传文档'}</span>`
                                    }
                                </div>
                                
                                <!-- 状态标签 -->
                                <div class="doc-status-area">
                                    <div class="doc-status-badges">
                                        ${statusHtml}
                                        ${docProgress.showSigner ? (docProgress.hasSigner ? '<span class="badge badge-success">✅ 已签名</span>' : '<span class="badge badge-secondary">待签名</span>') : ''}
                                        ${docProgress.showSeal ? (docProgress.hasSeal ? '<span class="badge badge-success">✅ 已盖章</span>' : '<span class="badge badge-secondary">待盖章</span>') : ''}
                                        ${noReq && docsList.length > 0 ? '<span class="badge badge-secondary">无要求</span>' : ''}
                                    </div>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        
        elements.contentArea.innerHTML = html;
        
        // 显示确认文档无误按钮
        const documentsList = document.getElementById('documentsList');
        const confirmSection = document.createElement('div');
        confirmSection.className = 'confirm-docs-section';
        confirmSection.innerHTML = `
            <button class="btn btn-success" onclick="confirmAllDocuments('${cycle}')">
                ✅ 确认当前周期文档无误
            </button>
            <p class="confirm-hint">点击确认当前周期所有文档已完成归档</p>
        `;
        documentsList.appendChild(confirmSection);
        
        // 添加点击打开选择文件对话框的功能
        document.querySelectorAll('.doc-type-name').forEach(element => {
            element.style.cursor = 'pointer';
        });
        
    } catch (error) {
        console.error('渲染周期文档失败:', error);
        elements.contentArea.innerHTML = `<h2>📋 ${cycle} - 文档管理</h2><p>加载文档失败: ${error.message}</p>`;
    }
}

/**
 * 获取文档进度信息
 */
function getDocProgress(docName, docsList, requirement) {
    if (!docsList || docsList.length === 0) {
        return {
            percent: 0,
            isComplete: false,
            noRequirement: !requirement || requirement.trim() === '',
            showSigner: false,
            hasSigner: false,
            showSeal: false,
            hasSeal: false
        };
    }
    
    // 检查是否有要求
    const noRequirement = !requirement || requirement.trim() === '';
    if (noRequirement) {
        return {
            percent: 100,
            isComplete: true,
            noRequirement: true,
            showSigner: false,
            hasSigner: false,
            showSeal: false,
            hasSeal: false
        };
    }
    
    // 检查签名要求
    const requireSigner = requirement.includes('签名') || requirement.includes('签字');
    const requireSeal = requirement.includes('盖章') || requirement.includes('章');
    
    // 检查是否满足要求
    let hasSigner = false;
    let hasSeal = false;
    
    for (const doc of docsList) {
        if (requireSigner) {
            if (doc.signer || doc.no_signature) {
                hasSigner = true;
            }
        }
        
        if (requireSeal) {
            if (doc.has_seal || doc.has_seal_marked || doc.party_a_seal || doc.party_b_seal || doc.no_seal) {
                hasSeal = true;
            }
        }
    }
    
    // 计算完成度
    let completedRequirements = 0;
    let totalRequirements = 0;
    
    if (requireSigner) {
        totalRequirements++;
        if (hasSigner) completedRequirements++;
    }
    
    if (requireSeal) {
        totalRequirements++;
        if (hasSeal) completedRequirements++;
    }
    
    // 至少有一个文档就认为基本完成
    if (totalRequirements === 0) {
        return {
            percent: 100,
            isComplete: true,
            noRequirement: false,
            showSigner: false,
            hasSigner: false,
            showSeal: false,
            hasSeal: false
        };
    }
    
    const percent = Math.round((completedRequirements / totalRequirements) * 100);
    
    return {
        percent: percent,
        isComplete: percent >= 100,
        noRequirement: false,
        showSigner: requireSigner,
        hasSigner: hasSigner,
        showSeal: requireSeal,
        hasSeal: hasSeal
    };
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
    
    // 根据要求显示/隐藏签名和盖章字段
    const signerFields = document.querySelectorAll('#uploadForm .form-group:has(#signer), #uploadForm .form-group:has(#signDate)');
    signerFields.forEach(el => el.style.display = requireSigner ? 'block' : 'none');
    
    const sealGroup = document.querySelector('#uploadForm .form-group:has(#hasSeal)');
    if (sealGroup) {
        sealGroup.style.display = requireSeal ? 'block' : 'none';
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
 * 加载ZIP包列表，若只有一个包则直接展示文件，若多个则显示选择器
 */
async function loadZipPackages() {
    const fileList = document.getElementById('zipFileList');
    const packageSelector = document.getElementById('zipPackageSelector');
    if (fileList) fileList.innerHTML = '<p class="placeholder">加载中..</p>';
    
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
                const select = document.getElementById('zipPackageSelect');
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
    if (fileList) fileList.innerHTML = '<p class="placeholder">加载中..</p>';
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
 * 搜索 ZIP 包中的文件
 */
async function searchZipFiles(keyword, packagePath) {
    const fileList = document.getElementById('zipFileList');
    if (!fileList) return;
    
    // 使用传入的 packagePath，或者当前选中的包路径
    const pkg = packagePath !== undefined ? packagePath : (appState.currentZipPackagePath || '');
    
    fileList.innerHTML = '<p class="placeholder">搜索中..</p>';
    
    try {
        let url = `/api/documents/search-zip-files?keyword=${encodeURIComponent(keyword || '')}`;
        if (pkg) url += `&package_path=${encodeURIComponent(pkg)}`;
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.status !== 'success') {
            fileList.innerHTML = `<p class="zip-no-result">搜索失败: ${result.message}</p>`;
            return;
        }
        
        const files = result.files || [];
        if (files.length === 0) {
            fileList.innerHTML = `<p class="zip-no-result">${keyword ? '未找到匹配文件' : '该ZIP包中暂无文件'}</p>`;
            return;
        }
        
        const kw = keyword || '';
        fileList.innerHTML = files.map(f => {
            let icon = '📄';
            if (f.ext === '.pdf') icon = '📕';
            else if (['.doc', '.docx'].includes(f.ext)) icon = '📝';
            else if (['.xls', '.xlsx'].includes(f.ext)) icon = '📊';
            else if (['.jpg', '.jpeg', '.png', '.gif'].includes(f.ext)) icon = '🖼️';
            else if (['.ppt', '.pptx'].includes(f.ext)) icon = '📊';
            
            const sizeStr = f.size > 1024 * 1024
                ? (f.size / 1024 / 1024).toFixed(1) + ' MB'
                : (f.size / 1024).toFixed(1) + ' KB';
            
            // 高亮关键字
            let displayName = escapeHtml(f.name);
            if (kw) {
                const re = new RegExp(escapeRegExp(kw), 'gi');
                displayName = displayName.replace(re, m => `<mark>${m}</mark>`);
            }
            
            // 显示相对于ZIP包内的路径（去掉包名前缀）
            let relInPkg = f.rel_path;
            const pkgName = appState.currentZipPackageName || '';
            if (pkgName && relInPkg.startsWith(pkgName)) {
                relInPkg = relInPkg.slice(pkgName.length).replace(/^[\/]/, '');
            }
            // 只显示目录部分（不含文件名）
            const parts = relInPkg.replace(/\/g, '/').split('/');
            const dirPart = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '';
            
            // 检查是否已选中
            const isSelected = appState.zipSelectedFiles && appState.zipSelectedFiles.some(sf => sf.path === f.path);
            const checkedAttr = isSelected ? 'checked' : '';
            
            // 已归档的文件特殊样式
            const isArchived = f.archived === true;
            const archivedClass = isArchived ? 'archived' : '';
            const archivedBadge = isArchived ? '<span class="zip-file-badge archived-badge">已归档</span>' : '';
            
            // 已归档的文件禁用选择
            const disabledAttr = isArchived ? 'disabled' : '';
            const archivedStyle = isArchived ? 'opacity: 0.5; background: #f5f5f5;' : '';
            
            return `<div class="zip-file-item ${isSelected ? 'selected' : ''} ${archivedClass}" data-path="${escapeHtml(f.path)}" data-name="${escapeHtml(f.name)}" style="${archivedStyle}">
                        <input type="checkbox" class="zip-file-checkbox" ${checkedAttr} ${disabledAttr}
                            onclick="event.stopPropagation(); toggleZipFileSelect(this, ${JSON.stringify(f.path)}, ${JSON.stringify(f.name)})">
                        <span class="zip-file-icon">${icon}</span>
                        <div class="zip-file-info" title="${escapeHtml(f.rel_path || f.name)}" onclick="${isArchived ? '' : 'toggleZipFileCheck(this)'}">
                            <div class="zip-file-name">${displayName}${archivedBadge}</div>
                            ${dirPart ? `<div class="zip-file-dir">${escapeHtml(dirPart)}</div>` : ''}
                        </div>
                        <span class="zip-file-size">${sizeStr}</span>
                    </div>`;
        }).join('');
        
        // 渲染完成后更新按钮状态
        updateZipSelectedUI();
        
    } catch (e) {
        fileList.innerHTML = `<p class="zip-no-result">请求失败: ${e.message}</p>`;
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
                    selectedName.textContent = `✅ 已选择: ${files[0].name}`;
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
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(cycle)}&doc_name=${encodeURIComponent(docName)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const docs = result.data || [];
            const docCountEl = document.getElementById('docCount');
            if (docCountEl) docCountEl.textContent = docs.length;
            
            // 获取模态框内的文档列表元素
            const modalDocumentsList = document.querySelector('#documentModal #documentsList');
            if (!modalDocumentsList) {
                console.error('找不到模态框内的文档列表元素');
                return;
            }
            
            if (docs.length === 0) {
                modalDocumentsList.innerHTML = '<p class="placeholder">暂无已上传的文档</p>';
            } else {
                // 按分类分组文件
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
                        <button class="btn btn-success btn-sm" onclick="batchUpdateDocuments('sign')" disabled id="batchSignBtn" style="margin-left: 5px;">批量标记已签名</button>
                        <button class="btn btn-danger btn-sm" onclick="batchDeleteDocuments()" disabled id="batchDeleteBtn" style="margin-left: auto;">批量删除</button>
                    </div>
                `;
                
                // 渲染每个分类的文件
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
                                            上传时间 ${new Date(doc.upload_time).toLocaleString('zh-CN')}
                                            <span style="margin-left:10px;">大小: ${formatFileSize(doc.file_size)}</span>
                                        </div>
                                        <div class="document-badges">
                                            ${doc.no_signature ? `<span class="badge badge-secondary">📝 不涉及签名</span>` : ''}
                                            ${doc.signer ? `<span class="badge badge-success">✍️ 签署人: ${doc.signer}</span>` : ''}
                                            ${doc.doc_date ? `<span class="badge badge-info">📅 文档日期: ${formatDateToMonth(doc.doc_date)}</span>` : ''}
                                            ${doc.sign_date && !doc.no_signature ? `<span class="badge badge-info">✍️ 签字日期: ${formatDateToMonth(doc.sign_date)}</span>` : ''}
                                            ${doc.no_seal ? `<span class="badge badge-secondary">📝 不涉及盖章</span>` : ''}
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
                
                modalDocumentsList.innerHTML = html;
            }
        }
    } catch (error) {
        console.error('加载文档列表错误:', error);
        const modalDocumentsList = document.querySelector('#documentModal #documentsList');
        if (modalDocumentsList) {
            modalDocumentsList.innerHTML = '<p class="placeholder">加载文档列表失败</p>';
        }
    }
}

/**
 * 预览文档
 */
function previewDocument(docId) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const content = document.getElementById('previewContent');
    const downloadBtn = document.getElementById('previewDownloadBtn');
    
    title.textContent = '正在加载预览...';
    downloadBtn.href = `/api/documents/download/${encodeURIComponent(docId)}`;
    content.innerHTML = '<div class="preview-loading"><div class="spinner"></div><p>正在加载预览...</p></div>';
    modal.classList.add('show');
    
    fetch(`/api/documents/preview/${encodeURIComponent(docId)}`)
        .then(response => response.json())
        .then(result => {
            if (result.status === 'success') {
                title.textContent = `预览: ${result.data.filename || '文档'}`;
                renderPreviewContent(result.data, content);
            } else {
                content.innerHTML = `<div class="preview-error">
                    <p>预览加载失败</p>
                    <p style="font-size:12px;color:#666;">${result.message}</p>
                    <p style="margin-top:15px;">请使用下载按钮查看文件</p>
                </div>`;
            }
        })
        .catch(error => {
            console.error('预览加载失败:', error);
            content.innerHTML = `<div class="preview-error">
                <p>预览加载失败</p>
                <p style="font-size:12px;color:#666;">${error.message}</p>
                <p style="margin-top:15px;">请使用下载按钮查看文件</p>
            </div>`;
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
                        <img src="${img}" alt="第 ${index + 1}页" style="max-width:100%;">
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
    formData.append('doc_date', document.getElementById('docDate')?.value || '');
    formData.append('sign_date', document.getElementById('signDate')?.value || '');
    formData.append('signer', document.getElementById('signer')?.value || '');
    formData.append('no_signature', document.getElementById('noSignature')?.checked || false);
    formData.append('has_seal', document.getElementById('hasSeal')?.checked || false);
    formData.append('party_a_seal', document.getElementById('partyASeal')?.checked || false);
    formData.append('party_b_seal', document.getElementById('partyBSeal')?.checked || false);
    formData.append('no_seal', document.getElementById('noSeal')?.checked || false);
    formData.append('other_seal', document.getElementById('otherSeal')?.value || '');
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
            document.getElementById('docDate').value = today;
            document.getElementById('signDate').value = today;
            
            // 刷新已上传文档列表
            loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
            
            // 重置文件预览
            updateFilePreview();
            
            // 刷新周期进度显示
            refreshCycleProgress();
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
        
        // 2. 上传各个分片
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            
            const formData = new FormData();
            formData.append('file', chunk);
            formData.append('upload_id', uploadId);
            formData.append('chunk_index', i);
            
            const chunkResponse = await fetch('/api/upload/chunk', {
                method: 'POST',
                body: formData
            });
            
            const chunkResult = await chunkResponse.json();
            if (chunkResult.status !== 'success') {
                throw new Error(chunkResult.message);
            }
            
            // 更新进度
            const progress = ((i + 1) / totalChunks) * 100;
            if (progressBar) progressBar.style.width = `${progress}%`;
            if (progressText) progressText.textContent = `上传中: ${Math.round(progress)}%`;
        }
        
        // 3. 完成上传
        const completeResponse = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                upload_id: uploadId,
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
                project_id: appState.currentProjectId || ''
            })
        });
        
        const completeResult = await completeResponse.json();
        if (completeResult.status !== 'success') {
            throw new Error(completeResult.message);
        }
        
        // 上传成功
        if (progressText) progressText.textContent = '上传完成！';
        showNotification('文档上传成功！', 'success');
        
        // 清理进度显示
        setTimeout(() => {
            if (progressContainer && progressContainer.parentNode) {
                progressContainer.parentNode.removeChild(progressContainer);
            }
        }, 2000);
        
        // 重置表单
        elements.uploadForm.reset();
        
        // 设置今天的日期为默认值
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('docDate').value = today;
        document.getElementById('signDate').value = today;
        
        // 刷新已上传文档列表
        loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
        
        // 重置文件预览
        updateFilePreview();
        
        // 刷新周期进度显示
        refreshCycleProgress();
        
    } catch (error) {
        console.error('分片上传失败:', error);
        if (progressText) progressText.textContent = '上传失败';
        showNotification('上传失败: ' + error.message, 'error');
        
        // 清理进度显示
        setTimeout(() => {
            if (progressContainer && progressContainer.parentNode) {
                progressContainer.parentNode.removeChild(progressContainer);
            }
        }, 2000);
    }
}

/**
 * 创建进度显示容器
 */
function createProgressContainer(fileName) {
    const container = document.createElement('div');
    container.className = 'upload-progress';
    container.innerHTML = `
        <div class="progress-header">
            <span>${fileName}</span>
            <span class="progress-text">准备上传...</span>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: 0%;"></div>
        </div>
    `;
    return container;
}

/**
 * 加载分类
 */
async function loadCategories(cycle, docName) {
    try {
        const response = await fetch(`/api/documents/categories?cycle=${encodeURIComponent(cycle)}&doc_name=${encodeURIComponent(docName)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const categories = result.categories || [];
            const categoryContainer = document.getElementById('documentCategories');
            
            if (categoryContainer) {
                if (categories.length === 0) {
                    categoryContainer.innerHTML = '<p class="placeholder">暂无分类</p>';
                } else {
                    categoryContainer.innerHTML = categories.map(category => `
                        <div class="category-item">
                            <input type="radio" name="documentCategory" value="${escapeHtml(category)}" id="category-${escapeHtml(category)}">
                            <label for="category-${escapeHtml(category)}">${escapeHtml(category)}</label>
                            <button class="btn btn-danger btn-sm" onclick="deleteCategory('${escapeHtml(cycle)}', '${escapeHtml(docName)}', '${escapeHtml(category)}')">删除</button>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (error) {
        console.error('加载分类失败:', error);
    }
}

/**
 * 添加分类
 */
async function addCategory(cycle, docName) {
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
                category: categoryName
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
    showConfirmModal('确认删除', `确定要删除分类"${category}" 吗？`, async () => {
        try {
            const response = await fetch('/api/documents/category', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cycle: cycle,
                    doc_name: docName,
                    category: category
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
        
        const result = await response.json();
        
        if (result.status === 'success') {
            renderReport(result.data);
            openModal(elements.reportModal);
        } else {
            showNotification('生成报告失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('生成报告错误:', error);
        showNotification('生成报告出错: ' + error.message, 'error');
    } finally {
        showLoading