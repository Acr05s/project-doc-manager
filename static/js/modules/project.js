/**
 * 项目模块 - 处理项目相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, openModal, closeModal } from './ui.js';
import { loadProjectsList, loadProject, saveProject, deleteProject, loadProjectConfig, importJson, exportJson, packageProject, importPackage, confirmAcceptance, downloadPackage } from './api.js';
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
        
        // 更新下拉菜单选中状态
        if (elements.projectSelect) {
            elements.projectSelect.value = projectId;
        }
        
        // 更新URL参数
        const url = new URL(window.location);
        url.searchParams.set('project', projectId);
        window.history.replaceState({}, '', url);
        
        // 渲染周期
        renderCycles();
        
        showProjectButtons();
        showNotification('已加载项目: ' + project.name, 'success');
    } catch (error) {
        console.error('选择项目失败:', error);
        showNotification('加载项目失败', 'error');
    }
}

/**
 * 处理创建项目
 */
export async function handleCreateProject(e) {
    e.preventDefault();
    
    const projectName = document.getElementById('projectName').value;
    const projectDescription = document.getElementById('projectDescription').value;
    
    if (!projectName) {
        showNotification('请输入项目名称', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: projectName, description: projectDescription })
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
            selectProject(result.project.id);
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

    // 检查是否选择了项目
    if (!appState.currentProjectId) {
        showNotification('请先选择项目或新建项目', 'error');
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
            
            // 更新当前选中的项目
            result.data.id = appState.currentProjectId;
            result.data.name = appState.projectConfig ? appState.projectConfig.name : '未命名项目';
            
            // 保存项目配置
            await saveProject(appState.currentProjectId, result.data);
            
            appState.projectConfig = result.data;
            renderCycles();
            renderInitialContent();
            closeModal(elements.loadProjectModal);
            elements.loadProjectForm.reset();
            
            progress.complete('文档需求导入成功');
            showNotification('文档结构更新成功！', 'success');
            console.log('项目配置:', appState.projectConfig);
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
 * 处理导出JSON
 */
export async function handleExportJson() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await exportJson(appState.currentProjectId);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project-${appState.currentProjectId}-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('JSON导出成功', 'success');
        } else {
            showNotification('导出失败', 'error');
        }
    } catch (error) {
        console.error('导出JSON失败:', error);
        showNotification('导出失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
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
 * 处理删除项目
 */
export async function handleDeleteProject() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showConfirmModal(
        '确认删除',
        '确定要删除这个项目吗？此操作不可恢复。',
        async () => {
            try {
                await deleteProject(appState.currentProjectId);
                
                showNotification('项目已删除', 'success');
                
                // 清除状态
                appState.currentProjectId = null;
                appState.projectConfig = null;
                appState.currentCycle = null;
                const projectSelectEl = document.getElementById('projectSelect');
                if (projectSelectEl) projectSelectEl.value = '';
                const cycleNavListEl = document.getElementById('cycleNavList');
                if (cycleNavListEl) cycleNavListEl.innerHTML = '';
                hideProjectButtons();
                // 清除URL参数
                const url = new URL(window.location);
                url.searchParams.delete('project');
                window.history.replaceState({}, '', url);
                
                // 刷新项目列表
                const projects = await loadProjectsList();
                renderProjectsList(projects);
            } catch (error) {
                console.error('删除项目失败:', error);
                showNotification('删除项目失败: ' + error.message, 'error');
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
    const buttons = [
        'loadProjectBtn', 'exportJsonBtn', 'saveProjectBtn', 'packageProjectBtn',
        'importPackageBtn', 'projectManageBtn', 'zipUploadBtn', 'generateReportBtn',
        'confirmAcceptanceBtn', 'downloadPackageBtn', 'checkComplianceBtn', 'deleteProjectBtn'
    ];
    
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.style.display = 'inline-block';
    });
}

/**
 * 隐藏项目按钮
 */
export function hideProjectButtons() {
    const buttons = [
        'loadProjectBtn', 'exportJsonBtn', 'saveProjectBtn', 'packageProjectBtn',
        'importPackageBtn', 'projectManageBtn', 'zipUploadBtn', 'generateReportBtn',
        'confirmAcceptanceBtn', 'downloadPackageBtn', 'checkComplianceBtn', 'deleteProjectBtn'
    ];
    
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.style.display = 'none';
    });
}


