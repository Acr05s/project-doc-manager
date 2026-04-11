#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试清理重复文档功能

使用方法:
    python test_duplicate_cleanup.py <项目名称>
    
示例:
    python test_duplicate_cleanup.py 示例项目
"""

import json
import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.utils.project_data_manager import ProjectDataManager
from app.utils.base import DocumentConfig


def test_load_full_config(project_name):
    """测试 load_full_config 是否正确去重"""
    print(f"\n=== 测试 load_full_config: {project_name} ===")
    
    config = DocumentConfig()
    data_manager = ProjectDataManager(config)
    
    # 加载完整配置
    full_config = data_manager.load_full_config(project_name)
    
    if not full_config:
        print("[FAIL] 加载配置失败")
        return False
    
    documents = full_config.get('documents', {})
    total_docs = sum(len(cycle.get('uploaded_docs', [])) for cycle in documents.values())
    
    print(f"总周期数: {len(documents)}")
    print(f"总文档数: {total_docs}")
    
    # 检查重复
    by_name = {}
    for cycle_name, cycle_data in documents.items():
        for doc in cycle_data.get('uploaded_docs', []):
            name = doc.get('original_filename', doc.get('filename', '')).strip().lower()
            if name:
                if name not in by_name:
                    by_name[name] = []
                by_name[name].append((cycle_name, doc.get('doc_id', 'N/A')))
    
    duplicates = {k: v for k, v in by_name.items() if len(v) > 1}
    
    if duplicates:
        print(f"\n[FAIL] 发现 {len(duplicates)} 个重复文件:")
        for name, locations in list(duplicates.items())[:5]:
            print(f"  - {name}: 出现在 {len(locations)} 处")
        return False
    else:
        print("[PASS] 无重复文件")
        return True


def test_documents_index(project_name):
    """测试 documents_index.json 是否有重复"""
    print(f"\n=== 测试 documents_index.json: {project_name} ===")
    
    config = DocumentConfig()
    data_manager = ProjectDataManager(config)
    
    doc_index = data_manager.load_documents_index(project_name)
    documents = doc_index.get('documents', {})
    
    print(f"总文档数: {len(documents)}")
    
    # 检查重复
    by_name = {}
    for doc_id, doc in documents.items():
        name = doc.get('original_filename', '').strip().lower()
        if name:
            if name not in by_name:
                by_name[name] = []
            by_name[name].append(doc_id)
    
    duplicates = {k: v for k, v in by_name.items() if len(v) > 1}
    
    if duplicates:
        print(f"\n[FAIL] 发现 {len(duplicates)} 个重复文件:")
        for name, doc_ids in list(duplicates.items())[:5]:
            print(f"  - {name}: {len(doc_ids)} 个文档")
            for doc_id in doc_ids:
                print(f"    * {doc_id}")
        return False
    else:
        print("[PASS] 无重复文件")
        return True


def test_requirements_json(project_name):
    """测试 requirements.json 是否还包含 uploaded_docs"""
    print(f"\n=== 测试 requirements.json: {project_name} ===")
    
    config = DocumentConfig()
    data_manager = ProjectDataManager(config)
    
    requirements = data_manager.load_requirements(project_name)
    
    if not requirements:
        print("[WARN] 未找到 requirements.json")
        return True
    
    has_uploaded = False
    for cycle, info in requirements.get('documents', {}).items():
        if info.get('uploaded_docs'):
            has_uploaded = True
            print(f"[WARN] 周期 {cycle} 仍包含 {len(info['uploaded_docs'])} 个 uploaded_docs")
    
    if has_uploaded:
        print("[WARN] requirements.json 仍包含 uploaded_docs（旧数据）")
        return False
    else:
        print("[PASS] requirements.json 不再包含 uploaded_docs")
        return True


def main():
    if len(sys.argv) < 2:
        print("用法: python test_duplicate_cleanup.py <项目名称>")
        sys.exit(1)
    
    project_name = sys.argv[1]
    
    print(f"开始测试项目: {project_name}")
    
    results = []
    results.append(("documents_index.json", test_documents_index(project_name)))
    results.append(("load_full_config", test_load_full_config(project_name)))
    results.append(("requirements.json", test_requirements_json(project_name)))
    
    print("\n=== 测试结果汇总 ===")
    all_passed = True
    for name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{name}: {status}")
        if not passed:
            all_passed = False
    
    if all_passed:
        print("\n[OK] 所有测试通过！")
        sys.exit(0)
    else:
        print("\n[ERROR] 部分测试失败")
        sys.exit(1)


if __name__ == '__main__':
    main()
