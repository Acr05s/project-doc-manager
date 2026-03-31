/**
 * 图形化树形编辑器模块
 * 支持节点的增删改、层次结构调整、目录节点、文档附加属性
 * 支持自动保存（防抖 + localStorage + 服务端草稿）
 * 支持文件名模板、匹配关键词
 */

import { appState } from './app-state.js';
import { showNotification, showLoading, openModal, closeModal, showConfirmModal } from './ui.js';
import { renderCycles, renderInitialContent } from './cycle.js';

let currentTreeData = null;
let selectedNode = null;
let selectedNodes = [];  // 支持多选
let lastSelectedNode = null;  // 用于Shift范围选择
let autoSaveTimer = null;
let hasUnsavedChanges = false;
let lastSaveTime = null;

// ==================== 默认附加属性模板 ====================

const DEFAULT_DOC_ATTRIBUTES = {
    party_a_sign: false,
    party_b_sign: false,
    party_a_seal: false,
    party_b_seal: false,
    need_doc_number: false,
    need_doc_date: false,
    need_sign_date: false
};

const ATTRIBUTE_LABELS = {
    party_a_sign: '甲方签字',
    party_b_sign: '乙方签字',
    party_a_seal: '甲方盖章',
    party_b_seal: '乙方盖章',
    need_doc_number: '发文号',
    need_doc_date: '文档日期',
    need_sign_date: '签字日期'
};

// 自定义属性定义存储
let customAttributeDefinitions = [];

// ==================== 自动保存 ====================

const AUTOSAVE_INTERVAL = 30000;  // 30秒自动保存一次
const AUTOSAVE_DEBOUNCE = 2000;   // 修改后2秒触发一次

/**
 * 标记数据已修改，启动防抖自动保存
 */
function markDirty() {
    hasUnsavedChanges = true;
    updateAutoSaveStatus('unsaved');
    
    // 防抖：2秒后自动保存到 localStorage
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        saveDraftToLocal();
    }, AUTOSAVE_DEBOUNCE);
}

/**
 * 保存草稿到 localStorage（快速，离线安全）
 */
function saveDraftToLocal() {
    if (!currentTreeData || !appState.currentProjectId) return;
    
    const key = `treeEditor_draft_${appState.currentProjectId}`;
    const draft = {
        treeData: currentTreeData,
        customAttributeDefinitions: customAttributeDefinitions,
        savedTime: new Date().toISOString(),
        selectedNode: selectedNode
    };
    
    try {
        localStorage.setItem(key, JSON.stringify(draft));
        lastSaveTime = draft.savedTime;
        updateAutoSaveStatus('saved', draft.savedTime);
    } catch (e) {
        console.warn('localStorage 保存失败:', e);
    }
    
    // 同时异步保存到服务端
    saveDraftToServer();
}

/**
 * 异步保存草稿到服务端
 */
async function saveDraftToServer() {
    if (!currentTreeData || !appState.currentProjectId) return;
    
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}/draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tree_data: currentTreeData,
                custom_attribute_definitions: customAttributeDefinitions
            })
        });
        const result = await response.json();
        if (result.status === 'success') {
            console.log('服务端草稿已保存:', result.saved_time);
        }
    } catch (e) {
        // 静默失败，localStorage 已经保存了
        console.warn('服务端草稿保存失败:', e);
    }
}

/**
 * 从 localStorage 加载草稿
 */
function loadDraftFromLocal() {
    if (!appState.currentProjectId) return null;
    
    const key = `treeEditor_draft_${appState.currentProjectId}`;
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('localStorage 读取失败:', e);
    }
    return null;
}

/**
 * 清除草稿
 */
function clearDrafts() {
    if (!appState.currentProjectId) return;
    
    const key = `treeEditor_draft_${appState.currentProjectId}`;
    localStorage.removeItem(key);
    
    // 异步清除服务端草稿
    fetch(`/api/projects/${appState.currentProjectId}/draft`, { method: 'DELETE' })
        .catch(() => {});
    
    hasUnsavedChanges = false;
    lastSaveTime = null;
}

/**
 * 启动定时自动保存
 */
function startAutoSave() {
    stopAutoSave();
    setInterval(() => {
        if (hasUnsavedChanges && currentTreeData) {
            saveDraftToLocal();
        }
    }, AUTOSAVE_INTERVAL);
}

function stopAutoSave() {
    // 通过标记清除旧 interval（简单方案）
}

/**
 * 更新自动保存状态 UI
 */
function updateAutoSaveStatus(state, time) {
    const el = document.getElementById('autoSaveStatus');
    if (!el) return;
    
    const timeStr = time ? new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    
    switch (state) {
        case 'unsaved':
            el.innerHTML = '<span class="autosave-dot unsaved"></span> 有未保存的修改';
            el.className = 'autosave-status unsaved';
            break;
        case 'saving':
            el.innerHTML = '<span class="autosave-dot saving"></span> 正在保存...';
            el.className = 'autosave-status saving';
            break;
        case 'saved':
            el.innerHTML = `<span class="autosave-dot saved"></span> 已自动保存 ${timeStr}`;
            el.className = 'autosave-status saved';
            break;
        case 'draft-found':
            el.innerHTML = '<span class="autosave-dot draft"></span> 检测到未完成的编辑草稿';
            el.className = 'autosave-status draft';
            break;
    }
}

/**
 * 检测是否有未恢复的草稿，如果有则询问是否恢复
 */
async function checkForDraft() {
    if (!appState.currentProjectId) return false;
    
    // 先检查 localStorage
    const localDraft = loadDraftFromLocal();
    
    // 再检查服务端
    let serverDraft = null;
    try {
        const response = await fetch(`/api/projects/${appState.currentProjectId}/draft`);
        const result = await response.json();
        if (result.status === 'success' && result.draft) {
            serverDraft = result.draft;
        }
    } catch (e) {
        // 忽略
    }
    
    // 取较新的草稿
    let bestDraft = null;
    let bestSource = null;
    
    if (localDraft && serverDraft) {
        const localTime = new Date(localDraft.savedTime).getTime();
        const serverTime = new Date(serverDraft.saved_time).getTime();
        bestDraft = localTime > serverTime ? localDraft : serverDraft;
        bestSource = localTime > serverTime ? 'localStorage' : '服务端';
    } else if (localDraft) {
        bestDraft = localDraft;
        bestSource = 'localStorage';
    } else if (serverDraft) {
        bestDraft = serverDraft;
        bestSource = '服务端';
    }
    
    if (!bestDraft) return false;
    
    return new Promise((resolve) => {
        const draftTime = bestDraft.savedTime || bestDraft.saved_time;
        const timeStr = new Date(draftTime).toLocaleString('zh-CN');
        
        showConfirmModal(
            '发现未保存的草稿',
            `在 ${timeStr}（${bestSource}）发现未完成的编辑草稿。\n是否恢复上次的编辑？\n\n点击"取消"将丢弃草稿使用当前配置。`,
            () => {
                // 恢复草稿
                if (bestDraft.treeData) {
                    currentTreeData = bestDraft.treeData;
                    if (bestDraft.customAttributeDefinitions) {
                        customAttributeDefinitions = bestDraft.customAttributeDefinitions;
                    }
                    if (bestDraft.selectedNode) {
                        selectedNode = bestDraft.selectedNode;
                    }
                } else if (bestDraft.tree_data) {
                    currentTreeData = bestDraft.tree_data;
                    if (bestDraft.custom_attribute_definitions) {
                        customAttributeDefinitions = bestDraft.custom_attribute_definitions;
                    }
                }
                renderTree();
                if (selectedNode) selectNode(selectedNode);
                updateToolbarState();
                markDirty();
                showNotification('草稿已恢复', 'success');
                resolve(true);
            },
            () => {
                // 丢弃草稿
                clearDrafts();
                resolve(false);
            }
        );
    });
}

// ==================== 打开/关闭编辑器 ====================

export async function openTreeEditor() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }

    const modal = document.getElementById('treeEditorModal');
    if (!modal) {
        console.error('找不到树形编辑器模态框');
        return;
    }

    openModal(modal);
    
    // 初始化编辑器数据
    const config = appState.projectConfig;
    if (!config) {
        showNotification('项目配置加载失败', 'error');
        return;
    }

    currentTreeData = buildTreeData(config);
    hasUnsavedChanges = false;
    
    // 检查是否有草稿
    const hasDraft = await checkForDraft();
    
    if (!hasDraft) {
        renderTree();
        updateToolbarState();
    }
    
    // 绑定展开全部和折叠全部按钮事件
    const toolbarExpandAll = document.getElementById('toolbarExpandAll');
    if (toolbarExpandAll) {
        console.log('[TreeEditor] 绑定展开全部按钮事件');
        toolbarExpandAll.onclick = function() {
            console.log('[TreeEditor] 展开全部按钮被点击');
            expandAll();
        };
    }
    
    const toolbarCollapseAll = document.getElementById('toolbarCollapseAll');
    if (toolbarCollapseAll) {
        console.log('[TreeEditor] 绑定折叠全部按钮事件');
        toolbarCollapseAll.onclick = function() {
            console.log('[TreeEditor] 折叠全部按钮被点击');
            collapseAll();
        };
    }
    
    startAutoSave();
}

export function closeTreeEditor() {
    const modal = document.getElementById('treeEditorModal');
    if (modal) {
        if (hasUnsavedChanges) {
            // 关闭前先保存草稿
            saveDraftToLocal();
            showNotification('编辑内容已自动保存为草稿，下次打开可恢复', 'info');
        }
        closeModal(modal);
    }
    selectedNode = null;
    hasUnsavedChanges = false;
}

// ==================== 初始化与数据构建 ====================

/**
 * 从项目配置构建树形数据
 * 兼容旧格式（required_docs 为字符串数组）和新格式（对象数组）
 * 同时从 categories 中读取目录数据
 */
function buildTreeData(config) {
    const tree = {
        id: 'root',
        name: '项目配置',
        type: 'root',
        expanded: true,
        children: []
    };

    // 加载自定义属性定义
    console.log('[buildTreeData] config.custom_attribute_definitions:', config.custom_attribute_definitions);
    if (config.custom_attribute_definitions && Array.isArray(config.custom_attribute_definitions)) {
        customAttributeDefinitions = config.custom_attribute_definitions;
    } else {
        customAttributeDefinitions = [];
    }
    console.log('[buildTreeData] customAttributeDefinitions:', customAttributeDefinitions);

    const cycles = config.cycles || [];
    const documents = config.documents || {};

    cycles.forEach((cycle, index) => {
        const cycleNode = {
            id: `cycle_${index}`,
            name: cycle,
            type: 'cycle',
            expanded: true,
            children: []
        };

        const cycleDocs = documents[cycle] || {};
        const requiredDocs = cycleDocs.required_docs || [];
        const categories = cycleDocs.categories || {};

        requiredDocs.forEach((doc, docIndex) => {
            // 兼容旧格式（字符串）和新格式（对象）
            const docData = typeof doc === 'object' && doc !== null ? doc : { name: doc };
            const docId = `doc_${index}_${docIndex}`;

            const docNode = {
                id: docId,
                name: docData.name || doc,
                type: 'document',
                expanded: false,
                children: [],
                attributes: { ...DEFAULT_DOC_ATTRIBUTES, ...(docData.attributes || {}) },
                doc_note: docData.doc_note || '',
                // 新增：文件名模板和匹配关键词
                filename_template: docData.filename_template || '',
                match_keywords: docData.match_keywords || []
            };

            // 支持目录子节点（从 children 中读取）
            if (docData.children && Array.isArray(docData.children)) {
                docData.children.forEach((child, childIdx) => {
                    if (child.type === 'folder') {
                        const folderNode = {
                            id: `folder_${index}_${docIndex}_${childIdx}`,
                            name: child.name || '新目录',
                            type: 'folder',
                            expanded: false,
                            children: [],
                            attributes: child.attributes || {},
                            filename_template: child.filename_template || '',
                            match_keywords: child.match_keywords || []
                        };
                        // 文件夹的子文件
                        if (child.files && Array.isArray(child.files)) {
                            child.files.forEach((file, fileIdx) => {
                                const fileData = typeof file === 'object' ? file : { name: file };
                                folderNode.children.push({
                                    id: `file_${index}_${docIndex}_${childIdx}_${fileIdx}`,
                                    name: fileData.name || file,
                                    type: 'file',
                                    children: [],
                                    match_keywords: fileData.match_keywords || []
                                });
                            });
                        }
                        docNode.children.push(folderNode);
                    }
                });
            }

            // 同时从 categories 中读取目录（与文档管理界面共享的目录
            const docCategories = categories[docData.name || doc] || [];
            docCategories.forEach((categoryName, catIdx) => {
                // 检查是否已经存在同名目录，避免重复
                const existingFolder = docNode.children.find(child =>
                    child.type === 'folder' && child.name === categoryName
                );
                if (!existingFolder) {
                    const folderNode = {
                        id: `folder_cat_${index}_${docIndex}_${catIdx}`,
                        name: categoryName,
                        type: 'folder',
                        expanded: false,
                        children: [],
                        attributes: {},
                        filename_template: '',
                        match_keywords: []
                    };
                    docNode.children.push(folderNode);
                }
            });

            cycleNode.children.push(docNode);
        });

        tree.children.push(cycleNode);
    });

    return tree;
}

// ==================== 渲染 ====================

function renderTree() {
    const container = document.getElementById('treeEditorContainer');
    if (!container) return;

    container.innerHTML = renderTreeNode(currentTreeData, 0);
    bindTreeEvents();
}

function renderTreeNode(node, level) {
    // 如果被筛选掉，不渲染
    if (node._filtered) {
        return '';
    }
    
    const indent = level * 24;
    const hasChildren = node.children && node.children.length > 0;
    const icon = getNodeIcon(node.type);
    const expandIcon = hasChildren ?
        (node.expanded ? '▼' : '▶') :
        '<span style="width:14px;display:inline-block;"></span>';

    // 属性标签
    const attrTags = getAttributeTags(node);
    // 关键词标签
    const keywordTags = getKeywordTags(node);
    // 文件名模板标签
    const templateTag = getTemplateTag(node);

    let html = `
        <div class="tree-node" 
             data-id="${node.id}" 
             data-type="${node.type}"
             style="padding-left:${indent}px;"
             draggable="true">
            <div class="tree-node-content">
                <span class="tree-expand-icon">${expandIcon}</span>
                <span class="tree-icon">${icon}</span>
                <span class="tree-name" contenteditable="false">${escapeHtml(node.name)}</span>
                ${attrTags ? `<span class="tree-attr-tags">${attrTags}</span>` : ''}
                ${keywordTags ? `<span class="tree-keyword-tags">${keywordTags}</span>` : ''}
                ${templateTag ? `<span class="tree-template-tag">${templateTag}</span>` : ''}
                <div class="tree-node-actions">
                    ${getNodeActions(node)}
                </div>
            </div>
        </div>
    `;

    if (hasChildren && node.expanded) {
        node.children.forEach(child => {
            html += renderTreeNode(child, level + 1);
        });
    }

    return html;
}

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * 生成属性标签 HTML（签字/盖章等）
 */
function getAttributeTags(node) {
    if (node.type !== 'document') return '';

    const attrs = node.attributes || {};
    const tags = [];
    const icons = {
        party_a_sign: '✍️',
        party_b_sign: '✍️',
        party_a_seal: '🔵',
        party_b_seal: '🟢',
        need_doc_number: '📄',
        need_doc_date: '📅',
        need_sign_date: '✅'
    };
    const shortLabels = {
        party_a_sign: '甲方签字',
        party_b_sign: '乙方签字',
        party_a_seal: '甲方盖章',
        party_b_seal: '乙方盖章',
        need_doc_number: '发文号',
        need_doc_date: '文档日期',
        need_sign_date: '签字日期'
    };

    // 内置属性
    for (const [key, val] of Object.entries(attrs)) {
        if (val && icons[key]) {
            tags.push(`<span class="attr-tag" title="${shortLabels[key]}">${icons[key]}</span>`);
        }
    }
    
    // 自定义属性
    customAttributeDefinitions.forEach(attrDef => {
        const val = attrs[attrDef.id];
        if (val !== undefined && val !== false && val !== '') {
            // 根据类型选择图标
            let icon = '🏷️';
            if (attrDef.type === 'checkbox') icon = '☑️';
            else if (attrDef.type === 'text') icon = '📝';
            else if (attrDef.type === 'date') icon = '📅';
            
            // 显示属性名和值
            let displayVal = val;
            if (attrDef.type === 'checkbox') displayVal = attrDef.name;
            else if (attrDef.type === 'date' && val) displayVal = val;
            
            tags.push(`<span class="attr-tag custom-attr-tag" title="${attrDef.name}: ${displayVal}">${icon}</span>`);
        }
    });
    
    return tags.join('');
}

/**
 * 生成关键词标签 HTML
 */
function getKeywordTags(node) {
    if (!node.match_keywords || node.match_keywords.length === 0) return '';
    
    return node.match_keywords.slice(0, 3).map(kw => 
        `<span class="keyword-tag" title="匹配关键词: ${escapeHtml(kw)}">🔖${escapeHtml(kw)}</span>`
    ).join('');
}

/**
 * 生成文件名模板标签
 */
function getTemplateTag(node) {
    if (!node.filename_template) return '';
    return `<span class="template-tag" title="文件名模板: ${escapeHtml(node.filename_template)}">📝</span>`;
}

function getNodeIcon(type) {
    const icons = {
        'root': '📁',
        'cycle': '📂',
        'folder': '📁',
        'document': '📄',
        'file': '📃'
    };
    return icons[type] || '📄';
}

function getNodeActions(node) {
    let actions = '';

    if (node.type === 'root') {
        actions += `<button class="tree-action-btn" onclick="addTreeNode('cycle')" title="添加周期">➕ 周期</button>`;
    } else if (node.type === 'cycle') {
        actions += `<button class="tree-action-btn" onclick="addTreeNode('document')" title="添加文档">➕ 文档</button>`;
        actions += `<button class="tree-action-btn" onclick="addTreeNode('folder')" title="添加目录">➕ 目录</button>`;
    } else if (node.type === 'document') {
        actions += `<button class="tree-action-btn" onclick="addTreeNode('folder')" title="添加子目录">➕ 目录</button>`;
    } else if (node.type === 'folder') {
        actions += `<button class="tree-action-btn" onclick="addTreeNode('file')" title="添加文件">➕ 文件</button>`;
    }

    if (node.type !== 'root') {
        // 上移下移按钮
        actions += `<button class="tree-action-btn" onclick="moveNodeUp('${node.id}')" title="上移">⬆️</button>`;
        actions += `<button class="tree-action-btn" onclick="moveNodeDown('${node.id}')" title="下移">⬇️</button>`;
        
        // 提级降级按钮（周期不能提级）
        if (node.type !== 'cycle') {
            actions += `<button class="tree-action-btn" onclick="outdentNode('${node.id}')" title="提级">⬅️</button>`;
            actions += `<button class="tree-action-btn" onclick="indentNode('${node.id}')" title="降级">➡️</button>`;
        }
        
        // 移动到其它周期（仅限文档、目录、文件）
        if (['document', 'folder', 'file'].includes(node.type)) {
            actions += `<button class="tree-action-btn" onclick="moveNodeToCycle('${node.id}')" title="移动到其它周期">📂</button>`;
        }
        
        if (node.type === 'document') {
            actions += `<button class="tree-action-btn" onclick="openAttributePanel('${node.id}')" title="设置属性">⚙️</button>`;
        }
        // 文件名模板和关键词：文档、目录、文件都可以设置
        if (['document', 'folder', 'file'].includes(node.type)) {
            actions += `<button class="tree-action-btn" onclick="openMatchSettings('${node.id}')" title="匹配设置">🏷️</button>`;
        }
        actions += `<button class="tree-action-btn" onclick="editTreeNode('${node.id}')" title="编辑名称">✏️</button>`;
        actions += `<button class="tree-action-btn delete" onclick="deleteTreeNode('${node.id}')" title="删除">🗑️</button>`;
    }

    return actions;
}

// ==================== 事件绑定 ====================

function bindTreeEvents() {
    const container = document.getElementById('treeEditorContainer');
    if (!container) return;

    container.querySelectorAll('.tree-expand-icon').forEach(icon => {
        icon.style.cursor = 'pointer';
        icon.addEventListener('click', (e) => {
            const nodeEl = e.target.closest('.tree-node');
            toggleNode(nodeEl.dataset.id);
        });
    });

    container.querySelectorAll('.tree-node').forEach(nodeEl => {
        nodeEl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tree-action-btn')) {
                selectNode(nodeEl.dataset.id, e);
            }
        });
    });

    container.querySelectorAll('.tree-name').forEach(nameEl => {
        nameEl.addEventListener('dblclick', (e) => {
            const nodeEl = e.target.closest('.tree-node');
            if (nodeEl.dataset.type !== 'root') {
                startEditNodeName(nodeEl.dataset.id);
            }
        });
    });

    setupDragAndDrop();

    // 属性面板 checkbox 实时联动预览
    for (const key of Object.keys(ATTRIBUTE_LABELS)) {
        const checkbox = document.getElementById(`attr_${key}`);
        if (checkbox && !checkbox._bound) {
            checkbox._bound = true;
            checkbox.addEventListener('change', () => {
                const panel = document.getElementById('attributePanel');
                const editingId = panel && panel.dataset && panel.dataset.editingNodeId;
                if (editingId) updateAttributePreview(editingId);
            });
        }
    }
}

// ==================== 节点操作 ====================

function toggleNode(nodeId) {
    const node = findNode(currentTreeData, nodeId);
    if (node && node.children && node.children.length > 0) {
        node.expanded = !node.expanded;
        renderTree();
        if (selectedNode) selectNode(selectedNode);
    }
}

function selectNode(nodeId, event = null) {
    const isCtrl = event && (event.ctrlKey || event.metaKey);
    const isShift = event && event.shiftKey;
    
    if (isShift && lastSelectedNode) {
        // Shift范围选择
        selectRange(lastSelectedNode, nodeId);
    } else if (isCtrl) {
        // Ctrl多选/取消
        toggleNodeSelection(nodeId);
    } else {
        // 普通点击：单选
        clearAllSelections();
        addNodeSelection(nodeId);
    }
    
    lastSelectedNode = nodeId;
    updateToolbarState();
    updateAttributePanelForSelection();
}

/**
 * 添加节点到选择
 */
function addNodeSelection(nodeId) {
    const nodeEl = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
    if (nodeEl) {
        nodeEl.classList.add('selected');
        if (!selectedNodes.includes(nodeId)) {
            selectedNodes.push(nodeId);
        }
        selectedNode = nodeId;
        window._treeSelectedNode = nodeId;
    }
}

/**
 * 切换节点选择状态
 */
function toggleNodeSelection(nodeId) {
    const index = selectedNodes.indexOf(nodeId);
    if (index > -1) {
        // 取消选择
        selectedNodes.splice(index, 1);
        const nodeEl = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
        if (nodeEl) nodeEl.classList.remove('selected');
    } else {
        // 添加选择
        addNodeSelection(nodeId);
    }
    
    // 更新当前选中节点
    if (selectedNodes.length > 0) {
        selectedNode = selectedNodes[selectedNodes.length - 1];
        window._treeSelectedNode = selectedNode;
    } else {
        selectedNode = null;
        window._treeSelectedNode = null;
    }
    window._treeSelectedNodes = selectedNodes;
}

/**
 * 清除所有选择
 */
function clearAllSelections() {
    document.querySelectorAll('.tree-node.selected').forEach(el => {
        el.classList.remove('selected');
    });
    selectedNodes = [];
    selectedNode = null;
    window._treeSelectedNode = null;
    window._treeSelectedNodes = [];
}

/**
 * 范围选择
 */
function selectRange(fromId, toId) {
    // 获取所有可见的文档节点
    const allDocNodes = [];
    function collectDocNodes(node) {
        if (node.type === 'document' && !node._filtered) {
            allDocNodes.push(node.id);
        }
        if (node.children) {
            node.children.forEach(collectDocNodes);
        }
    }
    collectDocNodes(currentTreeData);
    
    const fromIndex = allDocNodes.indexOf(fromId);
    const toIndex = allDocNodes.indexOf(toId);
    
    if (fromIndex === -1 || toIndex === -1) return;
    
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    
    for (let i = start; i <= end; i++) {
        addNodeSelection(allDocNodes[i]);
    }
}

function startEditNodeName(nodeId) {
    const nodeEl = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
    if (!nodeEl) return;

    const nameEl = nodeEl.querySelector('.tree-name');
    if (!nameEl) return;

    nameEl.contentEditable = 'true';
    nameEl.focus();

    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const originalName = findNode(currentTreeData, nodeId).name;

    nameEl.addEventListener('blur', () => {
        finishEditNodeName(nodeId, nameEl.textContent.trim(), originalName);
    }, { once: true });

    nameEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
        if (e.key === 'Escape') {
            nameEl.textContent = originalName;
            nameEl.blur();
        }
    });
}

function finishEditNodeName(nodeId, newName, originalName) {
    if (!newName) {
        showNotification('名称不能为空', 'error');
        renderTree();
        if (selectedNode) selectNode(selectedNode);
        return;
    }

    const node = findNode(currentTreeData, nodeId);
    if (node) {
        node.name = newName;
        renderTree();
        if (selectedNode) selectNode(selectedNode);
        
        if (newName !== originalName) {
            markDirty();
            showNotification('名称已更新', 'success');
        }
    }
}

// ==================== 添加/编辑/删除 ====================

window.addTreeNode = function(type) {
    // 确定父节点
    let parentId = 'root';
    if (type === 'document' || type === 'folder' || type === 'file') {
        if (selectedNode) parentId = selectedNode;
    }

    const parent = findNode(currentTreeData, parentId);
    if (!parent) {
        showNotification('请先选择父节点', 'error');
        return;
    }

    // 类型兼容性检查
    if (type === 'cycle' && parent.type !== 'root') {
        showNotification('周期只能添加到根节点下', 'error');
        return;
    }
    if (type === 'document' && parent.type !== 'cycle') {
        showNotification('文档只能添加到周期下', 'error');
        return;
    }
    if (type === 'folder' && parent.type !== 'cycle' && parent.type !== 'document') {
        showNotification('目录只能添加到周期或文档下', 'error');
        return;
    }
    if (type === 'file' && parent.type !== 'folder') {
        showNotification('文件只能添加到目录下', 'error');
        return;
    }

    const now = new Date();
    const ts = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

    const defaultNames = {
        cycle: '新周期',
        document: '新文档',
        folder: '新目录',
        file: `文件_${ts}`
    };

    const newNode = {
        id: `${type}_${Date.now()}`,
        name: defaultNames[type] || '新节点',
        type: type,
        expanded: true,
        children: []
    };

    // 文档节点带默认属性
    if (type === 'document') {
        newNode.attributes = { ...DEFAULT_DOC_ATTRIBUTES };
        newNode.doc_note = '';
        newNode.filename_template = '';
        newNode.match_keywords = [];
    }

    // 目录和文件节点也支持匹配关键词
    if (type === 'folder' || type === 'file') {
        newNode.filename_template = '';
        newNode.match_keywords = [];
    }

    if (!parent.children) parent.children = [];
    parent.children.push(newNode);
    parent.expanded = true;

    renderTree();

    setTimeout(() => {
        selectNode(newNode.id);
        startEditNodeName(newNode.id);
        markDirty();
    }, 100);
};

window.editTreeNode = function(nodeId) {
    startEditNodeName(nodeId);
};

window.deleteTreeNode = function(nodeId) {
    const node = findNode(currentTreeData, nodeId);
    if (!node) return;

    const typeNames = { cycle: '周期', document: '文档', folder: '目录', file: '文件' };
    const typeName = typeNames[node.type] || '节点';
    const hasChildren = node.children && node.children.length > 0;

    let message = `确定要删除${typeName}"${node.name}"吗？`;
    if (hasChildren) {
        message += `\n该${typeName}下还有 ${node.children.length} 个子项，将一并删除。`;
    }

    showConfirmModal('确认删除', message, () => {
        deleteNode(currentTreeData, nodeId);
        renderTree();
        showNotification('删除成功', 'success');
        selectedNode = null;
        selectedNodes = [];
        updateToolbarState();
        markDirty();
    });
};

/**
 * 批量删除节点
 */
window.deleteTreeNodes = function(nodeIds) {
    if (!nodeIds || nodeIds.length === 0) return;
    
    let deletedCount = 0;
    nodeIds.forEach(nodeId => {
        if (deleteNode(currentTreeData, nodeId)) {
            deletedCount++;
        }
    });
    
    renderTree();
    showNotification(`成功删除 ${deletedCount} 个节点`, 'success');
    selectedNode = null;
    selectedNodes = [];
    updateToolbarState();
    markDirty();
};

// ==================== 属性面板（附加要求） ====================

/**
 * 打开属性编辑面板（签字/盖章等附加要求）
 */
window.openAttributePanel = function(nodeId) {
    const node = findNode(currentTreeData, nodeId);
    if (!node || node.type !== 'document') return;

    const panel = document.getElementById('attributePanel');
    if (!panel) return;

    // 填充属性值
    const attrs = node.attributes || {};
    for (const key of Object.keys(ATTRIBUTE_LABELS)) {
        const checkbox = document.getElementById(`attr_${key}`);
        if (checkbox) checkbox.checked = !!attrs[key];
    }

    // 备注
    const noteEl = document.getElementById('attrDocNote');
    if (noteEl) noteEl.value = node.doc_note || '';

    // 渲染自定义属性
    renderCustomAttributes(node);

    // 显示面板
    panel.style.display = 'block';
    panel.dataset.editingNodeId = nodeId;

    // 更新属性标签预览
    updateAttributePreview(nodeId);
};

/**
 * 关闭属性面板
 */
export function closeAttributePanel() {
    const panel = document.getElementById('attributePanel');
    if (panel) {
        panel.style.display = 'none';
        panel.dataset.editingNodeId = '';
    }
}

/**
 * 保存属性（附加要求）
 */
export function saveAttributes() {
    const panel = document.getElementById('attributePanel');
    if (!panel) return;

    const isBatchMode = panel.dataset.batchMode === 'true';
    
    if (isBatchMode) {
        // 批量保存
        const nodeIds = JSON.parse(panel.dataset.editingNodeIds || '[]');
        const nodes = nodeIds.map(id => findNode(currentTreeData, id)).filter(n => n);
        
        let updatedCount = 0;
        
        nodes.forEach(node => {
            if (!node.attributes) node.attributes = {};
            
            // 更新内置属性（只更新已勾选的）
            for (const key of Object.keys(ATTRIBUTE_LABELS)) {
                const checkbox = document.getElementById(`attr_${key}`);
                if (checkbox && checkbox.checked && !checkbox.indeterminate) {
                    node.attributes[key] = true;
                } else if (checkbox && !checkbox.checked && !checkbox.indeterminate) {
                    node.attributes[key] = false;
                }
            }
            
            // 更新自定义属性
            customAttributeDefinitions.forEach(attrDef => {
                const inputEl = document.getElementById(`custom_attr_${attrDef.id}`);
                if (inputEl) {
                    const val = attrDef.type === 'checkbox' ? inputEl.checked : inputEl.value;
                    if (val !== '' || attrDef.type === 'checkbox') {
                        node.attributes[attrDef.id] = val;
                    }
                }
            });
            
            updatedCount++;
        });
        
        // 重置面板状态
        panel.dataset.batchMode = 'false';
        panel.dataset.editingNodeIds = '';
        
        // 恢复单选模式的面板
        const titleEl = panel.querySelector('h3');
        if (titleEl) titleEl.textContent = '附加要求';
        
        const hintEl = panel.querySelector('.attr-panel-hint');
        if (hintEl) hintEl.textContent = '勾选该文档需要满足的附加要求';
        
        const noteEl = document.getElementById('attrDocNote');
        if (noteEl) noteEl.disabled = false;
        
        // 重新渲染树
        renderTree();
        clearAllSelections();
        showNotification(`批量更新成功，已更新 ${updatedCount} 个文档`, 'success');
        markDirty();
        
    } else {
        // 单选保存
        const nodeId = panel.dataset.editingNodeId;
        if (!nodeId) return;

        const node = findNode(currentTreeData, nodeId);
        if (!node) return;

        // 确保attributes对象存在
        if (!node.attributes) node.attributes = {};
        
        // 只更新界面上有的属性，保留其他属性
        for (const key of Object.keys(ATTRIBUTE_LABELS)) {
            const checkbox = document.getElementById(`attr_${key}`);
            if (checkbox) node.attributes[key] = checkbox.checked;
        }

        // 保存自定义属性
        customAttributeDefinitions.forEach(attrDef => {
            const inputEl = document.getElementById(`custom_attr_${attrDef.id}`);
            if (inputEl) {
                node.attributes[attrDef.id] = attrDef.type === 'checkbox' ? inputEl.checked : inputEl.value;
            }
        });

        // 备注
        const noteEl = document.getElementById('attrDocNote');
        if (noteEl) node.doc_note = noteEl.value.trim();

        // 重新渲染树
        renderTree();
        if (selectedNode) selectNode(selectedNode);
        showNotification('附加要求已保存', 'success');
        markDirty();
    }
}

/**
 * 更新属性标签预览
 */
function updateAttributePreview(nodeId) {
    const node = findNode(currentTreeData, nodeId);
    if (!node) return;

    const previewEl = document.getElementById('attrPreview');
    if (!previewEl) return;

    const attrs = node.attributes || {};
    const activeAttrs = [];

    // 显示内置属性
    Object.entries(attrs)
        .filter(([k, v]) => v)
        .forEach(([k, v]) => {
            if (ATTRIBUTE_LABELS[k]) {
                activeAttrs.push(ATTRIBUTE_LABELS[k]);
            }
        });

    // 显示自定义属性
    customAttributeDefinitions.forEach(attrDef => {
        const value = attrs[attrDef.id];
        if (value !== undefined && value !== false && value !== '') {
            activeAttrs.push(attrDef.name);
        }
    });

    if (activeAttrs.length === 0) {
        previewEl.textContent = '未设置附加要求';
        previewEl.className = 'attr-preview empty';
    } else {
        previewEl.textContent = activeAttrs.join('、');
        previewEl.className = 'attr-preview';
    }
}

// ==================== 匹配设置面板（文件名模板 + 关键词） ====================

/**
 * 打开匹配设置面板
 */
window.openMatchSettings = function(nodeId) {
    const node = findNode(currentTreeData, nodeId);
    if (!node) return;

    const typeNames = { document: '文档', folder: '目录', file: '文件' };
    const title = document.getElementById('matchSettingsTitle');
    if (title) title.textContent = `${typeNames[node.type] || '节点'}匹配设置 - ${node.name}`;

    // 填充文件名模板
    const templateEl = document.getElementById('matchFilenameTemplate');
    if (templateEl) templateEl.value = node.filename_template || '';

    // 填充关键词
    const keywordsEl = document.getElementById('matchKeywords');
    if (keywordsEl) {
        keywordsEl.value = (node.match_keywords || []).join('、');
    }

    // 显示模板变量提示
    updateTemplateHint(node.type);

    // 记录当前编辑的节点
    const panel = document.getElementById('matchSettingsPanel');
    if (panel) {
        panel.style.display = 'block';
        panel.dataset.editingNodeId = nodeId;
    }
};

/**
 * 更新模板变量提示
 */
function updateTemplateHint(nodeType) {
    const hintEl = document.getElementById('matchTemplateHint');
    if (!hintEl) return;

    if (nodeType === 'file') {
        hintEl.textContent = '可用变量：无（文件名由系统生成时间戳）';
    } else {
        hintEl.textContent = '可用变量：{日期} {序号} {周期} {文档名}';
    }
}

/**
 * 关闭匹配设置面板
 */
window.closeMatchSettings = function() {
    const panel = document.getElementById('matchSettingsPanel');
    if (panel) {
        panel.style.display = 'none';
        panel.dataset.editingNodeId = '';
    }
};

/**
 * 保存匹配设置
 */
window.saveMatchSettings = function() {
    const panel = document.getElementById('matchSettingsPanel');
    if (!panel) return;

    const nodeId = panel.dataset.editingNodeId;
    if (!nodeId) return;

    const node = findNode(currentTreeData, nodeId);
    if (!node) return;

    // 文件名模板
    const templateEl = document.getElementById('matchFilenameTemplate');
    if (templateEl) {
        node.filename_template = templateEl.value.trim();
    }

    // 关键词
    const keywordsEl = document.getElementById('matchKeywords');
    if (keywordsEl) {
        const kwStr = keywordsEl.value.trim();
        if (kwStr) {
            // 支持中文顿号、英文逗号、分号、空格分隔
            node.match_keywords = kwStr.split(/[、,;\s]+/).filter(k => k.trim());
        } else {
            node.match_keywords = [];
        }
    }

    // 关闭面板
    panel.style.display = 'none';

    // 重新渲染
    renderTree();
    if (selectedNode) selectNode(selectedNode);
    showNotification('匹配设置已保存', 'success');
    markDirty();
};

/**
 * 添加预设关键词按钮
 */
window.addPresetKeyword = function(keyword) {
    const keywordsEl = document.getElementById('matchKeywords');
    if (!keywordsEl) return;

    const existing = keywordsEl.value.trim();
    if (existing) {
        keywordsEl.value = existing + '、' + keyword;
    } else {
        keywordsEl.value = keyword;
    }
};

// ==================== 树操作工具函数 ====================

function findNode(tree, nodeId) {
    if (tree.id === nodeId) return tree;
    if (tree.children) {
        for (const child of tree.children) {
            const found = findNode(child, nodeId);
            if (found) return found;
        }
    }
    return null;
}

function deleteNode(tree, nodeId) {
    if (tree.children) {
        const index = tree.children.findIndex(child => child.id === nodeId);
        if (index !== -1) {
            tree.children.splice(index, 1);
            return true;
        }
        for (const child of tree.children) {
            if (deleteNode(child, nodeId)) return true;
        }
    }
    return false;
}

// ==================== 拖拽 ====================

function setupDragAndDrop() {
    const nodes = document.querySelectorAll('.tree-node');
    nodes.forEach(node => {
        node.addEventListener('dragstart', handleDragStart);
        node.addEventListener('dragover', handleDragOver);
        node.addEventListener('drop', handleDrop);
        node.addEventListener('dragend', handleDragEnd);
    });
}

let draggedNode = null;

function handleDragStart(e) {
    draggedNode = e.target.closest('.tree-node');
    if (!draggedNode) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedNode.dataset.id);
    setTimeout(() => { draggedNode.style.opacity = '0.5'; }, 0);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetNode = e.target.closest('.tree-node');
    if (targetNode && targetNode !== draggedNode) {
        targetNode.classList.add('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    const targetNode = e.target.closest('.tree-node');
    if (!targetNode || !draggedNode || targetNode === draggedNode) return;

    const draggedId = draggedNode.dataset.id;
    const targetId = targetNode.dataset.id;
    const draggedData = findNode(currentTreeData, draggedId);
    const targetData = findNode(currentTreeData, targetId);
    if (!draggedData || !targetData) return;

    if (isDescendant(draggedData, targetId)) {
        showNotification('不能移动到自己的子节点下', 'error');
        return;
    }

    // 类型兼容检查
    const rules = {
        cycle: ['root'],
        document: ['cycle'],
        folder: ['cycle', 'document'],
        file: ['folder']
    };
    const allowed = rules[draggedData.type];
    if (allowed && !allowed.includes(targetData.type)) {
        const typeNames = { cycle: '周期', document: '文档', folder: '目录', file: '文件' };
        const targetNames = { root: '根节点', cycle: '周期', document: '文档', folder: '目录', file: '文件' };
        showNotification(`${typeNames[draggedData.type]}只能移动到${allowed.map(t => targetNames[t]).join('或')}下`, 'error');
        return;
    }

    moveNode(draggedId, targetId);
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragEnd() {
    if (draggedNode) draggedNode.style.opacity = '1';
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedNode = null;
}

function moveNode(nodeId, targetId) {
    const node = findNode(currentTreeData, nodeId);
    const target = findNode(currentTreeData, targetId);
    if (!node || !target) return;

    deleteNode(currentTreeData, nodeId);
    if (!target.children) target.children = [];
    target.children.push(node);
    target.expanded = true;

    renderTree();
    markDirty();
    showNotification('移动成功', 'success');
}

function isDescendant(node, targetId) {
    if (!node.children) return false;
    for (const child of node.children) {
        if (child.id === targetId) return true;
        if (isDescendant(child, targetId)) return true;
    }
    return false;
}

// ==================== 节点移动操作（上移、下移、提级、降级）====================

/**
 * 获取节点的父节点和兄弟列表
 */
function getParentAndSiblings(nodeId) {
    if (!currentTreeData) return null;
    
    // 如果是根节点，没有父节点
    if (currentTreeData.id === nodeId) {
        return { parent: null, siblings: [currentTreeData], index: 0 };
    }
    
    function findParent(node, targetId) {
        if (!node.children) return null;
        for (let i = 0; i < node.children.length; i++) {
            if (node.children[i].id === targetId) {
                return { parent: node, siblings: node.children, index: i };
            }
            const result = findParent(node.children[i], targetId);
            if (result) return result;
        }
        return null;
    }
    
    return findParent(currentTreeData, nodeId);
}

/**
 * 上移节点
 */
function moveNodeUp(nodeId) {
    const result = getParentAndSiblings(nodeId);
    if (!result || result.index <= 0) {
        showNotification('已经是第一个了', 'warning');
        return;
    }
    
    const { siblings, index } = result;
    // 交换位置
    [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
    
    renderTree();
    markDirty();
    showNotification('上移成功', 'success');
}

/**
 * 下移节点
 */
function moveNodeDown(nodeId) {
    const result = getParentAndSiblings(nodeId);
    if (!result || result.index >= result.siblings.length - 1) {
        showNotification('已经是最后一个了', 'warning');
        return;
    }
    
    const { siblings, index } = result;
    // 交换位置
    [siblings[index], siblings[index + 1]] = [siblings[index + 1], siblings[index]];
    
    renderTree();
    markDirty();
    showNotification('下移成功', 'success');
}

/**
 * 提级（减少缩进）- 将节点移动到父节点的同级
 */
function outdentNode(nodeId) {
    const result = getParentAndSiblings(nodeId);
    if (!result || !result.parent || result.parent.type === 'root') {
        showNotification('无法继续提级', 'warning');
        return;
    }
    
    const { parent, siblings, index } = result;
    const node = siblings[index];
    
    // 找到父节点的父节点
    const grandParentResult = getParentAndSiblings(parent.id);
    if (!grandParentResult) {
        showNotification('无法提级', 'warning');
        return;
    }
    
    // 从当前父节点中移除
    siblings.splice(index, 1);
    
    // 添加到祖父节点
    const grandParent = grandParentResult.parent || currentTreeData;
    if (!grandParent.children) grandParent.children = [];
    
    // 找到父节点在祖父节点中的位置，将当前节点插入到父节点之后
    const parentIndex = grandParent.children.findIndex(n => n.id === parent.id);
    grandParent.children.splice(parentIndex + 1, 0, node);
    
    renderTree();
    markDirty();
    showNotification('提级成功', 'success');
}

/**
 * 降级（增加缩进）- 将节点移动到前一个兄弟节点的子节点中
 */
function indentNode(nodeId) {
    const result = getParentAndSiblings(nodeId);
    if (!result || result.index <= 0) {
        showNotification('无法继续降级', 'warning');
        return;
    }
    
    const { siblings, index } = result;
    const node = siblings[index];
    const prevSibling = siblings[index - 1];
    
    // 前一个兄弟节点不能是文件类型（文件不能有子节点）
    if (prevSibling.type === 'file') {
        showNotification('前一个节点是文件，无法降级', 'warning');
        return;
    }
    
    // 从当前位置移除
    siblings.splice(index, 1);
    
    // 添加到前一个兄弟节点的子节点中
    if (!prevSibling.children) prevSibling.children = [];
    prevSibling.children.push(node);
    prevSibling.expanded = true;
    
    renderTree();
    markDirty();
    showNotification('降级成功', 'success');
}

/**
 * 移动节点到其它周期
 */
function moveNodeToCycle(nodeId) {
    const node = findNode(currentTreeData, nodeId);
    if (!node) return;
    
    // 获取所有周期
    const cycles = currentTreeData.children.filter(n => n.type === 'cycle');
    if (cycles.length <= 1) {
        showNotification('只有一个周期，无法移动', 'warning');
        return;
    }
    
    // 排除当前节点所在的周期
    const currentResult = getParentAndSiblings(nodeId);
    if (!currentResult || !currentResult.parent) {
        showNotification('无法移动根节点', 'warning');
        return;
    }
    
    // 找到当前周期
    let currentCycle = currentResult.parent;
    while (currentCycle && currentCycle.type !== 'cycle' && currentCycle.type !== 'root') {
        const r = getParentAndSiblings(currentCycle.id);
        currentCycle = r ? r.parent : null;
    }
    
    // 生成周期选择对话框
    const cycleOptions = cycles
        .filter(c => c.id !== currentCycle?.id)
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join('');
    
    if (!cycleOptions) {
        showNotification('没有其他周期可选', 'warning');
        return;
    }
    
    // 显示选择对话框
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.style.display = 'block';
    dialog.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3>移动到其它周期</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <p>选择目标周期：</p>
                <select id="targetCycleSelect" style="width: 100%; padding: 8px; margin: 10px 0;">
                    ${cycleOptions}
                </select>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" id="confirmMoveToCycle">确认移动</button>
                <button class="btn" onclick="this.closest('.modal').remove()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    
    // 绑定确认按钮事件
    dialog.querySelector('#confirmMoveToCycle').addEventListener('click', () => {
        const targetCycleId = document.getElementById('targetCycleSelect').value;
        const targetCycle = cycles.find(c => c.id === targetCycleId);
        
        if (targetCycle) {
            // 从原位置删除
            deleteNode(currentTreeData, nodeId);
            
            // 添加到目标周期
            if (!targetCycle.children) targetCycle.children = [];
            targetCycle.children.push(node);
            targetCycle.expanded = true;
            
            renderTree();
            markDirty();
            showNotification('移动成功', 'success');
        }
        
        dialog.remove();
    });
}

// 导出到全局，供HTML调用
window.moveNodeUp = moveNodeUp;
window.moveNodeDown = moveNodeDown;
window.outdentNode = outdentNode;
window.indentNode = indentNode;
window.moveNodeToCycle = moveNodeToCycle;

// ==================== 工具栏 ====================

function updateToolbarState() {
    const addDocBtn = document.getElementById('toolbarAddDoc');
    const addFolderBtn = document.getElementById('toolbarAddFolder');
    const editBtn = document.getElementById('toolbarEdit');
    const deleteBtn = document.getElementById('toolbarDelete');
    const attrBtn = document.getElementById('toolbarAttr');

    if (!selectedNode || selectedNodes.length === 0) {
        if (addDocBtn) addDocBtn.disabled = true;
        if (addFolderBtn) addFolderBtn.disabled = true;
        if (editBtn) editBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        if (attrBtn) attrBtn.disabled = true;
        hideAttributePanelIfNoSelection();
        return;
    }

    // 多选模式
    if (selectedNodes.length > 1) {
        // 批量操作模式
        if (addDocBtn) addDocBtn.disabled = true;
        if (addFolderBtn) addFolderBtn.disabled = true;
        if (editBtn) editBtn.disabled = true;  // 批量时不允许编辑名称
        if (deleteBtn) deleteBtn.disabled = false;  // 允许批量删除
        
        // 只有选中的全是文档时才允许批量编辑属性
        const allDocs = selectedNodes.every(id => {
            const node = findNode(currentTreeData, id);
            return node && node.type === 'document';
        });
        if (attrBtn) attrBtn.disabled = !allDocs;
        return;
    }

    // 单选模式
    const node = findNode(currentTreeData, selectedNode);
    if (!node) return;

    // 添加文档：只有选中周期时可用
    if (addDocBtn) addDocBtn.disabled = (node.type !== 'cycle');
    // 添加目录：选中周期或文档时可用
    if (addFolderBtn) addFolderBtn.disabled = (node.type !== 'cycle' && node.type !== 'document');
    // 编辑：非根节点可用
    if (editBtn) editBtn.disabled = (node.type === 'root');
    // 删除：非根节点可用
    if (deleteBtn) deleteBtn.disabled = (node.type === 'root');
    // 属性：只有文档可用
    if (attrBtn) attrBtn.disabled = (node.type !== 'document');
}

/**
 * 根据选择更新属性面板（单选/批量）
 */
function updateAttributePanelForSelection() {
    if (selectedNodes.length === 0) {
        hideAttributePanelIfNoSelection();
        return;
    }
    
    // 检查是否全是文档
    const docNodes = selectedNodes.map(id => findNode(currentTreeData, id)).filter(n => n && n.type === 'document');
    
    if (docNodes.length === 0) {
        hideAttributePanelIfNoSelection();
        return;
    }
    
    if (docNodes.length === 1) {
        // 单选文档
        window.openAttributePanel(docNodes[0].id);
    } else {
        // 批量编辑模式
        openBatchAttributePanel(docNodes);
    }
}

/**
 * 打开批量属性编辑面板
 */
function openBatchAttributePanel(nodes) {
    const panel = document.getElementById('attributePanel');
    if (!panel) return;
    
    // 更新标题
    const titleEl = panel.querySelector('h3');
    if (titleEl) titleEl.textContent = `批量编辑属性 (${nodes.length} 个文档)`;
    
    const hintEl = panel.querySelector('.attr-panel-hint');
    if (hintEl) hintEl.textContent = '勾选属性将应用到所有选中文档，留空则保持原值不变';
    
    // 填充属性值（显示混合状态）
    for (const key of Object.keys(ATTRIBUTE_LABELS)) {
        const checkbox = document.getElementById(`attr_${key}`);
        if (!checkbox) continue;
        
        const values = nodes.map(n => n.attributes?.[key]);
        const allTrue = values.every(v => v === true);
        const allFalse = values.every(v => v === false || v === undefined);
        
        if (allTrue) {
            checkbox.checked = true;
            checkbox.indeterminate = false;
        } else if (allFalse) {
            checkbox.checked = false;
            checkbox.indeterminate = false;
        } else {
            // 混合状态
            checkbox.checked = false;
            checkbox.indeterminate = true;
        }
    }
    
    // 备注字段在批量模式下禁用
    const noteEl = document.getElementById('attrDocNote');
    if (noteEl) {
        noteEl.value = '';
        noteEl.placeholder = '批量编辑时不支持修改备注';
        noteEl.disabled = true;
    }
    
    // 渲染自定义属性
    renderCustomAttributesForBatch(nodes);
    
    // 显示面板
    panel.style.display = 'block';
    panel.dataset.editingNodeIds = JSON.stringify(nodes.map(n => n.id));
    panel.dataset.batchMode = 'true';
    
    // 更新预览
    const previewEl = document.getElementById('attrPreview');
    if (previewEl) {
        previewEl.textContent = `已选择 ${nodes.length} 个文档，修改将同时应用到所有选中文档`;
        previewEl.classList.remove('empty');
    }
}

/**
 * 批量渲染自定义属性
 */
function renderCustomAttributesForBatch(nodes) {
    const container = document.getElementById('customAttributesList');
    if (!container) return;
    
    if (customAttributeDefinitions.length === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 12px;">暂无自定义属性</p>';
        return;
    }
    
    container.innerHTML = customAttributeDefinitions.map(attrDef => {
        const values = nodes.map(n => n.attributes?.[attrDef.id]).filter(v => v !== undefined);
        const allSame = values.length > 0 && values.every(v => v === values[0]);
        
        let value = allSame ? values[0] : (attrDef.type === 'checkbox' ? false : '');
        let placeholder = allSame ? '' : '（混合值）';
        
        let inputHtml = '';
        switch (attrDef.type) {
            case 'checkbox':
                inputHtml = `<input type="checkbox" id="custom_attr_${attrDef.id}" ${value ? 'checked' : ''}>`;
                break;
            case 'text':
                inputHtml = `<input type="text" id="custom_attr_${attrDef.id}" value="${escapeHtml(value)}" placeholder="${placeholder}" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px;">`;
                break;
            case 'date':
                inputHtml = `<input type="date" id="custom_attr_${attrDef.id}" value="${escapeHtml(value)}" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px;">`;
                break;
        }
        
        return `
            <div class="custom-attr-item" style="margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <label style="font-weight: 500;">${escapeHtml(attrDef.name)}</label>
                    ${!allSame ? '<span style="color: #999; font-size: 11px;">(混合)</span>' : ''}
                </div>
                ${inputHtml}
            </div>
        `;
    }).join('');
}

/**
 * 隐藏属性面板（非文档选中时）
 */
function hideAttributePanelIfNoSelection() {
    const panel = document.getElementById('attributePanel');
    if (panel) panel.style.display = 'none';
}

export function expandAll() {
    console.log('[TreeEditor] expandAll 点击, currentTreeData 存在:', !!currentTreeData);
    if (!currentTreeData) {
        console.log('[TreeEditor] currentTreeData 为空');
        showNotification('请先打开树形编辑器', 'warning');
        return;
    }
    // 调用 clearFilter 清除筛选（其内部会 renderTree，这里再调一次以确保展开状态生效）
    clearFilter();
    setAllExpanded(currentTreeData, true);
    renderTree();
    if (selectedNode) selectNode(selectedNode);
    console.log('[TreeEditor] 展开完成');
}

export function collapseAll() {
    console.log('[TreeEditor] collapseAll 点击, currentTreeData 存在:', !!currentTreeData);
    if (!currentTreeData) {
        console.log('[TreeEditor] currentTreeData 为空');
        showNotification('请先打开树形编辑器', 'warning');
        return;
    }
    // 清除筛选标记
    clearFilter();
    // 将所有节点折叠（保留根节点展开），以确保视觉上折叠至最顶层
    setAllExpanded(currentTreeData, false);
    if (currentTreeData) currentTreeData.expanded = true; // 保持根节点可见
    renderTree();
    if (selectedNode) selectNode(selectedNode);
    console.log('[TreeEditor] 折叠完成');
}

/**
 * 递归折叠到项目周期级别
 * 根节点和周期节点保持展开，周期下的子节点折叠
 */
function collapseToCycleLevel(node) {
    if (node.type === 'root') {
        // 根节点保持展开
        node.expanded = true;
        if (node.children) {
            node.children.forEach(child => collapseToCycleLevel(child));
        }
    } else if (node.type === 'cycle') {
        // 周期节点保持展开，但其子节点折叠
        node.expanded = true;
        if (node.children) {
            node.children.forEach(child => {
                child.expanded = false;
                // 递归折叠所有子节点
                collapseAllChildren(child);
            });
        }
    }
}

/**
 * 递归折叠所有子节点
 */
function collapseAllChildren(node) {
    node.expanded = false;
    if (node.children) {
        node.children.forEach(child => collapseAllChildren(child));
    }
}

function setAllExpanded(node, expanded) {
    node.expanded = expanded;
    if (node.children) {
        node.children.forEach(child => setAllExpanded(child, expanded));
    }
}

// ==================== 数据转换 ====================

/**
 * 将 attributes 对象转换为 requirement 字符串
 */
function attributesToRequirement(attributes) {
    const requirements = [];
    
    if (attributes.party_a_sign) requirements.push('甲方签字');
    if (attributes.party_b_sign) requirements.push('乙方签字');
    if (attributes.party_a_seal) requirements.push('甲方盖章');
    if (attributes.party_b_seal) requirements.push('乙方盖章');
    if (attributes.need_doc_number) requirements.push('发文号');
    if (attributes.need_doc_date) requirements.push('文档日期');
    if (attributes.need_sign_date) requirements.push('签字日期');
    
    return requirements.join('、') || '';
}

/**
 * 将树形数据转换回配置格式
 * 新格式：required_docs 为对象数组
 * 同时将目录数据保存到 categories 中，与文档管理界面共享
 */
function treeToConfig() {
    const config = {
        cycles: [],
        documents: {},
        custom_attribute_definitions: customAttributeDefinitions
    };

    if (!currentTreeData.children) return config;

    currentTreeData.children.forEach(cycleNode => {
        if (cycleNode.type === 'cycle') {
            config.cycles.push(cycleNode.name);

            const requiredDocs = [];
            const categories = {};

            if (cycleNode.children) {
                cycleNode.children.forEach(child => {
                    if (child.type === 'document') {
                        const docObj = {
                            name: child.name,
                            attributes: child.attributes || {},
                            doc_note: child.doc_note || '',
                            filename_template: child.filename_template || '',
                            match_keywords: child.match_keywords || []
                        };
                        
                        // 将 attributes 转换为 requirement 字符串，供主页显示
                        docObj.requirement = attributesToRequirement(child.attributes || {});
                        
                        // 收集该文档下的所有目录名称，保存到 categories
                        const docCategories = [];
                        if (child.children && child.children.length > 0) {
                            docObj.children = child.children
                                .filter(c => c.type === 'folder')
                                .map(folder => {
                                    // 收集目录名称
                                    docCategories.push(folder.name);
                                    return {
                                        type: 'folder',
                                        name: folder.name,
                                        attributes: folder.attributes || {},
                                        filename_template: folder.filename_template || '',
                                        match_keywords: folder.match_keywords || [],
                                        files: (folder.children || [])
                                            .filter(f => f.type === 'file')
                                            .map(f => ({
                                                name: f.name,
                                                match_keywords: f.match_keywords || []
                                            }))
                                    };
                                });
                        }
                        
                        // 将目录名称保存到 categories 中
                        if (docCategories.length > 0) {
                            categories[child.name] = docCategories;
                        }
                        
                        requiredDocs.push(docObj);
                    } else if (child.type === 'folder') {
                        // 周期下的顶级目录
                        requiredDocs.push({
                            type: 'folder',
                            name: child.name,
                            attributes: child.attributes || {},
                            filename_template: child.filename_template || '',
                            match_keywords: child.match_keywords || [],
                            files: (child.children || []).map(f => ({
                                name: typeof f === 'object' ? f.name : f,
                                match_keywords: f.match_keywords || []
                            }))
                        });
                    }
                });
            }

            config.documents[cycleNode.name] = {
                required_docs: requiredDocs,
                uploaded_docs: [],
                categories: categories
            };
        }
    });

    return config;
}

// ==================== 保存 ====================

export async function saveTreeConfig() {
    const newConfig = treeToConfig();
    
    console.log('[saveTreeConfig] newConfig.custom_attribute_definitions:', newConfig.custom_attribute_definitions);
    console.log('[saveTreeConfig] customAttributeDefinitions:', customAttributeDefinitions);
    
    // 合并现有配置，保留 uploaded_docs 等重要数据
    const existingConfig = appState.projectConfig || {};
    if (existingConfig.documents) {
        for (const cycle in newConfig.documents) {
            if (existingConfig.documents[cycle]) {
                // 保留 uploaded_docs
                newConfig.documents[cycle].uploaded_docs = existingConfig.documents[cycle].uploaded_docs || [];
                // 保留其他可能存在的数据（如 cycle_confirmed 等）
                for (const key in existingConfig.documents[cycle]) {
                    if (!newConfig.documents[cycle].hasOwnProperty(key)) {
                        newConfig.documents[cycle][key] = existingConfig.documents[cycle][key];
                    }
                }
            }
        }
    }
    
    // 保留根级别的其他配置数据
    for (const key in existingConfig) {
        if (!newConfig.hasOwnProperty(key)) {
            newConfig[key] = existingConfig[key];
        }
    }

    showConfirmModal(
        '确认保存',
        '保存将覆盖当前配置，确定要继续吗？\n（未保存的草稿将被自动清除）',
        async () => {
            showLoading(true);
            updateAutoSaveStatus('saving');
            try {
                const response = await fetch(`/api/projects/${appState.currentProjectId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newConfig)
                });

                const result = await response.json();

                if (result.status === 'success') {
                    showNotification('配置保存成功', 'success');
                    appState.projectConfig = newConfig;
                    hasUnsavedChanges = false;
                    clearDrafts();
                    updateAutoSaveStatus('saved', new Date().toISOString());
                    closeTreeEditor();
                    renderCycles(newConfig.cycles || []);
                    
                    // 如果当前正在查看某个周期，刷新文档列表
                    if (appState.currentCycle) {
                        const { renderCycleDocuments } = await import('./document.js');
                        await renderCycleDocuments(appState.currentCycle);
                    } else {
                        renderInitialContent();
                    }
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
    );
}

// ==================== 模板功能 ====================

export async function saveTreeAsTemplate() {
    const modal = document.getElementById('saveTemplateModal');
    if (modal) openModal(modal);
}

export async function loadTemplateToTree() {
    const modal = document.getElementById('templateLibraryModal');
    if (!modal) return;
    openModal(modal);
    await loadTemplateList();
}

export async function openTemplateManageModal() {
    const modal = document.getElementById('templateManageModal');
    if (!modal) return;
    openModal(modal);
    await loadTemplateListForManage();
}

async function loadTemplateListForManage() {
    const container = document.getElementById('templateManageList');
    if (!container) return;

    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await fetch('/api/projects/templates');
        const result = await response.json();

        if (result.status !== 'success') throw new Error(result.message || '加载失败');

        const templates = result.templates || [];
        if (templates.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无模板</p></div>';
            return;
        }

        container.innerHTML = templates.map(t => `
            <div class="template-item" data-id="${t.id}">
                <div class="template-info">
                    <h4>${escapeHtml(t.name)}</h4>
                    <p class="template-meta">周期: ${t.cycle_count} | 文档: ${t.document_count}</p>
                    <p class="template-description">${escapeHtml(t.description || '')}</p>
                </div>
                <div class="template-actions">
                    <button class="btn btn-sm btn-primary" onclick="loadTemplateToTreeEditor('${t.id}')">加载</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTemplateConfirm('${t.id}', '${escapeHtml(t.name)}')">删除</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载模板列表失败:', error);
        container.innerHTML = `<div class="error-state">加载失败: ${error.message}</div>`;
    }
}

window.deleteTemplateConfirm = function(templateId, templateName) {
    showConfirmModal(
        '确认删除',
        `确定要删除模板"${templateName}"吗？`,
        async () => {
            try {
                const response = await fetch(`/api/projects/templates/${templateId}`, {
                    method: 'DELETE'
                });
                const result = await response.json();
                if (result.status === 'success') {
                    showNotification('模板删除成功', 'success');
                    await loadTemplateListForManage();
                } else {
                    showNotification('删除失败: ' + result.message, 'error');
                }
            } catch (error) {
                showNotification('删除失败: ' + error.message, 'error');
            }
        }
    );
};

// ==================== 导入/导出功能 ====================

/**
 * 打开导入模块模态框
 */
export function openImportModuleModal() {
    const modal = document.getElementById('importModuleModal');
    if (modal) {
        // 重置表单
        const fileInput = document.getElementById('importModuleFile');
        if (fileInput) fileInput.value = '';
        openModal(modal);
    }
}

/**
 * 关闭导入模块模态框
 */
export function closeImportModuleModal() {
    const modal = document.getElementById('importModuleModal');
    if (modal) closeModal(modal);
}

/**
 * 确认导入模块
 */
export async function confirmImportModule() {
    const fileInput = document.getElementById('importModuleFile');
    const modeSelect = document.getElementById('importModuleMode');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showNotification('请选择要导入的文件', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const mode = modeSelect ? modeSelect.value : 'merge';
    
    try {
        let importedData;
        
        if (file.name.endsWith('.json')) {
            // 处理JSON文件
            const content = await file.text();
            importedData = JSON.parse(content);
            
            // 验证数据结构
            if (!importedData.cycles || !Array.isArray(importedData.cycles)) {
                showNotification('无效的文档需求配置文件：缺少周期数据', 'error');
                return;
            }
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            // 处理Excel文件
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/api/projects/load', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (result.status !== 'success') {
                throw new Error(result.message || 'Excel文件解析失败');
            }
            
            importedData = result.data;
        } else {
            showNotification('不支持的文件格式，仅支持JSON和Excel文件', 'error');
            return;
        }
        
        // 转换导入的数据为树形结构
        const importedTreeData = buildTreeData(importedData);
        
        if (mode === 'replace') {
            // 替换模式：直接使用导入的数据
            currentTreeData = importedTreeData;
        } else {
            // 合并模式：合并到现有数据
            mergeTreeData(currentTreeData, importedTreeData);
        }
        
        // 重新渲染树
        renderTree();
        markDirty();
        
        closeImportModuleModal();
        showNotification(`文档需求导入成功（${mode === 'replace' ? '替换' : '合并'}模式）`, 'success');
        
    } catch (error) {
        console.error('导入失败:', error);
        showNotification('导入失败: ' + error.message, 'error');
    }
}

/**
 * 合并树数据（合并模式使用）
 */
function mergeTreeData(target, source) {
    if (!source.children) return;
    
    source.children.forEach(sourceCycle => {
        // 查找是否已存在相同周期的节点
        const existingCycle = target.children.find(c => c.name === sourceCycle.name);
        
        if (existingCycle) {
            // 合并周期下的文档
            if (sourceCycle.children) {
                sourceCycle.children.forEach(sourceDoc => {
                    const existingDoc = existingCycle.children.find(d => d.name === sourceDoc.name);
                    if (!existingDoc) {
                        // 添加新文档
                        existingCycle.children.push(sourceDoc);
                    }
                });
            }
        } else {
            // 添加新周期
            target.children.push(sourceCycle);
        }
    });
}

/**
 * 导出当前树配置为JSON文件
 */
export function exportTreeConfig() {
    if (!currentTreeData) {
        showNotification('没有可导出的数据', 'error');
        return;
    }
    
    const config = treeToConfig();
    const projectName = appState.projectConfig?.name || '项目';
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    const exportData = {
        name: projectName,
        export_time: new Date().toISOString(),
        ...config
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_文档需求_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('文档需求导出成功', 'success');
}

async function loadTemplateList() {
    const container = document.getElementById('templateListContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await fetch('/api/projects/templates');
        const result = await response.json();

        if (result.status !== 'success') throw new Error(result.message || '加载失败');

        const templates = result.templates || [];
        if (templates.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无模板</p></div>';
            return;
        }

        container.innerHTML = templates.map(t => `
            <div class="template-item" data-id="${t.id}">
                <div class="template-info">
                    <h4>${escapeHtml(t.name)}</h4>
                    <p class="template-meta">周期: ${t.cycle_count} | 文档: ${t.document_count}</p>
                </div>
                <div class="template-actions">
                    <button class="btn btn-sm btn-primary" onclick="loadTemplateToTreeEditor('${t.id}')">加载</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载模板列表失败:', error);
        container.innerHTML = `<div class="error-state">加载失败: ${error.message}</div>`;
    }
}

window.loadTemplateToTreeEditor = async function(templateId) {
    showLoading(true);
    try {
        const response = await fetch(`/api/projects/templates/${templateId}`);
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message || '加载失败');

        const template = result.template;
        const tempConfig = {
            cycles: template.cycles || [],
            documents: template.documents || {}
        };

        currentTreeData = buildTreeData(tempConfig);
        renderTree();
        closeModal(document.getElementById('templateLibraryModal'));
        showNotification('模板加载成功，请保存配置', 'success');
        markDirty();
    } catch (error) {
        console.error('加载模板失败:', error);
        showNotification('加载失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};

// 导入/导出功能的全局绑定
window.openImportModuleModal = openImportModuleModal;
window.closeImportModuleModal = closeImportModuleModal;
window.confirmImportModule = confirmImportModule;
window.exportTreeConfig = exportTreeConfig;

// 模板管理功能的全局绑定
window.openTemplateManageModal = openTemplateManageModal;

// ==================== 筛选功能 ====================

let filterText = '';
let filterType = 'all';
let filterDebounceTimer = null;

/**
 * 设置筛选条件
 */
export function setFilter(text, type) {
    filterText = text.toLowerCase().trim();
    filterType = type;
    applyFilter();
}

/**
 * 应用筛选
 */
function applyFilter() {
    if (!currentTreeData) return;
    
    // 递归设置节点的可见性
    setNodeVisibility(currentTreeData);
    
    // 重新渲染树
    renderTree();
    
    // 如果有选中节点，保持选中
    if (selectedNode) {
        selectNode(selectedNode);
    }
}

/**
 * 递归设置节点可见性
 * 返回：该节点或其子节点是否匹配
 */
function setNodeVisibility(node) {
    // 检查当前节点是否匹配
    const matchesText = !filterText || node.name.toLowerCase().includes(filterText);
    const matchesType = filterType === 'all' || node.type === filterType;
    const isMatch = matchesText && matchesType;
    
    // 检查子节点
    let childHasMatch = false;
    if (node.children) {
        for (const child of node.children) {
            if (setNodeVisibility(child)) {
                childHasMatch = true;
            }
        }
    }
    
    // 设置可见性：当前节点匹配，或有子节点匹配
    node._filtered = !(isMatch || childHasMatch);
    
    // 如果有匹配，自动展开父节点
    if (isMatch || childHasMatch) {
        node.expanded = true;
    }
    
    return isMatch || childHasMatch;
}

/**
 * 清除筛选
 */
export function clearFilter() {
    filterText = '';
    filterType = 'all';
    
    // 清除所有节点的筛选标记
    function clearNodeFilter(node) {
        node._filtered = false;
        if (node.children) {
            node.children.forEach(clearNodeFilter);
        }
    }
    
    if (currentTreeData) {
        clearNodeFilter(currentTreeData);
    }
    
    renderTree();
}

// 筛选功能的全局绑定
window.setTreeFilter = setFilter;
window.clearTreeFilter = clearFilter;

// 展开/折叠功能的全局绑定
window.expandAllTree = expandAll;
window.collapseAllTree = collapseAll;

// ==================== 自定义属性功能 ====================

/**
 * 渲染自定义属性列表
 */
function renderCustomAttributes(node) {
    const container = document.getElementById('customAttributesList');
    if (!container) return;
    
    if (customAttributeDefinitions.length === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 12px;">暂无自定义属性</p>';
        return;
    }
    
    const attrs = node.attributes || {};
    
    container.innerHTML = customAttributeDefinitions.map(attrDef => {
        const value = attrs[attrDef.id] || (attrDef.type === 'checkbox' ? false : '');
        let inputHtml = '';
        
        switch (attrDef.type) {
            case 'checkbox':
                inputHtml = `<input type="checkbox" id="custom_attr_${attrDef.id}" ${value ? 'checked' : ''}>`;
                break;
            case 'text':
                inputHtml = `<input type="text" id="custom_attr_${attrDef.id}" value="${escapeHtml(value)}" placeholder="请输入" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px;">`;
                break;
            case 'date':
                inputHtml = `<input type="date" id="custom_attr_${attrDef.id}" value="${escapeHtml(value)}" style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px;">`;
                break;
        }
        
        return `
            <div class="custom-attr-item" style="margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <label style="font-weight: 500;">${escapeHtml(attrDef.name)}</label>
                    <button class="btn btn-sm btn-danger" onclick="deleteCustomAttr('${attrDef.id}')" style="padding: 2px 6px; font-size: 11px;">删除</button>
                </div>
                ${inputHtml}
            </div>
        `;
    }).join('');
}

/**
 * 打开添加自定义属性模态框
 */
export function openCustomAttrModal() {
    const modal = document.getElementById('customAttrModal');
    if (modal) {
        // 重置表单
        const nameInput = document.getElementById('customAttrName');
        const typeSelect = document.getElementById('customAttrType');
        if (nameInput) nameInput.value = '';
        if (typeSelect) typeSelect.value = 'checkbox';
        
        openModal(modal);
    }
}

/**
 * 关闭添加自定义属性模态框
 */
export function closeCustomAttrModal() {
    const modal = document.getElementById('customAttrModal');
    if (modal) closeModal(modal);
}

/**
 * 确认添加自定义属性
 */
export function confirmAddCustomAttr() {
    const nameInput = document.getElementById('customAttrName');
    const typeSelect = document.getElementById('customAttrType');
    
    const name = nameInput ? nameInput.value.trim() : '';
    const type = typeSelect ? typeSelect.value : 'checkbox';
    
    if (!name) {
        showNotification('请输入属性名称', 'error');
        return;
    }
    
    // 检查是否已存在同名属性
    const existing = customAttributeDefinitions.find(a => a.name === name);
    if (existing) {
        showNotification('属性名称已存在', 'error');
        return;
    }
    
    // 生成唯一ID
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    customAttributeDefinitions.push({
        id,
        name,
        type
    });
    
    console.log('[confirmAddCustomAttr] 添加后 customAttributeDefinitions:', customAttributeDefinitions);
    
    // 刷新属性面板
    const panel = document.getElementById('attributePanel');
    if (panel) {
        const nodeId = panel.dataset.editingNodeId;
        if (nodeId) {
            const node = findNode(currentTreeData, nodeId);
            if (node) renderCustomAttributes(node);
        }
    }
    
    closeCustomAttrModal();
    showNotification('自定义属性添加成功', 'success');
    markDirty();
}

/**
 * 删除自定义属性
 */
export function deleteCustomAttr(attrId) {
    showConfirmModal('确认删除', '删除后所有文档的该属性值将被清除，确定要继续吗？', () => {
        // 从定义列表中移除
        customAttributeDefinitions = customAttributeDefinitions.filter(a => a.id !== attrId);
        
        // 从所有节点的 attributes 中移除
        function removeAttrFromNode(node) {
            if (node.attributes && node.attributes[attrId] !== undefined) {
                delete node.attributes[attrId];
            }
            if (node.children) {
                node.children.forEach(removeAttrFromNode);
            }
        }
        
        if (currentTreeData) {
            removeAttrFromNode(currentTreeData);
        }
        
        // 刷新属性面板
        const panel = document.getElementById('attributePanel');
        if (panel) {
            const nodeId = panel.dataset.editingNodeId;
            if (nodeId) {
                const node = findNode(currentTreeData, nodeId);
                if (node) renderCustomAttributes(node);
            }
        }
        
        showNotification('自定义属性已删除', 'success');
        markDirty();
    });
}

// 自定义属性的全局绑定
window.openCustomAttrModal = openCustomAttrModal;
window.closeCustomAttrModal = closeCustomAttrModal;
window.confirmAddCustomAttr = confirmAddCustomAttr;
window.deleteCustomAttr = deleteCustomAttr;
