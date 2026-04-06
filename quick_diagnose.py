# -*- coding: utf-8 -*-
"""诊断打包逻辑问题"""

import sys
import traceback

try:
    sys.path.insert(0, '.')
    from app.utils.project_data_manager import ProjectDataManager
    from app.utils.base import DocumentConfig
    
    config = DocumentConfig()
    dm = ProjectDataManager(config)
    project_name = "人力资源市场平台项目"
    
    print(f"加载项目: {project_name}...")
    full_config = dm.load_full_config(project_name)
    
    if not full_config or full_config.get('status') != 'success':
        print(f"加载失败")
        print(full_config)
    else:
        project = full_config.get('project', {})
        documents = project.get('documents', {})
        cycles_order = project.get('cycles', [])
        documents_archived = project.get('documents_archived', {})
        
        print(f"\n周期: {cycles_order[:5]}...")
        print(f"归档状态键: {list(documents_archived.keys())}")
        
        # 找到包含"项目准备"的周期
        for cycle in cycles_order:
            if '项目准备' in cycle:
                print(f"\n=== 周期: {cycle} ===")
                doc_data = documents.get(cycle, {})
                required_docs = doc_data.get('required_docs', [])
                uploaded_docs = doc_data.get('uploaded_docs', [])
                archived_in_cycle = documents_archived.get(cycle, {})
                
                print(f"required_docs ({len(required_docs)}):")
                for req in required_docs:
                    name = req.get('name', '未知')
                    print(f"  - {name}")
                
                print(f"\nuploaded_docs ({len(uploaded_docs)}):")
                for doc in uploaded_docs:
                    doc_name = doc.get('doc_name', '未知')
                    filename = doc.get('original_filename', '未知')
                    archived = archived_in_cycle.get(doc_name, False)
                    print(f"  [{'Y' if archived else 'N'}] {doc_name}: {filename}")
                
                print(f"\n归档状态: {archived_in_cycle}")
                break

except Exception as e:
    print(f"错误: {e}")
    traceback.print_exc()
