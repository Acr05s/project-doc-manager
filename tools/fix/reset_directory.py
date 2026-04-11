"""
重置所有文档的 directory 字段为 /
用于清理历史数据，重新归档后会按新逻辑保存正确目录信息
"""
import sqlite3
import os
import sys
import json

DRY_RUN = '--dry-run' in sys.argv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS_DIR = os.path.join(BASE_DIR, 'projects')
INDEX_DB_PATH = os.path.join(PROJECTS_DIR, 'projects_index.db')

total_reset = 0
total_skipped = 0

# ========== 1. 修复各项目的 documents.db ==========
print("=== 修复 documents.db ===")
for project_name in os.listdir(PROJECTS_DIR):
    if project_name == 'projects_index.db':
        continue
    db_path = os.path.join(PROJECTS_DIR, project_name, 'data', 'db', 'documents.db')
    json_path = os.path.join(PROJECTS_DIR, project_name, 'data', 'documents_index.json')
    
    if not os.path.exists(db_path):
        continue

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 查询当前不是 / 的文档
    cursor.execute("SELECT doc_id, directory FROM documents WHERE directory != '/' AND directory IS NOT NULL AND directory != ''")
    rows = cursor.fetchall()

    if not rows:
        conn.close()
        continue

    print(f"\n项目: {project_name}  需重置: {len(rows)} 个")
    for doc_id, directory in rows[:5]:
        print(f"  {doc_id[:30]}: {directory[:60]}")
    if len(rows) > 5:
        print(f"  ... 还有 {len(rows)-5} 个")

    if not DRY_RUN:
        cursor.execute("UPDATE documents SET directory = '/' WHERE directory != '/' AND directory IS NOT NULL AND directory != ''")
        conn.commit()
        print(f"  [OK] DB已重置 {cursor.rowcount} 个")
        total_reset += cursor.rowcount
        
        # 同步更新 JSON 文件
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                docs = data.get('documents', {})
                json_updated = 0
                for doc_id in docs:
                    d = docs[doc_id].get('directory')
                    if d != '/' and d is not None and d != '':
                        docs[doc_id]['directory'] = '/'
                        json_updated += 1
                if json_updated > 0:
                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"  [OK] JSON已重置 {json_updated} 个")
            except Exception as e:
                print(f"  [WARN] JSON更新失败: {e}")
    else:
        total_skipped += len(rows)

    conn.close()

# ========== 2. 修复 projects_index.db 的 project_configs 表 ==========
print("\n=== 修复 projects_index.db ===")
if os.path.exists(INDEX_DB_PATH) and not DRY_RUN:
    try:
        conn = sqlite3.connect(INDEX_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'documents_index'")
        rows = cursor.fetchall()
        
        index_fixed = 0
        for project_id, config_data in rows:
            try:
                data = json.loads(config_data)
                docs = data.get('documents', {})
                fixed = 0
                for doc_id, doc in docs.items():
                    d = doc.get('directory')
                    if d != '/' and d is not None and d != '':
                        doc['directory'] = '/'
                        fixed += 1
                if fixed > 0:
                    # 写回数据库
                    cursor.execute(
                        "UPDATE project_configs SET config_data = ? WHERE project_id = ? AND config_type = 'documents_index'",
                        (json.dumps(data, ensure_ascii=False), project_id)
                    )
                    index_fixed += fixed
                    print(f"  {project_id}: 修复 {fixed} 个")
            except Exception as e:
                print(f"  [WARN] 处理 {project_id} 失败: {e}")
        
        conn.commit()
        conn.close()
        print(f"[OK] projects_index.db 共修复 {index_fixed} 个")
        total_reset += index_fixed
    except Exception as e:
        print(f"[WARN] 修复 projects_index.db 失败: {e}")

print()
if DRY_RUN:
    print(f"[dry-run] 共有 {total_skipped} 个文档需重置，加 --apply 参数执行")
else:
    print(f"[OK] 共重置 {total_reset} 个文档的 directory 为 /")
