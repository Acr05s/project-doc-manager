print("开始测试...")

# 测试基础模块导入
print("测试基础模块导入...")
try:
    from app.utils.base import get_config
    print("导入get_config成功")
    
    # 测试配置初始化
    print("测试配置初始化...")
    config = get_config()
    print("配置初始化成功")
    
    # 测试projects_base_folder属性
    print("测试projects_base_folder属性...")
    projects_base_folder = config.projects_base_folder
    print(f"projects_base_folder: {projects_base_folder}")
    print(f"projects_base_folder.exists(): {projects_base_folder.exists()}")
    
    print("测试成功！")
except Exception as e:
    print(f"测试失败: {e}")
    import traceback
    traceback.print_exc()
