print("开始测试项目创建...")

# 测试基础模块导入
print("测试基础模块导入...")
try:
    from app.utils.base import get_config
    from app.utils.project_manager import ProjectManager
    from app.utils.folder_manager import FolderManager
    print("导入模块成功")
    
    # 测试配置初始化
    print("测试配置初始化...")
    config = get_config()
    print("配置初始化成功")
    
    # 打印projects_base_folder路径
    print("测试projects_base_folder属性...")
    projects_base_folder = config.projects_base_folder
    print(f"projects_base_folder: {projects_base_folder}")
    print(f"projects_base_folder.exists(): {projects_base_folder.exists()}")
    
    # 测试创建项目文件夹结构
    print("测试创建项目文件夹结构...")
    folder_manager = FolderManager(config)
    project_name = "测试项目"
    structure = folder_manager.create_project_structure(project_name)
    print(f"创建项目结构成功: {structure}")
    
    # 测试项目管理器
    print("测试项目管理器...")
    project_manager = ProjectManager(config, folder_manager)
    result = project_manager.create("测试项目")
    print(f"创建项目成功: {result}")
    
    print("测试成功！")
except Exception as e:
    print(f"测试失败: {e}")
    import traceback
    traceback.print_exc()
