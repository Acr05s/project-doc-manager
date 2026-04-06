# -*- coding: utf-8 -*-
import sqlite3, json, os

conn = sqlite3.connect('projects/projects_index.db')
conn.row_factory = sqlite3.Row

row = conn.execute(
    "SELECT config_data FROM project_configs WHERE project_id='project_20260330095139_71049089' AND config_type='documents_index'"
).fetchone()
conn.close()

data = json.loads(row['config_data'])
docs = data.get('documents', {})

# Categorize
has_file_name = []
no_file_name = []
has_wrong_path = []

for doc_id, doc in docs.items():
    fn = doc.get('file_name')
    fp = doc.get('file_path', '')
    if fn is None:
        no_file_name.append((doc_id, doc))
    else:
        has_file_name.append((doc_id, doc))

    if fp and ('\\\\' in fp or not fp.startswith('uploads/')):
        has_wrong_path.append((doc_id, doc))

print(f"Total docs: {len(docs)}")
print(f"Has file_name: {len(has_file_name)}")
print(f"No file_name: {len(no_file_name)}")
print(f"Has wrong path: {len(has_wrong_path)}")

print(f"\n=== Records WITHOUT file_name ({len(no_file_name)}) ===")
for doc_id, doc in no_file_name:
    fp = doc.get('file_path', '')
    print(f"  {doc_id}")
    print(f"    doc_name: {doc.get('doc_name')}")
    print(f"    file_path: {fp}")
    print(f"    file_exists: {os.path.exists(f'D:/workspace/Doc/project_doc_manager/{fp}') if fp else False}")

print(f"\n=== Records WITH wrong path format ===")
for doc_id, doc in has_wrong_path[:10]:
    fp = doc.get('file_path', '')
    print(f"  {doc_id}")
    print(f"    file_path: {fp}")

# Now compare with documents.db
print(f"\n=== Comparison: documents_index vs documents.db ===")
project_db = 'projects/人力资源市场平台项目/data/db/documents.db'
if os.path.exists(project_db):
    conn2 = sqlite3.connect(project_db)
    conn2.row_factory = sqlite3.Row
    cols = conn2.execute("PRAGMA table_info(documents)").fetchall()
    col_names = [c['name'] for c in cols]
    db_docs = conn2.execute("SELECT * FROM documents").fetchall()
    conn2.close()

    db_map = {}
    for d in db_docs:
        rd = dict(zip(col_names, d))
        db_map[rd['doc_id']] = rd

    print(f"documents_index count: {len(docs)}")
    print(f"documents.db count: {len(db_map)}")

    # Find mismatched doc_ids
    idx_ids = set(docs.keys())
    db_ids = set(db_map.keys())
    only_in_idx = idx_ids - db_ids
    only_in_db = db_ids - idx_ids

    print(f"\n  Only in documents_index: {len(only_in_idx)}")
    for id_ in sorted(only_in_idx)[:5]:
        print(f"    {id_}")
        print(f"      doc_name: {docs[id_].get('doc_name')}")
        print(f"      file_name: {docs[id_].get('file_name')}")
        print(f"      file_path: {docs[id_].get('file_path')}")

    print(f"\n  Only in documents.db: {len(only_in_db)}")
    for id_ in sorted(only_in_db)[:5]:
        print(f"    {id_}")
        print(f"      doc_name: {db_map[id_].get('doc_name')}")
        print(f"      file_name: {db_map[id_].get('file_name')}")
        print(f"      file_path: {db_map[id_].get('file_path')}")
else:
    print(f"documents.db not found!")
