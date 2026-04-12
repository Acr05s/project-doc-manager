import sqlite3
conn = sqlite3.connect('users.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("Tables:")
for r in cursor.fetchall():
    print(" ", r[0])

cursor.execute("SELECT * FROM migration_versions")
print("\nMigrations:")
for r in cursor.fetchall():
    print(" ", r)

conn.close()
