#!/usr/bin/env python3
"""按关键字搜索项目并统计 directory 分布。"""
import sqlite3
import json
import sys
from collections import Counter

keyword = sys.argv[1] if len(sys.argv) > 1 else '示例'

db = sqlite3.connect('projects/projects_index.db', timeout=10)
db.row_factory = sqlite3.Row

projects = {}
proj_rows = db.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'project_info'").fetchall()
for r in proj_rows:
    info = json.loads(r['config_data'])
    projects[r['project_id']] = info.get('name', r['project_id'])

rows = db.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'documents_index'").fetchall()

for row in rows:
    pname = projects.get(row['project_id'], row['project_id'])
    if keyword not in pname:
        continue
    
    docs = json.loads(row['config_data']).get('documents', {})
    dirs = Counter()
    examples = {}
    
    for doc_id, doc in docs.items():
        d = doc.get('directory', '/')
        dirs[d] += 1
        if d not in examples:
            examples[d] = doc.get('original_filename', doc.get('doc_name', ''))[:60]
    
    print(f"项目: {pname} ({len(docs)} 个文档)\n")
    for d, count in dirs.most_common(30):
        print(f"  [{count:3d}] {d[:80]}")
        if d in examples:
            print(f"        例: {examples[d]}")
    print()

db.close()
