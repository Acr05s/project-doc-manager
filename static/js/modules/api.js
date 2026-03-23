/**
 * API模块 - 处理所有API请求
 */

/**
 * 加载项目列表
 */
export async function loadProjectsList() {
    try {
        const response = await fetch('/api/projects/list');
        const result = await response.json();
        
        // 检查响应格式，兼容不同的API返回格式
        if (result.projects) {
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
        
        if (!response.ok) {
            throw new Error('保存项目配置失败');
        }
        
        return true;
    } catch (error) {
        console.error('保存项目失败:', error);
        throw error;
    }
}

/**
 * 删除项目
 */
export async function deleteProject(projectId) {
    try {
        const response = await fetch(`/api/projects/${projectId}`, {
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
 * 加载周期文档
 */
export async function getCycleDocuments(cycle) {
    try {
        const response = await fetch(`/api/documents/list?cycle=${encodeURIComponent(cycle)}`);
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
        const response = await fetch(`/api/documents/progress?cycle=${encodeURIComponent(cycle)}`);
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
export async function loadZipPackages() {
    try {
        const response = await fetch('/api/documents/zip-packages');
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
export async function searchZipFiles(keyword, packagePath) {
    try {
        const response = await fetch(`/api/documents/search-zip-files?keyword=${encodeURIComponent(keyword)}&package_path=${encodeURIComponent(packagePath)}`);
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
        
        const response = await fetch('/api/project/load', {
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
        const response = await fetch(`/api/project/export-requirements?project_id=${encodeURIComponent(projectId)}`);
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
        const response = await fetch(`/api/projects/${projectId}/acceptance`, {
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
        const response = await fetch(`/api/projects/${projectId}/download`);
        return response;
    } catch (error) {
        console.error('下载项目包失败:', error);
        throw error;
    }
}