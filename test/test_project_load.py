#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试项目加载功能
"""

import sys
import os
from pathlib import Path

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.utils.project_manager import ProjectManager
from app.utils.base import DocumentConfig
from app.utils.folder_manager import FolderManager


def test_project_load():
    """测试项目加载功能"""
    print("=== 测试项目加载功能 ===")
    
    # 创建配置实例
    config = DocumentConfig()
    print(f"项目文件夹: {config.projects_folder}")
    
    # 创建文件夹管理器
    folder_manager = FolderManager(config)
    
    # 创建项目管理器
    project_manager = ProjectManager(config, folder_manager)
    
    # 打印项目列表
    print(f"\n项目列表: {list(project_manager.projects_db.keys())}")
    
    # 测试加载项目
    project_id = "project_20260324211200"
    print(f"\n测试加载项目: {project_id}")
    
    # 检查项目是否在索引中
    if project_id in project_manager.projects_db:
        print(f"项目在索引中: {project_manager.projects_db[project_id]}")
    else:
        print(f"项目不在索引中")
    
    # 尝试加载项目
    project_config = project_manager.load(project_id)
    
    if project_config:
        print(f"\n项目加载成功!")
        print(f"项目名称: {project_config.get('name')}")
        print(f"项目周期数: {len(project_config.get('cycles', []))}")
        print(f"项目文档数: {len(project_config.get('documents', {}))}")
    else:
        print(f"\n项目加载失败!")


if __name__ == "__main__":
    test_project_load()
