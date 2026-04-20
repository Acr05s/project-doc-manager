import sqlite3, json, sys
from pathlib import Path

# 添加项目根目录到路径
script_dir = Path(__file__).parent.parent
sys.path.insert(0, str(script_dir))

from app import create_app
from app.routes.documents.list import list_documents


def debug_list(project_id, cycle=None, doc_name=None):
    """调试文档列表
    
    Args:
        project_id: 项目ID
        cycle: 周期名称（可选）
        doc_name: 文档名称（可选）
    """
    app = create_app()
    
    # 构建请求URL
    url = f'/api/documents/list?project_id={project_id}'
    if cycle:
        url += f'&cycle={cycle}'
    if doc_name:
        url += f'&doc_name={doc_name}'
    
    with app.test_request_context(url):
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


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python debug_list.py <project_id> [cycle] [doc_name]")
        sys.exit(1)
    project_id = sys.argv[1]
    cycle = sys.argv[2] if len(sys.argv) > 2 else None
    doc_name = sys.argv[3] if len(sys.argv) > 3 else None
    debug_list(project_id, cycle, doc_name)
