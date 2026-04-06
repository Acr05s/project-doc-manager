# -*- coding: utf-8 -*-
import sqlite3, os

db_path = 'd:/workspace/Doc/project_doc_manager/projects/人力资源市场平台项目/data/db/documents.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

docs = conn.execute(
    "SELECT doc_id, file_path FROM documents WHERE file_path LIKE '%10.%' ORDER BY doc_id"
).fetchall()
conn.close()

print('documents.db records for 10.x files:')
for d in docs:
    fp = d['file_path']
    # Try both base paths
    fp_root = fp.replace('/', os.sep)
    fp_proj = ('projects/人力资源市场平台项目/' + fp).replace('/', os.sep)
    full_root = os.path.join('d:', 'workspace', 'Doc', 'project_doc_manager', fp_root)
    full_proj = os.path.join('d:', 'workspace', 'Doc', 'project_doc_manager', fp_proj)
    exists_root = os.path.exists(full_root)
    exists_proj = os.path.exists(full_proj)
    marker = 'OK' if exists_proj else 'MISSING'
    print(f'  [{marker}] doc_id: {d["doc_id"]}')
    print(f'         db_path: {fp}')
    print(f'         at_root: {exists_root}, at_proj: {exists_proj}')
