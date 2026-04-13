# 文档归档流程调试指南

## 问题
普通用户点击"确认归档"按钮后，没有提示，也没有创建审批请求。

## 诊断步骤

### 第一步：打开浏览器开发者工具
1. 按 `F12` 打开 Chrome/Edge 开发者工具
2. 切换到 **Console** 标签页
3. 保持Console窗口在屏幕下方

### 第二步：重现问题
1. 使用**普通用户**账号登录（role=contractor）
2. 打开一个项目
3. 找到需要归档的文档
4. 点击"📦 确认归档"按钮

### 第三步：观察和收集日志

#### 在浏览器Console中查看
应该看到这样的日志序列：
```
[DEBUG] archiveDocument called...
[DEBUG] Regular contractor - submitting archive review. User role: contractor
[DEBUG] submitArchiveReview called - cycle: ... docNames: ... projectId: ...
[DEBUG] getArchiveApprovers response: {ok: true, status: 200, data: {...}}
[DEBUG] Found approvers: N
[DEBUG] promptSelectApprovers called with approvers: [...]
[DEBUG] Appending modal to document.body
[DEBUG] Modal appended, attaching event listeners
[DEBUG] Event listeners attached
```

如果对话框出现，继续：
- 选择审批人
- 点击"提交审核"按钮

#### 预期日志（如果成功）
```
[DEBUG] Confirm button clicked, selected approvers: [123, 456]
[DEBUG] submitArchiveRequest called - projectId: ... cycle: ... docNames: ... targetApproverIds: [123, 456]
[DEBUG] submitArchiveRequest response: {ok: true, status: 200, data: {status: "success", ...}}
```

### 第四步：诊断问题

#### 情况1：如果日志中止于"getArchiveApprovers response"
**问题：** 后端没有找到任何审批人
**检查：**
1. 项目是否有分配的项目经理？
2. 项目经理的状态是否为 `active`？
3. 查看服务器日志中的这些行：
   ```
   [DEBUG] Found X approvers with roles
   [DEBUG] Returning X approvers
   ```

**解决：**
- 需要创建/分配一个活跃的项目经理给该项目
- 或联系admin创建至少一个pmo用户

---

#### 情况2：如果对话框没有出现
**问题：** 前端DOM或事件监听器有问题
**查看日志中是否出现：**
```
[DEBUG] Modal appended, attaching event listeners
```

**如果有这行说明modal被添加了但没显示：**
- 按 `Ctrl+Shift+C` 打开DevTools元素检查
- 在页面上看是否有 `modal-overlay` 元素
- 检查其CSS是否被隐藏了

**如果没有这行说明modal创建失败：**
- 查看是否有JS错误（通常会显示为红色）
- 检查approvers数据结构是否正确

---

#### 情况3：提交成功但没有通知
**问题：** 审批请求可能已创建，但通知没有显示
**检查：**
1. 查看数据库中是否创建了 `archive_approvals` 记录
2. 查看服务器日志中的这些行：
   ```
   [DEBUG] create_archive_approval result: {status: "success", ...}
   [DEBUG] Sending message to approver X
   ```

---

#### 情况4：API返回错误
**查看类似这样的日志：**
```
[ERROR] submitArchiveRequest response: {ok: false, status: 400, data: {status: "error", message: "..."}}
```

**常见错误和解决方案：**

| 错误消息 | 原因 | 解决方案 |
|---------|------|--------|
| `已存在相同的待审批请求` | 已经提交过相同的请求 | 检查"待审核"状态，等待审批或驳回 |
| `归档参数不完整` | cycle或doc_names缺失 | 确保正确选择了周期和文档 |
| `无可用审批人` | 找不到任何审批人 | 参考"情况1"解决 |

---

### 第五步：收集完整日志报告

如果问题仍未解决，收集以下信息：
1. 打开浏览器Console，右键点击日志 → "Copy (as) → JSON"
2. 整个日志序列（从"archiveDocument called"到最后的结果）
3. 项目ID
4. 文档周期名称
5. 用户角色和组织

然后把日志粘贴到问题报告中。

---

## 服务器日志查看

### Flask服务器标准输出（stderr）
查看启动Flask服务器的终端窗口，应该看到：
```
[DEBUG] submit_archive_request - project_id: ...
[DEBUG] Found X approvers with roles
[DEBUG] create_archive_approval result: ...
```

如果看到红色的 `[ERROR]` 日志，那就是服务器端的问题。

---

## 常见原因总结

| 现象 | 最可能原因 |
|------|----------|
| 点击没反应 | 1. 没有可用审批人 2. 前端JS异常 3. 网络问题 |
| 对话框出现但提交无效 | 1. approver_id是null 2. 后端权限检查失败 3. 创建审批失败 |
| 审批请求没发送给项目经理 | 1. message_manager有问题 2. approver_id不正确 3. 前端取消了 |
| 数据库中没有记录 | 1. user_manager.create_archive_approval失败 2. 异常被捕获了 |

---

## 快速修复清单

- [ ] 确保项目已分配项目经理（project_admin角色）
- [ ] 确保项目经理状态为active
- [ ] 在浏览器Console中检查是否有红色错误
- [ ] 检查服务器标准输出中是否有[ERROR]日志  
- [ ] 确保用户角色确实是contractor（不是project_admin或admin）
- [ ] 清除浏览器缓存（Ctrl+Shift+Delete）后重试
- [ ] 检查网络标签页（Network tab）中的API请求是否返回200
