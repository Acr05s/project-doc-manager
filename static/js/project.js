/**
 * 项目管理模块
 */

import { saveProjects, loadProjects } from './storage.js';

/**
 * 初始化项目管理
 * @param {Object} appState - 应用状态
 */
export function initProjectManager(appState) {
    const storedData = loadProjects();
    appState.projects = storedData.projects || [];
    appState.currentProjectId = storedData.currentProjectId || '';
    
    // 加载当前项目配置
    if (appState.currentProjectId) {
        const currentProject = appState.projects.find(p => p.id === appState.currentProjectId);
        if (currentProject) {
            appState.projectConfig = currentProject.config;
        }
    }
}

/**
 * 添加项目
 * @param {Object} appState - 应用状态
 * @param {Object} project - 项目对象
 */
export function addProject(appState, project) {
    appState.projects.push(project);
    appState.currentProjectId = project.id;
    appState.projectConfig = project.config;
    saveProjectState(appState);
    updateProjectSelect(appState);
}

/**
 * 保存项目状态
 * @param {Object} appState - 应用状态
 */
export function saveProjectState(appState) {
    const projectsData = {
        projects: appState.projects,
        currentProjectId: appState.currentProjectId
    };
    saveProjects(projectsData);
}

/**
 * 更新项目选择下拉框
 * @param {Object} appState - 应用状态
 */
export function updateProjectSelect(appState) {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;
    
    projectSelect.innerHTML = '<option value="">-- 选择项目 --</option>';
    
    appState.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        if (project.id === appState.currentProjectId) {
            option.selected = true;
        }
        projectSelect.appendChild(option);
    });
}

/**
 * 选择项目
 * @param {Object} appState - 应用状态
 * @param {string} projectId - 项目ID
 * @param {Function} renderDashboard - 渲染仪表盘的函数
 */
export function selectProject(appState, projectId, renderDashboard) {
    if (projectId) {
        const project = appState.projects.find(p => p.id === projectId);
        if (project) {
            appState.currentProjectId = projectId;
            appState.projectConfig = project.config;
            renderDashboard();
            saveProjectState(appState);
        }
    } else {
        appState.currentProjectId = '';
        appState.projectConfig = null;
        saveProjectState(appState);
    }
}

/**
 * 创建新项目
 * @param {Object} appState - 应用状态
 * @param {string} name - 项目名称
 * @param {string} description - 项目描述
 * @returns {Object} 项目对象
 */
export function createProject(appState, name, description) {
    return {
        id: 'project_' + Date.now(),
        name: name,
        description: description,
        config: {
            project_name: name,
            cycles: [],
            documents: {},
            cycle_confirmed: {}
        },
        created_at: new Date().toISOString()
    };
}