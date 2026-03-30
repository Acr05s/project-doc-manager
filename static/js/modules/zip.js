/**
 * ZIP模块 - 处理ZIP文件相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, closeModal } from './ui.js';
import { loadZipPackages, searchZipFiles, deleteZipPackage, loadProject } from './api.js';
import { renderCycleDocuments } from './document.js';

/**
 * 加载ZIP包列表
 */
export async function loadZipPackagesList() {
    try {
        const packages = await loadZipPackages(appState.currentProjectId);
        
        // 使用 zipPackageSelect，与 directorySelect 区分开
        const zipPackageSelect = document.getElementById('zipPackageSelect');
        if (zipPackageSelect) {
            zipPackageSelect.innerHTML = '<option value="">-- 选择文档包 --</option>';
            
            if (packages.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无已上传的ZIP包';
                option.disabled = true;
                zipPackageSelect.appendChild(option);
            } else {
                packages.forEach(pkg => {
                    const option = document.createElement('option');
                    option.value = pkg.path;
                    option.textContent = `${pkg.name}（${pkg.file_count}个文件）`;
                    zipPackageSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载ZIP包列表失败:', error);
        showNotification('加载ZIP包列表失败', 'error');
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
 * 搜索ZIP文件
 */
export async function searchZipFilesInPackage(keyword, packagePath) {
    showLoading(true);
    try {
        // 有 packagePath 时用指定目录搜索，否则按项目ID搜索所有上传目录
        let files = await searchZipFiles(keyword || '', packagePath || '', appState.currentProjectId);
        
        const zipFilesList = document.getElementById('zipFilesList');
        if (!zipFilesList) return;
        
        // 如果搜索无结果且有关键词，显示所有文件
        if (files.length === 0 && keyword && keyword.trim()) {
            showNotification('未找到匹配文件，显示所有文件', 'info');
            files = await searchZipFiles('', packagePath || '', appState.currentProjectId);
        }
        
        if (files.length === 0) {
            zipFilesList.innerHTML = '<p class="placeholder">暂无文件</p>';
        } else {
            // 使用树状目录结构显示
            const tree = buildZipFileTree(files);
            const isSearchResult = !!(keyword && keyword.trim());
            
            let html = '';
            if (isSearchResult) {
                html += `<div class="search-result-info">搜索结果：找到 ${files.length} 个文件</div>`;
            }
            html += `<div class="zip-file-tree">`;
            html += renderZipFileTree(tree);
            html += `</div>`;
            
            zipFilesList.innerHTML = html;
            
            // 添加复选框事件
            document.querySelectorAll('.zip-file-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', handleZipFileSelect);
            });
            
            // 初始化全选按钮状态
            updateSelectAllButtonState();
        }
    } catch (error) {
        console.error('搜索ZIP文件失败:', error);
        showNotification('搜索失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 将ZIP文件列表按目录结构组织成树状
 * @param {Array} files - 文件列表
 * @returns {Object} 目录树结构
 */
function buildZipFileTree(files) {
    const root = { name: '根目录', children: {}, files: [] };
    
    files.forEach(file => {
        const path = file.rel_path || file.path || '';
        const normalizedPath = path.replace(/\\/g, '/');
        const lastSlashIndex = normalizedPath.lastIndexOf('/');
        const dirPath = lastSlashIndex > 0 ? normalizedPath.substring(0, lastSlashIndex) : '';
        const fileName = lastSlashIndex >= 0 ? normalizedPath.substring(lastSlashIndex + 1) : normalizedPath;
        
        if (!dirPath) {
            root.files.push({ ...file, displayName: fileName });
            return;
        }
        
        const parts = dirPath.split('/').filter(p => p);
        let current = root;
        
        parts.forEach(part => {
            if (!current.children[part]) {
                current.children[part] = { name: part, children: {}, files: [] };
            }
            current = current.children[part];
        });
        
        current.files.push({ ...file, displayName: fileName });
    });
    
    return root;
}

/**
 * 渲染ZIP文件树
 * @param {Object} node - 目录节点
 * @param {number} level - 层级
 * @returns {string} HTML
 */
function renderZipFileTree(node, level = 0) {
    const indent = level * 20;
    let html = '';
    
    // 渲染文件
    node.files.forEach(file => {
        const isSelected = appState.zipSelectedFiles.some(f => f.path === file.path);
        const isUsedByOther = file.used && !isSelected;
        const usedByList = file.used_by || [];
        let usedByHtml = '';
        if (usedByList.length > 0) {
            const usedByText = usedByList.join('，');
            usedByHtml = `<span class="file-used-by" title="${usedByText}">已被选择于: ${usedByText}</span>`;
        }
        
        html += `
            <div class="zip-file-item ${isSelected ? 'selected' : ''} ${isUsedByOther ? 'disabled' : ''}" 
                 data-path="${file.path}" 
                 data-name="${file.name}"
                 style="padding-left: ${indent + 20}px;">
                <input type="checkbox" class="zip-file-checkbox" 
                       ${isSelected ? 'checked' : ''} 
                       ${isUsedByOther ? 'disabled' : ''} />
                <span class="zip-file-icon">📄</span>
                <span class="zip-file-name" title="${file.name}">${file.displayName || file.name}</span>
                ${usedByHtml}
            </div>
        `;
    });
    
    // 渲染子目录
    Object.values(node.children).forEach(child => {
        const hasContent = child.files.length > 0 || Object.keys(child.children).length > 0;
        if (hasContent) {
            const childFileCount = child.files.length + Object.values(child.children).reduce(
                (sum, c) => sum + c.files.length + Object.values(c.children || {}).reduce(
                    (s, cc) => s + cc.files.length, 0
                ), 0
            );
            
            html += `
                <div class="zip-folder-item" style="padding-left: ${indent}px;">
                    <div class="zip-folder-header">
                        <span class="zip-folder-icon">📁</span>
                        <span class="zip-folder-name">${child.name}</span>
                        <span class="zip-folder-count">(${childFileCount} 个文件)</span>
                    </div>
                    <div class="zip-folder-content">
                        ${renderZipFileTree(child, level + 1)}
                    </div>
                </div>
            `;
        }
    });
    
    return html;
}

/**
 * 处理ZIP文件选择
 */
export function handleZipFileSelect(e) {
    const checkbox = e.target;
    const item = checkbox.closest('.zip-file-item');
    const filePath = item.dataset.path;
    const fileName = item.dataset.name;
    
    // 检查是否禁用（已被其他文档使用）
    if (checkbox.disabled) {
        checkbox.checked = !checkbox.checked;
        showNotification('该文件已被其他文档类型使用，无法选择', 'warning');
        return;
    }
    
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
    // 更新全选按钮状态
    updateSelectAllButtonState();
}

/**
 * 更新ZIP选中信息
 */
export function updateZipSelectedInfo() {
    const selectedCount = appState.zipSelectedFiles.length;
    const selectedInfo = document.getElementById('selectedInfo');
    const selectedCountText = document.getElementById('selectedCountText');
    const selectArchiveBtn = document.getElementById('selectArchiveBtn');
    
    if (selectedCount > 0) {
        // 更新底部选中信息和清空按钮
        if (selectedInfo) {
            selectedInfo.style.display = 'flex';
            if (selectedCountText) {
                selectedCountText.textContent = `已选择 ${selectedCount} 个文件`;
            }
        }
        // 更新确认选择按钮
        if (selectArchiveBtn) {
            selectArchiveBtn.disabled = false;
            selectArchiveBtn.textContent = `✅ 确认选择（${selectedCount}个）`;
        }
    } else {
        // 隐藏选中信息
        if (selectedInfo) {
            selectedInfo.style.display = 'none';
        }
        // 更新确认选择按钮
        if (selectArchiveBtn) {
            selectArchiveBtn.disabled = true;
            selectArchiveBtn.textContent = '✅ 确认选择';
        }
    }
}



/**
 * 清空已选择文件
 */
export function clearSelectedFiles() {
    appState.zipSelectedFiles = [];
    updateZipSelectedInfo();
    // 更新搜索结果列表中的显示状态
    document.querySelectorAll('.zip-file-item').forEach(item => {
        item.classList.remove('selected');
        const checkbox = item.querySelector('.zip-file-checkbox');
        if (checkbox && !checkbox.disabled) {
            checkbox.checked = false;
        }
    });
    // 更新全选按钮状态
    updateSelectAllButtonState();
}

/**
 * 全选文件
 */
export function selectAllFiles() {
    const fileItems = document.querySelectorAll('.zip-file-item');
    let selectedCount = 0;
    
    fileItems.forEach(item => {
        const checkbox = item.querySelector('.zip-file-checkbox');
        const filePath = item.dataset.path;
        const fileName = item.dataset.name;
        
        // 只选择未禁用且未选择的文件
        if (checkbox && !checkbox.disabled && !checkbox.checked) {
            checkbox.checked = true;
            item.classList.add('selected');
            
            // 检查是否已经在选中列表中
            if (!appState.zipSelectedFiles.some(f => f.path === filePath)) {
                appState.zipSelectedFiles.push({ path: filePath, name: fileName });
            }
            selectedCount++;
        }
    });
    
    if (selectedCount > 0) {
        showNotification(`已选择 ${selectedCount} 个文件`, 'success');
    } else {
        showNotification('没有可选择的新文件', 'info');
    }
    
    // 更新选中信息
    updateZipSelectedInfo();
    // 更新全选按钮状态
    updateSelectAllButtonState();
}

/**
 * 更新全选按钮状态
 */
export function updateSelectAllButtonState() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (!selectAllBtn) return;
    
    const fileItems = document.querySelectorAll('.zip-file-item');
    const selectableItems = Array.from(fileItems).filter(item => {
        const checkbox = item.querySelector('.zip-file-checkbox');
        return checkbox && !checkbox.disabled;
    });
    
    // 检查是否所有可选文件都已被选中
    const allSelected = selectableItems.length > 0 && selectableItems.every(item => {
        const checkbox = item.querySelector('.zip-file-checkbox');
        return checkbox.checked;
    });
    
    if (allSelected) {
        selectAllBtn.textContent = '取消全选';
        selectAllBtn.onclick = () => {
            clearSelectedFiles();
        };
    } else {
        selectAllBtn.textContent = '全选';
        selectAllBtn.onclick = () => {
            selectAllFiles();
        };
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
        
        if (!checkResponse.ok) {
            const errorText = await checkResponse.text();
            throw new Error(`检查分片失败: ${checkResponse.status} - ${errorText}`);
        }
        
        const checkResult = await checkResponse.json();
        
        if (checkResult.status !== 'success') {
            throw new Error(`检查分片失败: ${checkResult.message || '未知错误'}`);
        }
        
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
            
            const chunkResponse = await fetch('/api/documents/zip-chunk-upload', {
                method: 'POST',
                body: formData
            });
            
            if (!chunkResponse.ok) {
                const errorText = await chunkResponse.text();
                throw new Error(`分片 ${i + 1} 上传失败: ${chunkResponse.status} - ${errorText}`);
            }
            
            const chunkResult = await chunkResponse.json();
            if (chunkResult.status !== 'success') {
                throw new Error(`分片 ${i + 1} 上传失败: ${chunkResult.message || '未知错误'}`);
            }
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
        
        if (!mergeResponse.ok) {
            const errorText = await mergeResponse.text();
            throw new Error(`文件合并失败: ${mergeResponse.status} - ${errorText}`);
        }
        
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
        
        // 自动关闭上传模态框（如果用户10秒内未点击匹配按钮）
        setTimeout(() => {
            const startMatchSection = document.getElementById('startMatchSection');
            if (startMatchSection && startMatchSection.style.display === 'block') {
                closeModal(elements.zipUploadModal);
                // 重置表单
                document.getElementById('zipUploadForm').reset();
                document.getElementById('uploadProgressSection').style.display = 'none';
                document.getElementById('startMatchSection').style.display = 'none';
                document.getElementById('uploadSubmitBtn').style.display = 'inline-block';
            }
        }, 10000);
        
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
    
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 保存上传路径
    const zipPath = currentUploadZipPath;
    
    // 关闭上传模态框
    closeModal(elements.zipUploadModal);
    
    // 重置表单
    document.getElementById('zipUploadForm').reset();
    document.getElementById('uploadProgressSection').style.display = 'none';
    document.getElementById('startMatchSection').style.display = 'none';
    document.getElementById('uploadSubmitBtn').style.display = 'inline-block';
    
    // 重置当前上传路径
    currentUploadZipPath = null;
    
    // 创建底部进度显示
    const progressId = 'zip-match-' + Date.now();
    const progress = showOperationProgress(progressId, '正在启动匹配任务...');
    
    try {
        // 启动匹配任务
        const matchResponse = await fetch('/api/documents/zip-match-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zip_path: zipPath,
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
                    console.log('[ZIP匹配] 任务完成，开始处理结果');
                    clearInterval(pollInterval);
                    progress.update(100, '匹配完成！');
                    
                    // 显示结果
                    console.log('[ZIP匹配] result:', result);
                    const matchResult = result.result || {};
                    const totalFiles = matchResult.total_files || 0;
                    const matchedCount = matchResult.matched_count || 0;
                    
                    console.log('[ZIP匹配] 显示通知:', totalFiles, matchedCount);
                    showNotification(
                        `匹配完成！共 ${totalFiles} 个文件，匹配成功 ${matchedCount} 个`,
                        matchedCount > 0 ? 'success' : 'warning'
                    );
                    
                    // 重新加载项目配置
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
                    if (appState.currentCycle) {
                        try {
                            await renderCycleDocuments(appState.currentCycle);
                        } catch (e) {
                            console.error('刷新文档列表失败:', e);
                        }
                    }
                    
                    // 刷新ZIP包列表
                    try {
                        await loadZipPackagesList();
                    } catch (e) {
                        console.error('刷新ZIP包列表失败:', e);
                    }
                    
                    // 关闭进度显示
                    setTimeout(() => {
                        try {
                            progress.close();
                        } catch (e) {
                            console.error('关闭进度显示失败:', e);
                        }
                    }, 2000);
                    
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


