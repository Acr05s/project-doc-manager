/**
 * 文档模块 - 处理文档相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, openModal, closeModal } from './ui.js';
import { uploadDocument, editDocument, deleteDocument, getCycleDocuments } from './api.js';

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
    formData.append('cycle', appState.currentCycle);
    formData.append('doc_date', docDate);
    formData.append('sign_date', signDate);
    formData.append('signer', signer);
    formData.append('has_seal', hasSeal);
    formData.append('party_a_seal', partyASeal);
    formData.append('party_b_seal', partyBSeal);
    formData.append('other_seal', otherSeal);
    
    showLoading(true);
    try {
        const result = await uploadDocument(formData);
        
        if (result.status === 'success') {
            showNotification('文档上传成功', 'success');
            elements.uploadForm.reset();
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
        // 可以在这里添加文件预览逻辑
        console.log('选择的文件:', file.name);
    }
}

/**
 * 处理文档编辑
 */
export async function handleEditDocument(e) {
    e.preventDefault();
    
    const docId = e.target.dataset.docId;
    if (!docId) {
        showNotification('文档ID不存在', 'error');
        return;
    }
    
    const docDate = document.getElementById('editDocDate').value;
    const signDate = document.getElementById('editSignDate').value;
    const signer = document.getElementById('editSigner').value;
    const hasSeal = document.getElementById('editHasSeal').checked;
    const partyASeal = document.getElementById('editPartyASeal').checked;
    const partyBSeal = document.getElementById('editPartyBSeal').checked;
    const otherSeal = document.getElementById('editOtherSeal').value;
    
    const docData = {
        doc_date: docDate,
        sign_date: signDate,
        signer: signer,
        has_seal: hasSeal,
        party_a_seal: partyASeal,
        party_b_seal: partyBSeal,
        other_seal: otherSeal
    };
    
    showLoading(true);
    try {
        const result = await editDocument(docId, docData);
        
        if (result.status === 'success') {
            showNotification('文档编辑成功', 'success');
            closeModal(elements.editDocModal);
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
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
                    // 刷新文档列表
                    await renderCycleDocuments(appState.currentCycle);
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
export async function renderCycleDocuments(cycle) {
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

    // 新布局：左侧组织机构人员，中间文件名+附加属性，右侧确认按钮
    const html = `
        <h2 style="text-align: left;">📋 ${cycle} - 文档管理</h2>
        
        <!-- 新文档管理布局 -->
        <div class="new-documents-layout">
            <table class="documents-table">
                <thead>
                    <tr>
                        <th class="col-org" style="text-align: center;">文档类型</th>
                        <th class="col-files" style="text-align: center;">文件列表</th>
                        <th class="col-action" style="text-align: center;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${requiredDocs.map(doc => {
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
                        
                        // 检查文档是否符合要求
                        const isCompliant = docsList.length > 0;
                        const requirementColor = isCompliant ? '#d4edda' : '#fff3cd';
                        
                        return `
                        <tr class="doc-row ${isArchived ? 'archived' : ''}">
                            <td class="col-org" style="text-align: center; width: 250px;">
                                <div class="org-info" style="display: inline-block; text-align: center;">
                                    <div style="position: relative; border: 1px solid transparent; padding: 10px; border-radius: 4px;">
                                        ${isArchived ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">已归档</div>` : ''}
                                        <div class="doc-type" style="text-align: center;">${doc.name}</div>
                                        ${doc.requirement ? `<div class="doc-requirement" style="background: ${requirementColor}; padding: 3px 8px; border-radius: 4px; margin-top: 5px; display: inline-block; text-align: center; margin: 5px auto 0; max-width: 90%;">${doc.requirement}</div>` : ''}
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
                                            <button class="btn btn-success btn-sm" onclick="openEditModal('${docsList[0].id}')">
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
    `;
    
    elements.contentArea.innerHTML = html;
}

/**
 * 预览文档
 */
export function previewDocument(docId) {
    window.open(`/api/documents/preview/${docId}`, '_blank');
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
    // 打开模态框
    openModal(elements.documentModal);
}

/**
 * 打开编辑模态框
 */
export async function openEditModal(docId) {
    // 打开第二个标签页（维护已选择文档）
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.main-tab-content').forEach(content => content.style.display = 'none');
    document.querySelector('.main-tab-btn[data-tab="maintain"]').classList.add('active');
    document.getElementById('maintainTab').style.display = 'block';
    // 加载已上传的文档
    if (appState.currentCycle && appState.currentDocument) {
        await loadUploadedDocuments(appState.currentCycle, appState.currentDocument);
    }
    // 打开模态框
    openModal(elements.documentModal);
}

/**
 * 归档文档
 */
export async function archiveDocument(cycle, docName) {
    try {
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
            // 刷新文档列表
            await renderCycleDocuments(cycle);
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
            // 刷新文档列表
            await renderCycleDocuments(cycle);
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
 * 加载已上传的文档
 */
export async function loadUploadedDocuments(cycle, docName) {
    try {
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(cycle)}&doc_name=${encodeURIComponent(docName)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const documents = result.data || [];
            const documentsList = document.getElementById('documentsList');
            
            if (documentsList) {
                if (documents.length === 0) {
                    documentsList.innerHTML = '<p class="placeholder">暂无已上传文档</p>';
                } else {
                    documentsList.innerHTML = documents.map(doc => `
                        <div class="document-item">
                            <span class="document-name" onclick="previewDocument('${doc.id}')">${doc.original_filename || doc.filename}</span>
                            <div class="document-actions">
                                <button class="btn btn-sm btn-success" onclick="openEditModal('${doc.id}')">编辑</button>
                                <button class="btn btn-sm btn-danger" onclick="handleDeleteDocument('${doc.id}')">删除</button>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
    } catch (error) {
        console.error('加载已上传文档失败:', error);
    }
}