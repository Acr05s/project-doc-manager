import sys
sys.path.insert(0, '.')
from app.models.user import user_manager
import sqlite3
conn = sqlite3.connect(str(user_manager.db_path))
cursor = conn.cursor()
cursor.execute("SELECT name FROM organizations")
print("Organizations:")
for r in cursor.fetchall():
    print(" ", r[0])
conn.close()
