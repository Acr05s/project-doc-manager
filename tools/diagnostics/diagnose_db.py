#!/usr/bin/env python3
"""
数据库诊断脚本 - 检查文档是否正确存储在数据库中

用法: python tools/diagnostics/diagnose_db.py <项目名称>
示例: python tools/diagnostics/diagnose_db.py '我的项目'
"""

import sqlite3
import sys
from pathlib import Path

# 获取项目根目录
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

def check_project_documents_db(project_name):
    """检查项目的 documents.db"""
    db_path = PROJECT_ROOT / "projects" / project_name / "data" / "db" / "documents.db"
    
    print(f"[*] 检查项目数据库: {db_path}")
    print(f"    存在: {db_path.exists()}")
    
    if not db_path.exists():
        print(f"    [!] 数据库文件不存在")
        return 0
    
    try:
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # 获取表结构
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            table_names = [t['name'] for t in tables]
            print(f"    表: {table_names}")
            
            # 检查documents表是否存在
            if 'documents' not in table_names:
                print(f"    [!] documents表不存在")
                return 0
            
            # 获取文档数量
            cursor.execute("SELECT COUNT(*) as count FROM documents")
            count = cursor.fetchone()['count']
            print(f"    文档总数: {count}")
            
            if count > 0:
                # 获取样例文档
                cursor.execute("SELECT * FROM documents LIMIT 5")
                rows = cursor.fetchall()
                print(f"\n    样例文档:")
                for i, row in enumerate(rows, 1):
                    print(f"    {i}. doc_id: {row['doc_id']}")
                    print(f"       cycle: {row['cycle']}")
                    print(f"       doc_name: {row['doc_name']}")
                    print(f"       file_path: {row['file_path']}")
                    print(f"       upload_time: {row['upload_time']}")
                    print()
            
            return count
    except Exception as e:
        print(f"    [!] 读取失败: {e}")
        return 0

def check_projects_index_db(project_name):
    """检查 projects_index.db 中的 documents_index"""
    db_path = PROJECT_ROOT / "data" / "projects_index.db"
    
    print(f"\n[*] 检查项目索引数据库: {db_path}")
    print(f"    存在: {db_path.exists()}")
    
    if not db_path.exists():
        print(f"    [!] 数据库文件不存在")
        return
    
    try:
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # 获取项目ID
            cursor.execute("SELECT id FROM projects WHERE name = ?", (project_name,))
            row = cursor.fetchone()
            if not row:
                print(f"    [!] 项目不存在于索引数据库")
                return
            
            project_id = row['id']
            print(f"    项目ID: {project_id}")
            
            # 获取 documents_index 配置
            cursor.execute(
                "SELECT config_data FROM project_configs WHERE project_id = ? AND config_type = 'documents_index'",
                (project_id,)
            )
            row = cursor.fetchone()
            
            if row:
                import json
                config_data = json.loads(row['config_data'])
                documents = config_data.get('documents', {})
                print(f"    documents_index 文档数量: {len(documents)}")
                
                if documents:
                    print(f"\n    样例文档:")
                    for i, (doc_id, doc_info) in enumerate(list(documents.items())[:3], 1):
                        print(f"    {i}. doc_id: {doc_id}")
                        print(f"       cycle: {doc_info.get('cycle')}")
                        print(f"       doc_name: {doc_info.get('doc_name')}")
                        print(f"       file_path: {doc_info.get('file_path')}")
            else:
                print(f"    [!] 没有找到 documents_index 配置")
    except Exception as e:
        print(f"    [!] 读取失败: {e}")

def main():
    if len(sys.argv) < 2:
        print("用法: python test/diagnose_db.py <项目名称>")
        sys.exit(1)
    
    project_name = sys.argv[1]
    
    print("=" * 60)
    print("数据库诊断工具")
    print("=" * 60)
    print(f"项目: {project_name}\n")
    
    # 检查项目数据库
    doc_count = check_project_documents_db(project_name)
    
    # 检查索引数据库
    check_projects_index_db(project_name)
    
    print("\n" + "=" * 60)
    if doc_count > 0:
        print(f"[✓] 发现 {doc_count} 个文档在数据库中")
        print("如果前端不显示，可能是加载逻辑有问题")
    else:
        print("[!] 数据库中没有文档")
        print("请检查 ZIP 上传过程是否正确完成")
    print("=" * 60)

if __name__ == '__main__':
    main()
