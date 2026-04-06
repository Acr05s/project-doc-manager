# -*- coding: utf-8 -*-
import sqlite3
import json
from pathlib import Path

# 读取项目索引数据库
db_path = r'd:\workspace\Doc\project_doc_manager\projects\projects_index.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 获取表
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print(f"数据库表: {[t[0] for t in tables]}")

# 查询人力资源市场平台项目
cursor.execute("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'index')")
for row in cursor.fetchall():
    print(f"  {row}")

# 查看projects表结构
try:
    cursor.execute("PRAGMA table_info(projects)")
    cols = cursor.fetchall()
    print("\nprojects 表结构:")
    for col in cols:
        print(f"  {col}")
except:
    pass

# 查找人力资源市场平台项目
cursor.execute("SELECT * FROM projects WHERE name LIKE '%人力资源%'")
rows = cursor.fetchall()
print(f"\n人力资源市场平台项目: {len(rows)} 条")
for row in rows[:3]:
    print(f"  {row}")

conn.close()

# 读取documents_index.json
docs_path = Path(r'd:\workspace\Doc\project_doc_manager\projects\人力资源市场平台项目\data\documents_index.json')
if docs_path.exists():
    with open(docs_path, 'r', encoding='utf-8') as f:
        docs = json.load(f)
    
    print(f"\ndocuments_index.json 记录数: {len(docs)}")
    
    # 统计周期分布
    cycles = {}
    archived_count = 0
    for doc_id, doc in docs.items():
        cycle = doc.get('cycle', '无周期') or '无周期'
        if cycle not in cycles:
            cycles[cycle] = {'total': 0, 'archived': 0}
        cycles[cycle]['total'] += 1
        if doc.get('archived'):
            cycles[cycle]['archived'] += 1
            archived_count += 1
    
    print(f"已归档文档: {archived_count}/{len(docs)}")
    print("\n按周期统计:")
    for cycle, counts in sorted(cycles.items()):
        print(f"  {cycle}: {counts['archived']}/{counts['total']} 已归档")
    
    # 查看"3、项目准备"周期
    for cycle, counts in cycles.items():
        if '项目准备' in cycle:
            print(f"\n周期 '{cycle}' 详情:")
            for doc_id, doc in docs.items():
                if doc.get('cycle') == cycle:
                    print(f"  [{'Y' if doc.get('archived') else 'N'}] {doc.get('doc_name', '未知')}")
                    print(f"       文件: {doc.get('original_filename', '未知')}")
