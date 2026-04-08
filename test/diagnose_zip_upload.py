#!/usr/bin/env python3
"""
ZIP 上传问题诊断脚本
用于排查 ZIP 文件上传后匹配成功但数据不显示的问题

用法: python diagnose_zip_upload.py <项目名称>
示例: python diagnose_zip_upload.py '我的项目'
"""

import os
import sys
import json
import sqlite3
from pathlib import Path

# 获取项目根目录
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

def check_project_exists(project_name):
    """检查项目是否存在"""
    projects_dir = PROJECT_ROOT / "projects"
    project_dir = projects_dir / project_name
    
    print(f"[*] 检查项目目录: {project_dir}")
    print(f"    存在: {project_dir.exists()}")
    
    if project_dir.exists():
        print(f"    内容:")
        for item in project_dir.iterdir():
            print(f"      - {item.name}")
    
    return project_dir.exists()

def check_documents_index(project_name):
    """检查 documents_index.json"""
    index_file = PROJECT_ROOT / "projects" / project_name / "data" / "documents_index.json"
    
    print(f"\n[*] 检查文档索引文件: {index_file}")
    print(f"    存在: {index_file.exists()}")
    
    if index_file.exists():
        try:
            with open(index_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            documents = data.get('documents', {})
            print(f"    文档数量: {len(documents)}")
            if documents:
                print(f"    样例文档:")
                for i, (doc_id, doc_info) in enumerate(list(documents.items())[:3]):
                    print(f"      - {doc_id}:")
                    print(f"        cycle: {doc_info.get('cycle')}")
                    print(f"        doc_name: {doc_info.get('doc_name')}")
                    print(f"        file_path: {doc_info.get('file_path')}")
            return documents
        except Exception as e:
            print(f"    读取失败: {e}")
    return {}

def check_documents_db(project_name):
    """检查 documents.db"""
    db_file = PROJECT_ROOT / "projects" / project_name / "data" / "db" / "documents.db"
    
    print(f"\n[*] 检查 documents.db: {db_file}")
    print(f"    存在: {db_file.exists()}")
    
    if db_file.exists():
        try:
            conn = sqlite3.connect(str(db_file))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # 获取文档数量
            cursor.execute("SELECT COUNT(*) as count FROM documents")
            count = cursor.fetchone()['count']
            print(f"    文档数量: {count}")
            
            # 获取样例文档
            if count > 0:
                cursor.execute("SELECT * FROM documents LIMIT 3")
                rows = cursor.fetchall()
                print(f"    样例文档:")
                for row in rows:
                    print(f"      - doc_id: {row['doc_id']}")
                    print(f"        cycle: {row['cycle']}")
                    print(f"        doc_name: {row['doc_name']}")
                    print(f"        file_path: {row['file_path']}")
            
            conn.close()
            return count
        except Exception as e:
            print(f"    读取失败: {e}")
    return 0

def check_project_config(project_name):
    """检查 project_config.json"""
    config_file = PROJECT_ROOT / "projects" / project_name / "project_config.json"
    
    print(f"\n[*] 检查项目配置文件: {config_file}")
    print(f"    存在: {config_file.exists()}")
    
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            documents = data.get('documents', {})
            print(f"    周期数量: {len(documents)}")
            
            total_uploaded = 0
            for cycle, cycle_info in documents.items():
                if isinstance(cycle_info, dict):
                    uploaded = len(cycle_info.get('uploaded_docs', []))
                    total_uploaded += uploaded
                    print(f"    周期 {cycle}: {uploaded} 个已上传文档")
            
            print(f"    总共: {total_uploaded} 个已上传文档")
            return documents
        except Exception as e:
            print(f"    读取失败: {e}")
    return {}

def check_zip_uploads(project_name):
    """检查 zip_uploads.json"""
    zip_file = PROJECT_ROOT / "projects" / project_name / "zip_uploads.json"
    
    print(f"\n[*] 检查 ZIP 上传记录: {zip_file}")
    print(f"    存在: {zip_file.exists()}")
    
    if zip_file.exists():
        try:
            with open(zip_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if isinstance(data, list):
                print(f"    ZIP 包数量: {len(data)}")
                for record in data:
                    print(f"      - {record.get('name')}: {record.get('matched_count')}/{record.get('file_count')} 个文件匹配")
            return data
        except Exception as e:
            print(f"    读取失败: {e}")
    return []

def main():
    if len(sys.argv) < 2:
        print("用法: python test/diagnose_zip_upload.py <项目名称>")
        print("示例: python test/diagnose_zip_upload.py '我的项目'")
        sys.exit(1)
    
    project_name = sys.argv[1]
    
    print("=" * 60)
    print("ZIP 上传问题诊断工具")
    print("=" * 60)
    print(f"项目名: {project_name}")
    print(f"当前目录: {os.getcwd()}")
    print()
    
    # 检查项目
    if not check_project_exists(project_name):
        print(f"\n[!] 错误: 项目 '{project_name}' 不存在")
        sys.exit(1)
    
    # 检查各种数据源
    check_project_config(project_name)
    check_documents_index(project_name)
    check_documents_db(project_name)
    check_zip_uploads(project_name)
    
    print("\n" + "=" * 60)
    print("诊断完成")
    print("=" * 60)
    
    # 提供建议
    print("\n[*] 建议:")
    print("    1. 如果 project_config.json 中有 uploaded_docs 但 documents_index.json 为空,")
    print("       可能是保存过程中出现了问题。")
    print("    2. 如果 documents.db 中有数据但 documents_index.json 为空,")
    print("       可能是数据加载逻辑有问题。")
    print("    3. 建议重启服务后重新上传 ZIP 文件测试。")

if __name__ == '__main__':
    main()
