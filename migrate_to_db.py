#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
数据迁移脚本：将项目配置数据从JSON文件迁移到数据库

使用方法：
    python migrate_to_db.py

迁移内容：
    - project_info.json -> 数据库 project_configs 表 (config_type='project_info')
    - requirements.json -> 数据库 project_configs 表 (config_type='requirements')
    - categories.json -> 数据库 project_configs 表 (config_type='categories')
    - documents_index.json -> 数据库 project_configs 表 (config_type='documents_index')
    - documents_archived.json -> 数据库 project_configs 表 (config_type='documents_archived')
    - zip_uploads.json -> 数据库 project_configs 表 (config_type='zip_uploads')
    - .draft.json -> 数据库 project_configs 表 (config_type='draft')
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from app.utils.db_manager import get_projects_index_db


def load_json(file_path):
    """加载JSON文件"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"  加载失败: {e}")
        return None


def migrate_project(project_dir: Path, db):
    """迁移单个项目的配置数据"""
    project_name = project_dir.name
    print(f"\n处理项目: {project_name}")
    
    # 获取 project_id
    project_info_path = project_dir / 'project_info.json'
    project_id = None
    if project_info_path.exists():
        data = load_json(project_info_path)
        if data:
            project_id = data.get('id')
    
    if not project_id:
        # 尝试从数据库获取
        db_project = db.get_project_by_name(project_name)
        if db_project:
            project_id = db_project['id']
    
    if not project_id:
        print(f"  跳过: 无法获取 project_id")
        return 0
    
    print(f"  project_id: {project_id}")
    
    # 迁移各类配置
    config_mapping = {
        'project_info.json': 'project_info',
        'requirements.json': 'requirements',
        'config/requirements.json': 'requirements',
        'categories.json': 'categories',
        'config/categories.json': 'categories',
        'documents_index.json': 'documents_index',
        'data/documents_index.json': 'documents_index',
        'documents_archived.json': 'documents_archived',
        'data/documents_archived.json': 'documents_archived',
        'zip_uploads.json': 'zip_uploads',
        '.draft.json': 'draft',
    }
    
    migrated_count = 0
    for file_path, config_type in config_mapping.items():
        full_path = project_dir / file_path
        if full_path.exists() and full_path.is_file():
            data = load_json(full_path)
            if data is not None:
                success = db.save_project_config(project_id, config_type, data)
                if success:
                    print(f"  [OK] {config_type}")
                    migrated_count += 1
                else:
                    print(f"  [FAIL] {config_type} (保存失败)")
    
    return migrated_count


def main():
    print("=" * 60)
    print("项目配置数据迁移脚本")
    print("将JSON文件迁移到数据库")
    print("=" * 60)
    
    # 获取数据库连接
    db = get_projects_index_db()
    if not db:
        print("错误: 无法连接到数据库")
        sys.exit(1)
    
    print("\n数据库连接成功")
    
    # 获取备份目录
    backup_dir = Path(__file__).parent / 'projects_json_backup'
    if not backup_dir.exists():
        print(f"错误: 备份目录不存在: {backup_dir}")
        sys.exit(1)
    
    print(f"备份目录: {backup_dir}")
    
    # 迁移每个项目
    total_migrated = 0
    project_count = 0
    
    for item in sorted(backup_dir.iterdir()):
        if not item.is_dir():
            continue
        if item.name in ['requirements', 'common']:
            # 跳过公共目录
            continue
        
        count = migrate_project(item, db)
        total_migrated += count
        project_count += 1
    
    print("\n" + "=" * 60)
    print(f"迁移完成!")
    print(f"处理项目数: {project_count}")
    print(f"迁移配置数: {total_migrated}")
    print("=" * 60)
    
    # 验证迁移结果
    print("\n验证迁移结果:")
    all_projects = db.list_projects(include_deleted=True)
    print(f"数据库中项目数: {len(all_projects)}")
    for proj in all_projects[:5]:
        print(f"  - {proj['name']} (ID: {proj['id']})")
    if len(all_projects) > 5:
        print(f"  ... 还有 {len(all_projects) - 5} 个项目")


if __name__ == '__main__':
    main()
