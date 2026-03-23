/**
 * 报告模块 - 处理报告相关功能
 */

import { appState, elements } from './app-state.js';
import { showNotification, showLoading, showOperationProgress, openModal } from './ui.js';
import { generateReport, checkCompliance } from './api.js';

/**
 * 处理生成报告
 */
export async function handleGenerateReport() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    const progress = showOperationProgress('report-' + Date.now(), '正在生成报告...');
    progress.update(20, '正在收集项目信息...');
    
    showLoading(true);
    try {
        const result = await generateReport(appState.currentProjectId);
        
        if (result.status === 'success') {
            progress.update(60, '正在生成报告内容...');
            
            // 显示报告
            const reportModal = elements.reportModal;
            const reportContent = elements.reportContent;
            
            if (reportContent) {
                reportContent.innerHTML = result.report || '<p>报告生成成功</p>';
            }
            
            openModal(reportModal);
            progress.complete('报告生成成功');
        } else {
            progress.error('生成失败: ' + result.message);
            showNotification('生成报告失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('生成报告失败:', error);
        progress.error('生成失败: ' + error.message);
        showNotification('生成报告失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理检查合规性
 */
export async function handleCheckCompliance() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    const progress = showOperationProgress('compliance-' + Date.now(), '正在检查合规性...');
    progress.update(20, '正在分析项目文档...');
    
    showLoading(true);
    try {
        const result = await checkCompliance(appState.currentProjectId);
        
        if (result.status === 'success') {
            progress.update(60, '正在生成合规性报告...');
            
            // 显示合规性报告
            const reportModal = elements.reportModal;
            const reportContent = elements.reportContent;
            
            if (reportContent) {
                reportContent.innerHTML = result.report || '<p>合规性检查完成</p>';
            }
            
            openModal(reportModal);
            progress.complete('合规性检查完成');
        } else {
            progress.error('检查失败: ' + result.message);
            showNotification('检查合规性失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('检查合规性失败:', error);
        progress.error('检查失败: ' + error.message);
        showNotification('检查合规性失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * 处理导出报告
 */
export async function handleExportReport() {
    if (!appState.currentProjectId) {
        showNotification('请先选择项目', 'error');
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch(`/api/reports/export?project_id=${encodeURIComponent(appState.currentProjectId)}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `project-${appState.currentProjectId}-report-${new Date().toISOString().split('T')[0]}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('报告导出成功', 'success');
        } else {
            showNotification('导出失败', 'error');
        }
    } catch (error) {
        console.error('导出报告失败:', error);
        showNotification('导出失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}


