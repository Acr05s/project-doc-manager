/**
 * 存储管理模块
 */

// 项目存储键
const STORAGE_KEY = 'document_manager_projects';

/**
 * 保存项目到本地存储
 * @param {Object} projectsData - 项目数据
 */
export function saveProjects(projectsData) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projectsData));
    } catch (error) {
        console.error('保存项目失败:', error);
    }
}

/**
 * 从本地存储加载项目
 * @returns {Object} 项目数据
 */
export function loadProjects() {
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            return JSON.parse(storedData);
        }
        return { projects: [], currentProjectId: '' };
    } catch (error) {
        console.error('加载项目失败:', error);
        return { projects: [], currentProjectId: '' };
    }
}

/**
 * 清除本地存储
 */
export function clearStorage() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('清除存储失败:', error);
    }
}