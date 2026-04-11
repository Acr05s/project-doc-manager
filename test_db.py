from app.models.user import user_manager
print('DB path:', user_manager.db_path)
import sqlite3
conn = sqlite3.connect(str(user_manager.db_path))
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
for row in c.fetchall():
    print('Table:', row[0])
c.execute("SELECT id, username, role FROM users")
for row in c.fetchall():
    print('User:', row)
conn.close()
