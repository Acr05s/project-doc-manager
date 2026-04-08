# ZIP 上传问题修复说明（数据库存储版）

## 问题描述
在 Ubuntu 系统上，上传 ZIP 文件包后提示匹配成功，但数据库存储的文档数据没有正确显示。

## 修复内容

### 1. zip.py - 增强数据同步
- 在保存项目配置前，将 ZIP 匹配结果直接同步到 `documents.db`
- 确保每个归档的文档都有完整的字段（doc_id, cycle, doc_name, file_path 等）

### 2. project_data_manager.py - 修复数据加载
- 修复 `file_path` 格式检查逻辑，支持 `{项目名}/uploads/...` 格式
- 删除重复的 `documents.db` 加载代码
- 确保从数据库加载的文档都有 `doc_id` 字段

### 3. zip_matcher.py - 增强文档保存
- 确保文档信息包含所有必要字段（`cycle`, `directory`, `file_size`, `doc_id`）
- 添加额外的持久化保障：同时写入 `documents_index.json`

## 诊断工具（位于 test/ 目录）

### test/diagnose_db.py - 数据库诊断
检查文档是否正确存储在数据库中：

```bash
# 在项目根目录运行
python test/diagnose_db.py "项目名称"

# 或在 test 目录运行
python diagnose_db.py "项目名称"
```

会检查：
1. 项目的 `documents.db` 中的文档数量和详情
2. `projects_index.db` 中的 `documents_index` 配置

### test/diagnose_zip_upload.py - 综合诊断
检查所有数据存储位置：

```bash
# 在项目根目录运行
python test/diagnose_zip_upload.py "项目名称"

# 或在 test 目录运行
python diagnose_zip_upload.py "项目名称"
```

会检查：
1. 项目目录结构
2. `project_config.json` 中的 uploaded_docs
3. `documents_index.json` 中的文档
4. `documents.db` 中的文档
5. `zip_uploads.json` 中的上传记录

## 数据流说明

ZIP 匹配后的数据存储流程：

```
1. ZIP 匹配完成
   ↓
2. _archive_file() 方法
   ├── 添加到 project_config['documents'][cycle]['uploaded_docs']
   ├── 写入 doc_manager.documents_db（内存缓存）
   ├── 写入项目的 documents.db（SQLite 数据库）
   └── 写入 documents_index.json（JSON 备份）
   ↓
3. save_project() 调用 save_full_config()
   ├── 保存 project_info 到 projects_index.db
   ├── 保存 requirements 到 projects_index.db
   ├── 从 uploaded_docs 提取 documents_index 保存到 projects_index.db
   └── 保存到各个 JSON 文件（备份）
   ↓
4. load_full_config() 加载数据
   ├── 从 projects_index.db 加载 project_info
   ├── 从 projects_index.db 加载 requirements
   ├── 调用 load_documents_index()
   │   ├── 优先从 projects_index.db 加载 documents_index
   │   ├── 回退到项目的 documents.db
   │   └── 回退到 documents_index.json
   └── 合并到 config['documents'][cycle]['uploaded_docs']
```

## 测试步骤

1. **应用修复代码**
   ```bash
   # 上传修改后的文件到 Ubuntu
   scp app/utils/zip_matcher.py user@ubuntu:/path/to/project/app/utils/
   scp app/routes/documents/zip.py user@ubuntu:/path/to/project/app/routes/documents/
   scp app/utils/project_data_manager.py user@ubuntu:/path/to/project/app/utils/
   ```

2. **重启服务**
   ```bash
   sudo systemctl restart your-service
   ```

3. **上传 ZIP 测试**
   - 选择项目
   - 上传 ZIP 文件
   - 等待匹配完成

4. **运行诊断脚本**
   ```bash
   cd /path/to/project
   python test/diagnose_db.py "你的项目名称"
   ```

5. **检查前端显示**
   - 刷新页面
   - 检查各周期下的文档是否正确显示

## 常见问题

### 问题1：documents.db 有数据但前端不显示
**可能原因**：`projects_index.db` 中的 `documents_index` 为空或损坏
**解决方案**：清除 `projects_index.db` 中的 `documents_index` 配置，让系统从 `documents.db` 重新加载

### 问题2：匹配成功但 documents.db 为空
**可能原因**：写入数据库时出错
**解决方案**：检查服务端日志，查看 `[ZIP归档]` 相关的错误信息

### 问题3：file_path 格式错误
**可能原因**：路径格式不匹配（Windows 反斜杠 vs Linux 正斜杠）
**解决方案**：修复已应用，`normalize_file_path` 函数会统一处理路径格式

## 日志关键字

查看服务端日志时，关注以下关键字：
- `[ZIP匹配]` - ZIP 匹配过程的日志
- `[ZIP归档]` - 文档归档过程的日志
- `从 documents.db 加载` - 数据加载日志
- `documents_index 数据损坏率` - 数据质量检测日志

## 回滚方案

如果修复导致问题，可以回滚以下文件：
```bash
cp app/utils/zip_matcher.py.bak app/utils/zip_matcher.py
cp app/routes/documents/zip.py.bak app/routes/documents/zip.py
cp app/utils/project_data_manager.py.bak app/utils/project_data_manager.py
```
