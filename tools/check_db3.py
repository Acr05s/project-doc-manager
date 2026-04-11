import sqlite3, json, sys
sys.stdout.reconfigure(encoding='utf-8')

pid = 'project_20260408151858'
conn = sqlite3.connect('projects/projects_index.db')
conn.row_factory = sqlite3.Row
c = conn.execute("SELECT config_data FROM project_configs WHERE project_id=? AND config_type='documents_index'", (pid,))
r = c.fetchone()
if r:
    data = json.loads(r['config_data'])
    docs = data.get('documents', {})
    for cycle in sorted(set(d.get('cycle') for d in docs.values() if d.get('cycle'))):
        if '开工' in cycle or '技术' in cycle or '项目' in cycle:
            print(f"Cycle: {cycle}")
            cycle_docs = [d for d in docs.values() if d.get('cycle') == cycle]
            for d in cycle_docs[:10]:
                print(f"  {d.get('doc_name')} | dir={d.get('directory')} | display={d.get('display_directory')} | root={d.get('root_directory')}")
conn.close()
