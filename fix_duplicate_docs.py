#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复项目中的重复文档数据
当文档需求名称变更后，清除旧的重复记录
"""

import json
import os
from pathlib import Path

def load_json(filepath):
    """加载JSON文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(filepath, data):
    """保存JSON文件"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_required_doc_names(project_path):
    """从config/requirements.json获取当前需求的文档名称列表"""
    req_path = Path(project_path) / 'config' / 'requirements.json'
    required_names = {}  # {cycle: set of doc_names}
    
    if not req_path.exists():
        return required_names
    
    try:
        req_config = load_json(req_path)
        documents = req_config.get('documents', {})
        
        for cycle, cycle_data in documents.items():
            required_docs = cycle_data.get('required_docs', [])
            names = set()
            for doc in required_docs:
                if isinstance(doc, dict):
                    names.add(doc.get('name', ''))
                else:
                    names.add(str(doc))
            required_names[cycle] = names
            
    except Exception as e:
        print(f"    读取需求配置失败: {e}")
    
    return required_names

def fix_project_duplicates(project_path):
    """修复单个项目的重复文档"""
    data_dir = Path(project_path) / 'data'
    index_path = data_dir / 'documents_index.json'
    
    if not index_path.exists():
        return False
    
    print(f"\n处理项目: {Path(project_path).name}")
    
    # 加载文档索引
    doc_index = load_json(index_path)
    documents = doc_index.get('documents', {})
    
    # 获取当前需求的文档名称
    required_names = get_required_doc_names(project_path)
    
    if not required_names:
        print(f"  未找到需求配置")
        return False
    
    # 打印当前需求的文档名称（用于调试）
    print(f"  当前需求文档:")
    for cycle, names in required_names.items():
        if names:
            print(f"    [{cycle}]: {', '.join(sorted(names))}")
    
    # 找出重复的文档
    to_remove = []
    
    for doc_id, doc_info in documents.items():
        cycle = doc_info.get('cycle', '')
        doc_name = doc_info.get('doc_name', '')
        
        # 如果该周期有需求配置，检查文档名称是否在需求中
        if cycle in required_names:
            if doc_name not in required_names[cycle]:
                to_remove.append((doc_id, cycle, doc_name))
    
    if not to_remove:
        print(f"  没有发现重复数据")
        return False
    
    print(f"\n  发现 {len(to_remove)} 个重复文档需要删除:")
    for doc_id, cycle, doc_name in to_remove:
        print(f"    - [{cycle}] {doc_name}")
    
    # 备份原文件
    backup_path = data_dir / 'documents_index_backup.json'
    save_json(backup_path, doc_index)
    print(f"\n  已备份到: {backup_path}")
    
    # 删除重复文档
    for doc_id, _, _ in to_remove:
        del documents[doc_id]
    
    # 保存修复后的索引
    save_json(index_path, doc_index)
    print(f"  已删除重复文档并保存")
    
    return True

def main():
    """主函数"""
    projects_dir = Path(__file__).parent / 'projects'
    
    if not projects_dir.exists():
        print(f"项目目录不存在: {projects_dir}")
        return
    
    total_fixed = 0
    
    # 遍历所有项目目录
    for project_path in projects_dir.iterdir():
        if not project_path.is_dir():
            continue
        
        # 跳过common目录
        if project_path.name == 'common':
            continue
        
        if fix_project_duplicates(project_path):
            total_fixed += 1
    
    print(f"\n\n{'='*50}")
    print(f"总计修复 {total_fixed} 个项目")
    print("修复完成！请刷新页面查看效果。")
    print(f"{'='*50}")

if __name__ == '__main__':
    main()
