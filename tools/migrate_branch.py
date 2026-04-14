"""分支迁移数据脚本

用途：从 main 分支（无用户系统）迁移到 feature/security-enhancements 分支（多用户系统）。
     自动检测来源版本差异，执行对应的数据迁移。

此脚本可独立运行，无需启动 Flask 应用。

使用方法：
    python tools/migrate_branch.py                # 自动检测并迁移
    python tools/migrate_branch.py --check        # 仅检测差异，不执行迁移
    python tools/migrate_branch.py --db <路径>    # 指定数据库路径

迁移内容：
    1. 数据库：创建 users.db（若不存在）或升级 schema 到最新版本
    2. 项目数据：为已有项目补充新版本所需字段（owner_id 等）
    3. 配置文件：settings.json 补充新增配置项
    4. 初始用户：创建默认管理员账号（admin/admin123）
"""

import sqlite3
import uuid
import sys
import os
import json
import shutil
from pathlib import Path
from datetime import datetime

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent

# 默认路径
DEFAULT_DB_PATH = PROJECT_ROOT / 'data' / 'users.db'
SETTINGS_PATH = PROJECT_ROOT / 'settings.json'
PROJECTS_DIR = PROJECT_ROOT / 'projects'

# 最新迁移版本
LATEST_MIGRATION_VERSION = 6

# ============================================================================
# 版本差异检测
# ============================================================================

def detect_source_version():
    """检测当前数据的来源版本（main 还是 feature 分支）

    返回:
        dict: {
            'source': 'main' | 'feature' | 'fresh',
            'has_users_db': bool,
            'db_migration_version': int,
            'has_auth_module': bool,
            'settings_version': str,
            'project_count': int,
            'details': [str]
        }
    """
    info = {
        'source': 'fresh',
        'has_users_db': False,
        'db_migration_version': 0,
        'has_auth_module': False,
        'settings_version': 'unknown',
        'project_count': 0,
        'details': []
    }

    # 1. 检查数据库
    if DEFAULT_DB_PATH.exists():
        info['has_users_db'] = True
        try:
            with sqlite3.connect(str(DEFAULT_DB_PATH)) as conn:
                cursor = conn.cursor()
                # 检查迁移版本
                try:
                    cursor.execute('SELECT version FROM migration_versions ORDER BY version DESC LIMIT 1')
                    row = cursor.fetchone()
                    info['db_migration_version'] = row[0] if row else 0
                except:
                    info['db_migration_version'] = 0

                # 检查表清单
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = {row[0] for row in cursor.fetchall()}
                info['details'].append(f'数据库表: {", ".join(sorted(tables))}')

                if 'users' in tables:
                    cursor.execute('SELECT COUNT(*) FROM users')
                    user_count = cursor.fetchone()[0]
                    info['details'].append(f'用户数: {user_count}')

                    # 检查列结构判断版本
                    cursor.execute('PRAGMA table_info(users)')
                    cols = {row[1] for row in cursor.fetchall()}
                    info['details'].append(f'users 列: {", ".join(sorted(cols))}')

                    if 'display_name' in cols:
                        info['source'] = 'feature'
                        info['details'].append('来源判定: feature 分支 (有 display_name)')
                    elif 'approval_code_hash' in cols:
                        info['source'] = 'feature'
                        info['details'].append('来源判定: feature 分支 (有 approval_code_hash)')
                    elif 'organization' in cols:
                        info['source'] = 'feature'
                        info['details'].append('来源判定: feature 分支 (有 organization)')
                    else:
                        info['source'] = 'main'
                        info['details'].append('来源判定: main 分支 (基础 users 表)')

                if 'archive_approvals' in tables:
                    info['details'].append('归档审批表: 已存在')
                if 'messages' in tables:
                    info['details'].append('消息表: 已存在')
                if 'project_transfers' in tables:
                    info['details'].append('项目移交表: 已存在')
        except Exception as e:
            info['details'].append(f'数据库读取失败: {e}')
    else:
        info['details'].append('数据库不存在 (全新安装或 main 分支)')
        # main 分支没有 users.db
        if PROJECTS_DIR.exists():
            info['source'] = 'main'
        else:
            info['source'] = 'fresh'

    # 2. 检查认证模块
    auth_init = PROJECT_ROOT / 'app' / 'auth' / '__init__.py'
    if auth_init.exists():
        info['has_auth_module'] = True
        info['details'].append('认证模块: 存在 (feature 分支代码)')
    else:
        info['details'].append('认证模块: 不存在 (main 分支代码)')

    # 3. 检查 settings.json
    if SETTINGS_PATH.exists():
        try:
            with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            info['settings_version'] = settings.get('version', 'unknown')
            has_timezone = 'timezone' in settings
            has_log_retention = 'log_retention_days' in settings
            info['details'].append(f'settings.json: version={info["settings_version"]}, '
                                   f'timezone={"有" if has_timezone else "无"}, '
                                   f'log_retention={"有" if has_log_retention else "无"}')
        except Exception as e:
            info['details'].append(f'settings.json 读取失败: {e}')

    # 4. 检查项目数据
    if PROJECTS_DIR.exists():
        projects = [d for d in PROJECTS_DIR.iterdir()
                    if d.is_dir() and not d.name.startswith('.') and d.name not in ('common', 'requirements')]
        info['project_count'] = len(projects)
        info['details'].append(f'项目数量: {len(projects)}')

        # 抽样检查项目配置字段
        for proj_dir in projects[:3]:
            config_file = proj_dir / 'project_config.json'
            if config_file.exists():
                try:
                    with open(config_file, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                    has_archive_mode = 'archive_approval_mode' in config
                    info['details'].append(
                        f'  项目 "{proj_dir.name}": archive_approval_mode={"有" if has_archive_mode else "无"}'
                    )
                except:
                    pass

    return info


# ============================================================================
# 数据库迁移（从零创建 或 增量升级）
# ============================================================================

def ensure_database(db_path):
    """确保数据库存在并升级到最新版本

    如果 main 分支没有 users.db，会自动创建完整的数据库。
    如果已存在，会运行增量迁移到最新版本。
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    is_new = not db_path.exists()

    if is_new:
        print(f'数据库不存在，创建新数据库: {db_path}')
    else:
        print(f'数据库路径: {db_path}')
        print(f'文件大小: {db_path.stat().st_size / 1024:.1f} KB')

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()

        # 创建版本跟踪表
        cursor.execute('CREATE TABLE IF NOT EXISTS migration_versions '
                        '(version INTEGER PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)')

        current_version = 0
        try:
            cursor.execute('SELECT version FROM migration_versions ORDER BY version DESC LIMIT 1')
            row = cursor.fetchone()
            current_version = row[0] if row else 0
        except:
            pass

        print(f'当前迁移版本: {current_version}')

        if current_version >= LATEST_MIGRATION_VERSION:
            print(f'数据库已是最新版本 (v{LATEST_MIGRATION_VERSION})，无需迁移。')
            return True

        print(f'需要迁移: v{current_version} -> v{LATEST_MIGRATION_VERSION}')
        print()

        conn.execute('BEGIN TRANSACTION')
        try:
            # ==================== 基础表创建 ====================
            # 用户表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # ==================== 迁移版本 1: 用户状态和组织 ====================
            if current_version < 1:
                print('执行迁移 v1: 添加用户状态和组织字段...')
                cursor.execute('PRAGMA table_info(users)')
                existing = {row[1] for row in cursor.fetchall()}
                for col, dtype in [
                    ('status', "TEXT DEFAULT 'active'"),
                    ('organization', 'TEXT'),
                    ('approver_id', 'INTEGER'),
                    ('approved_at', 'TIMESTAMP'),
                    ('email', 'TEXT')
                ]:
                    if col not in existing:
                        cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {dtype}')
                        print(f'  + users.{col}')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (1)')
                print('  完成')

            # ==================== 迁移版本 2: 审批安全码 ====================
            if current_version < 2:
                print('执行迁移 v2: 添加审批安全码字段...')
                cursor.execute('PRAGMA table_info(users)')
                existing = {row[1] for row in cursor.fetchall()}
                for col, dtype in [
                    ('approval_code_hash', 'TEXT'),
                    ('approval_code_needs_change', 'INTEGER DEFAULT 1')
                ]:
                    if col not in existing:
                        cursor.execute(f'ALTER TABLE users ADD COLUMN {col} {dtype}')
                        print(f'  + users.{col}')
                cursor.execute('UPDATE users SET approval_code_needs_change = 1 WHERE approval_code_needs_change IS NULL')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (2)')
                print('  完成')

            # ==================== 迁移版本 3: 归档审批表 ====================
            if current_version < 3:
                print('执行迁移 v3: 创建归档审批表...')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS archive_approvals (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id TEXT NOT NULL,
                        cycle TEXT NOT NULL,
                        doc_names TEXT NOT NULL,
                        requester_id INTEGER NOT NULL,
                        requester_username TEXT,
                        status TEXT NOT NULL DEFAULT 'pending',
                        target_approver_ids TEXT,
                        approved_by_id INTEGER,
                        approved_by_username TEXT,
                        reject_reason TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        resolved_at TIMESTAMP,
                        FOREIGN KEY (requester_id) REFERENCES users(id)
                    )
                ''')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (3)')
                print('  完成')

            # ==================== 迁移版本 4: UUID ====================
            if current_version < 4:
                print('执行迁移 v4: 为各表添加 UUID 列...')

                # 先创建消息表和移交表（如果不存在）
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sender_id INTEGER,
                        receiver_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT NOT NULL,
                        type TEXT DEFAULT 'system',
                        is_read INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        related_id TEXT,
                        related_type TEXT
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS project_transfers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id TEXT NOT NULL,
                        from_organization TEXT NOT NULL,
                        to_organization TEXT NOT NULL,
                        requester_id INTEGER NOT NULL,
                        requester_username TEXT,
                        status TEXT DEFAULT 'pending',
                        responder_id INTEGER,
                        responder_username TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        resolved_at TIMESTAMP
                    )
                ''')

                tables_to_uuid = [
                    ('users', 'id'),
                    ('messages', 'id'),
                    ('archive_approvals', 'id'),
                    ('project_transfers', 'id')
                ]
                for table, pk_col in tables_to_uuid:
                    try:
                        cursor.execute(f'PRAGMA table_info({table})')
                        cols = {row[1] for row in cursor.fetchall()}
                        if 'uuid' not in cols:
                            cursor.execute(f'ALTER TABLE {table} ADD COLUMN uuid TEXT')
                            cursor.execute(f'SELECT {pk_col} FROM {table}')
                            for (row_id,) in cursor.fetchall():
                                cursor.execute(f'UPDATE {table} SET uuid = ? WHERE {pk_col} = ?',
                                               (str(uuid.uuid4()), row_id))
                            cursor.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_uuid ON {table}(uuid)')
                            print(f'  + {table}.uuid')
                    except Exception as e:
                        print(f'  跳过 {table}: {e}')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (4)')
                print('  完成')

            # ==================== 迁移版本 5: 多级审批 ====================
            if current_version < 5:
                print('执行迁移 v5: 添加多级审批支持字段...')
                cursor.execute('PRAGMA table_info(archive_approvals)')
                existing = {row[1] for row in cursor.fetchall()}
                for col, dtype in [
                    ('approval_stages', 'TEXT'),
                    ('current_stage', 'INTEGER DEFAULT 1'),
                    ('stage_completed', 'BOOLEAN DEFAULT 0'),
                    ('stage_history', 'TEXT')
                ]:
                    if col not in existing:
                        cursor.execute(f'ALTER TABLE archive_approvals ADD COLUMN {col} {dtype}')
                        print(f'  + archive_approvals.{col}')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (5)')
                print('  完成')

            # ==================== 迁移版本 6: display_name ====================
            if current_version < 6:
                print('执行迁移 v6: 用户表添加 display_name 字段...')
                cursor.execute('PRAGMA table_info(users)')
                existing = {row[1] for row in cursor.fetchall()}
                if 'display_name' not in existing:
                    cursor.execute('ALTER TABLE users ADD COLUMN display_name TEXT')
                    print('  + users.display_name')
                cursor.execute('INSERT INTO migration_versions (version) VALUES (6)')
                print('  完成')

            conn.commit()
            print()
            print(f'所有数据库迁移执行成功！当前版本: v{LATEST_MIGRATION_VERSION}')
            return True

        except Exception as e:
            conn.rollback()
            print(f'\n数据库迁移失败，已回滚: {e}')
            return False


# ============================================================================
# 默认管理员创建
# ============================================================================

def ensure_admin_user(db_path):
    """确保管理员用户存在"""
    db_path = Path(db_path)
    if not db_path.exists():
        return False

    try:
        from werkzeug.security import generate_password_hash
    except ImportError:
        print('[WARN] werkzeug 未安装，跳过管理员创建（启动应用后会自动创建）')
        return False

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        admin_count = cursor.fetchone()[0]

        if admin_count > 0:
            print(f'管理员用户已存在 ({admin_count} 个)，跳过创建')
            return True

        print('创建默认管理员用户...')
        password_hash = generate_password_hash('admin123')
        admin_uuid = str(uuid.uuid4())
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO users (username, password_hash, role, status, created_at, uuid, display_name)
            VALUES (?, ?, 'admin', 'active', ?, ?, '管理员')
        ''', ('admin', password_hash, now, admin_uuid))
        conn.commit()
        print('  创建成功: admin / admin123')
        print('  ⚠️  请登录后立即修改默认密码！')
        return True


# ============================================================================
# settings.json 迁移
# ============================================================================

def migrate_settings():
    """补充 settings.json 新版本所需的配置项"""
    if not SETTINGS_PATH.exists():
        print('settings.json 不存在，跳过（启动应用后自动创建）')
        return

    try:
        with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
            settings = json.load(f)
    except Exception as e:
        print(f'读取 settings.json 失败: {e}')
        return

    changed = False

    # 新版本新增的配置项及默认值
    new_fields = {
        'log_retention_days': 30,
        'timezone': 'Asia/Shanghai',
        'email_notification_enabled': False,
    }

    for key, default_value in new_fields.items():
        if key not in settings:
            settings[key] = default_value
            print(f'  + settings.json: {key} = {default_value}')
            changed = True

    # 更新 system_name（如果还是旧名称）
    if settings.get('system_name') == 'IT项目验资资料管理平台':
        settings['system_name'] = '项目资料管理平台'
        print('  ~ settings.json: system_name 更新为 "项目资料管理平台"')
        changed = True

    if changed:
        # 备份原文件
        backup = SETTINGS_PATH.with_suffix('.json.bak')
        shutil.copy2(SETTINGS_PATH, backup)
        print(f'  备份: {backup}')

        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        print('  settings.json 更新完成')
    else:
        print('settings.json 已是最新，无需修改')


# ============================================================================
# 项目数据迁移
# ============================================================================

def migrate_project_configs():
    """为已有项目配置补充新版本字段"""
    if not PROJECTS_DIR.exists():
        print('projects 目录不存在，跳过')
        return

    projects = [d for d in PROJECTS_DIR.iterdir()
                if d.is_dir() and not d.name.startswith('.')
                and d.name not in ('common', 'requirements')]

    if not projects:
        print('无项目需要迁移')
        return

    migrated = 0
    for proj_dir in projects:
        config_file = proj_dir / 'project_config.json'
        if not config_file.exists():
            continue

        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception as e:
            print(f'  跳过 {proj_dir.name}: 读取配置失败 ({e})')
            continue

        changed = False

        # 补充新版本字段
        if 'archive_approval_mode' not in config:
            config['archive_approval_mode'] = 'two_level'
            changed = True

        if changed:
            # 备份原文件
            backup = config_file.with_suffix('.json.migrate_bak')
            if not backup.exists():
                shutil.copy2(config_file, backup)

            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            migrated += 1
            print(f'  ✓ {proj_dir.name}: 已补充新字段')

    print(f'项目迁移: {migrated}/{len(projects)} 个需要更新')


# ============================================================================
# 目录创建
# ============================================================================

def ensure_directories():
    """确保新版本所需的目录存在"""
    dirs = [
        PROJECT_ROOT / 'data',
        PROJECT_ROOT / 'logs',
        PROJECT_ROOT / 'projects',
        PROJECT_ROOT / 'uploads',
        PROJECT_ROOT / 'uploads' / 'cache',
        PROJECT_ROOT / 'uploads' / 'temp',
        PROJECT_ROOT / 'uploads' / 'temp_chunks',
        PROJECT_ROOT / 'uploads' / 'temp_extract',
        PROJECT_ROOT / 'uploads' / 'zip',
        PROJECT_ROOT / 'uploads' / 'tasks',
    ]
    created = 0
    for d in dirs:
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            print(f'  + 目录: {d.relative_to(PROJECT_ROOT)}')
            created += 1
    if created == 0:
        print('  所有目录已存在')
    else:
        print(f'  创建了 {created} 个目录')


# ============================================================================
# 主流程
# ============================================================================

def run_full_migration(db_path=None, check_only=False):
    """执行完整迁移"""
    if db_path is None:
        db_path = DEFAULT_DB_PATH

    print('=' * 60)
    print('  分支迁移工具 (main → feature/security-enhancements)')
    print('=' * 60)
    print()

    # Step 1: 检测来源版本
    print('【Step 1/6】检测当前数据版本...')
    info = detect_source_version()
    print(f'  来源: {info["source"]}')
    print(f'  数据库: {"存在" if info["has_users_db"] else "不存在"}')
    print(f'  DB 迁移版本: v{info["db_migration_version"]}')
    print(f'  项目数量: {info["project_count"]}')
    for detail in info['details']:
        print(f'  {detail}')
    print()

    if check_only:
        print('（仅检测模式，不执行迁移）')

        if info['source'] == 'fresh':
            print('结论: 全新安装，无需数据迁移。启动应用即可自动初始化。')
        elif info['source'] == 'main':
            print('结论: 来自 main 分支，需要执行完整迁移：')
            print('  - 创建 users.db 并初始化全部表')
            print('  - 创建默认管理员用户')
            print('  - 更新 settings.json 配置')
            print('  - 为项目配置补充新字段')
        elif info['source'] == 'feature':
            if info['db_migration_version'] < LATEST_MIGRATION_VERSION:
                print(f'结论: 已在 feature 分支，需要增量迁移 DB:'
                      f' v{info["db_migration_version"]} → v{LATEST_MIGRATION_VERSION}')
            else:
                print('结论: 已在最新版本，无需迁移。')
        return True

    # Step 2: 确保目录
    print('【Step 2/6】确保目录结构...')
    ensure_directories()
    print()

    # Step 3: 数据库迁移
    print('【Step 3/6】数据库迁移...')
    if not ensure_database(db_path):
        print('[ERROR] 数据库迁移失败，终止！')
        return False
    print()

    # Step 4: 管理员用户
    print('【Step 4/6】检查管理员用户...')
    ensure_admin_user(db_path)
    print()

    # Step 5: settings.json
    print('【Step 5/6】迁移配置文件...')
    migrate_settings()
    print()

    # Step 6: 项目数据
    print('【Step 6/6】迁移项目数据...')
    migrate_project_configs()
    print()

    print('=' * 60)
    print('  迁移完成！')
    print('=' * 60)
    print()
    if info['source'] == 'main':
        print('从 main 分支迁移完成，请注意：')
        print('  1. 默认管理员: admin / admin123（请立即修改密码）')
        print('  2. 原有项目数据已保留，需要在系统内分配项目承建单位')
        print('  3. 运行 ./Daemon.sh start 启动新版本')
    return True


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='分支迁移数据工具')
    parser.add_argument('--check', action='store_true', help='仅检测差异，不执行迁移')
    parser.add_argument('--db', type=str, default=None, help='指定数据库路径')
    args = parser.parse_args()

    db = Path(args.db) if args.db else None
    success = run_full_migration(db_path=db, check_only=args.check)
    sys.exit(0 if success else 1)
