/**
 * 文档浏览器模块 — 浏览项目上传目录的文件树，预览文件，对比文档
 */
import { appState } from './app-state.js';
import { showNotification, showLoading } from './ui.js';

let compareSelections = []; // 最多2个文件用于对比

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ========== 文件预览URL ========== */
function getPreviewUrl(file) {
    if (file.match_details && file.match_details.length > 0 && file.match_details[0].doc_id) {
        return `/api/documents/view/${encodeURIComponent(file.match_details[0].doc_id)}`;
    }
    return `/api/documents/files/preview-by-path?path=${encodeURIComponent(file.path)}`;
}

/* ========== 渲染文件树 ========== */

function renderTree(nodes, depth = 0) {
    let html = '';
    for (const node of nodes) {
        if (node.type === 'dir') {
            html += renderDirNode(node, depth);
        } else {
            html += renderFileNode(node, depth);
        }
    }
    return html;
}

function renderDirNode(node, depth) {
    const indent = depth * 20;
    const dirId = 'db-dir-' + btoa(encodeURIComponent(node.rel_path)).replace(/[=+/]/g, '_');
    return `
        <div style="margin-left:${indent}px;margin-bottom:2px;">
            <div class="db-dir-header" data-dir-id="${dirId}" style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:linear-gradient(135deg,#e8f0fe,#f0f5ff);border:1px solid #d0ddf5;border-radius:5px;cursor:pointer;user-select:none;font-weight:600;color:#2c3e50;">
                <span class="db-dir-toggle" style="font-size:11px;transition:transform 0.18s;display:inline-block;min-width:12px;">▼</span>
                <span style="font-size:13px;">📁</span>
                <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(node.name)}</span>
                <span style="color:#888;font-size:11px;flex-shrink:0;">(${node.matched_count || 0}/${node.file_count})</span>
            </div>
            <div class="db-dir-children" id="${dirId}" style="display:block;">
                ${renderTree(node.children || [], depth + 1)}
            </div>
        </div>`;
}

function renderFileNode(node, depth) {
    const indent = depth * 20;
    const isMatched = node.matched;
    const matchBadge = isMatched
        ? `<span style="background:#28a745;color:#fff;padding:1px 7px;border-radius:3px;font-size:11px;white-space:nowrap;">已被使用</span>`
        : '';
    const matchInfo = (node.match_details || []).map(d =>
        `<span style="color:#555;font-size:11px;margin-left:6px;">(${escapeHtml(d.cycle)} - ${escapeHtml(d.doc_name)})</span>`
    ).join('');
    const ext = (node.ext || '').replace('.', '');
    const icon = ['pdf'].includes(ext) ? '📄' : ['doc','docx'].includes(ext) ? '📝' : ['xls','xlsx'].includes(ext) ? '📊' : ['ppt','pptx'].includes(ext) ? '📽️' : ['png','jpg','jpeg','tiff','gif','bmp'].includes(ext) ? '🖼️' : '📎';
    const pathAttr = escapeAttr(node.path);
    const nameAttr = escapeAttr(node.name);

    return `
        <div class="db-file-row" style="margin-left:${indent}px;display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;" data-path="${pathAttr}" data-name="${nameAttr}">
            <input type="checkbox" class="db-compare-check" data-path="${pathAttr}" data-name="${nameAttr}" title="选择对比" style="flex-shrink:0;cursor:pointer;">
            <span style="flex-shrink:0;">${icon}</span>
            <a href="#" class="db-file-link" data-path="${pathAttr}" data-name="${nameAttr}" style="flex:1;color:#1a73e8;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${nameAttr}">${escapeHtml(node.name)}</a>
            <span style="color:#999;font-size:11px;flex-shrink:0;">${formatFileSize(node.size)}</span>
            ${matchBadge}${matchInfo}
        </div>`;
}

/* ========== 主入口：打开文档浏览器 ========== */

export async function openDocumentBrowser() {
    const projectId = appState.currentProjectId;
    const projectName = appState.projectConfig?.name;
    if (!projectId || !projectName) {
        showNotification('请先选择项目', 'error');
        return;
    }

    compareSelections = [];

    // 移除旧弹窗
    let modal = document.getElementById('docBrowserModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'docBrowserModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:10px;width:92vw;max-width:1200px;height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #e0e0e0;background:#f8f9fa;border-radius:10px 10px 0 0;">
                <h3 style="margin:0;font-size:16px;color:#333;">📂 文档浏览 — ${escapeHtml(projectName)}</h3>
                <div style="display:flex;align-items:center;gap:10px;">
                    <input type="text" id="dbSearchInput" placeholder="搜索文件名..." style="padding:5px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;width:200px;">
                    <button id="dbCompareBtn" class="btn btn-sm btn-info" style="display:none;">📊 对比选中文档 (0)</button>
                    <button id="dbCloseBtn" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;padding:0 4px;">✕</button>
                </div>
            </div>
            <div id="dbTreeContainer" style="flex:1;overflow-y:auto;padding:10px 16px;">
                <div style="text-align:center;padding:40px;color:#999;">加载中...</div>
            </div>
            <div style="padding:8px 20px;border-top:1px solid #e0e0e0;background:#f8f9fa;border-radius:0 0 10px 10px;font-size:12px;color:#888;" id="dbStatusBar">
                共 0 个文件
            </div>
        </div>`;
    document.body.appendChild(modal);

    // 事件绑定
    modal.querySelector('#dbCloseBtn').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // 搜索
    const searchInput = modal.querySelector('#dbSearchInput');
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => filterTree(searchInput.value.trim().toLowerCase()), 300);
    });

    // 加载数据
    await loadBrowserTree();
}

async function loadBrowserTree() {
    const container = document.getElementById('dbTreeContainer');
    if (!container) return;

    try {
        showLoading(true);
        const resp = await fetch(`/api/documents/files/browse-tree?project_id=${encodeURIComponent(appState.currentProjectId)}&project_name=${encodeURIComponent(appState.projectConfig.name)}`);
        const result = await resp.json();

        if (result.status !== 'success') {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#dc3545;">${escapeHtml(result.message || '加载失败')}</div>`;
            return;
        }

        if (!result.tree || result.tree.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无上传文件</div>';
            return;
        }

        container.innerHTML = renderTree(result.tree);
        const statusBar = document.getElementById('dbStatusBar');
        if (statusBar) statusBar.textContent = `共 ${result.total || 0} 个文件，已使用 ${result.matched_total || 0} 个`;

        bindTreeEvents(container);
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#dc3545;">加载失败: ${escapeHtml(e.message)}</div>`;
    } finally {
        showLoading(false);
    }
}

function bindTreeEvents(container) {
    // 目录折叠
    container.querySelectorAll('.db-dir-header').forEach(header => {
        header.addEventListener('click', () => {
            const dirId = header.dataset.dirId;
            const children = document.getElementById(dirId);
            const toggle = header.querySelector('.db-dir-toggle');
            if (children) {
                const isOpen = children.style.display !== 'none';
                children.style.display = isOpen ? 'none' : 'block';
                if (toggle) toggle.style.transform = isOpen ? 'rotate(-90deg)' : '';
            }
        });
    });

    // 文件点击预览
    container.querySelectorAll('.db-file-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const filePath = link.dataset.path;
            const fileName = link.dataset.name;
            openFilePreview(filePath, fileName);
        });
    });

    // 对比复选框
    container.querySelectorAll('.db-compare-check').forEach(cb => {
        cb.addEventListener('change', () => {
            updateCompareSelections();
        });
    });
}

function updateCompareSelections() {
    const checked = document.querySelectorAll('.db-compare-check:checked');
    compareSelections = Array.from(checked).map(cb => ({
        path: cb.dataset.path,
        name: cb.dataset.name
    }));

    // 限制最多2个
    if (compareSelections.length > 2) {
        const oldest = checked[0];
        oldest.checked = false;
        compareSelections.shift();
    }

    const btn = document.getElementById('dbCompareBtn');
    if (btn) {
        btn.style.display = compareSelections.length > 0 ? '' : 'none';
        btn.textContent = `📊 对比选中文档 (${compareSelections.length})`;
        btn.onclick = compareSelections.length === 2 ? () => openDocumentCompare(compareSelections[0], compareSelections[1]) : null;
        btn.disabled = compareSelections.length !== 2;
    }
}

function filterTree(keyword) {
    const container = document.getElementById('dbTreeContainer');
    if (!container) return;

    container.querySelectorAll('.db-file-row').forEach(row => {
        const name = (row.dataset.name || '').toLowerCase();
        row.style.display = !keyword || name.includes(keyword) ? '' : 'none';
    });

    // 展开包含匹配文件的目录
    if (keyword) {
        container.querySelectorAll('.db-dir-children').forEach(dir => {
            const hasVisible = dir.querySelector('.db-file-row:not([style*="display: none"])');
            dir.style.display = hasVisible ? 'block' : 'none';
            const header = dir.previousElementSibling;
            if (header) {
                header.style.display = hasVisible ? '' : 'none';
                const toggle = header.querySelector('.db-dir-toggle');
                if (toggle && hasVisible) toggle.style.transform = '';
            }
        });
    } else {
        container.querySelectorAll('.db-dir-children').forEach(dir => { dir.style.display = 'block'; });
        container.querySelectorAll('.db-dir-header').forEach(h => { h.style.display = ''; });
    }
}

/* ========== 文件预览 ========== */

function openFilePreview(filePath, fileName) {
    let previewModal = document.getElementById('dbPreviewModal');
    if (previewModal) previewModal.remove();

    const url = `/api/documents/files/preview-by-path?path=${encodeURIComponent(filePath)}`;
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const isPdf = ext === 'pdf';
    const isImage = ['png','jpg','jpeg','gif','bmp','tiff'].includes(ext);
    const isOffice = ['doc','docx','xls','xlsx','ppt','pptx'].includes(ext);

    previewModal = document.createElement('div');
    previewModal.id = 'dbPreviewModal';
    previewModal.className = 'modal-overlay';
    previewModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;';

    let contentHtml;
    if (isPdf || isOffice) {
        contentHtml = `<iframe src="${url}" style="width:100%;height:100%;border:none;"></iframe>`;
    } else if (isImage) {
        contentHtml = `<div style="display:flex;align-items:center;justify-content:center;height:100%;overflow:auto;"><img src="${url}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    } else {
        contentHtml = `<iframe src="${url}" style="width:100%;height:100%;border:none;"></iframe>`;
    }

    previewModal.innerHTML = `
        <div style="background:#fff;border-radius:10px;width:90vw;max-width:1100px;height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid #e0e0e0;background:#f8f9fa;border-radius:10px 10px 0 0;">
                <span style="font-size:14px;font-weight:600;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(fileName)}</span>
                <button id="dbPreviewClose" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">✕</button>
            </div>
            <div style="flex:1;overflow:hidden;">${contentHtml}</div>
        </div>`;
    document.body.appendChild(previewModal);

    previewModal.querySelector('#dbPreviewClose').onclick = () => previewModal.remove();
    previewModal.addEventListener('click', (e) => { if (e.target === previewModal) previewModal.remove(); });
}

/* ========== 文档对比 ========== */

function openDocumentCompare(fileA, fileB) {
    let compareModal = document.getElementById('dbCompareModal');
    if (compareModal) compareModal.remove();

    const urlA = `/api/documents/files/preview-by-path?path=${encodeURIComponent(fileA.path)}`;
    const urlB = `/api/documents/files/preview-by-path?path=${encodeURIComponent(fileB.path)}`;

    compareModal = document.createElement('div');
    compareModal.id = 'dbCompareModal';
    compareModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:10002;display:flex;align-items:center;justify-content:center;';

    compareModal.innerHTML = `
        <div style="background:#fff;border-radius:10px;width:96vw;max-width:1600px;height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid #e0e0e0;background:#f8f9fa;border-radius:10px 10px 0 0;">
                <span style="font-size:14px;font-weight:600;color:#333;">📊 文档对比</span>
                <div style="display:flex;align-items:center;gap:12px;">
                    <label style="font-size:12px;color:#555;display:flex;align-items:center;gap:4px;">
                        <input type="checkbox" id="dbSyncScroll" checked> 同步滚动
                    </label>
                    <button id="dbCompareClose" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">✕</button>
                </div>
            </div>
            <div style="display:flex;flex:1;overflow:hidden;">
                <div style="flex:1;display:flex;flex-direction:column;border-right:2px solid #e0e0e0;">
                    <div style="padding:6px 12px;background:#e8f5e9;font-size:12px;font-weight:600;color:#2e7d32;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(fileA.name)}">左：${escapeHtml(fileA.name)}</div>
                    <div style="flex:1;overflow:hidden;">
                        <iframe id="dbCompareFrameA" src="${urlA}" style="width:100%;height:100%;border:none;"></iframe>
                    </div>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;">
                    <div style="padding:6px 12px;background:#e3f2fd;font-size:12px;font-weight:600;color:#1565c0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(fileB.name)}">右：${escapeHtml(fileB.name)}</div>
                    <div style="flex:1;overflow:hidden;">
                        <iframe id="dbCompareFrameB" src="${urlB}" style="width:100%;height:100%;border:none;"></iframe>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(compareModal);

    compareModal.querySelector('#dbCompareClose').onclick = () => compareModal.remove();
    compareModal.addEventListener('click', (e) => { if (e.target === compareModal) compareModal.remove(); });

    // 同步滚动
    setupSyncScroll();
}

function setupSyncScroll() {
    const frameA = document.getElementById('dbCompareFrameA');
    const frameB = document.getElementById('dbCompareFrameB');
    const syncCheckbox = document.getElementById('dbSyncScroll');
    if (!frameA || !frameB) return;

    let syncing = false;

    function onFrameLoad(sourceFrame, targetFrame) {
        try {
            const sourceDoc = sourceFrame.contentDocument || sourceFrame.contentWindow.document;
            const targetDoc = targetFrame.contentDocument || targetFrame.contentWindow.document;

            // PDF 在 iframe 中由浏览器内置查看器渲染，
            // 我们尝试监听 iframe 内部的 scroll 事件
            const sourceWin = sourceFrame.contentWindow;
            const targetWin = targetFrame.contentWindow;

            sourceWin.addEventListener('scroll', () => {
                if (syncing || !(syncCheckbox && syncCheckbox.checked)) return;
                syncing = true;
                try {
                    const scrollTop = sourceWin.scrollY || sourceDoc.documentElement.scrollTop || 0;
                    const scrollHeight = sourceDoc.documentElement.scrollHeight || 1;
                    const clientHeight = sourceDoc.documentElement.clientHeight || 1;
                    const ratio = scrollTop / Math.max(1, scrollHeight - clientHeight);

                    const targetScrollHeight = targetDoc.documentElement.scrollHeight || 1;
                    const targetClientHeight = targetDoc.documentElement.clientHeight || 1;
                    const targetScrollTop = ratio * Math.max(0, targetScrollHeight - targetClientHeight);
                    targetWin.scrollTo(0, targetScrollTop);
                } catch (e) { /* cross-origin */ }
                syncing = false;
            });

            targetWin.addEventListener('scroll', () => {
                if (syncing || !(syncCheckbox && syncCheckbox.checked)) return;
                syncing = true;
                try {
                    const scrollTop = targetWin.scrollY || targetDoc.documentElement.scrollTop || 0;
                    const scrollHeight = targetDoc.documentElement.scrollHeight || 1;
                    const clientHeight = targetDoc.documentElement.clientHeight || 1;
                    const ratio = scrollTop / Math.max(1, scrollHeight - clientHeight);

                    const sourceScrollHeight = sourceDoc.documentElement.scrollHeight || 1;
                    const sourceClientHeight = sourceDoc.documentElement.clientHeight || 1;
                    const sourceScrollTop = ratio * Math.max(0, sourceScrollHeight - sourceClientHeight);
                    sourceWin.scrollTo(0, sourceScrollTop);
                } catch (e) { /* cross-origin */ }
                syncing = false;
            });
        } catch (e) {
            // cross-origin iframe — 无法同步滚动
        }
    }

    frameA.addEventListener('load', () => onFrameLoad(frameA, frameB));
    frameB.addEventListener('load', () => onFrameLoad(frameB, frameA));
}