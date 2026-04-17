# 迁移脚本编写指南

## 目录结构

```
tools/migrate/
├── __init__.py
├── runner.py                                    # 迁移执行器（不要修改）
├── 0010_scheduled_tasks_add_skip_holidays.py    # 示例：第一个增量迁移
├── 0011_next_migration.py                       # 下一个迁移...
└── README.md                                    # 本文件
```

## 文件命名规范

- 格式: `NNNN_简短描述.py`
- `NNNN`: 4位数字序号，从 `0010` 起步
- 序号必须递增，不可重复
- `0001-0009` 保留给 `tools/migrate_branch.py` 中的历史迁移

## 脚本模板

```python
"""迁移说明: 简要描述本次迁移的目的"""
import sqlite3

def description():
    """返回迁移说明（可选）"""
    return "scheduled_tasks 表新增 skip_holidays 字段"

def upgrade(db_path):
    """执行迁移（必须）
    
    Args:
        db_path: 数据库文件的绝对路径（data/users.db）
    
    注意事项:
        - 使用 IF NOT EXISTS / IF EXISTS 保证幂等性
        - 不要删除数据，只增加字段或表
        - 出错时抛出异常，runner 会自动停止
    """
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        # 检查字段是否已存在
        columns = [row[1] for row in cursor.execute('PRAGMA table_info(your_table)')]
        if 'new_column' not in columns:
            cursor.execute('ALTER TABLE your_table ADD COLUMN new_column TEXT DEFAULT ""')
        conn.commit()
```

## 执行方式

迁移脚本由 `Daemon.sh upgrade` 自动调用，也可手动执行：

```bash
# 检查待执行迁移
python tools/migrate/runner.py --check

# 执行迁移
python tools/migrate/runner.py

# 指定数据库路径
python tools/migrate/runner.py --db /path/to/users.db
```

## 工作原理

1. `runner.py` 扫描本目录下所有 `NNNN_*.py` 文件
2. 读取数据库 `migration_versions` 表中的最大版本号
3. 按序号升序执行所有 > 最大版本号 的脚本
4. 每个脚本成功后将版本号写入 `migration_versions` 表
5. 遇到失败立即停止，避免跳过有依赖关系的迁移
