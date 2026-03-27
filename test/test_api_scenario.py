#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试API场景下的项目加载
"""

import sys
import os
from pathlib import Path

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.utils.document_manager import DocumentManager
from app.utils.base import get_base_dir


def test_api_scenario():
    """测试API场景下的项目加载"""
    print("=== 测试API场景下的项目加载 ===")
    
    # 获取项目根目录
    base_dir = get_base_dir()
    print(f"项目根目录: {base_dir}")
    
    # 创建文档管理器实例（模拟main.py中的初始化）
    doc_manager = DocumentManager({
        'base_dir': str(base_dir)
    })
    
    # 打印模块状态
    print(f"\n模块状态: {doc_manager.get_status()}")
    
    # 测试加载项目（模拟API请求）
    project_id = "project_20260324211200"
    print(f"\n测试加载项目: {project_id}")
    
    # 调用文档管理器的load_project方法（模拟API路由调用）
    result = doc_manager.load_project(project_id)
    
    print(f"\nAPI响应结果: {result}")
    
    if result['status'] == 'success':
        project = result['project']
        print(f"项目加载成功!")
        print(f"项目名称: {project.get('name')}")
        print(f"项目周期数: {len(project.get('cycles', []))}")
        print(f"项目文档数: {len(project.get('documents', {}))}")
    else:
        print(f"项目加载失败: {result.get('message')}")


if __name__ == "__main__":
    test_api_scenario()
