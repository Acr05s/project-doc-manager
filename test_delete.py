#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试项目删除功能
"""

import json
import requests
import time

# 测试服务器地址
BASE_URL = 'http://localhost:5000'

# 测试删除项目
def test_delete_project():
    """测试删除项目功能"""
    print("开始测试项目删除功能...")
    
    # 1. 获取项目列表
    print("获取项目列表...")
    response = requests.get(f'{BASE_URL}/api/projects/list')
    if response.status_code != 200:
        print(f"获取项目列表失败: {response.json()}")
        return False
    
    projects = response.json()
    if not projects:
        print("没有项目可以测试删除")
        return False
    
    # 选择最后一个项目进行测试
    test_project = projects[-1]
    project_id = test_project.get('id')
    project_name = test_project.get('name')
    print(f"选择测试项目: {project_name} (ID: {project_id})")
    
    # 2. 删除项目（软删除）
    print("删除项目...")
    response = requests.delete(f'{BASE_URL}/api/projects/{project_id}')
    if response.status_code != 200:
        print(f"删除项目失败: {response.json()}")
        return False
    
    delete_result = response.json()
    print(f"删除结果: {delete_result}")
    
    if delete_result.get('status') != 'success':
        print(f"删除项目失败: {delete_result.get('message')}")
        return False
    
    # 3. 检查项目是否从列表中移除
    print("检查项目是否从列表中移除...")
    response = requests.get(f'{BASE_URL}/api/projects/list')
    if response.status_code != 200:
        print(f"获取项目列表失败: {response.json()}")
        return False
    
    updated_projects = response.json()
    updated_project_ids = [p.get('id') for p in updated_projects]
    print(f"更新后的项目列表: {[p.get('name') for p in updated_projects]}")
    
    if project_id in updated_project_ids:
        print(f"❌ 项目 {project_name} 仍在列表中")
        return False
    else:
        print(f"✅ 项目 {project_name} 已从列表中移除")
    
    # 4. 检查项目是否在回收站中
    print("检查项目是否在回收站中...")
    response = requests.get(f'{BASE_URL}/api/projects/deleted/list')
    if response.status_code != 200:
        print(f"获取已删除项目列表失败: {response.json()}")
        return False
    
    deleted_projects = response.json()
    if isinstance(deleted_projects, dict):
        deleted_projects = deleted_projects.get('projects', [])
    
    deleted_project_ids = [p.get('id') for p in deleted_projects]
    print(f"回收站中的项目: {[p.get('name') for p in deleted_projects]}")
    
    if project_id not in deleted_project_ids:
        print(f"❌ 项目 {project_name} 不在回收站中")
        return False
    else:
        print(f"✅ 项目 {project_name} 已移到回收站")
    
    # 5. 恢复项目
    print("恢复项目...")
    response = requests.post(f'{BASE_URL}/api/projects/{project_id}/restore')
    if response.status_code != 200:
        print(f"恢复项目失败: {response.json()}")
        return False
    
    restore_result = response.json()
    print(f"恢复结果: {restore_result}")
    
    if restore_result.get('status') != 'success':
        print(f"恢复项目失败: {restore_result.get('message')}")
        return False
    
    # 6. 检查项目是否恢复到列表中
    print("检查项目是否恢复到列表中...")
    response = requests.get(f'{BASE_URL}/api/projects/list')
    if response.status_code != 200:
        print(f"获取项目列表失败: {response.json()}")
        return False
    
    restored_projects = response.json()
    restored_project_ids = [p.get('id') for p in restored_projects]
    print(f"恢复后的项目列表: {[p.get('name') for p in restored_projects]}")
    
    if project_id not in restored_project_ids:
        print(f"❌ 项目 {project_name} 未恢复到列表中")
        return False
    else:
        print(f"✅ 项目 {project_name} 已恢复到列表中")
    
    return True

if __name__ == '__main__':
    success = test_delete_project()
    if success:
        print("\n🎉 所有测试通过！")
    else:
        print("\n❌ 测试失败！")
