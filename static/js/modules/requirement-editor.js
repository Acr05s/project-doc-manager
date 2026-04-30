/**
 * 文档需求编辑器模块
 */

import { appState } from './app-state.js';
import { showNotification, showLoading, showConfirmModal, openModal, closeModal } from './ui.js';
import { renderCycles, renderInitialContent } from './cycle.js';

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 打开需求编辑器
 */
export function openRequirementEditor() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    const modal = document.getElementById('requirementEditorModal');
    if (!modal) {
        console.error('找不到需求编辑器模态框');
        return;
    }
    
    openModal(modal);
    
    // 初始化编辑器
    initEditor();
}

/**
 * 关闭需求编辑器
 */
export function closeRequirementEditor() {
    const modal = document.getElementById('requirementEditorModal');
    if (modal) {
        closeModal(modal);
    }
}

/**
 * 初始化编辑器
 */
function initEditor() {
    // 加载当前配置
    const config = appState.projectConfig;
    if (!config) {
        showNotification('项目配置加载失败', 'error');
        return;
    }
    
    // 渲染周期列表
    renderCycleEditor(config.cycles || [], config.documents || {});
}

/**
 * 渲染周期编辑器
 */
function renderCycleEditor(cycles, documents) {
    const container = document.getElementById('cycleEditorContainer');
    if (!container) return;
    
    if (cycles.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>暂无周期，请添加新周期</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = cycles.map((cycle, index) => {
        const cycleDocs = documents[cycle]?.required_docs || [];
        let docCount = 0;
        let folderCount = 0;
        
        function countItems(items) {
            for (const item of items) {
                const itemData = typeof item === 'object' && item !== null ? item : { name: item };
                if (itemData.type === 'folder') {
                    folderCount++;
                    if (itemData.children) countItems(itemData.children);
                } else {
                    docCount++;
                    if (itemData.children) countItems(itemData.children);
                }
            }
        }
        countItems(cycleDocs);
        
        let infoParts = [];
        if (docCount > 0) infoParts.push(`文档: ${docCount} 项`);
        if (folderCount > 0) infoParts.push(`目录: ${folderCount} 项`);
        if (infoParts.length === 0) infoParts.push('文档需求: 0 项');
        
        return `
        <div class="cycle-edit-item" data-cycle="${cycle}">
            <div class="cycle-header">
                <h4 class="cycle-name">📂 ${cycle}</h4>
                <div class="cycle-actions">
                    <button class="btn btn-sm btn-primary" onclick="editCycle('${cycle}')">编辑周期</button>
                    <button class="btn btn-sm btn-secondary" onclick="editCycleDocuments('${cycle}')">编辑内容</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCycle('${cycle}')">删除周期</button>
                </div>
            </div>
            <div class="cycle-info">
                <span>${infoParts.join(' | ')}</span>
            </div>
        </div>
    `}).join('');
}

/**
 * 添加新周期
 */
export function addNewCycle() {
    showInputModal(
        '添加新周期',
        [{
            label: '周期名称',
            key: 'cycleName',
            value: '',
            placeholder: '请输入周期名称'
        }],
        (result) => {
            const cycleName = result.cycleName;
            if (!cycleName || !cycleName.trim()) return;
            
            const config = appState.projectConfig;
            if (!config.cycles) config.cycles = [];
            if (!config.documents) config.documents = {};
            
            if (config.cycles.includes(cycleName.trim())) {
                showNotification('周期名称已存在', 'error');
                return;
            }
            
            config.cycles.push(cycleName.trim());
            config.documents[cycleName.trim()] = {
                required_docs: [],
                uploaded_docs: []
            };
            
            renderCycleEditor(config.cycles, config.documents);
            showNotification('周期添加成功', 'success');
        }
    );
}

/**
 * 编辑周期名称
 */
window.editCycle = function(oldCycle) {
    showInputModal(
        '编辑周期名称',
        [{
            label: '新周期名称',
            key: 'newCycle',
            value: oldCycle,
            placeholder: '请输入新的周期名称'
        }],
        (result) => {
            const newCycle = result.newCycle;
            if (!newCycle || !newCycle.trim() || newCycle.trim() === oldCycle) return;
            
            const config = appState.projectConfig;
            if (config.cycles.includes(newCycle.trim())) {
                showNotification('周期名称已存在', 'error');
                return;
            }
            
            // 更新周期名称
            const index = config.cycles.indexOf(oldCycle);
            config.cycles[index] = newCycle.trim();
            
            // 更新文档映射
            if (config.documents[oldCycle]) {
                config.documents[newCycle.trim()] = config.documents[oldCycle];
                delete config.documents[oldCycle];
            }
            
            renderCycleEditor(config.cycles, config.documents);
            showNotification('周期修改成功', 'success');
        }
    );
};

/**
 * 编辑周期文档需求
 */
window.editCycleDocuments = function(cycle) {
    // 打开文档需求编辑模态框
    openCycleDocumentEditor(cycle);
};

/**
 * 删除周期
 */
window.deleteCycle = function(cycle) {
    showConfirmModal(
        '确认删除',
        `确定要删除周期"${cycle}"吗？该操作不可恢复。`,
        () => {
            const config = appState.projectConfig;
            
            // 移除周期
            config.cycles = config.cycles.filter(c => c !== cycle);
            
            // 移除文档映射
            delete config.documents[cycle];
            
            renderCycleEditor(config.cycles, config.documents);
            showNotification('周期删除成功', 'success');
        }
    );
};

/**
 * 打开周期文档编辑器（支持目录树结构）
 */
function openCycleDocumentEditor(cycle) {
    let modal = document.getElementById('cycleDocumentEditorModal');
    
    // 动态创建模态框（如果不存在）
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cycleDocumentEditorModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 750px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;">编辑周期内容</h3>
                    <button class="close-btn" onclick="document.getElementById('cycleDocumentEditorModal').classList.remove('show')" style="background:none;border:none;font-size:20px;cursor:pointer;">&times;</button>
                </div>
                <div class="modal-body" style="padding: 15px;">
                    <p style="margin-bottom:10px;color:#666;">当前周期: <strong id="cycleDocEditorCycleName"></strong></p>
                    <div style="margin-bottom:10px;display:flex;gap:8px;">
                        <button class="btn btn-sm btn-primary" onclick="addCycleDocument()" title="添加文档">➕ 添加文档</button>
                        <button class="btn btn-sm btn-info" onclick="addCycleFolder()" title="添加目录">📁 添加目录</button>
                    </div>
                    <div id="documentListEditor" style="border:1px solid #eee;border-radius:4px;padding:10px;min-height:100px;">
                    </div>
                    <div class="tree-editor-help" style="background:#fff3cd;color:#856404;padding:6px 10px;border-radius:4px;margin-top:10px;">
                        <small>💡 提示：📄 表示文档项，📁 表示目录，目录下可包含文档和子目录</small>
                    </div>
                </div>
                <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:10px;padding:10px 15px;">
                    <button class="btn btn-success" onclick="saveCycleDocuments()">💾 保存</button>
                    <button class="btn" onclick="document.getElementById('cycleDocumentEditorModal').classList.remove('show')">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // 设置当前编辑的周期
    modal.dataset.currentCycle = cycle;
    const cycleNameEl = document.getElementById('cycleDocEditorCycleName');
    if (cycleNameEl) cycleNameEl.textContent = cycle;
    
    // 加载文档需求
    const config = appState.projectConfig;
    const docs = config.documents[cycle]?.required_docs || [];
    
    // 渲染树形结构
    const container = document.getElementById('documentListEditor');
    if (container) {
        container.innerHTML = renderDocTreeItems(docs, '', []);
    }
    
    openModal(modal);
}

/**
 * 递归渲染文档树条目
 * @param {Array} items - 条目数组
 * @param {string} parentPath - 父路径（用 . 分隔的索引）
 * @param {Array} pathStack - 路径栈
 */
function renderDocTreeItems(items, parentPath, pathStack) {
    if (!items || items.length === 0) return '';
    
    let html = '';
    items.forEach((item, index) => {
        const itemData = typeof item === 'object' && item !== null ? item : { name: item };
        const isFolder = itemData.type === 'folder';
        const itemName = itemData.name || item || '';
        const currentPath = parentPath ? `${parentPath}.${index}` : `${index}`;
        const indent = pathStack.length * 24;
        const icon = isFolder ? '📁' : '📄';
        const typeClass = isFolder ? 'doc-tree-folder' : 'doc-tree-document';
        
        html += `
            <div class="doc-tree-item ${typeClass}" data-path="${currentPath}" data-type="${isFolder ? 'folder' : 'document'}" style="margin-left:${indent}px;display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f0f0f0;">
                <span class="doc-tree-icon">${icon}</span>
                <input type="text" class="doc-name-input" value="${escapeHtml(itemName)}" placeholder="${isFolder ? '目录名称' : '文档名称'}" style="flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;">
                <button class="btn btn-sm btn-danger" onclick="removeCycleTreeItem('${currentPath}')" title="删除">🗑️</button>
            </div>`;
        
        // 递归渲染子条目
        if (itemData.children && itemData.children.length > 0) {
            html += renderDocTreeItems(itemData.children, currentPath, [...pathStack, index]);
        }
    });
    
    return html;
}

/**
 * 添加文档到周期（在根级）
 */
window.addCycleDocument = function() {
    const container = document.getElementById('documentListEditor');
    if (!container) return;
    
    const existingItems = container.querySelectorAll('.doc-tree-item');
    const newIndex = existingItems.length;
    const newPath = `${newIndex}`;
    
    const item = document.createElement('div');
    item.className = 'doc-tree-item doc-tree-document';
    item.dataset.path = newPath;
    item.dataset.type = 'document';
    item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f0f0f0;';
    item.innerHTML = `
        <span class="doc-tree-icon">📄</span>
        <input type="text" class="doc-name-input" value="" placeholder="文档名称" style="flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;">
        <button class="btn btn-sm btn-danger" onclick="removeCycleTreeItem('${newPath}')" title="删除">🗑️</button>
    `;
    
    container.appendChild(item);
    // 聚焦到新输入框
    const input = item.querySelector('.doc-name-input');
    if (input) setTimeout(() => input.focus(), 100);
};

/**
 * 添加目录到周期（在根级）
 */
window.addCycleFolder = function() {
    const container = document.getElementById('documentListEditor');
    if (!container) return;
    
    const existingItems = container.querySelectorAll('.doc-tree-item');
    const newIndex = existingItems.length;
    const newPath = `${newIndex}`;
    
    const item = document.createElement('div');
    item.className = 'doc-tree-item doc-tree-folder';
    item.dataset.path = newPath;
    item.dataset.type = 'folder';
    item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f0f0f0;';
    item.innerHTML = `
        <span class="doc-tree-icon">📁</span>
        <input type="text" class="doc-name-input" value="" placeholder="目录名称" style="flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;">
        <button class="btn btn-sm btn-danger" onclick="removeCycleTreeItem('${newPath}')" title="删除">🗑️</button>
    `;
    
    container.appendChild(item);
    const input = item.querySelector('.doc-name-input');
    if (input) setTimeout(() => input.focus(), 100);
};

/**
 * 删除树中的条目
 */
window.removeCycleTreeItem = function(path) {
    const container = document.getElementById('documentListEditor');
    if (!container) return;
    
    const item = container.querySelector(`.doc-tree-item[data-path="${path}"]`);
    if (!item) return;
    
    // 找到所有以该路径为前缀的子条目
    const prefix = path + '.';
    const children = container.querySelectorAll(`.doc-tree-item[data-path^="${prefix}"]`);
    
    // 删除子条目
    children.forEach(child => child.remove());
    // 删除自身
    item.remove();
};

/**
 * 保存周期文档需求（支持目录树结构）
 */
window.saveCycleDocuments = function() {
    const modal = document.getElementById('cycleDocumentEditorModal');
    if (!modal) return;
    
    const cycle = modal.dataset.currentCycle;
    const container = document.getElementById('documentListEditor');
    if (!container) return;
    
    // 获取现有的文档数据（包含attributes等属性）
    const config = appState.projectConfig;
    const existingDocs = config.documents[cycle]?.required_docs || [];
    
    // 构建索引映射：按名称查找现有条目
    function buildExistingMap(items) {
        const map = {};
        for (const item of items) {
            const itemData = typeof item === 'object' && item !== null ? item : { name: item };
            const key = itemData.name || item;
            map[key] = itemData;
        }
        return map;
    }
    const existingMap = buildExistingMap(existingDocs);
    
    // 收集顶层条目（data-path 不含 .）
    const topItems = container.querySelectorAll('.doc-tree-item:not([data-path*="."])');
    
    function collectItem(itemEl) {
        const path = itemEl.dataset.path;
        const type = itemEl.dataset.type || 'document';
        const input = itemEl.querySelector('.doc-name-input');
        const name = input ? input.value.trim() : '';
        
        if (!name) return null;
        
        const existing = existingMap[name];
        
        let result;
        if (type === 'folder') {
            // 目录：保留原有属性，收集子条目
            result = {
                type: 'folder',
                name: name,
                attributes: (existing && existing.attributes) ? existing.attributes : {},
                filename_template: (existing && existing.filename_template) ? existing.filename_template : '',
                match_keywords: (existing && existing.match_keywords) ? existing.match_keywords : [],
                exclude_keywords: (existing && existing.exclude_keywords) ? existing.exclude_keywords : [],
                children: []
            };
            
            // 收集子条目（path 以当前 path. 开头且下一级深度相同）
            const childPrefix = path + '.';
            const childItems = container.querySelectorAll(`.doc-tree-item[data-path^="${childPrefix}"]`);
            // 只取直接子级（路径中只有一个点号在 childPrefix 之后）
            const directChildren = Array.from(childItems).filter(el => {
                const subPath = el.dataset.path.substring(childPrefix.length);
                return !subPath.includes('.');
            });
            
            for (const childEl of directChildren) {
                const childResult = collectItem(childEl);
                if (childResult) result.children.push(childResult);
            }
        } else {
            // 文档
            if (existing && typeof existing === 'object') {
                result = {
                    ...existing,
                    name: name
                };
            } else {
                result = { name: name };
            }
            
            // 收集子目录
            const childPrefix = path + '.';
            const childItems = container.querySelectorAll(`.doc-tree-item[data-path^="${childPrefix}"]`);
            const directChildren = Array.from(childItems).filter(el => {
                const subPath = el.dataset.path.substring(childPrefix.length);
                return !subPath.includes('.');
            });
            
            if (directChildren.length > 0) {
                if (!result.children) result.children = [];
                for (const childEl of directChildren) {
                    const childResult = collectItem(childEl);
                    if (childResult) result.children.push(childResult);
                }
            }
        }
        
        return result;
    }
    
    const docs = [];
    for (const itemEl of topItems) {
        const item = collectItem(itemEl);
        if (item) docs.push(item);
    }
    
    // 更新配置
    if (!config.documents[cycle]) {
        config.documents[cycle] = { required_docs: [], uploaded_docs: [] };
    }
    config.documents[cycle].required_docs = docs;
    
    modal.classList.remove('show');
    renderCycleEditor(config.cycles, config.documents);
    showNotification('保存成功', 'success');
};

/**
 * 保存需求配置
 */
export async function saveRequirementConfig() {
    const config = appState.projectConfig;
    if (!config) {
        showNotification('配置加载失败', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('配置保存成功', 'success');
            closeRequirementEditor();
            
            // 刷新主界面
            renderCycles(config.cycles || []);
            renderInitialContent();
        } else {
            showNotification('保存失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('保存配置失败:', error);
        showNotification('保存失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 保存为模板
 */
export async function saveAsTemplate() {
    const config = appState.projectConfig;
    if (!config) {
        showNotification('配置加载失败', 'error');
        return;
    }
    
    // 打开保存模板模态框
    const modal = document.getElementById('saveTemplateModal');
    if (modal) {
        openModal(modal);
    }
}

/**
 * 执行保存模板
 */
export async function handleSaveTemplate(e) {
    e.preventDefault();
    
    const templateName = document.getElementById('templateName')?.value.trim();
    const description = document.getElementById('templateDescription')?.value.trim();
    
    if (!templateName) {
        showNotification('请输入模板名称', 'error');
        return;
    }
    
    const config = appState.projectConfig;
    
    // 复制并清理模板数据，删除匹配文件信息
    const templateData = {
        cycles: config.cycles || [],
        documents: {}
    };
    
    // 清理documents，删除uploaded_docs等匹配文件信息
    const originalDocuments = config.documents || {};
    for (const cycle in originalDocuments) {
        const cycleData = originalDocuments[cycle];
        templateData.documents[cycle] = {
            required_docs: cycleData.required_docs || [],
            categories: cycleData.categories || {}
            // 故意不包含uploaded_docs，避免隐私泄露
        };
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/projects/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_name: templateName,
                template_data: templateData,
                description: description
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('模板保存成功', 'success');
            closeModal(document.getElementById('saveTemplateModal'));
        } else {
            showNotification('保存失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('保存模板失败:', error);
        showNotification('保存失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 打开模板库
 */
export async function openTemplateLibrary() {
    const modal = document.getElementById('templateLibraryModal');
    if (!modal) return;
    
    openModal(modal);
    
    // 加载模板列表
    await loadTemplateList();
}

/**
 * 加载模板列表
 */
async function loadTemplateList() {
    const container = document.getElementById('templateListContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    try {
        const response = await fetch('/api/projects/templates');
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '加载失败');
        }
        
        const templates = result.templates || [];
        
        if (templates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>暂无模板，请先保存需求为模板</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = templates.map(template => `
            <div class="template-item" data-id="${template.id}">
                <div class="template-info">
                    <h4>${template.name}</h4>
                    <p class="template-meta">
                        周期: ${template.cycle_count} | 文档: ${template.document_count}
                    </p>
                    <p class="template-desc">${template.description || '无描述'}</p>
                </div>
                <div class="template-actions">
                    <button class="btn btn-sm btn-primary" onclick="applyTemplate('${template.id}')">应用模板</button>
                    <button class="btn btn-sm btn-secondary" onclick="previewTemplate('${template.id}')">预览</button>
                    <button class="btn btn-sm btn-info" onclick="exportTemplate('${template.id}')">导出</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTemplate('${template.id}')">删除</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载模板列表失败:', error);
        container.innerHTML = `<div class="error-state">加载失败: ${error.message}</div>`;
    }
}

/**
 * 应用模板
 */
window.applyTemplate = async function(templateId) {
    showConfirmModal(
        '确认应用',
        '应用模板将覆盖当前配置，确定要继续吗？',
        async () => {
            showLoading(true);
            try {
                const response = await fetch(`/api/projects/${appState.currentProjectId}/apply-template/${templateId}`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    showNotification('模板应用成功', 'success');
                    
                    // 更新状态
                    appState.projectConfig = result.config;
                    
                    // 关闭模态框
                    closeModal(document.getElementById('templateLibraryModal'));
                    closeRequirementEditor();
                    
                    // 刷新主界面
                    renderCycles(result.config.cycles || []);
                    renderInitialContent();
                } else {
                    showNotification('应用失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('应用模板失败:', error);
                showNotification('应用失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
};

/**
 * 预览模板
 */
window.previewTemplate = async function(templateId) {
    showLoading(true);
    try {
        const response = await fetch(`/api/projects/templates/${templateId}`);
        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || '加载失败');
        }
        
        const template = result.template;
        
        // 显示预览
        const container = document.getElementById('templatePreviewContent');
        if (container) {
            container.innerHTML = `
                <h3>${template.name}</h3>
                <p><strong>描述:</strong> ${template.description || '无'}</p>
                <h4>周期列表</h4>
                <ul>
                    ${template.cycles.map(c => `<li>${c}</li>`).join('')}
                </ul>
                <h4>文档需求</h4>
                ${template.cycles.map(cycle => `
                    <div>
                        <strong>${cycle}:</strong>
                        <ul>
                            ${(template.documents[cycle]?.required_docs || []).map(doc => `<li>${doc}</li>`).join('')}
                        </ul>
                    </div>
                `).join('')}
            `;
        }
        
        const modal = document.getElementById('templatePreviewModal');
        if (modal) {
            openModal(modal);
        }
        
    } catch (error) {
        console.error('预览模板失败:', error);
        showNotification('预览失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * 删除模板
 */
window.deleteTemplate = async function(templateId) {
    showConfirmModal(
        '确认删除',
        '确定要删除该模板吗？此操作不可恢复。',
        async () => {
            showLoading(true);
            try {
                const response = await fetch(`/api/projects/templates/${templateId}`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    showNotification('模板删除成功', 'success');
                    await loadTemplateList();
                } else {
                    showNotification('删除失败: ' + result.message, 'error');
                }
            } catch (error) {
                console.error('删除模板失败:', error);
                showNotification('删除失败: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    );
};

/**
 * 导出模板为JSON文件
 */
window.exportTemplate = function(templateId) {
    // 直接通过浏览器下载
    window.location.href = `/api/projects/templates/${templateId}/export`;
};

/**
 * 打开导入模板模态框
 */
export function openImportTemplateModal() {
    const modal = document.getElementById('importTemplateModal');
    if (!modal) return;
    
    // 重置表单
    const form = document.getElementById('importTemplateForm');
    if (form) form.reset();
    
    // 清空预览
    const preview = document.getElementById('importTemplatePreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
    
    openModal(modal);
}

/**
 * 关闭导入模板模态框
 */
export function closeImportTemplateModal() {
    const modal = document.getElementById('importTemplateModal');
    if (modal) {
        closeModal(modal);
    }
}

/**
 * 监听导入模板文件变化，预览内容
 */
window.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('importTemplateFile');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const preview = document.getElementById('importTemplatePreview');
            const nameInput = document.getElementById('importTemplateName');
            
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    // 显示预览
                    if (preview) {
                        const cycleCount = data.cycles?.length || 0;
                        const documents = data.documents || {};
                        
                        // 统计文档数量和附加要求
                        let docCount = 0;
                        let docsWithAttrs = 0;
                        let customAttrDocs = 0;
                        const attrSummary = {
                            party_a_sign: 0,
                            party_b_sign: 0,
                            party_a_seal: 0,
                            party_b_seal: 0,
                            need_doc_number: 0,
                            need_doc_date: 0,
                            need_sign_date: 0
                        };
                        const standardAttrs = new Set(Object.keys(attrSummary));
                        
                        for (const cycleData of Object.values(documents)) {
                            if (cycleData && typeof cycleData === 'object' && 'required_docs' in cycleData) {
                                for (const doc of cycleData.required_docs || []) {
                                    docCount++;
                                    const attrs = doc.attributes || {};
                                    // 检查是否有任何附加要求
                                    const hasStandardAttr = standardAttrs.has && Object.keys(attrs).some(k => standardAttrs.has(k) && attrs[k]);
                                    const hasCustomAttr = Object.keys(attrs).some(k => !standardAttrs.has(k) && attrs[k]);
                                    if (hasStandardAttr) docsWithAttrs++;
                                    if (hasCustomAttr) customAttrDocs++;
                                    
                                    // 统计每种附加要求
                                    for (const [key, count] of Object.entries(attrSummary)) {
                                        if (attrs[key]) attrSummary[key]++;
                                    }
                                }
                            }
                        }
                        
                        // 收集自定义属性定义
                        const customDefs = data.custom_attribute_definitions || [];
                        
                        // 构建附加要求预览HTML
                        const activeAttrs = Object.entries(attrSummary)
                            .filter(([_, count]) => count > 0)
                            .map(([key, count]) => {
                                const labels = {
                                    party_a_sign: '甲方签字',
                                    party_b_sign: '乙方签字',
                                    party_a_seal: '甲方盖章',
                                    party_b_seal: '乙方盖章',
                                    need_doc_number: '发文号',
                                    need_doc_date: '文档日期',
                                    need_sign_date: '签字日期'
                                };
                                return `<span class="attr-badge" title="${labels[key]}">${labels[key]}: ${count}</span>`;
                            });
                        
                        let attrHtml = '';
                        if (activeAttrs.length > 0 || customDefs.length > 0 || docsWithAttrs > 0) {
                            attrHtml = `
                                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                                    <strong>附加要求统计:</strong>
                                    <div style="margin-top: 4px;">
                                        ${docsWithAttrs > 0 ? `<span class="attr-badge info">含附加要求文档: ${docsWithAttrs}</span>` : ''}
                                        ${customAttrDocs > 0 ? `<span class="attr-badge warning">含自定义属性: ${customAttrDocs}</span>` : ''}
                                        ${activeAttrs.join('')}
                                        ${customDefs.length > 0 ? `<span class="attr-badge">自定义属性定义: ${customDefs.length}</span>` : ''}
                                    </div>
                                </div>
                            `;
                        }
                        
                        preview.innerHTML = `
                            <p><strong>周期数:</strong> ${cycleCount} | <strong>文档数:</strong> ${docCount}</p>
                            ${attrHtml}
                            <details style="margin-top: 8px;">
                                <summary>周期列表</summary>
                                <ul style="margin: 5px 0; padding-left: 20px;">
                                    ${(data.cycles || []).map(c => `<li>${c}</li>`).join('')}
                                </ul>
                            </details>
                        `;
                        preview.style.display = 'block';
                    }
                    
                    // 自动填入名称（如果用户没有修改过）
                    if (nameInput && !nameInput.dataset.userEdited) {
                        nameInput.value = data.name || '';
                    }
                } catch (err) {
                    showNotification('JSON格式解析失败', 'error');
                    if (preview) preview.style.display = 'none';
                }
            };
            reader.readAsText(file);
        });
        
        // 标记用户是否编辑过名称
        const nameInput = document.getElementById('importTemplateName');
        if (nameInput) {
            nameInput.addEventListener('input', function() {
                nameInput.dataset.userEdited = 'true';
            });
        }
    }
    
    // 监听导入表单提交
    const form = document.getElementById('importTemplateForm');
    if (form) {
        form.addEventListener('submit', handleImportTemplate);
    }
});

/**
 * 处理导入模板提交
 */
async function handleImportTemplate(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('importTemplateFile');
    const nameInput = document.getElementById('importTemplateName');
    const descInput = document.getElementById('importTemplateDescription');
    
    const file = fileInput?.files[0];
    const name = nameInput?.value.trim();
    const description = descInput?.value.trim();
    
    if (!file) {
        showNotification('请选择JSON文件', 'error');
        return;
    }
    
    if (!name) {
        showNotification('请输入模板名称', 'error');
        return;
    }
    
    showLoading(true);
    try {
        // 读取文件内容
        const fileContent = await file.text();
        let templateData;
        
        // 检查JSON语法
        try {
            templateData = JSON.parse(fileContent);
        } catch (jsonError) {
            showNotification(`JSON语法错误: ${jsonError.message}`, 'error');
            showLoading(false);
            return;
        }
        
        // 调用导入API
        const response = await fetch('/api/projects/templates/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                description: description,
                template_data: templateData
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // 构建成功消息，包含附加要求统计
            let successMsg = '模板导入成功';
            if (result.custom_attributes_count > 0) {
                successMsg += `（含 ${result.custom_attributes_count} 个自定义属性定义）`;
            }
            if (result.docs_with_attributes > 0) {
                successMsg += `，${result.docs_with_attributes} 个文档包含附加要求`;
                if (result.docs_with_custom_attrs > 0) {
                    successMsg += `（其中 ${result.docs_with_custom_attrs} 个含自定义属性）`;
                }
            }
            showNotification(successMsg, 'success');
            closeImportTemplateModal();
            
            // 刷新模板列表
            await loadTemplateList();
        } else {
            // 显示详细的验证错误
            const errorMsg = result.validation_error || result.message;
            showNotification(`导入失败: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('导入模板失败:', error);
        showNotification('导入失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 全局绑定
window.closeImportTemplateModal = closeImportTemplateModal;
