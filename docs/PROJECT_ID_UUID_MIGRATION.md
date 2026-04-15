# 项目 ID 迁移到 UUID

本工具用于把历史项目 ID（例如 `project_20240327112233`）迁移成 UUID，并同步更新所有已知引用位置。

## 覆盖范围

1. `projects/projects_index.db`
2. `projects/projects_index.json`
3. `data/users.db`
4. 各项目目录下的 `project_info.json`
5. 各项目目录下的 `project_config.json`（兼容旧结构）
6. 各项目目录下的 `data/documents_index.json`
7. 各项目目录下的 `data/db/documents.db`

## 使用方式

先查看哪些项目仍是老 ID：

```powershell
d:/workspace/Doc/project_doc_manager/venv/Scripts/python.exe tools/migrate_project_ids_to_uuid.py status
```

预览迁移结果：

```powershell
d:/workspace/Doc/project_doc_manager/venv/Scripts/python.exe tools/migrate_project_ids_to_uuid.py migrate --dry-run
```

正式迁移：

```powershell
d:/workspace/Doc/project_doc_manager/venv/Scripts/python.exe tools/migrate_project_ids_to_uuid.py migrate
```

只迁移指定项目：

```powershell
d:/workspace/Doc/project_doc_manager/venv/Scripts/python.exe tools/migrate_project_ids_to_uuid.py migrate --project-id project_20240327112233
```

## 回滚

正式迁移会默认生成备份目录，位置在：

`projects/migration_backups/project_id_uuid_时间戳`

回滚命令：

```powershell
d:/workspace/Doc/project_doc_manager/venv/Scripts/python.exe tools/migrate_project_ids_to_uuid.py rollback --backup-dir projects/migration_backups/project_id_uuid_20260415_120000
```

## 执行建议

1. 迁移和回滚都应在系统停机或无人写入时执行。
2. 先运行 `status` 和 `migrate --dry-run` 确认映射。
3. 正式迁移完成后，随机抽查项目打开、归档审批、项目流转、ZIP 管理和文档列表。
4. 若发现异常，优先使用备份目录执行 `rollback`。