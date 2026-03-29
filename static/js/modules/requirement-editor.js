/**
 * 文档需求编辑器模块
 */

import { appState } from './app-state.js';
import { showNotification, showLoading, showConfirmModal, openModal, closeModal } from './ui.js';
import { renderCycles, renderInitialContent } from './cycle.js';

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
    
    container.innerHTML = cycles.map((cycle, index) => `
        <div class="cycle-edit-item" data-cycle="${cycle}">
            <div class="cycle-header">
                <h4 class="cycle-name">${cycle}</h4>
                <div class="cycle-actions">
                    <button class="btn btn-sm btn-primary" onclick="editCycle('${cycle}')">编辑周期</button>
                    <button class="btn btn-sm btn-secondary" onclick="editCycleDocuments('${cycle}')">编辑文档需求</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCycle('${cycle}')">删除周期</button>
                </div>
            </div>
            <div class="cycle-info">
                <span>文档需求: ${documents[cycle]?.required_docs?.length || 0} 项</span>
            </div>
        </div>
    `).join('');
}

/**
 * 添加新周期
 */
export function addNewCycle() {
    const cycleName = prompt('请输入周期名称：');
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

/**
 * 编辑周期名称
 */
window.editCycle = function(oldCycle) {
    const newCycle = prompt('请输入新的周期名称：', oldCycle);
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
 * 打开周期文档编辑器
 */
function openCycleDocumentEditor(cycle) {
    const modal = document.getElementById('cycleDocumentEditorModal');
    if (!modal) return;
    
    // 设置当前编辑的周期
    modal.dataset.currentCycle = cycle;
    
    // 加载文档需求
    const config = appState.projectConfig;
    const docs = config.documents[cycle]?.required_docs || [];
    
    const container = document.getElementById('documentListEditor');
    if (container) {
        container.innerHTML = docs.map((doc, index) => {
            // 兼容字符串格式和对象格式
            const docName = typeof doc === 'object' ? doc.name : doc;
            return `
            <div class="document-edit-item" data-index="${index}">
                <input type="text" class="doc-name-input" value="${docName}" placeholder="文档名称">
                <button class="btn btn-sm btn-danger" onclick="removeDocument(${index})">删除</button>
            </div>
        `}).join('');
    }
    
    openModal(modal);
}

/**
 * 添加文档需求
 */
export function addDocument() {
    const container = document.getElementById('documentListEditor');
    if (!container) return;
    
    const newIndex = container.children.length;
    
    const item = document.createElement('div');
    item.className = 'document-edit-item';
    item.dataset.index = newIndex;
    item.innerHTML = `
        <input type="text" class="doc-name-input" value="" placeholder="文档名称">
        <button class="btn btn-sm btn-danger" onclick="removeDocument(${newIndex})">删除</button>
    `;
    
    container.appendChild(item);
}

/**
 * 删除文档需求
 */
window.removeDocument = function(index) {
    const container = document.getElementById('documentListEditor');
    if (!container) return;
    
    const item = container.querySelector(`[data-index="${index}"]`);
    if (item) {
        item.remove();
    }
};

/**
 * 保存周期文档需求
 */
export function saveCycleDocuments() {
    const modal = document.getElementById('cycleDocumentEditorModal');
    if (!modal) return;
    
    const cycle = modal.dataset.currentCycle;
    const container = document.getElementById('documentListEditor');
    if (!container) return;
    
    // 获取现有的文档数据（包含attributes等属性）
    const config = appState.projectConfig;
    const existingDocs = config.documents[cycle]?.required_docs || [];
    
    // 收集文档列表，同时保留原有属性
    const inputs = container.querySelectorAll('.doc-name-input');
    const docs = Array.from(inputs)
        .map((input, index) => {
            const name = input.value.trim();
            if (!name) return null;
            
            // 查找同名的现有文档，保留其属性
            const existingDoc = existingDocs.find(d => {
                const existingName = typeof d === 'object' ? d.name : d;
                return existingName === name;
            });
            
            if (existingDoc && typeof existingDoc === 'object') {
                // 保留原有文档的所有属性，只更新名称
                return {
                    ...existingDoc,
                    name: name
                };
            }
            
            // 新文档，只返回名称
            return name;
        })
        .filter(v => v);
    
    // 更新配置
    if (!config.documents[cycle]) {
        config.documents[cycle] = { required_docs: [], uploaded_docs: [] };
    }
    config.documents[cycle].required_docs = docs;
    
    closeModal(modal);
    renderCycleEditor(config.cycles, config.documents);
    showNotification('文档需求保存成功', 'success');
}

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
