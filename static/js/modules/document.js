/**
 * 文档模块 - 处理文档相关功能
 */

import { appState, elements } from './app-state.js';
import { authState } from './auth.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, showInputModal, openModal, closeModal, showDirectorySelectModal, initResizableColumns } from './ui.js';
import { uploadDocument, editDocument, deleteDocument, getCycleDocuments, loadImportedDocuments, searchImportedDocuments, loadProject, archiveProjectDocuments, submitArchiveRequest, getArchiveRequests, approveArchiveRequest, rejectArchiveRequest, getArchiveApprovers, getApprovalHistory } from './api.js';
import { handleZipArchive, fixZipSelectionIssue } from './zip.js';
import { buildDisplayRequirementText, buildUploadAttributeSchema, getCustomAttributeDefinitions, getPredefinedAttributeLabelMap } from './attribute-definitions.js';

let isUploadingDocument = false;

/**
 * 重新从服务器加载项目配置后刷新文档视图
 */
async function reloadProjectAndRender(cycle) {
    try {
        const updated = await loadProject(appState.currentProjectId);
        if (updated) appState.projectConfig = updated;
    } catch (e) {
        console.error('重新加载项目配置失败:', e);
    }
    await renderCycleDocuments(cycle);
}

// 辅助函数：转义HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 处理文档上传
 */
export async function handleUploadDocument(e) {
    e.preventDefault();

    if (isUploadingDocument) {
        showNotification('正在上传中，请勿重复提交', 'warning');
        return;
    }
    
    const files = elements.fileInput.files;
    if (files.length === 0) {
        showNotification('请选择文件', 'error');
        return;
    }
    
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    const docDateEl = document.getElementById('docDate');
    const signDateEl = document.getElementById('signDate');
    const signerEl = document.getElementById('signer');
    const hasSealEl = document.getElementById('hasSeal');
    const partyASealEl = document.getElementById('partyASeal');
    const partyBSealEl = document.getElementById('partyBSeal');
    const otherSealEl = document.getElementById('otherSeal');

    const docDate = docDateEl ? docDateEl.value : '';
    const signDate = signDateEl ? signDateEl.value : '';
    const signer = signerEl ? signerEl.value : '';
    const hasSeal = hasSealEl ? hasSealEl.checked : false;
    const partyASeal = partyASealEl ? partyASealEl.checked : false;
    const partyBSeal = partyBSealEl ? partyBSealEl.checked : false;
    const otherSeal = otherSealEl ? otherSealEl.value : '';
    
    showLoading(true);
    isUploadingDocument = true;
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';
    }
    
    try {
        let successCount = 0;
        let errorCount = 0;
        
        // 逐个上传文件
        for (const file of files) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('project_id', appState.currentProjectId);
                formData.append('project_name', appState.projectConfig ? appState.projectConfig.name : '');
                formData.append('cycle', appState.currentCycle);
                formData.append('doc_date', docDate);
                formData.append('sign_date', signDate);
                formData.append('signer', signer);
                formData.append('has_seal', hasSeal);
                formData.append('party_a_seal', partyASeal);
                formData.append('party_b_seal', partyBSeal);
                formData.append('other_seal', otherSeal);
                formData.append('doc_name', appState.currentDocument);
                
                // 收集动态生成的自定义属性字段
                const dynamicDocInfo = document.getElementById('dynamicDocInfo');
                if (dynamicDocInfo) {
                    const predefinedIds = ['docDate', 'signDate', 'signer', 'hasSeal', 'partyASeal', 'partyBSeal', 'otherSeal'];
                    dynamicDocInfo.querySelectorAll('input').forEach(input => {
                        if (!predefinedIds.includes(input.id) && input.name) {
                            const value = input.type === 'checkbox' ? input.checked : input.value;
                            if (value !== '' && value !== false) {
                                formData.append(input.name, value);
                            }
                        }
                    });
                }
                
                const result = await uploadDocument(formData);
                
                if (result.status === 'success') {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`上传文件失败 ${file.name}:`, result.message);
                }
            } catch (error) {
                errorCount++;
                console.error(`上传文件失败 ${file.name}:`, error);
            }
        }
        
        if (successCount > 0) {
            showNotification(`成功上传 ${successCount} 个文件${errorCount > 0 ? `，${errorCount} 个失败` : ''}`, successCount === files.length ? 'success' : 'warning');
            elements.fileInput.value = '';
            if (docDateEl) docDateEl.value = '';
            if (signDateEl) signDateEl.value = '';
            if (signerEl) signerEl.value = '';
            if (hasSealEl) hasSealEl.checked = false;
            if (partyASealEl) partyASealEl.checked = false;
            if (partyBSealEl) partyBSealEl.checked = false;
            if (otherSealEl) otherSealEl.value = '';
            // 清空已上传文件列表
            const uploadedFilesList = document.getElementById('uploadedFilesList');
            if (uploadedFilesList) {
                uploadedFilesList.innerHTML = '<p class="placeholder">暂无上传文件</p>';
            }
            // 上传成功后自动归档
            if (appState.currentCycle && appState.currentDocument) {
                await archiveDocument(appState.currentCycle, appState.currentDocument);
            }
            // 刷新文档列表
            await reloadProjectAndRender(appState.currentCycle);
        } else {
            showNotification('上传失败: 所有文件上传失败', 'error');
        }
    } catch (error) {
        console.error('上传文档失败:', error);
        showNotification('上传失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
        isUploadingDocument = false;
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '✅ 确认归档';
        }
    }
}

/**
 * 处理文件选择
 */
export function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        // 显示文件信息
        for (const file of files) {
            showUploadedFile(file);
            console.log('选择的文件:', file.name);
        }
    }
}

/**
 * 显示上传的文件
 */
function showUploadedFile(file) {
    const fileList = document.getElementById('uploadedFilesList');
    if (!fileList) return;
    
    // 清空占位符
    if (fileList.querySelector('.placeholder')) {
        fileList.innerHTML = '';
    }
    
    // 创建文件项
    const fileItem = document.createElement('div');
    fileItem.className = 'uploaded-file-item';
    fileItem.dataset.filename = file.name;
    
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-recognition">
                <span class="recognition-tag">等待识别</span>
            </div>
        </div>
        <button type="button" class="btn btn-sm btn-danger" onclick="removeUploadedFile('${file.name}')">删除</button>
    `;
    
    fileList.appendChild(fileItem);
}

/**
 * 移除上传的文件
 */
window.removeUploadedFile = function(filename) {
    const fileItem = document.querySelector(`.uploaded-file-item[data-filename="${filename}"]`);
    if (fileItem) {
        fileItem.remove();
    }
    
    // 如果没有文件了，显示占位符
    const fileList = document.getElementById('uploadedFilesList');
    if (fileList && fileList.children.length === 0) {
        fileList.innerHTML = '<p class="placeholder">暂无上传文件</p>';
    }
};

/**
 * 显示智能识别结果
 */
export function showRecognitionResult(fileName, recognitionData) {
    const fileItem = document.querySelector(`.uploaded-file-item[data-filename="${fileName}"]`);
    if (!fileItem) return;
    
    const recognitionDiv = fileItem.querySelector('.file-recognition');
    if (!recognitionDiv) return;
    
    let recognitionHtml = '';
    
    // 显示签字信息
    if (recognitionData.signer) {
        recognitionHtml += `<span class="recognition-tag signature">签字: ${recognitionData.signer}</span>`;
    } else if (recognitionData.signature_detected && !recognitionData.no_signature) {
        recognitionHtml += '<span class="recognition-tag signature">有签名待确认</span>';
    }
    
    // 显示盖章信息
    if (recognitionData.party_a_seal) {
        recognitionHtml += `<span class="recognition-tag seal">甲方盖章</span>`;
    }
    if (recognitionData.party_b_seal) {
        recognitionHtml += `<span class="recognition-tag seal">乙方盖章</span>`;
    }
    if (recognitionData.has_seal) {
        recognitionHtml += `<span class="recognition-tag seal">已盖章</span>`;
    }
    
    // 显示日期信息
    if (recognitionData.doc_date) {
        recognitionHtml += `<span class="recognition-tag">文档日期: ${recognitionData.doc_date}</span>`;
    }
    if (recognitionData.sign_date) {
        recognitionHtml += `<span class="recognition-tag">签字日期: ${recognitionData.sign_date}</span>`;
    }
    
    if (recognitionHtml === '') {
        recognitionHtml = '<span class="recognition-tag">未识别到信息</span>';
    }
    
    recognitionDiv.innerHTML = recognitionHtml;
}

/**
 * 处理文档编辑
 */
export async function handleEditDocument(e) {
    e.preventDefault();
    
    const form = e.target;
    const docId = document.getElementById('editDocId').value;
    if (!docId) {
        showNotification('文档ID不存在', 'error');
        return;
    }
    
    // 字段名映射表：将表单ID映射到后端API字段名
    const fieldNameMap = {
        'editDocDate': 'doc_date',
        'editSignDate': 'sign_date',
        'editSigner': 'signer',
        'editPartyASigner': 'party_a_signer',  // 甲方签字人
        'editPartyBSigner': 'party_b_signer',  // 乙方签字人
        'editNoSignature': 'no_signature',
        'editHasSeal': 'has_seal_marked',  // 注意：后端使用 has_seal_marked
        'editPartyASeal': 'party_a_seal',
        'editPartyBSeal': 'party_b_seal',
        'editNoSeal': 'no_seal',
        'editOtherSeal': 'other_seal',
        'editNotInvolved': 'not_involved',  // 本次项目不涉及
        'editRemark': 'notes',  // 备注
        'editDirectory': 'directory',  // 所属目录
        'editRootDirectory': 'root_directory'  // 显示根目录
    };
    
    // 动态收集表单数据
    const docData = {};
    
    // 收集文本、日期和文本域输入
    form.querySelectorAll('input[type="text"], input[type="date"], textarea').forEach(input => {
        if (input.id.startsWith('edit')) {
            if (fieldNameMap[input.id]) {
                docData[fieldNameMap[input.id]] = input.value;
            } else {
                // 处理自定义属性，优先使用 data-field-name
                const fieldName = input.dataset.fieldName || input.id.replace('edit', '');
                docData[fieldName] = input.value;
            }
        }
    });
    
    // 收集复选框
    form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        if (checkbox.id.startsWith('edit')) {
            if (fieldNameMap[checkbox.id]) {
                docData[fieldNameMap[checkbox.id]] = checkbox.checked;
            } else {
                // 处理自定义属性，优先使用 data-field-name
                const fieldName = checkbox.dataset.fieldName || checkbox.id.replace('edit', '');
                docData[fieldName] = checkbox.checked;
            }
        }
    });
    
    showLoading(true);
    try {
        const result = await editDocument(docId, docData);
        
        if (result.status === 'success') {
            showNotification('文档编辑成功', 'success');
            
            // 如果勾选了"本次项目不涉及"，自动归档
            if (docData.not_involved && appState.currentCycle && appState.currentDocument) {
                try {
                    const { archiveDocument } = await import('./api.js');
                    const archiveResult = await archiveDocument(appState.currentCycle, appState.currentDocument);
                    if (archiveResult.status === 'success') {
                        showNotification('文档已自动归档', 'success');
                    }
                } catch (e) {
                    console.error('自动归档失败:', e);
                }
            }
            
            const editModal = document.getElementById('editDocModal');
            if (editModal) {
                editModal.classList.remove('show');
                document.body.style.overflow = 'auto';
            }
            // 重新加载项目配置以确保数据最新
            console.log('[handleEditDocument] 重新加载项目配置...');
            try {
                const { loadProject } = await import('./api.js');
                const updatedProject = await loadProject(appState.currentProjectId);
                if (updatedProject) {
                    appState.projectConfig = updatedProject;
                    console.log('[handleEditDocument] 项目配置已更新');
                }
            } catch (e) {
                console.error('[handleEditDocument] 重新加载项目配置失败:', e);
            }
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
            // 刷新维护页面的文档列表
            if (appState.currentCycle && appState.currentDocument) {
                await loadMaintainDocumentsList(appState.currentCycle, appState.currentDocument);
            }
        } else {
            showNotification('编辑失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('编辑文档失败:', error);
        showNotification('编辑失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理文档替换
 */
export async function handleReplaceDocument(e) {
    e.preventDefault();
    
    const docId = e.target.dataset.docId;
    const file = document.getElementById('replaceFileInput').files[0];
    
    if (!docId || !file) {
        showNotification('请选择文件', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_id', docId);
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/replace', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('文档替换成功', 'success');
            closeModal(elements.replaceDocModal);
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('替换失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('替换文档失败:', error);
        showNotification('替换失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理文档删除
 * @param {string} docId - 文档ID
 * @param {string} cycle - 周期（可选，用于刷新维护弹窗列表）
 * @param {string} docName - 文档名称（可选，用于刷新维护弹窗列表）
 */
export async function handleDeleteDocument(docId, cycle, docName) {
    showConfirmModal(
        '确认删除',
        '确定要删除这个文档吗？此操作不可恢复。',
        async () => {
            try {
                const result = await deleteDocument(docId);
                
                if (result.status === 'success') {
                    showNotification('文档删除成功', 'success');
                    
                    // 重新加载项目配置，确保 appState.projectConfig 是最新的
                    if (appState.currentProjectId) {
                        try {
                            const updatedProject = await loadProject(appState.currentProjectId);
                            if (updatedProject) {
                                appState.projectConfig = updatedProject;
                            }
                        } catch (e) {
                            console.error('重新加载项目配置失败:', e);
                        }
                    }
                    
                    // 刷新文档列表
                    await renderCycleDocuments(appState.currentCycle);
                    // 刷新维护页面的文档列表（使用传入的 cycle/docName 或 appState 中的值）
                    const refreshCycle = cycle || appState.currentCycle;
                    const refreshDocName = docName || appState.currentDocument;
                    if (refreshCycle && refreshDocName) {
                        await loadMaintainDocumentsList(refreshCycle, refreshDocName);
                    } else {
                        await loadMaintainDocuments();
                    }
                } else {
                    showNotification('删除失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('删除文档失败:', error);
                showNotification('删除失败: ' + error.message, 'error');
            }
        }
    );
}

/**
 * 分析要求完成状态
 * 从 attributes 字段读取要求，而不是解析 requirement 字符串
 * 返回每个要求的状态: 'none'-无文件, 'full'-全部完成, 'partial'-部分完成, 'empty'-全未完成
 * 
 * @param {Object} attributes - requirements.json 中的 attributes 字段
 * @param {Array} docsList - 文档列表
 */
function analyzeRequirementStatus(attributes, docsList) {
    if (!attributes || docsList.length === 0) return [];
    const labelMap = getPredefinedAttributeLabelMap(appState.projectConfig);
    
    // 定义 attributes 到要求名称的映射
    const attrMap = [
        { key: 'party_a_sign', name: labelMap.party_a_sign || '甲方签字' },
        { key: 'party_b_sign', name: labelMap.party_b_sign || '乙方签字' },
        { key: 'party_a_seal', name: labelMap.party_a_seal || '甲方盖章' },
        { key: 'party_b_seal', name: labelMap.party_b_seal || '乙方盖章' },
        { key: 'need_doc_date', name: labelMap.need_doc_date || '文档日期' },
        { key: 'need_sign_date', name: labelMap.need_sign_date || '签字日期' },
        { key: 'need_doc_number', name: labelMap.need_doc_number || '发文号' }
    ];
    
    // 根据 attributes 确定需要检查哪些属性（只检查值为true的）
    const activeAttributes = [];
    
    // 处理预定义属性
    for (const attr of attrMap) {
        if (attributes[attr.key] === true) {
            activeAttributes.push(attr);
        }
    }
    
    // 处理自定义属性（除了预定义的键之外的属性）
    const predefinedKeys = new Set(attrMap.map(attr => attr.key));
    const customDefs = getCustomAttributeDefinitions(appState.projectConfig, { attributes });
    
    console.log('[analyzeRequirementStatus] appState.projectConfig:', appState.projectConfig);
    console.log('[analyzeRequirementStatus] appState.projectConfig?.custom_attribute_definitions:', appState.projectConfig?.custom_attribute_definitions);
    console.log('[analyzeRequirementStatus] customDefs:', customDefs);
    console.log('[analyzeRequirementStatus] attributes:', attributes);
    
    for (const [key, value] of Object.entries(attributes)) {
        if (value === true && !predefinedKeys.has(key)) {
            // 跳过系统字段 custom_attrs
            if (key === 'custom_attrs') {
                continue;
            }
            
            // 优先从自定义属性定义中获取显示名称
            const customDef = customDefs.find(def => def.id === key);
            let displayName;
            if (customDef) {
                displayName = customDef.name;
                console.log('[analyzeRequirementStatus] 从 customDefs 找到显示名称:', key, '->', displayName);
            } else {
                // 尝试从 custom_xxx_name 格式中提取名称
                // ID 格式: custom_1234567890123_abc123def
                const match = key.match(/^custom_\d+_(.+)$/);
                if (match) {
                    // 提取后缀部分并格式化
                    displayName = match[1].replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                    console.log('[analyzeRequirementStatus] 从 ID 提取显示名称:', key, '->', displayName);
                } else {
                    // 对于其他格式，直接使用key并格式化
                    displayName = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                    console.log('[analyzeRequirementStatus] 使用 key 作为显示名称:', key, '->', displayName);
                }
            }
            activeAttributes.push({ key, name: displayName });
        }
    }
    
    if (activeAttributes.length === 0) {
        return [];
    }
    
    // 检查每个属性的完成状态
    return activeAttributes.map(attr => {
        let completedCount = 0;
        let totalCount = 0;
        
        docsList.forEach(doc => {
            const getDocValue = (fieldName) => {
                if (doc[fieldName] !== undefined) return doc[fieldName];
                if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
                return null;
            };
            
            // 跳过标记为"本次项目不涉及"的文档，视为已完成
            if (getDocValue('not_involved')) {
                completedCount++;
                return;
            }
            
            totalCount++;
            
            let isCompleted = false;
            
            if (attr.key === 'party_a_sign') {
                // 甲方签字
                const signer = getDocValue('signer');
                const partyASigner = getDocValue('party_a_signer');
                const noSignature = getDocValue('no_signature');
                isCompleted = partyASigner || noSignature || signer;
            } else if (attr.key === 'party_b_sign') {
                // 乙方签字
                const signer = getDocValue('signer');
                const partyBSigner = getDocValue('party_b_signer');
                const noSignature = getDocValue('no_signature');
                isCompleted = partyBSigner || noSignature || signer;
            } else if (attr.key === 'party_a_seal') {
                // 甲方盖章
                const partyASeal = getDocValue('party_a_seal');
                const hasSealMarked = getDocValue('has_seal_marked') || getDocValue('has_seal');
                const noSeal = getDocValue('no_seal');
                isCompleted = partyASeal || hasSealMarked || noSeal;
            } else if (attr.key === 'party_b_seal') {
                // 乙方盖章
                const partyBSeal = getDocValue('party_b_seal');
                const hasSealMarked = getDocValue('has_seal_marked') || getDocValue('has_seal');
                const noSeal = getDocValue('no_seal');
                isCompleted = partyBSeal || hasSealMarked || noSeal;
            } else if (attr.key === 'need_doc_date') {
                // 文档日期
                isCompleted = getDocValue('doc_date');
            } else if (attr.key === 'need_sign_date') {
                // 签字日期
                isCompleted = getDocValue('sign_date') || getDocValue('no_signature');
            } else if (attr.key === 'need_doc_number') {
                // 发文号
                isCompleted = getDocValue('doc_number');
            } else {
                // 处理自定义属性
                // 尝试直接获取属性值，或者使用带下划线前缀的版本
                isCompleted = getDocValue(attr.key) !== null && getDocValue(attr.key) !== undefined && getDocValue(attr.key) !== '';
            }
            
            if (isCompleted) completedCount++;
        });
        
        // 确定状态
        let status = 'empty';
        const totalDocs = totalCount + (docsList.length - totalCount); // 包括不涉及的文档
        if (completedCount === totalDocs && totalDocs > 0) {
            status = 'full'; // 全部完成
        } else if (completedCount > 0) {
            status = 'partial'; // 部分完成
        }
        
        return {
            name: attr.name,
            status: status,
            description: `${completedCount}/${totalDocs} 文件已完成`
        };
    });
}

/**
 * 渲染周期内的文档
 */
export async function renderCycleDocuments(cycle, filterOptions = null) {
    if (!appState.projectConfig) {
        elements.contentArea.innerHTML = '<p class="placeholder">请先加载项目配置</p>';
        return;
    }
    
    // 如果没有传入筛选选项，使用全局保存的筛选选项
    if (filterOptions === null) {
        filterOptions = appState.filterOptions || {};
    }
    
    const docsInfo = appState.projectConfig.documents[cycle];
    if (!docsInfo) {
        elements.contentArea.innerHTML = '<p class="placeholder">该周期暂无文档</p>';
        return;
    }

    // 获取原始 required_docs 并保存原始序号（使用原始顺序的索引+1作为序号）
    const requiredDocsRaw = docsInfo.required_docs || [];
    const requiredDocs = requiredDocsRaw.map((doc, idx) => ({
        ...doc,
        _originalIndex: doc.index !== undefined && doc.index !== null ? doc.index : (idx + 1)
    })).sort((a, b) => (a._originalIndex || 0) - (b._originalIndex || 0));

    // 获取已上传的文档
    const uploadedDocs = await getCycleDocuments(cycle);
    
    // 获取当前周期的待审核归档请求
    let pendingArchiveMap = {};
    let approvedArchiveMap = {};
    try {
        const archiveResult = await getArchiveRequests(appState.currentProjectId, 'pending');
        if (archiveResult.status === 'success' && archiveResult.requests) {
            for (const req of archiveResult.requests) {
                if (req.cycle === cycle && req.status === 'pending') {
                    for (const docName of (req.doc_names || [])) {
                        pendingArchiveMap[docName] = req;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('获取归档审批状态失败:', e);
    }
    // 获取已完成的归档请求（用于已归档文档的流转查看）
    try {
        const approvedResult = await getArchiveRequests(appState.currentProjectId, 'approved');
        if (approvedResult.status === 'success' && approvedResult.requests) {
            for (const req of approvedResult.requests) {
                if (req.cycle === cycle && req.status === 'approved') {
                    for (const docName of (req.doc_names || [])) {
                        approvedArchiveMap[docName] = req;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('获取已完成归档请求失败:', e);
    }
    
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
    let allDocTypes = [...requiredDocs];
    
    // 添加已上传但不在required_docs中的文档类型
    let maxIndex = requiredDocs.length > 0 
        ? Math.max(...requiredDocs.map(d => d._originalIndex || 0)) 
        : 0;
    uploadedDocTypes.forEach(docType => {
        // 过滤掉系统生成的随机值（以 "Custom " 开头的文档类型）
        if (!docType.startsWith('Custom ') && !requiredDocs.some(reqDoc => reqDoc.name === docType)) {
            maxIndex++;
            allDocTypes.push({
                name: docType,
                requirement: '无要求',
                index: maxIndex,
                _originalIndex: maxIndex
            });
        }
    });
    
    // 应用过滤
        allDocTypes = allDocTypes.filter(doc => {
            const isArchived = appState.projectConfig.documents_archived?.[cycle]?.[doc.name];
            const hasFiles = (docsByName[doc.name] || []).length > 0;
            const isNotInvolvedFromDocs = (docsByName[doc.name] || []).some(d => d.not_involved || d._not_involved);
            const isNotInvolvedFromConfig = appState.projectConfig.documents_not_involved?.[cycle]?.[doc.name];
            const isNotInvolved = isNotInvolvedFromDocs || isNotInvolvedFromConfig;
            
            if (filterOptions.hideArchived && isArchived) {
                return false;
            }
            if (filterOptions.hideCompleted && (hasFiles || isNotInvolved)) {
                return false;
            }
            
            // 关键字筛选
            if (filterOptions.keyword) {
                const keyword = filterOptions.keyword.toLowerCase();
                const docName = doc.name.toLowerCase();
                const requirement = (doc.requirement || '').toLowerCase();
                
                // 检查文档名称或要求中是否包含关键字
                if (!docName.includes(keyword) && !requirement.includes(keyword)) {
                    return false;
                }
            }
            
            return true;
        });
    
    // 重新排序
    allDocTypes.sort((a, b) => (a.index || 0) - (b.index || 0));

    // 新布局：左侧组织机构人员，中间文件名+附加属性，右侧确认按钮
        const html = `
        <!-- 标题和筛选选项在同一行 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <h2 style="text-align: left; margin: 0;">📋 ${cycle} - 文档管理</h2>
                <button type="button" class="btn btn-success btn-sm" onclick="batchArchiveCycle('${cycle}')" title="一键归档当前周期内所有符合要求的文档">
                    📥 一键归档
                </button>
            </div>
            <div class="filter-options" style="padding: 5px 10px; background: #f8f9fa; border-radius: 6px; display: flex; flex-wrap: wrap; gap: 10px 15px; align-items: center;">
                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; font-size: 14px;">
                    <input type="checkbox" id="hideArchived" ${appState.filterOptions.hideArchived ? 'checked' : ''} onchange="filterDocuments('${cycle}')">
                    <span>隐藏已归档</span>
                </label>
                <label class="checkbox-inline" style="display: flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; font-size: 14px;">
                    <input type="checkbox" id="hideCompleted" ${appState.filterOptions.hideCompleted ? 'checked' : ''} onchange="filterDocuments('${cycle}')">
                    <span>隐藏文件完整</span>
                </label>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="text" id="keywordFilter" placeholder="输入关键字，回车搜索" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; width: 180px; font-size: 14px;" value="${appState.filterOptions.keyword || ''}" onkeydown="if(event.key==='Enter') filterDocuments('${cycle}')">
                    <button onclick="filterDocuments('${cycle}')" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">🔍</button>
                </div>
            </div>
        </div>
        
        <!-- 新文档管理布局 -->
        <div class="new-documents-layout">
            <div class="documents-table-container">
            <table class="documents-table">
                <thead>
                    <tr>
                        <th style="text-align: center; width: 80px; min-width: 80px;">序号</th>
                        <th class="col-org" style="text-align: center;">文档类型</th>
                        <th class="col-files" style="text-align: center;">文件列表</th>
                        <th class="col-action" style="text-align: center;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${allDocTypes.map((doc, index) => {
                        const docsList = docsByName[doc.name] || [];
                        
                        // 检查是否已归档
                        const isArchived = appState.projectConfig.documents_archived?.[cycle]?.[doc.name];
                        const pendingRequest = pendingArchiveMap[doc.name];
                        
                        // 构建文档树形目录结构
                        const fileListHtml = docsList.length > 0
                            ? renderMainDocTree(docsList, cycle, doc)
                            : '<span class="doc-no-files">暂无文件</span>';
                        

                        
                        // 分析要求并计算每个要求的完成状态
                        // 从 required_docs 中找到当前文档的 attributes
                        const currentDocInfo = requiredDocs.find(rd => rd.name === doc.name);
                        const attributes = currentDocInfo?.attributes;
                        // 要求状态: 'none'-无文件或无要求, 'full'-全部完成, 'partial'-部分完成, 'empty'-全未完成
                        const requirementStatus = analyzeRequirementStatus(attributes, docsList);
                        
                        // 检查是否标记为不涉及（从文档列表或项目配置中）
                        const isNotInvolvedFromDocs = docsList.some(d => d.not_involved || d._not_involved);
                        const isNotInvolvedFromConfig = appState.projectConfig.documents_not_involved?.[cycle]?.[doc.name];
                        const isNotInvolved = isNotInvolvedFromDocs || isNotInvolvedFromConfig;
                        
                        // 生成要求标签HTML
                        const requirementHtml = requirementStatus.length > 0 
                            ? requirementStatus.map(r => {
                                let style = '';
                                if (r.status === 'full') {
                                    // 全部完成: 绿色底色
                                    style = 'background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; margin: 2px; display: inline-block; font-size: 12px;';
                                } else if (r.status === 'partial') {
                                    // 部分完成: 绿色边框
                                    style = 'background: #fff; color: #28a745; border: 1px solid #28a745; padding: 2px 8px; border-radius: 4px; margin: 2px; display: inline-block; font-size: 12px;';
                                } else {
                                    // 未完成: 黄色底色
                                    style = 'background: #fff3cd; color: #856404; padding: 2px 8px; border-radius: 4px; margin: 2px; display: inline-block; font-size: 12px;';
                                }
                                return `<span style="${style}" title="${r.description}">${r.name}</span>`;
                            }).join('')
                            : (doc.requirement ? `<span style="background: #fff3cd; padding: 3px 12px; border-radius: 4px; display: inline-block; text-align: center;">${doc.requirement}</span>` : '');
                        
                        const docDescription = String(doc.doc_description || '').trim();
                        const escapedDocDescription = escapeHtml(docDescription);

                        // 获取文档序号 - 使用原始序号，确保筛选后序号不变
                        const docIndex = doc._originalIndex !== undefined && doc._originalIndex !== null ? doc._originalIndex : (index + 1);
                        
                        // 确定显示的状态标签：优先显示"不涉及"，然后是"已归档"，然后是"待审核"
                        const statusTag = isNotInvolved 
                            ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">🚫不涉及</div>`
                            : (isArchived ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">已归档</div>` 
                            : (pendingRequest ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #ffc107; color: #333; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">⏳${pendingRequest.request_type === 'not_involved' ? '不涉及审批' : '待审核'}</div>` : ''));
                        
                        // 序号列状态图标
                        let indexStatusIcon = '';
                        if (isNotInvolved) {
                            indexStatusIcon = '<span title="不涉及">🚫</span>';
                        } else if (isArchived) {
                            indexStatusIcon = '<span title="已归档">🗄️</span>';
                        } else if (pendingRequest) {
                            indexStatusIcon = '<span title="待审核">⏳</span>';
                        } else if (docsList.length === 0) {
                            indexStatusIcon = '<span title="无文件" style="color: #dc3545;">❌</span>';
                        } else {
                            // 检查属性完成状态
                            const hasPartial = requirementStatus.some(r => r.status === 'partial');
                            const hasPending = requirementStatus.some(r => r.status === 'pending');
                            if (hasPending) {
                                indexStatusIcon = '<span title="属性待补" style="color: #ffc107;">⚠️</span>';
                            } else if (hasPartial) {
                                indexStatusIcon = '<span title="部分完成" style="color: #ffc107;">◐</span>';
                            } else {
                                indexStatusIcon = '<span title="完整" style="color: #28a745;">✓</span>';
                            }
                        }
                        
                        return `
                        <tr class="doc-row ${isArchived || isNotInvolved ? 'archived' : ''}">
                            <td style="text-align: center; vertical-align: top; padding: 10px; font-weight: 500; width: 80px; min-width: 80px;"><div style="display: flex; flex-direction: column; align-items: center; gap: 4px;"><span>${docIndex}</span><span style="font-size: 12px;">${indexStatusIcon}</span></div></td>
                            <td class="col-org" style="text-align: center; width: 250px;">
                                <div class="org-info" style="display: inline-block; text-align: center;">
                                    <div style="position: relative; border: 1px solid transparent; padding: 10px; border-radius: 4px;">
                                        ${statusTag}
                                        <div class="doc-type" style="text-align: center;" ${docDescription ? `title="说明: ${escapedDocDescription}"` : ''}>${doc.name}${docDescription ? ' <span style="font-size:12px;color:#7a8798;cursor:help;" title="说明: ' + escapedDocDescription + '">ⓘ</span>' : ''}</div>
                                        <div class="doc-requirement" style="margin-top: 5px; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px;">
                                            ${requirementHtml}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td class="col-files">
                                ${isNotInvolved ? '<span style="color: #28a745; font-style: italic; display: block; text-align: center; padding: 10px; font-weight: 500;">✓ 本次项目不涉及该文档</span>' : fileListHtml}
                            </td>
                            <td class="col-action">
                                <div class="action-buttons">
                                    ${!isArchived ? `
                                        ${pendingRequest ? `
                                            <div style="margin-bottom:4px;font-size:12px;color:#856404;">⏳ ${pendingRequest.request_type === 'not_involved' ? '不涉及审批中' : (pendingRequest.request_type === 'unarchive' ? '撤销归档审批中' : '待审核')} (申请人: ${pendingRequest.requester_username || ''})</div>
                                            ${(() => {
                                                const stages = pendingRequest.approval_stages || [];
                                                if (stages.length > 0) {
                                                    const currentStage = pendingRequest.current_stage || 1;
                                                    const stageLabels = stages.map((s, i) => {
                                                        const roleName = s.required_role === 'project_admin' ? '项目经理' : s.required_role === 'pmo' ? 'PMO' : s.required_role === 'pmo_leader' ? 'PMO负责人' : s.required_role === 'admin' ? '管理员' : s.required_role || ('Level'+(i+1));
                                                        const handlerName = s.approved_by_username || s.assigned_to_username || '待分配';
                                                        if (s.status === 'approved') return '<span style="color:#28a745;" title="处理人: ' + escapeHtml(handlerName) + '">✓ ' + roleName + '已审核</span>';
                                                        if (s.status === 'rejected') return '<span style="color:#dc3545;" title="处理人: ' + escapeHtml(handlerName) + '">✗ ' + roleName + '已驳回</span>';
                                                        const pendingHint = (i + 1) === currentStage ? handlerName : '待上一阶段完成';
                                                        return '<span style="color:#ffc107;" title="处理人: ' + escapeHtml(pendingHint) + '">⏳ ' + roleName + '审批中</span>';
                                                    });
                                                    return '<div style="margin-bottom:6px;font-size:12px;color:#555;line-height:1.8;">流程: ' + stageLabels.join(' → ') + '</div>';
                                                }
                                                return '';
                                            })()}
                                            <button class="btn btn-outline-info btn-sm" style="margin-bottom:4px;" onclick="showApprovalTimelineModal('${pendingRequest.id}', '${cycle}')">
                                                📊 流程查看
                                            </button>
                                            ${(() => {
                                                const userRole = authState.user?.role;
                                                const adminApprovalEnabled = appState.systemSettings?.admin_archive_approval_enabled !== false;
                                                if (!['admin','pmo','pmo_leader','project_admin'].includes(userRole)) return '';
                                                if (userRole === 'admin' && !adminApprovalEnabled) return '';
                                                const stages = pendingRequest.approval_stages || [];
                                                const currentStageIdx = (pendingRequest.current_stage || 1) - 1;
                                                const currentStage = stages[currentStageIdx];
                                                // admin 可跨阶段审批（仅在启用管理员审批时）；其他角色按阶段审批
                                                if (currentStage && userRole !== 'admin' && currentStage.required_role !== userRole) {
                                                    if (!(currentStage.required_role === 'pmo' && userRole === 'pmo_leader')) return '';
                                                }
                                                if (currentStage && currentStage.status === 'approved') return '';
                                                if (currentStage && currentStage.required_role === 'pmo_leader') {
                                                    // 判断是否有下一个待审阶段（project_admin），决定是否显示"流转"选项
                                                    const nextStage = stages[currentStageIdx + 1];
                                                    const canForwardToPM = nextStage && nextStage.required_role === 'project_admin' && nextStage.status === 'pending';
                                                    if (canForwardToPM) {
                                                        return `
                                                        <button class="btn btn-warning btn-sm" onclick="handleQuickApprove('${pendingRequest.id}', 'approve', '${cycle}')">
                                                            ➡️ 流转项目经理复核
                                                        </button>
                                                        <button class="btn btn-success btn-sm" onclick="handleQuickApprove('${pendingRequest.id}', 'approve_finalize', '${cycle}')">
                                                            ✅ 直接归档
                                                        </button>
                                                        <button class="btn btn-danger btn-sm" onclick="handleQuickApprove('${pendingRequest.id}', 'reject', '${cycle}')">
                                                            ❌ 驳回
                                                        </button>`;
                                                    } else {
                                                        return `
                                                        <button class="btn btn-success btn-sm" onclick="handleQuickApprove('${pendingRequest.id}', 'approve_finalize', '${cycle}')">
                                                            ✅ 批准归档
                                                        </button>
                                                        <button class="btn btn-danger btn-sm" onclick="handleQuickApprove('${pendingRequest.id}', 'reject', '${cycle}')">
                                                            ❌ 驳回
                                                        </button>`;
                                                    }
                                                }
                                                return `
                                                <button class="btn btn-success btn-sm" onclick="handleQuickApprove('${pendingRequest.id}', 'approve', '${cycle}')">
                                                    ✅ 审批通过
                                                </button>
                                                <button class="btn btn-danger btn-sm" onclick="handleQuickApprove('${pendingRequest.id}', 'reject', '${cycle}')">
                                                    ❌ 驳回
                                                </button>`;
                                            })()}
                                            ${pendingRequest.requester_username === authState.user?.username ? `
                                                <button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="handleWithdrawArchive('${appState.currentProjectId}', '${pendingRequest.id}', '${cycle}')">
                                                    ↩️ 撤回审批
                                                </button>
                                                <button class="btn btn-info btn-sm" style="margin-top:4px;" onclick="handleContractorQuickApprove('${pendingRequest.id}', '${cycle}')">
                                                    ⚡ 快速审批
                                                </button>
                                            ` : ''}
                                        ` : `
                                            ${!isNotInvolved ? `
                                                <button class="btn btn-primary btn-sm" onclick="openUploadModal('${cycle}', '${doc.name}')">
                                                    📁 上传/选择文档
                                                </button>
                                                ${docsList.length > 0 ? `
                                                    <button class="btn btn-success btn-sm" onclick="openMaintainModal('${cycle}', '${doc.name}')">
                                                        ✏️ 编辑
                                                    </button>
                                                ` : ''}
                                            ` : ''}
                                            <button class="btn btn-warning btn-sm" onclick="markDocumentNotInvolved('${cycle}', '${doc.name}')">
                                                ${isNotInvolved ? '🚫 撤销不涉及' : '🚫 不涉及'}
                                            </button>
                                            ${!isNotInvolved ? `
                                                <button class="btn btn-info btn-sm" onclick="archiveDocument('${cycle}', '${doc.name}')">
                                                    📦 确认归档
                                                </button>
                                            ` : ''}
                                        `}
                                    ` : `
                                        <button class="btn btn-warning btn-sm" onclick="unarchiveDocument('${cycle}', '${doc.name}')">
                                            📤 撤销归档
                                        </button>
                                        ${approvedArchiveMap[doc.name] ? `
                                            <button class="btn btn-outline-info btn-sm" style="margin-top:4px;" onclick="showApprovalTimelineModal('${approvedArchiveMap[doc.name].id}', '${cycle}')">
                                                📊 流转查看
                                            </button>
                                        ` : ''}
                                    `}
                                </div>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        </div>
    `;
    
    elements.contentArea.innerHTML = html;

    // 初始化文档列表表格的列宽拖拽功能
    const docTable = elements.contentArea.querySelector('.documents-table');
    if (docTable) {
        initResizableColumns(docTable, 'docs_table_col_widths');
    }

    // 绑定主页面文档树形目录的折叠/展开事件
    // 注意：使用 Array.from + find 代替 querySelector，避免路径含中文/括号等特殊字符时选择器失效
    document.querySelectorAll('.main-doc-dir-header').forEach(header => {
        header.addEventListener('click', function(e) {
            if (e.target.tagName === 'SPAN' && e.target.classList.contains('dir-toggle-icon') || e.type === 'ignore') return;
            const dirPath = this.dataset.dir;
            const children = Array.from(document.querySelectorAll('.main-doc-dir-children'))
                .find(el => el.dataset.dirFiles === dirPath);
            const icon = this.querySelector('.dir-toggle-icon');
            if (children) {
                const isHidden = children.style.display === 'none';
                children.style.display = isHidden ? 'block' : 'none';
                if (icon) icon.textContent = isHidden ? '▼' : '▶';
            }
        });
    });
}

/**
 * 切换文件列表的展开/收起状态
 * @param {string} expandId - 展开区域的ID
 */
window.toggleFileExpand = function(expandId) {
    const hiddenDiv = document.getElementById(`${expandId}-hidden`);
    const icon = document.getElementById(`${expandId}-icon`);
    const text = document.getElementById(`${expandId}-text`);
    
    if (hiddenDiv && icon && text) {
        const isHidden = hiddenDiv.style.display === 'none';
        if (isHidden) {
            hiddenDiv.style.display = 'block';
            icon.textContent = '▲';
            text.textContent = text.textContent.replace('展开', '收起').replace('个文件', '个文件');
        } else {
            hiddenDiv.style.display = 'none';
            icon.textContent = '▼';
            text.textContent = text.textContent.replace('收起', '展开');
        }
    }
}

/**
 * 标记文档为本次项目不涉及或撤销不涉及
 */
export async function markDocumentNotInvolved(cycle, docName) {
    try {
        // 检查文档当前状态（从文档列表和项目配置中）
        const docsList = await getCycleDocuments(cycle);
        const sameNameDocs = docsList.filter(d => d.doc_name === docName);
        const isNotInvolvedFromDocs = sameNameDocs.some(d => d.not_involved || d._not_involved);
        const isNotInvolvedFromConfig = appState.projectConfig.documents_not_involved?.[cycle]?.[docName];
        const isCurrentlyNotInvolved = isNotInvolvedFromDocs || isNotInvolvedFromConfig;
        
        if (isCurrentlyNotInvolved) {
            // 撤销不涉及标记 — 直接执行（不需要审批）
            const title = '撤销不涉及';
            const message = `确定将「${docName}」撤销标记为不涉及吗？`;
            showConfirmModal(title, message, async () => {
                showLoading(true);
                try {
                    let success = true;
                    if (sameNameDocs.length > 0) {
                        // 多版本文档场景：同一文档类型下的所有记录都应同步撤销不涉及
                        const patchResults = await Promise.all(
                            sameNameDocs
                                .map(d => d.id || d.doc_id)
                                .filter(Boolean)
                                .map(async (id) => {
                                    const result = await editDocument(id, { not_involved: false });
                                    return { id, result };
                                })
                        );
                        const failed = patchResults.find(item => item.result?.status !== 'success');
                        if (failed) {
                            success = false;
                            showNotification('操作失败: ' + (failed.result?.message || '部分文档更新失败'), 'error');
                        }
                    }
                    if (appState.projectConfig.documents_not_involved?.[cycle]?.[docName]) {
                        delete appState.projectConfig.documents_not_involved[cycle][docName];
                        const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(appState.projectConfig)
                        });
                        if (!response.ok) success = false;
                    }
                    if (success) {
                        await unarchiveDocument(cycle, docName);
                        showNotification('文档已撤销不涉及标记', 'success');
                    }
                } catch (error) {
                    console.error('操作失败:', error);
                    showNotification('操作失败: ' + error.message, 'error');
                } finally {
                    showLoading(false);
                    await reloadProjectAndRender(cycle);
                }
            });
        } else {
            // 标记为不涉及 — 走审批流程
            const title = '标记为不涉及';
            const message = `确定将「${docName}」标记为本次项目不涉及吗？\n提交后需要项目经理和PMO审批通过后才会生效。`;
            showConfirmModal(title, message, async () => {
                showLoading(true);
                try {
                    const result = await submitArchiveRequest(
                        appState.currentProjectId, cycle, [docName], [], 'not_involved'
                    );
                    if (result.status === 'success') {
                        showNotification(result.message || '不涉及审批请求已提交，等待审批', 'success');
                        await reloadProjectAndRender(cycle);
                    } else {
                        showNotification(result.message || '提交失败', 'error');
                    }
                } catch (error) {
                    console.error('提交不涉及审批失败:', error);
                    showNotification('提交失败: ' + error.message, 'error');
                } finally {
                    showLoading(false);
                }
            });
        }
    } catch (error) {
        console.error('操作失败:', error);
        showNotification('操作失败: ' + error.message, 'error');
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
 * 预览文档（渐进式预览）- 带进度条
 */
export async function previewDocument(docId) {
    try {
        // 先获取文档信息（对docId做URL编码，防止特殊字符如:导致404）
        const encodedDocId = encodeURIComponent(docId);
        const docResponse = await fetch(`/api/documents/${encodedDocId}`);
        const docResult = await docResponse.json();
        
        if (docResult.status !== 'success') {
            // 文档记录未能在服务器内存中找到（可能是服务重启后缓存失效）
            showConfirmModal(
                '文档加载失败',
                '无法加载该文档的记录（服务重启后可能需要重新打开项目）。\n\n点击确定将刷新当前文档列表，然后再次点击文件名预览。',
                async () => {
                    // 刷新文档列表（重新从服务器加载项目配置）
                    if (appState.currentCycle) {
                        await renderCycleDocuments(appState.currentCycle);
                    }
                }
            );
            return;
        }
        
        const docInfo = docResult.data;
        const filename = docInfo.file_name || docInfo.original_filename || docInfo.filename || docInfo.name || '未知文件';
        let fileExt = filename.split('.').pop().toLowerCase();
        // 处理特殊情况：.pdff 视为 .pdf
        if (fileExt === 'pdff') {
            fileExt = 'pdf';
        }
        
        // 判断是否需要转换（Office文档需要转换）
        const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
        const needsConversion = officeExtensions.includes(fileExt);
        
        // 创建预览模态框（带增强版加载状态）
        const modalContent = `
            <div class="preview-modal-content">
                <div class="preview-header">
                    <h3>${escapeHtml(filename)}</h3>
                    <button class="close-btn" onclick="document.getElementById('previewModal').style.display='none'">×</button>
                </div>
                <div class="preview-body" id="previewBody">
                    <div class="preview-loading-enhanced" id="previewLoading">
                        <div class="preview-file-info">
                            <div class="file-icon">${getFileIcon(fileExt)}</div>
                            <div class="file-name">${escapeHtml(filename)}</div>
                        </div>
                        <div class="loading-icon">⚡</div>
                        <div class="loading-title" id="loadingTitle">${needsConversion ? '正在转换文档...' : '正在加载文档...'}</div>
                        <div class="loading-status" id="loadingStatus">${needsConversion ? '正在生成预览，请稍候...' : '正在读取文件内容...'}</div>
                        <div class="preview-progress-container">
                            <div class="preview-progress-bar">
                                <div class="preview-progress-indeterminate" id="progressBar"></div>
                            </div>
                            <div class="preview-progress-text" id="progressText">处理中...</div>
                        </div>
                        <div class="loading-hint">
                            <span class="hint-icon">💡</span>
                            <span id="loadingHint">${needsConversion ? '首次预览需要转换文档格式，可能需要几秒钟' : '正在加载文件，请稍候'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 创建模态框元素
        let modal = document.getElementById('previewModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'previewModal';
            modal.className = 'preview-modal';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = modalContent;
        modal.style.display = 'block';
        
        // 点击模态框外部关闭
        modal.onclick = function(event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
        
        // 更新加载状态的辅助函数
        const updateLoadingStatus = (title, status, hint) => {
            const titleEl = document.getElementById('loadingTitle');
            const statusEl = document.getElementById('loadingStatus');
            const hintEl = document.getElementById('loadingHint');
            
            if (titleEl) titleEl.textContent = title;
            if (statusEl) statusEl.textContent = status;
            if (hintEl && hint) hintEl.textContent = hint;
        };
        
        // 调用渐进式预览API
        await loadProgressivePreview(docId, fileExt);
        
    } catch (error) {
        console.error('预览文档失败:', error);
        showNotification('预览失败: ' + error.message, 'error');
    }
}

/**
 * 检查完整PDF是否已生成
 */
async function checkFullPdfStatus(docId) {
    try {
        const response = await fetch(`/api/documents/preview/status/${encodeURIComponent(docId)}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('检查PDF状态失败:', error);
        return { status: 'error' };
    }
}

/**
 * 加载渐进式预览 - 支持先显示第一页，再加载完整PDF
 */
async function loadProgressivePreview(docId, fileExt) {
    const previewBody = document.getElementById('previewBody');
    if (!previewBody) return;
    
    try {
        // 更新加载状态 - 开始请求
        const updateLoadingText = (text, hint) => {
            const statusEl = document.getElementById('loadingStatus');
            const hintEl = document.getElementById('loadingHint');
            if (statusEl) statusEl.textContent = text;
            if (hintEl && hint) hintEl.textContent = hint;
        };
        
        updateLoadingText('正在连接服务器并转换文档...', '转换时间取决于文件大小，请耐心等待');
        
        // 调用渐进式预览API
        const response = await fetch(`/api/documents/preview/${encodeURIComponent(docId)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            if (result.mode === 'progressive') {
                // HTML预览模式（PDF转换失败后的回退）
                previewBody.innerHTML = result.preview_html;
                return;
            }
            
            // PDF预览模式
            const viewUrl = result.file_url;
            
            if (result.is_partial) {
                // 部分预览：只转换了第一页
                updateLoadingText('第一页已就绪，完整PDF生成中...', '您可以先查看第一页内容');
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // 显示第一页PDF，并添加提示
                previewBody.innerHTML = `
                    <div style="position: relative; width: 100%; height: 80vh;">
                        <div class="preview-content preview-landscape">
                            <iframe src="${viewUrl}" class="preview-iframe" frameborder="0" 
                                style="width: 100%; height: 100%; border: none;"></iframe>
                        </div>
                        <div id="pdfProgressHint" style="position: absolute; top: 10px; right: 10px; 
                            background: rgba(255,255,255,0.95); padding: 10px 16px; border-radius: 6px; 
                            box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 13px; color: #666;
                            display: flex; align-items: center; gap: 8px; z-index: 100;">
                            <span class="loading-spinner-small" style="width: 16px; height: 16px; 
                                border: 2px solid #e0e0e0; border-top-color: #1890ff; border-radius: 50%; 
                                animation: spin 1s linear infinite; display: inline-block;"></span>
                            <span>正在生成完整PDF预览...</span>
                        </div>
                    </div>
                `;
                
                // 定期检查完整PDF是否准备好
                const fullPreviewUrl = result.full_preview_url;
                let checkCount = 0;
                const maxChecks = 30; // 最多检查30次（约2分钟）
                
                const checkInterval = setInterval(async () => {
                    checkCount++;
                    const statusResult = await checkFullPdfStatus(docId);
                    
                    if (statusResult.status === 'completed' && statusResult.is_complete) {
                        // 完整PDF已准备好，自动切换
                        clearInterval(checkInterval);
                        const hintEl = document.getElementById('pdfProgressHint');
                        if (hintEl) {
                            hintEl.innerHTML = '<span style="color: #52c41a;">✓ 完整PDF已就绪，正在切换...</span>';
                        }
                        
                        // 延迟后切换到完整PDF
                        setTimeout(() => {
                            previewBody.innerHTML = `
                                <div class="preview-content preview-landscape">
                                    <iframe src="${fullPreviewUrl}" class="preview-iframe" frameborder="0" 
                                        style="width: 100%; height: 80vh; border: none;"></iframe>
                                </div>
                            `;
                        }, 1500);
                    } else if (checkCount >= maxChecks) {
                        // 超过最大检查次数，停止检查
                        clearInterval(checkInterval);
                        const hintEl = document.getElementById('pdfProgressHint');
                        if (hintEl) {
                            hintEl.innerHTML = '<span style="color: #999;">第一页预览 • 刷新可查看完整文档</span>';
                        }
                    }
                }, 4000); // 每4秒检查一次
                
            } else {
                // 完整PDF直接显示
                updateLoadingText('加载完成，正在显示...', '预览内容准备就绪');
                await new Promise(resolve => setTimeout(resolve, 200));
                
                if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(fileExt)) {
                    previewBody.innerHTML = `
                        <div style="display: flex; justify-content: center; align-items: center; min-height: 400px; background: #f5f5f5;">
                            <img src="${viewUrl}" class="preview-image" alt="预览图片" onerror="handlePreviewError(this)" style="max-width: 100%; max-height: 80vh; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                        </div>
                    `;
                } else {
                    // 使用隐藏 iframe + onload 检测，防止 PDF URL 返回 JSON 错误时直接显示原文
                    previewBody.innerHTML = `
                        <div class="preview-content preview-landscape">
                            <iframe src="${viewUrl}" class="preview-iframe" frameborder="0" 
                                style="width: 100%; height: 80vh; border: none;"></iframe>
                        </div>
                        <div id="iframeLoadChecker" style="display:none;"></div>
                    `;
                    // 检测 iframe 是否加载了 JSON 错误页面
                    const iframe = previewBody.querySelector('iframe');
                    if (iframe) {
                        iframe.onload = function() {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow.document;
                                const bodyText = doc.body ? doc.body.innerText : '';
                                // 检测是否加载了 JSON 错误响应
                                if (bodyText && bodyText.trim().startsWith('{') && bodyText.includes('"status"') && bodyText.includes('"error"')) {
                                    let errorData;
                                    try { errorData = JSON.parse(bodyText); } catch(e) {}
                                    const msg = errorData?.message || '加载预览失败';
                                    const downloadUrl = `/api/documents/download/${encodeURIComponent(docId)}`;
                                    previewBody.innerHTML = `
                                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); min-height: 400px; border-radius: 12px;">
                                            <div style="font-size: 64px; margin-bottom: 24px;">⏳</div>
                                            <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 12px;">PDF正在生成中</div>
                                            <div style="font-size: 14px; color: #666; margin-bottom: 8px; text-align: center; max-width: 400px;">${escapeHtml(msg)}</div>
                                            <div style="font-size: 13px; color: #999; margin-bottom: 24px;">首次预览需要转换文档格式，请稍等片刻后重试</div>
                                            <button class="btn btn-primary" onclick="previewDocument('${docId}')" style="padding: 12px 32px; font-size: 14px; border-radius: 6px; background: #4f8ef7; color: white; border: none; cursor: pointer;">🔄 重新预览</button>
                                            <a href="${downloadUrl}" class="btn" target="_blank" style="margin-top: 12px; font-size: 13px; color: #999; text-decoration: none;">下载文件查看</a>
                                        </div>
                                    `;
                                }
                            } catch(e) {
                                // 跨域无法访问 contentDocument，说明 PDF 正常加载了，无需处理
                            }
                        };
                    }
                }
            }
        } else {
            // API返回错误，显示友好的错误界面
            const downloadUrl = `/api/documents/download/${encodeURIComponent(docId)}`;
            const errorMessage = escapeHtml(result.message || '预览加载失败');
            
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
            
            previewBody.innerHTML = `
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
    } catch (error) {
        console.error('渐进式预览加载失败:', error);
        // 显示友好的错误界面
        const downloadUrl = `/api/documents/download/${encodeURIComponent(docId)}`;
        previewBody.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); min-height: 400px; border-radius: 12px;">
                <div style="font-size: 64px; margin-bottom: 24px;">⚠️</div>
                <div style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 12px;">加载失败</div>
                <div style="font-size: 14px; color: #666; margin-bottom: 8px; text-align: center;">${escapeHtml(error.message || '网络错误或服务器无响应')}</div>
                <div style="font-size: 13px; color: #999; margin-bottom: 24px; text-align: center;">请检查网络连接后重试，或直接下载文件查看</div>
                <a href="${downloadUrl}" class="btn btn-primary" target="_blank" style="padding: 12px 32px; font-size: 14px; text-decoration: none; border-radius: 6px; background: #4f8ef7; color: white;">⬇️ 下载文件查看</a>
            </div>
        `;
    }
}

/**
 * 获取降级预览内容（原始方式）
 */
function getFallbackPreviewContent(docId, fileExt) {
    const viewUrl = `/api/documents/view/${encodeURIComponent(docId)}`;
    
    // 图片预览
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(fileExt)) {
        return `
            <div style="display: flex; justify-content: center; align-items: center; min-height: 400px; background: #f5f5f5;">
                <img src="${viewUrl}" class="preview-image" alt="预览图片" onerror="handlePreviewError(this)" style="max-width: 100%; max-height: 80vh; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            </div>
        `;
    }
    
    // PDF预览
    if (fileExt === 'pdf') {
        return `<iframe src="${viewUrl}" class="preview-iframe" frameborder="0" onerror="handlePreviewError(this)" style="width: 100%; height: 80vh; border: none;"></iframe>`;
    }
    
    // Office文档预览（走 view 接口，转换或降级）
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
        return `<iframe src="${viewUrl}" class="preview-iframe" frameborder="0" onerror="handlePreviewError(this)" style="width: 100%; height: 80vh; border: none;"></iframe>`;
    }
    
    // 其他文件类型
    return `
        <div class="preview-other" style="padding: 60px 20px; text-align: center;">
            <div class="file-icon" style="font-size: 64px; margin-bottom: 20px;">📄</div>
            <p style="color: #666; margin-bottom: 20px;">该文件类型不支持在线预览</p>
            <a href="${viewUrl}" class="btn btn-primary" target="_blank" style="padding: 10px 24px;">下载文件查看</a>
        </div>
    `;
}

/**
 * 根据文件类型生成预览内容（保留旧方法兼容性）
 */
function getPreviewContent(docId, fileExt) {
    return getFallbackPreviewContent(docId, fileExt);
}

/**
 * 处理预览错误
 */
function handlePreviewError(element) {
    // 显示文件不存在的提示
    const errorMessage = `
        <div class="preview-error">
            <div class="error-icon">❌</div>
            <h4>文件不存在</h4>
            <p>该文档的文件不存在，可能是因为原始文件被删除。</p>
            <button class="btn btn-danger" onclick="confirmDeleteDocument('${element.dataset.docId || element.src.split('/').pop()}')">删除此记录</button>
        </div>
    `;
    
    if (element.tagName === 'IMG') {
        element.style.display = 'none';
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-container';
        errorContainer.innerHTML = errorMessage;
        element.parentNode.appendChild(errorContainer);
    } else if (element.tagName === 'IFRAME') {
        element.style.display = 'none';
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-container';
        errorContainer.innerHTML = errorMessage;
        element.parentNode.appendChild(errorContainer);
    }
}

/**
 * 处理iframe加载
 */
function handleIframeLoad(iframe) {
    // 检查iframe内容是否是错误页面
    try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc.body && iframeDoc.body.innerHTML.includes('文件不存在')) {
            handlePreviewError(iframe);
        }
    } catch (e) {
        // 跨域错误，忽略
    }
}

/**
 * 处理下载点击
 */
function handleDownloadClick(event, link) {
    event.preventDefault();
    const url = link.href;
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    // 文件不存在
                    showConfirmModal(
                        '文件不存在',
                        '该文档的文件不存在，可能是因为原始文件被删除。建议删除此记录以避免错误。',
                        async () => {
                            // 获取文档ID
                            const docId = url.split('/').pop();
                            // 删除文档记录
                            try {
                                const deleteResponse = await fetch(`/api/documents/${docId}`, {
                                    method: 'DELETE'
                                });
                                const deleteResult = await deleteResponse.json();
                                
                                if (deleteResult.status === 'success') {
                                    showNotification('文档记录已删除', 'success');
                                    // 刷新文档列表
                                    if (appState.currentCycle) {
                                        await renderCycleDocuments(appState.currentCycle);
                                    }
                                } else {
                                    showNotification('删除失败: ' + deleteResult.message, 'error');
                                }
                            } catch (error) {
                                console.error('删除文档失败:', error);
                                showNotification('删除失败: ' + error.message, 'error');
                            }
                        }
                    );
                } else {
                    showNotification('下载失败: ' + response.statusText, 'error');
                }
                return;
            }
            // 下载成功，继续
            window.open(url, '_blank');
        })
        .catch(error => {
            console.error('下载失败:', error);
            showNotification('下载失败: ' + error.message, 'error');
        });
}

/**
 * 确认删除文档
 */
function confirmDeleteDocument(docId) {
    showConfirmModal(
        '确认删除',
        '该文档的文件不存在，建议删除此记录以避免错误。',
        async () => {
            // 删除文档记录
            try {
                const deleteResponse = await fetch(`/api/documents/${docId}`, {
                    method: 'DELETE'
                });
                const deleteResult = await deleteResponse.json();
                
                if (deleteResult.status === 'success') {
                    showNotification('文档记录已删除', 'success');
                    // 刷新文档列表
                    if (appState.currentCycle) {
                        await renderCycleDocuments(appState.currentCycle);
                    }
                    // 关闭预览模态框
                    const modal = document.getElementById('previewModal');
                    if (modal) {
                        modal.style.display = 'none';
                    }
                } else {
                    showNotification('删除失败: ' + deleteResult.message, 'error');
                }
            } catch (error) {
                console.error('删除文档失败:', error);
                showNotification('删除失败: ' + error.message, 'error');
            }
        }
    );
}

/**
 * 加载历史导入文档列表
 */
export async function loadImportedDocumentsList() {
    try {
        showLoading(true);
        const result = await loadImportedDocuments();
        
        if (result.status === 'success') {
            const documents = result.data || [];
            displayImportedDocuments(documents);
        } else {
            showNotification('加载历史导入文档失败', 'error');
        }
    } catch (error) {
        console.error('加载历史导入文档失败:', error);
        showNotification('加载失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 搜索历史导入文档
 */
export async function searchImportedFiles(keyword) {
    try {
        showLoading(true);
        const result = await searchImportedDocuments(keyword);
        
        if (result.status === 'success') {
            const documents = result.data || [];
            displayImportedDocuments(documents);
        } else {
            showNotification('搜索失败', 'error');
        }
    } catch (error) {
        console.error('搜索历史导入文档失败:', error);
        showNotification('搜索失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 显示导入的文档列表
 */
export function displayImportedDocuments(documents) {
    const zipFilesList = document.getElementById('zipFilesList');
    if (!zipFilesList) return;
    
    if (documents.length === 0) {
        zipFilesList.innerHTML = '<p class="placeholder">未找到匹配的文件</p>';
    } else {
        zipFilesList.innerHTML = documents.map(doc => {
            const isArchived = doc.archived || false;
            return `
                <div class="zip-file-item ${isArchived ? 'archived' : ''}" data-path="${doc.path}" data-name="${doc.name}">
                    <input type="checkbox" class="zip-file-checkbox" ${isArchived ? 'disabled' : ''} />
                    <span class="zip-file-name">${doc.name}</span>
                    <span class="zip-file-path">${doc.rel_path || doc.path}</span>
                </div>
            `;
        }).join('');
        
        // 添加复选框事件
        document.querySelectorAll('.zip-file-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', handleZipFileSelect);
        });
    }
}

/**
 * 初始化上传方式切换
 */
export function initUploadMethodTabs() {
    console.log('[initUploadMethodTabs] 开始初始化上传方式切换');
    
    // 上传方式切换（用 onclick 避免重复绑定）
    const methodTabBtns = document.querySelectorAll('.method-tab-btn');
    console.log('[initUploadMethodTabs] 找到 method-tab-btn 数量:', methodTabBtns.length);
    
    methodTabBtns.forEach(btn => {
        btn.onclick = function() {
            const tab = this.dataset.tab;
            console.log('[initUploadMethodTabs] 切换到标签页:', tab);
            
            // 更新按钮状态
            document.querySelectorAll('.method-tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 显示对应内容
            document.querySelectorAll('.method-tab-content').forEach(content => content.style.display = 'none');
            const tabEl = document.getElementById(tab + 'UploadTab');
            if (tabEl) {
                tabEl.style.display = 'block';
                console.log('[initUploadMethodTabs] 显示标签页元素:', tabEl.id);
                
                // 当切换到选择文档标签时，重新填充当前文档名并搜索
                if (tab === 'select') {
                    console.log('[initUploadMethodTabs] 切换到选择文档标签');
                    const currentDoc = appState.currentDocument;
                    console.log('[initUploadMethodTabs] 当前文档:', currentDoc);
                    
                    const keywordInput = document.getElementById('selectFileKeyword');
                    console.log('[initUploadMethodTabs] selectFileKeyword 元素:', keywordInput);
                    
                    if (keywordInput) {
                        keywordInput.value = currentDoc || '';
                        // 自动加载目录并搜索
                        if (currentDoc) {
                            console.log('[initUploadMethodTabs] 自动加载目录并搜索:', currentDoc);
                            loadDirectories().then(() => {
                                console.log('[initUploadMethodTabs] 目录加载成功，开始搜索');
                                searchFiles(currentDoc);
                            }).catch((error) => {
                                console.error('[initUploadMethodTabs] 目录加载失败，直接搜索:', error);
                                searchFiles(currentDoc);
                            });
                        } else {
                            // 如果没有当前文档，清空文件列表
                            const zipFilesList = document.getElementById('zipFilesList');
                            if (zipFilesList) {
                                zipFilesList.innerHTML = '<p class="placeholder">请输入关键字搜索文件</p>';
                            }
                        }
                    }
                }
            } else {
                console.error('标签页元素不存在:', tab + 'UploadTab');
            }
        };
    });

    // 加载目录按钮（用 onclick 避免重复绑定）
    const loadDirectoriesBtn = document.getElementById('loadDirectoriesBtn');
    console.log('[initUploadMethodTabs] loadDirectoriesBtn 元素:', loadDirectoriesBtn);
    if (loadDirectoriesBtn) {
        loadDirectoriesBtn.onclick = loadDirectories;
    }
    
    // 目录选择变化时自动刷新搜索结果
    const directorySelect = document.getElementById('directorySelect');
    console.log('[initUploadMethodTabs] directorySelect 元素:', directorySelect);
    if (directorySelect) {
        directorySelect.onchange = function() {
            const keyword = document.getElementById('selectFileKeyword')?.value;
            if (keyword) {
                searchFiles(keyword);
            }
        };
    }
    
    // 搜索文件按钮
    const searchFilesBtn = document.getElementById('searchFilesBtn');
    console.log('[initUploadMethodTabs] searchFilesBtn 元素:', searchFilesBtn);
    if (searchFilesBtn) {
        searchFilesBtn.onclick = function() {
            const keyword = document.getElementById('selectFileKeyword').value;
            searchFiles(keyword);
        };
    }
    
    // 自动搜索当前文档（先加载目录，再搜索）
    const currentDoc = appState.currentDocument;
    console.log('[initUploadMethodTabs] 自动搜索当前文档:', currentDoc);
    if (currentDoc) {
        const keywordInput = document.getElementById('selectFileKeyword');
        if (keywordInput) {
            keywordInput.value = currentDoc;
            // 自动加载目录并搜索
            loadDirectories().then(() => {
                searchFiles(currentDoc);
            }).catch(() => {
                searchFiles(currentDoc);
            });
        }
    }
    
    // 确认选择文件按钮
    const selectArchiveBtn = document.getElementById('selectArchiveBtn');
    console.log('[initUploadMethodTabs] selectArchiveBtn 元素:', selectArchiveBtn);
    if (selectArchiveBtn) {
        selectArchiveBtn.onclick = handleSelectArchive;
    }
    
    // 清空已选按钮
    const clearSelectedBtn = document.getElementById('clearSelectedBtn');
    console.log('[initUploadMethodTabs] clearSelectedBtn 元素:', clearSelectedBtn);
    if (clearSelectedBtn) {
        clearSelectedBtn.onclick = function() {
            import('./zip.js').then(module => {
                module.clearSelectedFiles();
            });
        };
    }
    
    // 批量操作按钮
    const batchEditBtn = document.getElementById('batchEditBtn');
    if (batchEditBtn) {
        batchEditBtn.addEventListener('click', handleBatchEdit);
    }
    
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', handleBatchDelete);
    }
    
    const batchMoveBtn = document.getElementById('batchMoveBtn');
    if (batchMoveBtn) {
        batchMoveBtn.addEventListener('click', handleBatchMove);
    }
    
    // 确认归档按钮
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.onclick = function(e) {
            e.preventDefault();
            handleUploadDocument(e);
        };
    }
    
    console.log('[initUploadMethodTabs] 初始化完成');
}

/**
 * 显示文档附加属性要求并动态生成表单
 */
function displayDocumentRequirements() {
    const requirementText = document.getElementById('requirementText');
    const dynamicDocInfo = document.getElementById('dynamicDocInfo');
    
    console.log('displayDocumentRequirements called');
    console.log('appState.projectConfig:', appState.projectConfig);
    console.log('appState.currentCycle:', appState.currentCycle);
    console.log('appState.currentDocument:', appState.currentDocument);
    
    // 从项目配置中获取文档要求
    let requirement = '';
    let attributes = [];
    
    if (appState.projectConfig && appState.currentCycle && appState.currentDocument) {
        console.log('All required appState properties are set');
        const cycleDocs = appState.projectConfig.documents[appState.currentCycle];
        console.log('cycleDocs:', cycleDocs);
        if (cycleDocs && cycleDocs.required_docs) {
            console.log('cycleDocs.required_docs exists:', cycleDocs.required_docs.length, 'docs');
            const docInfo = cycleDocs.required_docs.find(doc => doc.name === appState.currentDocument);
            console.log('docInfo:', docInfo);
            if (docInfo) {
                requirement = buildDisplayRequirementText(docInfo, appState.projectConfig);
                console.log('requirement:', requirement);
                attributes = buildUploadAttributeSchema(docInfo, appState.projectConfig);
                if (attributes.length === 0) {
                    attributes = parseRequirementAttributes(docInfo.requirement || requirement);
                }
                
                console.log('attributes:', attributes);
            } else {
                console.log('docInfo not found for document:', appState.currentDocument);
            }
        } else {
            console.log('cycleDocs or cycleDocs.required_docs not found');
        }
    } else {
        console.log('Missing required appState properties');
    }
    
    // 显示要求文本
    if (requirementText) {
        console.log('Updating requirementText to:', requirement);
        requirementText.textContent = requirement;
    }
    
    // 动态生成表单
    if (dynamicDocInfo) {
        console.log('Generating dynamic form with attributes:', attributes);
        generateDynamicForm(dynamicDocInfo, attributes);
    }
}

/**
 * 解析要求文本中的附加属性
 */
function parseRequirementAttributes(requirement) {
    const attributes = [];
    // 处理特殊情况：甲方提供 = 无特殊要求
    if (!requirement || requirement === '无特殊要求' || requirement === '甲方提供') return attributes;
    
    // 解析日期要求
    if (requirement.includes('文档日期') || requirement.includes('日期')) {
        // 检查是否需要精确到月份
        const isMonthOnly = requirement.includes('月份') || requirement.includes('年月');
        attributes.push({
            type: 'date',
            id: 'docDate',
            name: 'doc_date',
            label: '文档日期',
            monthOnly: isMonthOnly
        });
    }
    
    // 解析签字日期
    if (requirement.includes('签字日期') || requirement.includes('签署日期')) {
        const isMonthOnly = requirement.includes('月份') || requirement.includes('年月');
        attributes.push({
            type: 'date',
            id: 'signDate',
            name: 'sign_date',
            label: '签字日期',
            monthOnly: isMonthOnly
        });
    }
    
    // 解析签字人
    // 分别检查甲方签字、乙方签字和通用签字
    const hasPartyASign = requirement.includes('甲方签字');
    const hasPartyBSign = requirement.includes('乙方签字');
    const hasGeneralSign = requirement.includes('签字') || requirement.includes('签名');
    
    if (hasPartyASign || hasPartyBSign) {
        // 有明确的甲方或乙方签字要求
        if (hasPartyASign) {
            attributes.push({
                type: 'text',
                id: 'partyASigner',
                name: 'party_a_signer',
                label: '甲方签字人',
                placeholder: '输入甲方签字人名称'
            });
        }
        if (hasPartyBSign) {
            attributes.push({
                type: 'text',
                id: 'partyBSigner',
                name: 'party_b_signer',
                label: '乙方签字人',
                placeholder: '输入乙方签字人名称'
            });
        }
        // 添加"不涉及签字"选项
        attributes.push({
            type: 'checkbox',
            id: 'noSignature',
            name: 'no_signature',
            label: '不涉及签字',
            inline: true
        });
    } else if (hasGeneralSign) {
        // 只有通用的签字要求
        attributes.push({
            type: 'text',
            id: 'signer',
            name: 'signer',
            label: '签字人',
            placeholder: '输入签字人名称'
        });
        
        // 添加"不涉及签字"选项
        attributes.push({
            type: 'checkbox',
            id: 'noSignature',
            name: 'no_signature',
            label: '不涉及签字',
            inline: true
        });
    }
    
    // 解析盖章信息
    const sealTypes = [];
    if (requirement.includes('甲方盖章') || requirement.includes('甲方章')) {
        sealTypes.push({ id: 'partyASeal', name: 'party_a_seal', label: '甲方盖章' });
    }
    if (requirement.includes('乙方盖章') || requirement.includes('乙方章')) {
        sealTypes.push({ id: 'partyBSeal', name: 'party_b_seal', label: '乙方盖章' });
    }
    if (requirement.includes('盖章') && sealTypes.length === 0) {
        // 通用盖章
        sealTypes.push({ id: 'hasSeal', name: 'has_seal', label: '已盖章' });
    }
    
    if (sealTypes.length > 0) {
        attributes.push({
            type: 'checkbox_group',
            label: '盖章标记',
            options: sealTypes
        });
        
        // 添加"不涉及盖章"选项
        attributes.push({
            type: 'checkbox',
            id: 'noSeal',
            name: 'no_seal',
            label: '不涉及盖章',
            inline: true
        });
    }
    
    // 解析发文号
    if (requirement.includes('发文号') || requirement.includes('文号')) {
        attributes.push({
            type: 'text',
            id: 'docNumber',
            name: 'doc_number',
            label: '发文号',
            placeholder: '输入发文号'
        });
    }
    
    // 如果有其他盖章标注要求
    if (requirement.includes('其它') || requirement.includes('其他') || requirement.includes('标注')) {
        attributes.push({
            type: 'text',
            id: 'otherSeal',
            name: 'other_seal',
            label: '其它盖章（标注）',
            placeholder: '如：监理单位盖章、项目章等'
        });
    }
    
    return attributes;
}

/**
 * 动态生成表单
 */
function generateDynamicForm(container, attributes) {
    if (!container) return;
    
    // 如果没有特定属性要求，显示默认表单
    if (attributes.length === 0) {
        container.innerHTML = `
            <div class="form-row compact">
                <div class="form-group">
                    <label>文档日期</label>
                    <input type="text" id="docDate" name="doc_date" class="compact-input" placeholder="请输入日期，如：2026-03 或 2026-03-25" onblur="formatDateInput(this)">
                </div>
            </div>
        `;
        return;
    }
    
    let html = '';
    let currentRow = [];
    
    attributes.forEach((attr, index) => {
        if (attr.type === 'date') {
            // 日期字段 - 使用文本框，支持手动输入
            currentRow.push(`
                <div class="form-group">
                    <label>${attr.label}</label>
                    <input type="text" id="${attr.id}" name="${attr.name}" class="compact-input" placeholder="请输入日期，如：2026-03 或 2026-03-25" onblur="formatDateInput(this)">
                </div>
            `);
            
            // 每两个字段一行
            if (currentRow.length >= 2 || index === attributes.length - 1) {
                html += `<div class="form-row compact">${currentRow.join('')}</div>`;
                currentRow = [];
            }
        } else if (attr.type === 'text') {
            // 文本字段
            currentRow.push(`
                <div class="form-group">
                    <label>${attr.label}</label>
                    <input type="text" id="${attr.id}" name="${attr.name}" 
                           placeholder="${attr.placeholder || ''}" class="compact-input">
                </div>
            `);
            
            if (currentRow.length >= 2 || index === attributes.length - 1) {
                html += `<div class="form-row compact">${currentRow.join('')}</div>`;
                currentRow = [];
            }
        } else if (attr.type === 'checkbox' && attr.inline) {
            // 内联复选框
            currentRow.push(`
                <div class="form-group checkbox-inline compact">
                    <input type="checkbox" id="${attr.id}" name="${attr.name}">
                    <label for="${attr.id}">${attr.label}</label>
                </div>
            `);
            
            if (currentRow.length >= 2 || index === attributes.length - 1) {
                html += `<div class="form-row compact">${currentRow.join('')}</div>`;
                currentRow = [];
            }
        } else if (attr.type === 'checkbox_group') {
            // 先关闭当前行
            if (currentRow.length > 0) {
                html += `<div class="form-row compact">${currentRow.join('')}</div>`;
                currentRow = [];
            }
            
            // 复选框组 - 多列显示
            const optionsHtml = attr.options.map(opt => `
                <label class="checkbox-item compact">
                    <input type="checkbox" id="${opt.id}" name="${opt.name}">
                    <span>${opt.label}</span>
                </label>
            `).join('');
            
            html += `
                <div class="form-group compact">
                    <label>${attr.label}</label>
                    <div class="checkbox-group multi-column compact">
                        ${optionsHtml}
                    </div>
                </div>
            `;
        } else if (attr.type === 'checkbox') {
            // 普通复选框
            currentRow.push(`
                <div class="form-group checkbox-inline compact">
                    <input type="checkbox" id="${attr.id}" name="${attr.name}">
                    <label for="${attr.id}">${attr.label}</label>
                </div>
            `);
            
            if (currentRow.length >= 2 || index === attributes.length - 1) {
                html += `<div class="form-row compact">${currentRow.join('')}</div>`;
                currentRow = [];
            }
        }
    });
    
    // 处理剩余的行
    if (currentRow.length > 0) {
        html += `<div class="form-row compact">${currentRow.join('')}</div>`;
    }
    
    container.innerHTML = html;
}

/**
 * 加载目录
 */
async function loadDirectories() {
    console.log('[loadDirectories] 开始加载文档包目录');
    try {
        showLoading(true);
        
        if (!appState.currentProjectId || !appState.projectConfig) {
            console.error('[loadDirectories] 缺少项目信息:', { currentProjectId: appState.currentProjectId, projectConfig: appState.projectConfig });
            showNotification('请先选择项目', 'error');
            return;
        }
        
        console.log('[loadDirectories] 项目信息:', { currentProjectId: appState.currentProjectId, projectName: appState.projectConfig.name });
        
        // 尝试从API获取实际的上传目录
        const apiUrl = `/api/documents/directories?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}`;
        console.log('[loadDirectories] API请求URL:', apiUrl);
        
        const response = await fetch(apiUrl);
        console.log('[loadDirectories] API响应状态:', response.status);
        
        const result = await response.json();
        console.log('[loadDirectories] API响应:', result);
        
        const directorySelect = document.getElementById('directorySelect');
        console.log('[loadDirectories] directorySelect元素:', directorySelect);
        
        if (directorySelect) {
            directorySelect.innerHTML = '<option value="">-- 选择文档包 --</option>';
            
            if (result.status === 'success' && result.directories && result.directories.length > 0) {
                console.log('[loadDirectories] 找到', result.directories.length, '个文档包');
                result.directories.forEach((dir, index) => {
                    console.log(`[loadDirectories] 添加文档包 ${index}:`, dir);
                    const option = document.createElement('option');
                    option.value = dir.id;
                    option.textContent = dir.name;
                    directorySelect.appendChild(option);
                });
                console.log('[loadDirectories] 文档包加载完成，共', directorySelect.options.length, '个选项');
                // 强制刷新下拉框显示
                directorySelect.style.display = 'none';
                directorySelect.offsetHeight; // 触发重排
                directorySelect.style.display = '';
                showNotification('文档包加载成功', 'success');
            } else {
                console.log('[loadDirectories] 没有可用文档包:', { status: result.status, directories: result.directories });
                // 如果没有找到文档包，显示提示
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无可用文档包';
                option.disabled = true;
                directorySelect.appendChild(option);
                showNotification('暂无可用文档包，请先上传ZIP文档包', 'info');
            }
        } else {
            console.error('[loadDirectories] directorySelect元素不存在');
        }
    } catch (error) {
        console.error('加载文档包失败:', error);
        // 加载失败时显示提示
        const directorySelect = document.getElementById('directorySelect');
        if (directorySelect) {
            directorySelect.innerHTML = '<option value="">-- 选择文档包 --</option>';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '加载失败，请检查网络连接';
            option.disabled = true;
            directorySelect.appendChild(option);
        }
        showNotification('加载文档包失败，请检查网络连接', 'error');
    } finally {
        showLoading(false);
        console.log('[loadDirectories] 加载完成');
    }
}

/**
 * 自动搜索文件
 */
function autoSearchFiles() {
    const keywordInput = document.getElementById('selectFileKeyword');
    if (keywordInput) {
        const keyword = keywordInput.value;
        if (keyword.length > 1) {
            searchFiles(keyword);
        }
    }
}

/**
 * 搜索文件
 */
async function searchFiles(keyword) {
    console.log('[searchFiles] 开始搜索文件，关键字:', keyword);
    try {
        showLoading(true);
        
        if (!appState.currentProjectId || !appState.projectConfig) {
            console.error('[searchFiles] 缺少项目信息');
            showNotification('请先选择项目', 'error');
            return;
        }
        
        // 获取选中的文档包（可为空，空时搜索所有目录）
        const directorySelect = document.getElementById('directorySelect');
        const selectedPackageId = directorySelect ? directorySelect.value : '';
        console.log('[searchFiles] 选中的文档包:', selectedPackageId);
        
        // 从API搜索实际文件
        const apiUrl = `/api/documents/files/search?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}&directory=${encodeURIComponent(selectedPackageId)}&keyword=${encodeURIComponent(keyword || '')}`;
        console.log('[searchFiles] API请求URL:', apiUrl);
        
        const response = await fetch(apiUrl);
        console.log('[searchFiles] API响应状态:', response.status);
        
        const result = await response.json();
        console.log('[searchFiles] API响应:', result);
        
        if (result.status === 'success') {
            let files = result.files || [];
            console.log('[searchFiles] 搜索到', files.length, '个文件');
            
            // 如果搜索无结果但有关键词，则获取全部文件
            let noMatchHint = '';
            if (files.length === 0 && keyword) {
                noMatchHint = '<p class="placeholder" style="color:#ff9800;background:#fff3e0;padding:8px 12px;border-radius:4px;margin-bottom:10px;">⚠️ 无匹配结果，已显示全部文档</p>';
                // 重新调用API获取全部文件
                const allFilesUrl = `/api/documents/files/search?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}&directory=${encodeURIComponent(selectedPackageId)}&keyword=`;
                const allResponse = await fetch(allFilesUrl);
                const allResult = await allResponse.json();
                if (allResult.status === 'success') {
                    files = allResult.files || [];
                }
            }
            
            displaySelectedFiles(files, noMatchHint);
        } else {
            console.error('[searchFiles] 搜索失败:', result.message || '未知错误');
            showNotification('搜索失败: ' + (result.message || '未知错误'), 'error');
            displaySelectedFiles([]);
        }
    } catch (error) {
        console.error('搜索文件失败:', error);
        showNotification('搜索文件失败，请检查网络连接', 'error');
        displaySelectedFiles([]);
    } finally {
        showLoading(false);
        console.log('[searchFiles] 搜索完成');
    }
}

/**
 * 格式化路径显示，提取目录名
 * @param {string} path - 原始路径
 * @returns {string} 格式化后的目录名
 */
function formatPathDisplay(path) {
    if (!path) return '';
    
    // 统一使用正斜杠处理路径（处理Windows反斜杠）
    let formatted = path.replace(/\\/g, '/');
    
    // 移除 projects/xxx/uploads/ 前缀
    const uploadsMatch = formatted.match(/(?:projects\/[^\/]+\/uploads\/|uploads\/)(.*)/);
    if (uploadsMatch) {
        formatted = uploadsMatch[1];
    }
    
    // 移除文件名，只保留目录部分
    const lastSlashIndex = formatted.lastIndexOf('/');
    if (lastSlashIndex > 0) {
        formatted = formatted.substring(0, lastSlashIndex);
    } else if (lastSlashIndex === 0) {
        formatted = formatted.substring(1);
    }
    
    // 将路径分割成部分进行处理
    const parts = formatted.split('/');
    
    // 过滤掉包含随机ID的部分（通常是ZIP包解压后的顶层目录）
    const filteredParts = parts.filter(part => {
        // 如果部分包含看起来像随机ID的子串（10位以上字母数字混合），则跳过
        if (/[a-z0-9]{10,}/i.test(part) && !/^[^a-z0-9]*$/.test(part)) {
            // 但如果这部分全是中文，则保留
            if (/^[\u4e00-\u9fa5\d\.]+$/.test(part.replace(/[a-z0-9]{10,}/gi, ''))) {
                return true;
            }
            return false;
        }
        return true;
    });
    
    // 如果过滤后还有内容，使用过滤后的路径
    if (filteredParts.length > 0) {
        formatted = filteredParts.join(' / ');
    }
    
    return formatted || '根目录';
}

/**
 * 显示选择的文件列表（递归树状结构，支持展开/折叠/目录全选）
 */
export function displaySelectedFiles(files, noMatchHint = '') {
    const zipFilesList = document.getElementById('zipFilesList');
    if (!zipFilesList) return;
    
    if (!files || files.length === 0) {
        zipFilesList.innerHTML = '<p class="placeholder">未找到匹配的文件</p>';
        return;
    }
    
    // 直接委托给 zip.js 的树状渲染（通过动态 import）
    // 先把 files 放到临时变量，再调 zip.js 的渲染能力
    // 注意：此处 files 已经有 rel_dir 字段（来自后端返回），可直接使用
    // 如果没有 rel_dir，从 rel_path 推断
    const normalizedFiles = files.map(f => {
        if (!f.rel_dir && (f.rel_path || f.path)) {
            const relPath = (f.rel_path || f.path || '').replace(/\\/g, '/');
            const lastSlash = relPath.lastIndexOf('/');
            f = { ...f, rel_dir: lastSlash > 0 ? relPath.substring(0, lastSlash) : '' };
        }
        return f;
    });

    import('./zip.js').then(module => {
        // 临时覆盖 appState 并调用树渲染
        // 实际上我们复用 zip.js 的渲染，通过触发一次虚拟搜索来显示
        // 但这里有循环依赖风险，改为内联树渲染

        // 内联构建目录树
        function buildTree(fileList) {
            const root = { name: '', path: '', children: {}, files: [] };
            for (const file of fileList) {
                const relDir = (file.rel_dir || '').replace(/\\/g, '/');
                const parts = relDir ? relDir.split('/').filter(Boolean) : [];
                let node = root;
                let currentPath = '';
                for (const part of parts) {
                    currentPath = currentPath ? `${currentPath}/${part}` : part;
                    if (!node.children[part]) {
                        node.children[part] = { name: part, path: currentPath, children: {}, files: [] };
                    }
                    node = node.children[part];
                }
                node.files.push(file);
            }
            return root;
        }

        function escHtml(str) {
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        function collectFiles(node) {
            let result = [...node.files];
            for (const child of Object.values(node.children)) result = result.concat(collectFiles(child));
            return result;
        }

        function renderTree(node, depth) {
            let html = '';
            const indent = depth * 16;
            const childDirs = Object.values(node.children).sort((a,b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
            for (const dir of childDirs) {
                const escaped = dir.path.replace(/"/g,'&quot;');
                const allInDir = collectFiles(dir);
                const totalCount = allInDir.length;
                const selCount = allInDir.filter(f => appState.zipSelectedFiles && appState.zipSelectedFiles.some(sf => sf.path === f.path)).length;
                const dirChecked = totalCount > 0 && selCount === totalCount;
                const rootDirs = appState.zipRootDirectories || [];
                const isRoot = rootDirs.includes(dir.path);
                const rootBtnStyle = isRoot
                    ? 'background:#28a745;color:white;border:1px solid #1e7e34;'
                    : 'background:#fff;border:1px solid #28a745;color:#28a745;';
                const rootBtnText = isRoot ? '✓ 从此开始记录' : '从此开始记录目录';
                html += `
                <div class="directory-group" data-dir-group="${escaped}" style="margin-left:${indent}px;margin-bottom:4px;">
                    <div class="directory-header zip-dir-row" data-dir="${escaped}"
                         style="display:flex;align-items:center;gap:6px;padding:5px 10px;
                                background:linear-gradient(135deg,#e8f0fe,#f0f5ff);
                                border:1px solid #d0ddf5;border-radius:5px;
                                cursor:pointer;user-select:none;font-weight:600;color:#2c3e50;">
                        <span class="dir-toggle-icon" style="font-size:12px;transition:transform 0.18s;display:inline-block;min-width:14px;">▼</span>
                        <input type="checkbox" class="zip-dir-checkbox" data-dir="${escaped}"
                               ${dirChecked ? 'checked' : ''}
                               style="cursor:pointer;flex-shrink:0;"
                               onclick="event.stopPropagation();" />
                        <span style="flex:1;">📁 ${escHtml(dir.name)}</span>
                        <span style="color:#5a7fa8;font-size:11px;font-weight:normal;">(${selCount}/${totalCount})</span>
                        <button class="set-root-btn" data-dir="${dir.path}"
                                style="${rootBtnStyle}padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap;font-weight:bold;flex-shrink:0;"
                                onclick="event.stopPropagation(); window.setSelectRootDirectory('${dir.path.replace(/'/g, "\\'")}');">
                            ${rootBtnText}
                        </button>
                    </div>
                    <div class="zip-dir-children" data-dir-files="${escaped}" style="display:block;">
                        ${renderTree(dir, depth + 1)}
                    </div>
                </div>`;
            }
            // 当前目录的直属文件
            for (const file of [...node.files].sort((a,b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }))) {
                const isUsed = !!file.used; // 修正：使用 file.used 字段判断文件是否被使用
                const isSelected = appState.zipSelectedFiles && appState.zipSelectedFiles.some(sf => sf.path === file.path);
                const isDisabled = isUsed && !isSelected;  // 未被选中但已被使用才禁用
                const ePath = file.path.replace(/"/g,'&quot;');
                const eName = file.name.replace(/"/g,'&quot;');
                const eDir = (file.rel_dir || '').replace(/"/g,'&quot;');
                // 获取被哪些文档使用的信息
                const usedByList = file.used_by || [];
                const usedByTitle = usedByList.length > 0 ? usedByList.join('\n') : '';
                const usedByText = usedByList.length > 0 ? usedByList.join('、') : '';
                html += `
                <div class="zip-file-item ${isSelected ? 'selected' : ''} ${isUsed ? 'used' : ''}"
                     data-path="${ePath}" data-name="${eName}" data-dir="${eDir}"
                     style="margin-left:${indent+16}px;padding:4px 8px;margin-bottom:2px;border-radius:4px;
                            display:flex;align-items:center;gap:8px;
                            ${isSelected ? 'background:#e3f2fd;' : isUsed ? 'opacity:0.7;background:#f0f0f0;' : 'background:#fafafa;'}">
                    <input type="checkbox" class="zip-file-checkbox" ${isSelected?'checked':''} ${isDisabled?'disabled':''} style="flex-shrink:0;" />
                    <span style="flex:1;word-break:break-all;font-size:13px;line-height:1.4;" title="${eName}">📄 ${escHtml(file.name)}</span>
                    ${isUsed ? `<span style="background:#ff9800;color:white;padding:2px 5px;border-radius:3px;font-size:11px;flex-shrink:0;" title="被使用于:\n${usedByTitle}">已被使用</span>` : ''}
                    ${isUsed && usedByText ? `<span style="color:#666;font-size:11px;flex-shrink:0;" title="被使用于:\n${usedByTitle}">(${usedByText})</span>` : ''}
                </div>`;
            }
            return html;
        }

        const tree = buildTree(normalizedFiles);
        const treeHtml = renderTree(tree, 0);
        zipFilesList.innerHTML = `${noMatchHint}<div class="files-tree">${treeHtml || '<p class="placeholder">暂无文件</p>'}</div>`;

        // 绑定展开/折叠事件
        zipFilesList.querySelectorAll('.zip-dir-row').forEach(header => {
            header.addEventListener('click', function(e) {
                if (e.target.type === 'checkbox') return;
                const dirPath = this.dataset.dir;
                const container = Array.from(zipFilesList.querySelectorAll('.zip-dir-children'))
                    .find(el => el.dataset.dirFiles === dirPath);
                const icon = this.querySelector('.dir-toggle-icon');
                if (container) {
                    const collapsed = container.style.display === 'none';
                    container.style.display = collapsed ? 'block' : 'none';
                    if (icon) icon.style.transform = collapsed ? '' : 'rotate(-90deg)';
                }
            });
        });

        // 绑定目录复选框
        zipFilesList.querySelectorAll('.zip-dir-checkbox').forEach(cb => {
            cb.addEventListener('change', function(e) {
                module.handleZipDirTreeSelect ? module.handleZipDirTreeSelect(e) : (() => {
                    // fallback: 选中/取消该目录下所有文件
                    const dirPath = cb.dataset.dir;
                    const isChecked = cb.checked;
                    zipFilesList.querySelectorAll('.zip-file-item').forEach(item => {
                        const d = item.dataset.dir || '';
                        if (d !== dirPath && !d.startsWith(dirPath + '/')) return;
                        const fc = item.querySelector('.zip-file-checkbox');
                        if (!fc || fc.disabled) return;
                        const fp = item.dataset.path, fn = item.dataset.name, fd = item.dataset.dir || '';
                        if (isChecked) {
                            if (!fc.checked) {
                                fc.checked = true; item.classList.add('selected'); item.style.background='#e3f2fd';
                                if (appState.zipSelectedFiles && !appState.zipSelectedFiles.some(f=>f.path===fp))
                                    appState.zipSelectedFiles.push({path:fp,name:fn,source_dir:fd});
                            }
                        } else {
                            fc.checked = false; item.classList.remove('selected'); item.style.background='#fafafa';
                            if (appState.zipSelectedFiles) appState.zipSelectedFiles = appState.zipSelectedFiles.filter(f=>f.path!==fp);
                        }
                    });
                    module.updateZipSelectedInfo();
                    module.updateSelectAllButtonState();
                })();
            });
            // 设置 indeterminate
            const dirPath = cb.dataset.dir;
            const allInDir = Array.from(zipFilesList.querySelectorAll('.zip-file-item')).filter(item => {
                const d = item.dataset.dir || '';
                return d === dirPath || d.startsWith(dirPath + '/');
            });
            const enabled = allInDir.filter(i => !i.querySelector('.zip-file-checkbox')?.disabled);
            const checked = enabled.filter(i => i.querySelector('.zip-file-checkbox')?.checked);
            cb.indeterminate = checked.length > 0 && checked.length < enabled.length;
        });

        // 绑定文件复选框
        zipFilesList.querySelectorAll('.zip-file-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function(e) {
                module.handleZipFileSelect(e);
            });
        });

        module.updateZipSelectedInfo();
        module.updateSelectAllButtonState();
    });
}

/**
 * 处理ZIP目录选择（选择/取消选择整个目录）- 保留兼容旧代码
 */
function handleZipDirSelect(e) {
    import('./zip.js').then(module => {
        if (module.handleZipDirTreeSelect) {
            module.handleZipDirTreeSelect(e);
        }
    });
}

/**
 * 更新已选择文件数量
 */
function updateSelectedFilesCount() {
    // 这个函数现在由 zip.js 中的 updateZipSelectedInfo 函数替代
    // 保留此函数以兼容旧代码
    import('./zip.js').then(module => {
        module.updateZipSelectedInfo();
    });
}

/**
 * 处理选择文档归档
 */
async function handleSelectArchive() {
    const selectedFiles = appState.zipSelectedFiles;
    
    if (selectedFiles.length === 0) {
        showNotification('请先选择文件', 'error');
        return;
    }
    
    if (!appState.currentProjectId || !appState.projectConfig || !appState.currentCycle || !appState.currentDocument) {
        showNotification('请先选择项目、周期和文档类型', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        // 为每个文件补充目录信息（source_dir），供后端打包时建立子目录
        const rootDirs = (appState.zipRootDirectories || []).slice().sort((a, b) => b.length - a.length); // 最长的优先
        const hasRootDir = rootDirs.some(d => d); // 是否选择了根目录
        const filesWithDir = selectedFiles.map(file => {
            // 优先使用 appState 中已存的 source_dir，DOM 只作备用
            let sourceDir = file.source_dir;
            if (sourceDir === undefined) {
                const itemEl = document.querySelector(`#zipFilesList .zip-file-item[data-path="${CSS.escape(file.path)}"]`);
                sourceDir = itemEl ? (itemEl.dataset.dir || '') : '';
            }
            // 找到文件所属的最深选中目录，去掉前缀保留相对路径
            if (hasRootDir && sourceDir !== undefined) {
                let matched = false;
                for (const rootDir of rootDirs) {
                    if (!rootDir) continue;
                    const rootPrefix = rootDir.endsWith('/') ? rootDir : rootDir + '/';
                    if (sourceDir === rootDir) {
                        // 文件直接在该根目录下，用根目录最后一级名称作为分组标识
                        const parts = rootDir.split('/');
                        sourceDir = parts[parts.length - 1] || rootDir;
                        matched = true;
                        break;
                    } else if (sourceDir.startsWith(rootPrefix)) {
                        sourceDir = sourceDir.slice(rootPrefix.length);
                        matched = true;
                        break;
                    }
                }
                // 如果文件不在任何已选根目录下，也不传目录信息
                if (!matched) {
                    sourceDir = '';
                }
            } else if (!hasRootDir) {
                // 没有选择根目录时，不传目录信息（directory 将为 /）
                sourceDir = '';
            }
            return { ...file, source_dir: sourceDir };
        });
        
        const response = await fetch('/api/documents/files/select', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                project_name: appState.projectConfig.name,
                cycle: appState.currentCycle,
                doc_name: appState.currentDocument,
                files: filesWithDir,
                root_directory: hasRootDir ? rootDirs[0] : ''  // 传递选中的根目录
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification(`成功选择 ${selectedFiles.length} 个文件`, 'success');
            
            // 清空选中状态
            appState.zipSelectedFiles = [];
            import('./zip.js').then(module => {
                module.updateZipSelectedInfo();
            });
            
            // 关闭文档模态框
            closeModal(elements.documentModal);
            
            // 刷新文档列表
            if (appState.currentCycle) {
                await renderCycleDocuments(appState.currentCycle);
            }
        } else {
            showNotification('选择文件失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('选择文件失败:', error);
        showNotification('选择文件失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 打开上传模态框
 */
export function openUploadModal(cycle, docName) {
    console.log('[openUploadModal] 打开上传模态框:', { cycle, docName });
    
    appState.currentCycle = cycle;
    appState.currentDocument = docName;
    appState.zipRootDirectories = [];  // 每次打开弹窗重置根目录选择
    
    console.log('[openUploadModal] 更新appState:', { currentCycle: appState.currentCycle, currentDocument: appState.currentDocument });
    
    // 清理上传文件列表
    const uploadedFilesList = document.getElementById('uploadedFilesList');
    if (uploadedFilesList) {
        uploadedFilesList.innerHTML = '<p class="placeholder">暂无上传文件</p>';
    }
    // 清理文件输入框
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
    }
    
    // 打开第一个标签页（上传/选择文档）
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.main-tab-content').forEach(content => content.style.display = 'none');
    document.querySelector('.main-tab-btn[data-tab="upload-select"]').classList.add('active');
    document.getElementById('uploadSelectTab').style.display = 'block';
    
    // 更新周期和文档类型显示
    const currentCycleElement = document.getElementById('currentCycle');
    const currentDocumentElement = document.getElementById('currentDocument');
    if (currentCycleElement) currentCycleElement.textContent = cycle;
    if (currentDocumentElement) currentDocumentElement.textContent = docName;
    
    console.log('[openUploadModal] 初始化上传方式切换');
    // 初始化上传方式切换
    initUploadMethodTabs();
    
    // 初始化拖拽上传功能
    initDragAndDrop();
    
    // 打开模态框
    console.log('[openUploadModal] 打开模态框');
    openModal(elements.documentModal);
    
    // 显示文档附加属性要求（在模态框打开后调用）
    console.log('[openUploadModal] 显示文档附加属性要求');
    displayDocumentRequirements();
    
    console.log('[openUploadModal] 模态框打开完成');
}

/**
 * 打开维护模态框（切换到维护标签页）
 */
export function openMaintainModal(cycle, docName) {
    appState.currentCycle = cycle;
    appState.currentDocument = docName;
    // 打开第二个标签页（维护已选择文档）
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.main-tab-content').forEach(content => content.style.display = 'none');
    document.querySelector('.main-tab-btn[data-tab="maintain"]').classList.add('active');
    document.getElementById('maintainTab').style.display = 'block';
    
    // 更新周期和文档类型显示
    const currentCycleElement = document.getElementById('currentCycle');
    const currentDocumentElement = document.getElementById('currentDocument');
    if (currentCycleElement) currentCycleElement.textContent = cycle;
    if (currentDocumentElement) currentDocumentElement.textContent = docName;
    
    // 加载维护页面的文档
    loadMaintainDocuments();
    
    // 打开模态框
    openModal(elements.documentModal);
}

/**
 * 打开编辑模态框
 */
export async function openEditModal(docId, cycle, docName) {
    console.log('打开编辑模态框，文档ID:', docId, '周期:', cycle, '文档类型:', docName);
    
    // 保存当前周期和文档类型
    if (cycle && docName) {
        appState.currentCycle = cycle;
        appState.currentDocument = docName;
    }
    
    try {
        // 尝试从API获取文档信息（对docId做URL编码，防止特殊字符导致404）
        const encodedId = encodeURIComponent(docId);
        console.log('尝试从API获取文档信息:', `/api/documents/${encodedId}`);
        const response = await fetch(`/api/documents/${encodedId}`);
        console.log('API响应状态:', response.status);
        
        const result = await response.json();
        console.log('API响应结果:', result);
        
        if (result.status === 'success' && result.data) {
            const doc = result.data;
            console.log('获取到文档信息:', doc);
            
            // 填充编辑表单
            document.getElementById('editDocId').value = doc.doc_id || doc.id;
            
            // 动态生成编辑表单
            generateDynamicEditForm(doc, cycle, docName);
            
            // 打开编辑模态框
            const editModal = document.getElementById('editDocModal');
            if (editModal) {
                editModal.classList.add('show');
                document.body.style.overflow = 'hidden';
            }
        } else {
            console.error('获取文档信息失败:', result.message || '未知错误');
            showNotification('获取文档信息失败', 'error');
        }
    } catch (error) {
        console.error('获取文档信息失败:', error);
        showNotification('获取文档信息失败', 'error');
    }
}

/**
 * 动态生成编辑表单
 */
function generateDynamicEditForm(doc, cycle, docName) {
    const formContainer = document.getElementById('editDocForm');
    if (!formContainer) return;
    
    // 调试日志：查看 doc 对象内容
    console.log('[generateDynamicEditForm] 文档数据:', doc);
    console.log('[generateDynamicEditForm] 文档字段:', Object.keys(doc));
    
    // 从项目配置中获取文档要求
    let requirement = '';
    let attributes = [];
    
    console.log('[generateDynamicEditForm] appState.projectConfig:', appState.projectConfig);
    
    if (appState.projectConfig && cycle && docName) {
        const cycleDocs = appState.projectConfig.documents[cycle];
        console.log('[generateDynamicEditForm] cycleDocs:', cycleDocs);
        
        if (cycleDocs && cycleDocs.required_docs) {
            const docInfo = cycleDocs.required_docs.find(d => d.name === docName);
            console.log('[generateDynamicEditForm] docInfo:', docInfo);
            
            if (docInfo) {
                requirement = buildDisplayRequirementText(docInfo, appState.projectConfig);
                attributes = buildUploadAttributeSchema(docInfo, appState.projectConfig);
                if (attributes.length === 0) {
                    attributes = parseRequirementAttributes(docInfo.requirement || requirement);
                }

                getCustomAttributeDefinitions(appState.projectConfig, docInfo).forEach(attrDef => {
                    // 只显示本文档要求的自定义属性（docInfo.attributes 中标记为 true 的）
                    if (!(docInfo.attributes && docInfo.attributes[attrDef.id] === true)) return;
                    if (attributes.some(attr => attr.id === attrDef.id)) return;

                    if (attrDef.type === 'checkbox') {
                        attributes.push({
                            type: 'checkbox',
                            id: attrDef.id,
                            name: attrDef.id,
                            label: attrDef.name,
                            inline: true,
                            isCustom: true
                        });
                    } else {
                        attributes.push({
                            type: 'text',
                            id: attrDef.id,
                            name: attrDef.id,
                            label: attrDef.name,
                            placeholder: `输入${attrDef.name}`,
                            isCustom: true
                        });
                    }
                });
            }
        }
    }
    
    // 调试日志：查看属性列表
    console.log('[generateDynamicEditForm] 属性列表:', attributes);
    
    // 调试日志：查看属性列表
    console.log('[generateDynamicEditForm] 属性列表:', attributes);
    
    // 字段名映射：将 attr.name 转换为 doc 对象中的实际字段名（支持带下划线前缀）
    const getFieldValue = (fieldName) => {
        // 尝试直接获取
        if (doc[fieldName] !== undefined) return doc[fieldName];
        // 尝试带下划线前缀的字段名
        if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
        return '';
    };
    
    // 生成表单HTML - 使用表格布局，每行一对属性，确保水平对齐
    let formHtml = `
        <input type="hidden" id="editDocId" value="${doc.doc_id || doc.id}">
        <table class="edit-form-table">
    `;
    
    // 两两配对，每行显示两个属性
    for (let i = 0; i < attributes.length; i += 2) {
        const attr1 = attributes[i];
        const attr2 = attributes[i + 1];
        
        let rowHtml = '<tr>';
        
        // 第一个属性
        if (attr1) {
            // 获取实际值，支持带下划线前缀的字段名
            let actualValue = getFieldValue(attr1.name);
            console.log(`[generateDynamicEditForm] 字段 ${attr1.name}: 值 =`, actualValue);
            
            if (attr1.type === 'date') {
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell"><input type="date" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" ${attr1.isCustom ? `data-field-name="${attr1.name}"` : ''} value="${actualValue || ''}"></td>
                `;
            } else if (attr1.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" ${attr1.isCustom ? `data-field-name="${attr1.name}"` : ''} placeholder="${attr1.placeholder || ''}" value="${actualValue || ''}"></td>
                `;
            } else if (attr1.type === 'checkbox' && attr1.inline) {
                rowHtml += `
                    <td class="input-cell" colspan="2" style="padding: 4px 8px;">
                        <label class="checkbox-item" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="checkbox" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" ${attr1.isCustom ? `data-field-name="${attr1.name}"` : ''} ${actualValue ? 'checked' : ''}>
                            <span>${attr1.label}</span>
                        </label>
                    </td>
                `;
            } else if (attr1.type === 'checkbox_group') {
                const optionsHtml = attr1.options.map(opt => {
                    const optValue = getFieldValue(opt.name);
                    console.log(`[generateDynamicEditForm] 复选框字段 ${opt.name}: 值 =`, optValue);
                    return `
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${opt.id.charAt(0).toUpperCase() + opt.id.slice(1)}" ${optValue ? 'checked' : ''}>
                            <span>${opt.label}</span>
                        </label>
                    `;
                }).join('');
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell checkbox-group">${optionsHtml}</td>
                `;
            }
        } else {
            rowHtml += '<td colspan="2"></td>';
        }
        
        // 第二个属性
        if (attr2) {
            // 获取实际值，支持带下划线前缀的字段名
            let actualValue = getFieldValue(attr2.name);
            console.log(`[generateDynamicEditForm] 字段 ${attr2.name}: 值 =`, actualValue);
            
            if (attr2.type === 'date') {
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell"><input type="date" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" ${attr2.isCustom ? `data-field-name="${attr2.name}"` : ''} value="${actualValue || ''}"></td>
                `;
            } else if (attr2.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" ${attr2.isCustom ? `data-field-name="${attr2.name}"` : ''} placeholder="${attr2.placeholder || ''}" value="${actualValue || ''}"></td>
                `;
            } else if (attr2.type === 'checkbox' && attr2.inline) {
                rowHtml += `
                    <td class="input-cell" colspan="2" style="padding: 4px 8px;">
                        <label class="checkbox-item" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="checkbox" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" ${attr2.isCustom ? `data-field-name="${attr2.name}"` : ''} ${actualValue ? 'checked' : ''}>
                            <span>${attr2.label}</span>
                        </label>
                    </td>
                `;
            } else if (attr2.type === 'checkbox_group') {
                const optionsHtml = attr2.options.map(opt => {
                    const optValue = getFieldValue(opt.name);
                    console.log(`[generateDynamicEditForm] 复选框字段 ${opt.name}: 值 =`, optValue);
                    return `
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${opt.id.charAt(0).toUpperCase() + opt.id.slice(1)}" ${optValue ? 'checked' : ''}>
                            <span>${opt.label}</span>
                        </label>
                    `;
                }).join('');
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell checkbox-group">${optionsHtml}</td>
                `;
            }
        } else {
            rowHtml += '<td colspan="2"></td>';
        }
        
        rowHtml += '</tr>';
        formHtml += rowHtml;
    }
    
    // 所属目录行（支持移动/新建目录）
    const currentDir = doc.directory || doc.category || '/';
    const currentRootDir = doc.root_directory || '';
    formHtml += `
        <tr>
            <td class="label-cell"><label>所属目录</label></td>
            <td class="input-cell" colspan="3">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" id="editDirectory" placeholder="输入或选择目录路径" value="${currentDir}" style="flex: 1;">
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="pickEditDirectory()">选择</button>
                </div>
                <div style="margin-top: 4px; font-size: 12px; color: #666;">
                    显示根目录（可选，设为空则显示完整路径）:
                    <input type="text" id="editRootDirectory" placeholder="留空则不截断" value="${currentRootDir}" style="width: 60%; margin-left: 4px;">
                </div>
            </td>
        </tr>
    `;
    
    // 备注行
    // 备注字段可能存储在不同名称的字段中（大小写不敏感）
    const noteValue = doc.notes || doc.note || doc.doc_note || doc.remark || doc.remarks || doc.Remark || doc.Note || doc.NOTES || doc.REMARK || doc.REMARKS || '';
    formHtml += `
        <tr>
            <td class="label-cell"><label>备注</label></td>
            <td class="input-cell" colspan="3">
                <textarea id="editRemark" placeholder="输入备注信息" rows="3">${noteValue}</textarea>
            </td>
        </tr>
    `;
    
    // 操作按钮行
    formHtml += `
        <tr>
            <td colspan="4" class="action-cell">
                <button type="submit" class="btn btn-success">保存修改</button>
                <button type="button" class="btn btn-secondary" onclick="closeEditModal()">取消</button>
            </td>
        </tr>
    </table>
    `;
    
    // 更新表单内容
    formContainer.innerHTML = formHtml;
    
    // 用 onsubmit 赋值（覆盖旧绑定，避免重复触发）
    formContainer.onsubmit = handleEditDocument;
}

/**
 * 检查文档是否满足附加要求
 * @param {Object} doc - 已上传的文档对象
 * @param {string} requirement - 文档要求字符串
 * @param {Object} attributes - 文档属性要求对象
 * @returns {Array} - 缺失的要求列表
 */
function checkMissingRequirements(doc, requirement, attributes) {
    const missingRequirements = [];
    
    // 辅助函数：获取字段值（支持带下划线前缀）
    const getDocValue = (fieldName) => {
        if (doc[fieldName] !== undefined) return doc[fieldName];
        if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
        return null;
    };
    
    // 检查基于字符串的要求
    if (requirement) {
        // 检查签字要求（分别检查甲方签字和乙方签字）
        const hasPartyASignReq = requirement.includes('甲方签字');
        const hasPartyBSignReq = requirement.includes('乙方签字');
        const hasGeneralSignReq = requirement.includes('签字') && !hasPartyASignReq && !hasPartyBSignReq;
        
        // 检查甲方签字
        if (hasPartyASignReq && !getDocValue('party_a_signer') && !getDocValue('no_signature')) {
            missingRequirements.push('甲方签字');
        }
        // 检查乙方签字
        if (hasPartyBSignReq && !getDocValue('party_b_signer') && !getDocValue('no_signature')) {
            missingRequirements.push('乙方签字');
        }
        // 检查通用签字
        if (hasGeneralSignReq && !getDocValue('signer') && !getDocValue('no_signature')) {
            missingRequirements.push('签字');
        }
        
        // 检查盖章要求
        if (requirement.includes('乙方盖章') && !getDocValue('party_b_seal') && !getDocValue('no_seal')) {
            missingRequirements.push('乙方盖章');
        }
        if (requirement.includes('甲方盖章') && !getDocValue('party_a_seal') && !getDocValue('no_seal')) {
            missingRequirements.push('甲方盖章');
        }
        if (requirement.includes('盖章') && !getDocValue('has_seal_marked') && !getDocValue('has_seal') && !getDocValue('party_a_seal') && !getDocValue('party_b_seal') && !getDocValue('no_seal')) {
            missingRequirements.push('盖章');
        }
        
        // 检查日期要求
        if (requirement.includes('文档日期') && !getDocValue('doc_date')) {
            missingRequirements.push('文档日期');
        }
        if (requirement.includes('签字日期') && !getDocValue('sign_date')) {
            missingRequirements.push('签字日期');
        }
    }
    
    // 检查基于attributes对象的要求（包括自定义属性）
    if (attributes) {
        // 定义预定义属性的检查逻辑
        const predefinedAttrs = [
            { key: 'party_a_sign', name: '甲方签字', check: () => getDocValue('party_a_signer') || getDocValue('no_signature') || getDocValue('signer') },
            { key: 'party_b_sign', name: '乙方签字', check: () => getDocValue('party_b_signer') || getDocValue('no_signature') || getDocValue('signer') },
            { key: 'party_a_seal', name: '甲方盖章', check: () => getDocValue('party_a_seal') || getDocValue('has_seal_marked') || getDocValue('has_seal') || getDocValue('no_seal') },
            { key: 'party_b_seal', name: '乙方盖章', check: () => getDocValue('party_b_seal') || getDocValue('has_seal_marked') || getDocValue('has_seal') || getDocValue('no_seal') },
            { key: 'need_doc_date', name: '文档日期', check: () => getDocValue('doc_date') },
            { key: 'need_sign_date', name: '签字日期', check: () => getDocValue('sign_date') || getDocValue('no_signature') },
            { key: 'need_doc_number', name: '发文号', check: () => getDocValue('doc_number') }
        ];
        
        // 检查预定义属性
        for (const attr of predefinedAttrs) {
            if (attributes[attr.key] === true && !attr.check()) {
                // 只有当要求存在且未在基于字符串的检查中添加时，才添加到缺失列表
                if (!missingRequirements.includes(attr.name)) {
                    missingRequirements.push(attr.name);
                }
            }
        }
        
        // 检查自定义属性
        const predefinedKeys = new Set(predefinedAttrs.map(attr => attr.key));
        for (const [key, value] of Object.entries(attributes)) {
            if (value === true && !predefinedKeys.has(key)) {
                // 为自定义属性生成显示名称
                const displayName = key
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, char => char.toUpperCase());
                
                // 检查自定义属性是否满足
                const isCompleted = getDocValue(key) !== null && getDocValue(key) !== undefined && getDocValue(key) !== '';
                if (!isCompleted) {
                    missingRequirements.push(displayName);
                }
            }
        }
    }
    
    return missingRequirements;
}

async function requestArchiveApproval(cycle, docNames, approvalCode, newApprovalCode = '') {
    return await archiveProjectDocuments(appState.currentProjectId, cycle, docNames, approvalCode, newApprovalCode);
}

async function promptApprovalCodeForArchive(message, requireNewCode = false, approvers = null, skipCode = false) {
    return new Promise((resolve) => {
        const fields = [];
        if (approvers && approvers.length > 0) {
            fields.push({
                label: '选择审批人身份',
                key: 'approver_id',
                type: 'select',
                options: approvers.map(a => ({
                    value: String(a.id),
                    label: `${a.display_name ? a.username + '（' + a.display_name + '）' : a.username}（${a.role === 'admin' ? '系统管理员' : a.role === 'pmo' ? '项目管理组织' : a.role === 'pmo_leader' ? 'PMO负责人' : '项目经理'}${a.organization ? ' - ' + a.organization : ''}）`
                })),
                placeholder: '请选择你的身份'
            });
        }
        if (!skipCode) {
            fields.push(
                { label: '审批安全码', key: 'approval_code', type: 'password', placeholder: '输入审批安全码' }
            );
        }
        if (requireNewCode) {
            fields.push({ label: '新审批安全码', key: 'new_approval_code', type: 'password', placeholder: '至少8位，包含字母和数字' });
        }
        showInputModal(message, fields, resolve);
    });
}

/**
 * 弹出选择审批人的模态框（用于提交归档审核）
 */
async function promptSelectApprovers(approvers) {
    console.log('[DEBUG] promptSelectApprovers called with approvers:', approvers);
    return new Promise((resolve) => {
        // 构建 checkbox 列表
        let html = `<div style="margin-bottom:15px;color:#666;font-size:13px;">选择接收归档审批通知的项目经理：</div>`;
        html += `<div style="max-height:250px;overflow-y:auto;">`;
        for (const a of approvers) {
            const roleLabel = a.role === 'admin' ? '系统管理员' : a.role === 'pmo' ? '项目管理组织' : '项目经理';
            const orgLabel = a.organization ? ` - ${a.organization}` : '';
            html += `<label style="display:flex;align-items:center;padding:6px 8px;border-radius:4px;cursor:pointer;margin-bottom:4px;background:#f8f9fa;">
                <input type="checkbox" value="${a.id}" checked style="margin-right:8px;">
                <span>${a.display_name ? a.username + '（' + a.display_name + '）' : a.username}（${roleLabel}${orgLabel}）</span>
            </label>`;
        }
        html += `</div>`;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:450px;">
                <div class="modal-header"><h3>选择审批人</h3></div>
                <div class="modal-body">${html}</div>
                <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary" id="approver-cancel-btn">取消</button>
                    <button type="button" class="btn btn-primary" id="approver-confirm-btn">提交审核</button>
                </div>
            </div>
        `;
        console.log('[DEBUG] Appending modal to document.body');
        document.body.appendChild(modal);
        console.log('[DEBUG] Modal appended, attaching event listeners');

        const cancelBtn = modal.querySelector('#approver-cancel-btn');
        const confirmBtn = modal.querySelector('#approver-confirm-btn');

        if (!cancelBtn || !confirmBtn) {
            console.error('[ERROR] Modal buttons not found!');
            resolve(null);
            return;
        }

        cancelBtn.onclick = () => {
            console.log('[DEBUG] Cancel button clicked');
            modal.remove();
            resolve(null);
        };
        confirmBtn.onclick = () => {
            const checked = Array.from(modal.querySelectorAll('input[type=checkbox]:checked'))
                .map(cb => Number(cb.value));
            console.log('[DEBUG] Confirm button clicked, selected approvers:', checked);
            modal.remove();
            resolve(checked);
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        });

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', escHandler);
                if (document.body.contains(modal)) {
                    modal.remove();
                    resolve(null);
                }
            }
        };
        document.addEventListener('keydown', escHandler);
        console.log('[DEBUG] Event listeners attached');
    });
}

/**
 * 提交归档审核请求（新流程）
 */
async function submitArchiveReview(cycle, docNames) {
    try {
        console.log('[DEBUG] submitArchiveReview - NEW TWO-LEVEL WORKFLOW - cycle:', cycle, 'docNames:', docNames, 'projectId:', appState.currentProjectId);

        // 直接提交，无需approver选择 - 系统自动路由到Level 1
        console.log('[DEBUG] Auto-routing to Level 1 approvers (project manager)');
        const result = await submitArchiveRequest(appState.currentProjectId, cycle, docNames, []);
        console.log('[DEBUG] submitArchiveRequest result:', result);

        if (result.status === 'success') {
            showNotification('归档审核请求已提交，等待项目经理审批', 'success');
            await reloadProjectAndRender(cycle);

            // 快速审批：如果只有一个 Level 1 审批人，提供快速审批入口
            if (result.approval_id) {
                try {
                    const approversResult = await getArchiveApprovers(appState.currentProjectId, result.approval_id);
                    if (approversResult.status === 'success' && approversResult.approvers?.length === 1) {
                        const pmName = approversResult.approvers[0].username;
                        showConfirmModal('快速审批',
                            `检测到仅有一位项目经理 "${pmName}" 可审批此请求。\n如项目经理在场，可由其输入审批安全码快速完成第一级审批。\n\n是否现在进行快速审批？`,
                            async () => {
                                const requireCode = appState.systemSettings?.require_approval_code !== false;
                                let approvalCode = '';
                                if (requireCode) {
                                    const codeInput = await promptApprovalCodeForArchive('项目经理快速审批 - 请输入审批安全码');
                                    if (!codeInput?.approval_code) return;
                                    approvalCode = codeInput.approval_code;
                                }
                                const approveResult = await approveArchiveRequest(
                                    appState.currentProjectId, result.approval_id,
                                    approversResult.approvers[0].id, approvalCode
                                );
                                if (approveResult.status === 'success') {
                                    showNotification('🎉 所有审批完成，文档已归档', 'success');
                                } else if (approveResult.status === 'stage_approved') {
                                    showNotification(approveResult.message || '第一级审批已通过，等待PMO审批', 'info');
                                } else if (approveResult.status === 'needs_change') {
                                    const updatedInput = await promptApprovalCodeForArchive('首次使用审批安全码，请输入当前登录密码并设置新审批安全码', true);
                                    if (updatedInput?.approval_code && updatedInput?.new_approval_code) {
                                        const retryResult = await approveArchiveRequest(
                                            appState.currentProjectId, result.approval_id,
                                            approversResult.approvers[0].id, updatedInput.approval_code, updatedInput.new_approval_code
                                        );
                                        if (retryResult.status === 'success' || retryResult.status === 'stage_approved') {
                                            showNotification(retryResult.message || '审批完成', 'success');
                                        } else {
                                            showNotification(retryResult.message || '审批失败', 'error');
                                        }
                                    }
                                } else {
                                    showNotification(approveResult.message || '快速审批失败', 'error');
                                }
                                await reloadProjectAndRender(cycle);
                            }
                        );
                    }
                } catch (e) {
                    console.warn('快速审批检查失败（不影响提交）:', e);
                }
            }
        } else if (result.status !== 'cancelled') {
            console.error('[ERROR] Archive submission failed:', result);
            showNotification(result.message || '提交审核失败', 'error');
        }
        return result;
    } catch (error) {
        console.error('[ERROR] submitArchiveReview exception:', error);
        showNotification('提交审核失败: ' + error.message, 'error');
        return { status: 'error', message: error.message };
    }
}

/**
 * 快速审批归档请求（项目经理在文档页面操作）
 */
async function quickApproveArchive(approvalId, action = 'approve') {
    // 获取当前阶段的审批人（按 approval_id 过滤）
    const approversResult = await getArchiveApprovers(appState.currentProjectId, approvalId);
    if (approversResult.status !== 'success' || !approversResult.approvers?.length) {
        showNotification('获取审批人信息失败', 'error');
        return { status: 'error' };
    }

    const title = action === 'approve' ? '审批通过 - 请验证身份' : '驳回归档 - 请验证身份';
    let approvalInput;

    // 检查是否需要审批安全码
    const requireCode = appState.systemSettings?.require_approval_code !== false;

    // 自动匹配当前登录用户
    const currentUserId = authState.user?.id;
    const currentUsername = authState.user?.username;
    let matchedApprover = null;
    if (currentUserId) {
        matchedApprover = approversResult.approvers.find(a => String(a.id) === String(currentUserId));
    }
    if (!matchedApprover && currentUsername) {
        matchedApprover = approversResult.approvers.find(a => a.username === currentUsername);
    }

    if (!requireCode) {
        // 不需要安全码，自动选择审批人
        if (matchedApprover) {
            approvalInput = { approver_id: String(matchedApprover.id), approval_code: '__skip__' };
        } else if (approversResult.approvers.length === 1) {
            approvalInput = { approver_id: String(approversResult.approvers[0].id), approval_code: '__skip__' };
        } else {
            // 无法自动匹配，选择身份不输安全码
            approvalInput = await promptApprovalCodeForArchive(title, false, approversResult.approvers, true);
            if (!approvalInput) return { status: 'cancelled' };
            approvalInput.approval_code = '__skip__';
        }
    } else if (matchedApprover || approversResult.approvers.length === 1) {
        // 自动匹配或单一审批人，只需输入安全码
        approvalInput = await promptApprovalCodeForArchive(title, false, null);
        if (!approvalInput || !approvalInput.approval_code) {
            return { status: 'cancelled' };
        }
        approvalInput.approver_id = String(matchedApprover ? matchedApprover.id : approversResult.approvers[0].id);
    } else {
        // 多个审批人且无法自动匹配，显示选择下拉框 + 安全码
        approvalInput = await promptApprovalCodeForArchive(title, false, approversResult.approvers);
        if (!approvalInput || !approvalInput.approval_code) {
            return { status: 'cancelled' };
        }
    }

    let rejectReason = '';
    if (action === 'reject') {
        rejectReason = await new Promise((resolve) => {
            showInputModal('请输入驳回原因', [
                { label: '驳回原因', key: 'reason', type: 'text', placeholder: '可选' }
            ], (val) => resolve(val?.reason || ''));
        });
    }

    const approverId = approvalInput.approver_id;
    const approvalCode = requireCode ? approvalInput.approval_code : '';

    let result;
    if (action === 'approve' || action === 'approve_finalize') {
        const completeNow = action === 'approve_finalize';
        result = await approveArchiveRequest(appState.currentProjectId, approvalId, approverId, approvalCode, '', completeNow);
    } else {
        result = await rejectArchiveRequest(appState.currentProjectId, approvalId, approverId, approvalCode, '', rejectReason);
    }

    // 处理 needs_change（仅在需要安全码时触发）
    if (result.status === 'needs_change' && requireCode) {
        const updatedInput = await promptApprovalCodeForArchive(
            '首次使用审批安全码，请输入当前登录密码并设置新审批安全码',
            true, approversResult.approvers
        );
        if (!updatedInput || !updatedInput.approval_code || !updatedInput.new_approval_code) {
            return { status: 'cancelled' };
        }
        if (action === 'approve' || action === 'approve_finalize') {
            result = await approveArchiveRequest(
                appState.currentProjectId, approvalId,
                updatedInput.approver_id, updatedInput.approval_code, updatedInput.new_approval_code,
                action === 'approve_finalize'
            );
        } else {
            result = await rejectArchiveRequest(
                appState.currentProjectId, approvalId,
                updatedInput.approver_id, updatedInput.approval_code, updatedInput.new_approval_code, rejectReason
            );
        }
    }

    return result;
}

async function ensureArchiveApproval(cycle, docNames) {
    if (!authState.isAuthenticated || !['project_admin', 'admin', 'pmo'].includes(authState.user?.role)) {
        showNotification('只有项目经理或管理员才能执行归档操作', 'error');
        return { status: 'error', message: '权限不足' };
    }

    let approvalInput = await promptApprovalCodeForArchive('请输入审批安全码以继续归档');
    if (!approvalInput || !approvalInput.approval_code) {
        return { status: 'cancelled', message: '未输入审批安全码' };
    }

    let result = await requestArchiveApproval(cycle, docNames, approvalInput.approval_code);
    if (result.status === 'needs_change') {
        const updatedInput = await promptApprovalCodeForArchive('首次使用审批安全码，请输入当前登录密码并设置新审批安全码', true);
        if (!updatedInput || !updatedInput.approval_code || !updatedInput.new_approval_code) {
            return { status: 'cancelled', message: '未完成审批安全码重置' };
        }
        result = await requestArchiveApproval(cycle, docNames, updatedInput.approval_code, updatedInput.new_approval_code);
    }
    return result;
}

/**
 * 归档文档
 */
export async function archiveDocument(cycle, docName) {
    try {
        // 获取当前周期的文档配置
        const docsInfo = appState.projectConfig.documents?.[cycle];
        if (!docsInfo) {
            showNotification('文档配置不存在', 'error');
            return { status: 'error', message: '文档配置不存在' };
        }
        
        // 查找当前文档类型的要求
        const docConfig = (docsInfo.required_docs || []).find(d => 
            (typeof d === 'object' ? d.name : d) === docName
        );
        const requirement = docConfig?.requirement || '';
        
        // 获取已上传的该类型文档列表
        const uploadedDocs = await getCycleDocuments(cycle);
        const docTypeFiles = uploadedDocs.filter(d => d.doc_name === docName);
        
        // 检查是否有文档不满足要求
        const unmetDocs = [];
        for (const doc of docTypeFiles) {
            const missing = checkMissingRequirements(doc, requirement);
            if (missing.length > 0) {
                unmetDocs.push({
                    filename: doc.original_filename || doc.filename,
                    missing: missing
                });
            }
        }
        
        // 如果有文档不满足要求，提示用户确认
        if (unmetDocs.length > 0) {
            const unmetList = unmetDocs.map(d => 
                `• ${d.filename}：缺少 ${d.missing.join('、')}`
            ).join('\n');
            
            const confirmed = await new Promise((resolve) => {
                showConfirmModal(
                    '确认归档',
                    `以下文档未满足附加要求：<br><br>${unmetList.replace(/\n/g, '<br>')}<br><br>是否确认归档？`,
                    () => resolve(true),
                    () => resolve(false),
                    { allowHtml: true }
                );
            });
            
            if (!confirmed) {
                return { status: 'cancelled', message: '用户取消归档' };
            }
        }

        // 判断用户角色决定归档方式
        const userRole = authState.user?.role;
        if (['admin', 'pmo', 'project_admin'].includes(userRole)) {
            // 项目经理/管理员：可选择直接归档或提交审核
            const actionChoice = await new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content" style="max-width:420px;">
                        <div class="modal-header"><h3>选择归档方式</h3></div>
                        <div class="modal-body">
                            <p>• <b>直接归档</b>：输入审批安全码立即归档</p>
                            <p>• <b>提交审核</b>：提交归档审核请求，等待审批</p>
                        </div>
                        <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;">
                            <button class="btn btn-secondary" id="archive-cancel">取消</button>
                            <button class="btn btn-info" id="archive-review">提交审核</button>
                            <button class="btn btn-primary" id="archive-direct">直接归档</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.querySelector('#archive-cancel').onclick = () => { modal.remove(); resolve('cancel'); };
                modal.querySelector('#archive-review').onclick = () => { modal.remove(); resolve('review'); };
                modal.querySelector('#archive-direct').onclick = () => { modal.remove(); resolve('direct'); };
            });

            if (actionChoice === 'cancel') {
                return { status: 'cancelled', message: '用户取消归档' };
            }

            if (actionChoice === 'direct') {
                const result = await ensureArchiveApproval(cycle, [docName]);
                if (result.status !== 'success') {
                    if (result.status === 'cancelled') { showNotification('归档已取消', 'warning'); return result; }
                    showNotification(result.message || '归档审批失败', 'error');
                    return result;
                }
                showNotification('文档归档成功', 'success');
                await reloadProjectAndRender(cycle);
                import('./cycle.js').then(module => { module.refreshCycleProgress(); });
                return result;
            }

            // 提交审核
            const result = await submitArchiveReview(cycle, [docName]);
            if (result.status === 'success') {
                showNotification('归档审核请求已提交，等待审批', 'success');
                await reloadProjectAndRender(cycle);
            } else if (result.status !== 'cancelled') {
                showNotification(result.message || '提交审核失败', 'error');
            }
            return result;
        } else {
            // 普通用户：只能提交审核
            console.log('[DEBUG] Regular contractor - submitting archive review. User role:', authState.user?.role);
            const result = await submitArchiveReview(cycle, [docName]);
            console.log('[DEBUG] Archive review result:', result);
            if (result.status === 'success') {
                showNotification('归档审核请求已提交，等待项目经理审批', 'success');
                await reloadProjectAndRender(cycle);
            } else if (result.status !== 'cancelled') {
                console.error('[ERROR] Archive review failed:', result);
                showNotification(result.message || '提交审核失败', 'error');
            }
            return result;
        }
    } catch (error) {
        console.error('[ERROR] archiveDocument exception:', error, error.stack);
        showNotification('归档失败: ' + error.message, 'error');
        return { status: 'error', message: error.message };
    }
}

/**
 * 一键归档当前周期内所有符合要求的文档
 * @param {string} cycle - 周期名称
 */
export async function batchArchiveCycle(cycle) {
    try {
        // 获取当前周期的文档配置
        const docsInfo = appState.projectConfig.documents?.[cycle];
        if (!docsInfo) {
            showNotification('文档配置不存在', 'error');
            return;
        }
        
        // 获取已上传的文档列表
        const uploadedDocs = await getCycleDocuments(cycle);
        
        // 找出所有未归档且有文件的文档类型
        const requiredDocs = docsInfo.required_docs || [];
        const archivedDocs = appState.projectConfig.documents_archived?.[cycle] || {};
        
        // 筛选出可以归档的文档类型（未归档且有文件）
        const docsToArchive = [];
        const docsWithMissingRequirements = [];
        
        for (const docConfig of requiredDocs) {
            const docName = typeof docConfig === 'object' ? docConfig.name : docConfig;
            
            // 跳过已归档的
            if (archivedDocs[docName]) continue;
            
            // 获取该文档类型的文件
            const docTypeFiles = uploadedDocs.filter(d => d.doc_name === docName);
            
            // 如果没有文件，跳过
            if (docTypeFiles.length === 0) continue;
            
            // 检查是否满足要求
            const requirement = docConfig?.requirement || '';
            let hasMissingRequirements = false;
            const unmetFiles = [];
            
            for (const doc of docTypeFiles) {
                const missing = checkMissingRequirements(doc, requirement);
                if (missing.length > 0) {
                    hasMissingRequirements = true;
                    unmetFiles.push({
                        filename: doc.original_filename || doc.filename,
                        missing: missing
                    });
                }
            }
            
            if (hasMissingRequirements) {
                docsWithMissingRequirements.push({
                    docName,
                    unmetFiles
                });
            } else {
                docsToArchive.push(docName);
            }
        }
        
        // 如果没有可归档的文档
        if (docsToArchive.length === 0 && docsWithMissingRequirements.length === 0) {
            showNotification('当前周期没有需要归档的文档', 'info');
            return;
        }
        
        // 构建确认消息
        let confirmMessage = '';
        
        if (docsToArchive.length > 0) {
            confirmMessage += `<div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #28a745; margin-bottom: 8px;">以下 ${docsToArchive.length} 个文档类型将被归档：</div>
                <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                    ${docsToArchive.map(name => `<span style="background: #d4edda; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${name}</span>`).join('')}
                </div>
            </div>`;
        }
        
        if (docsWithMissingRequirements.length > 0) {
            confirmMessage += `<div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #856404; margin-bottom: 8px;">
                    以下 ${docsWithMissingRequirements.length} 个文档类型未满足要求，将不会被归档：
                </div>
                <div style="max-height: 150px; overflow-y: auto;">
                    ${docsWithMissingRequirements.map(item => `
                        <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 5px; font-size: 12px;">
                            <div style="font-weight: bold;">${item.docName}</div>
                            ${item.unmetFiles.map(f => `<div style="margin-left: 10px; color: #666;">• ${f.filename}：缺少 ${f.missing.join('、')}</div>`).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        if (docsToArchive.length === 0) {
            showNotification('当前周期没有满足归档条件的文档类型', 'info');
            return;
        }
        
        confirmMessage += '<div style="color: #666; font-size: 12px;">确认要开始一键归档吗？</div>';
        
        // 显示确认对话框
        const confirmed = await new Promise((resolve) => {
            showConfirmModal(
                '一键归档确认',
                confirmMessage,
                () => resolve(true),
                () => resolve(false),
                { allowHtml: true }
            );
        });
        
        if (!confirmed) {
            return;
        }
        
        // 判断用户角色决定归档方式
        const userRole = authState.user?.role;

        if (['admin', 'pmo', 'project_admin'].includes(userRole)) {
            // 项目经理/管理员：可选择直接归档或提交审核
            const actionChoice = await new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content" style="max-width:420px;">
                        <div class="modal-header"><h3>选择批量归档方式</h3></div>
                        <div class="modal-body">
                            <p>• <b>直接归档</b>：输入审批安全码立即归档所有文档</p>
                            <p>• <b>提交审核</b>：提交归档审核请求，等待审批</p>
                        </div>
                        <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;">
                            <button class="btn btn-secondary" id="batch-cancel">取消</button>
                            <button class="btn btn-info" id="batch-review">提交审核</button>
                            <button class="btn btn-primary" id="batch-direct">直接归档</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.querySelector('#batch-cancel').onclick = () => { modal.remove(); resolve('cancel'); };
                modal.querySelector('#batch-review').onclick = () => { modal.remove(); resolve('review'); };
                modal.querySelector('#batch-direct').onclick = () => { modal.remove(); resolve('direct'); };
            });

            if (actionChoice === 'cancel') return;

            showLoading(true);
            try {
                if (actionChoice === 'direct') {
                    const result = await ensureArchiveApproval(cycle, docsToArchive);
                    if (result.status === 'success') {
                        showNotification(`成功归档 ${docsToArchive.length} 个文档类型`, 'success');
                        await reloadProjectAndRender(cycle);
                        import('./cycle.js').then(module => { module.refreshCycleProgress(); });
                    } else if (result.status === 'cancelled') {
                        showNotification('归档已取消', 'warning');
                    } else {
                        showNotification(result.message || '归档审批失败', 'error');
                    }
                } else {
                    const result = await submitArchiveReview(cycle, docsToArchive);
                    if (result.status === 'success') {
                        showNotification(`已提交 ${docsToArchive.length} 个文档类型的归档审核请求`, 'success');
                        await reloadProjectAndRender(cycle);
                    } else if (result.status !== 'cancelled') {
                        showNotification(result.message || '提交审核失败', 'error');
                    }
                }
            } catch (error) {
                console.error('批量归档失败:', error);
                showNotification('归档失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        } else {
            // 普通用户：只能提交审核
            showLoading(true);
            try {
                const result = await submitArchiveReview(cycle, docsToArchive);
                if (result.status === 'success') {
                    showNotification(`已提交 ${docsToArchive.length} 个文档类型的归档审核请求，等待项目经理审批`, 'success');
                    await reloadProjectAndRender(cycle);
                } else if (result.status !== 'cancelled') {
                    showNotification(result.message || '提交审核失败', 'error');
                }
            } catch (error) {
                console.error('批量提交审核失败:', error);
                showNotification('提交审核失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    } catch (error) {
        console.error('一键归档失败:', error);
        showNotification('一键归档失败: ' + error.message, 'error');
        showLoading(false);
    }
}

/**
 * 取消归档文档
 */
export async function unarchiveDocument(cycle, docName) {
    try {
        const requiresApproval = !!appState.projectConfig?.unarchive_requires_approval;

        // 开启“撤销归档审批”时，走审批流程
        if (requiresApproval) {
            const result = await submitArchiveRequest(
                appState.currentProjectId,
                cycle,
                [docName],
                [],
                'unarchive'
            );
            if (result.status === 'success') {
                showNotification(result.message || '已提交撤销归档审批请求，等待审批', 'success');
                await reloadProjectAndRender(cycle);
            } else {
                showNotification(result.message || '提交撤销归档审批失败', 'error');
            }
            return;
        }

        // 未开启审批时：保持原有直接撤销归档行为
        if (appState.projectConfig.documents_archived && appState.projectConfig.documents_archived[cycle]) {
            delete appState.projectConfig.documents_archived[cycle][docName];

            if (Object.keys(appState.projectConfig.documents_archived[cycle]).length === 0) {
                delete appState.projectConfig.documents_archived[cycle];
            }

            if (Object.keys(appState.projectConfig.documents_archived).length === 0) {
                delete appState.projectConfig.documents_archived;
            }
        }

        const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.projectConfig)
        });

        if (response.ok) {
            showNotification('取消归档成功', 'success');
            await reloadProjectAndRender(cycle);
            import('./cycle.js').then(module => {
                module.refreshCycleProgress();
            });
        } else {
            showNotification('取消归档失败', 'error');
        }
    } catch (error) {
        console.error('取消归档文档失败:', error);
        showNotification('取消归档失败: ' + error.message, 'error');
    }
}

/**
 * 快速审批/驳回归档请求操作（供 onclick 调用）
 */
async function handleQuickApproveAction(approvalId, action, cycle) {
    try {
        const result = await quickApproveArchive(approvalId, action);

        if (result.status === 'success') {
            // 所有阶段完成，文档已归档
            showNotification('🎉 所有审批完成，文档已归档', 'success');
            await reloadProjectAndRender(cycle);
            if (action === 'approve' || action === 'approve_finalize') {
                import('./cycle.js').then(module => { module.refreshCycleProgress(); });
            }
        } else if (result.status === 'stage_approved') {
            // 当前阶段通过，等待下一阶段
            const message = result.message || `第 ${result.current_stage} 阶段已批准，等待第 ${result.next_stage} 阶段审批`;
            showNotification(message, 'info');
            await reloadProjectAndRender(cycle);
        } else if (result.status !== 'cancelled') {
            showNotification(result.message || '操作失败', 'error');
        }
    } catch (error) {
        console.error('[ERROR] 审批操作失败:', error);
        showNotification('审批操作失败: ' + error.message, 'error');
    }
}

/**
 * 撤回归档审批请求（供 onclick 调用）
 */
async function handleWithdrawArchiveAction(projectId, approvalId, cycle) {
    showConfirmModal('撤回审批', '确定要撤回此归档审批请求吗？', async () => {
        try {
            const response = await fetch(`/api/projects/${projectId}/archive-withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approval_id: approvalId })
            });
            const result = await response.json();
            if (result.status === 'success') {
                showNotification('已撤回归档审批请求', 'success');
                await reloadProjectAndRender(cycle);
            } else {
                showNotification('撤回失败: ' + (result.message || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('撤回操作失败:', error);
            showNotification('撤回操作失败: ' + error.message, 'error');
        }
    });
}

/**
 * 显示审批流程时间线Modal
 */
async function showApprovalTimeline(approvalId, cycle, overrideProjectId) {
    const projectId = overrideProjectId || appState.currentProjectId;
    if (!projectId || !approvalId) {
        showNotification('参数错误', 'error');
        return;
    }

    showNotification('加载流程历史...', 'info');
    const result = await getApprovalHistory(projectId, approvalId);
    if (result.status !== 'success') {
        showNotification(result.message || '获取流程历史失败', 'error');
        return;
    }

    const history = result.history || [];
    const approval = result.approval || {};
    const docNames = (approval.doc_names || []).join('、');
    const statusLabels = {
        'pending': '审批中',
        'approved': '已归档',
        'rejected': '已驳回',
        'withdrawn': '已撤回',
        'stage_approved': '阶段审批中'
    };
    const statusColors = {
        'pending': '#ffc107',
        'approved': '#28a745',
        'rejected': '#dc3545',
        'withdrawn': '#6c757d',
        'stage_approved': '#17a2b8'
    };

    const actionIcons = {
        'submit': { icon: '📋', color: '#007bff', label: '提交申请' },
        'stage_approve': { icon: '✅', color: '#28a745', label: '阶段通过' },
        'reject': { icon: '❌', color: '#dc3545', label: '驳回' },
        'archived': { icon: '📦', color: '#28a745', label: '归档完成' },
        'withdraw': { icon: '↩️', color: '#6c757d', label: '撤回' }
    };

    // 构建时间线HTML
    let timelineHtml = '';
    if (history.length === 0) {
        timelineHtml = '<div style="text-align:center;color:#999;padding:30px;">暂无流程记录</div>';
    } else {
        timelineHtml = '<div class="approval-timeline">';
        history.forEach((item, idx) => {
            const config = actionIcons[item.action] || { icon: '📌', color: '#6c757d', label: item.action };
            const isLast = idx === history.length - 1;
            const timestamp = item.timestamp || '';
            let displayTime = '';
            if (timestamp) {
                try {
                    const d = new Date(timestamp);
                    if (!isNaN(d.getTime())) {
                        displayTime = d.toLocaleString('zh-CN');
                    } else {
                        displayTime = timestamp;
                    }
                } catch { displayTime = timestamp; }
            }

            timelineHtml += `
                <div class="timeline-item ${isLast ? 'timeline-item-last' : ''}">
                    <div class="timeline-dot" style="background:${config.color};"></div>
                    <div class="timeline-line" ${isLast ? 'style="display:none;"' : ''}></div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <span class="timeline-icon">${config.icon}</span>
                            <span class="timeline-label" style="color:${config.color};font-weight:600;">${config.label}</span>
                            <span class="timeline-time">${displayTime}</span>
                        </div>
                        <div class="timeline-detail">${escapeHtml(item.detail || '')}</div>
                        ${item.username ? `<div class="timeline-user">操作人: ${escapeHtml(item.username)}</div>` : ''}
                    </div>
                </div>`;
        });
        timelineHtml += '</div>';
    }

    // 当前状态标签
    const curStatus = approval.status || 'pending';
    const statusLabel = statusLabels[curStatus] || curStatus;
    const statusColor = statusColors[curStatus] || '#6c757d';

    // 审批阶段进度条
    const stages = approval.approval_stages || [];
    let stagesHtml = '';
    if (stages.length > 0) {
        stagesHtml = '<div class="timeline-stages-bar">';
        stages.forEach((s, i) => {
            const roleName = s.required_role === 'project_admin' ? '项目经理' : s.required_role === 'pmo' ? 'PMO' : s.required_role === 'pmo_leader' ? 'PMO负责人' : s.required_role === 'admin' ? '管理员' : `Level${i+1}`;
            let stageColor = '#e9ecef';
            let stageIcon = '⏳';
            let textColor = '#666';
            if (s.status === 'approved') { stageColor = '#d4edda'; stageIcon = '✓'; textColor = '#155724'; }
            else if (s.status === 'rejected') { stageColor = '#f8d7da'; stageIcon = '✗'; textColor = '#721c24'; }
            const handlerName = s.approved_by_username || s.assigned_to_username || '待分配';
            const arrow = i < stages.length - 1 ? '<span class="stage-arrow">→</span>' : '';
            stagesHtml += `<span class="stage-badge" title="处理人: ${escapeHtml(handlerName)}" style="background:${stageColor};color:${textColor};">${stageIcon} ${roleName}</span>${arrow}`;
        });
        stagesHtml += '</div>';
    }

    // 构建Modal
    const existingModal = document.getElementById('approvalTimelineModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'approvalTimelineModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;max-height:80vh;">
            <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="margin:0;">📊 审批流程详情</h3>
                <button class="modal-close-btn" id="closeTimelineModal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">&times;</button>
            </div>
            <div class="modal-body" style="overflow-y:auto;max-height:calc(80vh - 120px);padding:15px 20px;">
                <div style="margin-bottom:15px;padding:12px;background:#f8f9fa;border-radius:8px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <span style="font-weight:600;">周期:</span> <span>${escapeHtml(approval.cycle || '')}</span>
                        <span style="margin-left:auto;padding:3px 10px;border-radius:12px;font-size:12px;color:white;background:${statusColor};">${statusLabel}</span>
                    </div>
                    <div style="font-size:13px;color:#666;">文档: ${escapeHtml(docNames || '无')}</div>
                    <div style="font-size:13px;color:#666;margin-top:4px;">申请人: ${escapeHtml(approval.requester_username || '')}</div>
                </div>
                ${stagesHtml ? `<div style="margin-bottom:15px;">${stagesHtml}</div>` : ''}
                <div style="font-weight:600;margin-bottom:10px;font-size:14px;">流程时间线</div>
                ${timelineHtml}
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;padding:0 20px 15px;">
                <button type="button" class="btn btn-secondary" id="closeTimelineModalBtn">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 添加点击关闭
    const closeTimeline = () => modal.remove();
    document.getElementById('closeTimelineModal').addEventListener('click', closeTimeline);
    document.getElementById('closeTimelineModalBtn').addEventListener('click', closeTimeline);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeTimeline();
    });
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', escHandler);
            closeTimeline();
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * 显示项目的审批历史列表
 */
export async function showApprovalHistoryList(projectId) {
    if (!projectId) {
        showNotification('请先选择项目', 'error');
        return;
    }

    showNotification('加载审批历史...', 'info');

    try {
        const response = await fetch(`/api/projects/${projectId}/archive-requests`);
        if (!response.ok) {
            showNotification('获取审批记录失败', 'error');
            return;
        }
        const result = await response.json();
        if (result.status !== 'success') {
            showNotification(result.message || '获取审批记录失败', 'error');
            return;
        }

        const requests = result.requests || [];

        // 构建Modal
        const existingModal = document.getElementById('approvalHistoryListModal');
        if (existingModal) existingModal.remove();

        const statusLabels = {
            'pending': { label: '审批中', color: '#ffc107', bg: '#fff8e1' },
            'approved': { label: '已归档', color: '#28a745', bg: '#e8f5e9' },
            'rejected': { label: '已驳回', color: '#dc3545', bg: '#ffebee' },
            'withdrawn': { label: '已撤回', color: '#6c757d', bg: '#f5f5f5' },
            'stage_approved': { label: '阶段审批', color: '#17a2b8', bg: '#e0f7fa' }
        };

        let listHtml = '';
        if (requests.length === 0) {
            listHtml = '<div style="text-align:center;color:#999;padding:40px;">暂无审批记录</div>';
        } else {
            listHtml = '<div style="display:flex;flex-direction:column;gap:10px;">';
            requests.forEach(req => {
                const s = statusLabels[req.status] || { label: req.status, color: '#6c757d', bg: '#f5f5f5' };
                const docNames = Array.isArray(req.doc_names) ? req.doc_names : [];
                const docDisplay = docNames.length > 3
                    ? docNames.slice(0, 3).join('、') + `...等${docNames.length}个`
                    : docNames.join('、') || '-';
                const createdAt = req.created_at ? new Date(req.created_at).toLocaleString('zh-CN') : '-';

                // 审批阶段进度
                const stages = req.approval_stages || [];
                let stageHtml = '';
                if (stages.length > 0) {
                    stageHtml = '<div style="display:flex;gap:4px;align-items:center;margin-top:6px;flex-wrap:wrap;">';
                    stages.forEach((st, i) => {
                        const roleName = st.required_role === 'project_admin' ? '项目经理' : st.required_role === 'pmo' ? 'PMO' : st.required_role === 'admin' ? '管理员' : `Level${i+1}`;
                        let stageColor = '#e9ecef'; let icon = '⏳'; let textColor = '#666';
                        if (st.status === 'approved') { stageColor = '#d4edda'; icon = '✓'; textColor = '#155724'; }
                        else if (st.status === 'rejected') { stageColor = '#f8d7da'; icon = '✗'; textColor = '#721c24'; }
                        const arrow = i < stages.length - 1 ? '<span style="color:#ccc;">→</span>' : '';
                        stageHtml += `<span style="background:${stageColor};color:${textColor};padding:2px 8px;border-radius:10px;font-size:11px;">${icon} ${roleName}</span>${arrow}`;
                    });
                    stageHtml += '</div>';
                }

                listHtml += `
                <div style="padding:14px;background:${s.bg};border-radius:8px;border:1px solid ${s.color}22;cursor:pointer;" class="approval-history-item" data-id="${req.id}" data-cycle="${escapeHtml(req.cycle || '')}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-weight:600;font-size:14px;">周期: ${escapeHtml(req.cycle || '-')}</span>
                        <span style="padding:3px 10px;border-radius:12px;font-size:12px;color:white;background:${s.color};">${s.label}</span>
                    </div>
                    <div style="font-size:12px;color:#666;margin-bottom:4px;">文档: ${escapeHtml(docDisplay)}</div>
                    <div style="font-size:12px;color:#666;">申请人: ${escapeHtml(req.requester_username || '-')} | 时间: ${createdAt}</div>
                    ${stageHtml}
                    <div style="text-align:right;margin-top:8px;">
                        <span style="color:${s.color};font-size:12px;">点击查看详情 →</span>
                    </div>
                </div>`;
            });
            listHtml += '</div>';
        }

        const modal = document.createElement('div');
        modal.id = 'approvalHistoryListModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:650px;max-height:80vh;">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;">📊 审批历史记录</h3>
                    <button class="modal-close-btn" id="closeHistoryListModal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">&times;</button>
                </div>
                <div class="modal-body" style="overflow-y:auto;max-height:calc(80vh - 80px);padding:15px 20px;">
                    ${listHtml}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 绑定关闭
        document.getElementById('closeHistoryListModal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // 绑定每条记录的点击 → 查看详细时间线
        modal.querySelectorAll('.approval-history-item').forEach(item => {
            item.addEventListener('click', () => {
                const approvalId = item.dataset.id;
                const cycle = item.dataset.cycle;
                modal.remove();
                showApprovalTimeline(approvalId, cycle);
            });
        });
    } catch (error) {
        console.error('加载审批历史失败:', error);
        showNotification('加载审批历史失败', 'error');
    }
}

/**
 * 全局审批历史 - 显示所有项目的审批记录
 */
export async function showGlobalApprovalHistory() {
    showNotification('加载审批历史...', 'info');

    try {
        const response = await fetch('/api/projects/archive/history');
        if (!response.ok) {
            showNotification('获取审批记录失败', 'error');
            return;
        }
        const result = await response.json();
        if (result.status !== 'success') {
            showNotification(result.message || '获取审批记录失败', 'error');
            return;
        }

        const requests = result.requests || [];

        const existingModal = document.getElementById('globalApprovalHistoryModal');
        if (existingModal) existingModal.remove();

        const statusLabels = {
            'pending': { label: '审批中', color: '#ffc107', bg: '#fff8e1' },
            'approved': { label: '已归档', color: '#28a745', bg: '#e8f5e9' },
            'rejected': { label: '已驳回', color: '#dc3545', bg: '#ffebee' },
            'withdrawn': { label: '已撤回', color: '#6c757d', bg: '#f5f5f5' },
            'stage_approved': { label: '阶段审批', color: '#17a2b8', bg: '#e0f7fa' }
        };

        // 按状态筛选
        let filterHtml = `
            <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
                <button class="btn btn-sm btn-outline-secondary history-filter-btn active" data-filter="all">全部</button>
                <button class="btn btn-sm btn-outline-warning history-filter-btn" data-filter="pending">审批中</button>
                <button class="btn btn-sm btn-outline-success history-filter-btn" data-filter="approved">已归档</button>
                <button class="btn btn-sm btn-outline-danger history-filter-btn" data-filter="rejected">已驳回</button>
                <button class="btn btn-sm btn-outline-secondary history-filter-btn" data-filter="withdrawn">已撤回</button>
            </div>`;

        let listHtml = '';
        if (requests.length === 0) {
            listHtml = '<div style="text-align:center;color:#999;padding:40px;">暂无审批记录</div>';
        } else {
            listHtml = '<div class="global-history-list" style="display:flex;flex-direction:column;gap:10px;">';
            requests.forEach(req => {
                const s = statusLabels[req.status] || { label: req.status, color: '#6c757d', bg: '#f5f5f5' };
                const docNames = Array.isArray(req.doc_names) ? req.doc_names : [];
                const docDisplay = docNames.length > 3
                    ? docNames.slice(0, 3).join('、') + `...等${docNames.length}个`
                    : docNames.join('、') || '-';
                const createdAt = req.created_at ? new Date(req.created_at).toLocaleString('zh-CN') : '-';
                const projectName = req.project_name || req.project_id || '-';

                const stages = req.approval_stages || [];
                let stageHtml = '';
                if (stages.length > 0) {
                    stageHtml = '<div style="display:flex;gap:4px;align-items:center;margin-top:6px;flex-wrap:wrap;">';
                    stages.forEach((st, i) => {
                        const roleName = st.required_role === 'project_admin' ? '项目经理' : st.required_role === 'pmo' ? 'PMO' : st.required_role === 'admin' ? '管理员' : `Level${i+1}`;
                        let stageColor = '#e9ecef'; let icon = '⏳'; let textColor = '#666';
                        if (st.status === 'approved') { stageColor = '#d4edda'; icon = '✓'; textColor = '#155724'; }
                        else if (st.status === 'rejected') { stageColor = '#f8d7da'; icon = '✗'; textColor = '#721c24'; }
                        const arrow = i < stages.length - 1 ? '<span style="color:#ccc;">→</span>' : '';
                        stageHtml += `<span style="background:${stageColor};color:${textColor};padding:2px 8px;border-radius:10px;font-size:11px;">${icon} ${roleName}</span>${arrow}`;
                    });
                    stageHtml += '</div>';
                }

                listHtml += `
                <div style="padding:14px;background:${s.bg};border-radius:8px;border:1px solid ${s.color}22;cursor:pointer;" class="global-history-item" data-id="${req.id}" data-cycle="${escapeHtml(req.cycle || '')}" data-project-id="${escapeHtml(req.project_id || '')}" data-status="${req.status}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-weight:600;font-size:14px;">📁 ${escapeHtml(projectName)}</span>
                        <span style="padding:3px 10px;border-radius:12px;font-size:12px;color:white;background:${s.color};">${s.label}</span>
                    </div>
                    <div style="font-size:12px;color:#666;margin-bottom:4px;">周期: ${escapeHtml(req.cycle || '-')} | 文档: ${escapeHtml(docDisplay)}</div>
                    <div style="font-size:12px;color:#666;">申请人: ${escapeHtml(req.requester_username || '-')} | 时间: ${createdAt}</div>
                    ${stageHtml}
                    <div style="text-align:right;margin-top:8px;">
                        <span style="color:${s.color};font-size:12px;">点击查看详情 →</span>
                    </div>
                </div>`;
            });
            listHtml += '</div>';
        }

        const modal = document.createElement('div');
        modal.id = 'globalApprovalHistoryModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:700px;max-height:85vh;">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;">📊 审批历史记录</h3>
                    <button class="modal-close-btn" id="closeGlobalHistoryModal" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">&times;</button>
                </div>
                <div class="modal-body" style="overflow-y:auto;max-height:calc(85vh - 80px);padding:15px 20px;">
                    ${filterHtml}
                    ${listHtml}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 绑定关闭
        document.getElementById('closeGlobalHistoryModal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // 绑定筛选按钮
        modal.querySelectorAll('.history-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                modal.querySelectorAll('.global-history-item').forEach(item => {
                    if (filter === 'all' || item.dataset.status === filter) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        });

        // 绑定每条记录的点击 → 查看详细时间线
        modal.querySelectorAll('.global-history-item').forEach(item => {
            item.addEventListener('click', () => {
                const approvalId = item.dataset.id;
                const cycle = item.dataset.cycle;
                const projectId = item.dataset.projectId;
                showApprovalTimeline(approvalId, cycle, projectId);
            });
        });
    } catch (error) {
        console.error('加载审批历史失败:', error);
        showNotification('加载审批历史失败', 'error');
    }
}

/**
 * 承建方快速审批（由项目经理输入安全码完成审批）
 */
async function handleContractorQuickApproveAction(approvalId, cycle) {
    try {
        // 获取当前阶段的审批人
        const approversResult = await getArchiveApprovers(appState.currentProjectId, approvalId);
        if (approversResult.status !== 'success' || !approversResult.approvers?.length) {
            showNotification('获取审批人信息失败', 'error');
            return;
        }

        const approvers = approversResult.approvers;
        const requireCode = appState.systemSettings?.require_approval_code !== false;

        let selectedApprover;
        let approvalCode = '';

        // 自动匹配当前登录用户
        const currentUserId = authState.user?.id;
        const currentUsername = authState.user?.username;
        let matchedApprover = null;
        if (currentUserId) {
            matchedApprover = approvers.find(a => String(a.id) === String(currentUserId));
        }
        if (!matchedApprover && currentUsername) {
            matchedApprover = approvers.find(a => a.username === currentUsername);
        }

        if (matchedApprover || approvers.length === 1) {
            selectedApprover = matchedApprover || approvers[0];
            if (requireCode) {
                const codeInput = await promptApprovalCodeForArchive(
                    `${selectedApprover.username} 快速审批 - 请输入审批安全码`
                );
                if (!codeInput?.approval_code) return;
                approvalCode = codeInput.approval_code;
            }
        } else {
            // 多个审批人且无法自动匹配，需要选择 + 输入安全码
            const input = await promptApprovalCodeForArchive(
                '快速审批 - 选择审批人并输入安全码',
                false, approvers, !requireCode
            );
            if (!input) return;
            if (requireCode && !input.approval_code) return;
            selectedApprover = approvers.find(a => String(a.id) === input.approver_id) || approvers[0];
            approvalCode = requireCode ? input.approval_code : '';
        }

        const result = await approveArchiveRequest(
            appState.currentProjectId, approvalId,
            selectedApprover.id, approvalCode
        );

        if (result.status === 'success') {
            showNotification('🎉 所有审批完成，文档已归档', 'success');
            await reloadProjectAndRender(cycle);
            import('./cycle.js').then(module => { module.refreshCycleProgress(); });
        } else if (result.status === 'stage_approved') {
            showNotification(result.message || '第一级审批已通过，等待PMO审批', 'info');
            await reloadProjectAndRender(cycle);
        } else if (result.status === 'needs_change') {
            const updatedInput = await promptApprovalCodeForArchive(
                '首次使用审批安全码，请输入当前登录密码并设置新审批安全码', true
            );
            if (updatedInput?.approval_code && updatedInput?.new_approval_code) {
                const retryResult = await approveArchiveRequest(
                    appState.currentProjectId, approvalId,
                    selectedApprover.id, updatedInput.approval_code, updatedInput.new_approval_code
                );
                if (retryResult.status === 'success' || retryResult.status === 'stage_approved') {
                    showNotification(retryResult.message || '审批完成', 'success');
                } else {
                    showNotification(retryResult.message || '审批失败', 'error');
                }
                await reloadProjectAndRender(cycle);
            }
        } else {
            showNotification(result.message || '快速审批失败', 'error');
        }
    } catch (error) {
        console.error('[ERROR] 承建方快速审批失败:', error);
        showNotification('快速审批失败: ' + error.message, 'error');
    }
}

/**
 * 格式化日期为月/日
 */
function formatDateToMonth(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 主页面文档树形目录渲染（与ZIP列表风格一致，支持折叠展开）
 */
function renderMainDocTree(docsList, cycle, docInfo) {
    // 构建树
    const treeRoot = { name: '', path: '', children: {}, files: [] };
    
    for (const d of docsList) {
        // 使用 display_directory（后端已根据 root_directory 做过路径截取）
        const dir = d.display_directory || d.directory || '/';
        const dirPath = dir === '/' ? '' : dir;
        const parts = dirPath ? dirPath.split('/').filter(Boolean) : [];
        
        let node = treeRoot;
        let currentPath = '';
        for (const part of parts) {
            currentPath = currentPath ? currentPath + '/' + part : part;
            if (!node.children[part]) {
                node.children[part] = { name: part, path: currentPath, children: {}, files: [] };
            }
            node = node.children[part];
        }
        node.files.push(d);
    }
    
    // 目录头部样式
    const dirHeaderStyle = 'display:flex;align-items:center;gap:4px;padding:6px 10px;'
        + 'background:linear-gradient(135deg,#e8f0fe,#f0f5ff);'
        + 'border:1px solid #d0ddf5;border-radius:5px;'
        + 'cursor:pointer;user-select:none;font-weight:600;color:#2c3e50;margin-top:6px;';
    
    // 递归渲染节点
    function renderNode(node, depth) {
        const indent = depth * 16;
        let html = '';
        
        // 排序子目录
        const childDirs = Object.values(node.children).sort((a, b) =>
            a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
        );
        
        // 渲染子目录（可折叠）
        for (const dirNode of childDirs) {
            const totalCount = countFiles(dirNode);
            const escapedDirPath = escapeAttr(dirNode.path);
            
            html += `
                <div style="margin-left:${indent}px;margin-bottom:2px;">
                    <div class="main-doc-dir-header" data-dir="${escapedDirPath}" style="${dirHeaderStyle}">
                        <span class="dir-toggle-icon" style="font-size:11px;transition:transform 0.18s;display:inline-block;min-width:12px;flex-shrink:0;">▼</span>
                        <span style="font-size:13px;">📁</span>
                        <span style="font-size:12px;flex:1;">${escapeHtml(dirNode.name)}</span>
                        <span style="color:#888;font-size:11px;flex-shrink:0;">(${totalCount})</span>
                    </div>
                    <div class="main-doc-dir-children" data-dir-files="${escapedDirPath}" style="display:block;">
                        ${renderNode(dirNode, depth + 1)}
                    </div>
                </div>`;
        }
        
        // 排序并渲染当前层文件
        const sortedFiles = node.files.sort((a, b) => {
            const na = a.original_filename || a.filename || '';
            const nb = b.original_filename || b.filename || '';
            return na.localeCompare(nb, 'zh-CN', { numeric: true, sensitivity: 'base' });
        });
        
        for (const d of sortedFiles) {
            html += renderMainFileRow(d, cycle, docInfo, depth);
        }
        
        return html;
    }
    
    return `<div class="main-doc-tree">${renderNode(treeRoot, 0)}</div>`;
}

// 统计目录下所有文件数
function countFiles(node) {
    let c = node.files.length;
    for (const child of Object.values(node.children)) {
        c += countFiles(child);
    }
    return c;
}

// 转义HTML属性值
function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 渲染主页面单个文档行（保留原有的属性显示和缺失要求检查）
function renderMainFileRow(d, cycle, docInfo, depth = 0) {
    const getField = (name) => d[name] !== undefined ? d[name] : d[`_${name}`];
    const getDocValue = (fieldName) => {
        if (d[fieldName] !== undefined) return d[fieldName];
        if (d[`_${fieldName}`] !== undefined) return d[`_${fieldName}`];
        return null;
    };
    const indent = depth * 16 + 20; // 基础20px + 每级目录16px缩进
    
    const attrParts = [];
    const fields = ['doc_date', 'signer', 'party_a_signer', 'party_b_signer', 'sign_date',
        'no_signature', 'party_a_seal', 'party_b_seal', 'has_seal_marked', 'has_seal',
        'no_seal', 'other_seal'];
    const fieldLabels = ['📅', '✍️', '🏢甲:', '🏭乙:', '📆'];
    
    const docDate = getField('doc_date');
    const signer = getField('signer');
    const partyASigner = getField('party_a_signer');
    const partyBSigner = getField('party_b_signer');
    const signDate = getField('sign_date');
    const noSignature = getField('no_signature');
    const partyASeal = getField('party_a_seal');
    const partyBSeal = getField('party_b_seal');
    const hasSealMarked = getField('has_seal_marked') || getField('has_seal');
    const noSeal = getField('no_seal');
    const otherSeal = getField('other_seal');
    
    if (docDate) attrParts.push(`📅${formatDateToMonth(docDate)}`);
    if (signer) attrParts.push(`✍️${signer}`);
    if (partyASigner) attrParts.push(`🏢甲:${partyASigner}`);
    if (partyBSigner) attrParts.push(`🏭乙:${partyBSigner}`);
    if (signDate) attrParts.push(`📆${formatDateToMonth(signDate)}`);
    if (noSignature) attrParts.push('❌不签字');
    if (partyASeal) attrParts.push('🏢甲方盖章');
    if (partyBSeal) attrParts.push('🏭乙方盖章');
    if (hasSealMarked) attrParts.push('🔖');
    if (noSeal) attrParts.push('❌不盖章');
    if (otherSeal) attrParts.push(`📍${otherSeal}`);
    if (getDocValue('not_involved')) attrParts.push('🚫本次不涉及');
    
    // 自定义属性
    const predefinedFields = new Set(['doc_date', 'signer', 'party_a_signer', 'party_b_signer', 'sign_date', 'no_signature', 'party_a_seal', 'party_b_seal', 'has_seal_marked', 'has_seal', 'no_seal', 'other_seal', 'not_involved', 'id', 'doc_name', 'filename', 'original_filename', 'upload_time', 'directory', 'cycle', 'file_path', 'source', 'file_size', 'doc_id', 'project_name', 'project_id', 'file_type', 'status', 'matched_file', 'matched_time', 'archived', 'custom_attrs', 'zip_name', 'zip_file', 'zip_path', 'rel_path']);
    const cycleDocs = appState.projectConfig?.documents?.[cycle];
    const currentDocInfo = cycleDocs?.required_docs?.find(rd => rd.name === docInfo.name);
    const requiredCustomAttrs = currentDocInfo?.attributes || {};
    const customDefs = appState.projectConfig?.custom_attribute_definitions || [];
    customDefs.forEach(attrDef => {
        const isRequired = requiredCustomAttrs[attrDef.id] === true;
        const value = getDocValue(attrDef.id);
        const isCompleted = value === true || (value !== undefined && value !== null && value !== '' && value !== false);
        if (isRequired) {
            if (isCompleted) {
                attrParts.push(`<span style="color: #28a745;">✓${attrDef.name}${attrDef.type !== 'checkbox' ? ': ' + value : ''}</span>`);
            } else {
                attrParts.push(`<span style="color: #dc3545;">✗${attrDef.name}</span>`);
            }
        } else if (isCompleted && attrDef.type !== 'checkbox') {
            attrParts.push(`📌${attrDef.name}: ${value}`);
        }
    });
    
    // 缺失要求检查
    const requirement = docInfo.requirement || '';
    let missingRequirements = [];
    
    if (requirement.includes('甲方签字') && !getDocValue('party_a_signer') && !getDocValue('no_signature')) missingRequirements.push('甲方签字');
    if (requirement.includes('乙方签字') && !getDocValue('party_b_signer') && !getDocValue('no_signature')) missingRequirements.push('乙方签字');
    if (requirement.includes('签字') && !requirement.includes('甲方签字') && !requirement.includes('乙方签字') && !getDocValue('signer') && !getDocValue('no_signature')) missingRequirements.push('签字');
    
    if ((requirement.includes('盖章') || requirement.includes('甲方盖章') || requirement.includes('乙方盖章')) && !hasSealMarked && !partyASeal && !partyBSeal && !noSeal) {
        if (requirement.includes('甲方盖章') && requirement.includes('乙方盖章')) missingRequirements.push('甲乙方盖章');
        else if (requirement.includes('乙方盖章')) missingRequirements.push('乙方盖章');
        else if (requirement.includes('甲方盖章')) missingRequirements.push('甲方盖章');
        else if (requirement.includes('盖章')) missingRequirements.push('盖章');
    }
    if (requirement.includes('文档日期') && !getDocValue('doc_date')) missingRequirements.push('文档日期');
    if (requirement.includes('签字日期') && !getDocValue('sign_date')) missingRequirements.push('签字日期');
    
    const missingHtml = missingRequirements.length > 0
        ? `<span title="缺失要求：${missingRequirements.join('、')}">⚠️${missingRequirements.join('、')}</span>` : '';
    
    return `<div class="doc-file-row" style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-left:${indent}px;padding:3px 0;">
        <span class="doc-file-name" onclick="previewDocument('${d.id}')" 
              title="${escapeAttr(d.original_filename || d.filename || '')}"
              style="cursor:pointer;text-decoration:underline;color:#1890ff;font-size:13px;">
            📄 ${escapeHtml(d.original_filename || d.filename || '未知文件名')}
        </span>
        ${attrParts.length > 0 ? `<span class="doc-attrs" style="margin-left:6px;font-size:12px;">${attrParts.join(' ')}</span>` : ''}
        ${missingHtml}
    </div>`;
}



/**
 * 加载维护页面的文档
 */
export async function loadMaintainDocuments() {
    // 检查是否有当前周期和文档名称
    if (appState.currentCycle && appState.currentDocument) {
        await loadMaintainDocumentsList(appState.currentCycle, appState.currentDocument);
    } else {
        // 尝试从页面URL或其他上下文获取
        const urlParams = new URLSearchParams(window.location.search);
        const cycle = urlParams.get('cycle');
        const docName = urlParams.get('doc_name');
        
        // 无论是否有cycle和docName，都尝试加载文档列表
        // 当没有cycle和docName时，loadMaintainDocumentsList会尝试加载所有文档
        await loadMaintainDocumentsList(cycle, docName);
    }
}

/**
 * 加载已上传的文档
 */
export async function loadMaintainDocumentsList(cycle, docName) {
    try {
        console.log('加载已上传文档:', cycle, docName, appState.currentProjectId);
        
        // 尝试从API获取文档列表
        let documents = [];
        try {
            if (appState.currentProjectId) {
                let apiUrl = `/api/documents/list?project_id=${encodeURIComponent(appState.currentProjectId)}`;
                if (cycle) {
                    apiUrl += `&cycle=${encodeURIComponent(cycle)}`;
                }
                if (docName) {
                    apiUrl += `&doc_name=${encodeURIComponent(docName)}`;
                }
                
                const response = await fetch(apiUrl);
                const result = await response.json();
                
                console.log('API响应:', result);
                
                if (result.status === 'success') {
                    documents = result.data || [];
                }
            } else {
                console.log('缺少项目ID，尝试从本地配置获取');
            }
        } catch (apiError) {
            console.error('API获取文档失败:', apiError);
        }
        
        // 如果API没有返回文档，尝试从本地项目配置中获取
        if (documents.length === 0 && appState.projectConfig && appState.projectConfig.documents) {
            console.log('从本地项目配置中获取文档');
            
            // 遍历所有周期和文档
            for (const [cycleKey, cycleInfo] of Object.entries(appState.projectConfig.documents)) {
                if (cycleInfo.uploaded_docs) {
                    for (const doc of cycleInfo.uploaded_docs) {
                        // 如果指定了周期和文档名称，只添加匹配的文档
                        // 更灵活的匹配逻辑，处理不同的字段名称
                        const docCycle = doc.cycle || doc.cycle_key || cycleKey;
                        const docDocName = doc.doc_name || doc.name || doc.docName;
                        
                        if ((!cycle || docCycle === cycle) && (!docName || docDocName === docName)) {
                            documents.push(doc);
                        }
                    }
                }
            }
            
            console.log('从本地配置获取的文档:', documents);
        }
        
        // 移除文档数量限制，显示所有文档
        console.log('显示所有文档，共', documents.length, '个');

        
        const documentsList = document.getElementById('documentsList');
        const docCount = document.getElementById('docCount');
        
        console.log('最终文档列表:', documents);
        
        if (docCount) {
            docCount.textContent = documents.length;
        }
        
        // 显示或隐藏全选/反选按钮容器
        const maintainSelectAllContainer = document.getElementById('maintainSelectAllContainer');
        if (maintainSelectAllContainer) {
            maintainSelectAllContainer.style.display = documents.length > 0 ? 'block' : 'none';
        }
        
        if (documentsList) {
            if (documents.length === 0) {
                documentsList.innerHTML = '<p class="placeholder">暂无已上传文档</p>';
            } else {
                // 构建文档树形目录结构
                documentsList.innerHTML = renderDocumentsTree(documents, cycle, docName);
                
                // 绑定目录折叠事件
                document.querySelectorAll('.doc-dir-header').forEach(header => {
                    header.addEventListener('click', function(e) {
                        if (e.target.type === 'checkbox' || e.target.tagName === 'BUTTON') return;
                        const dirPath = this.dataset.dir;
                        const children = document.querySelector(`.doc-dir-children[data-dir-files="${dirPath}"]`);
                        const icon = this.querySelector('.dir-toggle-icon');
                        if (children) {
                            const isHidden = children.style.display === 'none';
                            children.style.display = isHidden ? 'block' : 'none';
                            if (icon) icon.textContent = isHidden ? '▼' : '▶';
                        }
                    });
                });
                
                // 添加复选框事件
                document.querySelectorAll('.document-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', updateSelectedCount);
                });
                
                // 重新绑定批量操作按钮事件
                const batchEditBtn = document.getElementById('batchEditBtn');
                if (batchEditBtn) {
                    batchEditBtn.addEventListener('click', handleBatchEdit);
                }
                
                const batchDeleteBtn = document.getElementById('batchDeleteBtn');
                if (batchDeleteBtn) {
                    batchDeleteBtn.addEventListener('click', handleBatchDelete);
                }
                
                const batchMoveBtn = document.getElementById('batchMoveBtn');
                if (batchMoveBtn) {
                    batchMoveBtn.addEventListener('click', handleBatchMove);
                }
                
                // 绑定全选/反选按钮事件
                const maintainSelectAllBtn = document.getElementById('maintainSelectAllBtn');
                if (maintainSelectAllBtn) {
                    maintainSelectAllBtn.onclick = selectAllMaintainDocuments;
                }
                
                const maintainDeselectAllBtn = document.getElementById('maintainDeselectAllBtn');
                if (maintainDeselectAllBtn) {
                    maintainDeselectAllBtn.onclick = deselectAllMaintainDocuments;
                }
            }
        } else {
            console.error('documentsList元素不存在');
        }
    } catch (error) {
        console.error('加载已上传文档失败:', error);
        // 显示错误提示
        const documentsList = document.getElementById('documentsList');
        if (documentsList) {
            documentsList.innerHTML = '<p class="placeholder">加载文档失败，请重试</p>';
        }
    }
}

/**
 * 渲染文档树形目录结构（支持折叠展开，与ZIP列表风格一致）
 */
function renderDocumentsTree(documents, cycle, docName) {
    // 构建目录树结构
    const treeRoot = { name: '', path: '', children: {}, files: [] };
    
    for (const doc of documents) {
        const dir = doc.directory || '/';
        const dirPath = dir === '/' ? '' : dir;
        // 按路径分隔符拆分，构建层级
        const parts = dirPath ? dirPath.split('/').filter(Boolean) : [];
        
        let node = treeRoot;
        let currentPath = '';
        for (const part of parts) {
            currentPath = currentPath ? currentPath + '/' + part : part;
            if (!node.children[part]) {
                node.children[part] = { name: part, path: currentPath, children: {}, files: [] };
            }
            node = node.children[part];
        }
        node.files.push(doc);
    }
    
    // 目录头部样式（参考ZIP列表风格）
    const dirHeaderStyle = 'display:flex;align-items:center;gap:4px;padding:7px 12px;'
        + 'background:linear-gradient(135deg,#e8f0fe,#f0f5ff);'
        + 'border:1px solid #d0ddf5;border-radius:5px;'
        + 'cursor:pointer;user-select:none;font-weight:600;color:#2c3e50;';
    
    // 递归渲染
    function renderNode(node, depth) {
        const indent = depth * 18;
        let html = '';
        
        // 排序子目录
        const childDirs = Object.values(node.children).sort((a, b) =>
            a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
        );
        
        // 渲染子目录
        for (const dirNode of childDirs) {
            const totalCount = countAllFiles(dirNode);
            const escapedDirPath = escapeAttr(dirNode.path);
            
            html += `
                <div class="doc-directory-group" style="margin-left:${indent}px;margin-bottom:4px;">
                    <div class="doc-dir-header" data-dir="${escapedDirPath}" style="${dirHeaderStyle}">
                        <span class="dir-toggle-icon" style="font-size:12px;transition:transform 0.18s;display:inline-block;min-width:14px;flex-shrink:0;">▼</span>
                        <span style="font-size:14px;">📁</span>
                        <span class="dir-name-label" style="flex:1;min-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">${escapeHtml(dirNode.name)}</span>
                        <span style="color:#888;font-size:11px;flex-shrink:0;">(${totalCount})</span>
                        <button class="btn btn-sm dir-rename-btn" data-dir="${escapedDirPath}" onclick="event.stopPropagation();handleRenameDirectory('${escapedDirPath}')" style="padding:1px 6px;font-size:11px;margin-left:4px;background:#fff;border:1px solid #aaa;color:#333;cursor:pointer;border-radius:3px;" title="重命名目录">✏️</button>
                    </div>
                    <div class="doc-dir-children" data-dir-files="${escapedDirPath}" style="display:block;">
                        ${renderNode(dirNode, depth + 1)}
                    </div>
                </div>`;
        }
        
        // 渲染当前目录下的文件
        const sortedFiles = node.files.sort((a, b) => {
            const na = a.original_filename || a.filename || '';
            const nb = b.original_filename || b.filename || '';
            return na.localeCompare(nb, 'zh-CN', { numeric: true, sensitivity: 'base' });
        });
        
        for (const doc of sortedFiles) {
            html += renderDocItem(doc, cycle, docName, indent);
        }
        
        return html;
    }
    
    return `<div class="documents-tree-container">${renderNode(treeRoot, 0)}</div>`;
}

// 统计目录下所有文件数量
function countAllFiles(node) {
    let count = node.files.length;
    for (const child of Object.values(node.children)) {
        count += countAllFiles(child);
    }
    return count;
}

/**
 * 目录重命名 - 修改目录路径中的最后一段名称，并更新所有子文档的directory
 */
async function handleRenameDirectoryAction(dirPath) {
    if (!dirPath) return;
    const parts = dirPath.split('/').filter(Boolean);
    const currentName = parts[parts.length - 1] || dirPath;

    showInputModal('重命名目录', [
        { label: '新目录名称', key: 'newName', type: 'text', placeholder: currentName, value: currentName }
    ], async (val) => {
        const newName = val?.newName?.trim();
        if (!newName || newName === currentName) return;

        // 构建新路径
        const newParts = [...parts];
        newParts[newParts.length - 1] = newName;
        const newDirPath = '/' + newParts.join('/');
        const oldDirPrefix = '/' + parts.join('/');

        // 从API获取当前文档类型下所有文档
        let allDocs = [];
        try {
            let apiUrl = `/api/documents/list?project_id=${encodeURIComponent(appState.currentProjectId)}`;
            if (appState.currentCycle) apiUrl += `&cycle=${encodeURIComponent(appState.currentCycle)}`;
            if (appState.currentDocument) apiUrl += `&doc_name=${encodeURIComponent(appState.currentDocument)}`;
            const response = await fetch(apiUrl);
            const result = await response.json();
            if (result.status === 'success') allDocs = result.data || [];
        } catch (e) {
            showNotification('获取文档列表失败', 'error');
            return;
        }

        const docsToUpdate = allDocs.filter(doc => {
            const docDir = doc.display_directory || doc.directory || '/';
            return docDir === oldDirPrefix || docDir.startsWith(oldDirPrefix + '/');
        });

        if (docsToUpdate.length === 0) {
            showNotification('未找到需要更新的文档', 'warning');
            return;
        }

        showLoading(true);
        let successCount = 0;
        let errorCount = 0;

        for (const doc of docsToUpdate) {
            const docId = doc.doc_id || doc.id;
            if (!docId) continue;
            const oldDir = doc.display_directory || doc.directory || '/';
            const updatedDir = oldDir === oldDirPrefix
                ? newDirPath
                : newDirPath + oldDir.substring(oldDirPrefix.length);
            try {
                const result = await editDocument(docId, { directory: updatedDir });
                if (result.status === 'success') {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (e) {
                errorCount++;
            }
        }

        showLoading(false);
        showNotification(
            `目录已重命名: ${successCount} 个文档更新${errorCount > 0 ? '，' + errorCount + ' 个失败' : ''}`,
            errorCount > 0 ? 'warning' : 'success'
        );

        // 刷新维护文档列表
        if (appState.currentCycle && appState.currentDocument) {
            await loadMaintainDocumentsList(appState.currentCycle, appState.currentDocument);
        }
    });
}

// 渲染单个文档项
function renderDocItem(doc, cycle, docName, indent) {
    const docId = doc.doc_id || doc.id || `${doc.cycle || 'unknown'}_${doc.doc_name || doc.name || 'unknown'}_${Date.now()}`;
    const zipInfo = doc.source === 'zip' ? (doc.zip_name || doc.zip_file || 'ZIP导入') : '';
    const zipPath = doc.zip_path || doc.rel_path || '';

    const getField = (name) => doc[name] !== undefined ? doc[name] : doc[`_${name}`];
    const attrParts = [];
    const fields = ['doc_date', 'signer', 'party_a_signer', 'party_b_signer', 'sign_date',
        'no_signature', 'party_a_seal', 'party_b_seal', 'has_seal_marked', 'has_seal',
        'no_seal', 'other_seal', 'not_involved'];
    const labels = ['📅', '✍️', '🏢甲:', '🏭乙:', '📆', '❌不签字', '🏢甲方盖章',
        '🏭乙方盖章', '🔖', '', '❌不盖章', '📍', '🚫本次不涉及'];

    for (let i = 0; i < fields.length; i++) {
        const val = getField(fields[i]);
        if (val) {
            if (typeof val === 'boolean') {
                attrParts.push(labels[i]);
            } else {
                attrParts.push(labels[i] + val);
            }
        }
    }

    // 自定义属性：只显示本文档要求的属性
    const customDefs = appState.projectConfig?.custom_attribute_definitions || [];
    const reqDocInfo = (() => {
        if (!appState.projectConfig || !cycle || !docName) return null;
        const cycleDocs = appState.projectConfig.documents?.[cycle];
        return cycleDocs?.required_docs?.find(d => d.name === docName) || null;
    })();
    customDefs.forEach(attrDef => {
        // 若能找到文档要求配置，则只展示该文档要求的属性
        if (reqDocInfo && !(reqDocInfo.attributes?.[attrDef.id] === true)) return;
        const value = getField(attrDef.id);
        const isCompleted = value === true || (value !== undefined && value !== null && value !== '' && value !== false);
        if (isCompleted) {
            if (typeof value === 'boolean') {
                attrParts.push(`📌${attrDef.name}`);
            } else {
                attrParts.push(`📌${attrDef.name}: ${value}`);
            }
        }
    });
    const attrStr = attrParts.join(' ');

    return `
        <div class="document-item" style="margin-left:${indent + 16}px;padding:4px 8px;margin-bottom:2px;border-radius:4px;
                display:flex;align-items:center;gap:8px;background:#fafafa;">
            <input type="checkbox" class="document-checkbox" data-doc-id="${docId}" style="flex-shrink:0;" />
            <div style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;">
                <span class="document-name" onclick="previewDocument('${docId}')"
                      style="cursor:pointer;color:#1890ff;font-size:13px;line-height:1.4;word-break:break-all;"
                      title="${escapeAttr(doc.original_filename || doc.filename || '')}">📄 ${escapeHtml(doc.original_filename || doc.filename || '未知文件名')}</span>
                ${attrStr ? `<div style="font-size:11px;display:flex;gap:6px;flex-wrap:wrap;line-height:1.5;color:#555;">${attrStr}</div>` : ''}
                ${zipInfo ? `<span style="font-size:11px;color:#888;" title="来源: ${zipInfo}${zipPath ? ' - ' + zipPath : ''}">📦 ${zipInfo}${zipPath ? '(' + zipPath + ')' : ''}</span>` : ''}
            </div>
            <div style="flex-shrink:0;display:flex;gap:4px;">
                <button class="btn btn-sm btn-success" onclick="openEditModal('${docId}','${cycle}','${docName}')" style="padding:2px 8px;font-size:11px;">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="handleDeleteDocument('${docId}','${cycle}','${docName}')" style="padding:2px 8px;font-size:11px;">删除</button>
            </div>
        </div>`;
}

/**
 * 全选维护页面的文档
 */
export function selectAllMaintainDocuments() {
    document.querySelectorAll('.document-checkbox').forEach(checkbox => {
        checkbox.checked = true;
    });
    updateSelectedCount();
}

/**
 * 反选维护页面的文档
 */
export function deselectAllMaintainDocuments() {
    document.querySelectorAll('.document-checkbox').forEach(checkbox => {
        checkbox.checked = !checkbox.checked;
    });
    updateSelectedCount();
}

// 保持向后兼容，添加 loadUploadedDocuments 函数作为 loadMaintainDocumentsList 的别名
export async function loadUploadedDocuments(cycle, docName) {
    return loadMaintainDocumentsList(cycle, docName);
}

/**
 * 过滤文档
 */
export async function filterDocuments(cycle) {
    const hideArchived = document.getElementById('hideArchived').checked;
    const hideCompleted = document.getElementById('hideCompleted').checked;
    const keyword = document.getElementById('keywordFilter')?.value || '';
    
    // 保存筛选状态到全局状态
    appState.filterOptions = {
        hideArchived,
        hideCompleted,
        keyword
    };
    
    await renderCycleDocuments(cycle, {
        hideArchived,
        hideCompleted,
        keyword
    });
}

// 暴露给全局作用域
window.filterDocuments = filterDocuments;

/**
 * 生成项目文档审核报告
 */
export async function generateReport() {
    if (!appState.projectConfig) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const projectName = appState.projectConfig.name || '未知项目';
        const cycles = appState.projectConfig.cycles || [];
        const reportData = {
            projectName,
            generatedAt: new Date().toLocaleString(),
            cycles: []
        };
        
        // 遍历每个周期，收集文档情况
        for (const cycle of cycles) {
            const cycleData = {
                name: cycle,
                requiredDocs: [],
                uploadedDocs: [],
                missingDocs: [],
                statistics: {
                    totalDocs: 0,
                    uploadedDocs: 0,
                    missingDocs: 0,
                    archivedDocs: 0,
                    signatureRate: 0,
                    sealRate: 0,
                    complianceRate: 0,
                    signedDocs: 0,
                    sealedDocs: 0,
                    compliantDocs: 0
                }
            };
            
            // 获取该周期的文档要求
            const cycleDocs = appState.projectConfig.documents[cycle];
            if (cycleDocs) {
                // 收集要求的文档并按前端显示顺序排序
                const requiredDocsRaw = cycleDocs.required_docs || [];
                cycleData.requiredDocs = requiredDocsRaw.map((doc, idx) => ({
                    ...doc,
                    _originalIndex: doc.index !== undefined && doc.index !== null ? doc.index : (idx + 1)
                })).sort((a, b) => (a._originalIndex || 0) - (b._originalIndex || 0));
                cycleData.statistics.totalDocs = cycleData.requiredDocs.length;
                
                // 获取已上传的文档
                const uploadedDocs = await getCycleDocuments(cycle);
                
                // 为每个文档添加归档状态和合规性检查
                const docsWithStatus = uploadedDocs.map(doc => {
                    const docName = doc.doc_name || doc.name;
                    const isArchived = appState.projectConfig.documents_archived?.[cycle]?.[docName] || false;
                    
                    // 检查文档是否合规
                    const docConfig = cycleData.requiredDocs.find(d => d.name === docName);
                    const requirement = docConfig?.requirement || '';
                    const attributes = docConfig?.attributes || {};
                    const missing = checkMissingRequirements(doc, requirement, attributes);
                    const isCompliant = missing.length === 0;
                    
                    return {
                        ...doc,
                        archived: isArchived,
                        compliant: isCompliant,
                        missingRequirements: missing
                    };
                });
                
                cycleData.uploadedDocs = docsWithStatus;
                
                // 统计文档类型数量
                const uploadedDocNames = new Set(docsWithStatus.map(doc => doc.doc_name));
                cycleData.statistics.uploadedDocs = uploadedDocNames.size;
                
                // 识别缺失的文档
                cycleData.missingDocs = cycleData.requiredDocs.filter(doc => 
                    !uploadedDocNames.has(doc.name)
                );
                cycleData.statistics.missingDocs = cycleData.missingDocs.length;
                
                // 计算统计数据（基于文档类型）
                if (uploadedDocNames.size > 0) {
                    // 按文档类型分组
                    const docsByType = {};
                    docsWithStatus.forEach(doc => {
                        const docName = doc.doc_name || doc.name;
                        if (!docsByType[docName]) {
                            docsByType[docName] = [];
                        }
                        docsByType[docName].push(doc);
                    });
                    
                    // 统计归档的文档类型数量
                    let archivedTypeCount = 0;
                    let signedTypeCount = 0;
                    let sealedTypeCount = 0;
                    let compliantTypeCount = 0;
                    let signRequirementCount = 0;
                    let sealRequirementCount = 0;
                    
                    Object.entries(docsByType).forEach(([docName, docs]) => {
                        // 获取该文档类型的要求
                        const docConfig = cycleData.requiredDocs.find(d => d.name === docName);
                        const requirement = docConfig?.requirement || '';
                        const hasSignRequirement = requirement.includes('签字') || requirement.includes('签名');
                        const hasSealRequirement = requirement.includes('盖章') || requirement.includes('章');
                        
                        // 检查该文档类型是否有归档的文档
                        const hasArchived = docs.some(doc => doc.archived);
                        if (hasArchived) archivedTypeCount++;
                        
                        // 检查该文档类型是否有签字的文档（只对有签字要求的文档类型进行统计）
                        if (hasSignRequirement) {
                            signRequirementCount++;
                            const hasSigned = docs.some(doc => {
                                const getDocValue = (fieldName) => {
                                    if (doc[fieldName] !== undefined) return doc[fieldName];
                                    if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
                                    return null;
                                };
                                return getDocValue('signer') || getDocValue('party_a_signer') || getDocValue('party_b_signer') || getDocValue('no_signature');
                            });
                            if (hasSigned) signedTypeCount++;
                        }
                        
                        // 检查该文档类型是否有盖章的文档（只对有盖章要求的文档类型进行统计）
                        if (hasSealRequirement) {
                            sealRequirementCount++;
                            const hasSealed = docs.some(doc => {
                                const getDocValue = (fieldName) => {
                                    if (doc[fieldName] !== undefined) return doc[fieldName];
                                    if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
                                    return null;
                                };
                                return getDocValue('has_seal_marked') || getDocValue('has_seal') || getDocValue('party_a_seal') || getDocValue('party_b_seal') || getDocValue('no_seal');
                            });
                            if (hasSealed) sealedTypeCount++;
                        }
                        
                        // 检查该文档类型是否有合规的文档
                        const hasCompliant = docs.some(doc => doc.compliant);
                        if (hasCompliant) compliantTypeCount++;
                    });
                    
                    cycleData.statistics.archivedDocs = archivedTypeCount;
                    cycleData.statistics.signedDocs = signedTypeCount;
                    cycleData.statistics.sealedDocs = sealedTypeCount;
                    cycleData.statistics.compliantDocs = compliantTypeCount;
                    
                    // 计算比率（只对有相应要求的文档类型进行计算）
                    cycleData.statistics.signatureRate = signRequirementCount > 0 ? (signedTypeCount / signRequirementCount * 100).toFixed(1) : '0.0';
                    cycleData.statistics.sealRate = sealRequirementCount > 0 ? (sealedTypeCount / sealRequirementCount * 100).toFixed(1) : '0.0';
                    cycleData.statistics.complianceRate = (compliantTypeCount / uploadedDocNames.size * 100).toFixed(1);
                }
            }
            
            reportData.cycles.push(cycleData);
        }
        
        // 计算项目总体统计
        reportData.statistics = {
            totalDocs: 0,
            uploadedDocs: 0,
            missingDocs: 0,
            archivedDocs: 0,
            signatureRate: 0,
            sealRate: 0,
            complianceRate: 0,
            signedDocs: 0,
            sealedDocs: 0,
            compliantDocs: 0
        };
        
        let totalUploadedDocs = 0;
        reportData.cycles.forEach(cycle => {
            reportData.statistics.totalDocs += cycle.statistics.totalDocs;
            reportData.statistics.uploadedDocs += cycle.statistics.uploadedDocs;
            reportData.statistics.missingDocs += cycle.statistics.missingDocs;
            reportData.statistics.archivedDocs += cycle.statistics.archivedDocs;
            reportData.statistics.signedDocs += cycle.statistics.signedDocs;
            reportData.statistics.sealedDocs += cycle.statistics.sealedDocs;
            reportData.statistics.compliantDocs += cycle.statistics.compliantDocs;
            totalUploadedDocs += cycle.statistics.uploadedDocs;
        });
        
        // 计算总体率
        if (totalUploadedDocs > 0) {
            reportData.statistics.signatureRate = (reportData.statistics.signedDocs / totalUploadedDocs * 100).toFixed(1);
            reportData.statistics.sealRate = (reportData.statistics.sealedDocs / totalUploadedDocs * 100).toFixed(1);
            reportData.statistics.complianceRate = (reportData.statistics.compliantDocs / totalUploadedDocs * 100).toFixed(1);
        }
        
        // 显示报告模态框
        showReportModal(reportData);
    } catch (error) {
        console.error('生成报告失败:', error);
        showNotification('生成报告失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 显示报告模态框
 */
function showReportModal(reportData) {
    // 检查模态框是否存在，如果不存在则创建
    let modal = document.getElementById('reportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reportModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    
    // 生成报告HTML
    let html = `
        <div class="modal-content wide" style="max-width: 1000px; width: 95%; max-height: 90vh; overflow-y: auto;">
            <span class="close" onclick="closeReportModal()">&times;</span>
            <h2>📋 项目文档审核报告</h2>
            
            <div class="report-header" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 6px;">
                <h3>${reportData.projectName}</h3>
                <p>生成时间: ${reportData.generatedAt}</p>
                
                <!-- 项目总体统计 -->
                ${reportData.statistics ? `
                <div class="project-statistics" style="margin-top: 15px; padding: 10px; background: #e7f3ff; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 16px; color: #2c3e50;">项目总体统计</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #666;">总文档数</div>
                            <div style="font-size: 20px; font-weight: bold; color: #333;">${reportData.statistics.totalDocs}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #666;">已上传</div>
                            <div style="font-size: 20px; font-weight: bold; color: #28a745;">${reportData.statistics.uploadedDocs}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #666;">缺失</div>
                            <div style="font-size: 20px; font-weight: bold; color: #dc3545;">${reportData.statistics.missingDocs}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #666;">已归档</div>
                            <div style="font-size: 20px; font-weight: bold; color: #1890ff;">${reportData.statistics.archivedDocs}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #666;">签字率</div>
                            <div style="font-size: 20px; font-weight: bold; color: #ffc107;">${reportData.statistics.signatureRate}%</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #666;">盖章率</div>
                            <div style="font-size: 20px; font-weight: bold; color: #ffc107;">${reportData.statistics.sealRate}%</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 14px; color: #666;">合格率</div>
                            <div style="font-size: 20px; font-weight: bold; color: #28a745;">${reportData.statistics.complianceRate}%</div>
                        </div>
                    </div>
                </div>
                
                <!-- 图表区域 -->
                <div class="report-charts" style="margin-top: 20px;">
                    <h4 style="margin: 0 0 15px 0; font-size: 16px; color: #2c3e50;">数据可视化</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                        <!-- 文档状态饼图 -->
                        <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <h5 style="margin: 0 0 10px 0; font-size: 14px; color: #495057;">文档状态分布</h5>
                            <canvas id="documentStatusChart" width="400" height="300"></canvas>
                        </div>
                        
                        <!-- 质量指标雷达图 -->
                        <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <h5 style="margin: 0 0 10px 0; font-size: 14px; color: #495057;">质量指标分析</h5>
                            <canvas id="qualityMetricsChart" width="400" height="300"></canvas>
                        </div>
                        
                        <!-- 文档缺失情况柱状图 -->
                        <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); grid-column: 1 / -1;">
                            <h5 style="margin: 0 0 10px 0; font-size: 14px; color: #495057;">文档缺失情况</h5>
                            <canvas id="missingDocsChart" width="800" height="300"></canvas>
                        </div>
                        
                        <!-- 各周期文档情况柱状图 -->
                        <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); grid-column: 1 / -1;">
                            <h5 style="margin: 0 0 10px 0; font-size: 14px; color: #495057;">各周期文档情况</h5>
                            <canvas id="cycleComparisonChart" width="800" height="300"></canvas>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
            
            <div class="report-content">
                ${reportData.cycles.map((cycle, index) => `
                    <div class="cycle-report" style="margin-bottom: 30px; padding: 20px; border: 1px solid #dee2e6; border-radius: 6px;">
                        <h4 style="margin-top: 0; margin-bottom: 15px; color: #495057;">${index + 1}. ${cycle.name}</h4>
                        
                        <div class="cycle-summary" style="margin-bottom: 15px; padding: 10px; background: #e7f3ff; border-radius: 4px;">
                            <p>要求文档类型: ${cycle.requiredDocs.length} 个</p>
                            <p>已上传文档类型: ${cycle.statistics.uploadedDocs} 个</p>
                            <p>缺失文档类型: ${cycle.missingDocs.length} 个</p>
                            
                            <!-- 周期统计数据 -->
                            ${cycle.statistics ? `
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #d1ecf1;">
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;">
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #666;">已归档</div>
                                        <div style="font-size: 16px; font-weight: bold; color: #1890ff;">${cycle.statistics.archivedDocs}</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #666;">签字率</div>
                                        <div style="font-size: 16px; font-weight: bold; color: #ffc107;">${cycle.statistics.signatureRate}%</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #666;">盖章率</div>
                                        <div style="font-size: 16px; font-weight: bold; color: #ffc107;">${cycle.statistics.sealRate}%</div>
                                    </div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #666;">合格率</div>
                                        <div style="font-size: 16px; font-weight: bold; color: #28a745;">${cycle.statistics.complianceRate}%</div>
                                    </div>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        
                        ${cycle.missingDocs.length > 0 ? `
                            <div class="missing-docs" style="margin-bottom: 15px;">
                                <h5 style="margin-bottom: 10px; color: #dc3545;">缺失文档:</h5>
                                <ul style="margin: 0; padding-left: 20px;">
                                    ${cycle.missingDocs.map((doc, index) => `<li>${doc._originalIndex || (index + 1)}. ${doc.name}</li>`).join('')}
                                </ul>
                            </div>
                        ` : `<p style="color: #28a745;">✓ 所有文档已上传</p>`}
                        
                        <div class="uploaded-docs" style="margin-top: 15px;">
                            <h5 style="margin-bottom: 10px;">已上传文档:</h5>
                            ${cycle.uploadedDocs.length > 0 ? (() => {
                                // 按文档类型(doc_name)分组
                                const docsByType = {};
                                cycle.uploadedDocs.forEach(doc => {
                                    const typeName = doc.doc_name || '未分类';
                                    if (!docsByType[typeName]) docsByType[typeName] = [];
                                    docsByType[typeName].push(doc);
                                });
                                
                                // 按前端显示顺序排序文档类型
                                const sortedDocTypes = cycle.requiredDocs
                                    .map(doc => doc.name)
                                    .filter(name => docsByType[name])
                                    .concat(Object.keys(docsByType).filter(name => !cycle.requiredDocs.some(doc => doc.name === name)));
                                
                                // 生成按类型分组的表格HTML
                                return sortedDocTypes.map((typeName, typeIndex) => {
                                    const docs = docsByType[typeName];
                                    if (!docs) return '';
                                    
                                    // 按层级目录分组文档（与前端显示逻辑一致）
                                    const docsByHierarchy = {};
                                    docs.forEach(doc => {
                                        let effectiveDir = doc.display_directory || doc.directory || '/';
                                        
                                        // 兼容老数据：如果 display_directory 为空且没有 root_directory，清理临时目录前缀
                                        if (!doc.display_directory && !doc.root_directory) {
                                            const dirValue = effectiveDir.replace(/^\//, '');
                                            const parts = dirValue.split('/');
                                            let realStartIdx = 0;
                                            for (let i = 0; i < parts.length; i++) {
                                                if (!/^tmp[a-z0-9]+_\d{14,}$/i.test(parts[i])) {
                                                    realStartIdx = i;
                                                    break;
                                                }
                                            }
                                            const meaningfulParts = parts.slice(realStartIdx);
                                            effectiveDir = meaningfulParts.length > 0 ? '/' + meaningfulParts.join('/') : '/';
                                        }
                                        
                                        const parts = effectiveDir === '/' ? [] : effectiveDir.split('/').filter(Boolean);
                                        const mainDir = parts[0] || '';
                                        const subPath = parts.slice(1).join('/') || '';
                                        
                                        if (!docsByHierarchy[mainDir]) docsByHierarchy[mainDir] = {};
                                        if (!docsByHierarchy[mainDir][subPath]) docsByHierarchy[mainDir][subPath] = [];
                                        docsByHierarchy[mainDir][subPath].push(doc);
                                    });
                                    
                                    // 获取该文档类型的要求
                                    const docConfig = cycle.requiredDocs.find(d => d.name === typeName);
                                    const requirement = docConfig?.requirement || '';
                                    const hasSignRequirement = requirement.includes('签字') || requirement.includes('签名');
                                    const hasSealRequirement = requirement.includes('盖章') || requirement.includes('章');
                                    const docIndex = docConfig?._originalIndex || (typeIndex + 1);
                                    
                                    // 辅助函数：渲染文件表格
                                    const renderDocTable = (dirDocs, dirLabel, indent) => `
                                        <div style="${indent ? 'margin-left: 20px; margin-bottom: 8px;' : 'margin-bottom: 8px;'}">
                                            <div style="font-size: 13px; font-weight: 500; color: #6c757d; margin-bottom: 5px;">
                                                📁 ${dirLabel} (${dirDocs.length}个文件)
                                            </div>
                                            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                                <thead>
                                                    <tr style="background: #f8f9fa;">
                                                        <th style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: left; width: 50px;">序号</th>
                                                        <th style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: left;">文件名</th>
                                                        <th style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: left;">上传时间</th>
                                                        <th style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: left;">状态</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${dirDocs.map((doc, fileIndex) => `
                                                        <tr ${doc.archived ? 'style="background-color: #e6f7ff;"' : ''}>
                                                            <td style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: center;">${fileIndex + 1}</td>
                                                            <td style="padding: 6px 8px; border: 1px solid #dee2e6;">
                                                                ${doc.original_filename || doc.filename} 
                                                                ${doc.archived ? '<span style="color: #1890ff; font-size: 11px; margin-left: 8px;">（已归档）</span>' : ''}
                                                                ${(() => {
                                                                    const note = doc.notes || doc.note || doc.doc_note || doc.remark || doc.remarks || doc.Remark || doc.Note || doc.NOTES || doc.REMARK || doc.REMARKS || '';
                                                                    return note ? `<span style="color: #ff6600; font-size: 12px; margin-left: 8px; font-weight: 600; background: #fff7e6; padding: 2px 6px; border-radius: 4px; border: 1px solid #ffd591;">💬 ${note}</span>` : '';
                                                                })()}
                                                            </td>
                                                            <td style="padding: 6px 8px; border: 1px solid #dee2e6;">${doc.upload_time ? new Date(doc.upload_time).toLocaleString() : '未知'}</td>
                                                            <td style="padding: 6px 8px; border: 1px solid #dee2e6;">
                                                                ${(() => {
                                                                    const getDocValue = (fieldName) => {
                                                                        if (doc[fieldName] !== undefined) return doc[fieldName];
                                                                        if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
                                                                        if (doc.attributes && doc.attributes[fieldName] !== undefined) return doc.attributes[fieldName];
                                                                        if (doc.extra_attributes && doc.extra_attributes[fieldName] !== undefined) return doc.extra_attributes[fieldName];
                                                                        return null;
                                                                    };
                                                                    if (!hasSignRequirement) return '';
                                                                    const hasNoSign = getDocValue('no_signature');
                                                                    const hasSigner = getDocValue('signer') || getDocValue('party_a_signer') || getDocValue('party_b_signer');
                                                                    if (hasNoSign) return '<span style="color: #52c41a; font-size: 12px; font-weight: 500;">✓ 无签字</span>';
                                                                    if (hasSigner) return '<span style="color: #52c41a; font-size: 12px; font-weight: 500;">✓ 有签字</span>';
                                                                    return '<span style="color: #fff; font-size: 12px; font-weight: 600; background: #f5222d; padding: 3px 8px; border-radius: 4px; display: inline-block;">✗ 无签字</span>';
                                                                })()}
                                                                ${(() => {
                                                                    if (!hasSealRequirement) return '';
                                                                    const getDocValue = (fieldName) => {
                                                                        if (doc[fieldName] !== undefined) return doc[fieldName];
                                                                        if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
                                                                        return null;
                                                                    };
                                                                    const hasNoSeal = getDocValue('no_seal');
                                                                    const hasSeal = getDocValue('has_seal_marked') || getDocValue('has_seal') || getDocValue('party_a_seal') || getDocValue('party_b_seal');
                                                                    if (hasNoSeal) return (hasSignRequirement ? '<span style="margin: 0 4px; color: #d9d9d9;">|</span>' : '') + '<span style="color: #52c41a; font-size: 12px; font-weight: 500;">✓ 无盖章</span>';
                                                                    if (hasSeal) return (hasSignRequirement ? '<span style="margin: 0 4px; color: #d9d9d9;">|</span>' : '') + '<span style="color: #52c41a; font-size: 12px; font-weight: 500;">✓ 有盖章</span>';
                                                                    return (hasSignRequirement ? '<span style="margin: 0 4px; color: #d9d9d9;">|</span>' : '') + '<span style="color: #fff; font-size: 12px; font-weight: 600; background: #f5222d; padding: 3px 8px; border-radius: 4px; display: inline-block;">✗ 无盖章</span>';
                                                                })()}
                                                                ${doc.archived ? ((hasSignRequirement || hasSealRequirement) ? '<span style="margin: 0 4px; color: #d9d9d9;">|</span>' : '') + '<span style="color: #1890ff; font-size: 12px; font-weight: 500;">✓ 已归档</span>' : ''}
                                                            </td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    `;
                                    
                                    return `
                                        <div style="margin-bottom: 20px;">
                                            <h6 style="margin: 10px 0 8px; color: #495057; font-size: 14px; font-weight: 600; background: #e9ecef; padding: 6px 10px; border-radius: 4px;">
                                                ${docIndex}. 📄 ${typeName} (${docs.length}个文件)
                                            </h6>
                                            <div style="margin-left: 20px; margin-top: 10px;">
                                                ${Object.entries(docsByHierarchy).map(([mainDir, subGroups]) => {
                                                    if (mainDir === '') {
                                                        // 根目录文件
                                                        const rootDocs = subGroups[''] || [];
                                                        if (rootDocs.length === 0) return '';
                                                        return renderDocTable(rootDocs, '根目录', false);
                                                    }
                                                    
                                                    const totalFiles = Object.values(subGroups).reduce((sum, arr) => sum + arr.length, 0);
                                                    const subGroupHtml = Object.entries(subGroups).map(([subPath, subDocs]) => {
                                                        const dirLabel = subPath || '根目录';
                                                        return renderDocTable(subDocs, dirLabel, true);
                                                    }).join('');
                                                    
                                                    return `
                                                        <div style="margin-bottom: 10px;">
                                                            <div style="font-size: 13px; font-weight: 600; color: #495057; margin-bottom: 5px;">
                                                                📁 ${mainDir} (${totalFiles}个文件)
                                                            </div>
                                                            ${subGroupHtml}
                                                        </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    `;
                                }).join('');
                            })() : `<p>无已上传文档</p>`}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="report-actions" style="margin-top: 30px; text-align: center;">
                <button class="btn btn-primary" onclick="downloadReportAsPDF()">下载PDF报告</button>
                <button class="btn btn-secondary" onclick="closeReportModal()">关闭</button>
            </div>
        </div>
    `;
    
    modal.innerHTML = html;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // 初始化图表
    if (reportData.statistics) {
        setTimeout(() => {
            // 文档状态饼图
            const statusCtx = document.getElementById('documentStatusChart');
            if (statusCtx) {
                new Chart(statusCtx, {
                    type: 'pie',
                    data: {
                        labels: ['已上传', '缺失', '已归档'],
                        datasets: [{
                            data: [
                                reportData.statistics.uploadedDocs,
                                reportData.statistics.missingDocs,
                                reportData.statistics.archivedDocs
                            ],
                            backgroundColor: [
                                '#28a745', // 绿色 - 已上传
                                '#dc3545', // 红色 - 缺失
                                '#1890ff'  // 蓝色 - 已归档
                            ],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom',
                            },
                            title: {
                                display: false
                            }
                        }
                    }
                });
            }
            
            // 质量指标雷达图
            const metricsCtx = document.getElementById('qualityMetricsChart');
            if (metricsCtx) {
                new Chart(metricsCtx, {
                    type: 'radar',
                    data: {
                        labels: ['签字率', '盖章率', '合格率'],
                        datasets: [{
                            label: '质量指标',
                            data: [
                                parseFloat(reportData.statistics.signatureRate),
                                parseFloat(reportData.statistics.sealRate),
                                parseFloat(reportData.statistics.complianceRate)
                            ],
                            backgroundColor: 'rgba(24, 144, 255, 0.2)',
                            borderColor: 'rgba(24, 144, 255, 1)',
                            borderWidth: 2,
                            pointBackgroundColor: 'rgba(24, 144, 255, 1)'
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            r: {
                                beginAtZero: true,
                                max: 100,
                                ticks: {
                                    stepSize: 20
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            }
            
            // 文档缺失情况柱状图
            const missingDocsCtx = document.getElementById('missingDocsChart');
            if (missingDocsCtx) {
                const cycleNames = reportData.cycles.map(cycle => cycle.name);
                const missingDocs = reportData.cycles.map(cycle => cycle.statistics.missingDocs);
                const totalDocs = reportData.cycles.map(cycle => cycle.statistics.totalDocs);
                
                new Chart(missingDocsCtx, {
                    type: 'bar',
                    data: {
                        labels: cycleNames,
                        datasets: [
                            {
                                label: '总文档数',
                                data: totalDocs,
                                backgroundColor: '#1890ff',
                                borderColor: '#1890ff',
                                borderWidth: 1
                            },
                            {
                                label: '缺失文档',
                                data: missingDocs,
                                backgroundColor: '#dc3545',
                                borderColor: '#dc3545',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: '文档数量'
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'bottom'
                            },
                            title: {
                                display: true,
                                text: '各周期文档缺失情况',
                                font: {
                                    size: 16
                                }
                            }
                        }
                    }
                });
            }
            
            // 各周期文档情况柱状图
            const cycleCtx = document.getElementById('cycleComparisonChart');
            if (cycleCtx) {
                const cycleNames = reportData.cycles.map(cycle => cycle.name);
                const uploadedDocs = reportData.cycles.map(cycle => cycle.statistics.uploadedDocs);
                const missingDocs = reportData.cycles.map(cycle => cycle.statistics.missingDocs);
                const complianceRates = reportData.cycles.map(cycle => parseFloat(cycle.statistics.complianceRate));
                
                new Chart(cycleCtx, {
                    type: 'bar',
                    data: {
                        labels: cycleNames,
                        datasets: [
                            {
                                label: '已上传文档',
                                data: uploadedDocs,
                                backgroundColor: '#28a745',
                                borderColor: '#28a745',
                                borderWidth: 1
                            },
                            {
                                label: '缺失文档',
                                data: missingDocs,
                                backgroundColor: '#dc3545',
                                borderColor: '#dc3545',
                                borderWidth: 1
                            },
                            {
                                label: '合格率 (%)',
                                data: complianceRates,
                                backgroundColor: '#1890ff',
                                borderColor: '#1890ff',
                                borderWidth: 1,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: '文档数量'
                                }
                            },
                            y1: {
                                beginAtZero: true,
                                max: 100,
                                position: 'right',
                                title: {
                                    display: true,
                                    text: '合格率 (%)'
                                },
                                grid: {
                                    drawOnChartArea: false
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'bottom'
                            }
                        }
                    }
                });
            }
        }, 100);
    }
}

/**
 * 关闭报告模态框
 */
function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
}

/**
 * 下载报告为PDF
 */
function downloadReportAsPDF() {
    // 这里使用html2pdf库将报告转换为PDF
    // 由于我们没有直接引入html2pdf库，这里使用一个简单的实现
    // 实际项目中应该使用专业的PDF生成库
    
    const reportModal = document.getElementById('reportModal');
    if (!reportModal) return;
    
    // 获取整个报告内容，包括图表
    const reportHeader = document.querySelector('.report-header');
    const reportContent = document.querySelector('.report-content');
    
    if (!reportHeader || !reportContent) return;
    
    // 处理Canvas图表，将其转换为图片
    const canvases = document.querySelectorAll('canvas');
    const canvasData = [];
    
    canvases.forEach((canvas, index) => {
        // 将Canvas转换为base64图片
        const dataURL = canvas.toDataURL('image/png');
        canvasData.push(dataURL);
        // 临时替换Canvas为图片
        const img = document.createElement('img');
        img.src = dataURL;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.className = 'canvas-replacement';
        canvas.parentNode.appendChild(img);
        canvas.style.display = 'none';
    });
    
    // 创建一个新的窗口
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>项目文档审核报告</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1, h2, h3, h4, h5 { color: #333; }
                .cycle-report { margin-bottom: 30px; padding: 20px; border: 1px solid #dee2e6; border-radius: 6px; }
                .cycle-summary { margin-bottom: 15px; padding: 10px; background: #e7f3ff; border-radius: 4px; }
                table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 10px; }
                th, td { padding: 8px; border: 1px solid #dee2e6; text-align: left; }
                th { background: #f8f9fa; }
                .missing-docs { color: #dc3545; }
                .uploaded-docs { margin-top: 15px; }
                .archived-row { background-color: #e6f7ff; }
                .archived-text { color: #1890ff; font-size: 12px; margin-left: 8px; }
                .report-charts { margin-top: 20px; }
                .report-charts canvas { max-width: 100%; height: auto; }
                .canvas-replacement { max-width: 100%; height: auto; }
            </style>
        </head>
        <body>
            <h1>项目文档审核报告</h1>
            <h2>${appState.projectConfig.name || '未知项目'}</h2>
            <p>生成时间: ${new Date().toLocaleString()}</p>
            ${reportHeader.innerHTML}
            ${reportContent.innerHTML}
        </body>
        </html>
    `);
    
    // 恢复Canvas显示
    canvases.forEach((canvas, index) => {
        canvas.style.display = 'block';
        const img = canvas.parentNode.querySelector('.canvas-replacement');
        if (img) {
            img.remove();
        }
    });
    
    printWindow.document.close();
    printWindow.print();
}

// 暴露给全局作用域
window.closeReportModal = closeReportModal;
window.downloadReportAsPDF = downloadReportAsPDF;
window.markDocumentNotInvolved = markDocumentNotInvolved;
// 确保generateReport函数被添加到全局作用域
if (typeof window !== 'undefined') {
    window.generateReport = generateReport;
}

/**
 * 尝试使用本地预览文档
 */
export function tryLocalPreview(docId, localPreviewUrl) {
    // 创建新的预览内容
    const previewContent = `
        <div class="preview-local">
            <div class="preview-header">
                <h3>本地预览</h3>
                <button class="close-btn" onclick="document.getElementById('previewModal').style.display='none'">×</button>
            </div>
            <div class="preview-body">
                <iframe src="${localPreviewUrl}" class="preview-iframe" frameborder="0" onload="handleIframeLoad(this)" onerror="handlePreviewError(this)"></iframe>
            </div>
        </div>
    `;
    
    // 更新模态框内容
    const modal = document.getElementById('previewModal');
    if (modal) {
        modal.innerHTML = previewContent;
    }
}

// 格式化日期输入
window.formatDateInput = function(input) {
    const value = input.value.trim();
    if (!value) return;
    
    // 匹配不同的日期格式
    let formattedDate = '';
    
    // 匹配 YYYY-MM-DD 格式
    const ymdRegex = /^\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2}$/;
    // 匹配 YYYY-MM 格式
    const ymRegex = /^\d{4}[-/\.]\d{1,2}$/;
    // 匹配 YY-MM-DD 格式
    const yymmddRegex = /^\d{2}[-/\.]\d{1,2}[-/\.]\d{1,2}$/;
    // 匹配 YY-MM 格式
    const yymmRegex = /^\d{2}[-/\.]\d{1,2}$/;
    
    if (ymdRegex.test(value)) {
        // 处理 YYYY-MM-DD 格式
        const parts = value.split(/[-/\.]/);
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
    } else if (ymRegex.test(value)) {
        // 处理 YYYY-MM 格式
        const parts = value.split(/[-/\.]/);
        const year = parts[0];
        const month = parts[1].padStart(2, '0');
        formattedDate = `${year}-${month}`;
    } else if (yymmddRegex.test(value)) {
        // 处理 YY-MM-DD 格式，自动补全年份
        const parts = value.split(/[-/\.]/);
        const year = '20' + parts[0]; // 假设是21世纪
        const month = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        formattedDate = `${year}-${month}-${day}`;
    } else if (yymmRegex.test(value)) {
        // 处理 YY-MM 格式，自动补全年份
        const parts = value.split(/[-/\.]/);
        const year = '20' + parts[0]; // 假设是21世纪
        const month = parts[1].padStart(2, '0');
        formattedDate = `${year}-${month}`;
    } else {
        // 尝试其他格式
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            formattedDate = `${year}-${month}-${day}`;
        }
    }
    
    if (formattedDate) {
        input.value = formattedDate;
    }
};

// 将函数暴露到全局范围
if (typeof window !== 'undefined') {
    window.selectAllMaintainDocuments = selectAllMaintainDocuments;
    window.deselectAllMaintainDocuments = deselectAllMaintainDocuments;
    window.loadUploadedDocuments = loadUploadedDocuments;
    window.handlePreviewError = handlePreviewError;
    window.handleIframeLoad = handleIframeLoad;
    window.handleDownloadClick = handleDownloadClick;
    window.confirmDeleteDocument = confirmDeleteDocument;
    window.tryLocalPreview = tryLocalPreview;
    window.smartRecognizeDocument = smartRecognizeDocument;
    window.initDragAndDrop = initDragAndDrop;
    window.formatDateInput = formatDateInput;
    window.openMaintainModal = openMaintainModal;
    window.autoSearchFiles = autoSearchFiles;  // HTML 中 oninput 调用
    window.handleQuickApprove = handleQuickApproveAction;
    window.handleWithdrawArchive = handleWithdrawArchiveAction;
    window.handleContractorQuickApprove = handleContractorQuickApproveAction;
    window.showApprovalTimelineModal = showApprovalTimeline;
    window.handleRenameDirectory = handleRenameDirectoryAction;
    // 编辑表单中选择目录按钮
    window.pickEditDirectory = async function() {
        // 收集已存在的目录
        let existingDirectories = new Set();
        if (appState.projectConfig && appState.currentCycle) {
            const cycleDocs = appState.projectConfig.documents[appState.currentCycle];
            if (cycleDocs && cycleDocs.uploaded_docs) {
                cycleDocs.uploaded_docs.forEach(doc => {
                    if (doc.directory) existingDirectories.add(doc.directory);
                });
            }
            if (cycleDocs && cycleDocs.categories) {
                for (const docName in cycleDocs.categories) {
                    if (cycleDocs.categories[docName]) {
                        cycleDocs.categories[docName].forEach(cat => existingDirectories.add(cat));
                    }
                }
            }
        }
        try {
            const { getCycleDocuments } = await import('./api.js');
            const docs = await getCycleDocuments(appState.currentCycle);
            if (docs && Array.isArray(docs)) {
                docs.forEach(doc => {
                    if (doc.directory) existingDirectories.add(doc.directory);
                });
            }
        } catch(e) { /* ignore */ }

        const dirsArray = Array.from(existingDirectories).sort();
        showDirectorySelectModal('选择目录', dirsArray, (directory) => {
            if (directory) {
                const dirInput = document.getElementById('editDirectory');
                if (dirInput) dirInput.value = directory;
            }
        });
    };
    // 选择文档弹窗中的"从此开始记录目录"按钮（支持多选，点击切换）
    window.setSelectRootDirectory = function(dirPath) {
        if (!appState.zipRootDirectories) appState.zipRootDirectories = [];
        const idx = appState.zipRootDirectories.indexOf(dirPath);
        if (idx >= 0) {
            appState.zipRootDirectories.splice(idx, 1);  // 已选中 → 取消
        } else {
            appState.zipRootDirectories.push(dirPath);   // 未选中 → 选中
        }
        // 更新所有按钮样式
        const listEl = document.getElementById('zipFilesList');
        if (listEl) {
            listEl.querySelectorAll('.set-root-btn').forEach(btn => {
                const isThis = appState.zipRootDirectories.includes(btn.dataset.dir);
                btn.style.cssText = isThis
                    ? 'background:#28a745;color:white;border:1px solid #1e7e34;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap;font-weight:bold;flex-shrink:0;'
                    : 'background:#fff;border:1px solid #28a745;color:#28a745;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap;font-weight:bold;flex-shrink:0;';
                btn.textContent = isThis ? '✓ 从此开始记录' : '从此开始记录目录';
            });
        }
    };
    // 暴露文档操作函数（供内联onclick调用）
    window.openEditModal = openEditModal;
    window.handleDeleteDocument = handleDeleteDocument;
    window.unarchiveDocument = unarchiveDocument;
    window.openUploadModal = openUploadModal;
    window.batchArchiveCycle = batchArchiveCycle;
    window.handleQuickApprove = handleQuickApproveAction;
    window.handleContractorQuickApprove = handleContractorQuickApproveAction;
    window.showApprovalTimelineModal = showApprovalTimeline;
    window.initUploadMethodTabs = initUploadMethodTabs;
}

/**
 * 初始化拖拽上传功能
 */
export function initDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    
    if (!dropZone || !fileInput) return;
    
    // 点击选择文件（使用 onclick 赋值避免重复绑定）
    dropZone.onclick = () => {
        fileInput.click();
    };
    
    // 文件选择后仅更新待上传列表，实际上传由“确认归档”触发
    fileInput.onchange = async (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            const uploadedFilesList = document.getElementById('uploadedFilesList');
            if (uploadedFilesList) {
                uploadedFilesList.innerHTML = '';
            }
            // 显示文件信息
            for (const file of files) {
                showUploadedFile(file);
                console.log('选择的文件:', file.name);
            }
        }
    };
    
    // 文件夹选择后处理（使用 onchange 赋值避免重复绑定）
    if (folderInput) {
        folderInput.onchange = async (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                await handleFolderUpload(files);
            }
        };
    }
    
    // 拖拽事件（使用赋值避免重复绑定）
    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    };
    
    dropZone.ondragleave = () => {
        dropZone.classList.remove('drag-over');
    };
    
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // 检查是否是文件夹
            if (files[0].webkitRelativePath) {
                // 文件夹上传仍然使用原逻辑
                handleFolderUpload(files);
            } else {
                // 将拖拽的文件设置到文件输入中
                const fileInput = document.getElementById('fileInput');
                if (fileInput) {
                    // 使用 DataTransfer 来设置多个文件
                    const dataTransfer = new DataTransfer();
                    for (const file of files) {
                        dataTransfer.items.add(file);
                    }
                    fileInput.files = dataTransfer.files;
                    
                    // 显示文件信息
                    for (const file of files) {
                        showUploadedFile(file);
                        console.log('拖拽的文件:', file.name);
                    }
                }
            }
        }
    };
}

/**
 * 异步上传文件
 */
async function handleAsyncUpload(file) {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    // 显示进度条
    const uploadProgress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    if (uploadProgress) uploadProgress.style.display = 'flex';
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', appState.currentProjectId);
    formData.append('project_name', appState.projectConfig ? appState.projectConfig.name : '');
    formData.append('cycle', appState.currentCycle);
    formData.append('doc_name', appState.currentDocument);
    
    try {
        // 模拟进度
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 10;
            if (progress <= 90) {
                if (progressBar) progressBar.style.width = progress + '%';
                if (progressText) progressText.textContent = progress + '%';
            }
        }, 200);
        
        const result = await uploadDocument(formData);
        
        clearInterval(progressInterval);
        
        if (result.status === 'success') {
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
            
            showNotification('文件上传成功，正在智能识别...', 'success');
            
            // 刷新已上传文件列表（从服务端读取，避免重复显示）
            if (appState.currentCycle && appState.currentDocument) {
                await loadMaintainDocumentsList(appState.currentCycle, appState.currentDocument);
            }
            
            // 自动触发智能识别
            setTimeout(() => {
                smartRecognizeDocument();
            }, 500);
            
            // 刷新周期文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('上传失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('上传文档失败:', error);
        showNotification('上传失败: ' + error.message, 'error');
    } finally {
        setTimeout(() => {
            if (uploadProgress) uploadProgress.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
            if (progressText) progressText.textContent = '0%';
        }, 1000);
    }
}

/**
 * 处理文件夹上传
 */
async function handleFolderUpload(files) {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // 过滤出支持的文件类型
        const supportedFiles = Array.from(files).filter(file => {
            const ext = file.name.toLowerCase().split('.').pop();
            return ['pdf', 'doc', 'docx', 'xlsx', 'xls', 'jpg', 'jpeg', 'png', 'bmp', 'tiff'].includes(ext);
        });
        
        if (supportedFiles.length === 0) {
            showNotification('文件夹中没有支持的文件类型', 'error');
            return;
        }
        
        showNotification(`开始上传 ${supportedFiles.length} 个文件...`, 'info');
        
        let uploadedCount = 0;
        
        for (const file of supportedFiles) {
            try {
                const result = await uploadDocumentFile(file);
                if (result.status === 'success') {
                    uploadedCount++;
                }
            } catch (error) {
                console.error('上传文件失败:', error);
            }
        }
        
        showNotification(`成功上传 ${uploadedCount} 个文件`, 'success');
        
        // 刷新文档列表
        await renderCycleDocuments(appState.currentCycle);
        
    } catch (error) {
        console.error('上传文件夹失败:', error);
        showNotification('上传文件夹失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 上传单个文件
 */
async function uploadDocumentFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_id', appState.currentProjectId);
    formData.append('project_name', appState.projectConfig ? appState.projectConfig.name : '');
    formData.append('cycle', appState.currentCycle);
    formData.append('doc_name', appState.currentDocument);

    // 目录上传时带上相对目录和根目录，便于后端记录并在打包时还原目录结构
    const relativePath = (file.webkitRelativePath || '').replace(/\\/g, '/');
    if (relativePath) {
        const pathParts = relativePath.split('/').filter(Boolean);
        if (pathParts.length > 0) {
            formData.append('root_directory', pathParts[0]);
        }
        if (pathParts.length > 2) {
            formData.append('source_dir', pathParts.slice(1, -1).join('/'));
        } else {
            formData.append('source_dir', '/');
        }
    }
    
    const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
    });
    
    return await response.json();
}

/**
 * 智能识别文档属性
 */
export async function smartRecognizeDocument() {
    // 获取已上传的文件
    const uploadedFileItems = document.querySelectorAll('.uploaded-file-item');
    if (uploadedFileItems.length === 0) {
        showNotification('请先上传文件', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        // 获取当前文档的要求
        let requirement = '';
        if (appState.projectConfig && appState.currentCycle && appState.currentDocument) {
            const cycleDocs = appState.projectConfig.documents[appState.currentCycle];
            if (cycleDocs && cycleDocs.required_docs) {
                const docInfo = cycleDocs.required_docs.find(doc => doc.name === appState.currentDocument);
                if (docInfo) {
                    requirement = docInfo.requirement || '';
                    // 处理特殊情况：甲方提供 = 无特殊要求
                    if (requirement === '甲方提供') {
                        requirement = '';
                    }
                }
            }
        }
        
        const files = elements.fileInput?.files;
        if (!files || files.length === 0) {
            showNotification('请先选择文件后再识别', 'error');
            return;
        }

        const firstFile = files[0];
        const formData = new FormData();
        formData.append('file', firstFile);
        formData.append('party_a', appState.projectConfig?.party_a || '');
        formData.append('party_b', appState.projectConfig?.party_b || '');
        formData.append('requirement', requirement || '');

        const resp = await fetch('/api/documents/smart-recognize', {
            method: 'POST',
            body: formData
        });
        const result = await resp.json();
        if (result.status !== 'success' || !result.data) {
            throw new Error(result.message || '识别失败');
        }
        const recognitionData = result.data;
        
        // 自动填充识别结果（动态查找元素）
        const setValue = (id, value) => {
            const element = document.getElementById(id);
            if (element && value !== undefined && value !== null) {
                if (element.type === 'checkbox') {
                    element.checked = Boolean(value);
                } else {
                    element.value = value;
                }
            }
        };
        
        setValue('docDate', recognitionData.doc_date);
        setValue('signDate', recognitionData.sign_date);
        setValue('signer', recognitionData.signer);
        setValue('hasSeal', recognitionData.has_seal);
        setValue('partyASeal', recognitionData.party_a_seal);
        setValue('partyBSeal', recognitionData.party_b_seal);
        setValue('noSeal', recognitionData.no_seal);
        setValue('noSignature', recognitionData.no_signature);
        setValue('otherSeal', recognitionData.other_seal);
        setValue('docNumber', recognitionData.doc_number);
        
        // 更新上传文件列表中的识别结果
        uploadedFileItems.forEach(item => {
            const fileName = item.dataset.filename;
            showRecognitionResult(fileName, recognitionData);
        });
        
        // 显示识别结果模态框
        showRecognitionResultModal(uploadedFileItems[0].dataset.filename, recognitionData);
        
        showNotification('智能识别成功', 'success');
    } catch (error) {
        console.error('智能识别失败:', error);
        showNotification('智能识别失败，请手动填写', 'warning');
    } finally {
        showLoading(false);
    }
}

/**
 * 显示智能识别结果模态框
 */
function showRecognitionResultModal(fileName, recognitionData) {
    // 检查模态框是否存在
    let modal = document.getElementById('recognitionModal');
    if (!modal) {
        // 创建模态框
        modal = document.createElement('div');
        modal.id = 'recognitionModal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }
    
    // 生成识别结果HTML
    const resultHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>智能识别结果</h2>
                <button class="close-btn" onclick="document.getElementById('recognitionModal').classList.remove('show')">×</button>
            </div>
            <div class="modal-body">
                <div class="recognition-info">
                    <p><strong>文件名:</strong> ${fileName}</p>
                    <p><strong>识别时间:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <h3>识别到的信息</h3>
                <div class="recognition-results">
                    <div class="result-item">
                        <label>文档日期:</label>
                        <span>${recognitionData.doc_date || '未识别'}</span>
                    </div>
                    <div class="result-item">
                        <label>签字日期:</label>
                        <span>${recognitionData.sign_date || '未识别'}</span>
                    </div>
                    <div class="result-item">
                        <label>签字人:</label>
                        <span>${recognitionData.signer || (recognitionData.signature_detected && !recognitionData.no_signature ? '有签名待确认' : '未识别')}</span>
                    </div>
                    <div class="result-item">
                        <label>已盖章:</label>
                        <span>${recognitionData.has_seal ? '是' : '否'}</span>
                    </div>
                    <div class="result-item">
                        <label>甲方盖章:</label>
                        <span>${recognitionData.party_a_seal ? '是' : '否'}</span>
                    </div>
                    <div class="result-item">
                        <label>乙方盖章:</label>
                        <span>${recognitionData.party_b_seal ? '是' : '否'}</span>
                    </div>
                    <div class="result-item">
                        <label>不涉及盖章:</label>
                        <span>${recognitionData.no_seal ? '是' : '否'}</span>
                    </div>
                    <div class="result-item">
                        <label>不涉及签字:</label>
                        <span>${recognitionData.no_signature ? '是' : '否'}</span>
                    </div>
                    <div class="result-item">
                        <label>其它盖章:</label>
                        <span>${recognitionData.other_seal || '无'}</span>
                    </div>
                    <div class="result-item">
                        <label>发文号:</label>
                        <span>${recognitionData.doc_number || '未识别'}</span>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="document.getElementById('recognitionModal').classList.remove('show')">
                        确认
                    </button>
                    <button class="btn btn-secondary" onclick="document.getElementById('dynamicDocInfo').scrollIntoView({behavior: 'smooth'})
                        document.getElementById('recognitionModal').classList.remove('show')">
                        编辑附加信息
                    </button>
                </div>
            </div>
        </div>
    `;
    
    modal.innerHTML = resultHTML;
    modal.classList.add('show');
}

/**
 * 批量操作智能识别结果
 */
function batchProcessRecognitionResults() {
    // 这里可以实现批量操作逻辑
    showNotification('批量操作功能开发中', 'info');
}

/**
 * 更新已选择的文档数量
 */
export function updateSelectedCount() {
    const selectedCheckboxes = document.querySelectorAll('.document-checkbox:checked');
    const selectedCount = selectedCheckboxes.length;
    const selectedCountElement = document.getElementById('selectedCount');
    
    if (selectedCountElement) {
        selectedCountElement.textContent = `已选择 ${selectedCount} 个文档`;
    }
    
    // 启用/禁用批量操作按钮
    const batchEditBtn = document.getElementById('batchEditBtn');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    const batchMoveBtn = document.getElementById('batchMoveBtn');
    
    if (batchEditBtn) batchEditBtn.disabled = selectedCount === 0;
    if (batchDeleteBtn) batchDeleteBtn.disabled = selectedCount === 0;
    if (batchMoveBtn) batchMoveBtn.disabled = selectedCount === 0;
}

/**
 * 获取选中文档的当前属性状态
 * @param {Array} docIds - 文档ID数组
 * @returns {Object} - 各属性的状态统计（使camelCase id作为key）
 */
function getSelectedDocsAttributeStatus(docIds) {
    const status = {};
    const docs = [];
    
    // 从项目配置中获取文档数据
    if (appState.projectConfig && appState.projectConfig.documents) {
        for (const [cycleKey, cycleInfo] of Object.entries(appState.projectConfig.documents)) {
            if (cycleInfo.uploaded_docs) {
                for (const doc of cycleInfo.uploaded_docs) {
                    const docId = doc.doc_id || doc.id || `${cycleKey}_${doc.doc_name || doc.name}_${doc.upload_time || Date.now()}`;
                    if (docIds.includes(docId)) {
                        docs.push(doc);
                    }
                }
            }
        }
    }
    
    if (docs.length === 0) return status;
    
    // 定义需要检查的属性（同时支持snake_case和camelCase）
    const attributes = [
        { key: 'party_a_seal', camelKey: 'partyASeal', name: '甲方盖章' },
        { key: 'party_b_seal', camelKey: 'partyBSeal', name: '乙方盖章' },
        { key: 'has_seal_marked', camelKey: 'hasSealMarked', name: '已盖章' },
        { key: 'has_seal', camelKey: 'hasSeal', name: '已盖章' },
        { key: 'no_seal', camelKey: 'noSeal', name: '不涉及盖章' },
        { key: 'party_a_signer', camelKey: 'partyASigner', name: '甲方签字' },
        { key: 'party_b_signer', camelKey: 'partyBSigner', name: '乙方签字' },
        { key: 'signer', camelKey: 'signer', name: '签字人' },
        { key: 'no_signature', camelKey: 'noSignature', name: '不涉及签字' },
        { key: 'sign_date', camelKey: 'signDate', name: '签字日期' },
        { key: 'doc_date', camelKey: 'docDate', name: '文档日期' }
    ];
    
    // 统计每个属性的完成状态
    attributes.forEach(attr => {
        let completedCount = 0;
        
        docs.forEach(doc => {
            const value = doc[attr.key] || doc[`_${attr.key}`];
            if (value && value !== '' && value !== false && value !== 'false') {
                completedCount++;
            }
        });
        
        let state = 'empty';
        if (completedCount === docs.length && docs.length > 0) {
            state = 'full'; // 全部完成
        } else if (completedCount > 0) {
            state = 'partial'; // 部分完成
        }
        
        // 使用camelKey作为status的key，与parseRequirementAttributes返回的id一致
        status[attr.camelKey] = state;
    });
    
    // 辅助函数：生成友好的显示名称
    const getFriendlyDisplayName = (key) => {
        const match = key.match(/^custom_\d+_(.+)$/);
        if (match) {
            return match[1].replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
        }
        return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    };
    
    // 获取自定义属性定义（优先使用配置中的）
    let customDefs = appState.projectConfig?.custom_attribute_definitions || [];
    
    // 如果配置中没有，从文档中收集所有自定义属性字段
    if (customDefs.length === 0) {
        const predefinedKeys = new Set(['doc_date', 'signer', 'party_a_signer', 'party_b_signer', 'sign_date', 'no_signature', 'party_a_seal', 'party_b_seal', 'has_seal_marked', 'has_seal', 'no_seal', 'other_seal', 'not_involved', 'id', 'doc_name', 'filename', 'original_filename', 'upload_time', 'directory', 'cycle', 'file_path', 'source', 'file_size', 'doc_id', 'project_name', 'project_id']);
        const foundCustomKeys = new Set();
        
        docs.forEach(doc => {
            Object.keys(doc).forEach(key => {
                if (!predefinedKeys.has(key) && !key.startsWith('_')) {
                    foundCustomKeys.add(key);
                }
            });
        });
        
        foundCustomKeys.forEach(key => {
            customDefs.push({
                id: key,
                name: getFriendlyDisplayName(key),
                type: 'checkbox'
            });
        });
    }
    
    // 统计自定义属性的完成状态
    customDefs.forEach(attrDef => {
        let completedCount = 0;
        
        docs.forEach(doc => {
            const value = doc[attrDef.id] || doc[`_${attrDef.id}`];
            if (value !== undefined && value !== null && value !== '' && value !== false && value !== 'false') {
                completedCount++;
            }
        });
        
        let state = 'empty';
        if (completedCount === docs.length && docs.length > 0) {
            state = 'full';
        } else if (completedCount > 0) {
            state = 'partial';
        }
        
        // 使用原始id作为key（与generateDynamicEditForm中一致）
        status[attrDef.id] = state;
    });
    
    return status;
}

/**
 * 处理批量编辑 - 复用编辑文档模态框
 */
export function handleBatchEdit() {
    const selectedCheckboxes = document.querySelectorAll('.document-checkbox:checked');
    const selectedDocIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择文档', 'error');
        return;
    }
    
    // 获取选中文档的当前属性状态
    const attrStatus = getSelectedDocsAttributeStatus(selectedDocIds);
    
    // 从项目配置中获取文档要求
    let requirement = '';
    let attributes = [];
    
    if (appState.projectConfig && appState.currentCycle && appState.currentDocument) {
        const cycleDocs = appState.projectConfig.documents[appState.currentCycle];
        if (cycleDocs && cycleDocs.required_docs) {
            const docInfo = cycleDocs.required_docs.find(doc => doc.name === appState.currentDocument);
            if (docInfo) {
                requirement = docInfo.requirement || '无特殊要求';
                // 解析附加属性
                attributes = parseRequirementAttributes(requirement);
                
                // 辅助函数：生成友好的显示名称
                const getFriendlyDisplayName = (key) => {
                    const match = key.match(/^custom_\d+_(.+)$/);
                    if (match) {
                        return match[1].replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                    }
                    return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                };
                
                // 获取自定义属性定义（优先使用配置中的，如果没有则从attributes推断）
                let customAttrDefs = appState.projectConfig?.custom_attribute_definitions || [];
                
                // 如果配置中没有自定义属性定义，但从docInfo.attributes中有自定义属性，动态构建定义
                if (customAttrDefs.length === 0 && docInfo.attributes) {
                    const predefinedAttrKeys = ['party_a_sign', 'party_b_sign', 'party_a_seal', 'party_b_seal', 
                        'need_doc_number', 'need_doc_date', 'need_sign_date'];
                    
                    Object.keys(docInfo.attributes).forEach(attrKey => {
                        if (!predefinedAttrKeys.includes(attrKey) && docInfo.attributes[attrKey] === true) {
                            const displayName = getFriendlyDisplayName(attrKey);
                            
                            customAttrDefs.push({
                                id: attrKey,
                                name: displayName,
                                type: 'checkbox'
                            });
                        }
                    });
                    
                    console.log('[handleBatchEdit] 动态构建的自定义属性定义:', customAttrDefs);
                }
                
                // 添加自定义属性
                customAttrDefs.forEach(attrDef => {
                    if (docInfo.attributes && docInfo.attributes[attrDef.id]) {
                        attributes.push({
                            type: attrDef.type === 'checkbox' ? 'checkbox' : 'text',
                            id: attrDef.id,
                            name: attrDef.id,
                            label: attrDef.name,
                            placeholder: `输入${attrDef.name}`,
                            isCustom: true
                        });
                    }
                });
            }
        }
    }
    
    // 复用一个已有的编辑模态框（使用 editDocModal）
    const modal = document.getElementById('editDocModal');
    const formContainer = document.getElementById('editDocForm');
    const titleEl = modal ? modal.querySelector('h2') : null;
    
    if (!modal || !formContainer) {
        showNotification('无法打开编辑模态框', 'error');
        return;
    }
    
    // 生成批量编辑表单HTML（表格布局）
    let formHtml = `
        <input type="hidden" id="editDocId" value="${selectedDocIds.join(',')}">
        <input type="hidden" id="batchMode" value="true">
        <table class="edit-form-table">
    `;
    
    // 根据属性状态获取标签样式
    const getLabelStyle = (attrKey) => {
        const status = attrStatus[attrKey];
        if (status === 'full') {
            return 'style="background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; display: inline-block;"';
        } else if (status === 'partial') {
            return 'style="background: #fff; color: #28a745; border: 1px solid #28a745; padding: 2px 8px; border-radius: 4px; font-size: 12px; display: inline-block;"';
        }
        return '';
    };
    
    // 两两配对，每行显示两个属性
    for (let i = 0; i < attributes.length; i += 2) {
        const attr1 = attributes[i];
        const attr2 = attributes[i + 1];
        
        let rowHtml = '<tr>';
        
        // 第一个属性
        if (attr1) {
            // 确定属性key（使用id，因为attrStatus的key已经是camelCase了）
            const attr1Key = attr1.id || '';
            const attr1Status = attr1Key ? attrStatus[attr1Key] : 'empty';
            const attr1Checked = attr1Status === 'full' ? 'checked' : '';
            const attr1LabelStyle = getLabelStyle(attr1Key);
            
            if (attr1.type === 'date') {
                rowHtml += `
                    <td class="label-cell"><label ${attr1LabelStyle}>${attr1.label}</label></td>
                    <td class="input-cell"><input type="date" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" ${attr1.isCustom ? `data-field-name="${attr1.name}"` : ''} value=""></td>
                `;
            } else if (attr1.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label ${attr1LabelStyle}>${attr1.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" ${attr1.isCustom ? `data-field-name="${attr1.name}"` : ''} placeholder="${attr1.placeholder || ''}" value=""></td>
                `;
            } else if (attr1.type === 'checkbox' && attr1.inline) {
                rowHtml += `
                    <td class="label-cell"><label ${attr1LabelStyle}>${attr1.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" ${attr1.isCustom ? `data-field-name="${attr1.name}"` : ''} ${attr1Checked}>
                            <span>${attr1.label}</span>
                        </label>
                    </td>
                `;
            } else if (attr1.type === 'checkbox_group') {
                const optionsHtml = attr1.options.map(opt => {
                    const optStatus = attrStatus[opt.id];
                    const optChecked = optStatus === 'full' ? 'checked' : '';
                    const optLabelStyle = getLabelStyle(opt.id);
                    return `
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${opt.id.charAt(0).toUpperCase() + opt.id.slice(1)}" ${optChecked}>
                            <span ${optLabelStyle}>${opt.label}</span>
                        </label>
                    `;
                }).join('');
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell checkbox-group">${optionsHtml}</td>
                `;
            }
        } else {
            rowHtml += '<td colspan="2"></td>';
        }
        
        // 第二个属性
        if (attr2) {
            // 确定属性key
            const attr2Key = attr2.id || '';
            const attr2Status = attr2Key ? attrStatus[attr2Key] : 'empty';
            const attr2Checked = attr2Status === 'full' ? 'checked' : '';
            const attr2LabelStyle = getLabelStyle(attr2Key);
            
            if (attr2.type === 'date') {
                rowHtml += `
                    <td class="label-cell"><label ${attr2LabelStyle}>${attr2.label}</label></td>
                    <td class="input-cell"><input type="date" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" ${attr2.isCustom ? `data-field-name="${attr2.name}"` : ''} value=""></td>
                `;
            } else if (attr2.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label ${attr2LabelStyle}>${attr2.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" ${attr2.isCustom ? `data-field-name="${attr2.name}"` : ''} placeholder="${attr2.placeholder || ''}" value=""></td>
                `;
            } else if (attr2.type === 'checkbox' && attr2.inline) {
                rowHtml += `
                    <td class="label-cell"><label ${attr2LabelStyle}>${attr2.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" ${attr2.isCustom ? `data-field-name="${attr2.name}"` : ''} ${attr2Checked}>
                            <span>${attr2.label}</span>
                        </label>
                    </td>
                `;
            } else if (attr2.type === 'checkbox_group') {
                const optionsHtml = attr2.options.map(opt => {
                    const optStatus = attrStatus[opt.id];
                    const optChecked = optStatus === 'full' ? 'checked' : '';
                    const optLabelStyle = getLabelStyle(opt.id);
                    return `
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${opt.id.charAt(0).toUpperCase() + opt.id.slice(1)}" ${optChecked}>
                            <span ${optLabelStyle}>${opt.label}</span>
                        </label>
                    `;
                }).join('');
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell checkbox-group">${optionsHtml}</td>
                `;
            }
        } else {
            rowHtml += '<td colspan="2"></td>';
        }
        
        rowHtml += '</tr>';
        formHtml += rowHtml;
    }
    
    // 备注行
    formHtml += `
        <tr>
            <td class="label-cell"><label>备注</label></td>
            <td class="input-cell" colspan="3">
                <textarea id="editRemark" placeholder="输入备注信息（将应用到所有选中文档）" rows="3"></textarea>
            </td>
        </tr>
    `;
    
    // 操作按钮行
    formHtml += `
        <tr>
            <td colspan="4" class="action-cell">
                <button type="submit" class="btn btn-success">应用到所有选中文档</button>
                <button type="button" class="btn btn-secondary" onclick="closeEditModal()">取消</button>
            </td>
        </tr>
    </table>
    `;
    
    // 更新表单内容
    formContainer.innerHTML = formHtml;
    
    // 用 onsubmit 赋值绑定提交事件
    formContainer.onsubmit = async (e) => {
        e.preventDefault();

        const docIds = document.getElementById('editDocId').value.split(',');

        // 字段名映射表（与单文档编辑保持一致）
        const fieldNameMap = {
            'editDocDate': 'doc_date',
            'editSignDate': 'sign_date',
            'editSigner': 'signer',
            'editPartyASigner': 'party_a_signer',
            'editPartyBSigner': 'party_b_signer',
            'editNoSignature': 'no_signature',
            'editHasSeal': 'has_seal_marked',
            'editPartyASeal': 'party_a_seal',
            'editPartyBSeal': 'party_b_seal',
            'editNoSeal': 'no_seal',
            'editOtherSeal': 'other_seal',
            'editNotInvolved': 'not_involved',
            'editRemark': 'notes',
            'editDirectory': 'directory',
            'editRootDirectory': 'root_directory'
        };

        // 动态收集表单数据
        const docData = {};

        // 收集文本、日期和文本域输入
        document.querySelectorAll('#editDocForm input[type="text"], #editDocForm input[type="date"], #editDocForm textarea').forEach(input => {
            if (input.id.startsWith('edit') && input.id !== 'editDocId') {
                if (fieldNameMap[input.id]) {
                    const value = input.value;
                    if (value) {
                        docData[fieldNameMap[input.id]] = value;
                    }
                } else {
                    const fieldName = input.dataset.fieldName || input.id.replace('edit', '');
                    const value = input.value;
                    if (value) {
                        docData[fieldName] = value;
                    }
                }
            }
        });

        // 收集复选框
        document.querySelectorAll('#editDocForm input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.id.startsWith('edit')) {
                if (fieldNameMap[checkbox.id]) {
                    docData[fieldNameMap[checkbox.id]] = checkbox.checked;
                } else {
                    const fieldName = checkbox.dataset.fieldName || checkbox.id.replace('edit', '');
                    docData[fieldName] = checkbox.checked;
                }
            }
        });
        
        showLoading(true);
        
        try {
            let successCount = 0;
            let errorCount = 0;
            
            for (const docId of docIds) {
                try {
                    const result = await editDocument(docId, docData);
                    if (result.status === 'success') {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    console.error('编辑文档失败:', error);
                    errorCount++;
                }
            }
            
            showNotification(`成功编辑 ${successCount} 个文档${errorCount > 0 ? '，' + errorCount + '个失败' : ''}`, errorCount > 0 ? 'warning' : 'success');
            
            // 刷新文档列表
            if (appState.currentCycle) {
                // 强制从服务器重新获取数据
                appState.filterOptions = appState.filterOptions || {};
                await renderCycleDocuments(appState.currentCycle, appState.filterOptions);
            }
            
            // 同时刷新维护页面的文档列表
            if (appState.currentCycle && appState.currentDocument) {
                await loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
            }
            
        } catch (error) {
            console.error('批量编辑失败:', error);
            showNotification('批量编辑失败: ' + error.message, 'error');
        } finally {
            showLoading(false);
            closeEditModal();
        }
    };
    
    // 更新标题显示批量编辑
    if (titleEl) {
        titleEl.textContent = `批量编辑文档属性 (${selectedDocIds.length}个)`;
    }
    
    // 打开模态框
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

/**
 * 处理批量替换
 */
export function handleBatchReplace() {
    const selectedCheckboxes = document.querySelectorAll('.document-checkbox:checked');
    const selectedDocIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择文档', 'error');
        return;
    }
    
    // 这里可以实现批量替换功能
    showNotification('批量替换功能待实现', 'info');
}

/**
 * 处理批量删除
 */
export async function handleBatchDelete() {
    const selectedCheckboxes = document.querySelectorAll('.document-checkbox:checked');
    const selectedDocIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择文档', 'error');
        return;
    }
    
    showConfirmModal(
        '确认批量删除',
        `确定要删除这 ${selectedDocIds.length} 个文档吗？此操作不可恢复。`,
        async () => {
            try {
                let successCount = 0;
                let errorCount = 0;
                
                for (const docId of selectedDocIds) {
                    try {
                        const result = await deleteDocument(docId);
                        if (result.status === 'success') {
                            successCount++;
                        } else {
                            errorCount++;
                        }
                    } catch (error) {
                        console.error('删除文档失败:', error);
                        errorCount++;
                    }
                }
                
                if (successCount > 0) {
                    showNotification(`成功删除 ${successCount} 个文档`, 'success');
                    // 重新加载项目配置，确保 appState.projectConfig 是最新的
                    if (appState.currentProjectId) {
                        try {
                            const updatedProject = await loadProject(appState.currentProjectId);
                            if (updatedProject) {
                                appState.projectConfig = updatedProject;
                            }
                        } catch (e) {
                            console.error('重新加载项目配置失败:', e);
                        }
                    }
                    // 刷新文档列表
                    if (appState.currentCycle && appState.currentDocument) {
                        await loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
                        // 刷新维护页面的文档列表
                        await loadMaintainDocuments();
                        // 刷新主页面的文档列表
                        await renderCycleDocuments(appState.currentCycle);
                    }
                }
                
                if (errorCount > 0) {
                    showNotification(`有 ${errorCount} 个文档删除失败`, 'error');
                }
            } catch (error) {
                console.error('批量删除失败:', error);
                showNotification('批量删除失败: ' + error.message, 'error');
            }
        }
    );
}

/**
 * 处理批量移动到目录
 */
export async function handleBatchMove() {
    const selectedCheckboxes = document.querySelectorAll('.document-checkbox:checked');
    const selectedDocIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择文档', 'error');
        return;
    }
    
    // 从已上传的文档中收集已使用的目录
    let existingDirectories = new Set();
    
    // 首先从项目配置中收集目录
    if (appState.projectConfig && appState.currentCycle) {
        const cycleDocs = appState.projectConfig.documents[appState.currentCycle];
        if (cycleDocs && cycleDocs.uploaded_docs) {
            cycleDocs.uploaded_docs.forEach(doc => {
                if (doc.directory) {
                    existingDirectories.add(doc.directory);
                }
            });
        }
        // 从 categories 中读取目录（与文档需求编辑器共享的目录）
        if (cycleDocs && cycleDocs.categories) {
            for (const docName in cycleDocs.categories) {
                if (cycleDocs.categories[docName]) {
                    cycleDocs.categories[docName].forEach(category => {
                        existingDirectories.add(category);
                    });
                }
            }
        }
    }
    
    // 从API获取的文档中收集目录
    try {
        const docs = await getCycleDocuments(appState.currentCycle);
        if (docs && Array.isArray(docs)) {
            docs.forEach(doc => {
                if (doc.directory) {
                    existingDirectories.add(doc.directory);
                }
            });
        }
    } catch (error) {
        console.warn('从API获取文档目录失败:', error);
    }
    
    const directoriesArray = Array.from(existingDirectories).sort();
    
    // 显示目录选择模态框
    showDirectorySelectModal(
        '移动到目录',
        directoriesArray,
        async (directory) => {
            if (!directory) {
                showNotification('请选择或输入目录名称', 'error');
                return;
            }
            
            showLoading(true);
            try {
                let successCount = 0;
                let errorCount = 0;
                
                for (const docId of selectedDocIds) {
                    try {
                        const response = await fetch(`/api/documents/${docId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ directory })
                        });
                        
                        const result = await response.json();
                        if (result.status === 'success') {
                            successCount++;
                        } else {
                            errorCount++;
                            console.error('移动文档失败:', result.message);
                        }
                    } catch (error) {
                        console.error('移动文档失败:', error);
                        errorCount++;
                    }
                }
                
                if (successCount > 0) {
                    showNotification(`成功移动 ${successCount} 个文档到目录 "${directory}"`, 'success');
                    // 刷新文档列表
                    if (appState.currentCycle && appState.currentDocument) {
                        await loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
                    }
                    await reloadProjectAndRender(appState.currentCycle);
                }
                
                if (errorCount > 0) {
                    showNotification(`有 ${errorCount} 个文档移动失败`, 'error');
                }
            } catch (error) {
                console.error('批量移动失败:', error);
                showNotification('批量移动失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

