# 项目工程说明（模块与数据字段）

## 1. 项目定位
本系统用于项目文档全生命周期管理，覆盖文档需求配置、上传归档、审批流、消息通知、统计报告与定时任务。

## 2. 代码结构总览
- `main.py`: 应用入口，初始化 Flask、认证、安全钩子、路由与服务。
- `app/auth/`: 认证与权限控制。
- `app/routes/`: API 路由层，负责参数解析、权限校验、返回封装。
- `app/services/`: 业务服务层（如定时报告、任务调度）。
- `app/models/`: 用户与消息等数据模型封装。
- `app/utils/`: 文档管理、数据库访问、迁移、识别算法等基础能力。
- `static/js/modules/`: 前端模块（项目管理、文档管理、定时任务、权限展示等）。
- `templates/`: 页面模板。
- `tools/`: 运维脚本与迁移脚本。

## 3. 核心模块说明
### 3.1 认证与权限
- 用户角色：`admin`、`pmo`、`pmo_leader`、`project_admin`、`contractor`。
- 项目级访问通过路由装饰器统一控制。
- 菜单可见性由前端权限配置与后端角色判断共同控制。

### 3.2 文档管理
- 支持周期/文档要求结构化管理。
- 支持文档上传、替换、属性标注、归档状态跟踪。
- 支持 ZIP 文件导入与匹配。

### 3.3 定时报告任务
- 数据文件：`uploads/tasks/report_schedules.json`。
- 支持多任务：新建、编辑、启用/停用、删除、立即执行、批量操作。
- 支持任务类型：`periodic`（周期）/`one_time`（一次性）。

### 3.4 消息中心
- 站内信按用户收件箱维度管理。
- 支持未读统计、批量已读、删除、关联业务跳转。

## 4. 数据存储与关键字段

### 4.1 SQLite 数据库（`data/users.db`）

#### `users`
- `id`: 主键。
- `uuid`: 对外稳定标识。
- `username`: 登录账号。
- `password_hash`: 密码哈希。
- `role`: 角色。
- `status`: 用户状态。
- `organization`: 所属组织。
- `email`: 邮箱。
- `display_name`: 显示名。
- `created_at`: 创建时间。

#### `messages`
- `id`, `uuid`: 消息标识。
- `sender_id`, `receiver_id`: 发件人/收件人。
- `title`, `content`: 标题和内容。
- `type`: 消息类型。
- `is_read`: 是否已读。
- `related_id`, `related_type`: 关联业务对象。
- `created_at`: 创建时间。

#### `archive_approvals`
- `id`, `uuid`: 审批记录标识。
- `project_id`, `cycle`, `doc_names`: 审批上下文。
- `requester_id`, `approved_by_id`: 发起人与处理人。
- `status`: `pending/approved/rejected` 等。
- `request_type`: 请求类型。
- `approval_stages`, `current_stage`, `stage_history`: 多级审批字段。
- `created_at`, `resolved_at`: 时间字段。

### 4.2 运行时数据文件

#### `uploads/tasks/report_schedules.json`
- 顶层结构：`{ project_id: [task, ...] }`
- 单个 `task` 关键字段：
- `task_id`: 任务 ID。
- `task_name`: 任务名称。
- `task_type`: `periodic` 或 `one_time`。
- `enabled`: 是否启用。
- `frequency`: `daily/weekly/monthly`。
- `send_time`: 发送时间（`HH:MM`）。
- `weekday`: 周任务执行日（1-7）。
- `day_of_month`: 月任务执行日（1-28）。
- `run_date`: 一次性任务执行日期（`YYYY-MM-DD`）。
- `recipient_user_ids`: 内部收件人。
- `external_emails`: 外部收件人邮箱列表。
- `run_count`: 已执行次数。
- `last_run_at`: 最后执行时间。
- `last_run_key`: 去重执行键。

## 5. API 返回结构约定（结果字段解释）
统一返回示例：
```json
{
  "status": "success",
  "message": "可选提示信息",
  "data": {},
  "tasks": [],
  "recipient_options": []
}
```

字段说明：
- `status`: `success` 或 `error`。
- `message`: 人类可读结果描述。
- `data`: 主要对象（单实体返回时）。
- `tasks`: 任务列表（定时任务接口）。
- `recipient_options`: 可选收件人列表。
- `project_meta`: 项目展示元信息（如承建单位、项目名）。

## 6. 升级与迁移机制
- 入口命令：`./Daemon.sh upgrade`
- 执行顺序：
1. 拉取最新代码。
2. 更新依赖。
3. 自动执行迁移脚本（数据库 + 项目配置 + 运行时数据文件）。
4. 重启服务。

迁移脚本：
- `tools/migrate_branch.py`: 全量升级迁移（推荐）。
- `tools/migrate_db.py`: 仅数据库结构迁移（兜底）。

## 7. 隐私与内容治理建议
- 诊断脚本、示例脚本中禁止写入真实项目名称或真实用户信息。
- 示例数据统一使用“示例项目/示例用户/示例组织”。
- 文档和注释仅保留平台运行相关信息，避免引入业务外敏感内容。
