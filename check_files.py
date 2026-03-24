import os

# 检查文件是否存在
def check_file(path):
    if os.path.exists(path):
        print(f"✓ {path} exists")
    else:
        print(f"✗ {path} does not exist")

# 检查目录内容
def list_directory(path):
    if os.path.exists(path):
        print(f"\nContents of {path}:")
        try:
            for item in os.listdir(path):
                print(f"  - {item}")
        except Exception as e:
            print(f"  Error: {e}")
    else:
        print(f"\n{path} does not exist")

# 检查关键文件和目录
print("Checking key files and directories:")
check_file("./projects")
check_file("./uploads")
check_file("./uploads/projects")
check_file("./uploads/projects/project_20260321080707.json")

# 列出目录内容
list_directory(".")
list_directory("./uploads")
list_directory("./uploads/projects")
