/**
 * 周期模块 - 处理周期相关功能
 */

import { appState, elements } from './app-state.js';
import { getCycleDocuments, calculateCycleProgress } from './api.js';
import { renderCycleDocuments } from './document.js';

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
    const docsInfo = appState.projectConfig.documents[cycle];
    if (!docsInfo) return 'incomplete';

    const requiredDocs = docsInfo.required_docs || [];
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
        const docsList = docsByName[doc.name] || [];
        const requirement = doc.requirement || '';
        
        // 检查是否已归档
        const isArchived = appState.projectConfig.documents_archived?.[cycle]?.[doc.name];
        
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
            const requireSigner = requirement.includes('签名') || requirement.includes('签字');
            const requireSeal = requirement.includes('盖章') || requirement.includes('章');
            
            if (requireSigner && !docsList.some(d => d.signer)) {
                allAttributesComplete = false;
            }
            if (requireSeal && !docsList.some(d => d.has_seal_marked || d.has_seal || d.party_a_seal || d.party_b_seal)) {
                allAttributesComplete = false;
            }
        }
    }

    if (!allFilesComplete) {
        return 'incomplete';
    } else if (!allAttributesComplete) {
        return 'partial';
    } else if (allArchived) {
        return 'archived';
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
            <div class="cycle-nav-item status-${status} ${isActive ? 'active' : ''}" data-cycle="${cycle}" data-status="${status}" style="${isActive ? 'transform: scale(1.2); z-index: 10;' : ''}" >
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

    // 添加颜色说明方块作为最后一个周期项
    html += `
        <div class="cycle-nav-item status-legend">
            <span class="cycle-index" style="font-size:11px;opacity:0.8;"></span>
            <div class="status-legend-content">
                <div class="status-item">
                    <span class="status-dot" style="background:#28a745;"></span>
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

    // 添加周期点击事件
    document.querySelectorAll('.cycle-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            selectCycle(item.dataset.cycle);
        });
    });

    // 不自动选中任何周期，让用户手动选择
    const currentCycle = appState.currentCycle;
    if (currentCycle) {
        // 确保当前选中周期仍然可见
        const currentItem = document.querySelector(`.cycle-nav-item[data-cycle="${currentCycle}"]`);
        if (currentItem) {
            currentItem.classList.add('active');
        }
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
        
        // 显示欢迎信息
        elements.contentArea.innerHTML = `
            <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                <h2>欢迎使用文档管理系统</h2>
                <p>请从上方选择一个周期开始管理文档</p>
            </div>
        `;
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
        elements.contentArea.innerHTML = `
            <div class="welcome-message" style="text-align: center; padding: 100px 20px;">
                <h2>欢迎使用文档管理系统</h2>
                <p>请从上方选择一个周期开始管理文档</p>
            </div>
        `;
    }
}
