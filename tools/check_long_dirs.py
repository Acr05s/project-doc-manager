#!/usr/bin/env python3
"""检查 directory 中包含 ZIP 包名前缀的文档
这些是没选根目录就归档的，directory 应该是 /"""
import sqlite3
import json

db = sqlite3.connect('projects/projects_index.db', timeout=10)
db.row_factory = sqlite3.Row

projects = {}
proj_rows = db.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'project_info'").fetchall()
for r in proj_rows:
    info = json.loads(r['config_data'])
    projects[r['project_id']] = info.get('name', r['project_id'])

rows = db.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'documents_index'").fetchall()

# 从 file_path 中提取 ZIP 包名前缀
# file_path 格式: {项目名}/uploads/{zip_id}_{desc}/.../file
# directory 应该是 .../ 部分（不含 uploads/{zip_id}_{desc}/）

print("=== 检查 directory 是否包含 ZIP 包前缀 ===\n")

total_to_fix = 0

for row in rows:
    pname = projects.get(row['project_id'], row['project_id'])
    docs = json.loads(row['config_data']).get('documents', {})
    
    for doc_id, doc in docs.items():
        directory = doc.get('directory', '/')
        if directory == '/' or not directory:
            continue
        
        file_path = doc.get('file_path', '')
        if not file_path:
            continue
        
        fp = file_path.replace('\\', '/')
        
        # 跳过项目名
        if fp.startswith(pname + '/'):
            fp = fp[len(pname) + 1:]
        
        # 跳过 uploads/
        if fp.startswith('uploads/'):
            fp = fp[8:]
        
        # 现在格式: {zip_id}_{desc}/...目录.../file
        # 提取 zip 根目录名
        parts = fp.split('/')
        if len(parts) < 3:
            continue
        
        zip_root = parts[0]  # zip_id_desc
        
        # 检查 directory 是否以 zip_root 中的描述部分开头
        # zip_root 格式通常是: {random}_{描述}  描述部分可能有 "初验" "终验" 等
        # 但 directory 中也包含这些
        
        # 更好的方法：检查 directory 和 file_path 中去掉 uploads/ 前缀后的关系
        # 如果 directory 就是从 file_path 去掉前两级后去掉文件名的结果，说明没截取
        remaining = '/'.join(parts[1:-1])  # 去掉 zip_root 和 filename
        
        if directory == remaining:
            # directory 完整保留了 file_path 中的目录结构（从 zip_root 之后开始）
            # 说明当时没有选择根目录
            total_to_fix += 1
            if total_to_fix <= 5:
                print(f"[{pname}] {doc.get('doc_name', '')[:40]}")
                print(f"  directory: {directory[:60]}")
                print(f"  file_path remaining: {remaining[:60]}")
                print(f"  => 匹配! 应该设为 /")
                print()

print(f"\n需要修复为 / 的文档总数: {total_to_fix}")
db.close()
