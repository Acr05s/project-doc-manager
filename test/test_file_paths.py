#!/usr/bin/env python3
"""
测试文档文件路径解析
遍历所有项目的文档，检查文件路径是否能正确解析
"""

import sys
import json
from pathlib import Path

# 添加项目路径（脚本在 test/ 目录下，项目根目录是父目录）
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.utils.document_manager import DocumentManager
from app.utils.base import DocumentConfig

def test_all_documents():
    """测试所有文档的文件路径"""
    config = DocumentConfig()
    doc_manager = DocumentManager(config)
    
    # 加载所有项目
    projects_dir = config.projects_base_folder
    print(f"项目目录: {projects_dir}")
    print(f"项目目录父目录: {projects_dir.parent}")
    print("=" * 80)
    
    total_docs = 0
    found_docs = 0
    missing_docs = 0
    
    # 遍历所有项目
    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue
            
        project_name = project_dir.name
        doc_index_path = project_dir / 'data' / 'documents_index.json'
        
        if not doc_index_path.exists():
            continue
            
        print(f"\n项目: {project_name}")
        print("-" * 80)
        
        try:
            with open(doc_index_path, 'r', encoding='utf-8') as f:
                doc_index = json.load(f)
            
            documents = doc_index.get('documents', {})
            
            for doc_id, doc in documents.items():
                total_docs += 1
                file_path = doc.get('file_path', '')
                original_filename = doc.get('original_filename', '')
                
                # 尝试解析路径
                found = False
                full_path = None
                
                # 方法1: 直接检查 file_path 是否是绝对路径
                if file_path:
                    path_obj = Path(file_path)
                    if path_obj.is_absolute() and path_obj.exists():
                        found = True
                        full_path = path_obj
                
                # 方法2: 尝试从项目目录构建路径
                if not found and file_path:
                    # 规范化路径
                    normalized = file_path.replace('\\', '/')
                    
                    # 尝试2a: projects/{项目名}/uploads/...
                    if normalized.startswith('projects/'):
                        potential_path = projects_dir.parent / normalized
                        if potential_path.exists():
                            found = True
                            full_path = potential_path
                    
                    # 尝试2b: {项目名}/uploads/...
                    elif normalized.startswith(f"{project_name}/"):
                        potential_path = projects_dir / normalized
                        if potential_path.exists():
                            found = True
                            full_path = potential_path
                    
                    # 尝试2c: uploads/...
                    elif normalized.startswith('uploads/'):
                        potential_path = project_dir / normalized
                        if potential_path.exists():
                            found = True
                            full_path = potential_path
                    
                    # 尝试2d: 直接使用相对路径
                    else:
                        potential_path = project_dir / normalized
                        if potential_path.exists():
                            found = True
                            full_path = potential_path
                        else:
                            # 尝试在 uploads 目录中查找
                            potential_path = project_dir / 'uploads' / normalized
                            if potential_path.exists():
                                found = True
                                full_path = potential_path
                    
                    # 尝试2e: 根据文件名搜索（处理ZIP文件夹被删除的情况）
                    if not found and original_filename:
                        uploads_dir = project_dir / 'uploads'
                        if uploads_dir.exists():
                            for file_path in uploads_dir.rglob(original_filename):
                                if file_path.is_file():
                                    found = True
                                    full_path = file_path
                                    break
                
                if found:
                    found_docs += 1
                    status = "[OK]"
                else:
                    missing_docs += 1
                    status = "[MISSING]"
                
                # 只显示有问题的文档
                if not found:
                    print(f"{status} {doc_id}")
                    print(f"   file_path: {file_path}")
                    if full_path:
                        print(f"   尝试路径: {full_path}")
                    print()
                    
        except Exception as e:
            print(f"   错误: {e}")
    
    print("\n" + "=" * 80)
    print(f"总计: {total_docs} 个文档")
    print(f"找到: {found_docs} 个")
    print(f"缺失: {missing_docs} 个")
    print(f"成功率: {found_docs/total_docs*100:.1f}%" if total_docs > 0 else "N/A")

if __name__ == '__main__':
    test_all_documents()
