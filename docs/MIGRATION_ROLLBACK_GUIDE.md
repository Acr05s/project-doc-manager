# 迁移回滚手册

> **适用版本**：v3.0.x  
> **适用场景**：`./Daemon.sh upgrade` 或 `./Daemon.sh migrate` 执行失败，需要将数据库、配置文件、运行时数据文件恢复到升级前状态。

---

## 目录

1. [了解备份机制](#1-了解备份机制)
2. [upgrade 失败回滚](#2-upgrade-失败回滚)
3. [migrate 失败回滚](#3-migrate-失败回滚)
4. [数据库手动回滚](#4-数据库手动回滚)
5. [运行时数据文件回滚](#5-运行时数据文件回滚)
6. [代码回滚（git）](#6-代码回滚git)
7. [一键回滚脚本](#7-一键回滚脚本)
8. [回滚后验证](#8-回滚后验证)
9. [常见失败场景与对策](#9-常见失败场景与对策)

---

## 1. 了解备份机制

系统在执行升级/迁移前会**自动创建备份**，了解备份文件的位置是回滚的第一步。

### 1.1 `upgrade` 命令的备份

执行 `./Daemon.sh upgrade` 时，Daemon 在 git pull **之前**生成两个临时备份文件：

| 备份文件 | 对应原文件 | 说明 |
|---|---|---|
| `data/users.db.upgrade.bak` | `data/users.db` | 数据库备份 |
| `settings.json.upgrade.bak` | `settings.json` | 配置文件备份 |

> **注意**：升级**成功**后，Daemon 会自动删除这两个 `.bak` 文件。如果升级失败中断，这两个文件会保留，可直接用于回滚。

### 1.2 `migrate` 命令的备份

执行 `./Daemon.sh migrate` 时，Daemon 在 [2/7] 步骤创建带时间戳的完整备份目录：

```
backup_migrate_<YYYYMMDDHHmmss>/
    users.db          # 数据库
    settings.json     # 配置文件
    projects/         # 项目索引目录（完整）
    uploads/          # 上传文件目录（完整）
```

### 1.3 迁移脚本的细粒度备份

`tools/migrate_branch.py` 执行迁移时还会为各配置文件生成就地备份：

| 备份文件 | 说明 |
|---|---|
| `settings.json.bak` | 全局配置备份 |
| `projects/<id>/config.json.migrate_bak` | 各项目配置备份 |
| `uploads/tasks/report_schedules.json.migrate_bak` | 定时任务数据备份 |

---

## 2. `upgrade` 失败回滚

### 2.1 判断失败阶段

运行 `./Daemon.sh upgrade` 后，根据终端输出判断在哪个阶段失败：

| 终端输出特征 | 失败阶段 | 需要回滚的内容 |
|---|---|---|
| `Git pull failed` | git 拉取失败 | 代码未变更，无需回滚数据 |
| `Running database migration...` 后报错 | 数据库迁移失败 | 数据库 |
| `Starting server...` 后报错 | 启动失败 | 代码 + 数据库 |

### 2.2 回滚步骤

**步骤 1：停止服务（如果仍在运行）**

```bash
./Daemon.sh stop
```

**步骤 2：恢复数据库**

```bash
# 检查备份是否存在
ls -lh data/users.db.upgrade.bak

# 恢复数据库
cp data/users.db.upgrade.bak data/users.db
echo "✅ 数据库已恢复"
```

**步骤 3：恢复配置文件**

```bash
# 检查备份是否存在
ls -lh settings.json.upgrade.bak

# 恢复配置文件
cp settings.json.upgrade.bak settings.json
echo "✅ 配置文件已恢复"
```

**步骤 4：回滚代码**

```bash
# 查看当前提交与上一个提交
git log --oneline -5

# 回滚到上一个提交（不丢弃本地文件）
git reset --hard HEAD~1

# 或者回滚到 git pull 前的提交（推荐：先用 git reflog 找到确切 hash）
git reflog --oneline | head -10
# 找到 pull 之前的那条记录，复制其 hash（如 abc1234）：
git reset --hard abc1234
```

**步骤 5：重新启动**

```bash
./Daemon.sh start
```

---

## 3. `migrate` 失败回滚

`migrate` 命令在 [2/7] 步骤已创建完整备份目录 `backup_migrate_<时间戳>/`。

### 3.1 找到备份目录

```bash
# 列出所有备份目录（按时间排序，最新的在最后）
ls -d backup_migrate_*/
```

### 3.2 回滚步骤

**步骤 1：停止服务**

```bash
./Daemon.sh stop
```

**步骤 2：找到备份目录名**

```bash
BACKUP_DIR=$(ls -d backup_migrate_*/ | sort | tail -1)
echo "将从 $BACKUP_DIR 恢复"
```

**步骤 3：恢复所有数据**

```bash
# 恢复数据库
cp "$BACKUP_DIR/users.db" data/users.db
echo "✅ 数据库已恢复"

# 恢复配置文件
cp "$BACKUP_DIR/settings.json" settings.json
echo "✅ 配置文件已恢复"

# 恢复项目数据（谨慎！会覆盖现有 projects/ 目录）
cp -r "$BACKUP_DIR/projects/" projects/
echo "✅ 项目目录已恢复"

# 恢复上传文件（如有必要）
# cp -r "$BACKUP_DIR/uploads/" uploads/
# echo "✅ 上传目录已恢复"
```

> **uploads/ 目录说明**：通常无需恢复 uploads/，因为文件本身不会被迁移修改。仅当迁移脚本报告 uploads/ 损坏时才恢复。

**步骤 4：切回原分支（如果 migrate 切换了 git 分支）**

```bash
# 查看当前分支
git branch

# 切回原分支（如 main）
git checkout main
```

**步骤 5：重新启动**

```bash
./Daemon.sh start
```

---

## 4. 数据库手动回滚

若自动备份文件丢失，可通过 SQLite 命令行手动操作。

### 4.1 查看当前迁移版本

```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('data/users.db')
rows = conn.execute('SELECT version, applied_at FROM migration_versions ORDER BY version').fetchall()
for r in rows: print(r)
conn.close()
"
```

### 4.2 回滚数据库迁移版本记录

> ⚠️ **此操作不可逆，执行前务必先备份数据库。**

```bash
# 先备份
cp data/users.db data/users.db.manual_rollback_$(date +%Y%m%d%H%M%S)

# 连接 SQLite
sqlite3 data/users.db
```

在 SQLite shell 中执行：

```sql
-- 查看迁移历史
SELECT version, applied_at FROM migration_versions ORDER BY version;

-- 删除 v9 迁移记录（只删版本记录，索引已创建则需手动 DROP）
DELETE FROM migration_versions WHERE version = 9;

-- 删除 v9 添加的索引（可选，不影响数据正确性）
DROP INDEX IF EXISTS idx_messages_receiver_read_created;
DROP INDEX IF EXISTS idx_archive_approvals_project_status_created;

.quit
```

### 4.3 回滚 archive_approvals 新增字段（v7）

> 仅当 v7 迁移失败且需要在旧版本代码上运行时执行。

```sql
-- SQLite 不支持 DROP COLUMN（3.35.0 以下），只能重建表
-- 生产环境中不建议执行此操作，优先使用文件级备份恢复
```

---

## 5. 运行时数据文件回滚

`tools/migrate_branch.py` 在修改 `report_schedules.json` 前会自动创建 `.migrate_bak` 备份。

### 5.1 恢复定时任务配置

```bash
# 检查备份
ls -lh uploads/tasks/report_schedules.json.migrate_bak

# 恢复
cp uploads/tasks/report_schedules.json.migrate_bak uploads/tasks/report_schedules.json
echo "✅ 定时任务配置已恢复"
```

### 5.2 恢复项目配置文件

```bash
# 恢复所有项目配置（批量）
find projects/ -name "config.json.migrate_bak" | while read bak; do
    original="${bak%.migrate_bak}"
    cp "$bak" "$original"
    echo "✅ 已恢复: $original"
done
```

### 5.3 恢复全局配置

```bash
# settings.json 备份
ls -lh settings.json.bak

# 恢复
cp settings.json.bak settings.json
echo "✅ 全局配置已恢复"
```

---

## 6. 代码回滚（git）

### 6.1 查看最近提交历史

```bash
git log --oneline -10
```

### 6.2 回滚到指定版本

```bash
# 硬回滚到指定 commit（本地未提交修改会丢失）
git reset --hard <commit-hash>

# 软回滚（保留本地修改为未暂存状态）
git reset --soft <commit-hash>
```

### 6.3 使用 reflog 找回意外丢失的提交

```bash
git reflog --oneline | head -20
# 找到目标 hash 后执行：
git reset --hard <hash>
```

---

## 7. 一键回滚脚本

将以下内容保存为 `rollback.sh`，在升级失败后执行：

```bash
#!/bin/bash
# 一键回滚脚本 - 用于 upgrade 失败后恢复
# 使用方法: bash rollback.sh [backup_dir]

set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========== 开始回滚 ==========${NC}"

# 1. 停止服务
if [ -f "$APP_DIR/.server.pid" ]; then
    PID=$(cat "$APP_DIR/.server.pid")
    if ps -p "$PID" > /dev/null 2>&1; then
        kill "$PID" 2>/dev/null || true
        echo -e "${GREEN}[1] 服务已停止${NC}"
    fi
fi

# 2. 恢复数据库
if [ -f "$APP_DIR/data/users.db.upgrade.bak" ]; then
    cp "$APP_DIR/data/users.db.upgrade.bak" "$APP_DIR/data/users.db"
    echo -e "${GREEN}[2] 数据库已从 upgrade.bak 恢复${NC}"
elif [ -n "$1" ] && [ -f "$1/users.db" ]; then
    cp "$1/users.db" "$APP_DIR/data/users.db"
    echo -e "${GREEN}[2] 数据库已从 $1 恢复${NC}"
else
    echo -e "${RED}[2] 未找到数据库备份，跳过${NC}"
fi

# 3. 恢复配置文件
if [ -f "$APP_DIR/settings.json.upgrade.bak" ]; then
    cp "$APP_DIR/settings.json.upgrade.bak" "$APP_DIR/settings.json"
    echo -e "${GREEN}[3] 配置文件已从 upgrade.bak 恢复${NC}"
elif [ -n "$1" ] && [ -f "$1/settings.json" ]; then
    cp "$1/settings.json" "$APP_DIR/settings.json"
    echo -e "${GREEN}[3] 配置文件已从 $1 恢复${NC}"
else
    echo -e "${RED}[3] 未找到配置备份，跳过${NC}"
fi

# 4. 恢复定时任务数据
if [ -f "$APP_DIR/uploads/tasks/report_schedules.json.migrate_bak" ]; then
    cp "$APP_DIR/uploads/tasks/report_schedules.json.migrate_bak" \
       "$APP_DIR/uploads/tasks/report_schedules.json"
    echo -e "${GREEN}[4] 定时任务配置已恢复${NC}"
else
    echo -e "${YELLOW}[4] 无定时任务备份，跳过${NC}"
fi

# 5. 回滚代码（仅 upgrade 场景）
echo ""
echo -e "${YELLOW}[5] 代码回滚（如需要）：${NC}"
echo "    当前最近提交："
git log --oneline -5
echo ""
echo -e "${YELLOW}    如需回滚代码，请手动执行：${NC}"
echo "    git reset --hard HEAD~1"
echo "    或: git reset --hard <具体 commit hash>"

echo ""
echo -e "${GREEN}========== 回滚完成 ==========${NC}"
echo -e "请检查数据后执行: ${YELLOW}./Daemon.sh start${NC}"
```

**使用方法：**

```bash
# upgrade 失败后（使用 .upgrade.bak 自动备份）
bash rollback.sh

# migrate 失败后（指定备份目录）
bash rollback.sh backup_migrate_20260416120000/
```

---

## 8. 回滚后验证

回滚完成后，按以下步骤验证数据完整性：

### 8.1 检查数据库版本

```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('data/users.db')
cur = conn.cursor()
try:
    rows = cur.execute('SELECT version, applied_at FROM migration_versions ORDER BY version').fetchall()
    print('迁移版本记录:')
    for r in rows: print(f'  v{r[0]} - {r[1]}')
except Exception as e:
    print(f'查询失败: {e}')
conn.close()
"
```

### 8.2 检查用户数据

```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('data/users.db')
count = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
print(f'用户数量: {count}')
conn.close()
"
```

### 8.3 检查定时任务数据

```bash
python3 -c "
import json
with open('uploads/tasks/report_schedules.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
total = sum(len(v) if isinstance(v, list) else 1 for v in data.values())
print(f'项目数: {len(data)}, 任务总数: {total}')
"
```

### 8.4 检查迁移脚本状态

```bash
python3 tools/migrate_branch.py --check
```

### 8.5 启动并验证服务

```bash
./Daemon.sh start
./Daemon.sh status

# 访问健康检查接口
curl http://localhost:5000/api/health
```

---

## 9. 常见失败场景与对策

| 场景 | 现象 | 对策 |
|---|---|---|
| git pull 网络超时 | `Git pull failed` | 检查网络或代理后重试 `./Daemon.sh upgrade -c http://...` |
| git pull 有冲突 | `CONFLICT` 提示 | `git stash` 暂存本地修改后重试；或 `git checkout -- .` 放弃本地修改 |
| 数据库被锁定 | `database is locked` | 确认所有 Python 进程已退出：`pkill -f main.py` |
| 迁移脚本 Python 报错 | `migrate_branch.py` 抛出异常 | 查看完整 traceback；用 `--check` 检查差异：`python3 tools/migrate_branch.py --check` |
| 启动后白屏/500 | 服务启动但 API 报错 | 查日志：`./Daemon.sh log`；确认 DB 版本与代码版本一致 |
| 回滚后登录失败 | 密码/token 错误 | 重置管理员：`./Daemon.sh reset-admin` |
| 备份文件已被删除 | `.upgrade.bak` 不存在 | 使用 `backup_migrate_*/` 目录恢复；或从 git 历史 stash 恢复 |
| migrate 切换分支失败 | `Failed to checkout` | 确认分支名正确；解决冲突后手动 `git checkout <branch>` |

---

## 附录：关键文件路径速查

```
data/users.db                               # 主数据库
data/users.db.upgrade.bak                  # upgrade 临时备份（自动生成/删除）
settings.json                              # 全局配置
settings.json.upgrade.bak                  # upgrade 临时备份
settings.json.bak                          # migrate 脚本备份
uploads/tasks/report_schedules.json        # 定时任务运行时数据
uploads/tasks/report_schedules.json.migrate_bak  # migrate 脚本备份
projects/<id>/config.json.migrate_bak      # 各项目配置备份
backup_migrate_<timestamp>/                # migrate 命令完整备份目录
logs/                                      # 应用日志目录
```
