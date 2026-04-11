import sqlite3, os, json

# Check projects DB
conn = sqlite3.connect('projects/projects_index.db')
c = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
print("Tables:", [r[0] for r in c.fetchall()])
c = conn.execute('PRAGMA table_info(projects)')
print("Projects columns:", [r[1] for r in c.fetchall()])
c = conn.execute("SELECT id, name FROM projects")
projects = c.fetchall()
for pid, pname in projects:
    print(f"Project: {pid} -> {pname}")
conn.close()
