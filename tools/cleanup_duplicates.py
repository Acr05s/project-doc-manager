#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理项目文档中的重复项

使用方法:
    python cleanup_duplicates.py <项目ID或项目名称>
    
示例:
    python cleanup_duplicates.py 示例项目
    python cleanup_duplicates.py project_20260327133326
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# 项目基础路径
PROJECTS_BASE = Path(__file__).parent.parent / "projects"


def load_json(filepath):
    """加载 JSON 文件"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"加载文件失败 {filepath}: {e}")
        return None


def save_json(filepath, data):
    """保存 JSON 文件"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存文件失败 {filepath}: {e}")
        return False


def find_project(project_identifier):
    """根据 ID 或名称查找项目目录"""
    # 先尝试直接作为目录名查找
    project_dir = PROJECTS_BASE / project_identifier
    if project_dir.exists():
        return project_dir
    
    # 遍历所有项目，匹配 id 或 name
    for item in PROJECTS_BASE.iterdir():
        if item.is_dir():
            config_file = item / "project_config.json"
            if config_file.exists():
                config = load_json(config_file)
                if config:
                    if config.get('id') == project_identifier or config.get('name') == project_identifier:
                        return item
    
    return None


def cleanup_documents_index(project_dir):
    """清理文档索引中的重复项"""
    doc_index_file = project_dir / "data" / "documents_index.json"
    
    if not doc_index_file.exists():
        print(f"文档索引文件不存在: {doc_index_file}")
        return 0
    
    data = load_json(doc_index_file)
    if not data or 'documents' not in data:
        print("文档索引格式错误或为空")
        return 0
    
    documents = data['documents']
    original_count = len(documents)
    
    # 用于去重的字典 - 基于 original_filename（因为 file_path 在合并后会变化）
    # key: original_filename, value: (doc_id, upload_time)
    seen_files = {}
    duplicates = []
    
    print("开始扫描重复文档...")
    
    for doc_id, doc_info in list(documents.items()):
        # 使用 original_filename 作为去重键
        original_filename = doc_info.get('original_filename', '')
        
        if not original_filename:
            # 如果没有 original_filename，尝试使用 file_path 中的文件名
            file_path = doc_info.get('file_path', '')
            if file_path:
                original_filename = Path(file_path).name
            else:
                print(f"  警告: 文档 {doc_id} 没有文件名信息，跳过")
                continue
        
        upload_time = doc_info.get('upload_time', '') or doc_info.get('timestamp', '')
        
        if original_filename in seen_files:
            # 发现重复
            existing_doc_id, existing_time = seen_files[original_filename]
            
            # 比较上传时间，保留更新的
            if upload_time >= existing_time:
                # 当前文档更新，删除旧的
                duplicates.append((existing_doc_id, original_filename))
                del documents[existing_doc_id]
                seen_files[original_filename] = (doc_id, upload_time)
                print(f"  删除旧重复: {existing_doc_id}")
                print(f"    保留: {doc_id}")
            else:
                # 当前文档更旧，删除当前的
                duplicates.append((doc_id, original_filename))
                del documents[doc_id]
                print(f"  删除重复: {doc_id}")
                print(f"    保留: {existing_doc_id}")
        else:
            seen_files[original_filename] = (doc_id, upload_time)
    
    removed_count = len(duplicates)
    
    if removed_count > 0:
        # 保存清理后的文件
        if save_json(doc_index_file, data):
            print(f"\n清理完成:")
            print(f"  原始文档数: {original_count}")
            print(f"  删除重复数: {removed_count}")
            print(f"  剩余文档数: {len(documents)}")
            print(f"  已保存到: {doc_index_file}")
        else:
            print("保存失败！")
            return 0
    else:
        print("未发现重复文档")
    
    return removed_count


def main():
    if len(sys.argv) < 2:
        print("用法: python cleanup_duplicates.py <项目ID或项目名称>")
        print("示例:")
        print("  python cleanup_duplicates.py 示例项目")
        print("  python cleanup_duplicates.py project_20260327133326")
        sys.exit(1)
    
    project_identifier = sys.argv[1]
    
    # 查找项目
    project_dir = find_project(project_identifier)
    if not project_dir:
        print(f"未找到项目: {project_identifier}")
        print(f"请检查项目是否存在于: {PROJECTS_BASE}")
        sys.exit(1)
    
    print(f"找到项目: {project_dir.name}")
    print(f"开始清理重复文档...\n")
    
    # 清理文档索引
    removed = cleanup_documents_index(project_dir)
    
    if removed > 0:
        print("\n[OK] 清理完成！请刷新页面查看结果。")
    else:
        print("\n[OK] 没有需要清理的重复文档。")


if __name__ == '__main__':
    main()
