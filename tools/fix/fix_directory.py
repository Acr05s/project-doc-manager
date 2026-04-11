#!/usr/bin/env python3
"""修复所有文档的 directory 字段
从 file_path 中提取目录信息，适用于 source=select 和 source=ZIP导入 的文档
使用方法: python tools/fix_directory.py [--dry-run]
"""
import sqlite3
import json
import sys
import os

def extract_directory_from_path(file_path, project_name):
    """从 file_path 提取目录信息
    格式: {项目名}/uploads/{zip_id}_{cycle}/...目录.../文件名
    或: uploads/{项目名}/...目录.../文件名
    """
    if not file_path:
        return None
    
    fp = file_path.replace('\\', '/')
    
    # 跳过项目名前缀
    if fp.startswith(project_name + '/'):
        fp = fp[len(project_name) + 1:]
    
    # 跳过 uploads/ 前缀
    if fp.startswith('uploads/'):
        fp = fp[8:]
    
    parts = fp.split('/')
    if len(parts) <= 2:
        return None
    
    # parts[0] 是 zip_id_cycle 根目录
    # parts[-1] 是文件名
    dir_parts = parts[1:-1]
    
    if not dir_parts:
        return None
    
    return '/'.join(dir_parts)


def main():
    dry_run = '--dry-run' in sys.argv
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'projects', 'projects_index.db')
    
    db = sqlite3.connect(db_path, timeout=10)
    db.row_factory = sqlite3.Row
    
    # 查项目名映射
    projects = {}
    proj_rows = db.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'project_info'").fetchall()
    for r in proj_rows:
        info = json.loads(r['config_data'])
        projects[r['project_id']] = info.get('name', r['project_id'])
    
    rows = db.execute("SELECT id, project_id, config_data FROM project_configs WHERE config_type = 'documents_index'").fetchall()
    
    total_fixed = 0
    total_checked = 0
    
    for row in rows:
        row_id = row['id']
        project_id = row['project_id']
        project_name = projects.get(project_id, project_id)
        config_data = json.loads(row['config_data'])
        docs = config_data.get('documents', {})
        
        changed = False
        project_fixed = 0
        
        for doc_id, doc in docs.items():
            current_dir = doc.get('directory', '/')
            if current_dir != '/' and current_dir != '' and current_dir is not None:
                continue
            
            total_checked += 1
            
            file_path = doc.get('file_path', '')
            new_dir = extract_directory_from_path(file_path, project_name)
            
            if new_dir:
                if dry_run:
                    print(f"  将修复: {doc.get('doc_name', doc_id[:40])[:50]}")
                    print(f"    directory: '{current_dir}' -> '{new_dir}'")
                else:
                    doc['directory'] = new_dir
                changed = True
                project_fixed += 1
                total_fixed += 1
        
        if changed and not dry_run:
            new_config = json.dumps(config_data, ensure_ascii=False)
            db.execute("UPDATE project_configs SET config_data = ? WHERE id = ?",
                       (new_config, row_id))
            print(f"项目 [{project_name}]: 修复了 {project_fixed} 个文档")
        elif project_fixed > 0:
            print(f"项目 [{project_name}] (dry-run): 将修复 {project_fixed} 个文档")
    
    if not dry_run:
        db.commit()
    db.close()
    
    prefix = "[DRY-RUN] " if dry_run else ""
    print(f"\n{prefix}总计: 检查 {total_checked} 个文档, {'将' if dry_run else ''}修复 {total_fixed} 个")


if __name__ == '__main__':
    main()
