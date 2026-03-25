/**
 * API模块 - 处理所有API请求
 */

import { appState } from './app-state.js';

/**
 * 加载项目列表
 */
export async function loadProjectsList() {
    try {
        const response = await fetch('/api/projects/list');
        const result = await response.json();
        
        // 检查响应格式，兼容不同的API返回格式
        if (Array.isArray(result)) {
            // 直接返回数组的格式（如 Flask 直接返回 list）
            return result;
        } else if (result.projects) {
            // 直接返回projects数组的格式
            return result.projects;
        } else if (result.status === 'success' && result.data && result.data.projects) {
            // 包含status和data的格式
            return result.data.projects;
        } else {
            return [];
        }
    } catch (error) {
        console.error('加载项目列表失败:', error);
        return [];
    }
}

/**
 * 加载项目详情
 */
export async function loadProject(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            return result.project;
        } else {
            throw new Error(result.message || '加载项目失败');
        }
    } catch (error) {
        console.error('加载项目失败:', error);
        throw error;
    }
}

/**
 * 保存项目配置
 */
export async function saveProject(projectId, projectData) {
    try {
        const response = await fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(projectData)
        });
        
        const result = await response.json();
        
        if (!response.ok || result.status === 'error') {
            throw new Error(result.message || '保存项目配置失败');
        }
        
        return result;
    } catch (error) {
        console.error('保存项目失败:', error);
        throw error;
    }
}

/**
 * 删除项目（软删除）
 */
export async function deleteProject(projectId, permanent = false) {
    try {
        const url = permanent 
            ? `/api/projects/${projectId}/permanent-delete`
            : `/api/projects/${projectId}`;
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            return true;
        } else {
            throw new Error(result.message || '删除项目失败');
        }
    } catch (error) {
        console.error('删除项目失败:', error);
        throw error;
    }
}

/**
 * 获取已删除项目列表
 */
export async function getDeletedProjects() {
    try {
        const response = await fetch('/api/projects/deleted/list');
        const result = await response.json();
        
        if (Array.isArray(result)) {
            return result;
        }
        return [];
    } catch (error) {
        console.error('获取已删除项目失败:', error);
        return [];
    }
}

/**
 * 恢复已删除的项目
 */
export async function restoreProject(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/restore`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            return true;
        } else {
            throw new Error(result.message || '恢复项目失败');
        }
    } catch (error) {
        console.error('恢复项目失败:', error);
        throw error;
    }
}

/**
 * 加载周期文档
 */
export async function getCycleDocuments(cycle) {
    try {
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(cycle)}&project_id=${encodeURIComponent(appState.currentProjectId || '')}`);
        const result = await response.json();
        return result.data || [];
    } catch (e) {
        console.error('获取文档列表失败:', e);
        return [];
    }
}

/**
 * 计算周期进度
 */
export async function calculateCycleProgress(cycle) {
    try {
        const response = await fetch(`/api/documents/progress?cycle=${encodeURIComponent(cycle)}&project_id=${encodeURIComponent(appState.currentProjectId || '')}`);
        const result = await response.json();
        return result;
    } catch (e) {
        console.error('获取进度失败:', e);
        return { doc_count: 0, signer_count: 0, seal_count: 0, total_required: 0 };
    }
}

/**
 * 上传文档
 */
export async function uploadDocument(formData) {
    try {
        const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('上传文档失败:', error);
        throw error;
    }
}

/**
 * 编辑文档
 */
export async function editDocument(docId, docData) {
    try {
        const response = await fetch(`/api/documents/${docId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docData)
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('编辑文档失败:', error);
        throw error;
    }
}

/**
 * 删除文档
 */
export async function deleteDocument(docId) {
    try {
        const response = await fetch(`/api/documents/${docId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('删除文档失败:', error);
        throw error;
    }
}

/**
 * 加载ZIP包列表
 */
export async function loadZipPackages(projectId) {
    try {
        const url = projectId 
            ? `/api/documents/zip-packages?project_id=${encodeURIComponent(projectId)}`
            : '/api/documents/zip-packages';
        const response = await fetch(url);
        const result = await response.json();
        return result.packages || [];
    } catch (error) {
        console.error('加载ZIP包列表失败:', error);
        return [];
    }
}

/**
 * 搜索ZIP文件
 */
export async function searchZipFiles(keyword, packagePath, projectId) {
    try {
        let url = `/api/documents/search-zip-files?keyword=${encodeURIComponent(keyword)}&package_path=${encodeURIComponent(packagePath || '')}`;
        if (projectId) url += `&project_id=${encodeURIComponent(projectId)}`;
        const response = await fetch(url);
        const result = await response.json();
        return result.files || [];
    } catch (error) {
        console.error('搜索ZIP文件失败:', error);
        return [];
    }
}

/**
 * 删除ZIP包
 */
export async function deleteZipPackage(packagePath) {
    try {
        const response = await fetch('/api/documents/delete-zip-package', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ package_path: packagePath })
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('删除ZIP包失败:', error);
        throw error;
    }
}

/**
 * 加载ZIP上传记录
 */
export async function loadZipRecords(projectId) {
    try {
        const response = await fetch(`/api/documents/zip-records?project_id=${projectId}`, { method: 'GET' });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('加载ZIP记录失败:', error);
        throw error;
    }
}

/**
 * 添加ZIP上传记录
 */
export async function addZipRecord(record) {
    try {
        const response = await fetch('/api/documents/zip-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('添加ZIP记录失败:', error);
        throw error;
    }
}

/**
 * 删除ZIP上传记录
 */
export async function deleteZipRecord(zipId, projectId) {
    try {
        const response = await fetch(`/api/documents/zip-records/${zipId}?project_id=${projectId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('删除ZIP记录失败:', error);
        throw error;
    }
}

/**
 * 生成报告
 */
export async function generateReport(projectId) {
    try {
        const response = await fetch(`/api/reports/generate?project_id=${encodeURIComponent(projectId)}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('生成报告失败:', error);
        throw error;
    }
}

/**
 * 检查合规性
 */
export async function checkCompliance(projectId) {
    try {
        const response = await fetch(`/api/reports/check-compliance?project_id=${encodeURIComponent(projectId)}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('检查合规性失败:', error);
        throw error;
    }
}

/**
 * 打包项目
 */
export async function packageProject(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/package`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('打包项目失败:', error);
        throw error;
    }
}

/**
 * 导入包
 */
export async function importPackage(formData) {
    try {
        const response = await fetch('/api/projects/import-package', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('导入包失败:', error);
        throw error;
    }
}

/**
 * 加载项目配置（Excel）
 */
export async function loadProjectConfig(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/projects/load', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('加载项目配置失败:', error);
        throw error;
    }
}

/**
 * 将文档需求配置应用到项目
 */
export async function applyRequirementsToProject(projectId, requirementsId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/apply-requirements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirements_id: requirementsId })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('应用需求配置失败:', error);
        throw error;
    }
}

/**
 * 获取所有文档需求配置列表
 */
export async function listRequirementsConfigs() {
    try {
        const response = await fetch('/api/projects/requirements/list');
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('获取需求配置列表失败:', error);
        throw error;
    }
}

/**
 * 导入JSON
 */
export async function importJson(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/projects/import-json', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('导入JSON失败:', error);
        throw error;
    }
}

/**
 * 导出JSON
 */
export async function exportJson(projectId) {
    try {
        const response = await fetch(`/api/projects/export-requirements?project_id=${encodeURIComponent(projectId)}`);
        return response;
    } catch (error) {
        console.error('导出JSON失败:', error);
        throw error;
    }
}

/**
 * 确认验收
 */
export async function confirmAcceptance(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/confirm-acceptance`, {
            method: 'POST'
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('确认验收失败:', error);
        throw error;
    }
}

/**
 * 下载项目包
 */
export async function downloadPackage(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/download-package`);
        return response;
    } catch (error) {
        console.error('下载项目包失败:', error);
        throw error;
    }
}

/**
 * 加载历史导入文档
 */
export async function loadImportedDocuments() {
    try {
        const response = await fetch('/api/documents/list-imported');
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('加载历史导入文档失败:', error);
        throw error;
    }
}

/**
 * 搜索历史导入文档
 */
export async function searchImportedDocuments(keyword) {
    try {
        const response = await fetch(`/api/documents/search-imported?keyword=${encodeURIComponent(keyword)}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('搜索历史导入文档失败:', error);
        throw error;
    }
}