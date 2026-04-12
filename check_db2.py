import sys
sys.path.insert(0, '.')
from app.models.user import user_manager
print("DB path:", user_manager.db_path)
import sqlite3
conn = sqlite3.connect(str(user_manager.db_path))
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(users)")
print("Users columns:")
for r in cursor.fetchall():
    print(" ", r)
conn.close()
