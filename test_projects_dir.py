from app.utils.base import get_config

# 获取配置实例
config = get_config()

# 打印项目基础文件夹路径
print("Projects base folder:", config.projects_base_folder)
print("Upload folder:", config.upload_folder)
print("Base directory:", config.base_dir)

# 检查目录是否存在
print("\nChecking if projects directory exists:", config.projects_base_folder.exists())

# 列出projects目录中的文件
if config.projects_base_folder.exists():
    print("\nFiles in projects directory:")
    for item in config.projects_base_folder.iterdir():
        print(f"  {item.name} {'(dir)' if item.is_dir() else ''}")
