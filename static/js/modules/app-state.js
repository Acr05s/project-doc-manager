/**
 * 应用状态模块 - 存储全局状态和元素缓存
 */

// 全局状态
export let appState = {
    projectConfig: null,
    currentProjectId: null,
    currentCycle: null,
    currentDocument: null,
    documents: {},
    zipSelectedFile: null,       // 从ZIP中选择的单个文件（兼容旧代码）
    zipSelectedFiles: [],        // 从ZIP中选择的多个文件数组 [{path, name, source_dir, rel_dir}]
    zipRootDirectory: '',        // 用户选择的根目录（从此目录开始保存路径层级）
    currentZipPackagePath: '',   // 当前选中的ZIP包路径
    currentZipPackageName: '',   // 当前选中的ZIP包名称
    filterOptions: {             // 筛选选项
        hideArchived: false,
        hideCompleted: false,
        keyword: ''
    },
    projectLoaded: false,        // 项目是否已加载
    isPackaging: false,          // 是否正在打包
    packagingProjectId: null,     // 正在打包的项目ID
    // 会话锁定相关
    sessionId: null             // 当前会话ID
};

// 暴露到window供auth.js等无import的模块访问
window._appState = appState;

// 生成唯一会话ID（不再持久化到localStorage，刷新后自动失效）
function generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 初始化会话ID（每次页面加载生成新的会话）
export function initSession() {
    // 每次都生成新的 session_id，刷新页面后自动失效
    const sessionId = generateSessionId();
    appState.sessionId = sessionId;
    console.log('新会话ID:', sessionId);
    return sessionId;
}



// 解锁项目
export async function unlockCurrentProject() {
    if (appState.currentProjectId && appState.sessionId) {
        try {
            await fetch('/api/tasks/unlock-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: appState.currentProjectId,
                    session_id: appState.sessionId
                })
            });
        } catch (error) {
            console.error('解锁项目失败:', error);
        }
    }
}

// DOM元素缓存（延迟获取，避免在DOM加载前访问）
export const elements = {
    // 按钮 - 使用 getter 延迟获取
    get newProjectBtn() { return document.getElementById('newProjectBtn'); },
    get loadProjectBtn() { return document.getElementById('loadProjectBtn'); },
    get importJsonBtn() { return document.getElementById('importJsonBtn'); },
    get exportJsonBtn() { return document.getElementById('exportJsonBtn'); },
    get packageProjectBtn() { return document.getElementById('packageProjectBtn'); },
    get importPackageBtn() { return document.getElementById('importPackageBtn'); },
    get projectManageBtn() { return document.getElementById('projectManageBtn'); },
    get zipUploadBtn() { return document.getElementById('zipUploadBtn'); },
    get generateReportBtn() { return document.getElementById('generateReportBtn'); },
    get checkComplianceBtn() { return document.getElementById('checkComplianceBtn'); },
    get deleteProjectBtn() { return document.getElementById('deleteProjectBtn'); },
    get saveProjectBtn() { return document.getElementById('saveProjectBtn'); },
    get uploadBtn() { return document.getElementById('uploadBtn'); },
    get exportReportBtn() { return document.getElementById('exportReportBtn'); },
    get confirmAcceptanceBtn() { return document.getElementById('confirmAcceptanceBtn'); },
    get downloadPackageBtn() { return document.getElementById('downloadPackageBtn'); },

    // 输入框
    get fileInput() { return document.getElementById('fileInput'); },
    get projectFile() { return document.getElementById('projectFile'); },
    get docDate() { return document.getElementById('docDate'); },
    get signDate() { return document.getElementById('signDate'); },
    get signer() { return document.getElementById('signer'); },
    get hasSeal() { return document.getElementById('hasSeal'); },
    get partyASeal() { return document.getElementById('partyASeal'); },
    get partyBSeal() { return document.getElementById('partyBSeal'); },
    get otherSeal() { return document.getElementById('otherSeal'); },

    // 容器
    get contentArea() { return document.getElementById('contentArea'); },
    get cycleNavList() { return document.getElementById('cycleNavList'); },
    get projectSelect() { return document.getElementById('projectSelect'); },
    get documentsList() { return document.getElementById('documentsList'); },
    get reportContent() { return document.getElementById('reportContent'); },
    get modalTitle() { return document.getElementById('modalTitle'); },
    get docCount() { return document.getElementById('docCount'); },

    // 表单
    get uploadForm() { return document.getElementById('uploadForm'); },
    get loadProjectForm() { return document.getElementById('loadProjectForm'); },

    // 模态框
    get documentModal() { return document.getElementById('documentModal'); },
    get reportModal() { return document.getElementById('reportModal'); },
    get loadProjectModal() { return document.getElementById('loadProjectModal'); },
    get newProjectModal() { return document.getElementById('newProjectModal'); },
    get importJsonModal() { return document.getElementById('importJsonModal'); },
    get importPackageModal() { return document.getElementById('importPackageModal'); },
    get projectManageModal() { return document.getElementById('projectManageModal'); },
    get zipUploadModal() { return document.getElementById('zipUploadModal'); },
    get editDocModal() { return document.getElementById('editDocModal'); },
    get replaceDocModal() { return document.getElementById('replaceDocModal'); },

    // 其他
    get loadingIndicator() { return document.getElementById('loadingIndicator'); },
    get notification() { return document.getElementById('notification'); }
};
