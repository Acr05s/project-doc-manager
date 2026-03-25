/**
 * 项目模块 - 处理项目相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, openModal, closeModal } from './ui.js';
import { loadProjectsList, loadProject, saveProject, deleteProject, loadProjectConfig, importJson, exportJson, packageProject, importPackage, confirmAcceptance, downloadPackage, getDeletedProjects, restoreProject, applyRequirementsToProject, listRequirementsConfigs, loadZipRecords as apiLoadZipRecords, addZipRecord, deleteZipRecord as apiDeleteZipRecord } from './api.js';
import { renderCycles, renderInitialContent } from './cycle.js';
import { renderCycleDocuments } from './document.js';

/**
 * 渲染项目列表（下拉菜单）
 */
export function renderProjectsList(projects) {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;
    
    // 保存当前选中的值
    const currentValue = projectSelect.value;
    
    // 清空并添加默认选项
    projectSelect.innerHTML = '<option value="">-- 选择项目 --</option>';
    
    if (!projects || projects.length === 0) {
        return;
    }
    
    // 添加项目选项
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        option.title = project.description || project.name;
        projectSelect.appendChild(option);
    });
    
    // 恢复选中状态
    if (currentValue) {
        projectSelect.value = currentValue;
    } else if (appState.currentProjectId) {
        projectSelect.value = appState.currentProjectId;
    }
}

/**
 * 选择项目
 */
export async function selectProject(projectId) {
    try {
        const project = await loadProject(projectId);
        
        appState.currentProjectId = projectId;
        appState.projectConfig = project;
        
        // 更新URL参数
        const url = new URL(window.location);
        url.searchParams.set('project', projectId);
        window.history.replaceState({}, '', url);
        
        // 渲染周期
        renderCycles();
        
        // 更新顶部项目名显示
        const nameEl = document.getElementById('currentProjectName');
        if (nameEl) {
            nameEl.textContent = project.name || '未命名项目';
            nameEl.style.display = '';
            nameEl.title = project.name || '';
        }
        
        showProjectButtons();
        
        // 更新删除需求按钮状态
        updateClearRequirementsBtnState();
        
        showNotification('已加载项目: ' + project.name, 'success');
    } catch (error) {
        console.error('选择项目失败:', error);
        showNotification('加载项目失败: ' + error.message, 'error');
        
        // 清除URL中的无效项目ID
        const url = new URL(window.location);
        url.searchParams.delete('project');
        window.history.replaceState({}, '', url);
        
        // 显示项目选择模态框
        openProjectSelectModal();
    }
}

/**
 * 处理创建项目
 */
export async function handleCreateProject(e) {
    e.preventDefault();
    
    const projectName = document.getElementById('newProjectName').value;
    const partyA = document.getElementById('newProjectPartyA').value;
    const partyB = document.getElementById('newProjectPartyB').value;
    const supervisor = document.getElementById('newProjectSupervisor').value;
    const manager = document.getElementById('newProjectManager').value;
    const duration = document.getElementById('newProjectDuration').value;
    const projectDescription = document.getElementById('newProjectDesc').value;
    
    if (!projectName) {
        showNotification('请输入项目名称', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/projects/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: projectName, 
                description: projectDescription,
                party_a: partyA,
                party_b: partyB,
                supervisor: supervisor,
                manager: manager,
                duration: duration
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('项目创建成功', 'success');
            closeModal(elements.newProjectModal);
            document.getElementById('newProjectForm').reset();
            
            // 刷新项目列表
            const projects = await loadProjectsList();
            renderProjectsList(projects);
            
            // 自动选择新创建的项目
            selectProject(result.project_id);
        } else {
            showNotification('创建失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('创建项目失败:', error);
        showNotification('创建项目失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理加载项目配置（Excel）
 */
export async function handleLoadProject(e) {
    e.preventDefault();

    const file = elements.projectFile.files[0];
    if (!file) {
        showNotification('请选择文件', 'error');
        return;
    }

    const progress = showOperationProgress('load-' + Date.now(), '正在导入文档需求...');
    progress.update(20, '正在上传文件...');

    showLoading(true);
    try {
        const result = await loadProjectConfig(file);

        progress.update(50, '正在解析文件...');

        if (result.status === 'success') {
            progress.update(70, '正在保存配置...');

            console.log('=== 导入流程调试 ===');
            console.log('1. 后端返回的 result:', JSON.stringify(result, null, 2));
            console.log('2. result.data 类型:', typeof result.data);
            console.log('3. result.data:', result.data);
            console.log('4. result.data?.cycles:', result.data?.cycles);
            console.log('5. result.data?.cycles?.length:', result.data?.cycles?.length);
            console.log('6. Array.isArray(result.data?.cycles):', Array.isArray(result.data?.cycles));

            // 检查解析结果是否有效
            if (!result.data) {
                console.error('导入失败: result.data 为空');
                progress.error('导入失败: 服务器返回数据为空');
                showNotification('导入失败: 服务器返回数据异常', 'error');
                return;
            }
            
            if (!result.data.cycles) {
                console.error('导入失败: result.data.cycles 为空');
                console.log('result.data 的所有键:', Object.keys(result.data));
                progress.error('导入失败: Excel文件中没有找到周期数据');
                showNotification('导入失败: Excel文件格式不正确，未找到周期数据', 'error');
                return;
            }
            
            if (!Array.isArray(result.data.cycles)) {
                console.error('导入失败: result.data.cycles 不是数组');
                console.log('cycles 类型:', typeof result.data.cycles);
                progress.error('导入失败: 周期数据格式异常');
                showNotification('导入失败: 周期数据格式异常', 'error');
                return;
            }
            
            if (result.data.cycles.length === 0) {
                console.error('导入失败: result.data.cycles 为空数组');
                progress.error('导入失败: Excel文件中没有找到有效的周期数据');
                showNotification('导入失败: Excel文件中没有找到有效的周期数据', 'error');
                return;
            }

            // 保存配置ID供后续使用
            const requirementsId = result.requirements_id;
            const requirementsName = result.requirements_name;

            console.log('5. requirements_id:', requirementsId);
            console.log('6. requirements_name:', requirementsName);

            progress.complete('文档需求已保存');
            closeModal(elements.loadProjectModal);
            elements.loadProjectForm.reset();

            // 显示应用到项目的对话框
            showApplyRequirementsDialog(requirementsId, requirementsName, result.data);

            console.log('=== 导入流程完成 ===');
        } else {
            progress.error('导入失败: ' + result.message);
            showNotification('加载失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('加载项目错误:', error);
        progress.error('导入失败: ' + error.message);
        showNotification('加载项目出错: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 显示应用需求配置到项目的对话框
 * 如果有当前项目，默认自动应用到当前项目
 */
function showApplyRequirementsDialog(requirementsId, requirementsName, configData) {
    const cycleCount = configData.cycles?.length || 0;
    const docCount = Object.values(configData.documents || {}).reduce(
        (sum, docs) => sum + (docs.required_docs?.length || 0), 0
    );

    // 如果有当前项目，直接应用，不显示对话框
    if (appState.currentProjectId) {
        console.log('自动应用到当前项目:', appState.currentProjectId);
        applyRequirementsToProjectWithNotification(appState.currentProjectId, requirementsId);
        return;
    }

    // 没有当前项目，显示选择对话框
    const content = `
        <div style="padding: 20px;">
            <h3 style="margin-bottom: 15px;">📋 文档需求配置已导入</h3>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p><strong>配置名称：</strong>${requirementsName || '未命名配置'}</p>
                <p><strong>周期数量：</strong>${cycleCount} 个</p>
                <p><strong>文档数量：</strong>${docCount} 个</p>
            </div>
            <p style="margin-bottom: 15px;">请选择要应用到的项目：</p>
            <select id="applyProjectSelect" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                <option value="">-- 选择项目 --</option>
            </select>
        </div>
    `;

    // 显示对话框 - 使用 allowHtml 选项
    showConfirmModal(
        '应用文档需求配置',
        content,
        async () => {
            const select = document.getElementById('applyProjectSelect');
            const projectId = select?.value;

            if (!projectId) {
                showNotification('请先选择项目', 'error');
                return false; // 不关闭对话框
            }

            return await applyRequirementsToProjectWithNotification(projectId, requirementsId);
        },
        () => {
            // 取消回调 - 用户可以选择不应用，配置已保存，可以以后应用
            showNotification('配置已保存，可稍后从"文档需求"菜单应用', 'info');
        },
        { allowHtml: true, okText: '应用', cancelText: '暂不应用' }
    );

    // 加载项目列表到选择框
    loadProjectsList().then(projects => {
        const select = document.getElementById('applyProjectSelect');
        if (select && projects) {
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });
        }
    });
}

/**
 * 应用需求配置到项目并显示通知
 * @param {string} projectId - 项目ID
 * @param {string} requirementsId - 需求配置ID
 * @returns {boolean} 是否成功
 */
async function applyRequirementsToProjectWithNotification(projectId, requirementsId) {
    console.log('[DEBUG] applyRequirementsToProjectWithNotification 被调用:', { projectId, requirementsId });
    showLoading(true);
    try {
        const result = await applyRequirementsToProject(projectId, requirementsId);
        console.log('[DEBUG] applyRequirementsToProject 返回:', result);

        if (result.status === 'success') {
            showNotification('文档需求配置已应用到项目', 'success');

            // 如果当前正在查看这个项目，刷新显示
            if (appState.currentProjectId === projectId) {
                console.log('[DEBUG] 刷新项目显示:', projectId);
                const updatedProject = await loadProject(projectId);
                console.log('[DEBUG] loadProject 返回:', updatedProject);
                appState.projectConfig = updatedProject;
                updateClearRequirementsBtnState();
                renderCycles();
                renderInitialContent();
            }

            return true; // 关闭对话框
        } else {
            console.error('[DEBUG] 应用失败:', result.message);
            showNotification('应用失败: ' + result.message, 'error');
            return false;
        }
    } catch (error) {
        console.error('[DEBUG] 应用配置失败:', error);
        showNotification('应用失败: ' + error.message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

/**
 * 处理导入JSON
 */
export async function handleImportJson(e) {
    e.preventDefault();
    
    const file = document.getElementById('importJsonFile').files[0];
    if (!file) {
        showNotification('请选择文件', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const result = await importJson(file);
        
        if (result.status === 'success') {
            showNotification('JSON导入成功', 'success');
            closeModal(elements.importJsonModal);
            document.getElementById('importJsonForm').reset();
            
            // 刷新项目列表
            const projects = await loadProjectsList();
            renderProjectsList(projects);
        } else {
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入JSON失败:', error);
        showNotification('导入失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理导出JSON - 直接用前端数据，一瞬间完成
 */
export function handleExportJson() {
    if (!appState.projectConfig) {
        showNotification('没有可导出的项目数据', 'error');
        return;
    }
    
    // 直接把前端的项目配置转成 JSON 下载，一瞬间完成
    const jsonContent = JSON.stringify(appState.projectConfig, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const projectName = appState.projectConfig.name || appState.currentProjectId;
    a.download = `需求清单_${projectName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('导出成功', 'success');
}

/**
 * 处理保存项目
 */
export async function handleSaveProject() {
    if (!appState.currentProjectId || !appState.projectConfig) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showLoading(true);
    try {
        await saveProject(appState.currentProjectId, appState.projectConfig);
        showNotification('项目保存成功', 'success');
    } catch (error) {
        console.error('保存项目失败:', error);
        showNotification('保存失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理删除当前需求
 */
export async function handleClearRequirements() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 检查是否有需求配置
    if (!appState.projectConfig.cycles || appState.projectConfig.cycles.length === 0) {
        showNotification('当前项目没有文档需求配置', 'error');
        return;
    }
    
    // 确认删除
    showConfirmModal(
        '确认删除',
        '确定要删除当前项目的文档需求配置吗？此操作将清空所有周期和文档要求，但不会删除已上传的文档文件。',
        async () => {
            showLoading(true);
            try {
                // 清空需求配置，但保留项目基本信息
                const clearedConfig = {
                    id: appState.currentProjectId,
                    name: appState.projectConfig.name,
                    cycles: [],
                    documents: {},
                    updated_time: new Date().toISOString()
                };
                
                // 保存清空后的配置
                await saveProject(appState.currentProjectId, clearedConfig);
                
                // 更新前端状态
                appState.projectConfig = clearedConfig;
                appState.currentCycle = null; // 清空当前周期
                
                // 重新渲染
                renderCycles();
                renderInitialContent();
                
                // 清空文档列表显示（ID是 contentArea，不是 documentList）
                const contentArea = document.getElementById('contentArea');
                if (contentArea) {
                    contentArea.innerHTML = '<div class="welcome-message"><h2>暂无文档需求</h2><p>请先导入文档需求配置</p></div>';
                }
                
                // 更新删除按钮状态
                updateClearRequirementsBtnState();
                
                showNotification('文档需求已清空', 'success');
            } catch (error) {
                console.error('清空需求失败:', error);
                showNotification('操作失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 更新文档需求菜单按钮状态（删除、导出）
 */
export function updateClearRequirementsBtnState() {
    const clearBtn = document.getElementById('clearRequirementsBtn');
    const exportBtn = document.getElementById('exportJsonBtn');
    
    const hasCycles = appState.projectConfig && 
                      appState.projectConfig.cycles && 
                      appState.projectConfig.cycles.length > 0;
    
    // 更新删除按钮状态
    if (clearBtn) {
        if (hasCycles) {
            clearBtn.classList.remove('disabled');
            clearBtn.style.pointerEvents = 'auto';
            clearBtn.style.opacity = '1';
        } else {
            clearBtn.classList.add('disabled');
            clearBtn.style.pointerEvents = 'none';
            clearBtn.style.opacity = '0.5';
        }
    }
    
    // 更新导出按钮状态
    if (exportBtn) {
        if (hasCycles) {
            exportBtn.classList.remove('disabled');
            exportBtn.style.pointerEvents = 'auto';
            exportBtn.style.opacity = '1';
        } else {
            exportBtn.classList.add('disabled');
            exportBtn.style.pointerEvents = 'none';
            exportBtn.style.opacity = '0.5';
        }
    }
}

/**
 * 处理打包项目
 */
export async function handlePackageProject() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const result = await packageProject(appState.currentProjectId);
        
        if (result.status === 'success') {
            showNotification('项目打包成功', 'success');
            // 可以在这里添加下载逻辑
        } else {
            showNotification('打包失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('打包项目失败:', error);
        showNotification('打包失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理导入包
 */
export async function handleImportPackage(e) {
    e.preventDefault();
    
    const file = document.getElementById('importPackageFile').files[0];
    const conflictAction = document.querySelector('input[name="conflictAction"]:checked').value;
    const customName = document.getElementById('importPackageName').value;
    
    if (!file) {
        showNotification('请选择文件', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conflict_action', conflictAction);
    if (conflictAction === 'manual' && customName) {
        formData.append('custom_name', customName);
    }
    
    showLoading(true);
    try {
        const result = await importPackage(formData);
        
        if (result.status === 'success') {
            showNotification('包导入成功', 'success');
            closeModal(elements.importPackageModal);
            document.getElementById('importPackageForm').reset();
            
            // 刷新项目列表
            const projects = await loadProjectsList();
            renderProjectsList(projects);
        } else {
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入包失败:', error);
        showNotification('导入失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理确认验收
 */
export async function handleConfirmAcceptance() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showConfirmModal(
        '确认验收',
        '确定要确认项目验收吗？',
        async () => {
            showLoading(true);
            try {
                const result = await confirmAcceptance(appState.currentProjectId);
                
                if (result.status === 'success') {
                    showNotification('验收确认成功', 'success');
                } else {
                    showNotification('验收失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('确认验收失败:', error);
                showNotification('验收失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 处理下载项目包
 */
export async function handleDownloadPackage() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await downloadPackage(appState.currentProjectId);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project-${appState.currentProjectId}-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('项目包下载成功', 'success');
        } else {
            showNotification('下载失败', 'error');
        }
    } catch (error) {
        console.error('下载项目包失败:', error);
        showNotification('下载失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理重新匹配文件管理
 */
export async function handleDeleteProject() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 打开重新匹配文件管理模态框
    const modal = document.getElementById('rematchFileModal');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        await loadZipRecords();
    }
}

/**
 * 加载ZIP上传记录（实际是已解压的ZIP包目录）
 */
export async function loadZipRecords() {
    const container = document.getElementById('zipRecordsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        // 调用API获取已解压的ZIP包列表
        const result = await apiLoadZipRecords(appState.currentProjectId);
        
        if (result.status !== 'success') {
            throw new Error(result.message || '加载失败');
        }
        
        const zipRecords = result.records;
        
        if (!zipRecords || zipRecords.length === 0) {
            container.innerHTML = '<div class="empty-tip">暂无ZIP上传记录</div>';
            return;
        }
        
        container.innerHTML = '';
        
        zipRecords.forEach((record) => {
            // 格式化上传时间
            const uploadTime = new Date(record.upload_time).toLocaleString('zh-CN');
            
            // 对路径中的反斜杠进行转义，避免JavaScript语法错误
            const escapedPath = record.path.replace(/\\/g, '\\\\');
            const escapedName = record.name.replace(/'/g, "\\'");
            
            const item = document.createElement('div');
            item.className = 'zip-record-item';
            item.innerHTML = `
                <div class="zip-record-info">
                    <div class="zip-record-name">${record.name}</div>
                    <div class="zip-record-meta">
                        <span>上传时间: ${uploadTime}</span>
                        <span>文件数量: ${record.file_count}</span>
                        <span>状态: ${record.status}</span>
                    </div>
                </div>
                <div class="zip-record-actions">
                    <button class="btn btn-primary" onclick="handleRematchFromZip('${record.id}', '${escapedName}', '${escapedPath}')">重新匹配</button>
                    <button class="btn btn-danger" onclick="handleDeleteZipRecord('${record.id}', '${escapedName}')">删除记录</button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('加载ZIP记录失败:', error);
        container.innerHTML = '<div class="empty-tip">加载失败</div>';
    }
}

/**
 * 处理从ZIP重新匹配
 */
export async function handleRematchFromZip(zipId, filename, path) {
    showConfirmModal(
        '确认重新匹配',
        `确定要使用 "${filename}" 进行重新匹配吗？`,
        async () => {
            showLoading(true);
            try {
                // 调用API进行重新匹配
                const response = await fetch('/api/documents/zip-match-start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        zip_path: path,
                        project_id: appState.currentProjectId
                    })
                });
                
                const result = await response.json();
                
                if (result.status !== 'success') {
                    throw new Error(result.message || '重新匹配失败');
                }
                
                const taskId = result.task_id;
                showNotification('重新匹配开始', 'success');
                
                // 关闭模态框
                const modal = document.getElementById('rematchFileModal');
                if (modal) {
                    modal.classList.remove('show');
                    document.body.style.overflow = 'auto';
                }
                
                // 轮询任务进度
                await pollMatchTask(taskId);
            } catch (error) {
                console.error('重新匹配失败:', error);
                showNotification('重新匹配失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 轮询匹配任务进度
 */
async function pollMatchTask(taskId) {
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
                
                if (taskStatus === 'completed') {
                    clearInterval(pollInterval);
                    
                    // 显示结果
                    const matchResult = result.result;
                    if (matchResult) {
                        showNotification(
                            `匹配完成！共 ${matchResult.total_files} 个文件，匹配成功 ${matchResult.matched_count} 个`,
                            matchResult.matched_count > 0 ? 'success' : 'warning'
                        );
                        
                        // 重新加载项目配置
                        if (appState.currentProjectId) {
                            import('./api.js').then(module => {
                                module.loadProject(appState.currentProjectId).then(updatedProject => {
                                    if (updatedProject) {
                                        appState.projectConfig = updatedProject;
                                    }
                                    
                                    // 刷新文档列表
                                    if (appState.currentCycle) {
                                        import('./document.js').then(docModule => {
                                            docModule.renderCycleDocuments(appState.currentCycle);
                                        });
                                    }
                                });
                            });
                        } else if (appState.currentCycle) {
                            // 刷新文档列表
                            import('./document.js').then(module => {
                                module.renderCycleDocuments(appState.currentCycle);
                            });
                        }
                    }
                    
                    resolve();
                } else if (taskStatus === 'failed') {
                    clearInterval(pollInterval);
                    showNotification('匹配任务失败: ' + result.message, 'error');
                    reject(new Error(result.message || '匹配任务失败'));
                }
                
            } catch (error) {
                console.error('查询任务状态失败:', error);
            }
        }, 1000);
    });
}

/**
 * 处理删除ZIP记录
 */
export async function handleDeleteZipRecord(zipId, filename) {
    showConfirmModal(
        '确认删除',
        `确定要删除 "${filename}" 记录吗？此操作将同时删除对应文件。如果删除的文件有被文档匹配占用，将同时删除匹配结果。`,
        async () => {
            showLoading(true);
            try {
                // 调用API删除ZIP包
                const result = await apiDeleteZipRecord(zipId, appState.currentProjectId);
                
                if (result.status !== 'success') {
                    throw new Error(result.message || '删除失败');
                }
                
                showNotification('记录删除成功', 'success');
                
                // 重新加载记录
                await loadZipRecords();
            } catch (error) {
                console.error('删除记录失败:', error);
                showNotification('删除记录失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 处理添加周期
 */
export async function handleAddCycle(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('addCycleName').value;
    
    if (!cycleName) {
        showNotification('请输入周期名称', 'error');
        return;
    }
    
    if (!appState.projectConfig) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 添加新周期
    if (!appState.projectConfig.cycles) {
        appState.projectConfig.cycles = [];
    }
    
    if (appState.projectConfig.cycles.includes(cycleName)) {
        showNotification('周期名称已存在', 'error');
        return;
    }
    
    appState.projectConfig.cycles.push(cycleName);
    
    // 保存项目配置
    showLoading(true);
    try {
        await saveProject(appState.currentProjectId, appState.projectConfig);
        showNotification('周期添加成功', 'success');
        closeModal(elements.projectManageModal);
        document.getElementById('addCycleForm').reset();
        
        // 刷新周期列表
        renderCycles();
    } catch (error) {
        console.error('添加周期失败:', error);
        showNotification('添加周期失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理重命名周期
 */
export async function handleRenameCycle(e) {
    e.preventDefault();
    
    const oldName = document.getElementById('renameCycleOld').value;
    const newName = document.getElementById('renameCycleNew').value;
    
    if (!oldName || !newName) {
        showNotification('请输入周期名称', 'error');
        return;
    }
    
    if (!appState.projectConfig || !appState.projectConfig.cycles) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    const index = appState.projectConfig.cycles.indexOf(oldName);
    if (index === -1) {
        showNotification('周期不存在', 'error');
        return;
    }
    
    if (appState.projectConfig.cycles.includes(newName)) {
        showNotification('新周期名称已存在', 'error');
        return;
    }
    
    // 重命名周期
    appState.projectConfig.cycles[index] = newName;
    
    // 更新文档配置中的周期名称
    if (appState.projectConfig.documents) {
        if (appState.projectConfig.documents[oldName]) {
            appState.projectConfig.documents[newName] = appState.projectConfig.documents[oldName];
            delete appState.projectConfig.documents[oldName];
        }
    }
    
    // 更新归档文档中的周期名称
    if (appState.projectConfig.documents_archived) {
        if (appState.projectConfig.documents_archived[oldName]) {
            appState.projectConfig.documents_archived[newName] = appState.projectConfig.documents_archived[oldName];
            delete appState.projectConfig.documents_archived[oldName];
        }
    }
    
    // 保存项目配置
    showLoading(true);
    try {
        await saveProject(appState.currentProjectId, appState.projectConfig);
        showNotification('周期重命名成功', 'success');
        closeModal(elements.projectManageModal);
        document.getElementById('renameCycleForm').reset();
        
        // 刷新周期列表
        renderCycles();
    } catch (error) {
        console.error('重命名周期失败:', error);
        showNotification('重命名周期失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理删除周期
 */
export async function handleDeleteCycle(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('deleteCycleName').value;
    
    if (!cycleName) {
        showNotification('请选择周期', 'error');
        return;
    }
    
    if (!appState.projectConfig || !appState.projectConfig.cycles) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showConfirmModal(
        '确认删除',
        '确定要删除这个周期吗？此操作不可恢复。',
        async () => {
            // 删除周期
            appState.projectConfig.cycles = appState.projectConfig.cycles.filter(c => c !== cycleName);
            
            // 删除文档配置中的周期
            if (appState.projectConfig.documents) {
                delete appState.projectConfig.documents[cycleName];
            }
            
            // 删除归档文档中的周期
            if (appState.projectConfig.documents_archived) {
                delete appState.projectConfig.documents_archived[cycleName];
            }
            
            // 保存项目配置
            showLoading(true);
            try {
                await saveProject(appState.currentProjectId, appState.projectConfig);
                showNotification('周期删除成功', 'success');
                closeModal(elements.projectManageModal);
                document.getElementById('deleteCycleForm').reset();
                
                // 刷新周期列表
                renderCycles();
            } catch (error) {
                console.error('删除周期失败:', error);
                showNotification('删除周期失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 处理添加文档
 */
export async function handleAddDoc(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('addDocCycle').value;
    const docName = document.getElementById('addDocName').value;
    const organization = document.getElementById('addDocOrganization').value;
    const requirement = document.getElementById('addDocRequirement').value;
    
    if (!cycleName || !docName) {
        showNotification('请输入文档信息', 'error');
        return;
    }
    
    if (!appState.projectConfig) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 确保文档配置存在
    if (!appState.projectConfig.documents) {
        appState.projectConfig.documents = {};
    }
    if (!appState.projectConfig.documents[cycleName]) {
        appState.projectConfig.documents[cycleName] = {
            required_docs: []
        };
    }
    
    // 检查文档是否已存在
    const existingDocs = appState.projectConfig.documents[cycleName].required_docs || [];
    if (existingDocs.some(doc => doc.name === docName)) {
        showNotification('文档名称已存在', 'error');
        return;
    }
    
    // 添加新文档
    const newDoc = {
        name: docName,
        organization: organization,
        requirement: requirement,
        index: existingDocs.length + 1
    };
    
    existingDocs.push(newDoc);
    
    // 保存项目配置
    showLoading(true);
    try {
        await saveProject(appState.currentProjectId, appState.projectConfig);
        showNotification('文档添加成功', 'success');
        closeModal(elements.projectManageModal);
        document.getElementById('addDocForm').reset();
        
        // 刷新文档列表
        if (appState.currentCycle === cycleName) {
            await renderCycleDocuments(cycleName);
        }
    } catch (error) {
        console.error('添加文档失败:', error);
        showNotification('添加文档失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理删除文档
 */
export async function handleDeleteDoc(e) {
    e.preventDefault();
    
    const cycleName = document.getElementById('deleteDocCycleSelect').value;
    const docName = document.getElementById('deleteDocSelect').value;
    
    if (!cycleName || !docName) {
        showNotification('请选择文档', 'error');
        return;
    }
    
    if (!appState.projectConfig || !appState.projectConfig.documents || !appState.projectConfig.documents[cycleName]) {
        showNotification('文档不存在', 'error');
        return;
    }
    
    showConfirmModal(
        '确认删除',
        '确定要删除这个文档吗？此操作不可恢复。',
        async () => {
            // 删除文档
            const docs = appState.projectConfig.documents[cycleName].required_docs;
            appState.projectConfig.documents[cycleName].required_docs = docs.filter(doc => doc.name !== docName);
            
            // 重新编号
            appState.projectConfig.documents[cycleName].required_docs.forEach((doc, index) => {
                doc.index = index + 1;
            });
            
            // 保存项目配置
            showLoading(true);
            try {
                await saveProject(appState.currentProjectId, appState.projectConfig);
                showNotification('文档删除成功', 'success');
                closeModal(elements.projectManageModal);
                document.getElementById('deleteDocForm').reset();
                
                // 刷新文档列表
                if (appState.currentCycle === cycleName) {
                    await renderCycleDocuments(cycleName);
                }
            } catch (error) {
                console.error('删除文档失败:', error);
                showNotification('删除文档失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 填充项目管理选择框
 */
export function populateProjectManageSelects() {
    if (!appState.projectConfig || !appState.projectConfig.cycles) return;
    
    const cycles = appState.projectConfig.cycles;
    
    // 填充添加文档的周期选择
    const addDocCycleSelect = document.getElementById('addDocCycle');
    if (addDocCycleSelect) {
        addDocCycleSelect.innerHTML = '';
        cycles.forEach(cycle => {
            const option = document.createElement('option');
            option.value = cycle;
            option.textContent = cycle;
            addDocCycleSelect.appendChild(option);
        });
    }
    
    // 填充重命名周期的选择
    const renameCycleOldSelect = document.getElementById('renameCycleOld');
    if (renameCycleOldSelect) {
        renameCycleOldSelect.innerHTML = '';
        cycles.forEach(cycle => {
            const option = document.createElement('option');
            option.value = cycle;
            option.textContent = cycle;
            renameCycleOldSelect.appendChild(option);
        });
    }
    
    // 填充删除周期的选择
    const deleteCycleNameSelect = document.getElementById('deleteCycleName');
    if (deleteCycleNameSelect) {
        deleteCycleNameSelect.innerHTML = '';
        cycles.forEach(cycle => {
            const option = document.createElement('option');
            option.value = cycle;
            option.textContent = cycle;
            deleteCycleNameSelect.appendChild(option);
        });
    }
    
    // 填充删除文档的周期选择
    const deleteDocCycleSelect = document.getElementById('deleteDocCycleSelect');
    if (deleteDocCycleSelect) {
        deleteDocCycleSelect.innerHTML = '';
        cycles.forEach(cycle => {
            const option = document.createElement('option');
            option.value = cycle;
            option.textContent = cycle;
            deleteDocCycleSelect.appendChild(option);
        });
        
        // 默认选择第一个周期
        if (cycles.length > 0) {
            deleteDocCycleSelect.value = cycles[0];
            populateDocSelect(cycles[0], 'deleteDocSelect');
        }
    }
}

/**
 * 填充文档选择框
 */
export function populateDocSelect(cycleName, selectId) {
    if (!appState.projectConfig || !appState.projectConfig.documents || !appState.projectConfig.documents[cycleName]) {
        document.getElementById(selectId).innerHTML = '';
        return;
    }
    
    const docs = appState.projectConfig.documents[cycleName].required_docs || [];
    const select = document.getElementById(selectId);
    
    select.innerHTML = '';
    docs.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.name;
        option.textContent = doc.name;
        select.appendChild(option);
    });
}

/**
 * 重置导入包模态框
 */
export function resetImportPackageModal() {
    const form = document.getElementById('importPackageForm');
    if (form) form.reset();
    
    const nameInput = document.getElementById('importPackageName');
    if (nameInput) {
        nameInput.disabled = true;
        nameInput.value = '';
    }
}

/**
 * 显示项目按钮
 */
export function showProjectButtons() {
    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu', 
        'dataBackupMenu', 'acceptanceMenu'
    ];
    
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'inline-block';
    });
}

/**
 * 隐藏项目按钮
 */
export function hideProjectButtons() {
    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu', 
        'dataBackupMenu', 'acceptanceMenu'
    ];
    
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'none';
    });
}

/**
 * 打开项目选择模态框
 */
export async function openProjectSelectModal() {
    const modal = document.getElementById('projectSelectModal');
    if (!modal) return;
    
    modal.style.display = 'block';
    
    // 加载项目列表
    await loadProjectSelectList();
    
    // 加载已删除项目列表
    await loadDeletedProjectsList();
}

/**
 * 关闭项目选择模态框
 */
export function closeProjectSelectModal() {
    const modal = document.getElementById('projectSelectModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 加载项目选择列表
 */
async function loadProjectSelectList() {
    const container = document.getElementById('projectListContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        const projects = await loadProjectsList();
        
        if (!projects || projects.length === 0) {
            container.innerHTML = '<div class="empty-tip">暂无项目，请创建新项目</div>';
            return;
        }
        
        container.innerHTML = '';
        
        projects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.innerHTML = `
                <div class="project-info">
                    <div class="project-name">${escapeHtml(project.name)}</div>
                    <div class="project-meta">创建时间: ${formatDateTime(project.created_time)}</div>
                </div>
                <div class="project-actions-btns">
                    <button class="btn btn-primary btn-sm" onclick="handleOpenProject('${project.id}')">打开</button>
                    <button class="btn btn-danger btn-sm" onclick="handleSoftDeleteProject('${project.id}', '${escapeHtml(project.name)}')">删除</button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('加载项目列表失败:', error);
        container.innerHTML = '<div class="empty-tip">加载失败</div>';
    }
}

/**
 * 加载已删除项目列表
 */
async function loadDeletedProjectsList() {
    const container = document.getElementById('deletedProjectsContainer');
    const countBadge = document.getElementById('deletedCount');
    if (!container) return;
    
    try {
        const deletedProjects = await getDeletedProjects();
        
        // 更新数量徽章
        if (countBadge) {
            countBadge.textContent = deletedProjects.length;
        }
        
        if (!deletedProjects || deletedProjects.length === 0) {
            container.innerHTML = '<div class="empty-tip">暂无已删除项目</div>';
            return;
        }
        
        container.innerHTML = '';
        
        deletedProjects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item deleted-project-item';
            item.innerHTML = `
                <div class="project-info">
                    <div class="project-name">${escapeHtml(project.name)}</div>
                    <div class="project-meta">删除时间: ${formatDateTime(project.deleted_time)}</div>
                </div>
                <div class="project-actions-btns">
                    <button class="btn btn-success btn-sm" onclick="handleRestoreProject('${project.id}')">恢复</button>
                    <button class="btn btn-danger btn-sm" onclick="handlePermanentDeleteProject('${project.id}', '${escapeHtml(project.name)}')">彻底删除</button>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        console.error('加载已删除项目失败:', error);
        container.innerHTML = '<div class="empty-tip">加载失败</div>';
    }
}

/**
 * 处理打开项目
 */
export async function handleOpenProject(projectId) {
    try {
        const project = await loadProject(projectId);
        
        appState.currentProjectId = projectId;
        appState.projectConfig = project;
        
        // 关闭模态框
        closeProjectSelectModal();
        
        // 更新URL参数，刷新页面后自动加载该项目
        const url = new URL(window.location);
        url.searchParams.set('project', projectId);
        window.history.replaceState({}, '', url);
        
        // 更新顶部项目名显示
        const nameEl = document.getElementById('currentProjectName');
        if (nameEl) {
            nameEl.textContent = project.name || '未命名项目';
            nameEl.style.display = '';
            nameEl.title = project.name || '';
        }
        
        // 显示项目按钮
        showProjectButtons();
        
        // 更新删除需求按钮状态
        updateClearRequirementsBtnState();
        
        // 渲染周期
        renderCycles();
        
        // 更新下拉菜单
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
            projectSelect.value = projectId;
        }
        
        showNotification('已加载项目: ' + project.name, 'success');
    } catch (error) {
        console.error('打开项目失败:', error);
        showNotification('打开项目失败: ' + error.message, 'error');
    }
}

/**
 * 处理软删除项目
 */
export async function handleSoftDeleteProject(projectId, projectName) {
    showConfirmModal(
        '确认删除',
        `确定要删除项目"${projectName}"吗？删除后可从回收站恢复。`,
        async () => {
            try {
                await deleteProject(projectId, false);
                showNotification('项目已移至回收站', 'success');
                
                // 刷新列表
                await loadProjectSelectList();
                await loadDeletedProjectsList();
            } catch (error) {
                console.error('删除项目失败:', error);
                showNotification('删除失败: ' + error.message, 'error');
            }
        }
    );
}

/**
 * 处理恢复项目
 */
export async function handleRestoreProject(projectId) {
    try {
        await restoreProject(projectId);
        showNotification('项目已恢复', 'success');
        
        // 刷新列表
        await loadProjectSelectList();
        await loadDeletedProjectsList();
    } catch (error) {
        console.error('恢复项目失败:', error);
        showNotification('恢复失败: ' + error.message, 'error');
    }
}

/**
 * 处理永久删除项目
 */
export async function handlePermanentDeleteProject(projectId, projectName) {
    showConfirmModal(
        '确认永久删除',
        `确定要永久删除项目"${projectName}"吗？此操作不可恢复！`,
        async () => {
            try {
                await deleteProject(projectId, true);
                showNotification('项目已永久删除', 'success');
                
                // 刷新列表
                await loadDeletedProjectsList();
            } catch (error) {
                console.error('永久删除项目失败:', error);
                showNotification('删除失败: ' + error.message, 'error');
            }
        }
    );
}

/**
 * 切换已删除项目显示
 */
export function toggleDeletedProjects() {
    const container = document.getElementById('deletedProjectsContainer');
    const arrow = document.getElementById('toggleArrow');
    
    if (container) {
        if (container.style.display === 'none') {
            container.style.display = 'block';
            if (arrow) arrow.textContent = '▲';
        } else {
            container.style.display = 'none';
            if (arrow) arrow.textContent = '▼';
        }
    }
}

/**
 * 打开新建项目模态框
 */
export function openNewProjectModal() {
    closeProjectSelectModal();
    
    const modal = document.getElementById('newProjectModal');
    if (modal) {
        modal.classList.add('show');
    }
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


