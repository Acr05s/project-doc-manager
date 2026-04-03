/**
 * 文档模块 - 处理文档相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, showInputModal, openModal, closeModal, showDirectorySelectModal } from './ui.js';
import { uploadDocument, editDocument, deleteDocument, getCycleDocuments, loadImportedDocuments, searchImportedDocuments, loadProject } from './api.js';
import { handleZipArchive, fixZipSelectionIssue } from './zip.js';

/**
 * 处理文档上传
 */
export async function handleUploadDocument(e) {
    e.preventDefault();
    
    const files = elements.fileInput.files;
    if (files.length === 0) {
        showNotification('请选择文件', 'error');
        return;
    }
    
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    const docDate = elements.docDate.value;
    const signDate = elements.signDate.value;
    const signer = elements.signer.value;
    const hasSeal = elements.hasSeal.checked;
    const partyASeal = elements.partyASeal.checked;
    const partyBSeal = elements.partyBSeal.checked;
    const otherSeal = elements.otherSeal.value;
    
    showLoading(true);
    
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
            elements.docDate.value = '';
            elements.signDate.value = '';
            elements.signer.value = '';
            elements.hasSeal.checked = false;
            elements.partyASeal.checked = false;
            elements.partyBSeal.checked = false;
            elements.otherSeal.value = '';
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
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('上传失败: 所有文件上传失败', 'error');
        }
    } catch (error) {
        console.error('上传文档失败:', error);
        showNotification('上传失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
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
        'editNotInvolved': 'not_involved'  // 本次项目不涉及
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
 */
export async function handleDeleteDocument(docId) {
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
                    // 刷新维护页面的文档列表
                    await loadMaintainDocuments();
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
    
    // 定义 attributes 到要求名称的映射
    const attrMap = [
        { key: 'party_a_sign', name: '甲方签字' },
        { key: 'party_b_sign', name: '乙方签字' },
        { key: 'party_a_seal', name: '甲方盖章' },
        { key: 'party_b_seal', name: '乙方盖章' },
        { key: 'need_doc_date', name: '文档日期' },
        { key: 'need_sign_date', name: '签字日期' },
        { key: 'need_doc_number', name: '发文号' }
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
    const customDefs = appState.projectConfig?.custom_attribute_definitions || [];
    
    console.log('[analyzeRequirementStatus] appState.projectConfig:', appState.projectConfig);
    console.log('[analyzeRequirementStatus] appState.projectConfig?.custom_attribute_definitions:', appState.projectConfig?.custom_attribute_definitions);
    console.log('[analyzeRequirementStatus] customDefs:', customDefs);
    console.log('[analyzeRequirementStatus] attributes:', attributes);
    
    for (const [key, value] of Object.entries(attributes)) {
        if (value === true && !predefinedKeys.has(key)) {
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
                        
                        // 按目录分组文档
                        const docsByDirectory = {};
                        docsList.forEach(d => {
                            const directory = d.directory || '无目录';
                            if (!docsByDirectory[directory]) {
                                docsByDirectory[directory] = [];
                            }
                            docsByDirectory[directory].push(d);
                        });
                        
                        // 对目录进行排序，确保 '/' 目录在最前面，然后是其他目录，最后是'无目录'
                        const sortedDirectories = Object.entries(docsByDirectory).sort(([dirA], [dirB]) => {
                            // '/' 目录放最前面
                            if (dirA === '/') return -1;
                            if (dirB === '/') return 1;
                            // '无目录' 放最后面
                            if (dirA === '无目录') return 1;
                            if (dirB === '无目录') return -1;
                            // 其他目录按字母排序
                            return dirA.localeCompare(dirB);
                        });
                        
                        // 生成文件列表，按目录分组显示
                        const fileListHtml = docsList.length > 0 ? 
                            sortedDirectories.map(([directory, directoryDocs]) => {
                                // 生成目录标题
                                const directoryTitleHtml = (directory !== '无目录' && directory !== '/' && directory !== '') ? `
                                    <div class="doc-directory-title" style="margin: 10px 0 5px 0; padding: 8px; background: #f1f5f9; border-radius: 4px; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 16px;">📁</span>
                                        <span>${directory}</span>
                                        <span style="font-size: 12px; color: #64748b; font-weight: normal;">(${directoryDocs.length}个文件)</span>
                                    </div>
                                ` : '';
                                
                                // 生成该目录下的文件列表
                                const filesHtml = directoryDocs.map(d => {
                                    // 辅助函数：获取字段值（支持带下划线前缀）
                                    const getField = (name) => d[name] !== undefined ? d[name] : d[`_${name}`];
                                    
                                    const attrParts = [];
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
                                    // 辅助函数：获取字段值（支持带下划线前缀）
                                    const getDocValue = (fieldName) => {
                                        if (d[fieldName] !== undefined) return d[fieldName];
                                        if (d[`_${fieldName}`] !== undefined) return d[`_${fieldName}`];
                                        return null;
                                    };
                                    
                                    // 显示本次项目不涉及状态
                                    if (getDocValue('not_involved')) attrParts.push('🚫本次不涉及');
                                    
                                    // 显示自定义属性 - 同时显示已完成和未完成的
                                    const predefinedFields = new Set(['doc_date', 'signer', 'party_a_signer', 'party_b_signer', 'sign_date', 'no_signature', 'party_a_seal', 'party_b_seal', 'has_seal_marked', 'has_seal', 'no_seal', 'other_seal', 'not_involved', 'id', 'doc_name', 'filename', 'original_filename', 'upload_time', 'directory', 'cycle', 'file_path', 'source', 'file_size', 'doc_id', 'project_name', 'project_id']);
                                    
                                    // 获取文档要求中的自定义属性（用于对比）
                                    const cycleDocs = appState.projectConfig?.documents?.[cycle];
                                    const docInfo = cycleDocs?.required_docs?.find(rd => rd.name === doc.name);
                                    const requiredCustomAttrs = docInfo?.attributes || {};
                                    
                                    // 优先使用 custom_attribute_definitions 显示自定义属性
                                    const customDefs = appState.projectConfig?.custom_attribute_definitions || [];
                                    customDefs.forEach(attrDef => {
                                        // 检查是否是要求的属性
                                        const isRequired = requiredCustomAttrs[attrDef.id] === true;
                                        const value = getDocValue(attrDef.id);
                                        const isCompleted = value === true || (value !== undefined && value !== null && value !== '' && value !== false);
                                        
                                        if (isRequired) {
                                            if (isCompleted) {
                                                // 已完成 - 绿色标记
                                                if (attrDef.type === 'checkbox') {
                                                    attrParts.push(`<span style="color: #28a745;">✓${attrDef.name}</span>`);
                                                } else {
                                                    attrParts.push(`<span style="color: #28a745;">✓${attrDef.name}: ${value}</span>`);
                                                }
                                            } else {
                                                // 未完成 - 红色标记
                                                attrParts.push(`<span style="color: #dc3545;">✗${attrDef.name}</span>`);
                                            }
                                        } else if (isCompleted) {
                                            // 非要求但已完成
                                            if (attrDef.type === 'checkbox') {
                                                attrParts.push(`📌${attrDef.name}`);
                                            } else {
                                                attrParts.push(`📌${attrDef.name}: ${value}`);
                                            }
                                        }
                                    });
                                    
                                    // 辅助函数：生成友好的显示名称
                                    const getFriendlyDisplayName = (key) => {
                                        const match = key.match(/^custom_\d+_(.+)$/);
                                        if (match) {
                                            return match[1].replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                                        }
                                        return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                                    };
                                    
                                    // 遍历文档对象的所有字段，找出不在 custom_attribute_definitions 中的自定义属性
                                    for (const [key, value] of Object.entries(d)) {
                                        const isKnownCustom = customDefs.some(def => def.id === key);
                                        if (!predefinedFields.has(key) && 
                                            !key.startsWith('_') && 
                                            !isKnownCustom &&
                                            value !== undefined && 
                                            value !== null && 
                                            value !== '' &&
                                            typeof value === 'string') {
                                            // 为自定义属性生成显示名称
                                            const displayName = getFriendlyDisplayName(key);
                                            attrParts.push(`📌${displayName}: ${value}`);
                                        }
                                    }
                                    
                                    // 检查带下划线前缀的自定义属性
                                    for (const [key, value] of Object.entries(d)) {
                                        const actualKey = key.substring(1);
                                        const isKnownCustom = customDefs.some(def => def.id === actualKey);
                                        if (key.startsWith('_') && 
                                            !predefinedFields.has(actualKey) && 
                                            !isKnownCustom &&
                                            value !== undefined && 
                                            value !== null && 
                                            value !== '' &&
                                            typeof value === 'string') {
                                            const displayName = getFriendlyDisplayName(actualKey);
                                            attrParts.push(`📌${displayName}: ${value}`);
                                        }
                                    }

                                    
                                    // 检查文件是否满足要求（支持带下划线前缀的字段名）
                                    const requirement = doc.requirement || '';
                                    let missingRequirements = [];
                                    
                                    const hasSigner = getDocValue('signer');
                                    const hasNoSignature = getDocValue('no_signature');
                                    const hasPartyASigner = getDocValue('party_a_signer');
                                    const hasPartyBSigner = getDocValue('party_b_signer');
                                    const hasPartyASeal = getDocValue('party_a_seal');
                                    const hasPartyBSeal = getDocValue('party_b_seal');
                                    const hasHasSealMarked = getDocValue('has_seal_marked') || getDocValue('has_seal');
                                    const hasNoSeal = getDocValue('no_seal');
                                    const hasDocDate = getDocValue('doc_date');
                                    const hasSignDate = getDocValue('sign_date');
                                    
                                    // 检查签字要求（分别检查甲方签字和乙方签字）
                                    const hasPartyASignReq = requirement.includes('甲方签字');
                                    const hasPartyBSignReq = requirement.includes('乙方签字');
                                    const hasGeneralSignReq = requirement.includes('签字') && !hasPartyASignReq && !hasPartyBSignReq;
                                    
                                    // 检查甲方签字
                                    if (hasPartyASignReq && !hasPartyASigner && !hasNoSignature) {
                                        missingRequirements.push('甲方签字');
                                    }
                                    // 检查乙方签字
                                    if (hasPartyBSignReq && !hasPartyBSigner && !hasNoSignature) {
                                        missingRequirements.push('乙方签字');
                                    }
                                    // 检查通用签字
                                    if (hasGeneralSignReq && !hasSigner && !hasNoSignature) {
                                        missingRequirements.push('签字');
                                    }
                                    
                                    // 检查盖章要求（避免重复）
                                    const hasSealRequirement = requirement.includes('乙方盖章') || requirement.includes('甲方盖章') || requirement.includes('盖章');
                                    if (hasSealRequirement && !hasHasSealMarked && !hasPartyASeal && !hasPartyBSeal && !hasNoSeal) {
                                        if (requirement.includes('乙方盖章') && requirement.includes('甲方盖章')) {
                                            missingRequirements.push('甲乙方盖章');
                                        } else if (requirement.includes('乙方盖章')) {
                                            missingRequirements.push('乙方盖章');
                                        } else if (requirement.includes('甲方盖章')) {
                                            missingRequirements.push('甲方盖章');
                                        } else if (requirement.includes('盖章')) {
                                            missingRequirements.push('盖章');
                                        }
                                    }
                                    
                                    // 检查日期要求（避免重复）
                                    if (requirement.includes('文档日期') && !hasDocDate) {
                                        missingRequirements.push('文档日期');
                                    }
                                    if (requirement.includes('签字日期') && !hasSignDate) {
                                        missingRequirements.push('签字日期');
                                    }
                                    
                                    // 生成缺失要求的提示
                                    const missingHtml = missingRequirements.length > 0 ? `
                                        <span class="missing-requirements" title="缺失要求：${missingRequirements.join('、')}">
                                            ⚠️${missingRequirements.join('、')}
                                        </span>
                                    ` : '';
                                    
                                    return `<div class="doc-file-row" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: 20px;">
                                        <span class="doc-file-name" onclick="previewDocument('${d.id}')" 
                                              title="点击预览文件" 
                                              style="cursor: pointer; text-decoration: underline;">
                                            ${d.original_filename || d.filename || '未知文件名'}
                                        </span>
                                        ${attrParts.length > 0 ? `<span class="doc-attrs" style="margin-left: 8px;">${attrParts.join(' ')}</span>` : ''}
                                        ${missingHtml}
                                    </div>`;
                                }).join('');
                                
                                return directoryTitleHtml + filesHtml;
                            }).join('')
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
                        
                        // 获取文档序号 - 使用原始序号，确保筛选后序号不变
                        const docIndex = doc._originalIndex !== undefined && doc._originalIndex !== null ? doc._originalIndex : (index + 1);
                        
                        // 确定显示的状态标签：优先显示"不涉及"，然后是"已归档"
                        const statusTag = isNotInvolved 
                            ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">🚫不涉及</div>`
                            : (isArchived ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">已归档</div>` : '');
                        
                        // 序号列状态图标
                        let indexStatusIcon = '';
                        if (isNotInvolved) {
                            indexStatusIcon = '<span title="不涉及">🚫</span>';
                        } else if (isArchived) {
                            indexStatusIcon = '<span title="已归档">🗄️</span>';
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
                                        <div class="doc-type" style="text-align: center;">${doc.name}</div>
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
                                    ` : `
                                        <button class="btn btn-warning btn-sm" onclick="unarchiveDocument('${cycle}', '${doc.name}')">
                                            📤 撤销归档
                                        </button>
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
}

/**
 * 标记文档为本次项目不涉及或撤销不涉及
 */
export async function markDocumentNotInvolved(cycle, docName) {
    try {
        // 检查文档当前状态（从文档列表和项目配置中）
        const docsList = await getCycleDocuments(cycle);
        const doc = docsList.find(d => d.doc_name === docName);
        const isNotInvolvedFromDocs = doc && (doc.not_involved || doc._not_involved);
        const isNotInvolvedFromConfig = appState.projectConfig.documents_not_involved?.[cycle]?.[docName];
        const isCurrentlyNotInvolved = isNotInvolvedFromDocs || isNotInvolvedFromConfig;
        
        // 根据当前状态显示不同的确认弹窗
        const title = isCurrentlyNotInvolved ? '撤销不涉及' : '标记为不涉及';
        const message = isCurrentlyNotInvolved 
            ? `确定将「${docName}」撤销标记为不涉及吗？`
            : `确定将「${docName}」标记为本次项目不涉及并自动归档吗？`;
        
        showConfirmModal(
            title,
            message,
            async () => {
                showLoading(true);
                try {
                    if (isCurrentlyNotInvolved) {
                        // 撤销不涉及标记
                        let success = true;
                        
                        // 如果有文档记录，更新文档
                        if (doc) {
                            const docData = { not_involved: false };
                            const result = await editDocument(doc.id, docData);
                            if (result.status !== 'success') {
                                success = false;
                                showNotification('操作失败: ' + result.message, 'error');
                            }
                        }
                        
                        // 清除项目配置中的标记
                        if (appState.projectConfig.documents_not_involved?.[cycle]?.[docName]) {
                            delete appState.projectConfig.documents_not_involved[cycle][docName];
                            // 保存项目配置
                            const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(appState.projectConfig)
                            });
                            if (!response.ok) {
                                success = false;
                            }
                        }
                        
                        if (success) {
                            // 取消归档
                            await unarchiveDocument(cycle, docName);
                            showNotification('文档已撤销不涉及标记', 'success');
                        }
                    } else if (doc) {
                        // 标记为不涉及
                        const docData = { not_involved: true };
                        const result = await editDocument(doc.id, docData);
                        
                        if (result.status === 'success') {
                            // 自动归档
                            const archiveResult = await archiveDocument(cycle, docName);
                            if (archiveResult.status === 'success') {
                                showNotification('文档已标记为不涉及并归档', 'success');
                            } else {
                                showNotification('文档已标记为不涉及，但归档失败', 'warning');
                            }
                        } else {
                            showNotification('标记失败: ' + result.message, 'error');
                        }
                    } else {
                        // 如果没有文档，将不涉及标记存储在项目配置中
                        try {
                            // 初始化不涉及标记存储
                            if (!appState.projectConfig.documents_not_involved) {
                                appState.projectConfig.documents_not_involved = {};
                            }
                            if (!appState.projectConfig.documents_not_involved[cycle]) {
                                appState.projectConfig.documents_not_involved[cycle] = {};
                            }
                            appState.projectConfig.documents_not_involved[cycle][docName] = true;
                            
                            // 保存项目配置
                            const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(appState.projectConfig)
                            });
                            
                            if (response.ok) {
                                // 再归档
                                const archiveResult = await archiveDocument(cycle, docName);
                                if (archiveResult.status === 'success') {
                                    showNotification('文档已标记为不涉及并归档', 'success');
                                } else {
                                    showNotification('文档已标记为不涉及，但归档失败', 'warning');
                                }
                            } else {
                                showNotification('保存标记失败', 'error');
                            }
                        } catch (e) {
                            console.error('标记不涉及失败:', e);
                            showNotification('标记失败', 'error');
                        }
                    }
                } catch (error) {
                    console.error('操作失败:', error);
                    showNotification('操作失败: ' + error.message, 'error');
                } finally {
                    showLoading(false);
                    // 刷新文档列表
                    await renderCycleDocuments(cycle);
                }
            }
        );
    } catch (error) {
        console.error('操作失败:', error);
        showNotification('操作失败: ' + error.message, 'error');
    }
}

/**
 * 预览文档（渐进式预览）
 */
export async function previewDocument(docId) {
    try {
        // 先获取文档信息
        const docResponse = await fetch(`/api/documents/${docId}`);
        const docResult = await docResponse.json();
        
        if (docResult.status !== 'success') {
            // 文档记录不存在
            showConfirmModal(
                '文档不存在',
                '该文档记录不存在，可能是因为已经被删除。',
                async () => {
                    // 刷新文档列表
                    if (appState.currentCycle) {
                        await renderCycleDocuments(appState.currentCycle);
                    }
                }
            );
            return;
        }
        
        const docInfo = docResult.data;
        const filename = docInfo.original_filename || docInfo.filename;
        const fileExt = filename.split('.').pop().toLowerCase();
        
        // 创建预览模态框（带加载状态）
        const modalContent = `
            <div class="preview-modal-content">
                <div class="preview-header">
                    <h3>${escapeHtml(filename)}</h3>
                    <button class="close-btn" onclick="document.getElementById('previewModal').style.display='none'">×</button>
                </div>
                <div class="preview-body" id="previewBody">
                    <div class="preview-loading">
                        <div class="loading-spinner"></div>
                        <p>正在启动预览...</p>
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
        
        // 调用渐进式预览API
        await loadProgressivePreview(docId, fileExt);
        
    } catch (error) {
        console.error('预览文档失败:', error);
        showNotification('预览失败: ' + error.message, 'error');
    }
}

/**
 * 加载渐进式预览
 */
async function loadProgressivePreview(docId, fileExt) {
    const previewBody = document.getElementById('previewBody');
    if (!previewBody) return;
    
    try {
        // 调用渐进式预览启动API
        const response = await fetch(`/api/documents/preview/start/${encodeURIComponent(docId)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            if (result.mode === 'progressive') {
                // 渐进式预览：直接显示后端返回的HTML
                previewBody.innerHTML = result.preview_html;
            } else if (result.mode === 'direct') {
                // 直接预览（图片等）
                const viewUrl = result.file_url;
                if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(fileExt)) {
                    previewBody.innerHTML = `<img src="${viewUrl}" class="preview-image" alt="预览图片" onerror="handlePreviewError(this)">`;
                } else {
                    previewBody.innerHTML = `<iframe src="${viewUrl}" class="preview-iframe" frameborder="0" onerror="handlePreviewError(this)"></iframe>`;
                }
            }
        } else {
            // API返回错误，显示错误信息
            const viewUrl = `/api/documents/view/${docId}`;
            if (result.message && result.message.includes('不支持')) {
                // 不支持的文件类型
                previewBody.innerHTML = `
                    <div class="preview-other">
                        <div class="file-icon">📄</div>
                        <p>${escapeHtml(result.message)}</p>
                        <a href="${viewUrl}" class="btn btn-primary" target="_blank">下载文件</a>
                    </div>
                `;
            } else {
                // 其他错误，显示原始预览（降级方案）
                previewBody.innerHTML = getFallbackPreviewContent(docId, fileExt);
            }
        }
    } catch (error) {
        console.error('渐进式预览加载失败:', error);
        // 降级到原始预览方式
        previewBody.innerHTML = getFallbackPreviewContent(docId, fileExt);
    }
}

/**
 * 获取降级预览内容（原始方式）
 */
function getFallbackPreviewContent(docId, fileExt) {
    const viewUrl = `/api/documents/view/${docId}`;
    
    // 图片预览
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(fileExt)) {
        return `<img src="${viewUrl}" class="preview-image" alt="预览图片" onerror="handlePreviewError(this)">`;
    }
    
    // PDF预览
    if (fileExt === 'pdf') {
        return `<iframe src="${viewUrl}" class="preview-iframe" frameborder="0" onerror="handlePreviewError(this)"></iframe>`;
    }
    
    // Office文档预览（转换为PDF后预览）
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
        return `<iframe src="${viewUrl}" class="preview-iframe" frameborder="0" onerror="handlePreviewError(this)"></iframe>`;
    }
    
    // 其他文件类型
    return `
        <div class="preview-other">
            <div class="file-icon">📄</div>
            <p>该文件类型不支持在线预览</p>
            <a href="${viewUrl}" class="btn btn-primary" target="_blank">下载文件</a>
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
                requirement = docInfo.requirement || '无特殊要求';
                console.log('requirement:', requirement);
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
                    
                    console.log('[displayDocumentRequirements] 动态构建的自定义属性定义:', customAttrDefs);
                }
                
                // 添加自定义属性到表单
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
        const filesWithDir = selectedFiles.map(file => {
            // 优先使用 appState 中已存的 source_dir，DOM 只作备用
            let sourceDir = file.source_dir;
            if (sourceDir === undefined) {
                const itemEl = document.querySelector(`#zipFilesList .zip-file-item[data-path="${CSS.escape(file.path)}"]`);
                sourceDir = itemEl ? (itemEl.dataset.dir || '') : '';
            }
            return { ...file, source_dir: sourceDir || '' };
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
                files: filesWithDir
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
    
    console.log('[openUploadModal] 更新appState:', { currentCycle: appState.currentCycle, currentDocument: appState.currentDocument });
    
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
        // 尝试从API获取文档信息
        console.log('尝试从API获取文档信息:', `/api/documents/${docId}`);
        const response = await fetch(`/api/documents/${docId}`);
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
                requirement = docInfo.requirement || '无特殊要求';
                // 解析附加属性
                attributes = parseRequirementAttributes(requirement);
                
                // 添加自定义属性
                console.log('[generateDynamicEditForm] custom_attribute_definitions:', appState.projectConfig.custom_attribute_definitions);
                
                // 获取自定义属性定义（优先使用配置中的，如果没有则从attributes推断）
                let customAttrDefs = appState.projectConfig.custom_attribute_definitions || [];
                
                // 辅助函数：生成友好的显示名称
                const getFriendlyDisplayName = (key) => {
                    const match = key.match(/^custom_\d+_(.+)$/);
                    if (match) {
                        return match[1].replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                    }
                    return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                };
                
                // 如果配置中没有自定义属性定义，但从docInfo.attributes中有自定义属性，动态构建定义
                if (customAttrDefs.length === 0 && docInfo.attributes) {
                    const predefinedAttrKeys = ['party_a_sign', 'party_b_sign', 'party_a_seal', 'party_b_seal', 
                        'need_doc_number', 'need_doc_date', 'need_sign_date'];
                    
                    Object.keys(docInfo.attributes).forEach(attrKey => {
                        if (!predefinedAttrKeys.includes(attrKey) && docInfo.attributes[attrKey] === true) {
                            // 使用辅助函数生成显示名称
                            const displayName = getFriendlyDisplayName(attrKey);
                            
                            customAttrDefs.push({
                                id: attrKey,
                                name: displayName,
                                type: 'checkbox' // 默认为checkbox类型
                            });
                        }
                    });
                    
                    console.log('[generateDynamicEditForm] 动态构建的自定义属性定义:', customAttrDefs);
                }
                
                customAttrDefs.forEach(attrDef => {
                    console.log('[generateDynamicEditForm] attrDef:', attrDef);
                    console.log('[generateDynamicEditForm] docInfo.attributes:', docInfo.attributes);
                    console.log('[generateDynamicEditForm] docInfo.attributes[attrDef.id]:', docInfo.attributes && docInfo.attributes[attrDef.id]);
                    
                    // 检查文档是否有这个自定义属性的要求
                    if (docInfo.attributes && docInfo.attributes[attrDef.id]) {
                        // 根据类型创建属性配置
                        if (attrDef.type === 'checkbox') {
                            attributes.push({
                                type: 'checkbox',
                                id: attrDef.id,
                                name: attrDef.id,
                                label: attrDef.name,
                                inline: true,  // 设置为内联显示
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
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
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
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
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
        
        // 标记文档为已归档
        if (!appState.projectConfig.documents_archived) {
            appState.projectConfig.documents_archived = {};
        }
        if (!appState.projectConfig.documents_archived[cycle]) {
            appState.projectConfig.documents_archived[cycle] = {};
        }
        appState.projectConfig.documents_archived[cycle][docName] = true;
        
        // 保存到服务器
        const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.projectConfig)
        });
        
        if (response.ok) {
            showNotification('文档归档成功', 'success');
            // 只刷新当前操作的周期，避免跳转到其他周期
            await renderCycleDocuments(cycle);
            // 刷新周期导航栏状态
            import('./cycle.js').then(module => {
                module.refreshCycleProgress();
            });
            return { status: 'success' };
        } else {
            showNotification('归档失败', 'error');
            return { status: 'error', message: '归档失败' };
        }
    } catch (error) {
        console.error('归档文档失败:', error);
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
        
        // 开始批量归档
        showLoading(true);
        let successCount = 0;
        let failCount = 0;
        
        // 初始化归档对象
        if (!appState.projectConfig.documents_archived) {
            appState.projectConfig.documents_archived = {};
        }
        if (!appState.projectConfig.documents_archived[cycle]) {
            appState.projectConfig.documents_archived[cycle] = {};
        }
        
        // 批量标记归档
        for (const docName of docsToArchive) {
            appState.projectConfig.documents_archived[cycle][docName] = true;
        }
        
        // 保存到服务器
        try {
            const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appState.projectConfig)
            });
            
            if (response.ok) {
                successCount = docsToArchive.length;
                showNotification(`成功归档 ${successCount} 个文档类型${failCount > 0 ? '，' + failCount + '个失败' : ''}`, 
                    failCount > 0 ? 'warning' : 'success');
                
                // 刷新显示
                await renderCycleDocuments(cycle);
                // 刷新周期导航栏状态
                import('./cycle.js').then(module => {
                    module.refreshCycleProgress();
                });
            } else {
                showNotification('归档保存失败', 'error');
            }
        } catch (error) {
            console.error('批量归档保存失败:', error);
            showNotification('归档失败: ' + error.message, 'error');
        } finally {
            showLoading(false);
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
        // 移除归档标记
        if (appState.projectConfig.documents_archived && appState.projectConfig.documents_archived[cycle]) {
            delete appState.projectConfig.documents_archived[cycle][docName];
            
            // 如果该周期没有归档文档，删除周期键
            if (Object.keys(appState.projectConfig.documents_archived[cycle]).length === 0) {
                delete appState.projectConfig.documents_archived[cycle];
            }
            
            // 如果没有任何归档文档，删除整个归档对象
            if (Object.keys(appState.projectConfig.documents_archived).length === 0) {
                delete appState.projectConfig.documents_archived;
            }
        }
        
        // 保存到服务器
        const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.projectConfig)
        });
        
        if (response.ok) {
            showNotification('取消归档成功', 'success');
            // 只刷新当前操作的周期，避免跳转到其他周期
            await renderCycleDocuments(cycle);
            // 刷新周期导航栏状态
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
 * 格式化日期为月/日
 */
function formatDateToMonth(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
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
        
        // 限制文档数量，避免显示60个文件
        if (documents.length > 20) {
            documents = documents.slice(0, 20);
            console.log('限制文档数量为20个');
        }
        
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
                // 按目录分组
                const groupedDocs = documents.reduce((groups, doc) => {
                    const dir = doc.directory || '/';
                    if (!groups[dir]) groups[dir] = [];
                    groups[dir].push(doc);
                    return groups;
                }, {});
                
                // 对目录进行排序，确保 '/' 目录在最前面
                const sortedDirectories = Object.entries(groupedDocs).sort(([dirA], [dirB]) => {
                    if (dirA === '/') return -1; // '/' 目录放最前面
                    if (dirB === '/') return 1;
                    return dirA.localeCompare(dirB); // 其他目录按字母排序
                });
                
                documentsList.innerHTML = `
                    <div class="documents-tree">
                        ${sortedDirectories.map(([directory, docs]) => {
                            const directoryDisplay = directory === '/' ? '/' : `/${directory}`;
                            return `
                                <div class="directory-group" style="margin-bottom: 15px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
                                    <div class="directory-header" style="background: #f5f5f5; padding: 10px 15px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 10px;">
                                        <span style="font-size: 18px;">📁</span>
                                        <span class="directory-name" style="font-weight: 600; color: #333;">${directoryDisplay}</span>
                                        <span class="directory-count" style="color: #666; font-size: 12px;">(${docs.length}个文件)</span>
                                    </div>
                                    <div class="directory-files" style="padding: 10px;">
                                        ${docs.map(doc => {
                                            const docId = doc.doc_id || doc.id || `${doc.cycle || doc.cycle_key || 'unknown'}_${doc.doc_name || doc.name || 'unknown'}_${doc.upload_time || doc.filename || Date.now()}`;
                                            const zipInfo = doc.source === 'zip' ? (doc.zip_name || doc.zip_file || 'ZIP导入') : '';
                                            const zipPath = doc.zip_path || doc.rel_path || '';
                                            return `
                                                <div class="document-item" style="margin-bottom: 8px; padding: 10px; background: #fafafa; border-radius: 4px; border: 1px solid #eee;">
                                                    <input type="checkbox" class="document-checkbox" data-doc-id="${docId}">
                                                    <div class="document-info" style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                                        <span class="document-name" onclick="previewDocument('${docId}')" style="cursor: pointer; color: #1890ff;">${doc.original_filename || doc.filename || '未知文件名'}</span>
                                                        <div class="document-meta" style="font-size: 12px; color: #666; display: flex; gap: 15px; flex-wrap: wrap;">
                                                            ${zipInfo ? `<span class="document-zip" title="来源: ${zipInfo}${zipPath ? ' - ' + zipPath : ''}">
                                                                📦 ${zipInfo}${zipPath ? ' (' + zipPath + ')' : ''}
                                                            </span>` : ''}
                                                        </div>
                                                    </div>
                                                    <div class="document-actions">
                                                        <button class="btn btn-sm btn-success" onclick="openEditModal('${docId}', '${cycle}', '${docName}')">编辑</button>
                                                        <button class="btn btn-sm btn-danger" onclick="handleDeleteDocument('${docId}')">删除</button>
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
                
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
                                return getDocValue('signer') || getDocValue('no_signature');
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
                                    
                                    // 按目录分组文档
                                    const docsByDirectory = {};
                                    docs.forEach(doc => {
                                        const directory = doc.directory || '/';
                                        if (!docsByDirectory[directory]) docsByDirectory[directory] = [];
                                        docsByDirectory[directory].push(doc);
                                    });
                                    
                                    // 获取该文档类型的要求
                                    const docConfig = cycle.requiredDocs.find(d => d.name === typeName);
                                    const requirement = docConfig?.requirement || '';
                                    const hasSignRequirement = requirement.includes('签字') || requirement.includes('签名');
                                    const hasSealRequirement = requirement.includes('盖章') || requirement.includes('章');
                                    const docIndex = docConfig?._originalIndex || (typeIndex + 1);
                                    
                                    return `
                                        <div style="margin-bottom: 20px;">
                                            <h6 style="margin: 10px 0 8px; color: #495057; font-size: 14px; font-weight: 600; background: #e9ecef; padding: 6px 10px; border-radius: 4px;">
                                                ${docIndex}. 📄 ${typeName} (${docs.length}个文件)
                                            </h6>
                                            ${Object.entries(docsByDirectory).map(([directory, dirDocs]) => {
                                                const dirName = directory === '/' ? '根目录' : directory;
                                                return `
                                                    <div style="margin-left: 20px; margin-top: 10px;">
                                                        <div style="font-size: 13px; font-weight: 500; color: #6c757d; margin-bottom: 5px;">
                                                            📁 ${dirName} (${dirDocs.length}个文件)
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
                                                                                if (!hasSignRequirement) return '';
                                                                                const getDocValue = (fieldName) => {
                                                                                    if (doc[fieldName] !== undefined) return doc[fieldName];
                                                                                    if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
                                                                                    return null;
                                                                                };
                                                                                const hasNoSign = getDocValue('no_signature');
                                                                                const hasSigner = getDocValue('signer');
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
                                            }).join('')}
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
    // 暴露文档操作函数（供内联onclick调用）
    window.openEditModal = openEditModal;
    window.handleDeleteDocument = handleDeleteDocument;
    window.unarchiveDocument = unarchiveDocument;
    window.openUploadModal = openUploadModal;
    window.batchArchiveCycle = batchArchiveCycle;
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
    
    // 文件选择后实时上传，以便后台识别信息
    fileInput.onchange = async (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            // 显示文件信息
            for (const file of files) {
                showUploadedFile(file);
                console.log('选择的文件:', file.name);
            }
            // 实时上传文件
            await handleUploadDocument({ preventDefault: () => {} });
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
        
        // 模拟智能识别结果（实际项目中应该调用后端API）
        const mockRecognitionData = {
            doc_date: new Date().toISOString().split('T')[0],
            sign_date: new Date().toISOString().split('T')[0],
            signer: '张三',
            has_seal: true,
            party_a_seal: true,
            party_b_seal: false,
            no_seal: false,
            no_signature: false,
            other_seal: '',
            doc_number: '2026-001'
        };
        
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
        
        setValue('docDate', mockRecognitionData.doc_date);
        setValue('signDate', mockRecognitionData.sign_date);
        setValue('signer', mockRecognitionData.signer);
        setValue('hasSeal', mockRecognitionData.has_seal);
        setValue('partyASeal', mockRecognitionData.party_a_seal);
        setValue('partyBSeal', mockRecognitionData.party_b_seal);
        setValue('noSeal', mockRecognitionData.no_seal);
        setValue('noSignature', mockRecognitionData.no_signature);
        setValue('otherSeal', mockRecognitionData.other_seal);
        setValue('docNumber', mockRecognitionData.doc_number);
        
        // 更新上传文件列表中的识别结果
        uploadedFileItems.forEach(item => {
            const fileName = item.dataset.filename;
            showRecognitionResult(fileName, mockRecognitionData);
        });
        
        // 显示识别结果模态框
        showRecognitionResultModal(uploadedFileItems[0].dataset.filename, mockRecognitionData);
        
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
                        <span>${recognitionData.signer || '未识别'}</span>
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
        
        // 动态收集表单数据
        const docData = {};
        
        // 收集文本、日期和文本域输入
        document.querySelectorAll('#editDocForm input[type="text"], #editDocForm input[type="date"], #editDocForm textarea').forEach(input => {
            if (input.id.startsWith('edit') && input.id !== 'editDocId') {
                const fieldName = input.id.replace('edit', '').replace(/([A-Z])/g, '_$1').toLowerCase();
                const value = input.value;
                if (value) {
                    docData[fieldName] = value;
                }
            }
        });
        
        // 收集复选框
        document.querySelectorAll('#editDocForm input[type="checkbox"]').forEach(checkbox => {
            if (checkbox.id.startsWith('edit')) {
                const fieldName = checkbox.id.replace('edit', '').replace(/([A-Z])/g, '_$1').toLowerCase();
                docData[fieldName] = checkbox.checked;
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

