# 项目文档管理中心 v3.0.3 📁

一个功能完整的项目全生命周期文档管理系统，支持文档收集、版本管理、自动签字/盖章识别、ZIP批量导入、项目打包导出、多级权限管控、项目移交、操作日志审计等功能。

## ⚠️ 重要提示：首次使用请先安装依赖

Windows 用户首次使用前**必须手动安装依赖**，自动安装经常因网络或环境原因失败。

### Windows 快速开始（推荐）

**首次使用（必须执行）：**

```bash
# 方法1：双击安装脚本（最简单）
双击 install.bat                    # 使用默认源
或 双击 install-tsinghua.bat        # 使用清华镜像（国内推荐）

# 方法2：命令行安装
python -m venv venv
venv\Scripts\pip install -r requirements.txt

# 方法3：使用清华镜像（国内下载更快）
python -m venv venv
venv\Scripts\pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

**后续启动：**
```bash
双击 start.bat
```

### Linux / macOS

**方式 1：Git Clone 快速安装（推荐）**

```bash
# 1. 克隆仓库
git clone https://github.com/Acr05s/project-doc-manager.git
cd project-doc-manager

# 2. 安装依赖（首次运行）
chmod +x launcher.sh
./launcher.sh install

# 国内用户推荐使用清华镜像加速
./launcher.sh install --mirror

# 3. 启动服务
./launcher.sh start

# 访问 http://localhost:5000
```

**方式 2：已有代码直接启动**

```bash
# 添加执行权限并启动
chmod +x launcher.sh
./launcher.sh start
```

## ✨ 核心功能

### 📁 项目管理
- **项目创建与管理**：支持创建多个项目，每个项目独立管理
- **回收站机制**：删除的项目先进入回收站，可随时恢复或彻底删除
- **项目打包导出**：将项目文档按结构打包为ZIP文件下载
- **ZIP批量导入**：上传ZIP压缩包，智能匹配文档到对应分类
- **项目所有权移交**：支持将项目移交到其他承建单位，需目标单位项目经理审批接收
- **批量管理**：支持批量删除、批量修改承建单位、批量启用/停用项目

### 📄 文档管理
- **竖向周期展示**：按项目生命周期阶段竖向展示文档结构
- **多版本支持**：每个文档类型支持上传多个版本
- **实时上传**：AJAX文件上传，支持拖拽和点击选择
- **分片上传**：大文件支持分片上传，避免中断
- **文档替换**：支持覆盖已有文档，保留历史版本

### 🔍 智能识别
- **自动签字检测**：使用OpenCV边缘检测算法识别手写签字
- **自动盖章识别**：通过颜色分析识别红色/蓝色印章
- **置信度显示**：识别结果附带置信度百分比

### 👤 用户与权限
- **四级角色体系**：管理员(admin)、PMO、项目经理(project_admin)、普通用户(contractor)
- **项目隔离**：项目经理和普通用户仅可见本单位或自己创建的项目；管理员/PMO 可管理全部项目
- **待审核流程**：新用户注册后进入待审核状态，可登录但仅限受限面板，支持给管理员留言
- **个人自助服务**：个人设置中可修改邮箱、修改密码（需验证旧密码）、自助停用账户

### 🏢 系统管理
- **用户管理**：集中查看所有用户，支持搜索、状态筛选、重置密码、切换状态、修改角色，以及批量删除/启用/禁用/修改角色
- **承建单位管理**：管理承建单位列表，支持指定项目经理为单位管理员，支持批量删除
- **项目管理**：管理员/PMO 可查看全部项目，支持搜索、状态筛选、批量修改单位、批量启用/停用、批量删除、批量移交
- **日志管理**：操作日志集中审计，支持按时间和操作类型筛选；管理员看全部日志，项目经理看本单位日志，普通用户只看自己的日志

### 💬 消息中心
- **未读提醒**：顶部导航显示未读消息数量角标
- **点击穿透**：用户审核、项目移交、项目类消息可直接点击跳转处理
- **一键已读**：支持标记单条或全部消息为已读

### 📊 统计与报告
- **完成度统计**：实时统计各阶段文档完成率
- **缺失文档提醒**：直观显示未上传的必需文档
- **报告导出**：生成HTML格式的项目文档报告

### 🔒 并发控制
- **会话锁定**：多用户环境下防止同时编辑同一项目
- **心跳保活**：自动维持会话，防止长时间操作被中断

## 🏗️ 项目结构

```
project_doc_manager/
├── start.bat              # Windows 启动脚本（依赖安装后使用）
├── start.py               # Python 启动器
├── launcher.sh            # Linux/Mac 启动器（含系统服务支持）
├── update.bat             # Windows 检查更新
├── update.py              # Python 更新脚本
├── main.py                # Flask 主程序
├── requirements.txt       # Python 依赖
├── plugin.json            # 插件配置
├── Version.txt            # 版本信息
├── README.md              # 本文件
├── docs/                  # 文档目录
│   ├── PROJECT_DOCUMENTATION.md      # 技术文档
│   ├── PROJECT_ENGINEERING_GUIDE.md  # 工程说明（模块/字段/迁移）
│   ├── PRODUCT_MANUAL.md             # 产品手册（使用说明）
│   ├── MIGRATION_ROLLBACK_GUIDE.md   # 迁移回滚手册
│   ├── DEPLOYMENT_GUIDE.md           # 部署指南
│   ├── QUICK_START.md                # 快速开始
│   ├── ARCHIVE_DEBUG_GUIDE.md        # 归档调试指南
│   ├── ZIP_UPLOAD_FIX.md             # ZIP上传修复说明
│   └── ZIP_UPLOAD_FIX_DB.md          # ZIP上传数据库修复说明
├── app/                   # 后端代码
├── static/                # 前端资源
├── templates/             # HTML 模板
├── tools/                 # 工具脚本
├── projects/              # 项目数据（运行时创建）
├── uploads/               # 上传文件（运行时创建）
└── logs/                  # 日志文件（运行时创建）
```

## 📋 使用方法

### 1. 创建项目

1. 点击左上角项目下拉菜单
2. 选择"新建项目"
3. 填写项目信息：
   - 项目名称
   - 甲方/乙方/监理/管理单位
   - 项目周期
4. 上传需求清单 Excel（A列：周期，C列：文档名，D列：要求）
5. 点击"创建"

### 2. 上传文档

1. 选择左侧的项目周期
2. 在右侧找到需要上传的文档类型
3. 点击"查看/管理文档"
4. 选择上传方式：
   - **本地文件**：点击选择或直接拖拽
   - **ZIP文件**：从已上传的ZIP包中选择
5. 填写文档信息（日期、签字人等）
6. 点击"上传"

### 3. ZIP批量导入

1. 准备包含多个文档的ZIP压缩包
2. 在任意文档弹窗中选择"从ZIP选择"
3. 上传ZIP文件或选择已上传的ZIP包
4. 搜索并选择要导入的文件
5. 系统自动匹配到对应文档类型

### 4. 删除与恢复

**删除项目：**
1. 点击项目下拉菜单
2. 点击项目旁边的"删除"按钮
3. 项目移至回收站

**恢复项目：**
1. 在项目下拉菜单底部展开"已删除项目"
2. 点击"恢复"按钮

**彻底删除：**
1. 在回收站中点击"彻底删除"
2. ⚠️ 此操作不可恢复！

### 5. 打包导出

1. 点击顶部菜单"文档管理" → "打包项目"
2. 选择打包范围（全部或部分周期）
3. 等待打包完成
4. 下载ZIP文件

## 🔧 启动器命令

### Windows

**首次使用：**
```bash
# 双击安装依赖
install.bat              # 使用默认 PyPI 源
install-tsinghua.bat     # 使用清华镜像（国内推荐）
```

**启动：**
```bash
start.bat                # 启动服务（依赖安装后使用）
```

**或者使用 Python 直接启动：**
```bash
# 依赖安装后
venv\Scripts\python main.py
```

### Linux/Mac (launcher.sh)

```bash
./launcher.sh install     # 安装依赖
./launcher.sh install --mirror  # 使用清华镜像安装（国内推荐）
./launcher.sh start       # 启动服务
./launcher.sh stop        # 停止服务
./launcher.sh restart     # 重启服务
./launcher.sh status      # 查看状态
./launcher.sh logs        # 实时查看日志
./launcher.sh log         # 查看最近50行日志
./launcher.sh install     # 安装/更新依赖
./launcher.sh upgrade     # 检查更新
./launcher.sh enable      # 安装为系统服务（开机自启）
./launcher.sh disable     # 卸载系统服务
./launcher.sh service     # 查看服务状态
./launcher.sh help        # 显示帮助

# 指定端口和线程数
./launcher.sh start -p 8080 -t 20
```

### Linux/Mac（推荐使用 Daemon.sh）

```bash
chmod +x Daemon.sh
./Daemon.sh install
./Daemon.sh start

# 升级（会自动执行数据库与数据文件迁移）
./Daemon.sh upgrade
```

## 🔄 升级与迁移

推荐直接使用以下命令完成升级：

```bash
./Daemon.sh upgrade
```

升级过程将自动执行：
1. 拉取最新代码。
2. 更新依赖。
3. 自动迁移数据库（`data/users.db`）。
4. 自动迁移运行时数据文件（如 `uploads/tasks/report_schedules.json`）。
5. 自动重启服务。

如需只检查迁移差异：

```bash
python tools/migrate_branch.py --check
```

## 🐛 常见问题与异常处理

### 启动失败 / ModuleNotFoundError

**症状**: 提示 `No module named 'xxx'`

**解决**（Windows）：
```bash
# 方法1：双击安装脚本（最简单）
install.bat

# 方法2：手动安装
python -m venv venv
venv\Scripts\pip install --upgrade pip
venv\Scripts\pip install -r requirements.txt
```

**解决**（Linux/Mac）：
```bash
./launcher.sh install
```

### 编码错误 (Windows)

**症状**: `UnicodeDecodeError: 'gbk' codec can't decode`

**解决**: 使用 PowerShell 或已修复的 start.py 启动

### 无法上传文件

**症状**: 上传按钮无响应或报错

**解决**:
1. 检查 uploads/ 目录是否存在且有写入权限
2. 检查文件大小是否超过限制（默认1GB）
3. 检查文件类型是否在白名单内

### 无法打开项目

**症状**: 提示"项目正在打包中"或"会话已过期"

**解决**:
1. 等待打包完成后再打开
2. 或联系管理员清除打包状态
3. 刷新页面重新登录

### 签字/盖章识别失败

**症状**: 已签字的文档识别为"无签字"

**解决**:
1. 确保图片清晰，分辨率足够
2. 手动勾选"已签字"/"已盖章"复选框
3. 在 `main.py` 中调整识别阈值

### 端口被占用

**症状**: `Address already in use`

**解决**:
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <进程ID> /F

# Linux/Mac
lsof -i :5000
kill -9 <进程ID>

# 或使用其他端口
./launcher.sh start -p 8080
```

### pip 安装缓慢或超时

**症状**: 安装依赖时卡住或超时

**解决**（使用国内镜像）：
```bash
venv\Scripts\pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

## 🔐 安全特性

- 文件类型白名单校验
- 文件大小限制（可配置）
- 上传目录隔离
- 用户会话管理
- 并发操作锁定

## ⚙️ 配置说明

编辑 `plugin.json` 可修改配置：

```json
{
  "config": {
    "upload_folder": "uploads",
    "max_file_size": 1073741824,
    "allowed_extensions": [
      "pdf", "doc", "docx", "xlsx", "xls",
      "png", "jpg", "jpeg", "tiff", "ppt", "pptx"
    ]
  }
}
```

## 🛠️ 工具代码

### 工具目录结构

```
tools/
├── diagnostics/  # 诊断工具
├── cleanup/      # 清理工具
├── fix/          # 修复工具
└── test/         # 测试工具
```

### 诊断工具 (diagnostics/)

- **check_config.py**: 检查项目配置文件
  ```bash
  python tools/diagnostics/check_config.py [项目名称]
  ```

- **check_uploaded.py**: 检查已上传的文档信息
  ```bash
  python tools/diagnostics/check_uploaded.py <project_id>
  ```

- **debug_list.py**: 调试文档列表
  ```bash
  python tools/diagnostics/debug_list.py <project_id> [cycle] [doc_name]
  ```

- **diagnose_db.py**: 数据库诊断工具
  ```bash
  python tools/diagnostics/diagnose_db.py <项目名称>
  ```

- **diagnose_is_error.py**: 诊断错误
  ```bash
  python tools/diagnostics/diagnose_is_error.py
  ```

- **diagnose_packaging.py**: 诊断打包问题
  ```bash
  python tools/diagnostics/diagnose_packaging.py
  ```

- **diagnose_zip_upload.py**: 诊断ZIP上传问题
  ```bash
  python tools/diagnostics/diagnose_zip_upload.py
  ```

- **quick_diagnose.py**: 快速诊断工具
  ```bash
  python tools/diagnostics/quick_diagnose.py
  ```

### 清理工具 (cleanup/)

- **cleanup_duplicates.py**: 清理重复文档
  ```bash
  python tools/cleanup/cleanup_duplicates.py
  ```

- **cleanup_requirements.py**: 清理需求文件
  ```bash
  python tools/cleanup/cleanup_requirements.py
  ```

### 修复工具 (fix/)

- **fix_directory.py**: 修复目录结构
  ```bash
  python tools/fix/fix_directory.py
  ```

- **fix_project_dirs.py**: 修复项目目录
  ```bash
  python tools/fix/fix_project_dirs.py
  ```

- **reset_directory.py**: 重置目录结构
  ```bash
  python tools/fix/reset_directory.py
  ```

### 测试工具 (test/)

- **test_duplicate_cleanup.py**: 测试重复清理
  ```bash
  python tools/test/test_duplicate_cleanup.py
  ```

- **test_file_paths.py**: 测试文件路径
  ```bash
  python tools/test/test_file_paths.py
  ```

### 诊断工具

- **check_db3.py**: 检查数据库
  ```bash
  python tools/diagnostics/check_db3.py <project_id>
  ```

- **check_depth.py**: 检查目录深度
  ```bash
  python tools/check_depth.py
  ```

- **check_directory_display.py**: 检查目录显示
  ```bash
  python tools/check_directory_display.py
  ```

- **check_long_dirs.py**: 检查长目录名
  ```bash
  python tools/check_long_dirs.py
  ```

- **init_project_stats.py**: 初始化项目统计
  ```bash
  python tools/init_project_stats.py
  ```

- **migrate_to_db.py**: 数据迁移到数据库
  ```bash
  python tools/migrate_to_db.py
  ```

## 📚 更多文档

- [技术文档](docs/PROJECT_DOCUMENTATION.md) - 详细架构和API说明
- [部署指南](docs/DEPLOYMENT_GUIDE.md) - 生产环境部署
- [快速开始](docs/QUICK_START.md) - 5分钟上手指南

## 📝 更新日志

### v3.0.3
- **周期状态修复**：修复周期状态计算优先级，文档全部归档后可正确显示“已归档”
- **样式一致性修复**：移除周期导航项内联缩放样式，避免刷新后字体大小不一致
- **版本文档同步**：同步更新 `Version.txt` 与项目说明文档版本标识

### v3.0.1
- **模板管理增强**：新增模板编辑能力，支持修改模板名称、描述，并可选择使用当前编辑器内容覆盖模板结构
- **拆分导入模板**：文档需求编辑器导入新增“拆分导入”模式，可只导入模板中的一条或多条记录
- **周期栏可恢复**：修复周期栏隐藏后无法恢复显示的问题，新增独立悬浮“显示周期栏”按钮
- **升级自动迁移**：`Daemon.sh upgrade` 现在会在依赖安装后自动执行迁移脚本，确保数据库结构升级及时生效

### v3.0.0
- **系统管理大改版**：集成用户管理、承建单位管理、项目管理到统一的下拉菜单
- **批量操作**：支持批量删除用户/单位/项目、批量修改用户角色、批量切换用户状态、批量修改项目承建单位、批量移交项目
- **日志管理**：新增操作日志审计页面，按角色分级查看（admin/PMO 看全部，项目经理看本单位，普通用户看自己）
- **四级权限体系**：新增 admin / PMO / project_admin / contractor 角色，实现项目级数据隔离
- **项目移交**：支持项目所有权转移到其他承建单位，需目标单位项目经理审批
- **待审核流程**：新用户注册后进入 pending 状态，可登录并与审核人留言，管理员可一键通过/拒绝
- **个人设置**：支持修改邮箱、修改密码（旧密码验证）、自助停用账户
- **消息中心增强**：支持未读角标、消息点击穿透处理（用户审核、项目移交、项目通知）
- **PMO 默认归属**：新建项目默认 party_b = PMO，PMO 始终拥有全局 oversight

### v2.6.0
- 工具代码整理：将诊断和测试工具代码移动到 tools 目录
- 清理过时的诊断代码
- 优化 tools 目录结构，按功能分类：diagnostics、cleanup、fix、test
- 修复工具代码中的硬编码问题
- 更新 README.md，添加工具代码使用说明
- 版本号升级到 v2.6.0

### v2.5.0
- 重构 PDF 转换服务：去掉 docx2pdf 依赖，改用 comtypes 直接调用 Office COM
- 修复 .doc 文件转换报 "Package not found" 的问题
- 转换逻辑按平台分支：Windows 优先 COM，Linux/Ubuntu 优先 LibreOffice
- 修复服务重启后文档预览报"文档不存在"的问题
- previewDocument 添加 filename 防御性检查

### v2.4.0
- 修复文档预览 API：view_document 添加 documents_index.db 查找逻辑
- 解决服务重启后 PDF/图片无法预览的问题

### v2.3.3
- 添加文档模板导入导出功能
- 支持从 JSON 文件导入文档需求模板
- 支持导出项目模板为 JSON 文件
- 修复文档预览 HTML 转义问题（escapeHtml 函数）
- 优化报告生成功能，按显示顺序排序
- 合并多用户版本代码

### v2.1.1B
- 添加 Ubuntu 系统服务支持（开机自启）
- 修复 Windows 控制台编码问题
- 优化项目删除机制（软删除到回收站）
- 整理项目目录结构

### v2.1.0
- 添加 ZIP 批量导入功能
- 添加项目打包导出功能
- 添加文档预览功能（Office转PDF）
- 添加回收站功能
- 添加多用户并发控制

---

**版本**: v3.0.3  
**最后更新**: 2026年4月17日
**Python**: 3.8+  
**支持**: Windows 10/11, Ubuntu, macOS
