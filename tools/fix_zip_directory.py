"""修复已归档 ZIP 文档的 directory 字段 - 调试版"""
import sqlite3
import json

DB_PATH = 'projects/projects_index.db'

def extract_directory_from_file_path(file_path, project_name):
    if not file_path:
        return None
    fp = file_path.replace('\\', '/')
    prefix = f"{project_name}/uploads/"
    if fp.startswith(prefix):
        fp = fp[len(prefix):]
    elif fp.startswith('uploads/'):
        fp = fp[len('uploads/'):]
    parts = fp.split('/')
    if len(parts) <= 2:
        return None
    dir_parts = parts[1:-1]
    if not dir_parts:
        return None
    return '/'.join(dir_parts)

def main():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    
    rows = db.execute(
        "SELECT project_id, config_data FROM project_configs WHERE config_type = 'documents_index'"
    ).fetchall()
    
    print(f"找到 {len(rows)} 条 documents_index 记录")
    
    # 获取项目名映射
    name_rows = db.execute(
        "SELECT project_id, config_data FROM project_configs WHERE config_type = 'project_info'"
    ).fetchall()
    id_to_name = {}
    for row in name_rows:
        try:
            config = json.loads(row['config_data'])
            id_to_name[row['project_id']] = config.get('name', '')
        except:
            pass
    
    print(f"找到 {len(id_to_name)} 个项目")
    for pid, pname in id_to_name.items():
        print(f"  {pid}: {pname}")
    
    total_fixed = 0
    total_checked = 0
    
    for row in rows:
        try:
            data = json.loads(row['config_data'])
        except:
            print(f"  解析失败: project_id={row['project_id']}")
            continue
        
        docs = data.get('documents', {})
        project_id = row['project_id']
        project_name = id_to_name.get(project_id, '')
        
        print(f"\n项目 {project_id} ({project_name}): {len(docs)} 个文档")
        
        for doc_id, doc_data in docs.items():
            source = doc_data.get('source', '')
            if not source.startswith('ZIP'):
                continue
            
            total_checked += 1
            
            existing_dir = doc_data.get('directory', '')
            if existing_dir and existing_dir != '/' and existing_dir != 'NOT_SET':
                continue
            
            file_path = doc_data.get('file_path', '')
            if not file_path:
                continue
            
            if not project_name:
                parts = file_path.replace('\\', '/').split('/')
                if len(parts) >= 3 and parts[1] == 'uploads':
                    project_name = parts[0]
            
            directory = extract_directory_from_file_path(file_path, project_name)
            
            if directory:
                doc_data['directory'] = directory
                total_fixed += 1
                if total_fixed <= 5:
                    print(f"  修复: {doc_id[:50]}")
                    print(f"    directory: '{existing_dir}' -> '{directory}'")
                    print(f"    file_path: {file_path}")
        
        if total_fixed > 0:
            db.execute(
                "UPDATE project_configs SET config_data = ? WHERE project_id = ? AND config_type = 'documents_index'",
                (json.dumps(data, ensure_ascii=False), project_id)
            )
    
    db.commit()
    db.close()
    
    print(f"\n=== 修复完成 ===")
    print(f"检查了 {total_checked} 个 ZIP 归档文档")
    print(f"修复了 {total_fixed} 个目录信息")

if __name__ == '__main__':
    main()
