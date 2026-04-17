/**
 * 模块管理功能模块
 * 处理项目模块的创建、编辑、删除和属性管理
 */

export function openModuleManagementModal() {
    const modal = document.createElement('div');
    modal.id = 'moduleManagementModal';
    modal.className = 'modal show';
    modal.style.cssText = `
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10001;
        align-items: center;
        justify-content: center;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="width: 90%; max-width: 900px; max-height: 85vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>🔧 项目模块管理</h2>
                <span class="close" onclick="document.getElementById('moduleManagementModal').remove();" style="cursor: pointer; font-size: 28px;">&times;</span>
            </div>

            <div class="modal-body">
                <div style="display: flex; gap: 20px; height: 600px;">
                    <!-- 左侧：模块列表 -->
                    <div style="flex: 0 0 300px; border-right: 1px solid #eee; padding-right: 15px; overflow-y: auto;">
                        <div style="margin-bottom: 15px;">
                            <button class="btn btn-success" id="addNewModuleBtn" onclick="window.moduleManagement.addNewModule()">
                                + 新建模块
                            </button>
                        </div>
                        <div id="modulesList" style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="text-align: center; color: #999; padding: 40px 20px;">
                                加载中...
                            </div>
                        </div>
                    </div>

                    <!-- 右侧：模块详情编辑 -->
                    <div style="flex: 1; overflow-y: auto;">
                        <div id="moduleDetailEditor">
                            <div style="text-align: center; color: #999; padding: 40px;">
                                请从左侧列表选择模块
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-footer" style="text-align: right; padding: 15px; border-top: 1px solid #eee;">
                <button class="btn btn-secondary" onclick="document.getElementById('moduleManagementModal').remove();">关闭</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // 加载模块列表
    loadModulesList();
}

async function loadModulesList() {
    try {
        const projectId = window._appState?.currentProjectId;
        if (!projectId) {
            showNotification('请先选择项目', 'warning');
            return;
        }

        const response = await fetch(`/api/modules/list?project_id=${projectId}`);
        const data = await response.json();

        const modulesList = document.getElementById('modulesList');
        if (!data.data || data.data.length === 0) {
            modulesList.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">暂无模块</div>';
            return;
        }

        modulesList.innerHTML = data.data.map((module, index) => `
            <div class="module-item" data-module-id="${module.id}" style="
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                cursor: pointer;
                background: #fff;
                transition: all 0.2s;
            " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'" onclick="window.moduleManagement.selectModule(this, '${module.id}')">
                <div style="font-weight: 500; color: #333; margin-bottom: 4px;">
                    ${module.name}
                </div>
                <div style="font-size: 12px; color: #999;">
                    ${module.description || '无描述'}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载模块列表失败:', error);
        showNotification('加载模块列表失败: ' + error.message, 'error');
    }
}

// 模块管理对象
window.moduleManagement = {
    currentModuleId: null,

    selectModule(element, moduleId) {
        // 移除之前的选中状态
        document.querySelectorAll('.module-item').forEach(item => {
            item.style.borderColor = '#ddd';
            item.style.background = '#fff';
        });
        
        // 添加当前选中状态
        element.style.borderColor = '#667eea';
        element.style.background = '#f0f4ff';
        
        this.currentModuleId = moduleId;
        this.showModuleDetail(moduleId);
    },

    async showModuleDetail(moduleId) {
        try {
            const projectId = window._appState?.currentProjectId;
            const response = await fetch(`/api/modules/list?project_id=${projectId}`);
            const data = await response.json();
            
            const module = data.data.find(m => m.id === moduleId);
            if (!module) return;

            const detailEditor = document.getElementById('moduleDetailEditor');
            detailEditor.innerHTML = `
                <form onsubmit="window.moduleManagement.saveModule(event, '${moduleId}')">
                    <div class="form-group">
                        <label>模块名称 *</label>
                        <input type="text" id="moduleName" value="${module.name}" required style="width: 100%; padding: 8px;">
                    </div>
                    <div class="form-group">
                        <label>模块描述</label>
                        <textarea id="moduleDesc" style="width: 100%; padding: 8px; min-height: 80px;">${module.description || ''}</textarea>
                    </div>

                    <h4 style="margin-top: 20px; margin-bottom: 15px;">📋 模块属性</h4>
                    <div id="attributesList" style="border: 1px solid #eee; border-radius: 6px; padding: 10px; margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
                        ${module.attributes && module.attributes.length > 0 ? module.attributes.map((attr, idx) => `
                            <div style="padding: 8px; background: #f9f9f9; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>${attr.name}</strong> (${attr.type})
                                    <div style="color: #999; font-size: 12px; margin-top: 2px;">${attr.value}</div>
                                </div>
                                <button type="button" class="btn btn-sm btn-warning" onclick="window.moduleManagement.editAttribute('${moduleId}', '${attr.id}')">编辑</button>
                            </div>
                        `).join('') : '<p style="color: #999;">暂无属性</p>'}
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="newAttrName" placeholder="属性名" style="flex: 1; padding: 8px;">
                        <input type="text" id="newAttrValue" placeholder="属性值" style="flex: 1; padding: 8px;">
                        <button type="button" class="btn btn-info" onclick="window.moduleManagement.addAttribute('${moduleId}')">添加属性</button>
                    </div>

                    <div style="margin-top: 20px; display: flex; gap: 10px;">
                        <button type="submit" class="btn btn-primary">💾 保存</button>
                        <button type="button" class="btn btn-danger" onclick="window.moduleManagement.deleteModule('${moduleId}')">🗑️ 删除模块</button>
                    </div>
                </form>
            `;
        } catch (error) {
            console.error('加载模块详情失败:', error);
        }
    },

    async addNewModule() {
        const name = prompt('请输入模块名称：');
        if (!name) return;

        const description = prompt('请输入模块描述（可选）：');

        try {
            const response = await fetch('/api/modules/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: window._appState?.currentProjectId,
                    module_name: name,
                    module_description: description || ''
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                showNotification('模块创建成功', 'success');
                loadModulesList();
            } else {
                showNotification('创建失败: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('创建模块失败: ' + error.message, 'error');
        }
    },

    async saveModule(event, moduleId) {
        event.preventDefault();

        try {
            const name = document.getElementById('moduleName').value;
            const description = document.getElementById('moduleDesc').value;

            const response = await fetch(`/api/modules/update/${moduleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: window._appState?.currentProjectId,
                    module_name: name,
                    module_description: description
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                showNotification('模块保存成功', 'success');
                loadModulesList();
            } else {
                showNotification('保存失败: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('保存模块失败: ' + error.message, 'error');
        }
    },

    async addAttribute(moduleId) {
        try {
            const name = document.getElementById('newAttrName').value.trim();
            const value = document.getElementById('newAttrValue').value.trim();

            if (!name || !value) {
                showNotification('请输入属性名和属性值', 'warning');
                return;
            }

            const response = await fetch(`/api/modules/add-attribute/${moduleId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: window._appState?.currentProjectId,
                    attr_name: name,
                    attr_value: value
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                showNotification('属性添加成功，类型自动识别：' + result.data.type, 'success');
                document.getElementById('newAttrName').value = '';
                document.getElementById('newAttrValue').value = '';
                this.showModuleDetail(moduleId);
            } else {
                showNotification('添加失败: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('添加属性失败: ' + error.message, 'error');
        }
    },

    editAttribute(moduleId, attributeId) {
        const newValue = prompt('请输入新的属性值：');
        if (!newValue) return;

        this.updateAttribute(moduleId, attributeId, newValue);
    },

    async updateAttribute(moduleId, attributeId, newValue) {
        try {
            const response = await fetch(`/api/modules/update-attribute/${moduleId}/${attributeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: window._appState?.currentProjectId,
                    attr_value: newValue
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                showNotification('属性更新成功，类型已重新识别：' + result.data.type, 'success');
                this.showModuleDetail(moduleId);
            } else {
                showNotification('更新失败: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('更新属性失败: ' + error.message, 'error');
        }
    },

    async deleteModule(moduleId) {
        const confirmed = await new Promise(resolve => {
            if (typeof window.showConfirmModal === 'function') {
                window.showConfirmModal('删除模块', '确定要删除此模块吗？', () => resolve(true), () => resolve(false));
            } else {
                // fallback: 动态导入
                import('./ui.js').then(ui => ui.showConfirmModal('删除模块', '确定要删除此模块吗？', () => resolve(true), () => resolve(false)));
            }
        });
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/modules/delete/${moduleId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: window._appState?.currentProjectId
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                showNotification('模块已删除', 'success');
                loadModulesList();
                document.getElementById('moduleDetailEditor').innerHTML = '
                    <div style="text-align: center; color: #999; padding: 40px;">
                        请从左侧列表选择模块
                    </div>
                ';
            } else {
                showNotification('删除失败: ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('删除模块失败: ' + error.message, 'error');
        }
    }
};
