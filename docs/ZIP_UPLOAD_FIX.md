# ZIP 上传问题修复说明

## 问题描述
在 Ubuntu 系统上，上传 ZIP 文件包后提示匹配成功，但是没有数据显示出来。

## 修复内容

### 1. zip_matcher.py - 增强文档保存逻辑
- 确保文档信息包含所有必要字段（`cycle`, `directory`, `file_size`, `doc_id`）
- 添加额外的持久化保障：同时写入 `documents_index.json`
- 改进错误处理，确保即使某个保存失败也不影响主流程

### 2. zip.py - 增强日志记录和验证
- 在保存项目配置前添加详细的日志输出
- 统计并输出每个周期的已上传文档数量
- 验证保存结果，如果失败则记录错误日志

### 3. project_data_manager.py - 改进数据加载
- 在 `load_documents_index` 方法中添加 `doc_id` 缺失时的回退处理
- 确保从数据库加载的文档都有 `doc_id` 字段
- 改进数据质量检测逻辑

## 诊断工具

新增了 `diagnose_zip_upload.py` 脚本，用于排查问题：

```bash
python diagnose_zip_upload.py "项目名称"
```

该脚本会检查：
1. 项目目录是否存在
2. `project_config.json` 中的 uploaded_docs
3. `documents_index.json` 中的文档
4. `documents.db` 中的文档
5. `zip_uploads.json` 中的上传记录

## 可能的原因

1. **数据保存不完整**：ZIP 匹配后的文档信息可能只保存到了内存或部分持久化存储中
2. **数据加载优先级**：系统优先从 `projects_index.db` 加载，如果那里的数据为空，则不会回退到 `documents.db`
3. **字段缺失**：某些文档记录可能缺少 `doc_id` 或 `cycle` 字段，导致加载时被跳过

## 测试建议

1. 应用修复后，重启服务
2. 重新上传 ZIP 文件进行测试
3. 如果问题仍然存在，运行诊断脚本查看数据状态：
   ```bash
   python diagnose_zip_upload.py "你的项目名称"
   ```
4. 查看服务端日志（特别是 `[ZIP匹配]` 和 `[ZIP归档]` 相关的日志）

## 数据流说明

ZIP 文件匹配后的数据流：
1. `_archive_file` 方法将文档信息添加到 `project_config['documents'][cycle]['uploaded_docs']`
2. 同时写入 `documents_db`（内存缓存）
3. 同时写入项目的 `documents.db`（SQLite 数据库）
4. **新增**：同时写入 `documents_index.json`（JSON 文件备份）
5. `save_project` 调用 `save_full_config`
6. `save_full_config` 从 `uploaded_docs` 提取数据保存到 `projects_index.db` 和 `documents_index.json`
7. `load_full_config` 从 `projects_index.db` 或 `documents.db` 加载数据

## 回滚方案

如果修复导致问题，可以回滚以下文件到之前的版本：
- `app/utils/zip_matcher.py`
- `app/routes/documents/zip.py`
- `app/utils/project_data_manager.py`
