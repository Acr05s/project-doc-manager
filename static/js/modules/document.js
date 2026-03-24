/**
 * 文档模块 - 处理文档相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, openModal, closeModal } from './ui.js';
import { uploadDocument, editDocument, deleteDocument, getCycleDocuments, loadImportedDocuments, searchImportedDocuments } from './api.js';
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
                    // 刷新维护页面的文档列表
                    await loadMaintainDocumentsList(appState.currentCycle, appState.currentDocument);
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
                        
                        // 检查文档是否符合要求
                        const isCompliant = docsList.length > 0;
                        const requirementColor = isCompliant ? '#d4edda' : '#fff3cd';
                        
                        console.log('文档信息:', doc);
                        
                        return `
                        <tr class="doc-row ${isArchived ? 'archived' : ''}">
                            <td class="col-org" style="text-align: center; width: 250px;">
                                <div class="org-info" style="display: inline-block; text-align: center;">
                                    <div style="position: relative; border: 1px solid transparent; padding: 10px; border-radius: 4px;">
                                        ${isArchived ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">已归档</div>` : ''}
                                        <div class="doc-type" style="text-align: center;">${doc.name}</div>
                                        ${doc.requirement ? `<div class="doc-requirement" style="background: ${requirementColor}; padding: 3px 8px; border-radius: 4px; margin-top: 5px; display: inline-block; text-align: center; margin: 5px auto 0; max-width: 90%;">${doc.requirement}</div>` : '<div class="doc-requirement" style="background: #fff3cd; padding: 3px 8px; border-radius: 4px; margin-top: 5px; display: inline-block; text-align: center; margin: 5px auto 0; max-width: 90%;">无要求</div>'}
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
    
    // Office文档预览（使用本地预览方案，避免网络问题）
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
        const localPreviewUrl = `/api/documents/preview-local/${docId}`;
        return `
            <div class="preview-office">
                <div class="file-icon">📄</div>
                <p>Office文档预览</p>
                <div class="preview-options">
                    <a href="${viewUrl}" class="btn btn-primary" target="_blank" onclick="handleDownloadClick(event, this)">下载文件</a>
                    <button class="btn btn-secondary" onclick="tryLocalPreview('${docId}', '${localPreviewUrl}')">本地预览</button>
                </div>
            </div>
        `;
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
    // 上传方式切换
    document.querySelectorAll('.method-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            
            // 更新按钮状态
            document.querySelectorAll('.method-tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 显示对应内容
            document.querySelectorAll('.method-tab-content').forEach(content => content.style.display = 'none');
            document.getElementById(tab + 'UploadTab').style.display = 'block';
        });
    });
    
    // 显示文档附加属性要求
    displayDocumentRequirements();
    
    // 加载目录按钮
    const loadDirectoriesBtn = document.getElementById('loadDirectoriesBtn');
    if (loadDirectoriesBtn) {
        loadDirectoriesBtn.addEventListener('click', loadDirectories);
    }
    
    // 搜索文件按钮
    const searchFilesBtn = document.getElementById('searchFilesBtn');
    if (searchFilesBtn) {
        searchFilesBtn.addEventListener('click', function() {
            const keyword = document.getElementById('selectFileKeyword').value;
            searchFiles(keyword);
        });
    }
    
    // 自动搜索当前文档
    const currentDoc = appState.currentDocument;
    if (currentDoc) {
        const keywordInput = document.getElementById('selectFileKeyword');
        if (keywordInput) {
            keywordInput.value = currentDoc;
            // 自动搜索
            searchFiles(currentDoc);
        }
    }
    
    // 确认选择文件按钮
    const selectArchiveBtn = document.getElementById('selectArchiveBtn');
    if (selectArchiveBtn) {
        selectArchiveBtn.addEventListener('click', handleSelectArchive);
    }
    
    // 批量操作按钮
    const batchEditBtn = document.getElementById('batchEditBtn');
    if (batchEditBtn) {
        batchEditBtn.addEventListener('click', handleBatchEdit);
    }
    
    const batchReplaceBtn = document.getElementById('batchReplaceBtn');
    if (batchReplaceBtn) {
        batchReplaceBtn.addEventListener('click', handleBatchReplace);
    }
    
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', handleBatchDelete);
    }
}

/**
 * 显示文档附加属性要求
 */
function displayDocumentRequirements() {
    const requirementText = document.getElementById('requirementText');
    if (!requirementText) return;
    
    // 从项目配置中获取文档要求
    if (appState.projectConfig && appState.currentCycle && appState.currentDocument) {
        const cycleDocs = appState.projectConfig.documents[appState.currentCycle];
        if (cycleDocs && cycleDocs.required_docs) {
            const docInfo = cycleDocs.required_docs.find(doc => doc.name === appState.currentDocument);
            if (docInfo) {
                requirementText.textContent = docInfo.requirement || '无特殊要求';
                return;
            }
        }
    }
    
    requirementText.textContent = '无特殊要求';
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
        
        const response = await fetch(`/api/documents/directories?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const directories = result.directories || [];
            const directorySelect = document.getElementById('directorySelect');
            if (directorySelect) {
                directorySelect.innerHTML = '<option value="">-- 选择目录 --</option>';
                directories.forEach(dir => {
                    const option = document.createElement('option');
                    option.value = dir.id;
                    option.textContent = dir.name;
                    directorySelect.appendChild(option);
                });
            }
        } else {
            showNotification('加载目录失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('加载目录失败:', error);
        showNotification('加载目录失败', 'error');
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
        
        const directorySelect = document.getElementById('directorySelect');
        const directory = directorySelect ? directorySelect.value : '';
        
        const response = await fetch(`/api/documents/files/search?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}&directory=${encodeURIComponent(directory)}&keyword=${encodeURIComponent(keyword)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const files = result.files || [];
            displaySelectedFiles(files);
        } else {
            showNotification('搜索文件失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('搜索文件失败:', error);
        showNotification('搜索文件失败', 'error');
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
    
    // 初始化上传方式切换
    initUploadMethodTabs();
    
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
    
    console.log('打开编辑模态框，文档ID:', docId);
    
    let cycle = appState.currentCycle;
    let docName = appState.currentDocument;
    
    // 确保currentProjectId已设置
    if (!appState.currentProjectId) {
        // 尝试从URL参数获取项目ID
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        if (projectId) {
            appState.currentProjectId = projectId;
            console.log('从URL获取项目ID:', projectId);
        } else {
            console.warn('未找到项目ID');
        }
    }
    
    // 尝试从文档ID获取文档信息
    try {
        console.log('尝试从API获取文档信息:', `/api/documents/${docId}`);
        const response = await fetch(`/api/documents/${docId}`);
        console.log('API响应状态:', response.status);
        
        const result = await response.json();
        console.log('API响应结果:', result);
        
        if (result.status === 'success' && result.data) {
            const doc = result.data;
            console.log('获取到文档信息:', doc);
            
            cycle = doc.cycle;
            docName = doc.doc_name;
            appState.currentCycle = cycle;
            appState.currentDocument = docName;
        } else {
            console.error('获取文档信息失败:', result.message || '未知错误');
            // 不显示错误，尝试直接加载文档列表
        }
    } catch (error) {
        console.error('获取文档信息失败:', error);
        // 不显示错误，尝试直接加载文档列表
    }
    
    // 尝试从URL参数获取周期和文档名称
    if (!cycle || !docName) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlCycle = urlParams.get('cycle');
        const urlDocName = urlParams.get('doc_name');
        
        if (urlCycle && urlDocName) {
            console.log('从URL获取周期和文档名称:', urlCycle, urlDocName);
            cycle = urlCycle;
            docName = urlDocName;
            appState.currentCycle = cycle;
            appState.currentDocument = docName;
        }
    }
    
    console.log('当前状态:', {
        currentProjectId: appState.currentProjectId,
        currentCycle: appState.currentCycle,
        currentDocument: appState.currentDocument
    });
    
    // 加载已上传的文档
    console.log('调用loadUploadedDocuments:', cycle, docName);
    
    // 无论是否有cycle和docName，都尝试加载文档列表
    // 当没有cycle和docName时，loadUploadedDocuments会尝试加载所有文档
    await loadUploadedDocuments(cycle, docName);
    
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
    appState.currentCycle = cycle;
    appState.currentDocument = docName;
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
                // 添加全选和反选按钮
                documentsList.innerHTML = `
                    <div class="batch-actions" style="margin-bottom: 10px;">
                        <button class="btn btn-sm btn-primary" onclick="selectAllMaintainDocuments()">全选</button>
                        <button class="btn btn-sm btn-warning" onclick="deselectAllMaintainDocuments()">反选</button>
                    </div>
                    ${documents.map(doc => {
                        const docId = doc.id || doc.doc_id || `${doc.cycle || doc.cycle_key || 'unknown'}_${doc.doc_name || doc.name || 'unknown'}_${doc.upload_time || doc.filename || Date.now()}`;
                        return `
                            <div class="document-item">
                                <input type="checkbox" class="document-checkbox" data-doc-id="${docId}">
                                <span class="document-name" onclick="previewDocument('${docId}')">${doc.original_filename || doc.filename || '未知文件名'}</span>
                                <div class="document-actions">
                                    <button class="btn btn-sm btn-success" onclick="openEditModal('${docId}')">编辑</button>
                                    <button class="btn btn-sm btn-danger" onclick="handleDeleteDocument('${docId}')">删除</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                `;
                
                // 添加复选框事件
                document.querySelectorAll('.document-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', updateSelectedCount);
                });
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
    const batchReplaceBtn = document.getElementById('batchReplaceBtn');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    
    if (batchEditBtn) batchEditBtn.disabled = selectedCount === 0;
    if (batchReplaceBtn) batchReplaceBtn.disabled = selectedCount === 0;
    if (batchDeleteBtn) batchDeleteBtn.disabled = selectedCount === 0;
}

/**
 * 处理批量编辑
 */
export function handleBatchEdit() {
    const selectedCheckboxes = document.querySelectorAll('.document-checkbox:checked');
    const selectedDocIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.docId);
    
    if (selectedDocIds.length === 0) {
        showNotification('请先选择文档', 'error');
        return;
    }
    
    // 这里可以实现批量编辑功能
    showNotification('批量编辑功能待实现', 'info');
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

