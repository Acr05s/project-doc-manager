import re

with open('document.js', 'r', encoding='utf-8') as f:
    content = f.read()

# New functions to add before renderVerticalTree
new_functions = '''
/**
 * 获取目录下所有文件的路径列表
 * @param {Object} node - 目录节点
 * @returns {Array} 文件路径列表
 */
function getAllFilesInDirectory(node) {
    let files = [];
    
    // 添加当前目录的文件
    if (node.files) {
        files.push(...node.files.map(f => ({
            path: f.path,
            name: f.name,
            displayName: f.displayName || f.name,
            dirPath: node.fullPath || ''
        })));
    }
    
    // 递归添加子目录的文件
    if (node.children) {
        Object.values(node.children).forEach(child => {
            files.push(...getAllFilesInDirectory(child));
        });
    }
    
    return files;
}

/**
 * 检查目录是否全部选中
 * @param {Object} node - 目录节点
 * @returns {boolean} 是否全部选中
 */
function isDirectoryFullySelected(node) {
    const allFiles = getAllFilesInDirectory(node);
    if (allFiles.length === 0) return false;
    
    return allFiles.every(file => 
        appState.zipSelectedFiles.some(f => f.path === file.path)
    );
}

/**
 * 检查目录是否部分选中
 * @param {Object} node - 目录节点
 * @returns {boolean} 是否部分选中
 */
function isDirectoryPartiallySelected(node) {
    const allFiles = getAllFilesInDirectory(node);
    if (allFiles.length === 0) return false;
    
    const selectedCount = allFiles.filter(file => 
        appState.zipSelectedFiles.some(f => f.path === file.path)
    ).length;
    
    return selectedCount > 0 && selectedCount < allFiles.length;
}

'''

# Find the renderVerticalTree function and replace it
old_pattern = r'/\*\*\s*\n \* 渲染竖状树形文件目录.*?function renderVerticalTree\(node, prefix = \[\], isLast = true, keyword = \'\'\) \{.*?return html;\s*\}'

new_function = '''/**
 * 渲染竖状树形文件目录
 * @param {Object} node - 目录节点
 * @param {Array} prefix - 前缀符号数组
 * @param {boolean} isLast - 是否是最后一个子节点
 * @param {string} keyword - 搜索关键词
 * @param {string} parentPath - 父目录路径
 * @returns {string} HTML
 */
function renderVerticalTree(node, prefix = [], isLast = true, keyword = '', parentPath = '') {
    let html = '';
    
    // 获取所有子节点（目录和文件）
    const childDirs = Object.values(node.children);
    const childFiles = node.files || [];
    const allChildren = [...childDirs, ...childFiles];
    
    // 如果有关键词，按匹配度排序文件
    if (keyword) {
        childFiles.sort((a, b) => {
            const scoreA = calculateMatchScore(a.displayName || a.name, keyword);
            const scoreB = calculateMatchScore(b.displayName || b.name, keyword);
            return scoreB - scoreA;
        });
        // 重新组合
        allChildren.length = 0;
        allChildren.push(...childDirs, ...childFiles);
    }
    
    const totalCount = allChildren.length;
    
    allChildren.forEach((child, index) => {
        const isLastChild = index === totalCount - 1;
        const isDir = child.children !== undefined;
        const hasChildren = isDir && (Object.keys(child.children).length > 0 || child.files.length > 0);
        
        // 构建当前行的前缀
        const currentPrefix = prefix.join('');
        const branchSymbol = isLastChild ? '└── ' : '├── ';
        const indentSymbol = isLast ? '    ' : '│   ';
        
        // 计算匹配度
        const matchScore = keyword ? calculateMatchScore(child.displayName || child.name, keyword) : 0;
        const isBestMatch = keyword && matchScore >= 80;
        const isMatch = keyword && matchScore > 0;
        
        // 计算当前目录路径
        const currentDirPath = parentPath ? parentPath + '/' + child.name : child.name;
        if (isDir) {
            child.fullPath = currentDirPath;
        }
        
        if (isDir) {
            // 目录节点
            const folderIcon = child.expanded !== false ? '📁' : '📀';
            const toggleIcon = hasChildren ? (child.expanded !== false ? '▼' : '▶') : '';
            
            // 检查目录选中状态
            const isFullySelected = isDirectoryFullySelected(child);
            const isPartiallySelected = isDirectoryPartiallySelected(child);
            const checkboxState = isFullySelected ? 'checked' : '';
            const checkboxClass = isPartiallySelected ? 'indeterminate' : '';
            
            html += `
                <div class="tree-line dir-line ${child.expanded === false ? 'collapsed' : ''}" data-dir-id="${child.id}" data-dir-path="${currentDirPath}">
                    <span class="tree-indent">${currentPrefix}</span>
                    <span class="tree-branch">${branchSymbol}</span>
                    <input type="checkbox" class="tree-checkbox dir-checkbox ${checkboxClass}" data-dir-path="${currentDirPath}" ${checkboxState} />
                    <span class="tree-toggle" data-dir-id="${child.id}">${toggleIcon}</span>
                    <span class="tree-icon">${folderIcon}</span>
                    <span class="tree-name">${escapeHtml(child.name)}</span>
                    <span class="tree-count">(${child.files.length + Object.values(child.children).reduce((sum, c) => sum + c.files.length, 0)})</span>
                </div>
            `;
            
            // 如果目录展开，递归渲染子节点
            if (child.expanded !== false && hasChildren) {
                html += renderVerticalTree(child, [...prefix, indentSymbol], isLastChild, keyword, currentDirPath);
            }
        } else {
            // 文件节点
            const isUsed = child.used || false;
            const usedByList = child.used_by || [];
            const usedByText = usedByList.length > 0 ? usedByList.join('，') : '已被其他文档使用';
            
            const checkboxId = 'cb_' + child.id.replace(/[^a-zA-Z0-9]/g, '_');
            const isSelected = appState.zipSelectedFiles.some(f => f.path === child.path);
            
            html += `
                <div class="tree-line file-line ${isBestMatch ? 'best-match' : ''} ${isMatch ? 'matched' : ''} ${isUsed ? 'used' : ''}" 
                     data-path="${child.path}" 
                     data-name="${child.name}"
                     data-dir-path="${parentPath}">
                    <span class="tree-indent">${currentPrefix}</span>
                    <span class="tree-branch">${branchSymbol}</span>
                    <input type="checkbox" class="tree-checkbox file-checkbox" id="${checkboxId}" ${isUsed ? 'disabled' : ''} ${isSelected ? 'checked' : ''} />
                    <span class="tree-icon">📄</span>
                    <label class="tree-name" for="${checkboxId}" title="${child.name}">${escapeHtml(child.displayName || child.name)}</label>
                    ${isUsed ? '<span class="tree-badge" title="' + usedByText + '">已用</span>' : ''}
                    ${matchScore > 0 ? '<span class="tree-score" title="匹配度: ' + matchScore + '%">' + matchScore + '%</span>' : ''}
                </div>
            `;
        }
    });
    
    return html;
}'''

# Replace the old function with new functions + new function
content = re.sub(old_pattern, new_functions + new_function, content, flags=re.DOTALL)

with open('document.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('File updated successfully')
