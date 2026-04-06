# -*- coding: utf-8 -*-
"""
检查 cycles 和 documents 键的一致性
"""
import sys
sys.path.insert(0, '.')

from app.utils.project_manager import ProjectManager
from app.utils.folder_manager import FolderManager
from app.utils.base import DocumentConfig

# 初始化
config = DocumentConfig()
folder_manager = FolderManager(config)
project_manager = ProjectManager(config, folder_manager)

# 获取人力资源市场平台项目ID
results = project_manager._db.execute("SELECT id FROM projects WHERE name LIKE '%人力资源%'")
project = results[0] if results else None

if project:
    project_id = project['id']
    config_data = project_manager.load(project_id)
    if config_data:
        cycles = config_data.get('cycles', [])
        documents = config_data.get('documents', {})
        
        print("cycles 列表:")
        for c in cycles:
            print(f"  '{c}'")
        
        print("\ndocuments 键:")
        for c in documents.keys():
            print(f"  '{c}'")
        
        print("\n对比:")
        cycles_set = set(cycles)
        docs_set = set(documents.keys())
        
        missing_from_docs = cycles_set - docs_set
        extra_in_docs = docs_set - cycles_set
        
        if missing_from_docs:
            print(f"\ncycles 中有但 documents 中没有: {missing_from_docs}")
        if extra_in_docs:
            print(f"\ndocuments 中有但 cycles 中没有: {extra_in_docs}")
        
        # 检查每个 documents 键是否有 required_docs
        print("\n检查每个 documents 键是否有 required_docs:")
        for cycle, doc_data in documents.items():
            if isinstance(doc_data, dict):
                required = doc_data.get('required_docs', [])
                uploaded = doc_data.get('uploaded_docs', [])
                print(f"  '{cycle}': required={len(required)}, uploaded={len(uploaded)}")
            else:
                print(f"  '{cycle}': 无效数据")
