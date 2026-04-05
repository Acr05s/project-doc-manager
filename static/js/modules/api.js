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
        // 首先尝试使用旧版API路径（按项目ID加载）
        const oldResponse = await fetch(`/api/projects/${projectId}`);
        const oldResult = await oldResponse.json();
        
        if (oldResult.status === 'success') {
            // 确保返回的项目数据包含 custom_attribute_definitions 字段
            console.log('[loadProject] oldResult.project.custom_attribute_definitions:', oldResult.project.custom_attribute_definitions);
            if (!oldResult.project.custom_attribute_definitions) {
                oldResult.project.custom_attribute_definitions = [];
            }
            return oldResult.project;
        }
        
        // 如果旧版API失败，尝试使用新版API路径（按项目名称加载）
        const response = await fetch(`/api/projects/new/${projectId}/load`);
        const result = await response.json();
        
        // 如果返回了有效的项目数据，检查格式并转换
        if (result && result.cycles) {
            // 检查是否是文档清单格式
            if (result.cycles && Array.isArray(result.cycles)) {
                // 转换为标准项目配置格式
                const convertedResult = {
                    id: projectId,
                    name: result.project_info?.name || projectId,
                    cycles: result.cycles.map(cycle => cycle.name),
                    documents: {},
                    custom_attribute_definitions: result.custom_attribute_definitions || []
                };
                
                // 转换文档数据
                result.cycles.forEach(cycle => {
                    convertedResult.documents[cycle.name] = {
                        required_docs: cycle.documents.map(doc => ({
                            name: doc.name,
                            requirement: doc.requirement || '',
                            index: doc.index || 0
                        }))
                    };
                });
                
                return convertedResult;
            }
            return result;
        }
        
        // 两个API都失败，抛出错误
        throw new Error(oldResult.message || result?.message || '加载项目失败');
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
    console.log('[API] 加载ZIP记录, projectId:', projectId);
    try {
        if (!projectId) {
            console.warn('[API] projectId 为空');
            return { status: 'success', records: [] };
        }
        
        const url = `/api/documents/zip-records?project_id=${encodeURIComponent(projectId)}`;
        console.log('[API] 请求URL:', url);
        
        const response = await fetch(url, { method: 'GET' });
        console.log('[API] 响应状态:', response.status);
        
        // 检查响应状态
        if (!response.ok) {
            if (response.status === 404) {
                return { status: 'success', records: [] };
            }
            throw new Error(`服务器错误: ${response.status}`);
        }
        
        // 检查内容类型
        const contentType = response.headers.get('content-type');
        console.log('[API] content-type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('服务器返回了非 JSON 响应');
        }
        
        const result = await response.json();
        console.log('[API] 响应数据:', result);
        return result;
    } catch (error) {
        console.error('[API] 加载ZIP记录失败:', error);
        return { 
            status: 'error', 
            message: error.message || '加载失败',
            records: []
        };
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
 * 打包项目（异步任务方式）
 */
export async function packageProject(projectId, projectConfig) {
    try {
        const response = await fetch('/api/tasks/package', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                project_id: projectId, 
                project_config: projectConfig 
            })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('启动打包任务失败:', error);
        throw error;
    }
}

/**
 * 获取任务状态
 */
export async function getTaskStatus(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('获取任务状态失败:', error);
        throw error;
    }
}

/**
 * 获取打包下载链接
 */
export function getPackageDownloadUrl(projectId, taskId) {
    return `/api/projects/${projectId}/download/${taskId}`;
}

/**
 * 取消任务
 */
export async function cancelTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('取消任务失败:', error);
        throw error;
    }
}

export async function clearProjectPackaging(projectId) {
    try {
        const response = await fetch('/api/tasks/clear-packaging', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('清除打包状态失败:', error);
        throw error;
    }
}

/**
 * 完整打包项目（包含整个项目目录）
 */
export async function packageFullProject(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/package-full`, {
            method: 'POST'
        });
        
        if (response.ok && response.headers.get('content-type')?.includes('application/zip')) {
            // 直接返回ZIP文件数据
            const blob = await response.blob();
            return {
                status: 'success',
                blob: blob,
                filename: response.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'project_backup.zip'
            };
        }
        
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
 * 导入完整项目包
 */
export async function importFullPackage(formData) {
    try {
        const response = await fetch('/api/projects/package/import-full', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('导入完整项目包失败:', error);
        throw error;
    }
}

/**
 * 上传项目包分片（支持断点续传）
 */
export async function uploadProjectChunk(chunk, chunkIndex, totalChunks, filename, fileId) {
    try {
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkIndex', chunkIndex);
        formData.append('totalChunks', totalChunks);
        formData.append('filename', filename);
        formData.append('fileId', fileId);
        
        const response = await fetch('/api/projects/import/chunk', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('上传分片失败:', error);
        throw error;
    }
}

/**
 * 合并项目包分片并导入
 */
export async function mergeProjectChunks(filename, fileId, overwrite = false) {
    try {
        const response = await fetch('/api/projects/import/merge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename, fileId, overwrite })
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('合并分片失败:', error);
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
export async function confirmAcceptance(projectId, data = {}) {
    try {
        const response = await fetch(`/api/projects/${projectId}/confirm-acceptance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('确认验收失败:', error);
        throw error;
    }
}

/**
 * 验证项目文件完整性
 */
export async function verifyProjectFiles(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/verify-files`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('文件验证失败:', error);
        throw error;
    }
}

/**
 * 清理无效文件记录
 */
export async function cleanInvalidFiles(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}/clean-invalid-files`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('清理无效文件失败:', error);
        throw error;
    }
}

/**
 * 下载项目包
 */
export async function downloadPackage(projectId, options = {}) {
    try {
        const params = new URLSearchParams();
        if (options.renumber) params.append('renumber', 'true');
        if (options.convertPdf) params.append('convert_pdf', 'true');
        
        const url = `/api/projects/${projectId}/download-package?${params.toString()}`;
        const response = await fetch(url);
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
/**
 * 预览导入的ZIP包 - 上传并获取项目信息
 * @param {File} file - ZIP文件
 */
export async function previewImportPackage(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/projects/package/preview', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('预览导入包失败:', error);
        throw error;
    }
}

/**
 * 从预览的临时文件执行实际导入
 * @param {string} tempId - 临时文件ID
 * @param {string} conflictAction - 冲突处理方式: overwrite, rename, merge
 * @param {string} customName - 自定义项目名称
 */
export async function importFromPreview(tempId, conflictAction = 'rename', customName = '') {
    try {
        const response = await fetch('/api/projects/package/import-from-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                temp_id: tempId,
                conflict_action: conflictAction,
                custom_name: customName
            })
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('导入项目失败:', error);
        throw error;
    }
}
