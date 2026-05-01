/**
 * 周期模块 - 处理周期相关功能
 */

import { appState, elements } from './app-state.js';
import { getCycleDocuments, calculateCycleProgress } from './api.js';
import { renderCycleDocuments, flattenRequiredDocs } from './document.js';

/**
 * 渲染项目周期列表
 */
export function renderCycles() {
    console.log('开始渲染周期');
    console.log('elements.cycleNavList:', elements.cycleNavList);
    console.log('appState.projectConfig:', appState.projectConfig);
    console.log('周期数据:', appState.projectConfig ? appState.projectConfig.cycles : '无');
    
    if (!elements.cycleNavList) {
        console.error('cycleNavList 元素不存在');
        return;
    }
    
    if (!appState.projectConfig || !appState.projectConfig.cycles || appState.projectConfig.cycles.length === 0) {
        console.log('无可用周期');
        elements.cycleNavList.innerHTML = '<span class="placeholder">无可用周期</span>';
        const searchBox = document.getElementById('cycleSearchBox');
        if (searchBox) searchBox.style.display = 'none';
        return;
    }

    const cycles = appState.projectConfig.cycles;
    const docsData = appState.projectConfig.documents || {};
    console.log('周期列表:', cycles);
    console.log('文档数据:', docsData);

    // 异步加载每个周期的进度
    loadCycleProgresses(cycles, docsData);
}

/**
 * 计算周期状态
 * 返回: 'complete' (绿色-完整无误), 'partial' (橙色-文件对属性不对), 'incomplete' (红色-文件不完整)
 */
export async function calculateCycleStatus(cycle) {
    if (!appState.projectConfig?.documents) return 'incomplete';
    const docsInfo = appState.projectConfig.documents[cycle];
    if (!docsInfo) return 'incomplete';

    const requiredDocs = flattenRequiredDocs(docsInfo.required_docs || []);
    const uploadedDocs = await getCycleDocuments(cycle);

    // 按文档类型分组
    const docsByName = {};
    for (const doc of uploadedDocs) {
        const key = doc.doc_name;
        if (!docsByName[key]) docsByName[key] = [];
        docsByName[key].push(doc);
    }

    let allFilesComplete = true;
    let allAttributesComplete = true;
    let allArchived = true;

    for (const doc of requiredDocs) {
        if (doc._isFolder) continue;
        const docData = doc;
        const dk = docData._docKey || docData.name;

        const docsList = docsByName[dk] || docsByName[docData.name] || [];

        // 检查是否已归档
        const isArchived = appState.projectConfig.documents_archived?.[cycle]?.[dk];

        // 检查是否标记为不涉及（从文档列表和项目配置中）
        const isNotInvolvedFromDocs = docsList.some(d => d.not_involved || d._not_involved);
        const isNotInvolvedFromConfig = appState.projectConfig.documents_not_involved?.[cycle]?.[dk];
        const isNotInvolved = isNotInvolvedFromDocs || isNotInvolvedFromConfig;
        
        // 如果标记为不涉及，视为文件完整、属性完整、已归档
        if (isNotInvolved) {
            continue; // 跳过此文档的检查，视为已完成
        }
        
        // 检查文件数量
        if (docsList.length === 0) {
            allFilesComplete = false;
            allAttributesComplete = false;
            allArchived = false;
            break;
        }

        // 检查是否已归档
        if (!isArchived) {
            allArchived = false;

            // 检查附加属性
            const requirement = docData.requirement || '';
            const requireSigner = requirement.includes('签名') || requirement.includes('签字');
            const requireSeal = requirement.includes('盖章') || requirement.includes('章');
            
            if (requireSigner && !docsList.some(d => d.signer)) {
                allAttributesComplete = false;
            }
            if (requireSeal && !docsList.some(d => d.has_seal_marked || d.has_seal || d.party_a_seal || d.party_b_seal)) {
                allAttributesComplete = false;
            }
            
            // 检查自定义属性
            const customAttrDefs = appState.projectConfig?.custom_attribute_definitions || [];
            const getDocValue = (doc, fieldName) => {
                if (doc[fieldName] !== undefined) return doc[fieldName];
                if (doc[`_${fieldName}`] !== undefined) return doc[`_${fieldName}`];
                return null;
            };
            
            for (const attrDef of customAttrDefs) {
                // 检查文档是否有这个自定义属性的要求
                if (docData.attributes && docData.attributes[attrDef.id] === true) {
                    // 检查是否有任何文档完成了该属性
                    const isCompleted = docsList.some(d => {
                        const value = getDocValue(d, attrDef.id);
                        return value === true || (value !== undefined && value !== null && value !== '' && value !== false);
                    });
                    if (!isCompleted) {
                        allAttributesComplete = false;
                    }
                }
            }
        }
    }

    // 状态优先级：已归档 > 文件不全 > 属性不全 > 完整
    if (allArchived && requiredDocs.length > 0) {
        // 所有文档都已归档
        return 'archived';
    } else if (!allFilesComplete) {
        return 'incomplete';
    } else if (!allAttributesComplete) {
        return 'partial';
    } else {
        return 'complete';
    }
}

/**
 * 刷新周期进度显示（从当前项目配置重新加载）
 */
export async function refreshCycleProgress() {
    if (!appState.projectConfig || !appState.projectConfig.cycles) return;
    const cycles = appState.projectConfig.cycles;
    const docsData = appState.projectConfig.documents || {};
    await loadCycleProgresses(cycles, docsData);
}

/**
 * 加载所有周期的进度
 */
export async function loadCycleProgresses(cycles, docsData) {
    // 并行获取所有周期的状态和进度
    const statusPromises = cycles.map(async (cycle) => {
        const status = await calculateCycleStatus(cycle);
        try {
            const progress = await calculateCycleProgress(cycle);
            const progressPercent = progress.total_required > 0
                ? Math.round((progress.completed_count / progress.total_required) * 100)
                : 0;
            return { cycle, status, progress: progressPercent, data: progress };
        } catch (e) {
            console.error(`获取周期 ${cycle} 进度失败:`, e);
            return { cycle, status, progress: 0, data: null };
        }
    });

    const statusResults = await Promise.all(statusPromises);
    const statusMap = {};
    const progressMap = {};
    statusResults.forEach(r => {
        statusMap[r.cycle] = r.status;
        progressMap[r.cycle] = r.progress;
    });

    // 渲染顶部导航栏：横向排列，用箭头连接
    // 计算哪些周期后面需要显示虚线箭线
    const incompleteIndices = [];
    cycles.forEach((cycle, index) => {
        const status = statusMap[cycle] || 'incomplete';
        if (status !== 'complete') {
            incompleteIndices.push(index);
        }
    });

    // 渲染周期和箭线
    let html = '';
    cycles.forEach((cycle, index) => {
        const status = statusMap[cycle] || 'incomplete';
        const isActive = cycle === appState.currentCycle;
        
        // 渲染周期项
        html += `
            <div class="cycle-nav-item status-${status} ${isActive ? 'active' : ''}" data-cycle="${cycle}" data-status="${status}">
                ${status === 'archived' ? `<div class="archive-tip" style="position: absolute; top: -10px; right: -10px; background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; z-index: 10;">已归档</div>` : ''}
                <span class="cycle-index" style="font-size:11px;opacity:0.8;">${index + 1}</span>
                <span class="cycle-name" style="text-align:center;">${cycle}</span>
            </div>
        `;
        
        // 运维和其它之间不需要箭线，但需要保持间距
        if (index < cycles.length - 1) {
            if ((cycle.includes('运维') || cycle.includes('运营')) && (cycles[index + 1].includes('其它') || cycles[index + 1].includes('其他'))) {
                // 运维和其它之间添加占位元素
                html += `<span class="cycle-nav-placeholder"></span>`;
            } else {
                // 检查是否需要显示虚线箭线
                const isDashed = incompleteIndices.some(incompleteIndex => index >= incompleteIndex);
                html += `<span class="cycle-nav-arrow ${isDashed ? 'dashed' : ''}">→</span>`;
            }
        }
    });

    // 添加颜色说明方块作为最后一个周期项（图例，不可点击）
    html += `
        <div class="cycle-nav-item status-legend" style="cursor:default;pointer-events:none;">
            <span class="cycle-index" style="font-size:11px;opacity:0.8;"></span>
            <div class="status-legend-content">
                <div class="status-item">
                    <span class="status-dot" style="background:#17a2b8;"></span>
                    <span>完整无误</span>
                </div>
                <div class="status-item">
                    <span class="status-dot" style="background:#ffc107;"></span>
                    <span>属性待补</span>
                </div>
                <div class="status-item">
                    <span class="status-dot" style="background:#dc3545;"></span>
                    <span>文件不全</span>
                </div>
            </div>
        </div>
    `;

    if (elements.cycleNavList) {
        elements.cycleNavList.innerHTML = html;
    }

    // 添加周期点击事件（排除图例项）
    document.querySelectorAll('.cycle-nav-item:not(.status-legend)').forEach(item => {
        item.addEventListener('click', () => {
            selectCycle(item.dataset.cycle);
        });
    });

    // 初始化周期搜索（当前生效模块）
    initCycleSearch();

    // 不自动选中任何周期，让用户手动选择
    const currentCycle = appState.currentCycle;
    if (currentCycle) {
        // 确保当前选中周期仍然可见
        const currentItem = document.querySelector(`.cycle-nav-item[data-cycle="${currentCycle}"]`);
        if (currentItem) {
            currentItem.classList.add('active');
        }
    } else {
        // 如果正在打包，显示备份提示
        if (appState.isPackaging) {
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>正在备份项目...</h2>
                    <p>项目数据暂时不可操作</p>
                </div>
            `;
        } else {
            // 显示欢迎信息
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>欢迎使用文档管理系统</h2>
                    <p>请从上方选择一个周期开始管理文档</p>
                </div>
            `;
        }
    }
}

/**
 * 初始化周期文档搜索框
 */
function initCycleSearch() {
    const searchBox = document.getElementById('cycleSearchBox');
    const searchTrigger = document.getElementById('cycleSearchTrigger');
    const searchPanel = document.getElementById('cycleSearchPanel');
    const searchInput = document.getElementById('cycleSearchInput');
    const searchDropdown = document.getElementById('cycleSearchDropdown');
    const searchClear = document.getElementById('cycleSearchClear');
    const searchResultInfo = document.getElementById('cycleSearchResultInfo');
    if (!searchBox || !searchTrigger || !searchPanel || !searchInput || !searchDropdown) return;

    // 打开项目后显示搜索入口
    searchBox.style.display = '';

    // 构建搜索索引：周期 -> 文档要求 -> 文档名（可选）
    const searchIndex = [];
    const cycles = appState.projectConfig?.cycles || [];
    const documents = appState.projectConfig?.documents || {};
    cycles.forEach(cycle => {
        const docsInfo = documents[cycle];
        if (!docsInfo || !Array.isArray(docsInfo.required_docs)) return;
        const flatDocs = flattenRequiredDocs(docsInfo.required_docs);
        flatDocs.filter(doc => !doc._isFolder).forEach(doc => {
            const requirement = (doc.requirement || doc.doc_type || doc.category || '文档要求').toString();
            const docName = (doc._docKey || doc.name || '').toString();
            searchIndex.push({ cycle, requirement, docName });
        });
    });

    let activeIndex = -1;
    let filteredResults = [];
    let debounceTimer = null;

    const escapeReg = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const highlight = (text, keyword) => {
        if (!keyword) return text;
        const escaped = escapeReg(keyword);
        return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    };

    function renderDropdown(items, keyword) {
        if (!items.length) {
            searchDropdown.innerHTML = '<div class="cycle-search-no-result">未找到匹配的文档</div>';
            if (searchResultInfo) {
                searchResultInfo.textContent = '无匹配结果';
                searchResultInfo.style.display = '';
            }
            return;
        }

        const grouped = {};
        items.forEach(item => {
            if (!grouped[item.cycle]) grouped[item.cycle] = [];
            grouped[item.cycle].push(item);
        });

        if (searchResultInfo) {
            searchResultInfo.textContent = keyword ? `找到 ${items.length} 个匹配项` : `共 ${items.length} 个文档`;
            searchResultInfo.style.display = '';
        }

        let html = '';
        let globalIdx = 0;
        cycles.forEach(cycle => {
            if (!grouped[cycle]) return;
            html += `<div class="cycle-search-group-header">📁 ${cycle}（${grouped[cycle].length}）</div>`;
            grouped[cycle].forEach(item => {
                html += `<div class="cycle-search-item${globalIdx === activeIndex ? ' active' : ''}" data-index="${globalIdx}" data-cycle="${item.cycle}" data-doc="${item.docName}">
                    <div class="search-path">
                        <span class="search-cycle-tag">${item.cycle}</span>
                        <span class="search-path-sep">›</span>
                        <span class="search-doc-name">${highlight(item.docName, keyword)}</span>
                    </div>
                </div>`;
                globalIdx++;
            });
        });

        searchDropdown.innerHTML = html;
        searchDropdown.querySelectorAll('.cycle-search-item').forEach(el => {
            el.addEventListener('click', () => navigateToCycleDoc(el.dataset.cycle, el.dataset.doc));
        });
    }

    function doSearch() {
        const keyword = searchInput.value.trim().toLowerCase();
        if (searchClear) searchClear.style.display = keyword ? '' : 'none';

        if (!keyword) {
            filteredResults = [...searchIndex];
            activeIndex = -1;
            renderDropdown(filteredResults, '');
            return;
        }

        filteredResults = searchIndex.filter(item =>
            item.cycle.toLowerCase().includes(keyword) ||
            item.docName.toLowerCase().includes(keyword)
        );
        activeIndex = -1;
        renderDropdown(filteredResults, keyword);
    }

    function closePanel() {
        searchPanel.classList.remove('show');
        searchTrigger.classList.remove('active');
        searchInput.value = '';
        if (searchClear) searchClear.style.display = 'none';
        filteredResults = [];
        activeIndex = -1;
    }

    function navigateToCycleDoc(cycle, docName) {
        closePanel();
        // 若已在当前周期，避免 selectCycle 的“再次点击取消选中”逻辑
        if (appState.currentCycle !== cycle) {
            selectCycle(cycle);
        } else {
            renderCycleDocuments(cycle);
        }

        const targetText = (docName || '').replace(/\s+/g, '');

        // 轮询等待文档列表渲染完成后定位，提升跳转成功率
        const tryLocateAndHighlight = (attempt = 0) => {
            const rows = document.querySelectorAll('.doc-row');
            for (const row of rows) {
                const docTypeEl = row.querySelector('.doc-type');
                if (!docTypeEl) continue;
                const currentText = (docTypeEl.textContent || '').replace(/\s+/g, '');
                if (currentText === targetText || currentText.includes(targetText)) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.style.transition = 'background 0.3s';
                    row.style.background = '#fff3cd';
                    setTimeout(() => { row.style.background = ''; }, 2000);
                    return;
                }
            }

            if (attempt < 8) {
                setTimeout(() => tryLocateAndHighlight(attempt + 1), 150);
            }
        };

        setTimeout(() => tryLocateAndHighlight(0), 120);
    }

    searchTrigger.onclick = (e) => {
        e.stopPropagation();
        if (searchPanel.classList.contains('show')) {
            closePanel();
        } else {
            searchPanel.classList.add('show');
            searchTrigger.classList.add('active');
            filteredResults = [...searchIndex];
            renderDropdown(filteredResults, '');
            setTimeout(() => searchInput.focus(), 50);
        }
    };

    searchInput.oninput = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doSearch, 200);
    };

    searchInput.onkeydown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!filteredResults.length) return;
            activeIndex = Math.min(activeIndex + 1, filteredResults.length - 1);
            renderDropdown(filteredResults, searchInput.value.trim());
            const activeEl = searchDropdown.querySelector('.cycle-search-item.active');
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!filteredResults.length) return;
            activeIndex = Math.max(activeIndex - 1, 0);
            renderDropdown(filteredResults, searchInput.value.trim());
            const activeEl = searchDropdown.querySelector('.cycle-search-item.active');
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filteredResults.length) {
                const item = filteredResults[activeIndex];
                navigateToCycleDoc(item.cycle, item.docName);
            }
        } else if (e.key === 'Escape') {
            closePanel();
        }
    };

    if (searchClear) {
        searchClear.onclick = () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            filteredResults = [...searchIndex];
            activeIndex = -1;
            renderDropdown(filteredResults, '');
            searchInput.focus();
        };
    }

    if (searchBox._outsideClickHandler) {
        document.removeEventListener('click', searchBox._outsideClickHandler);
    }
    searchBox._outsideClickHandler = (e) => {
        if (!searchBox.contains(e.target)) {
            closePanel();
        }
    };
    document.addEventListener('click', searchBox._outsideClickHandler);
}

/**
 * 选定一个周期
 */
export function selectCycle(cycle) {
    // 如果点击的是已选中的周期，则取消选择
    if (appState.currentCycle === cycle) {
        appState.currentCycle = null;
        
        // 更新顶部导航UI
        const cycleNavItems = document.querySelectorAll('.cycle-nav-item');
        if (cycleNavItems) {
            cycleNavItems.forEach(item => {
                if (item) {
                    item.classList.remove('active');
                }
            });
        }
        
        // 如果正在打包，显示备份提示
        if (appState.isPackaging) {
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>正在备份项目...</h2>
                    <p>项目数据暂时不可操作</p>
                </div>
            `;
        } else {
            // 显示欢迎信息
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>欢迎使用文档管理系统</h2>
                    <p>请从上方选择一个周期开始管理文档</p>
                </div>
            `;
        }
    } else {
        appState.currentCycle = cycle;

        // 更新顶部导航UI
        const cycleNavItems = document.querySelectorAll('.cycle-nav-item');
        if (cycleNavItems) {
            cycleNavItems.forEach(item => {
                if (item) {
                    item.classList.remove('active');
                }
            });
        }
        const cycleItem = document.querySelector(`.cycle-nav-item[data-cycle="${cycle}"]`);
        if (cycleItem) {
            cycleItem.classList.add('active');
        }

        // 渲染该周期的文档
        renderCycleDocuments(cycle);
    }
}

/**
 * 渲染初始内容
 */
export function renderInitialContent() {
    if (!appState.projectConfig) return;

    const cycles = appState.projectConfig.cycles;
    // 始终显示欢迎信息，让用户手动选择周期
    if (!appState.currentCycle) {
        // 如果正在打包，显示备份提示
        if (appState.isPackaging) {
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>正在备份项目...</h2>
                    <p>项目数据暂时不可操作</p>
                </div>
            `;
        } else {
            elements.contentArea.innerHTML = `
                <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                    <h2>欢迎使用文档管理系统</h2>
                    <p>请从上方选择一个周期开始管理文档</p>
                </div>
            `;
        }
    }
}
