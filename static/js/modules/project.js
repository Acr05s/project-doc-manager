/**
 * 项目模块 - 处理项目相关功能
 */

import { appState, elements, initSession, unlockCurrentProject } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, openModal, closeModal } from './ui.js';
import { loadProjectsList, loadProject, saveProject, deleteProject, loadProjectConfig, importJson, exportJson, packageProject, getTaskStatus, getPackageDownloadUrl, cancelTask, importPackage, confirmAcceptance, downloadPackage, getDeletedProjects, restoreProject, applyRequirementsToProject, listRequirementsConfigs, loadZipRecords as apiLoadZipRecords, addZipRecord, deleteZipRecord as apiDeleteZipRecord, uploadProjectChunk, mergeProjectChunks, verifyProjectFiles, previewImportPackage, importFromPreview } from './api.js';
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
 * 检查项目状态（是否正在打包）
 */
async function checkProjectStatus(projectId) {
    try {
        const response = await fetch(`/api/tasks/project-status/${projectId}`);
        const result = await response.json();
        if (result.status === 'success') {
            // 获取当前会话ID（确保已初始化）
            const currentSessionId = appState.sessionId || initSession();
            
            // 如果锁定存在但session_id不匹配（说明是旧会话的锁定，刷新后已失效）
            const isOldLock = result.locked && result.session_id && result.session_id !== currentSessionId;
            
            // 如果是旧会话锁定，认为未被锁定
            const effectiveLocked = result.locked && !isOldLock;
            
            return {
                packaging: result.packaging || false,
                locked: effectiveLocked,
                session_id: result.session_id
            };
        }
    } catch (error) {
        console.error('检查项目状态失败:', error);
    }
    return { packaging: false, locked: false, session_id: null };
}

/**
 * 选择项目
 */
export async function selectProject(projectId) {
    // 先检查后端的项目状态
    const status = await checkProjectStatus(projectId);
    
    // 检查是否正在打包
    if (status.packaging) {
        showNotification('该项目正在打包中，请等待打包完成后再打开', 'warning');
        return;
    }
    
    // 检查是否被其他会话锁定
    if (status.locked && status.session_id) {
        showNotification('该项目正在被其他会话使用，暂不能打开', 'warning');
        return;
    }

    // 检查是否正在打包当前项目（前端状态）
    if (appState.isPackaging && appState.packagingProjectId === projectId) {
        showNotification('该项目正在打包中，请等待打包完成后再打开', 'warning');
        return;
    }

    try {
        console.log('开始加载项目:', projectId);
        const project = await loadProject(projectId);
        console.log('项目数据加载成功:', project);
        console.log('项目名称:', project.name);
        console.log('周期数量:', project.cycles ? project.cycles.length : 0);
        console.log('文档配置:', project.documents ? Object.keys(project.documents).length : 0);
        
        appState.currentProjectId = projectId;
        appState.projectConfig = project;
        console.log('项目配置已设置到appState');
        
        // 初始化会话并锁定项目
        const sessionId = initSession();
        try {
            await fetch('/api/tasks/lock-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    session_id: sessionId
                })
            });
            // 启动心跳

        } catch (error) {
            console.error('锁定项目失败:', error);
        }
        
        // 更新URL参数
        const url = new URL(window.location);
        url.searchParams.set('project', projectId);
        window.history.replaceState({}, '', url);
        
        // 渲染周期
        console.log('开始渲染周期');
        renderCycles();
        
        // 渲染初始内容（显示第一个周期或欢迎信息）
        renderInitialContent();
        
        // 更新顶部项目名显示
        const nameEl = document.getElementById('currentProjectName');
        if (nameEl) {
            nameEl.textContent = project.name || '未命名项目';
            nameEl.style.display = '';
            nameEl.style.cursor = 'pointer';
            nameEl.title = '点击刷新项目数据';
            nameEl.onclick = async () => {
                if (appState.currentProjectId) {
                    showNotification('正在刷新项目数据...', 'info');
                    try {
                        const response = await fetch(`/api/projects/${appState.currentProjectId}`);
                        const result = await response.json();
                        if (result.status === 'success') {
                            appState.projectConfig = result.project;
                            // 重新渲染周期和文档
                            renderCycles();
                            if (appState.currentCycle) {
                                const { renderCycleDocuments } = await import('./document.js');
                                await renderCycleDocuments(appState.currentCycle);
                            }
                            showNotification('项目数据已刷新', 'success');
                        } else {
                            showNotification('刷新失败: ' + result.message, 'error');
                        }
                    } catch (error) {
                        console.error('刷新项目数据失败:', error);
                        showNotification('刷新失败', 'error');
                    }
                }
            };
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
            if (progress) progress.error('导入失败: ' + result.message);
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
 * 生成打包目录结构预览
 */
function generatePackagePreview(projectConfig) {
    let html = '';
    let totalFiles = 0;
    
    const documents = projectConfig.documents || {};
    const cyclesOrder = projectConfig.cycles || [];
    
    // 按照cycles列表的顺序处理周期
    cyclesOrder.forEach((cycle, cycleIndex) => {
        const docData = documents[cycle];
        if (!docData || typeof docData !== 'object') return;
        
        const cycleNum = cycleIndex + 1;
        html += `<div style="margin-left: 0px; margin-bottom: 15px;">
            <div style="font-weight: bold; color: #333;">${cycleNum}. ${cycle}</div>`;
        
        const uploadedDocs = docData.uploaded_docs || [];
        if (uploadedDocs.length === 0) {
            html += `<div style="margin-left: 20px; color: #999;">（无文档）</div>`;
            html += `</div>`;
            return;
        }
        
        // 按文档类型和目录分组
        const docsByType = {};
        uploadedDocs.forEach(doc => {
            if (!doc || typeof doc !== 'object') return;
            const docName = doc.doc_name || '未知';
            const directory = doc.directory || '';
            
            if (!docsByType[docName]) {
                docsByType[docName] = {};
            }
            if (!docsByType[docName][directory]) {
                docsByType[docName][directory] = [];
            }
            docsByType[docName][directory].push(doc);
        });
        
        // 获取需求文档列表（定义了页面上文档类型的顺序）
        const requiredDocs = docData.required_docs || [];
        const docNamesOrder = requiredDocs.map(reqDoc => reqDoc.name).filter(name => name in docsByType);
        
        // 如果required_docs为空，使用docsByType的键作为顺序
        const allDocNames = docNamesOrder.length > 0 ? docNamesOrder : Object.keys(docsByType);
        
        allDocNames.forEach((docName, docIndex) => {
            const dirs = docsByType[docName];
            if (!dirs) return;
            
            const docNum = docIndex + 1;
            html += `<div style="margin-left: 20px; margin-top: 10px;">
                <div style="font-weight: 500; color: #555;">${cycleNum}.${docNum} ${docName}</div>`;
            
            // 处理根目录文件
            if (dirs[''] || dirs['/']) {
                const rootDocs = dirs[''] || dirs['/'] || [];
                rootDocs.forEach((doc, fileIndex) => {
                    const fileNum = fileIndex + 1;
                    const filename = doc.filename || doc.original_filename || '未知文件名';
                    html += `<div style="margin-left: 20px; color: #666;">
                        <span style="color: #888;">${cycleNum}.${docNum}.${fileNum}</span> ${filename}
                    </div>`;
                    totalFiles++;
                });
            }
            
            // 处理子目录
            const subdirs = Object.keys(dirs).filter(dir => dir !== '' && dir !== '/').sort();
            subdirs.forEach((directory, dirIndex) => {
                const docs = dirs[directory];
                if (!docs || docs.length === 0) return;
                
                const dirNum = dirIndex + 1;
                html += `<div style="margin-left: 20px; margin-top: 8px;">
                    <div style="font-style: italic; color: #666;">${cycleNum}.${docNum}.${dirNum} ${directory}</div>`;
                
                docs.forEach((doc, fileIndex) => {
                    const fileNum = fileIndex + 1;
                    const filename = doc.filename || doc.original_filename || '未知文件名';
                    html += `<div style="margin-left: 20px; color: #777;">
                        <span style="color: #999;">${cycleNum}.${docNum}.${dirNum}.${fileNum}</span> ${filename}
                    </div>`;
                    totalFiles++;
                });
                
                html += `</div>`;
            });
            
            html += `</div>`;
        });
        
        html += `</div>`;
    });
    
    html += `<div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; color: #666;">
        <strong>总计：</strong> ${totalFiles} 个文件
    </div>`;
    
    return html;
}

/**
 * 关闭打包预览模态框
 */
export function closePackagePreviewModal() {
    const modal = document.getElementById('packagePreviewModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 处理打包项目 - 打包整个项目目录（配置+文档）
 */
export async function handlePackageProject() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    if (!appState.projectConfig) {
        showNotification('项目配置未加载', 'error');
        return;
    }
    
    const projectName = appState.projectConfig.name;
    
    // 显示确认对话框
    showConfirmModal(
        '确认打包项目',
        `确定要打包整个项目「${projectName}」吗？\n\n将打包：\n- 项目配置文件\n- 已上传的所有文档文件\n\n打包前会保存并关闭当前项目，确保数据完整。`,
        async () => {
            // ==================== 用户确认后隐藏周期导航栏 ====================
            const cycleNavBar = document.getElementById('cycleNavBar');
            const cycleNavList = document.getElementById('cycleNavList');
            const contentArea = document.getElementById('contentArea');
            
            // 隐藏周期导航栏
            if (cycleNavBar) {
                cycleNavBar.style.display = 'none';
            }
            // 清空周期列表
            if (cycleNavList) {
                cycleNavList.innerHTML = '';
            }
            // 替换内容区域
            if (contentArea) {
                contentArea.innerHTML = '<div class="welcome-message"><h2>正在备份项目...</h2><p>项目数据暂时不可操作</p></div>';
            }
            
            // 禁用项目相关按钮
            const projectListBtn = document.getElementById('projectListBtn');
            const openProjectBtn = document.getElementById('openProjectBtn');
            const createProjectBtn = document.getElementById('createProjectBtn');
            const importProjectBtn = document.getElementById('importProjectBtn');
            [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn].forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                    btn.classList.add('disabled');
                }
            });
            
            // 设置打包状态
            appState.isPackaging = true;
            appState.packagingProjectId = appState.currentProjectId;
            
            // 1. 先打开进度模态框
            const progressModal = document.getElementById('packageProgressModal');
            const progressBar = document.getElementById('packageProgressBar');
            const progressMessage = document.getElementById('packageProgressMessage');
            
            if (progressModal) {
                progressModal.style.display = 'block';
                if (progressBar) progressBar.style.width = '0%';
                progressMessage.textContent = '正在保存项目配置...';
            }
            
            showLoading(true, '正在保存并打包项目...');
            
            // 声明变量供 try 和 finally 共享
            let projectIdToPackage = null;
            let projectNameToPackage = '';
            
            try {
                // 1. 保存当前项目配置
                await saveProject(appState.currentProjectId, appState.projectConfig);
                
                // 2. 记录要打包的项目ID，并设置打包状态（在清除currentProjectId之前）
                projectIdToPackage = appState.currentProjectId;
                projectNameToPackage = appState.projectConfig.name;
                
                // 2.1 调用后端接口设置打包状态（刷新后也能检测到）
                try {
                    await fetch('/api/tasks/set-packaging', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project_id: projectIdToPackage })
                    });
                } catch (error) {
                    console.error('设置后端打包状态失败:', error);
                }
                
                // 3. 关闭当前项目（清除内存状态）
                appState.currentProjectId = null;
                appState.projectConfig = null;
                appState.currentCycle = null;
                
                // 4. 清除UI显示
                const nameEl = document.getElementById('currentProjectName');
                if (nameEl) nameEl.style.display = 'none';
                
                // 清空周期列表和文档显示
                const cycleListEl = document.getElementById('cycleList');
                if (cycleListEl) cycleListEl.innerHTML = '<div class="empty-state">请先选择项目</div>';
                
                const docContainer = document.getElementById('documentContainer');
                if (docContainer) docContainer.innerHTML = '<div class="empty-state">请先选择项目</div>';
                
                // 更新URL
                const url = new URL(window.location);
                url.searchParams.delete('project');
                window.history.replaceState({}, '', url);
                
                // 5. 执行打包
                if (progressMessage) progressMessage.textContent = '正在打包项目文件...';
                if (progressBar) progressBar.style.width = '50%';
                
                const response = await fetch(`/api/projects/${projectIdToPackage}/package-full`, {
                    method: 'POST'
                });
                
                // 检查是否是ZIP文件响应
                const contentType = response.headers.get('Content-Type');
                if (contentType && contentType.includes('application/zip')) {
                    if (progressBar) progressBar.style.width = '80%';
                    if (progressMessage) progressMessage.textContent = '正在下载...';
                    
                    // 直接下载ZIP
                    const blob = await response.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    // 添加时间戳
                    const now = new Date();
                    const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
                    a.download = `${projectNameToPackage}_full_backup_${timestamp}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(downloadUrl);
                    
                    if (progressBar) progressBar.style.width = '100%';
                    if (progressMessage) progressMessage.textContent = '打包完成！';
                    
                    // 显示关闭按钮
                    const closeBtn = document.getElementById('closePackageModalBtn');
                    if (closeBtn) {
                        closeBtn.style.display = 'inline-block';
                        closeBtn.textContent = '关闭 (5s)';
                        
                        // 5秒倒计时后自动关闭
                        let countdown = 5;
                        const countdownInterval = setInterval(() => {
                            countdown--;
                            if (countdown > 0) {
                                closeBtn.textContent = `关闭 (${countdown}s)`;
                            } else {
                                clearInterval(countdownInterval);
                                closePackageProgressModalWithCleanup(projectIdToPackage);
                            }
                        }, 1000);
                        
                        // 点击关闭按钮时清除倒计时并关闭
                        closeBtn.onclick = () => {
                            clearInterval(countdownInterval);
                            closePackageProgressModalWithCleanup(projectIdToPackage);
                        };
                    }
                    
                    showNotification(`项目「${projectNameToPackage}」打包成功，正在下载...`, 'success');
                } else {
                    // JSON响应（可能是错误）
                    const result = await response.json();
                    showNotification(result.message || '打包失败', 'error');
                    // 错误时立即关闭并清理
                    closePackageProgressModalWithCleanup(projectIdToPackage);
                }
            } catch (error) {
                console.error('打包项目失败:', error);
                showNotification('打包失败: ' + error.message, 'error');
                // 错误时立即关闭并清理
                closePackageProgressModalWithCleanup(projectIdToPackage);
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 启动打包下载（被 handlePackageProject 和 handleDownloadPackage 调用）
 */
async function startPackageDownload() {
    const modal = document.getElementById('packageProgressModal');
    const progressBar = document.getElementById('packageProgressBar');
    const progressMessage = document.getElementById('packageProgressMessage');
    const cancelBtn = document.getElementById('cancelPackageBtn');
    const downloadBtn = document.getElementById('downloadPackageBtn');
    const closeBtn = document.getElementById('closePackageModalBtn');
    const projectId = appState.currentProjectId;
    
    if (modal) {
        modal.style.display = 'block';
        progressBar.style.width = '0%';
        progressMessage.textContent = '正在启动打包任务...';
        cancelBtn.style.display = 'inline-block';
        downloadBtn.style.display = 'none';
        closeBtn.style.display = 'none';
    }

    let taskId = null;
    let pollInterval = null;

    try {
        // 启动打包任务（使用fetch直接调用API，与handleDownloadPackage保持一致）
        const response = await fetch('/api/tasks/download-package', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                project_config: appState.projectConfig
            })
        });
        
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '启动任务失败');
        }
        
        taskId = result.task_id;
        
        // 轮询任务状态
        pollInterval = setInterval(async () => {
            try {
                const taskResponse = await fetch(`/api/tasks/${taskId}`);
                const taskResult = await taskResponse.json();
                
                if (taskResult.status === 'success' && taskResult.task) {
                    const task = taskResult.task;
                    
                    // 更新进度
                    if (task.progress !== undefined) {
                        progressBar.style.width = task.progress + '%';
                    }
                    if (task.message) {
                        progressMessage.textContent = task.message;
                    }
                    
                    // 任务完成
                    if (task.status === 'completed') {
                        clearInterval(pollInterval);
                        progressBar.style.width = '100%';
                        progressMessage.textContent = '打包完成，正在下载...';
                        cancelBtn.style.display = 'none';
                        downloadBtn.style.display = 'inline-block';
                        closeBtn.style.display = 'inline-block';
                        
                        // 自动触发下载
                        const downloadUrl = `/api/tasks/download/${taskId}`;
                        console.log('[打包] 自动下载URL:', downloadUrl);
                        
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = downloadUrl;
                        document.body.appendChild(iframe);
                        
                        setTimeout(() => {
                            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                        }, 3000);
                        
                        downloadBtn.onclick = () => { window.location.href = downloadUrl; };
                        
                        showNotification('项目打包成功，正在下载...', 'success');
                    }
                    
                    // 任务失败
                    if (task.status === 'error') {
                        clearInterval(pollInterval);
                        progressMessage.textContent = '打包失败: ' + task.message;
                        cancelBtn.style.display = 'none';
                        closeBtn.style.display = 'inline-block';
                        showNotification('打包失败: ' + task.message, 'error');
                    }
                    
                    // 任务取消
                    if (task.status === 'cancelled') {
                        clearInterval(pollInterval);
                        progressMessage.textContent = '任务已取消';
                        cancelBtn.style.display = 'none';
                        closeBtn.style.display = 'inline-block';
                        // 先清除后端打包状态
                        try {
                            await clearProjectPackaging(projectId);
                        } catch (e) {}
                        // 再清除前端打包状态
                        appState.isPackaging = false;
                        appState.packagingProjectId = null;
                        // 恢复内容区域和周期导航显示
                        const cycleNavBar = document.getElementById('cycleNavBar');
                        if (cycleNavBar) cycleNavBar.style.display = '';
                        // 恢复项目按钮可用性
                        const projectListBtn = document.getElementById('projectListBtn');
                        const openProjectBtn = document.getElementById('openProjectBtn');
                        const createProjectBtn = document.getElementById('createProjectBtn');
                        const importProjectBtn = document.getElementById('importProjectBtn');
                        const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
                        projectButtons.forEach(btn => {
                            if (btn) {
                                btn.disabled = false;
                                btn.classList.remove('disabled');
                            }
                        });
                        // 重新渲染项目内容
                        if (appState.currentProjectId) {
                            renderCycles();
                        }
                        showNotification('打包任务已取消', 'info');
                    }
                }
            } catch (error) {
                clearInterval(pollInterval);
                console.error('轮询任务状态失败:', error);
                progressMessage.textContent = '获取进度失败: ' + error.message;
                cancelBtn.style.display = 'none';
                closeBtn.style.display = 'inline-block';
                // 先清除后端打包状态
                try {
                    await clearProjectPackaging(projectId);
                } catch (e) {}
                // 再清除前端打包状态
                appState.isPackaging = false;
                appState.packagingProjectId = null;
                // 恢复内容区域和周期导航显示
                const cycleNavBar = document.getElementById('cycleNavBar');
                if (cycleNavBar) cycleNavBar.style.display = '';
                // 恢复项目按钮可用性
                const projectListBtn = document.getElementById('projectListBtn');
                const openProjectBtn = document.getElementById('openProjectBtn');
                const createProjectBtn = document.getElementById('createProjectBtn');
                const importProjectBtn = document.getElementById('importProjectBtn');
                const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
                projectButtons.forEach(btn => {
                    if (btn) {
                        btn.disabled = false;
                        btn.classList.remove('disabled');
                    }
                });
                // 重新渲染项目内容
                if (appState.currentProjectId) {
                    renderCycles();
                }
            }
        }, 500);
        
        // 取消按钮事件
        if (cancelBtn) {
            cancelBtn.onclick = async () => {
                if (taskId) {
                    try {
                        await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
                        progressMessage.textContent = '正在取消任务...';
                    } catch (error) {
                        console.error('取消任务失败:', error);
                    }
                }
            };
        }
    } catch (error) {
        if (pollInterval) clearInterval(pollInterval);
        console.error('打包项目失败:', error);
        progressMessage.textContent = '打包失败: ' + error.message;
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'inline-block';
        showNotification('打包失败: ' + error.message, 'error');
    }
}

/**
 * 关闭打包进度模态框
 */
export function closePackageProgressModal() {
    const modal = document.getElementById('packageProgressModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 设置为全局函数
window.closePackagePreviewModal = closePackagePreviewModal;

/**
 * 处理导入包
 */
export async function handleImportPackage(e) {
    e.preventDefault();
    
    // 检查是否有预览信息
    if (!importPreviewInfo || !importPreviewInfo.tempId) {
        showNotification('请先选择ZIP文件', 'error');
        return;
    }
    
    // 获取用户选择的冲突处理方式
    const conflictAction = document.querySelector('input[name="conflictAction"]:checked')?.value || 'rename';
    const customNameInput = document.getElementById('importPackageName');
    const customName = customNameInput?.value?.trim();
    
    // 关闭当前项目（如果有），避免数据冲突
    if (appState.currentProjectId) {
        // 重置应用状态
        appState.currentProjectId = null;
        appState.projectConfig = null;
        
        // 隐藏项目相关按钮
        hideProjectButtons();
        
        // 清空当前项目名称显示
        const nameEl = document.getElementById('currentProjectName');
        if (nameEl) {
            nameEl.textContent = '';
            nameEl.style.display = 'none';
        }
        
        // 重置项目选择下拉框
        const projectSelect = document.getElementById('projectSelect');
        if (projectSelect) {
            projectSelect.value = '';
        }
        
        // 清空页面内容，显示初始状态
        renderInitialContent();
        
        showNotification('已关闭当前项目，准备导入新项目', 'info');
    }
    
    // 显示进度
    const progressSection = document.getElementById('importProgressSection');
    const progressBar = document.getElementById('importProgressBar');
    const progressText = document.getElementById('importProgressText');
    const progressPercent = document.getElementById('importProgressPercent');
    
    if (progressSection) progressSection.style.display = 'block';
    if (progressBar) progressBar.style.width = '50%';
    if (progressText) progressText.textContent = '正在导入项目...';
    if (progressPercent) progressPercent.textContent = '50%';
    
    try {
        // 调用导入API
        const result = await importFromPreview(
            importPreviewInfo.tempId,
            conflictAction,
            customName
        );
        
        if (progressBar) progressBar.style.width = '100%';
        if (progressPercent) progressPercent.textContent = '100%';
        
        if (result.status === 'success') {
            const projectId = result.project_id;
            const projectName = result.project_name;
            const isRenamed = result.renamed || false;
            const isMerged = result.merged || false;
            const mergeStats = result.merge_stats;
            
            // 构建成功提示消息
            let successMessage = '项目导入成功';
            if (isMerged && mergeStats) {
                successMessage = `项目数据合并完成！\n新增文档: ${mergeStats.documents_added || 0} 个\n更新文档: ${mergeStats.documents_merged || 0} 个\n新增ZIP包: ${mergeStats.zip_records_added || 0} 个\n复制文件: ${mergeStats.files_copied || 0} 个`;
                if (mergeStats.files_backed_up > 0) {
                    successMessage += `\n备份文件: ${mergeStats.files_backed_up} 个`;
                }
            } else if (isRenamed) {
                successMessage = `项目已导入，新名称为: ${projectName}`;
            }
            
            showNotification(successMessage, 'success', 5000);
            closeModal(elements.importPackageModal);
            document.getElementById('importPackageForm').reset();
            
            // 重置冲突选项
            const conflictOptions = document.getElementById('conflictOptions');
            if (conflictOptions) conflictOptions.style.display = 'none';
            if (customNameInput) {
                customNameInput.value = '';
            }
            
            // 清除预览信息
            importPreviewInfo = null;
            
            // 刷新项目列表
            const projects = await loadProjectsList();
            renderProjectsList(projects);
            
            // 自动加载新导入的项目
            if (projectId) {
                showNotification(`正在加载导入的项目: ${projectName}`, 'info');
                await handleOpenProject(projectId);
            }
        } else {
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入项目失败:', error);
        showNotification('导入失败: ' + error.message, 'error');
    } finally {
        // 隐藏进度条
        if (progressSection) progressSection.style.display = 'none';
    }
}

/**
 * 合并项目分片并导入（支持选项）
 */
async function mergeProjectChunksWithOptions(params) {
    try {
        const response = await fetch('/api/projects/import/merge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('合并分片失败:', error);
        throw error;
    }
}

/**
 * 处理确认验收 - 改为文件完整性检查
 */
export async function handleConfirmAcceptance() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 显示文件检查模态框
    showFileCheckModal();
}

/**
 * 显示文件完整性检查模态框
 */
async function showFileCheckModal() {
    const modal = document.getElementById('fileCheckModal');
    const content = document.getElementById('fileCheckContent');
    
    if (!modal || !content) {
        showNotification('模态框未找到', 'error');
        return;
    }
    
    // 显示模态框
    modal.classList.add('show');
    content.innerHTML = '<div class="loading">正在检查文件，请稍候...</div>';
    
    try {
        const result = await verifyProjectFiles(appState.currentProjectId);
        
        if (result.status === 'success') {
            renderFileCheckResult(result.result);
        } else {
            content.innerHTML = `<div class="error-message">检查失败: ${result.message}</div>`;
        }
    } catch (error) {
        console.error('文件检查失败:', error);
        content.innerHTML = `<div class="error-message">检查失败: ${error.message}</div>`;
    }
}

/**
 * 渲染文件检查结果
 */
function renderFileCheckResult(result) {
    const content = document.getElementById('fileCheckContent');
    
    const { total_files, valid_files, missing_files, path_errors, can_package } = result;
    const hasIssues = missing_files.length > 0 || path_errors.length > 0;
    
    let html = '';
    
    // 统计信息
    html += `
        <div class="file-check-stats">
            <div class="stat-item">
                <span class="stat-label">总文件数:</span>
                <span class="stat-value">${total_files}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">有效文件:</span>
                <span class="stat-value success">${valid_files}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">问题文件:</span>
                <span class="stat-value ${hasIssues ? 'error' : 'success'}">${missing_files.length + path_errors.length}</span>
            </div>
        </div>
    `;
    
    if (hasIssues) {
        // 有问题，显示问题列表
        html += '<div class="file-check-issues">';
        html += '<h3>❌ 发现问题:</h3>';
        
        // 缺失文件
        missing_files.forEach((item, index) => {
            html += `
                <div class="issue-item">
                    <div class="issue-header">
                        <span class="issue-number">${index + 1}.</span>
                        <span class="issue-cycle">${item.cycle}</span>
                        <span class="issue-doc">- ${item.doc_name}</span>
                    </div>
                    <div class="issue-detail">
                        <div class="issue-filename">📄 ${item.filename}</div>
                        <div class="issue-error">❌ 文件不存在</div>
                        <div class="issue-path">路径: ${item.file_path}</div>
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="jumpToDocument('${item.cycle}', '${item.doc_name}', '${item.doc_id}')">
                        🔧 跳转修改
                    </button>
                </div>
            `;
        });
        
        // 路径错误
        path_errors.forEach((item, index) => {
            html += `
                <div class="issue-item">
                    <div class="issue-header">
                        <span class="issue-number">${missing_files.length + index + 1}.</span>
                        <span class="issue-cycle">${item.cycle}</span>
                        <span class="issue-doc">- ${item.doc_name}</span>
                    </div>
                    <div class="issue-detail">
                        <div class="issue-filename">📄 ${item.filename}</div>
                        <div class="issue-error">❌ ${item.error}</div>
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="jumpToDocument('${item.cycle}', '${item.doc_name}', '${item.doc_id}')">
                        🔧 跳转修改
                    </button>
                </div>
            `;
        });
        
        html += '</div>';
        html += `
            <div class="file-check-footer">
                <p class="warning-text">请修复以上问题后再进行打包下载</p>
                <button class="btn btn-secondary" onclick="closeFileCheckModal()">关闭</button>
            </div>
        `;
    } else {
        // 全部通过
        html += `
            <div class="file-check-success">
                <div class="success-icon">🎉</div>
                <h3>恭喜检查通过！</h3>
                <p>所有 ${total_files} 个文件检查通过</p>
                <p>文件路径正确，可以正常打包</p>
            </div>
            <div class="file-check-footer">
                <button class="btn btn-secondary" onclick="closeFileCheckModal()">关闭</button>
                <button class="btn btn-primary" onclick="closeFileCheckModal(); handleDownloadPackage();">立即打包</button>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

/**
 * 跳转到指定文档进行编辑
 */
window.jumpToDocument = function(cycle, docName, docId) {
    closeFileCheckModal();
    
    // 切换到对应周期
    if (window.switchCycle) {
        window.switchCycle(cycle);
    }
    
    // 延迟执行，等待页面渲染
    setTimeout(() => {
        // 查找并点击编辑按钮
        const docItem = document.querySelector(`[data-doc-id="${docId}"]`);
        if (docItem) {
            docItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            docItem.classList.add('highlight');
            setTimeout(() => docItem.classList.remove('highlight'), 3000);
        }
        
        // 如果找不到具体文档项，显示提示
        showNotification(`请手动查找并修复: ${cycle} - ${docName}`, 'info');
    }, 300);
};

/**
 * 关闭文件检查模态框
 */
window.closeFileCheckModal = function() {
    const modal = document.getElementById('fileCheckModal');
    if (modal) {
        modal.classList.remove('show');
    }
};

/**
 * 处理打包文档 - 显示打包选项（只归档文档 OR 所有已匹配文档）
 */
export async function handleDownloadPackage() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    if (!appState.projectConfig) {
        showNotification('项目配置未加载', 'error');
        return;
    }
    
    // 创建选项对话框
    const modal = document.getElementById('packagePreviewModal');
    const content = document.getElementById('packagePreviewContent');
    const cancelBtn = document.getElementById('cancelPackagePreviewBtn');
    const confirmBtn = document.getElementById('confirmPackagePreviewBtn');
    
    if (!modal || !content) {
        showNotification('界面元素缺失', 'error');
        return;
    }
    
    // 显示打包选项
    content.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <h3 style="margin-bottom: 20px;">📦 选择打包范围</h3>
            <div style="display: flex; flex-direction: column; gap: 15px; max-width: 400px; margin: 0 auto;">
                <label style="display: flex; align-items: center; padding: 15px; border: 2px solid #007bff; border-radius: 8px; cursor: pointer; background: #f0f7ff;">
                    <input type="radio" name="packageScope" value="archived" checked style="margin-right: 10px;">
                    <div style="text-align: left;">
                        <strong>📋 只打包已归档文档</strong>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">只打包状态为"已归档"的文档</p>
                    </div>
                </label>
                <label style="display: flex; align-items: center; padding: 15px; border: 2px solid #28a745; border-radius: 8px; cursor: pointer; background: #f0fff4;">
                    <input type="radio" name="packageScope" value="matched" style="margin-right: 10px;">
                    <div style="text-align: left;">
                        <strong>📁 打包所有已匹配文档</strong>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">打包所有已匹配（无论归档状态）的文档</p>
                    </div>
                </label>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // 绑定取消按钮
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }
    
    // 绑定确认按钮
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            modal.style.display = 'none';
            
            // 获取选择的打包范围
            const selected = document.querySelector('input[name="packageScope"]:checked');
            const scope = selected ? selected.value : 'archived';
            
            // 调用打包文档 API
            await startDocumentPackage(scope);
        };
    }
}

/**
 * 清除项目打包状态
 */
export async function clearProjectPackaging(projectId) {
    try {
        // 使用传入的 projectId 或当前打包的项目ID
        const projectIdToClear = projectId || appState.packagingProjectId || appState.currentProjectId;
        console.log('[clearProjectPackaging] 传入projectId:', projectId);
        console.log('[clearProjectPackaging] appState.packagingProjectId:', appState.packagingProjectId);
        console.log('[clearProjectPackaging] appState.currentProjectId:', appState.currentProjectId);
        console.log('[clearProjectPackaging] 最终使用的projectIdToClear:', projectIdToClear);
        
        if (!projectIdToClear) {
            throw new Error('缺少项目ID');
        }
        
        const response = await fetch('/api/tasks/clear-packaging', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectIdToClear })
        });
        
        const result = await response.json();
        console.log('[clearProjectPackaging] API返回结果:', result);
        return result;
    } catch (error) {
        console.error('[clearProjectPackaging] 清除打包状态失败:', error);
        throw error;
    }
}

/**
 * 处理清除打包状态
 */
export async function handleClearPackaging(projectId) {
    showConfirmModal(
        '清除打包状态',
        `确定要清除项目的打包状态吗？这将允许您重新打开该项目。`,
        async () => {
            showLoading(true);
            try {
                const result = await clearProjectPackaging(projectId);
                if (result.status === 'success') {
                    showNotification('打包状态已清除', 'success');
                    // 重新加载项目下拉列表
                    await renderProjectsList();
                    // 重新加载项目管理模态框中的项目列表
                    await loadProjectSelectList();
                } else {
                    showNotification('清除打包状态失败: ' + (result.message || '未知错误'), 'error');
                }
            } catch (error) {
                console.error('清除打包状态失败:', error);
                showNotification('清除打包状态失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
}

/**
 * 启动文档打包
 */
async function startDocumentPackage(scope) {
    const modal = document.getElementById('packageProgressModal');
    const progressBar = document.getElementById('packageProgressBar');
    const progressMessage = document.getElementById('packageProgressMessage');
    const cancelBtn = document.getElementById('cancelPackageBtn');
    const downloadBtn = document.getElementById('downloadPackageBtn');
    const closeBtn = document.getElementById('closePackageModalBtn');
    const projectId = appState.currentProjectId;
    
    // ==================== 第一步：立即隐藏周期导航和内容区域 ====================
    // 这步必须最先执行，确保用户立即看到打包界面
    const contentArea = document.getElementById('contentArea');
    const cycleNavBar = document.getElementById('cycleNavBar');
    const cycleNavList = document.getElementById('cycleNavList');
    const projectListBtn = document.getElementById('projectListBtn');
    const openProjectBtn = document.getElementById('openProjectBtn');
    const createProjectBtn = document.getElementById('createProjectBtn');
    const importProjectBtn = document.getElementById('importProjectBtn');
    
    // 隐藏周期导航栏
    if (cycleNavBar) {
        cycleNavBar.style.display = 'none';
    }
    // 清空周期列表
    if (cycleNavList) {
        cycleNavList.innerHTML = '';
    }
    // 替换内容区域
    if (contentArea) {
        contentArea.innerHTML = '<div class="welcome-message"><h2>正在打包项目...</h2><p>项目数据暂时不可操作</p></div>';
    }
    
    // 禁用项目相关按钮，防止在打包过程中切换项目
    const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
    projectButtons.forEach(btn => {
        if (btn) {
            btn.disabled = true;
            btn.classList.add('disabled');
        }
    });
    
    // 显示打包进度模态框
    if (modal) {
        modal.style.display = 'block';
        progressBar.style.width = '0%';
        progressMessage.textContent = '正在启动文档打包任务...';
        cancelBtn.style.display = 'inline-block';
        downloadBtn.style.display = 'none';
        closeBtn.style.display = 'none';
    }
    
    // ==================== 第二步：设置项目为打包状态 ====================
    try {
        await fetch('/api/tasks/set-packaging', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId })
        });
        // 更新前端状态
        appState.isPackaging = true;
        appState.packagingProjectId = projectId;
    } catch (error) {
        console.error('设置打包状态失败:', error);
        // 即使失败也继续，因为前端已经隐藏了UI
    }
    
    let pollInterval = null;
    
    try {
        const response = await fetch('/api/tasks/download-package', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                project_config: appState.projectConfig,
                scope: scope  // 添加打包范围参数
            })
        });
        
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '启动任务失败');
        }
        
        const taskId = result.task_id;
        
        // 轮询任务状态
        pollInterval = setInterval(async () => {
            try {
                const taskResponse = await fetch(`/api/tasks/${taskId}`);
                const taskResult = await taskResponse.json();
                
                if (taskResult.status === 'success' && taskResult.task) {
                    const task = taskResult.task;
                    
                    if (task.progress !== undefined) {
                        progressBar.style.width = task.progress + '%';
                    }
                    if (task.message) {
                        progressMessage.textContent = task.message;
                    }
                    
                    if (task.status === 'completed') {
                        clearInterval(pollInterval);
                        progressBar.style.width = '100%';
                        progressMessage.textContent = '打包完成，正在下载...';
                        cancelBtn.style.display = 'none';
                        downloadBtn.style.display = 'inline-block';
                        closeBtn.style.display = 'inline-block';
                        
                        // 先清除后端打包状态，再清除前端状态
                        console.log('[打包完成] 使用保存的项目ID:', projectId);
                        await clearProjectPackaging(projectId);
                        
                        // 清除前端打包状态
                        appState.isPackaging = false;
                        appState.packagingProjectId = null;
                        
                        // 恢复内容区域显示
                        const cycleNavBar = document.getElementById('cycleNavBar');
                        if (cycleNavBar) cycleNavBar.style.display = '';
                        
                        // 恢复项目按钮可用性
                        const projectListBtn = document.getElementById('projectListBtn');
                        const openProjectBtn = document.getElementById('openProjectBtn');
                        const createProjectBtn = document.getElementById('createProjectBtn');
                        const importProjectBtn = document.getElementById('importProjectBtn');
                        const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
                        projectButtons.forEach(btn => {
                            if (btn) {
                                btn.disabled = false;
                                btn.classList.remove('disabled');
                            }
                        });
                        
                        // 重新渲染项目内容 - 先渲染周期导航
                        if (appState.currentProjectId) {
                            renderCycles();
                            
                            // 如果有当前选中的周期，重新渲染该周期的文档
                            if (appState.currentCycle) {
                                renderCycleDocuments(appState.currentCycle);
                            } else {
                                // 如果没有选中的周期，显示欢迎信息
                                const contentArea = document.getElementById('contentArea');
                                if (contentArea) {
                                    contentArea.innerHTML = `
                                        <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                                            <h2>欢迎使用文档管理系统</h2>
                                            <p>请从上方选择一个周期开始管理文档</p>
                                        </div>
                                    `;
                                }
                            }
                        }
                        
                        const downloadUrl = `/api/tasks/download/${taskId}`;
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = downloadUrl;
                        document.body.appendChild(iframe);
                        
                        setTimeout(() => {
                            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                        }, 5000);
                        
                        downloadBtn.onclick = () => { window.location.href = downloadUrl; };
                        closeBtn.onclick = () => { closePackageProgressModal(); };
                        showNotification('文档打包成功，正在下载...', 'success');
                        
                        // 3秒后自动关闭模态框
                        setTimeout(() => {
                            closePackageProgressModal();
                        }, 3000);
                    }
                    
                    if (task.status === 'error') {
                        clearInterval(pollInterval);
                        progressMessage.textContent = '打包失败: ' + task.message;
                        cancelBtn.style.display = 'none';
                        closeBtn.style.display = 'inline-block';
                        closeBtn.onclick = () => { closePackageProgressModal(); };
                        // 先清除后端打包状态
                        await clearProjectPackaging(projectId);
                        // 再清除前端打包状态
                        appState.isPackaging = false;
                        appState.packagingProjectId = null;
                        // 恢复内容区域显示
                        const cycleNavBar = document.getElementById('cycleNavBar');
                        if (cycleNavBar) cycleNavBar.style.display = '';
                        
                        // 恢复项目按钮可用性
                        const projectListBtn = document.getElementById('projectListBtn');
                        const openProjectBtn = document.getElementById('openProjectBtn');
                        const createProjectBtn = document.getElementById('createProjectBtn');
                        const importProjectBtn = document.getElementById('importProjectBtn');
                        const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
                        projectButtons.forEach(btn => {
                            if (btn) {
                                btn.disabled = false;
                                btn.classList.remove('disabled');
                            }
                        });
                        
                        // 重新渲染项目内容
                        if (appState.currentProjectId) {
                            renderCycles();
                        }
                        showNotification('打包失败: ' + task.message, 'error');
                    }
                }
            } catch (error) {
                clearInterval(pollInterval);
                progressMessage.textContent = '获取进度失败: ' + error.message;
                cancelBtn.style.display = 'none';
                closeBtn.style.display = 'inline-block';
                closeBtn.onclick = () => { closePackageProgressModal(); };
                // 先清除后端打包状态
                try {
                    await clearProjectPackaging(projectId);
                } catch (e) {}
                // 再清除前端打包状态
                appState.isPackaging = false;
                appState.packagingProjectId = null;
                // 恢复内容区域和周期导航显示
                const cycleNavBar = document.getElementById('cycleNavBar');
                if (cycleNavBar) cycleNavBar.style.display = '';
                // 恢复项目按钮可用性
                const projectListBtn = document.getElementById('projectListBtn');
                const openProjectBtn = document.getElementById('openProjectBtn');
                const createProjectBtn = document.getElementById('createProjectBtn');
                const importProjectBtn = document.getElementById('importProjectBtn');
                const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
                projectButtons.forEach(btn => {
                    if (btn) {
                        btn.disabled = false;
                        btn.classList.remove('disabled');
                    }
                });
                // 重新渲染项目内容
                if (appState.currentProjectId) {
                    renderCycles();
                }
            }
        }, 500);
        
        if (cancelBtn) {
            cancelBtn.onclick = async () => {
                if (taskId) {
                    try {
                        await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
                        progressMessage.textContent = '正在取消任务...';
                        // 先清除后端打包状态
                        await clearProjectPackaging(projectId);
                        // 再清除前端打包状态
                        appState.isPackaging = false;
                        appState.packagingProjectId = null;
                        
                        // 恢复内容区域和周期导航显示
                        const cycleNavBar = document.getElementById('cycleNavBar');
                        if (cycleNavBar) cycleNavBar.style.display = '';
                        
                        // 恢复项目按钮可用性
                        const projectListBtn = document.getElementById('projectListBtn');
                        const openProjectBtn = document.getElementById('openProjectBtn');
                        const createProjectBtn = document.getElementById('createProjectBtn');
                        const importProjectBtn = document.getElementById('importProjectBtn');
                        const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
                        projectButtons.forEach(btn => {
                            if (btn) {
                                btn.disabled = false;
                                btn.classList.remove('disabled');
                            }
                        });
                        
                        // 重新渲染项目内容
                        if (appState.currentProjectId) {
                            renderCycles();
                        }
                        showNotification('已取消打包任务', 'info');
                    } catch (error) {
                        console.error('取消任务失败:', error);
                    }
                }
            };
        }
    } catch (error) {
        if (pollInterval) clearInterval(pollInterval);
        console.error('打包文档失败:', error);
        progressMessage.textContent = '打包失败: ' + error.message;
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'inline-block';
        
        // 先清除后端打包状态
        try {
            await clearProjectPackaging(projectId);
        } catch (e) {}
        // 再清除前端打包状态
        appState.isPackaging = false;
        appState.packagingProjectId = null;
        
        // 恢复内容区域和周期导航显示
        const cycleNavBar = document.getElementById('cycleNavBar');
        if (cycleNavBar) cycleNavBar.style.display = '';
        
        // 恢复项目按钮可用性
        const projectListBtn = document.getElementById('projectListBtn');
        const openProjectBtn = document.getElementById('openProjectBtn');
        const createProjectBtn = document.getElementById('createProjectBtn');
        const importProjectBtn = document.getElementById('importProjectBtn');
        const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
        projectButtons.forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('disabled');
            }
        });
        // 先清除后端打包状态
        await clearProjectPackaging(projectId);
        // 再清除前端打包状态
        appState.isPackaging = false;
        appState.packagingProjectId = null;
        showNotification('打包失败: ' + error.message, 'error');
    }
}

/**
 * 保留原 handleDownloadPackage 逻辑（兼容）
 */
async function doHandleDownloadPackage() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    if (!appState.projectConfig) {
        showNotification('项目配置未加载', 'error');
        return;
    }
    
    // 显示进度模态框
    showPackageProgressModal();
    
    try {
        // 启动打包任务
        const response = await fetch('/api/tasks/download-package', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                project_config: appState.projectConfig
            })
        });
        
        const result = await response.json();
        
        if (result.status !== 'success') {
            updatePackageProgressError(result.message || '启动任务失败');
            return;
        }
        
        const taskId = result.task_id;
        
        // 轮询任务进度
        const pollInterval = setInterval(async () => {
            try {
                const taskResponse = await fetch(`/api/tasks/${taskId}`);
                const taskResult = await taskResponse.json();
                
                if (taskResult.status === 'success' && taskResult.task) {
                    const task = taskResult.task;
                    
                    // 更新进度
                    updatePackageProgress(task.progress, task.message);
                    
                    if (task.status === 'completed') {
                        clearInterval(pollInterval);
                        
                        // 显示下载链接
                        const downloadUrl = task.result?.download_url;
                        if (downloadUrl) {
                            showPackageDownloadLink(downloadUrl);
                            
                            // 自动下载
                            setTimeout(() => {
                                const a = document.createElement('a');
                                a.href = downloadUrl;
                                a.download = task.result?.package_filename || 'package.zip';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                            }, 500);
                        }
                        
                        // 3秒后关闭模态框
                        setTimeout(() => {
                            closePackageProgressModal();
                        }, 3000);
                        
                    } else if (task.status === 'error') {
                        clearInterval(pollInterval);
                        updatePackageProgressError(task.message);
                    }
                }
            } catch (error) {
                console.error('查询任务进度失败:', error);
            }
        }, 500);
        
    } catch (error) {
        console.error('打包下载失败:', error);
        updatePackageProgressError('启动打包任务失败');
    }
}

// 显示进度模态框
function showPackageProgressModal() {
    const modal = document.getElementById('packageProgressModal');
    const minimizedBar = document.getElementById('packageProgressMinimized');
    if (minimizedBar) {
        minimizedBar.style.display = 'none';
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('minimized');
        modal.classList.add('show');
        updatePackageProgress(0, '准备中...');
    }
}

// 最小化/还原打包进度模态框
window.togglePackageProgressMinimize = function() {
    const modal = document.getElementById('packageProgressModal');
    const minimizedBar = document.getElementById('packageProgressMinimized');
    const progressMessage = document.getElementById('packageProgressMessage');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    if (modal && minimizedBar) {
        // 移除 show 类，添加 minimzed 类，设置 display none
        modal.classList.remove('show');
        modal.classList.add('minimized');
        modal.style.display = 'none';
        
        // 强制隐藏全局 loading 层（这就是遮挡页面的原因！）
        if (loadingIndicator) {
            loadingIndicator.classList.remove('show');
            loadingIndicator.style.display = 'none';
        }
        
        // 显示最小化浮动条
        minimizedBar.style.display = 'block';
        
        // 更新文字
        const minimizedText = document.getElementById('minimizedText');
        if (minimizedText && progressMessage) {
            minimizedText.textContent = progressMessage.textContent || '正在打包...';
        }
        
        console.log('最小化：已隐藏模态框和loading层');
    }
};

// 还原打包进度模态框
window.restorePackageProgress = function() {
    const modal = document.getElementById('packageProgressModal');
    const minimizedBar = document.getElementById('packageProgressMinimized');
    
    if (modal && minimizedBar) {
        minimizedBar.style.display = 'none';
        modal.classList.remove('minimized');
        modal.classList.add('show');
        modal.style.display = 'flex';
    }
};

// 关闭进度模态框并清理状态（指定项目ID）
async function closePackageProgressModalWithCleanup(projectId) {
    const modal = document.getElementById('packageProgressModal');
    const minimizedBar = document.getElementById('packageProgressMinimized');
    if (modal) {
        modal.classList.remove('show');
        modal.classList.remove('minimized');
        modal.style.display = 'none';
    }
    if (minimizedBar) {
        minimizedBar.style.display = 'none';
    }
    
    // 使用传入的项目ID或从appState获取
    const projectIdToClear = projectId || appState.packagingProjectId || appState.currentProjectId;
    
    // 清除前端打包状态
    appState.isPackaging = false;
    appState.packagingProjectId = null;
    
    // 恢复内容区域和周期导航显示
    const cycleNavBar = document.getElementById('cycleNavBar');
    const contentArea = document.getElementById('contentArea');
    if (cycleNavBar) cycleNavBar.style.display = '';
    
    // 恢复项目按钮可用性
    const projectListBtn = document.getElementById('projectListBtn');
    const openProjectBtn = document.getElementById('openProjectBtn');
    const createProjectBtn = document.getElementById('createProjectBtn');
    const importProjectBtn = document.getElementById('importProjectBtn');
    const projectButtons = [projectListBtn, openProjectBtn, createProjectBtn, importProjectBtn];
    projectButtons.forEach(btn => {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('disabled');
        }
    });
    
    // 重新渲染项目内容
    if (appState.currentProjectId) {
        renderCycles();
        
        // 如果有当前选中的周期，重新渲染该周期的文档
        if (appState.currentCycle) {
            renderCycleDocuments(appState.currentCycle);
        } else if (contentArea) {
            // 如果没有选中的周期，显示欢迎信息
            contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>欢迎使用文档管理系统</h2>
                    <p>请从上方选择一个周期开始管理文档</p>
                </div>
            `;
        }
    } else if (contentArea) {
        // 如果没有当前项目，显示欢迎信息
        contentArea.innerHTML = `
            <div class="welcome-message">
                <h2>欢迎使用项目文档管理中心</h2>
                <p>请在顶部选择项目，加载配置文件</p>
                <p>然后在顶部周期导航中选择周期，管理文档</p>
            </div>
        `;
    }
    
    // 清除后端打包状态（使用传入的项目ID）
    if (projectIdToClear) {
        try {
            await clearProjectPackaging(projectIdToClear);
            console.log('[打包] 已清除项目打包状态:', projectIdToClear);
        } catch (e) {
            console.error('清除打包状态失败:', e);
        }
    }
}

// 关闭进度模态框（默认清理）
window.closePackageProgressModal = async function() {
    await closePackageProgressModalWithCleanup();
};

// 更新进度（复用现有模态框的 packageProgressBar）
function updatePackageProgress(progress, message) {
    const bar = document.getElementById('packageProgressBar');
    const msg = document.getElementById('packageProgressMessage');
    const minimizedText = document.getElementById('minimizedText');
    
    if (bar) bar.style.width = progress + '%';
    if (msg) msg.textContent = message;
    if (minimizedText) minimizedText.textContent = message;
}

// 显示错误
function updatePackageProgressError(message) {
    const msg = document.getElementById('packageProgressMessage');
    const bar = document.getElementById('packageProgressBar');
    
    if (msg) {
        msg.textContent = '❌ ' + message;
        msg.style.color = '#dc3545';
    }
    if (bar) bar.style.background = '#dc3545';
}

// 设置为全局函数
window.handleDownloadPackage = handleDownloadPackage;

/**
 * 处理重新匹配文件管理
 */
export async function handleRematchFileManagement() {
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
                    <button class="btn btn-primary rematch-btn">重新匹配</button>
                    <button class="btn btn-danger delete-btn">删除记录</button>
                </div>
            `;
            
            // 直接绑定事件（避免内联 onclick 在 ES Module 中失效）
            const rematchBtn = item.querySelector('.rematch-btn');
            const deleteBtn = item.querySelector('.delete-btn');
            
            rematchBtn.addEventListener('click', () => {
                handleRematchFromZip(record.id, record.name, record.path);
            });
            
            deleteBtn.addEventListener('click', () => {
                handleDeleteZipRecord(record.id, record.name);
            });
            
            container.appendChild(item);
        });
    } catch (error) {
        console.error('加载ZIP记录失败:', error);
        container.innerHTML = `<div class="empty-tip">加载失败: ${error.message || '未知错误'}</div>`;
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
        nameInput.value = '';
    }
    
    // 隐藏冲突选项
    const conflictOptions = document.getElementById('conflictOptions');
    if (conflictOptions) conflictOptions.style.display = 'none';
    
    // 隐藏提示
    const hint = document.getElementById('importPackageNameHint');
    if (hint) {
        hint.style.display = 'none';
        hint.textContent = '';
    }
    
    // 清除预览信息
    importPreviewInfo = null;
}

/**
 * 存储预览信息（用于导入时复用）
 */
let importPreviewInfo = null;

/**
 * 处理项目包文件选择
 * 上传ZIP到服务器预览，获取项目信息和冲突状态
 */
export async function handlePackageFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const conflictOptions = document.getElementById('conflictOptions');
    const nameInput = document.getElementById('importPackageName');
    const hint = document.getElementById('importPackageNameHint');
    
    // 显示上传中提示
    if (hint) {
        hint.textContent = '正在上传并解析ZIP文件...';
        hint.style.color = '#007bff';
        hint.style.display = 'block';
    }
    
    try {
        // 调用API上传并预览ZIP文件
        const result = await previewImportPackage(file);
        
        if (result.status !== 'success') {
            if (hint) {
                hint.textContent = result.message || '解析ZIP文件失败';
                hint.style.color = '#dc3545';
                hint.style.display = 'block';
            }
            importPreviewInfo = null;
            return;
        }
        
        // 保存预览信息
        importPreviewInfo = {
            tempId: result.temp_id,
            projectInfo: result.project_info,
            conflict: result.conflict
        };
        
        const projectName = result.project_info.name;
        
        // 设置项目名称输入框
        if (nameInput) {
            nameInput.value = projectName;
        }
        
        if (result.conflict.has_conflict) {
            // 显示冲突选项
            if (conflictOptions) conflictOptions.style.display = 'block';
            
            // 显示提示
            if (hint) {
                hint.innerHTML = `检测到同名项目 "<strong>${projectName}</strong>" 已存在，请选择处理方式：<br>
                    <small style="color: #666;">
                    • 合并数据：保留两个项目的所有数据（推荐）<br>
                    • 覆盖：删除现有项目，使用新项目<br>
                    • 重命名：自动添加时间戳作为新项目导入
                    </small>`;
                hint.style.color = '#856404';
                hint.style.display = 'block';
            }
            
            // 默认选中合并数据选项
            const mergeRadio = document.querySelector('input[name="conflictAction"][value="merge"]');
            if (mergeRadio) mergeRadio.checked = true;
        } else {
            // 没有重名，隐藏冲突选项
            if (conflictOptions) conflictOptions.style.display = 'none';
            
            if (hint) {
                hint.textContent = `项目名称：${projectName}（新导入，共 ${result.project_info.cycle_count} 个周期，${result.project_info.doc_count} 个文档）`;
                hint.style.color = '#28a745';
                hint.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('预览ZIP文件失败:', error);
        if (hint) {
            hint.textContent = '无法读取ZIP文件，请检查文件是否有效';
            hint.style.color = '#dc3545';
            hint.style.display = 'block';
        }
        importPreviewInfo = null;
    }
}

/**
 * 处理项目包文件选择（Modal版本）
 * 上传ZIP到服务器预览，获取项目信息和冲突状态，带进度条
 */
export async function handlePackageFileSelectInModal(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const conflictOptions = document.getElementById('conflictOptionsInModal');
    const hint = document.getElementById('importPackageNameHintInModal');
    const progressSection = document.getElementById('importProgressSectionInModal');
    const progressBar = document.getElementById('importProgressBarInModal');
    const progressText = document.getElementById('importProgressTextInModal');
    const progressPercent = document.getElementById('importProgressPercentInModal');
    const submitBtn = document.getElementById('importSubmitBtnInModal');
    
    // 禁用提交按钮
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ 请等待...';
    }
    
    // 显示上传进度条
    if (progressSection) progressSection.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '准备上传...';
    if (progressPercent) progressPercent.textContent = '0%';
    
    // 隐藏之前的提示
    if (hint) hint.style.display = 'none';
    if (conflictOptions) conflictOptions.style.display = 'none';
    
    // 显示操作进度提示
    const { showOperationProgress } = await import('./ui.js');
    const progress = showOperationProgress('upload-' + Date.now(), '正在上传ZIP文件...');
    
    try {
        // 使用 XMLHttpRequest 来获取上传进度
        const uploadPromise = new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('file', file);
            
            // 进度监听
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    if (progressBar) progressBar.style.width = percentComplete + '%';
                    if (progressText) progressText.textContent = '正在上传... ' + percentComplete + '%';
                    if (progressPercent) progressPercent.textContent = percentComplete + '%';
                    progress.update(percentComplete, `正在上传... ${percentComplete}%`);
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText);
                        resolve(result);
                    } catch (e) {
                        reject(new Error('解析响应失败'));
                    }
                } else {
                    reject(new Error('上传失败: ' + xhr.statusText));
                }
            });
            
            xhr.addEventListener('error', () => reject(new Error('上传出错')));
            xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
            
            xhr.open('POST', '/api/projects/package/preview');
            xhr.send(formData);
        });
        
        const result = await uploadPromise;
        
        if (result.status !== 'success') {
            progress.error(result.message || '解析ZIP文件失败');
            if (progressText) progressText.textContent = '上传失败';
            if (hint) {
                hint.textContent = result.message || '解析ZIP文件失败';
                hint.style.color = '#dc3545';
                hint.style.display = 'block';
            }
            importPreviewInfo = null;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '📥 导入项目包';
            }
            return;
        }
        
        // 验证响应数据完整性
        if (!result.temp_id || !result.project_info) {
            progress.error('服务器返回数据不完整');
            if (progressText) progressText.textContent = '解析失败';
            if (hint) {
                hint.textContent = '服务器返回数据不完整，请重试';
                hint.style.color = '#dc3545';
                hint.style.display = 'block';
            }
            importPreviewInfo = null;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '📥 导入项目包';
            }
            return;
        }
        
        // 保存预览信息
        importPreviewInfo = {
            tempId: result.temp_id,
            projectInfo: result.project_info,
            conflict: result.conflict || { has_conflict: false }
        };
        
        const projectName = result.project_info.name || '未命名项目';
        
        if (progressText) progressText.textContent = '解析完成';
        progress.update(100, '上传完成，准备导入');
        
        if (result.conflict && result.conflict.has_conflict) {
            // 显示冲突选项
            if (conflictOptions) conflictOptions.style.display = 'block';
            
            // 显示提示
            if (hint) {
                hint.innerHTML = `检测到同名项目 "<strong>${projectName}</strong>" 已存在，请选择处理方式后点击导入：<br>
                    <small style="color: #666;">
                    • <b>合并数据</b>：保留两个项目的所有数据（推荐）<br>
                    • <b>覆盖</b>：删除现有项目，使用新项目<br>
                    • <b>重命名</b>：自动添加时间戳作为新项目导入
                    </small>`;
                hint.style.color = '#856404';
                hint.style.display = 'block';
            }
            
            // 默认选中合并数据选项
            const mergeRadio = document.querySelector('input[name="conflictActionInModal"][value="merge"]');
            if (mergeRadio) mergeRadio.checked = true;
        } else {
            // 没有重名，隐藏冲突选项
            if (conflictOptions) conflictOptions.style.display = 'none';
            
            if (hint) {
                hint.innerHTML = `✅ <strong>${projectName}</strong><br>
                    <small style="color: #666;">共 ${result.project_info.cycle_count} 个周期，${result.project_info.doc_count} 个文档</small>`;
                hint.style.color = '#28a745';
                hint.style.display = 'block';
            }
        }
        
        if (progressText) progressText.textContent = '准备就绪，请点击导入按钮';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '📥 导入项目包';
        }
        
    } catch (error) {
        console.error('预览ZIP文件失败:', error);
        progress.error('上传失败: ' + error.message);
        if (progressText) progressText.textContent = '上传失败';
        if (hint) {
            hint.textContent = '无法读取ZIP文件，请检查文件是否有效';
            hint.style.color = '#dc3545';
            hint.style.display = 'block';
        }
        importPreviewInfo = null;
        if (submitBtn) submitBtn.disabled = false;
    }
}

/**
 * 处理导入项目（Modal版本）
 */
export async function handleImportPackageInModal(e) {
    // 阻止默认表单提交
    if (e) e.preventDefault();
    
    // 检查是否有预览信息
    if (!importPreviewInfo || !importPreviewInfo.tempId) {
        showNotification('请先选择ZIP文件', 'error');
        return;
    }
    
    // 获取用户选择的冲突处理方式
    const conflictAction = document.querySelector('input[name="conflictActionInModal"]:checked')?.value || 'rename';
    
    const progressBar = document.getElementById('importProgressBarInModal');
    const progressText = document.getElementById('importProgressTextInModal');
    const progressPercent = document.getElementById('importProgressPercentInModal');
    const submitBtn = document.getElementById('importSubmitBtnInModal');
    
    // 禁用提交按钮，显示导入中状态
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '📥 正在导入...';
    }
    if (progressText) progressText.textContent = '正在导入项目...';
    if (progressBar) progressBar.style.width = '50%';
    if (progressPercent) progressPercent.textContent = '50%';
    
    // 显示操作进度提示
    const { showOperationProgress } = await import('./ui.js');
    const progress = showOperationProgress('import-' + Date.now(), '正在导入项目...');
    
    try {
        // 调用导入API
        const result = await importFromPreview(
            importPreviewInfo.tempId,
            conflictAction,
            ''  // 不使用自定义名称
        );
        
        if (progressBar) progressBar.style.width = '100%';
        if (progressPercent) progressPercent.textContent = '100%';
        if (progressText) progressText.textContent = '导入完成！';
        
        if (result.status === 'success') {
            const projectId = result.project_id;
            const projectName = result.project_name;
            const isMerged = result.merged || false;
            const mergeStats = result.merge_stats;
            
            // 构建成功提示消息
            let successMessage = '项目导入成功';
            if (isMerged && mergeStats) {
                successMessage = `项目数据合并完成！新增文档: ${mergeStats.documents_added || 0} 个，更新文档: ${mergeStats.documents_merged || 0} 个`;
            }
            if (progress) progress.complete(successMessage);
            
            showNotification(successMessage, 'success', 5000);
            
            // 清除预览信息
            importPreviewInfo = null;
            
            // 刷新项目列表
            await loadProjectSelectList();
            
            // 清空表单
            const form = document.getElementById('importPackageFormInModal');
            if (form) form.reset();
            
            // 隐藏冲突选项和提示
            const conflictOptions = document.getElementById('conflictOptionsInModal');
            const hint = document.getElementById('importPackageNameHintInModal');
            const progressSection = document.getElementById('importProgressSectionInModal');
            if (conflictOptions) conflictOptions.style.display = 'none';
            if (hint) hint.style.display = 'none';
            if (progressSection) progressSection.style.display = 'none';
            
            // 恢复提交按钮
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '📥 导入项目包';
            }
            
            // 自动加载新导入的项目
            if (projectId) {
                showNotification(`正在加载导入的项目: ${projectName}`, 'info');
                await handleOpenProject(projectId);
            }
        } else {
            progress.error('导入失败: ' + result.message);
            showNotification('导入失败: ' + result.message, 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '📥 导入项目包';
            }
        }
    } catch (error) {
        console.error('导入项目失败:', error);
        if (progress) progress.error('导入失败: ' + error.message);
        showNotification('导入失败: ' + error.message, 'error');
        if (progressText) progressText.textContent = '导入失败';
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '📥 导入项目包';
        }
    }
}

/**
 * 显示项目按钮
 */
export function showProjectButtons() {
    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu', 
        'acceptanceMenu'
    ];
    
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'inline-block';
    });
    
    // 显示备份项目按钮
    const packageProjectBtn = document.getElementById('packageProjectBtn');
    if (packageProjectBtn) packageProjectBtn.style.display = 'inline-block';
}

/**
 * 隐藏项目按钮
 */
export function hideProjectButtons() {
    const menus = [
        'documentRequirementsMenu', 'documentManagementMenu', 
        'acceptanceMenu'
    ];
    
    menus.forEach(menuId => {
        const menu = document.getElementById(menuId);
        if (menu) menu.style.display = 'none';
    });
    
    // 隐藏备份项目按钮
    const packageProjectBtn = document.getElementById('packageProjectBtn');
    if (packageProjectBtn) packageProjectBtn.style.display = 'none';
}

/**
 * 打开项目选择模态框
 */
export async function openProjectSelectModal() {
    const modal = document.getElementById('projectSelectModal');
    if (!modal) return;
    
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
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
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
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
        
        for (const project of projects) {
            const item = document.createElement('div');
            item.className = 'project-item';
            
            // 检查项目状态
            const status = await checkProjectStatus(project.id);
            
            let actionsHtml = `
                <div class="project-actions-btns">
                    <button class="btn btn-primary btn-sm" onclick="handleOpenProject('${project.id}')">打开</button>
                    <button class="btn btn-warning btn-sm" onclick="handleSoftDeleteProject('${project.id}', '${escapeHtml(project.name)}')">删除</button>
            `;
            
            // 如果项目正在打包中，添加清除打包状态按钮
            if (status.packaging) {
                actionsHtml += `
                    <button class="btn btn-warning btn-sm" onclick="handleClearPackaging('${project.id}')">清除打包状态</button>
                `;
            }
            
            actionsHtml += `</div>`;
            
            item.innerHTML = `
                <div class="project-info">
                    <div class="project-name">${escapeHtml(project.name)} ${status.packaging ? '<span style="color: orange; font-size: 12px; margin-left: 8px;">(打包中)</span>' : ''}</div>
                    <div class="project-meta">创建时间: ${formatDateTime(project.created_time)}</div>
                </div>
                ${actionsHtml}
            `;
            
            container.appendChild(item);
        }
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
    // 检查项目是否正在打包中
    if (appState.isPackaging && appState.packagingProjectId === projectId) {
        showNotification('该项目正在打包中，请等待打包完成后再打开', 'warning');
        return;
    }
    
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
        
        // 渲染初始内容（显示第一个周期或欢迎信息）
        renderInitialContent();
        
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


