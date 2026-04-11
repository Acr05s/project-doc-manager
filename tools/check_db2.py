import sqlite3, json, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('projects/projects_index.db')
conn.row_factory = sqlite3.Row
c = conn.execute("SELECT id, name FROM projects WHERE deleted=0")
for row in c.fetchall():
    pid = row['id']
    pname = row['name']
    # Load config
    c2 = conn.execute("SELECT config_data FROM project_configs WHERE project_id=? AND config_type='documents_index'", (pid,))
    r2 = c2.fetchone()
    if r2:
        try:
            data = json.loads(r2['config_data'])
            docs = data.get('documents', {})
            cycles = sorted(set(d.get('cycle') for d in docs.values() if d.get('cycle')))
            print(f"Project: {pname} ({pid})")
            for cycle in cycles:
                print(f"  Cycle: {cycle}")
                for doc_id, d in list(docs.items())[:5]:
                    if d.get('cycle') == cycle:
                        print(f"    {d.get('doc_name')} | dir={d.get('directory')} | display={d.get('display_directory')} | root={d.get('root_directory')}")
                break
        except Exception as e:
            print(f"  Error: {e}")
conn.close()
