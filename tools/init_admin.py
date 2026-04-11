"""初始化系统管理员用户"""

import sys
import os
from werkzeug.security import generate_password_hash

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.user import user_manager

def create_admin_user():
    """创建系统管理员用户"""
    print("开始创建系统管理员用户...")
    
    # 检查是否已有管理员用户
    admin_user = user_manager.get_user_by_username('admin')
    if admin_user:
        print("系统管理员用户已存在，跳过创建")
        return
    
    # 创建管理员用户
    username = 'admin'
    password = 'admin123'
    role = 'admin'
    
    # 生成密码哈希
    password_hash = generate_password_hash(password)
    
    # 添加用户
    user_id = user_manager.add_user(username, password_hash, role)
    if user_id:
        print(f"系统管理员用户创建成功！")
        print(f"用户名: {username}")
        print(f"密码: {password}")
        print(f"角色: {role}")
    else:
        print("系统管理员用户创建失败")

if __name__ == '__main__':
    create_admin_user()
