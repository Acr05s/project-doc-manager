import os, json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')


def check_config(project_name=None, base_path=None):
    """检查项目配置文件
    
    Args:
        project_name: 项目名称（可选）
        base_path: 基础路径（默认: 从项目根目录构建）
    """
    if not base_path:
        # 从项目根目录构建绝对路径
        base_path = str(Path(__file__).parent.parent.parent / 'projects')
    
    for root, dirs, files in os.walk(base_path):
        if project_name and project_name not in root:
            continue
        for f in files:
            if f.endswith('.json') and 'config' in f.lower():
                path = os.path.join(root, f)
                try:
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
                except FileNotFoundError:
                    print(f'{path}: 文件不存在')
                except PermissionError:
                    print(f'{path}: 权限错误')
                except json.JSONDecodeError as e:
                    print(f'{path}: JSON格式错误: {e}')
                except Exception as e:
                    print(f'{path}: 未知错误: {e}')
                if project_name:
                    break
        if project_name:
            break


if __name__ == '__main__':
    project_name = None
    if len(sys.argv) > 1:
        project_name = sys.argv[1]
    check_config(project_name)
