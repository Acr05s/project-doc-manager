/**
 * 配置版本管理模块
 */

import { appState } from './app-state.js';
import { showNotification, showLoading, showConfirmModal, openModal, closeModal } from './ui.js';
import { renderCycles, renderInitialContent } from './cycle.js';

/**
 * 打开配置版本管理模态框
 */
export async function openConfigVersionModal() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    const modal = document.getElementById('configVersionModal');
    if (!modal) {
        console.error('找不到配置版本管理模态框');
        return;
    }
    
    openModal(modal);
    
    // 加载版本列表
    await loadVersionList();
}

/**
 * 关闭配置版本管理模态框
 */
export function closeConfigVersionModal() {
    const modal = document.getElementById('configVersionModal');
    if (modal) {
        closeModal(modal);
    }
}

/**
 * 加载版本列表
 */
async function loadVersionList() {
    const currentInfoContainer = document.getElementById('currentVersionInfo');
    const versionListContainer = document.getElementById('versionListContainer');
    
    if (!currentInfoContainer || !versionListContainer) return;
    
    currentInfoContainer.innerHTML = '<div class="loading">加载中...</div>';
    versionListContainer.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}/versions`);
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '加载失败');
        }
        
        // 显示当前配置信息
        const current = result.current_version;
        if (current) {
            currentInfoContainer.innerHTML = `
                <div class="current-version-card">
                    <div class="version-meta">
                        <span>周期数: <strong>${current.cycles ? current.cycles.length : 0}</strong></span>
                        <span>文档类型数: <strong>${current.document_count || 0}</strong></span>
                        <span>更新时间: ${formatDateTime(current.updated_time)}</span>
                    </div>
                </div>
            `;
        } else {
            currentInfoContainer.innerHTML = '<div class="empty-tip">暂无配置</div>';
        }
        
        // 显示版本列表
        const versions = result.versions || [];
        if (versions.length === 0) {
            versionListContainer.innerHTML = '<div class="empty-tip">暂无历史版本</div>';
            return;
        }
        
        versionListContainer.innerHTML = '';
        versions.forEach(version => {
            const item = document.createElement('div');
            item.className = 'version-item';
            item.innerHTML = `
                <div class="version-info">
                    <div class="version-name">${escapeHtml(version.version_name)}</div>
                    <div class="version-meta">
                        <span>周期: ${version.cycles ? version.cycles.length : 0}</span>
                        <span>文档: ${version.document_count || 0}</span>
                        <span>创建时间: ${formatDateTime(version.created_time)}</span>
                    </div>
                    ${version.description ? `<div class="version-desc">${escapeHtml(version.description)}</div>` : ''}
                </div>
                <div class="version-actions">
                    <button class="btn btn-sm btn-primary" onclick="handleSwitchVersion('${version.filename}')">切换</button>
                    <button class="btn btn-sm btn-info" onclick="handleExportVersion('${version.filename}')">导出</button>
                    <button class="btn btn-sm btn-danger" onclick="handleDeleteVersion('${version.filename}', '${escapeHtml(version.version_name)}')">删除</button>
                </div>
            `;
            versionListContainer.appendChild(item);
        });
        
    } catch (error) {
        console.error('加载版本列表失败:', error);
        showNotification('加载版本列表失败: ' + error.message, 'error');
        currentInfoContainer.innerHTML = '<div class="empty-tip">加载失败</div>';
        versionListContainer.innerHTML = '<div class="empty-tip">加载失败</div>';
    }
}

/**
 * 打开保存新版本模态框
 */
export function openSaveVersionModal() {
    const modal = document.getElementById('saveVersionModal');
    if (!modal) {
        console.error('找不到保存新版本模态框');
        return;
    }
    
    openModal(modal);
    
    // 重置表单
    document.getElementById('versionName').value = '';
    document.getElementById('versionDescription').value = '';
    
    // 聚焦到版本名称输入框
    document.getElementById('versionName').focus();
}

/**
 * 关闭保存新版本模态框
 */
export function closeSaveVersionModal() {
    const modal = document.getElementById('saveVersionModal');
    if (modal) {
        closeModal(modal);
    }
}

/**
 * 保存新版本
 */
export async function handleSaveVersion(e) {
    e.preventDefault();
    
    const versionName = document.getElementById('versionName').value.trim();
    const description = document.getElementById('versionDescription').value.trim();
    
    if (!versionName) {
        showNotification('请输入版本名称', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version_name: versionName,
                description: description
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('版本保存成功', 'success');
            closeSaveVersionModal();
            
            // 刷新版本列表
            await loadVersionList();
        } else {
            showNotification('保存失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('保存版本失败:', error);
        showNotification('保存失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 切换到指定版本
 */
export async function handleSwitchVersion(versionFilename) {
    showConfirmModal(
        '确认切换',
        '切换版本将覆盖当前配置，当前配置会自动备份。确定要切换吗？',
        async () => {
            showLoading(true);
            try {
                const response = await fetch(`/api/projects/${appState.currentProjectId}/versions/${versionFilename}/switch`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    showNotification('版本切换成功', 'success');
                    
                    // 更新前端状态
                    appState.projectConfig = result.config;
                    
                    // 重新渲染
                    renderCycles();
                    renderInitialContent();
                    
                    // 关闭模态框
                    closeConfigVersionModal();
                } else {
                    showNotification('切换失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('切换版本失败:', error);
                showNotification('切换失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 导出指定版本
 */
export async function handleExportVersion(versionFilename) {
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}/versions/${versionFilename}/export`);
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || '导出失败');
        }
        
        // 获取文件名
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'config_version.json';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?(.+)"?/);
            if (match) {
                filename = match[1];
            }
        }
        
        // 下载文件
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('导出成功', 'success');
        
    } catch (error) {
        console.error('导出版本失败:', error);
        showNotification('导出失败: ' + error.message, 'error');
    }
}

/**
 * 删除指定版本
 */
export async function handleDeleteVersion(versionFilename, versionName) {
    showConfirmModal(
        '确认删除',
        `确定要删除版本"${versionName}"吗？此操作不可恢复。`,
        async () => {
            showLoading(true);
            try {
                const response = await fetch(`/api/projects/${appState.currentProjectId}/versions/${versionFilename}`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    showNotification('版本已删除', 'success');
                    
                    // 刷新版本列表
                    await loadVersionList();
                } else {
                    showNotification('删除失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('删除版本失败:', error);
                showNotification('删除失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

// 辅助函数：格式化日期时间
function formatDateTime(dateStr) {
    if (!dateStr) return '未知';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN');
    } catch {
        return dateStr;
    }
}

// 辅助函数：转义HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 暴露到全局作用域供HTML onclick使用
window.handleSwitchVersion = handleSwitchVersion;
window.handleExportVersion = handleExportVersion;
window.handleDeleteVersion = handleDeleteVersion;
