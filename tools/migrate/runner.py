"""自动化增量迁移执行器

从 tools/migrate/ 目录自动发现并执行未完成的数据库迁移脚本。

迁移脚本规范:
    - 文件名: NNNN_描述.py  (4位数字序号 + 下划线 + 描述)
    - 必须定义 upgrade(db_path: str) 函数
    - 可选定义 description() -> str 函数（返回迁移说明）
    - 序号从 0010 起步（0001-0009 保留给 migrate_branch.py 中的历史迁移）

执行逻辑:
    1. 扫描 tools/migrate/ 下所有 NNNN_*.py 文件
    2. 读取 migration_versions 表中已执行的最大版本号
    3. 按序号升序执行所有 > max_version 的脚本
    4. 每个脚本执行成功后写入 migration_versions 表

使用方法:
    python tools/migrate/runner.py               # 自动检测并执行
    python tools/migrate/runner.py --check       # 仅检查，不执行
    python tools/migrate/runner.py --db <路径>   # 指定数据库路径
"""

import sys
import os
import re
import sqlite3
import importlib.util
from pathlib import Path
from datetime import datetime

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent.parent
MIGRATE_DIR = Path(__file__).parent
DEFAULT_DB_PATH = PROJECT_ROOT / 'data' / 'users.db'

# 迁移脚本文件名匹配: 0010_xxx.py
MIGRATION_PATTERN = re.compile(r'^(\d{4})_.+\.py$')


def discover_scripts():
    """发现所有迁移脚本，返回 [(序号, 文件路径)] 按序号排序"""
    scripts = []
    if not MIGRATE_DIR.exists():
        return scripts
    for f in sorted(MIGRATE_DIR.iterdir()):
        if not f.is_file():
            continue
        m = MIGRATION_PATTERN.match(f.name)
        if m:
            seq = int(m.group(1))
            scripts.append((seq, f))
    return scripts


def get_max_applied_version(db_path):
    """获取数据库中已执行的最大迁移版本号"""
    if not Path(db_path).exists():
        return 0
    try:
        with sqlite3.connect(str(db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT MAX(version) FROM migration_versions'
            )
            row = cursor.fetchone()
            return row[0] if row and row[0] else 0
    except Exception:
        return 0


def record_migration(db_path, version):
    """将已执行的迁移版本写入 migration_versions 表"""
    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'CREATE TABLE IF NOT EXISTS migration_versions '
            '(id INTEGER PRIMARY KEY AUTOINCREMENT, '
            'version INTEGER NOT NULL, '
            'applied_at TEXT DEFAULT CURRENT_TIMESTAMP)'
        )
        cursor.execute(
            'INSERT INTO migration_versions (version) VALUES (?)', (version,)
        )
        conn.commit()


def load_module(script_path):
    """动态加载迁移脚本模块"""
    spec = importlib.util.spec_from_file_location(
        f'migration_{script_path.stem}', str(script_path)
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_migrations(db_path=None, check_only=False):
    """执行所有待执行的迁移脚本

    Args:
        db_path: 数据库文件路径，默认 data/users.db
        check_only: True 时仅检查不执行

    Returns:
        dict: {
            'pending': int,     # 待执行的迁移数量
            'executed': int,    # 本次执行的迁移数量
            'failed': int,      # 失败的迁移数量
            'details': [str]    # 详细信息
        }
    """
    if db_path is None:
        db_path = str(DEFAULT_DB_PATH)
    else:
        db_path = str(db_path)

    result = {'pending': 0, 'executed': 0, 'failed': 0, 'details': []}
    scripts = discover_scripts()

    if not scripts:
        result['details'].append('没有发现迁移脚本')
        return result

    max_applied = get_max_applied_version(db_path)
    pending = [(seq, path) for seq, path in scripts if seq > max_applied]
    result['pending'] = len(pending)

    if not pending:
        result['details'].append(
            f'所有迁移已是最新（当前版本: {max_applied}）'
        )
        return result

    result['details'].append(
        f'发现 {len(pending)} 个待执行迁移 '
        f'（当前版本: {max_applied}）'
    )

    if check_only:
        for seq, path in pending:
            mod = load_module(path)
            desc = ''
            if hasattr(mod, 'description'):
                desc = mod.description()
            result['details'].append(
                f'  [待执行] {path.name}: {desc or "(无说明)"}'
            )
        return result

    # 确保数据库目录存在
    db_dir = Path(db_path).parent
    if not db_dir.exists():
        db_dir.mkdir(parents=True, exist_ok=True)

    for seq, path in pending:
        script_name = path.name
        try:
            mod = load_module(path)
            desc = ''
            if hasattr(mod, 'description'):
                desc = mod.description()

            print(f'  执行迁移 {script_name} (v{seq})'
                  f'{": " + desc if desc else ""} ...')

            if not hasattr(mod, 'upgrade'):
                raise AttributeError(
                    f'迁移脚本 {script_name} 缺少 upgrade(db_path) 函数'
                )

            mod.upgrade(db_path)
            record_migration(db_path, seq)
            result['executed'] += 1
            result['details'].append(f'  [成功] {script_name} (v{seq})')
            print(f'  [OK] {script_name}')

        except Exception as e:
            result['failed'] += 1
            result['details'].append(f'  [失败] {script_name}: {e}')
            print(f'  [ERROR] {script_name}: {e}')
            # 遇到失败立即停止，避免跳过依赖
            break

    return result


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description='自动化增量迁移执行器'
    )
    parser.add_argument(
        '--check', action='store_true',
        help='仅检查待执行迁移，不实际执行'
    )
    parser.add_argument(
        '--db', type=str, default=None,
        help='数据库文件路径（默认: data/users.db）'
    )
    args = parser.parse_args()

    db_path = args.db or str(DEFAULT_DB_PATH)
    print(f'数据库: {db_path}')
    print(f'迁移目录: {MIGRATE_DIR}')
    print()

    result = run_migrations(db_path=db_path, check_only=args.check)

    print()
    if args.check:
        print(f'检查完成: {result["pending"]} 个待执行迁移')
    else:
        print(
            f'迁移完成: 执行 {result["executed"]} 个, '
            f'失败 {result["failed"]} 个'
        )

    for detail in result['details']:
        print(detail)

    sys.exit(1 if result['failed'] > 0 else 0)


if __name__ == '__main__':
    main()
