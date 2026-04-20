import sqlite3, json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')


def check_uploaded(project_id, db_path=None):
    """检查已上传的文档信息
    
    Args:
        project_id: 项目ID
        db_path: 数据库路径（默认: 从项目根目录构建）
    """
    if not db_path:
        # 从项目根目录构建数据库路径
        script_dir = Path(__file__).parent.parent.parent
        db_path = script_dir / 'projects' / 'projects_index.db'
    
    try:
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.execute("SELECT config_data FROM project_configs WHERE project_id=? AND config_type='project_config'", (project_id,))
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
    except FileNotFoundError:
        print(f"数据库文件不存在: {db_path}")
    except sqlite3.Error as e:
        print(f"数据库错误: {e}")
    except Exception as e:
        print(f"未知错误: {e}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python check_uploaded.py <project_id>")
        sys.exit(1)
    project_id = sys.argv[1]
    check_uploaded(project_id)
