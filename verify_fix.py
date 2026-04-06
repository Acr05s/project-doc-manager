# -*- coding: utf-8 -*-
"""验证修复后的完整路径解析链路"""
import sys, os
sys.path.insert(0, 'd:/workspace/Doc/project_doc_manager')
os.chdir('d:/workspace/Doc/project_doc_manager')

from app.utils.project_data_manager import ProjectDataManager
from app.utils.base import DocumentConfig

# 模拟 _resolve_file_path 的核心逻辑（简化版）
def resolve_file_path_simulate(metadata, current_project_name):
    file_path = metadata.get('file_path', '')
    normalized_path = file_path.replace('\\', '/')  # 简化版 normalize_path
    project_name = metadata.get('project_name') or ''

    # 回退：从 current_project 获取
    if not project_name:
        project_name = current_project_name or ''

    base_dir = 'd:/workspace/Doc/project_doc_manager'

    # uploads/ 路径处理
    if normalized_path.startswith('uploads/'):
        full_path = os.path.join(base_dir, 'projects', project_name, normalized_path)
        return full_path.replace('/', os.sep)

    return normalized_path

# 模拟 documents.db 中的记录（project_name 为空）
test_docs = [
    {'doc_id': '10、运维_项目岗位设置及职责_20260326_193654',
     'file_path': 'uploads/mn7edg7k5h2i58x82b_人力资源市场平台项目验收文档_20260326193653/人力资源市场平台项目验收文档/10、运维/10.4项目项目岗位设置及职责.docx',
     'project_name': '', 'original_filename': '10.4...'},
    {'doc_id': '10、运维_项目数据管理方案_20260326_193654',
     'file_path': 'uploads/mn7edg7k5h2i58x82b_人力资源市场平台项目验收文档_20260326193653/人力资源市场平台项目验收文档/10、运维/10.5项目数据管理方案.docx',
     'project_name': '', 'original_filename': '10.5...'},
    {'doc_id': '10、运维_项目运维方案_20260326_193654',
     'file_path': 'uploads/mn7edg7k5h2i58x82b_人力资源市场平台项目验收文档_20260326193653/人力资源市场平台项目验收文档/10、运维/10.6项目运维方案.docx',
     'project_name': '', 'original_filename': '10.6...'},
]

current_project_name = '人力资源市场平台项目'

print("=== 模拟 _resolve_file_path (使用 current_project 回退) ===")
for doc in test_docs:
    resolved = resolve_file_path_simulate(doc, current_project_name)
    exists = os.path.exists(resolved)
    print(f"[{'OK' if exists else 'X'}] {doc['doc_id']}")
    print(f"    解析路径: {resolved}")
    print(f"    文件存在: {exists}")
    print()
