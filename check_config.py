import os, json, sys
sys.stdout.reconfigure(encoding='utf-8')

for root, dirs, files in os.walk('projects'):
    if '网络能力建设' in root:
        for f in files:
            if f.endswith('.json') and 'config' in f.lower():
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8') as fh:
                    data = json.load(fh)
                cycles = list(data.get('documents', {}).keys())
                print(f'{path}: cycles={cycles[:5]}')
                for cycle in cycles:
                    docs = data['documents'][cycle]
                    req = docs.get('required_docs', [])
                    if req:
                        names = [r.get('name') for r in req[:5]]
                        print(f'  {cycle}: required_docs names={names}')
                    uploaded = docs.get('uploaded_docs', [])
                    if uploaded:
                        print(f'  {cycle}: uploaded_docs count={len(uploaded)}')
                        for u in uploaded[:3]:
                            print(f'    doc_name={u.get("doc_name")}, directory={u.get("directory")}, filename={u.get("filename")}')
                break
        break
