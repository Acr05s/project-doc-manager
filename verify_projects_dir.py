import os
from pathlib import Path
from app.utils.base import get_config
from app.utils.project_manager import ProjectManager
from app.utils.folder_manager import FolderManager

# 获取配置实例
config = get_config()

print("=== 验证项目存储目录配置 ===")
print(f"Base directory: {config.base_dir}")
print(f"Projects base folder: {config.projects_base_folder}")
print(f"Upload folder: {config.upload_folder}")
print(f"\nProjects directory exists: {config.projects_base_folder.exists()}")

# 检查目录权限
print(f"\nChecking directory permissions:")
try:
    test_file = config.projects_base_folder / "test.txt"
    test_file.write_text("test")
    test_file.unlink()
    print("✓ Can write to projects directory")
except Exception as e:
    print(f"✗ Cannot write to projects directory: {e}")

# 初始化项目管理器和文件夹管理器
folder_manager = FolderManager(config)
project_manager = ProjectManager(config, folder_manager)

# 列出当前项目
print(f"\n=== Current Projects ===")
projects = project_manager.list_all()
print(f"Total projects: {len(projects)}")
for project in projects:
    print(f"- {project['name']} (ID: {project['id']})")

# 检查项目文件是否存在于新目录
print(f"\n=== Checking Project Files ===")
if projects:
    project_id = projects[0]['id']
    project_name = projects[0]['name']
    
    # 检查项目配置文件
    config_file = config.projects_base_folder / f"{project_id}.json"
    print(f"Project config file exists: {config_file.exists()}")
    
    # 检查项目文件夹
    project_folder = folder_manager.get_project_folder(project_name)
    print(f"Project folder exists: {project_folder.exists()}")
    
    # 检查项目索引文件
    index_file = config.projects_base_folder / "projects_index.json"
    print(f"Projects index file exists: {index_file.exists()}")

print("\n=== 验证完成 ===")
