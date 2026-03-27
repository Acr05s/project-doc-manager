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
    
    const file = elements.fileInput.files[0];
    if (!file) {
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
    
    showLoading(true);
    try {
        const result = await uploadDocument(formData);
        
        if (result.status === 'success') {
            showNotification('文档上传成功', 'success');
            elements.fileInput.value = '';
            elements.docDate.value = '';
            elements.signDate.value = '';
            elements.signer.value = '';
            elements.hasSeal.checked = false;
            elements.partyASeal.checked = false;
            elements.partyBSeal.checked = false;
            elements.otherSeal.value = '';
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('上传失败: ' + result.message, 'error');
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
    const file = e.target.files[0];
    if (file) {
        // 显示文件信息
        showUploadedFile(file);
        console.log('选择的文件:', file.name);
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
        'editOtherSeal': 'other_seal'
    };
    
    // 动态收集表单数据
    const docData = {};
    
    // 收集文本、日期和文本域输入
    form.querySelectorAll('input[type="text"], input[type="date"], textarea').forEach(input => {
        if (input.id.startsWith('edit') && fieldNameMap[input.id]) {
            docData[fieldNameMap[input.id]] = input.value;
        }
    });
    
    // 收集复选框
    form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        if (checkbox.id.startsWith('edit') && fieldNameMap[checkbox.id]) {
            docData[fieldNameMap[checkbox.id]] = checkbox.checked;
        }
    });
    
    showLoading(true);
    try {
        const result = await editDocument(docId, docData);
        
        if (result.status === 'success') {
            showNotification('文档编辑成功', 'success');
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
 * 渲染周期内的文档
 */
export async function renderCycleDocuments(cycle, filterOptions = {}) {
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
    let allDocTypes = [...requiredDocs];
    
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
    
    // 应用过滤
    allDocTypes = allDocTypes.filter(doc => {
        const isArchived = appState.projectConfig.documents_archived?.[cycle]?.[doc.name];
        const hasFiles = (docsByName[doc.name] || []).length > 0;
        
        if (filterOptions.hideArchived && isArchived) {
            return false;
        }
        if (filterOptions.hideCompleted && hasFiles) {
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
            <h2 style="text-align: left; margin: 0;">📋 ${cycle} - 文档管理</h2>
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
                    <input type="text" id="keywordFilter" placeholder="输入关键字" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; width: 150px; font-size: 14px;" value="${appState.filterOptions.keyword || ''}" onchange="filterDocuments('${cycle}')">
                    <span style="color: #666; font-size: 14px;">🔍</span>
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
                        
                        // 生成文件列表，按目录分组显示
                        const fileListHtml = docsList.length > 0 ? 
                            Object.entries(docsByDirectory).map(([directory, directoryDocs]) => {
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
                                    const signDate = getField('sign_date');
                                    const noSignature = getField('no_signature');
                                    const partyASeal = getField('party_a_seal');
                                    const partyBSeal = getField('party_b_seal');
                                    const hasSealMarked = getField('has_seal_marked') || getField('has_seal');
                                    const noSeal = getField('no_seal');
                                    const otherSeal = getField('other_seal');
                                    
                                    if (docDate) attrParts.push(`📅${formatDateToMonth(docDate)}`);
                                    if (signer) attrParts.push(`✍️${signer}`);
                                    if (signDate) attrParts.push(`📆${formatDateToMonth(signDate)}`);
                                    if (noSignature) attrParts.push('❌不签字');
                                    if (partyASeal) attrParts.push('🏢甲');
                                    if (partyBSeal) attrParts.push('🏭乙');
                                    if (hasSealMarked) attrParts.push('🔖');
                                    if (noSeal) attrParts.push('❌不盖章');
                                    if (otherSeal) attrParts.push(`📍${otherSeal}`);
                                    
                                    // 检查文件是否满足要求（支持带下划线前缀的字段名）
                                    const requirement = doc.requirement || '';
                                    let missingRequirements = [];
                                    
                                    // 辅助函数：获取字段值（支持带下划线前缀）
                                    const getDocValue = (fieldName) => {
                                        if (d[fieldName] !== undefined) return d[fieldName];
                                        if (d[`_${fieldName}`] !== undefined) return d[`_${fieldName}`];
                                        return null;
                                    };
                                    
                                    const hasSigner = getDocValue('signer');
                                    const hasNoSignature = getDocValue('no_signature');
                                    const hasPartyASeal = getDocValue('party_a_seal');
                                    const hasPartyBSeal = getDocValue('party_b_seal');
                                    const hasHasSealMarked = getDocValue('has_seal_marked') || getDocValue('has_seal');
                                    const hasNoSeal = getDocValue('no_seal');
                                    const hasDocDate = getDocValue('doc_date');
                                    const hasSignDate = getDocValue('sign_date');
                                    
                                    // 检查签字要求（避免重复）
                                    const hasSignatureRequirement = requirement.includes('乙方签字') || requirement.includes('甲方签字') || requirement.includes('签字');
                                    if (hasSignatureRequirement && !hasSigner && !hasNoSignature) {
                                        if (requirement.includes('乙方签字') && requirement.includes('甲方签字')) {
                                            missingRequirements.push('甲乙方签字');
                                        } else if (requirement.includes('乙方签字')) {
                                            missingRequirements.push('乙方签字');
                                        } else if (requirement.includes('甲方签字')) {
                                            missingRequirements.push('甲方签字');
                                        } else if (requirement.includes('签字')) {
                                            missingRequirements.push('签字');
                                        }
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
                                            ${d.original_filename || d.filename}
                                        </span>
                                        ${attrParts.length > 0 ? `<span class="doc-attrs">${attrParts.join(' ')}</span>` : ''}
                                        ${missingHtml}
                                    </div>`;
                                }).join('');
                                
                                return directoryTitleHtml + filesHtml;
                            }).join('')
                            : '<span class="doc-no-files">暂无文件</span>';


                        
                        // 检查文档是否符合要求（是否有任何文档缺失要求）
                        let hasMissingRequirements = false;
                        if (docsList.length > 0 && doc.requirement) {
                            const requirement = doc.requirement;
                            for (const d of docsList) {
                                const getDocValue = (fieldName) => {
                                    if (d[fieldName] !== undefined) return d[fieldName];
                                    if (d[`_${fieldName}`] !== undefined) return d[`_${fieldName}`];
                                    return null;
                                };
                                
                                const hasSigner = getDocValue('signer');
                                const hasNoSignature = getDocValue('no_signature');
                                const hasPartyASeal = getDocValue('party_a_seal');
                                const hasPartyBSeal = getDocValue('party_b_seal');
                                const hasHasSealMarked = getDocValue('has_seal_marked') || getDocValue('has_seal');
                                const hasNoSeal = getDocValue('no_seal');
                                const hasDocDate = getDocValue('doc_date');
                                const hasSignDate = getDocValue('sign_date');
                                
                                // 检查是否有缺失的要求
                                if (requirement.includes('乙方签字') && !hasSigner && !hasNoSignature) hasMissingRequirements = true;
                                if (requirement.includes('甲方签字') && !hasSigner && !hasNoSignature) hasMissingRequirements = true;
                                if (requirement.includes('签字') && !hasSigner && !hasNoSignature) hasMissingRequirements = true;
                                if (requirement.includes('乙方盖章') && !hasPartyBSeal && !hasNoSeal) hasMissingRequirements = true;
                                if (requirement.includes('甲方盖章') && !hasPartyASeal && !hasNoSeal) hasMissingRequirements = true;
                                if (requirement.includes('盖章') && !hasHasSealMarked && !hasPartyASeal && !hasPartyBSeal && !hasNoSeal) hasMissingRequirements = true;
                                if (requirement.includes('文档日期') && !hasDocDate) hasMissingRequirements = true;
                                if (requirement.includes('签字日期') && !hasSignDate) hasMissingRequirements = true;
                                
                                if (hasMissingRequirements) break;
                            }
                        }
                        
                        const isCompliant = docsList.length > 0 && !hasMissingRequirements;
                        const requirementColor = isCompliant ? '#d4edda' : (docsList.length > 0 ? '#fff3cd' : '#fff3cd');
                        
                        console.log('文档信息:', doc);
                        
                        // 获取文档序号
                        const docIndex = doc.index || (index + 1);
                        
                        return `
                        <tr class="doc-row ${isArchived ? 'archived' : ''}">
                            <td style="text-align: center; vertical-align: top; padding: 10px; font-weight: 500; width: 80px; min-width: 80px;">${docIndex}</td>
                            <td class="col-org" style="text-align: center; width: 250px;">
                                <div class="org-info" style="display: inline-block; text-align: center;">
                                    <div style="position: relative; border: 1px solid transparent; padding: 10px; border-radius: 4px;">
                                        ${isArchived ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">已归档</div>` : ''}
                                        <div class="doc-type" style="text-align: center;">${doc.name}</div>
                                        ${doc.requirement ? `<div class="doc-requirement" style="background: ${requirementColor}; padding: 3px 12px; border-radius: 4px; margin-top: 5px; display: inline-block; text-align: center; margin: 5px auto 0;">${doc.requirement}</div>` : ''}
                                    </div>
                                </div>
                            </td>
                            <td class="col-files">
                                ${fileListHtml}
                            </td>
                            <td class="col-action">
                                <div class="action-buttons">
                                    ${!isArchived ? `
                                        <button class="btn btn-primary btn-sm" onclick="openUploadModal('${cycle}', '${doc.name}')">
                                            📁 上传/选择文档
                                        </button>
                                        ${docsList.length > 0 ? `
                                            <button class="btn btn-success btn-sm" onclick="openMaintainModal('${cycle}', '${doc.name}')">
                                                ✏️ 编辑
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-info btn-sm" onclick="archiveDocument('${cycle}', '${doc.name}')">
                                            📦 确认归档
                                        </button>
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
 * 预览文档
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
        
        // 创建预览模态框
        const modalContent = `
            <div class="preview-modal-content">
                <div class="preview-header">
                    <h3>${filename}</h3>
                    <button class="close-btn" onclick="document.getElementById('previewModal').style.display='none'">×</button>
                </div>
                <div class="preview-body">
                    ${getPreviewContent(docId, fileExt)}
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
        
    } catch (error) {
        console.error('预览文档失败:', error);
        showNotification('预览失败: ' + error.message, 'error');
    }
}

/**
 * 根据文件类型生成预览内容
 */
function getPreviewContent(docId, fileExt) {
    const viewUrl = `/api/documents/view/${docId}`;
    
    // 图片预览
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(fileExt)) {
        return `<img src="${viewUrl}" class="preview-image" alt="预览图片" onerror="handlePreviewError(this)">`;
    }
    
    // PDF预览
    if (fileExt === 'pdf') {
        return `<iframe src="${viewUrl}" class="preview-iframe" frameborder="0" onload="handleIframeLoad(this)" onerror="handlePreviewError(this)"></iframe>`;
    }
    
    // Office文档预览（转换为PDF后预览）
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
        return `<iframe src="${viewUrl}" class="preview-iframe" frameborder="0" onload="handleIframeLoad(this)" onerror="handlePreviewError(this)"></iframe>`;
    }
    
    // 其他文件类型，提供下载链接
    return `
        <div class="preview-other">
            <div class="file-icon">📄</div>
            <p>该文件类型不支持在线预览</p>
            <a href="${viewUrl}" class="btn btn-primary" target="_blank" onclick="handleDownloadClick(event, this)">下载文件</a>
        </div>
    `;
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
    // 上传方式切换（用 onclick 避免重复绑定）
    document.querySelectorAll('.method-tab-btn').forEach(btn => {
        btn.onclick = function() {
            const tab = this.dataset.tab;
            
            // 更新按钮状态
            document.querySelectorAll('.method-tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 显示对应内容
            document.querySelectorAll('.method-tab-content').forEach(content => content.style.display = 'none');
            const tabEl = document.getElementById(tab + 'UploadTab');
            if (tabEl) {
                tabEl.style.display = 'block';
                console.log('切换到标签页:', tab, '显示元素:', tabEl.id);
                
                // 当切换到选择文档标签时，重新填充当前文档名并搜索
                if (tab === 'select') {
                    const currentDoc = appState.currentDocument;
                    const keywordInput = document.getElementById('selectFileKeyword');
                    if (keywordInput) {
                        keywordInput.value = currentDoc || '';
                        // 自动加载目录并搜索
                        if (currentDoc) {
                            loadDirectories().then(() => {
                                searchFiles(currentDoc);
                            }).catch(() => {
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

    
    // 显示文档附加属性要求
    displayDocumentRequirements();
    
    // 加载目录按钮（用 onclick 避免重复绑定）
    const loadDirectoriesBtn = document.getElementById('loadDirectoriesBtn');
    if (loadDirectoriesBtn) {
        loadDirectoriesBtn.onclick = loadDirectories;
    }
    
    // 搜索文件按钮
    const searchFilesBtn = document.getElementById('searchFilesBtn');
    if (searchFilesBtn) {
        searchFilesBtn.onclick = function() {
            const keyword = document.getElementById('selectFileKeyword').value;
            searchFiles(keyword);
        };
    }
    
    // 自动搜索当前文档（先加载目录，再搜索）
    const currentDoc = appState.currentDocument;
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
    if (selectArchiveBtn) {
        selectArchiveBtn.onclick = handleSelectArchive;
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
}

/**
 * 显示文档附加属性要求并动态生成表单
 */
function displayDocumentRequirements() {
    const requirementText = document.getElementById('requirementText');
    const dynamicDocInfo = document.getElementById('dynamicDocInfo');
    
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
            }
        }
    }
    
    // 显示要求文本
    if (requirementText) {
        requirementText.textContent = requirement;
    }
    
    // 动态生成表单
    if (dynamicDocInfo) {
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
    try {
        showLoading(true);
        
        if (!appState.currentProjectId || !appState.projectConfig) {
            showNotification('请先选择项目', 'error');
            return;
        }
        
        // 尝试从API获取实际的上传目录
        const response = await fetch(`/api/documents/directories?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}`);
        const result = await response.json();
        
        // 调试日志
        console.log('[loadDirectories] API响应:', result);
        console.log('[loadDirectories] directories:', result.directories);
        console.log('[loadDirectories] project_id:', appState.currentProjectId);
        console.log('[loadDirectories] project_name:', appState.projectConfig.name);
        
        const directorySelect = document.getElementById('directorySelect');
        console.log('[loadDirectories] directorySelect元素:', directorySelect);
        console.log('[loadDirectories] result.status:', result.status);
        console.log('[loadDirectories] result.directories.length:', result.directories ? result.directories.length : 0);
        
        if (directorySelect) {
            directorySelect.innerHTML = '<option value="">-- 选择文档包 --</option>';
            
            if (result.status === 'success' && result.directories && result.directories.length > 0) {
                console.log('[loadDirectories] 开始添加选项...');
                result.directories.forEach((dir, index) => {
                    console.log(`[loadDirectories] 添加选项 ${index}:`, dir);
                    const option = document.createElement('option');
                    option.value = dir.id;
                    option.textContent = dir.name;
                    directorySelect.appendChild(option);
                    console.log(`[loadDirectories] 选项 ${index} 已添加，当前innerHTML:`, directorySelect.innerHTML.substring(0, 200));
                });
                console.log('[loadDirectories] 选项添加完成，当前选项数:', directorySelect.options.length);
                console.log('[loadDirectories] 最终innerHTML:', directorySelect.innerHTML);
                // 强制刷新下拉框显示
                directorySelect.style.display = 'none';
                directorySelect.offsetHeight; // 触发重排
                directorySelect.style.display = '';
                showNotification('文档包加载成功', 'success');
            } else {
                console.log('[loadDirectories] 没有可用文档包');
                // 如果没有找到文档包，显示提示
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无可用文档包';
                option.disabled = true;
                directorySelect.appendChild(option);
                showNotification('暂无可用文档包，请先上传ZIP文档包', 'info');
            }
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
    try {
        showLoading(true);
        
        if (!appState.currentProjectId || !appState.projectConfig) {
            showNotification('请先选择项目', 'error');
            return;
        }
        
        // 获取选中的文档包（可为空，空时搜索所有目录）
        const directorySelect = document.getElementById('directorySelect');
        const selectedPackageId = directorySelect ? directorySelect.value : '';
        
        // 从API搜索实际文件
        const response = await fetch(`/api/documents/files/search?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}&directory=${encodeURIComponent(selectedPackageId)}&keyword=${encodeURIComponent(keyword || '')}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const files = result.files || [];
            displaySelectedFiles(files);
        } else {
            showNotification('搜索失败: ' + (result.message || '未知错误'), 'error');
            displaySelectedFiles([]);
        }
    } catch (error) {
        console.error('搜索文件失败:', error);
        showNotification('搜索文件失败，请检查网络连接', 'error');
        displaySelectedFiles([]);
    } finally {
        showLoading(false);
    }
}

/**
 * 显示选择的文件列表
 */
export function displaySelectedFiles(files) {
    const selectedFilesList = document.getElementById('selectedFilesList');
    if (!selectedFilesList) return;
    
    if (files.length === 0) {
        selectedFilesList.innerHTML = '<p class="placeholder">未找到匹配的文件</p>';
    } else {
        selectedFilesList.innerHTML = files.map(file => {
            const isUsed = file.used || false;
            return `
                <div class="zip-file-item ${isUsed ? 'used' : ''}" data-path="${file.path}" data-name="${file.name}">
                    <input type="checkbox" class="zip-file-checkbox" ${isUsed ? 'disabled' : ''} />
                    <span class="zip-file-name">${file.name}</span>
                    <span class="zip-file-path">${file.rel_path || file.path}</span>
                    ${isUsed ? '<span class="file-used-badge">已被使用</span>' : ''}
                </div>
            `;
        }).join('');
        
        // 添加复选框事件
        document.querySelectorAll('.zip-file-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectedFilesCount);
        });
    }
}

/**
 * 更新已选择文件数量
 */
function updateSelectedFilesCount() {
    const selectedCheckboxes = document.querySelectorAll('.zip-file-checkbox:checked');
    const selectedCount = selectedCheckboxes.length;
    const selectedInfo = document.getElementById('selectedInfo');
    const selectArchiveBtn = document.getElementById('selectArchiveBtn');
    
    if (selectedInfo) {
        selectedInfo.style.display = selectedCount > 0 ? 'block' : 'none';
        selectedInfo.textContent = `已选择 ${selectedCount} 个文件`;
    }
    
    if (selectArchiveBtn) {
        selectArchiveBtn.disabled = selectedCount === 0;
    }
}

/**
 * 处理选择文档归档
 */
async function handleSelectArchive() {
    const selectedCheckboxes = document.querySelectorAll('.zip-file-checkbox:checked');
    const selectedFiles = Array.from(selectedCheckboxes).map(cb => ({
        path: cb.closest('.zip-file-item').dataset.path,
        name: cb.closest('.zip-file-item').dataset.name
    }));
    
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
                files: selectedFiles
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification(`成功选择 ${selectedFiles.length} 个文件`, 'success');
            
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
    appState.currentCycle = cycle;
    appState.currentDocument = docName;
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
    
    // 初始化上传方式切换
    initUploadMethodTabs();
    
    // 初始化拖拽上传功能
    initDragAndDrop();
    
    // 打开模态框
    openModal(elements.documentModal);
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
    
    if (appState.projectConfig && cycle && docName) {
        const cycleDocs = appState.projectConfig.documents[cycle];
        if (cycleDocs && cycleDocs.required_docs) {
            const docInfo = cycleDocs.required_docs.find(d => d.name === docName);
            if (docInfo) {
                requirement = docInfo.requirement || '无特殊要求';
                // 解析附加属性
                attributes = parseRequirementAttributes(requirement);
            }
        }
    }
    
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
                    <td class="input-cell"><input type="date" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" value="${actualValue || ''}"></td>
                `;
            } else if (attr1.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" placeholder="${attr1.placeholder || ''}" value="${actualValue || ''}"></td>
                `;
            } else if (attr1.type === 'checkbox' && attr1.inline) {
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" ${actualValue ? 'checked' : ''}>
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
                    <td class="input-cell"><input type="date" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" value="${actualValue || ''}"></td>
                `;
            } else if (attr2.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" placeholder="${attr2.placeholder || ''}" value="${actualValue || ''}"></td>
                `;
            } else if (attr2.type === 'checkbox' && attr2.inline) {
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" ${actualValue ? 'checked' : ''}>
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
    formHtml += `
        <tr>
            <td class="label-cell"><label>备注</label></td>
            <td class="input-cell" colspan="3">
                <textarea id="editRemark" placeholder="输入备注信息" rows="3">${doc.remark || ''}</textarea>
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
 * @returns {Array} - 缺失的要求列表
 */
function checkMissingRequirements(doc, requirement) {
    const missingRequirements = [];
    
    if (!requirement) return missingRequirements;
    
    // 检查签字要求
    if (requirement.includes('乙方签字') && !doc.signer && !doc.no_signature) {
        missingRequirements.push('乙方签字');
    }
    if (requirement.includes('甲方签字') && !doc.signer && !doc.no_signature) {
        missingRequirements.push('甲方签字');
    }
    if (requirement.includes('签字') && !doc.signer && !doc.no_signature) {
        missingRequirements.push('签字');
    }
    
    // 检查盖章要求
    if (requirement.includes('乙方盖章') && !doc.party_b_seal && !doc.no_seal) {
        missingRequirements.push('乙方盖章');
    }
    if (requirement.includes('甲方盖章') && !doc.party_a_seal && !doc.no_seal) {
        missingRequirements.push('甲方盖章');
    }
    if (requirement.includes('盖章') && !doc.has_seal_marked && !doc.has_seal && !doc.party_a_seal && !doc.party_b_seal && !doc.no_seal) {
        missingRequirements.push('盖章');
    }
    
    // 检查日期要求
    if (requirement.includes('文档日期') && !doc.doc_date) {
        missingRequirements.push('文档日期');
    }
    if (requirement.includes('签字日期') && !doc.sign_date) {
        missingRequirements.push('签字日期');
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
            return;
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
                return; // 用户取消归档
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
        } else {
            showNotification('归档失败', 'error');
        }
    } catch (error) {
        console.error('归档文档失败:', error);
        showNotification('归档失败: ' + error.message, 'error');
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
                
                // 添加全选和反选按钮
                documentsList.innerHTML = `
                    <div class="batch-actions" style="margin-bottom: 10px;">
                        <button class="btn btn-sm btn-primary" onclick="selectAllMaintainDocuments()">全选</button>
                        <button class="btn btn-sm btn-warning" onclick="deselectAllMaintainDocuments()">反选</button>
                    </div>
                    <div class="documents-tree">
                        ${Object.entries(groupedDocs).map(([directory, docs]) => {
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
                // 收集要求的文档
                cycleData.requiredDocs = cycleDocs.required_docs || [];
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
                    const missing = checkMissingRequirements(doc, requirement);
                    const isCompliant = missing.length === 0;
                    
                    return {
                        ...doc,
                        archived: isArchived,
                        compliant: isCompliant,
                        missingRequirements: missing
                    };
                });
                
                cycleData.uploadedDocs = docsWithStatus;
                cycleData.statistics.uploadedDocs = docsWithStatus.length;
                
                // 识别缺失的文档
                const uploadedDocNames = new Set(docsWithStatus.map(doc => doc.doc_name));
                cycleData.missingDocs = cycleData.requiredDocs.filter(doc => 
                    !uploadedDocNames.has(doc.name)
                );
                cycleData.statistics.missingDocs = cycleData.missingDocs.length;
                
                // 计算统计数据
                if (docsWithStatus.length > 0) {
                    // 归档文档数
                    cycleData.statistics.archivedDocs = docsWithStatus.filter(doc => doc.archived).length;
                    
                    // 签字率
                    const signedDocs = docsWithStatus.filter(doc => doc.signer || doc.no_signature).length;
                    cycleData.statistics.signedDocs = signedDocs;
                    cycleData.statistics.signatureRate = (signedDocs / docsWithStatus.length * 100).toFixed(1);
                    
                    // 盖章率
                    const sealedDocs = docsWithStatus.filter(doc => 
                        doc.has_seal_marked || doc.has_seal || doc.party_a_seal || doc.party_b_seal || doc.no_seal
                    ).length;
                    cycleData.statistics.sealedDocs = sealedDocs;
                    cycleData.statistics.sealRate = (sealedDocs / docsWithStatus.length * 100).toFixed(1);
                    
                    // 合格率
                    const compliantDocs = docsWithStatus.filter(doc => doc.compliant).length;
                    cycleData.statistics.compliantDocs = compliantDocs;
                    cycleData.statistics.complianceRate = (compliantDocs / docsWithStatus.length * 100).toFixed(1);
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
                            <p>要求文档: ${cycle.requiredDocs.length} 个</p>
                            <p>已上传文档: ${cycle.uploadedDocs.length} 个</p>
                            <p>缺失文档: ${cycle.missingDocs.length} 个</p>
                            
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
                                    ${cycle.missingDocs.map(doc => `<li>${doc.name}</li>`).join('')}
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
                                // 生成按类型分组的表格HTML
                                return Object.entries(docsByType).map(([typeName, docs]) => {
                                    // 按目录分组文档
                                    const docsByDirectory = {};
                                    docs.forEach(doc => {
                                        const directory = doc.directory || '/';
                                        if (!docsByDirectory[directory]) docsByDirectory[directory] = [];
                                        docsByDirectory[directory].push(doc);
                                    });
                                    
                                    return `
                                        <div style="margin-bottom: 20px;">
                                            <h6 style="margin: 10px 0 8px; color: #495057; font-size: 14px; font-weight: 600; background: #e9ecef; padding: 6px 10px; border-radius: 4px;">
                                                📄 ${typeName} (${docs.length}个文件)
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
                                                                    <th style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: left;">文件名</th>
                                                                    <th style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: left;">上传时间</th>
                                                                    <th style="padding: 6px 8px; border: 1px solid #dee2e6; text-align: left;">状态</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                ${dirDocs.map(doc => `
                                                                    <tr ${doc.archived ? 'style="background-color: #e6f7ff;"' : ''}>
                                                                        <td style="padding: 6px 8px; border: 1px solid #dee2e6;">${doc.original_filename || doc.filename} ${doc.archived ? '<span style="color: #1890ff; font-size: 11px; margin-left: 8px;">（已归档）</span>' : ''}</td>
                                                                        <td style="padding: 6px 8px; border: 1px solid #dee2e6;">${doc.upload_time ? new Date(doc.upload_time).toLocaleString() : '未知'}</td>
                                                                        <td style="padding: 6px 8px; border: 1px solid #dee2e6;">
                                                                            ${doc.no_signature ? '✓ 无签字' : (doc.signer ? '✓ 有签字' : '⚠ 无签字')}
                                                                            ${doc.no_seal ? ' | ✓ 无盖章' : (doc.has_seal_marked ? ' | ✓ 有盖章' : ' | ⚠ 无盖章')}
                                                                            ${doc.archived ? ' | <span style="color: #1890ff;">✓ 已归档</span>' : ''}
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
    
    // 文件选择后自动上传（使用 onchange 赋值避免重复绑定）
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await handleAsyncUpload(file);
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
    
    dropZone.ondrop = async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            // 检查是否是文件夹
            if (files[0].webkitRelativePath) {
                await handleFolderUpload(files);
            } else {
                await handleAsyncUpload(files[0]);
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
 * 处理批量编辑 - 复用编辑文档模态框
 */
export function handleBatchEdit() {
    const selectedCheckboxes = document.querySelectorAll('.document-checkbox:checked');
    const selectedDocIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择文档', 'error');
        return;
    }
    
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
    
    // 两两配对，每行显示两个属性
    for (let i = 0; i < attributes.length; i += 2) {
        const attr1 = attributes[i];
        const attr2 = attributes[i + 1];
        
        let rowHtml = '<tr>';
        
        // 第一个属性
        if (attr1) {
            if (attr1.type === 'date') {
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell"><input type="date" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" value=""></td>
                `;
            } else if (attr1.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}" placeholder="${attr1.placeholder || ''}" value=""></td>
                `;
            } else if (attr1.type === 'checkbox' && attr1.inline) {
                rowHtml += `
                    <td class="label-cell"><label>${attr1.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${attr1.id.charAt(0).toUpperCase() + attr1.id.slice(1)}">
                            <span>${attr1.label}</span>
                        </label>
                    </td>
                `;
            } else if (attr1.type === 'checkbox_group') {
                const optionsHtml = attr1.options.map(opt => `
                    <label class="checkbox-item">
                        <input type="checkbox" id="edit${opt.id.charAt(0).toUpperCase() + opt.id.slice(1)}">
                        <span>${opt.label}</span>
                    </label>
                `).join('');
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
            if (attr2.type === 'date') {
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell"><input type="date" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" value=""></td>
                `;
            } else if (attr2.type === 'text') {
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell"><input type="text" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}" placeholder="${attr2.placeholder || ''}" value=""></td>
                `;
            } else if (attr2.type === 'checkbox' && attr2.inline) {
                rowHtml += `
                    <td class="label-cell"><label>${attr2.label}</label></td>
                    <td class="input-cell">
                        <label class="checkbox-item">
                            <input type="checkbox" id="edit${attr2.id.charAt(0).toUpperCase() + attr2.id.slice(1)}">
                            <span>${attr2.label}</span>
                        </label>
                    </td>
                `;
            } else if (attr2.type === 'checkbox_group') {
                const optionsHtml = attr2.options.map(opt => `
                    <label class="checkbox-item">
                        <input type="checkbox" id="edit${opt.id.charAt(0).toUpperCase() + opt.id.slice(1)}">
                        <span>${opt.label}</span>
                    </label>
                `).join('');
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
    
    // 添加表单操作按钮（复用样式）
    formHtml += `
        <div class="form-actions">
            <button type="submit" class="btn btn-success">批量保存修改 (${selectedDocIds.length}个)</button>
            <button type="button" class="btn btn-secondary" onclick="closeEditModal()">取消</button>
        </div>
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

