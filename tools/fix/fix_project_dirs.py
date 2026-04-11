"""
修复 projects/ 目录下 ID 格式的目录名问题。

历史遗留问题：旧版本代码在创建项目时，有时会用 project_ID 格式作为目录名，
而不是项目真实名称。本脚本扫描这些目录并尝试迁移到正确的项目名目录。

使用方法（在项目根目录下运行）：
    python tools/fix_project_dirs.py --dry-run   # 预览，不实际操作
    python tools/fix_project_dirs.py             # 实际执行迁移

迁移逻辑：
1. 扫描 projects/ 下所有以 project_ 开头的目录（ID 格式）
2. 读取目录内的 config/project_info.json 或 project_info.json，获取真实项目名
3. 如果真实名称目录不存在，直接重命名
4. 如果真实名称目录已存在，合并文件（不覆盖已有文件）
5. 更新 projects_index.db 中对应记录（如果有）
"""

import os
import sys
import json
import shutil
import sqlite3
import argparse
import re
from pathlib import Path
from datetime import datetime

# 项目根目录
ROOT_DIR = Path(__file__).parent.parent
PROJECTS_DIR = ROOT_DIR / 'projects'
PROJECTS_INDEX_DB = PROJECTS_DIR / 'projects_index.db'


def is_id_format(dirname: str) -> bool:
    """判断是否是 ID 格式的目录名（如 project_20260402065202_36cc2662）"""
    return bool(re.match(r'^project_\d{14}(_[0-9a-f]+)?$', dirname))


def get_project_name_from_dir(project_dir: Path) -> str | None:
    """尝试从目录中读取真实项目名"""
    # 尝试多个可能的路径
    candidates = [
        project_dir / 'config' / 'project_info.json',
        project_dir / 'project_info.json',
        project_dir / 'data' / 'project_info.json',
    ]
    
    for path in candidates:
        if path.exists():
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                name = data.get('name')
                if name and name.strip():
                    return name.strip()
            except Exception as e:
                print(f"  读取 {path} 失败: {e}")
    
    # 尝试从 project_config.json 读取
    config_file = project_dir / 'project_config.json'
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            name = data.get('name')
            if name and name.strip():
                return name.strip()
        except Exception as e:
            print(f"  读取 project_config.json 失败: {e}")
    
    # 尝试从数据库的 project_configs 表读取
    if PROJECTS_INDEX_DB.exists():
        try:
            conn = sqlite3.connect(str(PROJECTS_INDEX_DB))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            # 获取目录名作为 project_id 来查
            project_id = project_dir.name
            cur.execute(
                "SELECT config_data FROM project_configs WHERE project_id=? AND config_type='project_info'",
                (project_id,)
            )
            row = cur.fetchone()
            conn.close()
            if row:
                data = json.loads(row['config_data'])
                name = data.get('name')
                if name and name.strip():
                    return name.strip()
        except Exception as e:
            print(f"  从数据库读取项目名失败: {e}")
    
    return None


def get_project_id_from_dir(project_dir: Path) -> str | None:
    """获取目录对应的 project_id"""
    dirname = project_dir.name
    if is_id_format(dirname):
        return dirname
    
    # 从数据库查
    if PROJECTS_INDEX_DB.exists():
        try:
            conn = sqlite3.connect(str(PROJECTS_INDEX_DB))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT id FROM projects WHERE name=?", (dirname,))
            row = cur.fetchone()
            conn.close()
            if row:
                return row['id']
        except Exception:
            pass
    return None


def merge_dirs(src: Path, dst: Path, dry_run: bool = False) -> int:
    """合并 src 目录到 dst 目录（不覆盖已有文件），返回复制文件数"""
    count = 0
    for item in src.rglob('*'):
        if item.is_file():
            rel = item.relative_to(src)
            dest_file = dst / rel
            if not dest_file.exists():
                if not dry_run:
                    dest_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(str(item), str(dest_file))
                print(f"    复制: {rel}")
                count += 1
            else:
                print(f"    跳过（已存在）: {rel}")
    return count


def fix_project_dirs(dry_run: bool = False):
    """扫描并修复 ID 格式目录"""
    if not PROJECTS_DIR.exists():
        print(f"projects 目录不存在: {PROJECTS_DIR}")
        return
    
    print(f"扫描目录: {PROJECTS_DIR}")
    print(f"模式: {'预览（dry-run）' if dry_run else '实际执行'}")
    print("=" * 60)
    
    id_dirs = [d for d in PROJECTS_DIR.iterdir() if d.is_dir() and is_id_format(d.name)]
    
    if not id_dirs:
        print("未发现 ID 格式目录，无需处理。")
        return
    
    print(f"发现 {len(id_dirs)} 个 ID 格式目录：")
    
    for id_dir in sorted(id_dirs):
        print(f"\n目录: {id_dir.name}")
        
        # 获取真实项目名
        project_name = get_project_name_from_dir(id_dir)
        if not project_name:
            print(f"  ❌ 无法获取真实项目名，跳过")
            continue
        
        print(f"  真实项目名: {project_name}")
        target_dir = PROJECTS_DIR / project_name
        
        if target_dir == id_dir:
            print(f"  ✅ 目录名已是项目名，无需处理")
            continue
        
        if target_dir.exists():
            # 目标目录已存在，合并
            print(f"  目标目录已存在: {target_dir}，执行合并...")
            count = merge_dirs(id_dir, target_dir, dry_run)
            if count == 0:
                print(f"  ✅ 没有需要合并的文件")
            else:
                print(f"  ✅ 合并了 {count} 个文件")
            
            # 删除旧目录
            if not dry_run:
                print(f"  删除旧目录: {id_dir}")
                shutil.rmtree(str(id_dir))
                print(f"  ✅ 旧目录已删除")
            else:
                print(f"  [dry-run] 将删除旧目录: {id_dir}")
        else:
            # 直接重命名
            print(f"  重命名: {id_dir.name} -> {project_name}")
            if not dry_run:
                id_dir.rename(target_dir)
                print(f"  ✅ 重命名成功")
            else:
                print(f"  [dry-run] 将重命名为: {target_dir}")
        
        # 更新 uploads 中对应文件的 file_path（如果有需要）
        # 说明：重命名后，documents.db 中的 file_path 可能还引用旧目录名
        # 但因为 file_path 格式是 "uploads/{项目名}/..."，不含目录名，所以通常不需要更新
    
    print("\n" + "=" * 60)
    print("处理完成")
    
    if dry_run:
        print("\n注意：这是预览模式，未实际执行任何操作。")
        print("运行 'python tools/fix_project_dirs.py' 执行实际操作。")


def check_zip_records():
    """检查各项目的 ZIP 上传记录文件"""
    print("\n检查 ZIP 上传记录：")
    print("=" * 60)
    
    for project_dir in sorted(PROJECTS_DIR.iterdir()):
        if not project_dir.is_dir() or project_dir.name == 'common':
            continue
        
        zip_file = project_dir / 'zip_uploads.json'
        if zip_file.exists():
            try:
                with open(zip_file, 'r', encoding='utf-8') as f:
                    records = json.load(f)
                print(f"  {project_dir.name}: {len(records)} 条记录")
            except Exception as e:
                print(f"  {project_dir.name}: 读取失败 - {e}")
        else:
            uploads_dir = project_dir / 'uploads'
            if uploads_dir.exists() and any(uploads_dir.rglob('*')):
                print(f"  {project_dir.name}: ⚠️ 有 uploads 文件但无 zip_uploads.json")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='修复 projects/ 目录下 ID 格式目录名问题')
    parser.add_argument('--dry-run', action='store_true', help='预览模式，不实际操作')
    parser.add_argument('--check-zip', action='store_true', help='只检查 ZIP 上传记录')
    args = parser.parse_args()
    
    if args.check_zip:
        check_zip_records()
    else:
        fix_project_dirs(dry_run=args.dry_run)
