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
        const response = await fetch('/api/documents/archive-from-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                cycle: appState.currentCycle,
                package_path: appState.currentZipPackagePath,
                files: appState.zipSelectedFiles
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('文件归档成功', 'success');
            // 清空选中状态
            appState.zipSelectedFiles = [];
            updateZipSelectedInfo();
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('归档失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('归档ZIP文件失败:', error);
        showNotification('归档失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理ZIP上传
 */
export async function handleZipUpload(e) {
    e.preventDefault();
    
    const file = document.getElementById('zipFileInput').files[0];
    if (!file) {
        showNotification('请选择ZIP文件', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/upload-zip', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('ZIP文件上传成功', 'success');
            closeModal(elements.zipUploadModal);
            document.getElementById('zipUploadForm').reset();
            // 重新加载ZIP包列表
            await loadZipPackagesList();
        } else {
            showNotification('上传失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('上传ZIP文件失败:', error);
        showNotification('上传失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
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
 * 修复ZIP文件选择问题，确保选中的文件能够正确保存和显示
 */
export function fixZipSelectionIssue() {
    // 确保zipSelectedFiles数组正确保存所有选中的文件
    const originalSearchZipFiles = searchZipFilesInPackage;
    searchZipFilesInPackage = async function(keyword, packagePath) {
        // 调用原始函数
        await originalSearchZipFiles(keyword, packagePath);
        
        // 重新应用选中状态
        setTimeout(() => {
            const zipFileItems = document.querySelectorAll('.zip-file-item');
            zipFileItems.forEach(item => {
                const filePath = item.dataset.path;
                if (appState.zipSelectedFiles.some(f => f.path === filePath)) {
                    item.classList.add('selected');
                    const checkbox = item.querySelector('.zip-file-checkbox');
                    if (checkbox) checkbox.checked = true;
                }
            });
        }, 100);
    };
    
    // 修复确认选择按钮的状态更新
    const originalHandleZipArchive = handleZipArchive;
    handleZipArchive = async function() {
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
        await originalHandleZipArchive();
    };
}


