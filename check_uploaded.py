import sqlite3, json, sys
sys.stdout.reconfigure(encoding='utf-8')

pid = 'project_20260408151858'
conn = sqlite3.connect('projects/projects_index.db')
conn.row_factory = sqlite3.Row
c = conn.execute("SELECT config_data FROM project_configs WHERE project_id=? AND config_type='project_config'", (pid,))
r = c.fetchone()
if r:
    data = json.loads(r['config_data'])
    documents = data.get('documents', {})
    for cycle in sorted(documents.keys()):
        if '开工' in cycle:
            print(f"Cycle: {cycle}")
            cycle_data = documents[cycle]
            uploaded = cycle_data.get('uploaded_docs', [])
            print(f"  uploaded_docs count: {len(uploaded)}")
            for u in uploaded[:10]:
                print(f"    doc_name={u.get('doc_name')}, directory={u.get('directory')}, root_dir={u.get('root_directory')}, filename={u.get('filename')}")
            break
else:
    print('No project_config found')
conn.close()
