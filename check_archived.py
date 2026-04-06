# -*- coding: utf-8 -*-
import sqlite3
import json

# 查询 project_configs 表中的归档状态
db_path = r'd:\workspace\Doc\project_doc_manager\projects\projects_index.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 查找人力资源市场平台项目的配置
project_id = 'project_20260330095139_71049089'
cursor.execute("SELECT * FROM project_configs WHERE project_id = ?", (project_id,))
configs = cursor.fetchall()
print(f"项目配置数量: {len(configs)}")
for cfg in configs:
    print(f"\n配置类型: {cfg[2]}")
    config_data = cfg[3]
    try:
        data = json.loads(config_data)
        if isinstance(data, dict):
            # 检查 documents_archived
            if 'documents_archived' in data:
                print(f"  documents_archived 键: {list(data['documents_archived'].keys())}")
                for cycle, docs in data['documents_archived'].items():
                    if '项目准备' in cycle:
                        print(f"\n  周期 '{cycle}' 的归档状态:")
                        print(f"    {docs}")
            else:
                # 检查顶层键
                print(f"  顶层键: {list(data.keys())[:10]}")
    except:
        print(f"  无法解析 JSON: {config_data[:200]}...")

conn.close()

# 读取 documents_index.json 并对比
docs_path = r'd:\workspace\Doc\project_doc_manager\projects\人力资源市场平台项目\data\documents_index.json'
with open(docs_path, 'r', encoding='utf-8') as f:
    docs = json.load(f)

print(f"\n\n=== documents_index.json 分析 ===")
print(f"总记录数: {len(docs)}")

# 检查前几条记录的字段
print("\n前3条记录的字段:")
for i, (doc_id, doc) in enumerate(list(docs.items())[:3]):
    print(f"\n{doc_id}:")
    for key, value in doc.items():
        if value:  # 只显示非空值
            if key == 'file_path':
                print(f"  {key}: {value[:60]}...")
            else:
                print(f"  {key}: {value}")
