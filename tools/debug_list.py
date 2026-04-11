import sqlite3, json, sys
sys.path.insert(0, 'D:/workspace/Doc/project_doc_manager')

from app import create_app
from app.routes.documents.list import list_documents

app = create_app()

with app.test_request_context('/api/documents/list?project_id=project_20260408151858&cycle=3项目开工&doc_name=项目技术方案'):
    response = list_documents()
    if hasattr(response, 'get_json'):
        result = response.get_json()
    else:
        result = json.loads(response.data)
    
    if result.get('status') == 'success':
        docs = result.get('data', [])
        print(f'Total docs: {len(docs)}')
        for doc in docs[:5]:
            print(f"\nDoc: {doc.get('doc_id', 'N/A')}")
            print(f"  directory: {doc.get('directory')}")
            print(f"  display_directory: {doc.get('display_directory')}")
            print(f"  root_directory: {doc.get('root_directory')}")
    else:
        print(f'Error: {result}')
