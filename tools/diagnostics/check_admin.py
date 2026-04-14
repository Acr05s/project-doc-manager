#!/usr/bin/env python3
"""
管理员密码重置脚本

注意：此脚本仅用于测试环境，生产环境请勿使用！
硬编码的密码 'admin123' 仅用于测试目的。
"""

import sys
import os
from werkzeug.security import generate_password_hash
from app.models.user import user_manager
import sqlite3

# 从环境变量获取密码，默认为 'admin123'（仅用于测试）
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

print("警告：此脚本仅用于测试环境，生产环境请勿使用！")
print(f"正在重置密码为: {'***' if ADMIN_PASSWORD != 'admin123' else ADMIN_PASSWORD}")

conn = sqlite3.connect(str(user_manager.db_path))
cursor = conn.cursor()

try:
    # Set admin password
    new_hash = generate_password_hash(ADMIN_PASSWORD)
    cursor.execute("UPDATE users SET password_hash = ? WHERE username = 'admin'", (new_hash,))
    conn.commit()
    print("已重置 admin 用户密码")
    
    # Also set some test users
    for u in ['test001', 'contractor1', 'pmo_test']:
        cursor.execute("UPDATE users SET password_hash = ? WHERE username = ?", (new_hash, u))
    conn.commit()
    print("已重置测试用户密码")
    
    # 显示用户信息
    cursor.execute("SELECT id, username, role, status, organization FROM users")
    print("\n用户列表:")
    for r in cursor.fetchall():
        print(r)
    
finally:
    conn.close()

print(f"\n密码已重置为: {'***' if ADMIN_PASSWORD != 'admin123' else ADMIN_PASSWORD}")
print("注意：请在测试完成后更改这些密码！")
