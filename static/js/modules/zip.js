/**
 * ZIP模块 - 处理ZIP文件相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, closeModal } from './ui.js';
import { loadZipPackages, searchZipFiles, deleteZipPackage } from './api.js';
import { renderCycleDocuments } from './document.js';

/**
 * 加载ZIP包列表
 */
export async function loadZipPackagesList() {
    try {
        const packages = await loadZipPackages();
        
        const zipPackageSelect = document.getElementById('zipPackageSelect');
        if (zipPackageSelect) {
            zipPackageSelect.innerHTML = '<option value="">-- 选择ZIP包 --</option>';
            
            packages.forEach(pkg => {
                const option = document.createElement('option');
                option.value = pkg.path;
                option.textContent = `${pkg.name}（${pkg.file_count}个文件）`;
                zipPackageSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('加载ZIP包列表失败:', error);
        showNotification('加载ZIP包列表失败', 'error');
    }
}

/**
 * 搜索ZIP文件
 */
export async function searchZipFilesInPackage(keyword, packagePath) {
    if (!packagePath) {
        showNotification('请先选择ZIP包', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const files = await searchZipFiles(keyword, packagePath);
        
        const zipFilesList = document.getElementById('zipFilesList');
        if (zipFilesList) {
            if (files.length === 0) {
                zipFilesList.innerHTML = '<p class="placeholder">未找到匹配的文件</p>';
            } else {
                zipFilesList.innerHTML = files.map(file => `
                    <div class="zip-file-item" data-path="${file.path}" data-name="${file.name}">
                        <input type="checkbox" class="zip-file-checkbox" />
                        <span class="zip-file-name">${file.name}</span>
                        <span class="zip-file-path">${file.path}</span>
                    </div>
                `).join('');
                
                // 添加复选框事件
                document.querySelectorAll('.zip-file-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', handleZipFileSelect);
                });
                
                // 恢复已选中状态
                fixZipSelectionIssue();
            }
        }
    } catch (error) {
        console.error('搜索ZIP文件失败:', error);
        showNotification('搜索失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理ZIP文件选择
 */
export function handleZipFileSelect(e) {
    const checkbox = e.target;
    const item = checkbox.closest('.zip-file-item');
    const filePath = item.dataset.path;
    const fileName = item.dataset.name;
    
    if (checkbox.checked) {
        // 添加到选中列表
        appState.zipSelectedFiles.push({ path: filePath, name: fileName });
        item.classList.add('selected');
    } else {
        // 从选中列表移除
        appState.zipSelectedFiles = appState.zipSelectedFiles.filter(file => file.path !== filePath);
        item.classList.remove('selected');
    }
    
    // 更新选中信息
    updateZipSelectedInfo();
}

/**
 * 更新ZIP选中信息
 */
export function updateZipSelectedInfo() {
    const selectedCount = appState.zipSelectedFiles.length;
    const zipSelectedInfo = document.getElementById('zipSelectedInfo');
    const zipArchiveBtn = document.getElementById('zipArchiveBtn');
    
    if (selectedCount > 0) {
        if (zipSelectedInfo) {
            zipSelectedInfo.style.display = 'block';
            zipSelectedInfo.textContent = `已选择 ${selectedCount} 个文件`;
        }
        if (zipArchiveBtn) {
            zipArchiveBtn.disabled = false;
            zipArchiveBtn.textContent = `✅ 确认选择（${selectedCount}个）`;
        }
    } else {
        if (zipSelectedInfo) {
            zipSelectedInfo.style.display = 'none';
        }
        if (zipArchiveBtn) {
            zipArchiveBtn.disabled = true;
            zipArchiveBtn.textContent = '✅ 确认选择';
        }
    }
}

/**
 * 处理ZIP归档
 */
export async function handleZipArchive() {
    if (appState.zipSelectedFiles.length === 0) {
        showNotification('请先选择文件', 'error');
        return;
    }
    
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        // 对每个选中的文件进行归档
        let successCount = 0;
        let errorCount = 0;
        
        for (const file of appState.zipSelectedFiles) {
            try {
                const response = await fetch('/api/documents/archive-from-zip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project_id: appState.currentProjectId,
                        cycle: appState.currentCycle,
                        source_path: file.path,
                        doc_name: appState.currentDocument
                    })
                });
                
                const result = await response.json();
                if (result.status === 'success') {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error('归档文件失败:', file.name, error);
                errorCount++;
            }
        }
        
        if (successCount > 0) {
            showNotification(`成功归档 ${successCount} 个文件`, 'success');
            // 清空选中状态
            appState.zipSelectedFiles = [];
            updateZipSelectedInfo();
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        }
        
        if (errorCount > 0) {
            showNotification(`有 ${errorCount} 个文件归档失败`, 'error');
        }
    } catch (error) {
        console.error('归档ZIP文件失败:', error);
        showNotification('归档失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 分片上传配置
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

// 存储当前上传的文件路径，供后台匹配使用
let currentUploadZipPath = null;

/**
 * 处理ZIP上传（支持断点续传）
 */
export async function handleZipUpload(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('zipFileInput');
    const file = fileInput.files[0];
    if (!file) {
        showNotification('请选择ZIP文件', 'error');
        return;
    }
    
    // 获取DOM元素
    const uploadProgressSection = document.getElementById('uploadProgressSection');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const uploadProgressText = document.getElementById('uploadProgressText');
    const uploadProgressPercent = document.getElementById('uploadProgressPercent');
    const startMatchSection = document.getElementById('startMatchSection');
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
    const startBackgroundMatchBtn = document.getElementById('startBackgroundMatchBtn');
    
    // 显示进度条区域，隐藏提交按钮
    uploadProgressSection.style.display = 'block';
    uploadSubmitBtn.style.display = 'none';
    startMatchSection.style.display = 'none';
    
    try {
        // 生成分片ID
        const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const filename = file.name;
        
        // 检查已上传的分片
        const checkResponse = await fetch(
            `/api/documents/zip-check-chunk?filename=${encodeURIComponent(filename)}&fileId=${fileId}`
        );
        const checkResult = await checkResponse.json();
        const uploadedChunks = checkResult.uploaded_chunks || [];
        
        // 计算分片数量
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        
        // 更新进度：开始上传
        uploadProgressText.textContent = '正在上传...';
        uploadProgressBar.style.width = '0%';
        uploadProgressPercent.textContent = '0%';
        
        // 上传缺失的分片
        for (let i = 0; i < totalChunks; i++) {
            if (uploadedChunks.includes(i)) {
                continue; // 跳过已上传的分片
            }
            
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            
            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('filename', filename);
            formData.append('chunkIndex', i);
            formData.append('totalChunks', totalChunks);
            formData.append('fileId', fileId);
            
            const uploadProgress = Math.round((i / totalChunks) * 80);
            uploadProgressBar.style.width = uploadProgress + '%';
            uploadProgressPercent.textContent = uploadProgress + '%';
            uploadProgressText.textContent = `正在上传分片 ${i + 1}/${totalChunks}...`;
            
            await fetch('/api/documents/zip-chunk-upload', {
                method: 'POST',
                body: formData
            });
        }
        
        // 所有分片上传完成，合并文件
        uploadProgressText.textContent = '正在合并文件...';
        uploadProgressBar.style.width = '90%';
        uploadProgressPercent.textContent = '90%';
        
        const mergeResponse = await fetch('/api/documents/zip-chunk-merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, fileId })
        });
        
        const mergeResult = await mergeResponse.json();
        
        if (mergeResult.status !== 'success') {
            throw new Error(mergeResult.message || '文件合并失败');
        }
        
        // 保存文件路径供后台匹配使用
        currentUploadZipPath = mergeResult.file_path;
        
        // 上传完成，显示匹配按钮
        uploadProgressBar.style.width = '100%';
        uploadProgressPercent.textContent = '100%';
        uploadProgressText.textContent = '上传完成！';
        startMatchSection.style.display = 'block';
        
    } catch (error) {
        console.error('上传ZIP文件失败:', error);
        showNotification('上传失败: ' + error.message, 'error');
        uploadProgressSection.style.display = 'none';
        uploadSubmitBtn.style.display = 'inline-block';
    }
}

/**
 * 处理后台匹配（从模态框触发）
 */
export async function handleBackgroundMatch() {
    if (!currentUploadZipPath) {
        showNotification('没有可匹配的文件', 'error');
        return;
    }
    
    // 关闭上传模态框
    closeModal(elements.zipUploadModal);
    
    // 重置表单
    document.getElementById('zipUploadForm').reset();
    document.getElementById('uploadProgressSection').style.display = 'none';
    document.getElementById('startMatchSection').style.display = 'none';
    document.getElementById('uploadSubmitBtn').style.display = 'inline-block';
    
    // 创建底部进度显示
    const progressId = 'zip-match-' + Date.now();
    const progress = showOperationProgress(progressId, '正在启动匹配任务...');
    
    try {
        // 启动匹配任务
        const matchResponse = await fetch('/api/documents/zip-match-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zip_path: currentUploadZipPath,
                project_id: appState.currentProjectId
            })
        });
        
        const matchResult = await matchResponse.json();
        
        if (matchResult.status !== 'success') {
            throw new Error(matchResult.message || '启动匹配任务失败');
        }
        
        const taskId = matchResult.task_id;
        
        // 轮询任务进度
        await pollMatchTask(taskId, progress);
        
    } catch (error) {
        console.error('匹配失败:', error);
        showNotification('匹配失败: ' + error.message, 'error');
    }
}

/**
 * 轮询匹配任务进度
 */
async function pollMatchTask(taskId, progress) {
    return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(
                    `/api/documents/zip-match-status?task_id=${taskId}`
                );
                const result = await response.json();
                
                if (result.status !== 'success') {
                    clearInterval(pollInterval);
                    reject(new Error(result.message || '查询任务状态失败'));
                    return;
                }
                
                const taskStatus = result.task_status;
                const taskProgress = result.progress;
                const message = result.message;
                
                // 更新底部进度
                progress.update(taskProgress, message);
                
                if (taskStatus === 'completed') {
                    clearInterval(pollInterval);
                    progress.update(100, '匹配完成！');
                    
                    // 显示结果
                    const matchResult = result.result;
                    if (matchResult) {
                        showNotification(
                            `匹配完成！共 ${matchResult.total_files} 个文件，匹配成功 ${matchResult.matched_count} 个`,
                            matchResult.matched_count > 0 ? 'success' : 'warning'
                        );
                        
                        // 刷新文档列表
                        if (appState.currentCycle) {
                            await renderCycleDocuments(appState.currentCycle);
                        }
                    }
                    
                    // 关闭进度显示
                    setTimeout(() => {
                        progress.close();
                    }, 3000);
                    
                    resolve();
                } else if (taskStatus === 'failed') {
                    clearInterval(pollInterval);
                    progress.close();
                    reject(new Error(result.message || '匹配任务失败'));
                }
                
            } catch (error) {
                console.error('查询任务状态失败:', error);
            }
        }, 1000);
    });
}
        


/**
 * 处理导入匹配文件
 */
export async function handleImportMatchedFiles() {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/import-matched-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                cycle: appState.currentCycle
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('匹配文件导入成功', 'success');
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入匹配文件失败:', error);
        showNotification('导入失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理确认待确认文件
 */
export async function handleConfirmPendingFiles() {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/confirm-pending-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                cycle: appState.currentCycle
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('待确认文件已确认', 'success');
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('确认失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('确认待确认文件失败:', error);
        showNotification('确认失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理拒绝待确认文件
 */
export async function handleRejectPendingFiles() {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/reject-pending-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                cycle: appState.currentCycle
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('待确认文件已拒绝', 'success');
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('拒绝失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('拒绝待确认文件失败:', error);
        showNotification('拒绝失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 恢复ZIP文件列表中已选中的状态（搜索刷新后重新应用勾选）
 * 注意：ES Module 中 export 函数不可重新赋值，此函数仅做 DOM 状态恢复
 */
export function fixZipSelectionIssue() {
    // 重新应用已选中文件的 DOM 状态
    const zipFileItems = document.querySelectorAll('.zip-file-item');
    zipFileItems.forEach(item => {
        const filePath = item.dataset.path;
        if (appState.zipSelectedFiles.some(f => f.path === filePath)) {
            item.classList.add('selected');
            const checkbox = item.querySelector('.zip-file-checkbox');
            if (checkbox) checkbox.checked = true;
        }
    });
}


