#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试项目导入功能
"""

import os
import json
import requests
import tempfile
import zipfile
from pathlib import Path

# 测试服务器地址
BASE_URL = 'http://localhost:5000'

# 创建测试项目ZIP包
def create_test_project_zip():
    """创建测试项目ZIP包"""
    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_zip:
        temp_zip_path = temp_zip.name
    
    with zipfile.ZipFile(temp_zip_path, 'w') as zipf:
        # 添加项目配置文件
        project_config = {
            'id': 'test_project_id',
            'name': '测试项目',
            'description': '测试项目导入功能',
            'created_time': '2024-01-01T00:00:00',
            'updated_time': '2024-01-01T00:00:00',
            'cycles': [],
            'documents': {}
        }
        zipf.writestr('project_config.json', json.dumps(project_config, ensure_ascii=False, indent=2))
        
        # 添加文档索引文件
        documents_index = {
            'documents': {}
        }
        zipf.writestr('data/documents_index.json', json.dumps(documents_index, ensure_ascii=False, indent=2))
    
    return temp_zip_path

# 测试项目导入
def test_project_import():
    """测试项目导入功能"""
    print("开始测试项目导入功能...")
    
    # 创建测试ZIP包
    zip_path = create_test_project_zip()
    print(f"创建测试ZIP包: {zip_path}")
    
    try:
        # 1. 上传ZIP包
        print("上传ZIP包...")
        file_id = 'test_import_' + os.urandom(8).hex()
        
        # 分片上传
        with open(zip_path, 'rb') as f:
            chunk_size = 1024 * 1024  # 1MB
            # 计算总分片数
            file_size = os.path.getsize(zip_path)
            total_chunks = (file_size + chunk_size - 1) // chunk_size
            
            chunk_index = 0
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                
                files = {'chunk': (f'chunk_{chunk_index}', chunk)}
                data = {
                    'fileId': file_id,
                    'filename': 'test_project.zip',
                    'chunkIndex': chunk_index,
                    'totalChunks': total_chunks
                }
                
                response = requests.post(f'{BASE_URL}/api/projects/import/chunk', files=files, data=data)
                if response.status_code != 200:
                    print(f"上传分片失败: {response.json()}")
                    return False
                chunk_index += 1
        
        # 2. 合并分片并导入
        print("合并分片并导入...")
        merge_data = {
            'fileId': file_id,
            'filename': 'test_project.zip',
            'conflict_action': 'rename'
        }
        response = requests.post(f'{BASE_URL}/api/projects/import/merge', json=merge_data)
        
        if response.status_code != 200:
            print(f"导入失败: {response.json()}")
            return False
        
        result = response.json()
        print(f"导入结果: {result}")
        
        if result.get('status') != 'success':
            print(f"导入失败: {result.get('message')}")
            return False
        
        # 3. 检查项目是否在列表中
        print("检查项目是否在列表中...")
        response = requests.get(f'{BASE_URL}/api/projects/list')
        if response.status_code != 200:
            print(f"获取项目列表失败: {response.json()}")
            return False
        
        projects = response.json()
        # 检查返回值是否为列表
        if isinstance(projects, list):
            project_names = [p.get('name') for p in projects]
            print(f"项目列表: {project_names}")
        else:
            # 如果返回值是字典，尝试获取projects字段
            project_names = [p.get('name') for p in projects.get('projects', [])]
            print(f"项目列表: {project_names}")
        
        # 检查导入的项目是否在列表中
        if '测试项目' in project_names:
            print("✅ 测试项目已成功导入并显示在列表中")
        else:
            print("❌ 测试项目未显示在列表中")
            return False
        
        # 4. 检查是否创建了ID目录
        print("检查是否创建了ID目录...")
        projects_dir = Path('projects')
        for item in projects_dir.iterdir():
            if item.is_dir() and item.name.startswith('project_'):
                print(f"发现ID目录: {item.name}")
                # 检查目录是否为空
                if not any(item.iterdir()):
                    print(f"❌ 发现空的ID目录: {item.name}")
                    return False
        
        print("✅ 未发现空的ID目录")
        return True
        
    finally:
        # 清理测试文件
        if os.path.exists(zip_path):
            os.unlink(zip_path)

if __name__ == '__main__':
    success = test_project_import()
    if success:
        print("\n🎉 所有测试通过！")
    else:
        print("\n❌ 测试失败！")
