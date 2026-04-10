#!/usr/bin/env python3
"""分析 directory 的层级深度分布"""
import sqlite3
import json
from collections import Counter

db = sqlite3.connect('projects/projects_index.db', timeout=10)
db.row_factory = sqlite3.Row

projects = {}
proj_rows = db.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'project_info'").fetchall()
for r in proj_rows:
    info = json.loads(r['config_data'])
    projects[r['project_id']] = info.get('name', r['project_id'])

rows = db.execute("SELECT project_id, config_data FROM project_configs WHERE config_type = 'documents_index'").fetchall()

depth_counts = Counter()
depth_examples = {}

for row in rows:
    pname = projects.get(row['project_id'], row['project_id'])
    docs = json.loads(row['config_data']).get('documents', {})
    
    for doc_id, doc in docs.items():
        d = doc.get('directory', '/')
        if d in ('/', 'NOT_SET', ''):
            depth = 0
        else:
            depth = len(d.split('/'))
        
        depth_counts[depth] += 1
        if depth not in depth_examples:
            depth_examples[depth] = f"[{pname}] {d}"

print("directory 层级分布:")
for depth in sorted(depth_counts.keys()):
    print(f"  {depth} 级: {depth_counts[depth]} 个  例: {depth_examples[depth]}")

db.close()
