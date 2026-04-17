import sqlite3, json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')


def check_db(project_id, db_path=None):
    """检查数据库中的文档信息
    
    Args:
        project_id: 项目ID
        db_path: 数据库路径（默认: 从项目根目录构建）
    """
    if not db_path:
        # 从项目根目录构建数据库路径
        script_dir = Path(__file__).parent.parent
        db_path = script_dir / 'projects' / 'projects_index.db'
    
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    c = conn.execute("SELECT config_data FROM project_configs WHERE project_id=? AND config_type='documents_index'", (project_id,))
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


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python check_db3.py <project_id>")
        sys.exit(1)
    project_id = sys.argv[1]
    check_db(project_id)
