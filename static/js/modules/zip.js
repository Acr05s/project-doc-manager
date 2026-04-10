/**
 * ZIP模块 - 处理ZIP文件相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, showConfirmModal, closeModal } from './ui.js';
import { loadZipPackages, searchZipFiles, deleteZipPackage, loadProject } from './api.js';
import { renderCycleDocuments } from './document.js';

/**
 * 加载ZIP包列表
 */
export async function loadZipPackagesList() {
    try {
        const packages = await loadZipPackages(appState.currentProjectId);
        
        // 使用 zipPackageSelect，与 directorySelect 区分开
        const zipPackageSelect = document.getElementById('zipPackageSelect');
        if (zipPackageSelect) {
            zipPackageSelect.innerHTML = '<option value="">-- 选择文档包 --</option>';
            
            if (packages.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无已上传的ZIP包';
                option.disabled = true;
                zipPackageSelect.appendChild(option);
            } else {
                packages.forEach(pkg => {
                    const option = document.createElement('option');
                    option.value = pkg.path;
                    option.textContent = `${pkg.name}（${pkg.file_count}个文件）`;
                    zipPackageSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载ZIP包列表失败:', error);
        showNotification('加载ZIP包列表失败', 'error');
    }
}

/**
 * 格式化路径显示，提取目录名
 * @param {string} path - 原始路径
 * @returns {string} 格式化后的目录名
 */
function formatPathDisplay(path) {
    if (!path) return '';
    
    // 统一使用正斜杠处理路径（处理Windows反斜杠）
    let formatted = path.replace(/\\/g, '/');
    
    // 移除 projects/xxx/uploads/ 前缀
    const uploadsMatch = formatted.match(/(?:projects\/[^\/]+\/uploads\/|uploads\/)(.*)/);
    if (uploadsMatch) {
        formatted = uploadsMatch[1];
    }
    
    // 移除文件名，只保留目录部分
    const lastSlashIndex = formatted.lastIndexOf('/');
    if (lastSlashIndex > 0) {
        formatted = formatted.substring(0, lastSlashIndex);
    } else if (lastSlashIndex === 0) {
        formatted = formatted.substring(1);
    }
    
    // 将路径分割成部分进行处理
    const parts = formatted.split('/');
    
    // 过滤掉包含随机ID的部分（通常是ZIP包解压后的顶层目录）
    const filteredParts = parts.filter(part => {
        // 如果部分包含看起来像随机ID的子串（10位以上字母数字混合），则跳过
        if (/[a-z0-9]{10,}/i.test(part) && !/^[^a-z0-9]*$/.test(part)) {
            // 但如果这部分全是中文，则保留
            if (/^[\u4e00-\u9fa5\d\.]+$/.test(part.replace(/[a-z0-9]{10,}/gi, ''))) {
                return true;
            }
            return false;
        }
        return true;
    });
    
    // 如果过滤后还有内容，使用过滤后的路径
    if (filteredParts.length > 0) {
        formatted = filteredParts.join(' / ');
    }
    
    return formatted || '根目录';
}

/**
 * 将文件列表构建为目录树结构
 * @param {Array} files - 文件对象数组，每个含 rel_dir 字段
 * @returns {Object} 树节点 { name, path, children: {dirName: treeNode}, files: [] }
 */
function buildDirTree(files) {
    // root 代表虚拟根，children 是子目录 Map，files 是直属文件
    const root = { name: '', path: '', children: {}, files: [] };

    for (const file of files) {
        const relDir = (file.rel_dir || '').replace(/\\/g, '/');
        const parts = relDir ? relDir.split('/') : [];

        let node = root;
        let currentPath = '';
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!node.children[part]) {
                node.children[part] = { name: part, path: currentPath, children: {}, files: [] };
            }
            node = node.children[part];
        }
        node.files.push(file);
    }
    return root;
}

/**
 * 判断一个目录树节点是否和关键词匹配（目录名含关键词）
 */
function dirNameMatches(dirName, keyword) {
    if (!keyword) return false;
    return dirName.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * 渲染目录树为 HTML
 * @param {Object} treeNode - 树节点
 * @param {string} keyword - 搜索关键词（用于高亮）
 * @param {number} depth - 当前层级（0 = 根）
 * @param {string} parentDir - 父目录路径
 * @returns {string} HTML 字符串
 */
function renderDirTreeHtml(treeNode, keyword, depth, parentDir) {
    let html = '';
    const indent = depth * 16; // 缩进 px

    // 渲染子目录（自然排序：数字按数值大小排，如 1 < 2 < 10）
    const childDirs = Object.values(treeNode.children).sort((a, b) =>
        a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
    for (const childDir of childDirs) {
        const dirPath = childDir.path;
        const escapedDirPath = dirPath.replace(/"/g, '&quot;');

        // 计算该目录（含所有子目录）下的文件总数和已选数
        const allFilesInDir = collectAllFiles(childDir);
        const totalCount = allFilesInDir.length;
        const selectedCount = allFilesInDir.filter(f => appState.zipSelectedFiles.some(sf => sf.path === f.path)).length;
        const dirChecked = totalCount > 0 && selectedCount === totalCount;
        const dirIndeterminate = selectedCount > 0 && selectedCount < totalCount;

        // 目录名高亮
        let dirNameHtml = escapeHtml(childDir.name);
        if (keyword && childDir.name.toLowerCase().includes(keyword.toLowerCase())) {
            const idx = childDir.name.toLowerCase().indexOf(keyword.toLowerCase());
            dirNameHtml = escapeHtml(childDir.name.slice(0, idx))
                + `<mark class="zip-highlight">${escapeHtml(childDir.name.slice(idx, idx + keyword.length))}</mark>`
                + escapeHtml(childDir.name.slice(idx + keyword.length));
        }

        // 统计徽章：只在有选中时显示
        const countBadge = totalCount > 0
            ? `<span class="dir-count-badge" style="color:#5a7fa8;font-size:11px;font-weight:normal;">(${selectedCount}/${totalCount})</span>`
            : '';
        
        // 检查是否当前是根目录
        const isRootDir = appState.zipRootDirectory === dirPath;
        const rootBtnStyle = isRootDir 
            ? 'background:#28a745;color:white;border:1px solid #1e7e34;' 
            : 'background:#fff;border:1px solid #28a745;color:#28a745;';
        const rootBtnText = isRootDir ? '✓ 已设为根目录' : '设为根目录';
        
        // 为目录标题添加更明显的样式，确保按钮能被看到
        const directoryHeaderStyle = 'display:flex;align-items:center;gap:4px;padding:8px 12px;'
            + 'background:linear-gradient(135deg,#e8f0fe,#f0f5ff);'
            + 'border:1px solid #d0ddf5;border-radius:5px;'
            + 'cursor:pointer;user-select:none;font-weight:600;color:#2c3e50;'
            + 'flex-wrap:wrap;min-height:40px;'

        html += `
            <div class="directory-group" data-dir-group="${escapedDirPath}" style="margin-left:${indent}px; margin-bottom:4px;">
                <div class="directory-header zip-dir-row" data-dir="${escapedDirPath}"
                     style="${directoryHeaderStyle}">
                    <div style="flex:1;display:flex;align-items:center;gap:4px;">
                        <span class="dir-toggle-icon" style="font-size:12px;transition:transform 0.18s;display:inline-block;min-width:14px;flex-shrink:0;">▼</span>
                        <input type="checkbox" class="zip-dir-checkbox" data-dir="${escapedDirPath}"
                               ${dirChecked ? 'checked' : ''}
                               style="cursor:pointer;flex-shrink:0;"
                               onclick="event.stopPropagation();" />
                        <span class="dir-name-label" style="flex:1;min-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">📁 ${dirNameHtml}</span>
                        ${countBadge}
                    </div>
                    <div style="flex-shrink:0;">
                        <button class="set-root-btn" data-dir="${escapedDirPath}"
                                style="${rootBtnStyle}padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;flex-shrink:0;white-space:nowrap;font-weight:bold;display:inline-block;visibility:visible;"
                                onclick="event.stopPropagation(); window.setZipRootDirectory('${escapedDirPath}');">
                            ${rootBtnText}
                        </button>
                    </div>
                </div>
                <div class="directory-files zip-dir-children" data-dir-files="${escapedDirPath}" style="display:block;">
                    ${renderDirTreeHtml(childDir, keyword, depth + 1, dirPath)}
                </div>
            </div>
        `;
    }

    // 渲染当前目录下的直属文件（自然排序）
    const sortedFiles = [...treeNode.files].sort((a, b) =>
        a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }));
    for (const file of sortedFiles) {
        const isSelected = appState.zipSelectedFiles.some(f => f.path === file.path);
        // 只要 archived 为 true 就显示"已被使用"，不受 isSelected 影响
        const isUsed = !!file.archived;
        const isDisabled = isUsed && !isSelected;  // 未被选中但已被使用才禁用
        const escapedPath = file.path.replace(/"/g, '&quot;');
        const escapedName = file.name.replace(/"/g, '&quot;');
        const escapedRelDir = (file.rel_dir || '').replace(/"/g, '&quot;');
        // 获取被哪些文档使用的信息
        const usedByList = file.used_by || [];
        // 将数组转换为文本，每个条目显示为"周期 - 文档"格式
        const usedByTitle = usedByList.length > 0 ? usedByList.join('、') : '';

        // 文件名高亮
        let nameHtml = escapeHtml(file.name);
        if (keyword && file.name.toLowerCase().includes(keyword.toLowerCase())) {
            const idx = file.name.toLowerCase().indexOf(keyword.toLowerCase());
            nameHtml = escapeHtml(file.name.slice(0, idx))
                + `<mark class="zip-highlight">${escapeHtml(file.name.slice(idx, idx + keyword.length))}</mark>`
                + escapeHtml(file.name.slice(idx + keyword.length));
        }

        html += `
            <div class="zip-file-item ${isSelected ? 'selected' : ''} ${isUsed ? 'used' : ''}"
                 data-path="${escapedPath}" data-name="${escapedName}" data-dir="${escapedRelDir}"
                 style="margin-left:${indent + 16}px;padding:4px 8px;margin-bottom:2px;border-radius:4px;
                        display:flex;align-items:center;gap:8px;
                        ${isSelected ? 'background:#e3f2fd;' : isUsed ? 'opacity:0.7;background:#f0f0f0;' : 'background:#fafafa;'}">
                <input type="checkbox" class="zip-file-checkbox"
                       ${isSelected ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}
                       style="flex-shrink:0;" />
                <span class="zip-file-name" title="${escapedName}"
                      style="flex:1;word-break:break-all;font-size:13px;line-height:1.4;">📄 ${nameHtml}</span>
                ${isUsed ? `<span style="background:#ff9800;color:white;padding:2px 5px;border-radius:3px;font-size:11px;flex-shrink:0;" title="${usedByTitle}">已被使用</span>` : ''}
            </div>
        `;
    }

    return html;
}

/**
 * 递归收集目录节点下的所有文件
 */
function collectAllFiles(treeNode) {
    let files = [...treeNode.files];
    for (const child of Object.values(treeNode.children)) {
        files = files.concat(collectAllFiles(child));
    }
    return files;
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 绑定目录树的展开/折叠和复选框事件
 */
function bindDirTreeEvents(container, keyword) {
    // 目录标题点击折叠/展开
    container.querySelectorAll('.zip-dir-row').forEach(header => {
        header.addEventListener('click', function(e) {
            if (e.target.type === 'checkbox') return;
            const dirPath = this.dataset.dir;
            // 不使用 CSS.escape（中文/特殊符号会失效），直接遍历找匹配的子容器
            const childContainer = Array.from(container.querySelectorAll('.zip-dir-children'))
                .find(el => el.dataset.dirFiles === dirPath);
            const toggleIcon = this.querySelector('.dir-toggle-icon');
            if (childContainer) {
                const isCollapsed = childContainer.style.display === 'none';
                childContainer.style.display = isCollapsed ? 'block' : 'none';
                if (toggleIcon) toggleIcon.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
            }
        });
    });

    // 目录复选框事件
    container.querySelectorAll('.zip-dir-checkbox').forEach(cb => {
        cb.addEventListener('change', handleZipDirTreeSelect);
        // 设置 indeterminate 状态
        const dirPath = cb.dataset.dir;
        const fileItems = container.querySelectorAll(`.zip-file-item[data-dir^="${dirPath}"], .zip-file-item[data-dir="${dirPath}"]`);
        const total = Array.from(container.querySelectorAll(`.zip-file-item`))
            .filter(item => {
                const d = item.dataset.dir || '';
                return d === dirPath || d.startsWith(dirPath + '/');
            });
        const selCount = total.filter(item => item.querySelector('.zip-file-checkbox')?.checked).length;
        cb.indeterminate = selCount > 0 && selCount < total.length;
    });

    // 文件复选框事件
    container.querySelectorAll('.zip-file-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleZipFileSelect);
    });
}

/**
 * 处理目录复选框（选中目录下所有文件，包含子目录） - export 供外部模块调用
 */
export function handleZipDirTreeSelect(e) {
    const checkbox = e.target;
    const dirPath = checkbox.dataset.dir;
    const isChecked = checkbox.checked;

    // 选中/取消该目录下所有文件（data-dir 等于 dirPath 或以 dirPath/ 开头）
    const allItems = document.querySelectorAll('#zipFilesList .zip-file-item');
    allItems.forEach(item => {
        const itemDir = item.dataset.dir || '';
        const isInDir = itemDir === dirPath || itemDir.startsWith(dirPath + '/');
        if (!isInDir) return;

        const fileCheckbox = item.querySelector('.zip-file-checkbox');
        if (!fileCheckbox || fileCheckbox.disabled) return;

        const filePath = item.dataset.path;
        const fileName = item.dataset.name;
        const sourceDir = item.dataset.dir || '';

        if (isChecked) {
            if (!fileCheckbox.checked) {
                fileCheckbox.checked = true;
                item.classList.add('selected');
                item.style.background = '#e3f2fd';
                if (!appState.zipSelectedFiles.some(f => f.path === filePath)) {
                    appState.zipSelectedFiles.push({ path: filePath, name: fileName, source_dir: sourceDir });
                }
            }
        } else {
            if (fileCheckbox.checked) {
                fileCheckbox.checked = false;
                item.classList.remove('selected');
                item.style.background = '#fafafa';
                appState.zipSelectedFiles = appState.zipSelectedFiles.filter(f => f.path !== filePath);
            }
        }
    });

    // 更新所有父级目录复选框状态
    updateAllDirCheckboxStates();
    updateZipSelectedInfo();
    updateSelectAllButtonState();
}

/**
 * 更新所有目录复选框状态（indeterminate / checked）
 */
function updateAllDirCheckboxStates() {
    document.querySelectorAll('#zipFilesList .zip-dir-checkbox').forEach(cb => {
        const dirPath = cb.dataset.dir;
        const allFileItems = Array.from(document.querySelectorAll('#zipFilesList .zip-file-item')).filter(item => {
            const d = item.dataset.dir || '';
            return d === dirPath || d.startsWith(dirPath + '/');
        });
        const enabledItems = allFileItems.filter(item => !item.querySelector('.zip-file-checkbox')?.disabled);
        const checkedItems = enabledItems.filter(item => item.querySelector('.zip-file-checkbox')?.checked);
        cb.checked = enabledItems.length > 0 && checkedItems.length === enabledItems.length;
        cb.indeterminate = checkedItems.length > 0 && checkedItems.length < enabledItems.length;
    });
}

/**
 * 搜索ZIP文件（真正的递归树状结构，无搜索显示全部，有搜索匹配文件名/目录名并高亮）
 */
export async function searchZipFilesInPackage(keyword, packagePath) {
    showLoading(true);
    try {
        let files = await searchZipFiles(keyword || '', packagePath || '', appState.currentProjectId);
        
        const zipFilesList = document.getElementById('zipFilesList');
        if (!zipFilesList) return;
        
        let noMatchHint = '';
        
        // 如果搜索无结果但有关键词，则获取全部文件并提示
        if (files.length === 0 && keyword) {
            noMatchHint = '<p class="placeholder" style="color:#ff9800;background:#fff3e0;padding:8px 12px;border-radius:4px;margin-bottom:10px;">⚠️ 无匹配结果，已显示全部文档</p>';
            files = await searchZipFiles('', packagePath || '', appState.currentProjectId);
        }
        
        if (files.length === 0) {
            zipFilesList.innerHTML = '<p class="placeholder">未找到匹配的文件</p>';
            updateSelectAllButtonState();
            return;
        }
        
        // 构建目录树
        const tree = buildDirTree(files);
        
        // 生成 HTML
        const treeHtml = renderDirTreeHtml(tree, keyword || '', 0, '');

        zipFilesList.innerHTML = `${noMatchHint}<div class="files-tree">${treeHtml || '<p class="placeholder">暂无文件</p>'}</div>`;

        // 高亮样式（如果不存在则注入）
        if (!document.getElementById('zip-highlight-style')) {
            const style = document.createElement('style');
            style.id = 'zip-highlight-style';
            style.textContent = `
                mark.zip-highlight {
                    background: #fff176;
                    color: #333;
                    padding: 0 1px;
                    border-radius: 2px;
                    font-style: normal;
                }
                .zip-file-item.selected { background: #e3f2fd !important; }
                .zip-file-item:hover { filter: brightness(0.97); }
                .zip-dir-row:hover { filter: brightness(0.97); }
            `;
            document.head.appendChild(style);
        }

        // 绑定事件
        bindDirTreeEvents(zipFilesList, keyword || '');
        
        // 初始化全选按钮状态
        updateSelectAllButtonState();
    } catch (error) {
        console.error('搜索ZIP文件失败:', error);
        showNotification('搜索失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理ZIP文件选择
 */
export function handleZipFileSelect(e) {
    const checkbox = e.target;
    const item = checkbox.closest('.zip-file-item');
    const filePath = item.dataset.path;
    const fileName = item.dataset.name;
    const sourceDir = item.dataset.dir || '';
    
    // 检查是否禁用（已被其他文档使用）
    if (checkbox.disabled) {
        checkbox.checked = !checkbox.checked;
        showNotification('该文件已被归档，无法重复选择', 'warning');
        return;
    }
    
    if (checkbox.checked) {
        // 计算相对于根目录的路径
        const rootDir = appState.zipRootDirectory;
        let relDir = '';
        if (rootDir) {
            // 计算完整的相对路径（包含文件名）
            const normalizedPath = filePath.replace(/\\/g, '/');
            const normalizedRoot = rootDir.replace(/\\/g, '/');
            
            if (normalizedPath.startsWith(normalizedRoot + '/')) {
                const relPath = normalizedPath.substring(normalizedRoot.length + 1);
                // 提取目录路径（不包含文件名）
                const lastSlashIndex = relPath.lastIndexOf('/');
                if (lastSlashIndex > -1) {
                    relDir = relPath.substring(0, lastSlashIndex);
                } else {
                    relDir = ''; // 文件直接在根目录下
                }
            } else {
                relDir = sourceDir; // 不在根目录下，使用完整目录路径
            }
        } else {
            relDir = sourceDir; // 没有设置根目录，使用完整目录路径
        }
        
        // 打印调试信息
        console.log('[ZIP选择] 文件:', fileName);
        console.log('[ZIP选择] filePath:', filePath);
        console.log('[ZIP选择] sourceDir:', sourceDir);
        console.log('[ZIP选择] rootDir:', rootDir);
        console.log('[ZIP选择] relDir:', relDir);
        
        // 添加到选中列表（带目录信息）
        item.classList.add('selected');
        item.style.background = '#e3f2fd';
        if (!appState.zipSelectedFiles.some(f => f.path === filePath)) {
            appState.zipSelectedFiles.push({ 
                path: filePath, 
                name: fileName, 
                source_dir: sourceDir,
                rel_dir: relDir  // 相对于根目录的路径
            });
        }
    } else {
        // 从选中列表移除
        item.classList.remove('selected');
        item.style.background = '#fafafa';
        appState.zipSelectedFiles = appState.zipSelectedFiles.filter(file => file.path !== filePath);
    }
    
    // 更新所有目录复选框状态
    updateAllDirCheckboxStates();
    // 更新选中信息
    updateZipSelectedInfo();
    // 更新全选按钮状态
    updateSelectAllButtonState();
}

/**
 * 处理ZIP目录选择（选择/取消选择整个目录）
 */
export function handleZipDirSelect(e) {
    const checkbox = e.target;
    const dir = checkbox.dataset.dir;
    const isChecked = checkbox.checked;
    
    // 获取该目录下的所有文件项
    const fileItems = document.querySelectorAll(`.zip-file-item[data-dir="${dir}"]`);
    
    fileItems.forEach(item => {
        const fileCheckbox = item.querySelector('.zip-file-checkbox');
        const filePath = item.dataset.path;
        const fileName = item.dataset.name;
        const sourceDir = item.dataset.dir || '/';
        
        // 跳过禁用的文件（已被其他文档使用）
        if (fileCheckbox.disabled) return;
        
        if (isChecked) {
            // 选中文件（带目录信息）
            if (!fileCheckbox.checked) {
                fileCheckbox.checked = true;
                if (!appState.zipSelectedFiles.some(f => f.path === filePath)) {
                    appState.zipSelectedFiles.push({ path: filePath, name: fileName, source_dir: sourceDir });
                }
                item.classList.add('selected');
            }
        } else {
            // 取消选中文件
            if (fileCheckbox.checked) {
                fileCheckbox.checked = false;
                appState.zipSelectedFiles = appState.zipSelectedFiles.filter(f => f.path !== filePath);
                item.classList.remove('selected');
            }
        }
    });
    
    // 更新选中信息
    updateZipSelectedInfo();
    // 更新全选按钮状态
    updateSelectAllButtonState();
    // 更新目录标题中的选中计数
    updateDirHeaderCount(dir);
}

/**
 * 更新目录复选框状态
 */
function updateDirCheckboxState(dir) {
    const dirCheckbox = document.querySelector(`.zip-dir-checkbox[data-dir="${dir}"]`);
    if (!dirCheckbox) return;
    
    const fileItems = document.querySelectorAll(`.zip-file-item[data-dir="${dir}"]`);
    const selectableCount = Array.from(fileItems).filter(item => {
        const cb = item.querySelector('.zip-file-checkbox');
        return !cb.disabled;
    }).length;
    const selectedCount = Array.from(fileItems).filter(item => {
        const cb = item.querySelector('.zip-file-checkbox');
        return cb.checked;
    }).length;
    
    dirCheckbox.checked = selectedCount === selectableCount && selectableCount > 0;
    dirCheckbox.indeterminate = selectedCount > 0 && selectedCount < selectableCount;
}

/**
 * 更新目录标题中的选中计数
 */
function updateDirHeaderCount(dir) {
    const dirGroup = document.querySelector(`.zip-dir-checkbox[data-dir="${dir}"]`)?.closest('.directory-group');
    if (!dirGroup) return;
    
    const headerSpan = dirGroup.querySelector('.directory-header span');
    if (!headerSpan) return;
    
    const fileItems = document.querySelectorAll(`.zip-file-item[data-dir="${dir}"]`);
    const totalCount = fileItems.length;
    const selectedCount = Array.from(fileItems).filter(item => {
        const cb = item.querySelector('.zip-file-checkbox');
        return cb.checked;
    }).length;
    
    headerSpan.textContent = `(${selectedCount}/${totalCount}个文件)`;
}

/**
 * 更新ZIP选中信息
 */
export function updateZipSelectedInfo() {
    const selectedCount = appState.zipSelectedFiles.length;
    const selectedInfo = document.getElementById('selectedInfo');
    const selectedCountText = document.getElementById('selectedCountText');
    const selectArchiveBtn = document.getElementById('selectArchiveBtn');
    
    if (selectedCount > 0) {
        // 更新底部选中信息和清空按钮
        if (selectedInfo) {
            selectedInfo.style.display = 'flex';
            if (selectedCountText) {
                selectedCountText.textContent = `已选择 ${selectedCount} 个文件`;
            }
        }
        // 更新确认选择按钮
        if (selectArchiveBtn) {
            selectArchiveBtn.disabled = false;
            selectArchiveBtn.textContent = `✅ 确认选择（${selectedCount}个）`;
        }
    } else {
        // 隐藏选中信息
        if (selectedInfo) {
            selectedInfo.style.display = 'none';
        }
        // 更新确认选择按钮
        if (selectArchiveBtn) {
            selectArchiveBtn.disabled = true;
            selectArchiveBtn.textContent = '✅ 确认选择';
        }
    }
}



/**
 * 清空已选择文件
 */
export function clearSelectedFiles() {
    appState.zipSelectedFiles = [];
    updateZipSelectedInfo();
    // 更新搜索结果列表中的显示状态
    document.querySelectorAll('#zipFilesList .zip-file-item').forEach(item => {
        item.classList.remove('selected');
        item.style.background = '#fafafa';
        const checkbox = item.querySelector('.zip-file-checkbox');
        if (checkbox && !checkbox.disabled) {
            checkbox.checked = false;
        }
    });
    // 更新所有目录复选框
    updateAllDirCheckboxStates();
    // 更新全选按钮状态
    updateSelectAllButtonState();
}

/**
 * 全选文件
 */
export function selectAllFiles() {
    const fileItems = document.querySelectorAll('#zipFilesList .zip-file-item');
    let selectedCount = 0;
    
    fileItems.forEach(item => {
        const checkbox = item.querySelector('.zip-file-checkbox');
        const filePath = item.dataset.path;
        const fileName = item.dataset.name;
        const sourceDir = item.dataset.dir || '';
        
        // 只选择未禁用且未选择的文件
        if (checkbox && !checkbox.disabled && !checkbox.checked) {
            checkbox.checked = true;
            item.classList.add('selected');
            item.style.background = '#e3f2fd';
            
            // 检查是否已经在选中列表中
            if (!appState.zipSelectedFiles.some(f => f.path === filePath)) {
                appState.zipSelectedFiles.push({ path: filePath, name: fileName, source_dir: sourceDir });
            }
            selectedCount++;
        }
    });
    
    if (selectedCount > 0) {
        showNotification(`已选择 ${selectedCount} 个文件`, 'success');
    } else {
        showNotification('没有可选择的新文件', 'info');
    }
    
    // 更新所有目录复选框状态
    updateAllDirCheckboxStates();
    // 更新选中信息
    updateZipSelectedInfo();
    // 更新全选按钮状态
    updateSelectAllButtonState();
}

/**
 * 更新全选按钮状态
 */
export function updateSelectAllButtonState() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (!selectAllBtn) return;
    
    const fileItems = document.querySelectorAll('#zipFilesList .zip-file-item');
    const selectableItems = Array.from(fileItems).filter(item => {
        const checkbox = item.querySelector('.zip-file-checkbox');
        return checkbox && !checkbox.disabled;
    });
    
    // 检查是否所有可选文件都已被选中
    const allSelected = selectableItems.length > 0 && selectableItems.every(item => {
        const checkbox = item.querySelector('.zip-file-checkbox');
        return checkbox.checked;
    });
    
    if (allSelected) {
        selectAllBtn.textContent = '取消全选';
        selectAllBtn.onclick = () => {
            clearSelectedFiles();
        };
    } else {
        selectAllBtn.textContent = '全选';
        selectAllBtn.onclick = () => {
            selectAllFiles();
        };
    }
}

/**
 * 处理ZIP归档
 */
export async function handleZipArchive() {
    if (appState.zipSelectedFiles.length === 0) {
        showNotification('请先选择文件', 'error');
        return;
    }
    
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        // 对每个选中的文件进行归档
        let successCount = 0;
        let errorCount = 0;
        
        for (const file of appState.zipSelectedFiles) {
            try {
                // 计算保存的目录
                let saveDirectory = '';
                if (file.rel_dir) {
                    // 使用已经计算好的相对于根目录的路径
                    saveDirectory = file.rel_dir;
                } else if (file.source_dir) {
                    // 没有设置根目录，但文件有目录信息
                    // 尝试提取有意义的目录名（跳过看起来像随机ID的顶层目录）
                    const dirParts = file.source_dir.split('/');
                    // 过滤掉看起来像随机ID的部分（10位以上字母数字混合，可能包含下划线）
                    const meaningfulParts = dirParts.filter(part => {
                        // 如果部分包含看起来像随机ID的子串（如 tmpxgccahbx_20260408152038）
                        // 匹配：10位以上字母数字，或 字母数字_日期时间 格式
                        if (/^[a-z0-9]{10,}$/i.test(part) || /^[a-z0-9]+_\d{8,}$/i.test(part)) {
                            return false;
                        }
                        return true;
                    });
                    saveDirectory = meaningfulParts.join('/');
                }
                // 没有目录信息时 saveDirectory 为空，后端 directory 将为 /
                
                // 打印调试信息
                console.log('[ZIP归档] 文件:', file.name);
                console.log('[ZIP归档] file.rel_dir:', file.rel_dir);
                console.log('[ZIP归档] file.source_dir:', file.source_dir);
                console.log('[ZIP归档] saveDirectory:', saveDirectory);
                
                const response = await fetch('/api/documents/archive-from-zip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project_id: appState.currentProjectId,
                        cycle: appState.currentCycle,
                        source_path: file.path,
                        doc_name: appState.currentDocument,
                        source_dir: saveDirectory  // 有根目录时传相对路径，否则为空（directory=/）
                    })
                });
                
                const result = await response.json();
                if (result.status === 'success') {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error('归档文件失败:', file.name, error);
                errorCount++;
            }
        }
        
        if (successCount > 0) {
            showNotification(`成功归档 ${successCount} 个文件`, 'success');
            // 清空选中状态
            appState.zipSelectedFiles = [];
            updateZipSelectedInfo();
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        }
        
        if (errorCount > 0) {
            showNotification(`有 ${errorCount} 个文件归档失败`, 'error');
        }
    } catch (error) {
        console.error('归档ZIP文件失败:', error);
        showNotification('归档失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 分片上传配置
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

// 存储当前上传的文件路径，供后台匹配使用
let currentUploadZipPath = null;

/**
 * 处理ZIP上传（支持断点续传）
 */
export async function handleZipUpload(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('zipFileInput');
    const file = fileInput.files[0];
    if (!file) {
        showNotification('请选择ZIP文件', 'error');
        return;
    }
    
    // 获取DOM元素
    const uploadProgressSection = document.getElementById('uploadProgressSection');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    const uploadProgressText = document.getElementById('uploadProgressText');
    const uploadProgressPercent = document.getElementById('uploadProgressPercent');
    const startMatchSection = document.getElementById('startMatchSection');
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
    const startBackgroundMatchBtn = document.getElementById('startBackgroundMatchBtn');
    
    // 显示进度条区域，隐藏提交按钮
    uploadProgressSection.style.display = 'block';
    uploadSubmitBtn.style.display = 'none';
    startMatchSection.style.display = 'none';
    
    try {
        // 生成分片ID
        const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const filename = file.name;
        
        // 检查已上传的分片
        const checkResponse = await fetch(
            `/api/documents/zip-check-chunk?filename=${encodeURIComponent(filename)}&fileId=${fileId}`
        );
        
        if (!checkResponse.ok) {
            const errorText = await checkResponse.text();
            throw new Error(`检查分片失败: ${checkResponse.status} - ${errorText}`);
        }
        
        const checkResult = await checkResponse.json();
        
        if (checkResult.status !== 'success') {
            throw new Error(`检查分片失败: ${checkResult.message || '未知错误'}`);
        }
        
        const uploadedChunks = checkResult.uploaded_chunks || [];
        
        // 计算分片数量
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        
        // 更新进度：开始上传
        uploadProgressText.textContent = '正在上传...';
        uploadProgressBar.style.width = '0%';
        uploadProgressPercent.textContent = '0%';
        
        // 上传缺失的分片
        for (let i = 0; i < totalChunks; i++) {
            if (uploadedChunks.includes(i)) {
                continue; // 跳过已上传的分片
            }
            
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            
            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('filename', filename);
            formData.append('chunkIndex', i);
            formData.append('totalChunks', totalChunks);
            formData.append('fileId', fileId);
            
            const uploadProgress = Math.round((i / totalChunks) * 80);
            uploadProgressBar.style.width = uploadProgress + '%';
            uploadProgressPercent.textContent = uploadProgress + '%';
            uploadProgressText.textContent = `正在上传分片 ${i + 1}/${totalChunks}...`;
            
            const chunkResponse = await fetch('/api/documents/zip-chunk-upload', {
                method: 'POST',
                body: formData
            });
            
            if (!chunkResponse.ok) {
                const errorText = await chunkResponse.text();
                throw new Error(`分片 ${i + 1} 上传失败: ${chunkResponse.status} - ${errorText}`);
            }
            
            const chunkResult = await chunkResponse.json();
            if (chunkResult.status !== 'success') {
                throw new Error(`分片 ${i + 1} 上传失败: ${chunkResult.message || '未知错误'}`);
            }
        }
        
        // 所有分片上传完成，合并文件
        uploadProgressText.textContent = '正在合并文件...';
        uploadProgressBar.style.width = '90%';
        uploadProgressPercent.textContent = '90%';
        
        const mergeResponse = await fetch('/api/documents/zip-chunk-merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, fileId })
        });
        
        if (!mergeResponse.ok) {
            const errorText = await mergeResponse.text();
            throw new Error(`文件合并失败: ${mergeResponse.status} - ${errorText}`);
        }
        
        const mergeResult = await mergeResponse.json();
        
        if (mergeResult.status !== 'success') {
            throw new Error(mergeResult.message || '文件合并失败');
        }
        
        // 保存文件路径供后台匹配使用
        currentUploadZipPath = mergeResult.file_path;
        
        // 上传完成，显示匹配按钮
        uploadProgressBar.style.width = '100%';
        uploadProgressPercent.textContent = '100%';
        uploadProgressText.textContent = '上传完成！';
        startMatchSection.style.display = 'block';
        
        // 自动关闭上传模态框（如果用户10秒内未点击匹配按钮）
        setTimeout(() => {
            const startMatchSection = document.getElementById('startMatchSection');
            if (startMatchSection && startMatchSection.style.display === 'block') {
                closeModal(elements.zipUploadModal);
                // 重置表单
                document.getElementById('zipUploadForm').reset();
                document.getElementById('uploadProgressSection').style.display = 'none';
                document.getElementById('startMatchSection').style.display = 'none';
                document.getElementById('uploadSubmitBtn').style.display = 'inline-block';
            }
        }, 10000);
        
    } catch (error) {
        console.error('上传ZIP文件失败:', error);
        showNotification('上传失败: ' + error.message, 'error');
        uploadProgressSection.style.display = 'none';
        uploadSubmitBtn.style.display = 'inline-block';
    }
}

/**
 * 处理后台匹配（从模态框触发）
 */
export async function handleBackgroundMatch() {
    if (!currentUploadZipPath) {
        showNotification('没有可匹配的文件', 'error');
        return;
    }
    
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    // 保存上传路径
    const zipPath = currentUploadZipPath;
    
    // 关闭上传模态框
    closeModal(elements.zipUploadModal);
    
    // 重置表单
    document.getElementById('zipUploadForm').reset();
    document.getElementById('uploadProgressSection').style.display = 'none';
    document.getElementById('startMatchSection').style.display = 'none';
    document.getElementById('uploadSubmitBtn').style.display = 'inline-block';
    
    // 重置当前上传路径
    currentUploadZipPath = null;
    
    // 创建底部进度显示
    const progressId = 'zip-match-' + Date.now();
    const progress = showOperationProgress(progressId, '正在启动匹配任务...');
    
    try {
        // 启动匹配任务
        const matchResponse = await fetch('/api/documents/zip-match-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                zip_path: zipPath,
                project_id: appState.currentProjectId
            })
        });
        
        const matchResult = await matchResponse.json();
        
        if (matchResult.status !== 'success') {
            throw new Error(matchResult.message || '启动匹配任务失败');
        }
        
        const taskId = matchResult.task_id;
        
        // 轮询任务进度
        await pollMatchTask(taskId, progress);
        
    } catch (error) {
        console.error('匹配失败:', error);
        showNotification('匹配失败: ' + error.message, 'error');
    }
}

/**
 * 轮询匹配任务进度
 */
async function pollMatchTask(taskId, progress) {
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
                
                // 更新底部进度
                progress.update(taskProgress, message);
                
                if (taskStatus === 'completed') {
                    console.log('[ZIP匹配] 任务完成，开始处理结果');
                    clearInterval(pollInterval);
                    progress.update(100, '匹配完成！');
                    
                    // 显示结果
                    console.log('[ZIP匹配] result:', result);
                    const matchResult = result.result || {};
                    const totalFiles = matchResult.total_files || 0;
                    const matchedCount = matchResult.matched_count || 0;
                    
                    console.log('[ZIP匹配] 显示通知:', totalFiles, matchedCount);
                    showNotification(
                        `匹配完成！共 ${totalFiles} 个文件，匹配成功 ${matchedCount} 个`,
                        matchedCount > 0 ? 'success' : 'warning'
                    );
                    
                    // 重新加载项目配置
                    if (appState.currentProjectId) {
                        try {
                            const updatedProject = await loadProject(appState.currentProjectId);
                            if (updatedProject) {
                                appState.projectConfig = updatedProject;
                            }
                        } catch (e) {
                            console.error('重新加载项目配置失败:', e);
                        }
                    }
                    
                    // 刷新文档列表
                    if (appState.currentCycle) {
                        try {
                            await renderCycleDocuments(appState.currentCycle);
                        } catch (e) {
                            console.error('刷新文档列表失败:', e);
                        }
                    }
                    
                    // 刷新ZIP包列表
                    try {
                        await loadZipPackagesList();
                    } catch (e) {
                        console.error('刷新ZIP包列表失败:', e);
                    }
                    
                    // 关闭进度显示
                    setTimeout(() => {
                        try {
                            progress.close();
                        } catch (e) {
                            console.error('关闭进度显示失败:', e);
                        }
                    }, 2000);
                    
                    resolve();
                } else if (taskStatus === 'failed') {
                    clearInterval(pollInterval);
                    progress.close();
                    reject(new Error(result.message || '匹配任务失败'));
                }
                
            } catch (error) {
                console.error('查询任务状态失败:', error);
            }
        }, 1000);
    });
}
        


/**
 * 处理导入匹配文件
 */
export async function handleImportMatchedFiles() {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/import-matched-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                cycle: appState.currentCycle
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('匹配文件导入成功', 'success');
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('导入失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('导入匹配文件失败:', error);
        showNotification('导入失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理确认待确认文件
 */
export async function handleConfirmPendingFiles() {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/confirm-pending-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                cycle: appState.currentCycle
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('待确认文件已确认', 'success');
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('确认失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('确认待确认文件失败:', error);
        showNotification('确认失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理拒绝待确认文件
 */
export async function handleRejectPendingFiles() {
    if (!appState.currentProjectId || !appState.currentCycle) {
        showNotification('请先选择项目和周期', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch('/api/documents/reject-pending-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: appState.currentProjectId,
                cycle: appState.currentCycle
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('待确认文件已拒绝', 'success');
            // 刷新文档列表
            await renderCycleDocuments(appState.currentCycle);
        } else {
            showNotification('拒绝失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('拒绝待确认文件失败:', error);
        showNotification('拒绝失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 恢复ZIP文件列表中已选中的状态（搜索刷新后重新应用勾选）
 * 注意：ES Module 中 export 函数不可重新赋值，此函数仅做 DOM 状态恢复
 */
export function fixZipSelectionIssue() {
    // 重新应用已选中文件的 DOM 状态
    const zipFileItems = document.querySelectorAll('.zip-file-item');
    zipFileItems.forEach(item => {
        const filePath = item.dataset.path;
        if (appState.zipSelectedFiles.some(f => f.path === filePath)) {
            item.classList.add('selected');
            const checkbox = item.querySelector('.zip-file-checkbox');
            if (checkbox) checkbox.checked = true;
        }
    });
}

/**
 * 设置ZIP文件的根目录
 * 从此目录开始保存路径层级结构
 * @param {string} dirPath - 目录路径
 */
window.setZipRootDirectory = function(dirPath) {
    appState.zipRootDirectory = dirPath;
    console.log('[ZIP根目录] 已设置为:', dirPath);
    
    // 更新所有"设为根目录"按钮的样式
    document.querySelectorAll('.set-root-btn').forEach(btn => {
        const btnDir = btn.dataset.dir;
        if (btnDir === dirPath) {
            btn.style.cssText = 'background:#28a745;color:white;border:1px solid #1e7e34;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;flex-shrink:0;white-space:nowrap;font-weight:bold;display:inline-block;visibility:visible;';
            btn.textContent = '✓ 已设为根目录';
        } else {
            btn.style.cssText = 'background:#fff;border:1px solid #28a745;color:#28a745;padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;flex-shrink:0;white-space:nowrap;font-weight:bold;display:inline-block;visibility:visible;';
            btn.textContent = '设为根目录';
        }
    });
    
    // 更新已选中文件的相对路径
    updateSelectedFilesRelativePath();
    
    showNotification('已设置根目录: ' + dirPath, 'success');
};

/**
 * 计算相对于根目录的路径
 * @param {string} fullPath - 完整路径
 * @param {string} rootDir - 根目录
 * @returns {string} 相对路径
 */
function getRelativePathFromRoot(fullPath, rootDir) {
    if (!rootDir) return '';
    
    // 确保路径格式一致（使用正斜杠）
    const normalizedPath = fullPath.replace(/\\/g, '/');
    const normalizedRoot = rootDir.replace(/\\/g, '/');
    
    if (normalizedPath.startsWith(normalizedRoot + '/')) {
        return normalizedPath.substring(normalizedRoot.length + 1);
    }
    return '';
}

/**
 * 更新已选中文件的相对路径信息
 */
function updateSelectedFilesRelativePath() {
    const rootDir = appState.zipRootDirectory;
    if (!rootDir) return;
    
    appState.zipSelectedFiles.forEach(file => {
        // 计算相对于根目录的完整路径（包含文件名）
        const relPath = getRelativePathFromRoot(file.path, rootDir);
        
        // 提取目录路径（不包含文件名）
        const lastSlashIndex = relPath.lastIndexOf('/');
        if (lastSlashIndex > -1) {
            file.rel_dir = relPath.substring(0, lastSlashIndex);
            file.source_dir = relPath.substring(0, lastSlashIndex);
        } else {
            file.rel_dir = ''; // 文件直接在根目录下
            file.source_dir = ''; // 文件直接在根目录下
        }
        
        console.log('[ZIP路径更新]', file.path, '-> rel_dir:', file.rel_dir, 'source_dir:', file.source_dir);
    });
}

/**
 * 获取文件的目录信息（用于保存到数据库）
 * @param {string} filePath - 文件路径
 * @returns {string} 目录信息
 */
export function getFileDirectoryForSave(filePath) {
    const rootDir = appState.zipRootDirectory;
    if (!rootDir) return '/';
    
    const relPath = getRelativePathFromRoot(filePath, rootDir);
    if (!relPath) return '/';
    
    // 提取文件所在的目录（不包含文件名）
    const lastSlashIndex = relPath.lastIndexOf('/');
    if (lastSlashIndex > 0) {
        return relPath.substring(0, lastSlashIndex);
    }
    return '/';
}

