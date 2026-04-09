#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
初始化项目统计全局视图表

在部署到远程服务器后运行此脚本，同步所有项目的统计信息到 projects_index.db

用法:
    python init_project_stats.py
"""

import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.utils.db_manager import get_projects_index_db


def main():
    print("=" * 60)
    print("初始化项目统计全局视图表")
    print("=" * 60)

    db = get_projects_index_db()

    # 1. 确保表已创建（访问数据库会自动创建）
    print("\n[1/2] 检查并创建 project_stats 表...")
    # 表会在 _ensure_tables 中自动创建，这里只需要触发一次数据库访问
    projects = db.list_projects()
    print(f"    发现 {len(projects)} 个项目")

    # 2. 同步所有项目统计
    print("\n[2/2] 同步所有项目统计信息...")
    result = db.sync_all_project_stats()

    print(f"\n    同步完成: {result['success']} 成功, {result['failed']} 失败")

    # 3. 显示全局统计
    print("\n" + "=" * 60)
    print("全局统计信息")
    print("=" * 60)
    stats = db.get_global_stats()
    print(f"  项目总数: {stats['project_count']}")
    print(f"  文档总数: {stats['total_docs']}")
    print(f"  已归档: {stats['archived_docs']}")
    print(f"  本次不涉及: {stats['not_involved_docs']}")
    print(f"  总文件大小: {stats['total_file_size_mb']} MB")

    # 4. 显示各项目统计
    print("\n" + "=" * 60)
    print("各项目统计")
    print("=" * 60)
    all_stats = db.get_project_stats()
    for s in all_stats:
        size_mb = round((s.get('total_file_size', 0) or 0) / (1024 * 1024), 2)
        print(f"  {s['project_name']}: {s['total_docs']} 文档, {size_mb} MB")

    print("\n" + "=" * 60)
    print("初始化完成!")
    print("=" * 60)


if __name__ == '__main__':
    main()
