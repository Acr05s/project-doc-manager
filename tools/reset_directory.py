"""
重置所有文档的 directory 字段为 /
用于清理历史数据，重新归档后会按新逻辑保存正确目录信息
"""
import sqlite3
import os
import sys

DRY_RUN = '--dry-run' in sys.argv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS_DIR = os.path.join(BASE_DIR, 'projects')

total_reset = 0
total_skipped = 0

for project_name in os.listdir(PROJECTS_DIR):
    db_path = os.path.join(PROJECTS_DIR, project_name, 'data', 'db', 'documents.db')
    if not os.path.exists(db_path):
        continue

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 查询当前不是 / 的文档
    cursor.execute("SELECT doc_id, directory FROM documents WHERE directory != '/' AND directory IS NOT NULL AND directory != ''")
    rows = cursor.fetchall()

    if not rows:
        conn.close()
        continue

    print(f"\n项目: {project_name}  需重置: {len(rows)} 个")
    for doc_id, directory in rows[:5]:
        print(f"  {doc_id[:30]}: {directory[:60]}")
    if len(rows) > 5:
        print(f"  ... 还有 {len(rows)-5} 个")

    if not DRY_RUN:
        cursor.execute("UPDATE documents SET directory = '/' WHERE directory != '/' AND directory IS NOT NULL AND directory != ''")
        conn.commit()
        print(f"  [OK] 已重置 {cursor.rowcount} 个")
        total_reset += cursor.rowcount
    else:
        total_skipped += len(rows)

    conn.close()

print()
if DRY_RUN:
    print(f"[dry-run] 共有 {total_skipped} 个文档需重置，加 --apply 参数执行")
else:
    print(f"[OK] 共重置 {total_reset} 个文档的 directory 为 /")
