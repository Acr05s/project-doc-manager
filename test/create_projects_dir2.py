import os
import pathlib

# 直接使用绝对路径
projects_dir = pathlib.Path("d:\workspace\Doc\project_doc_manager\projects")
print(f"Creating projects directory at: {projects_dir}")

# 确保目录存在
projects_dir.mkdir(parents=True, exist_ok=True)

# 验证目录是否创建成功
if projects_dir.exists():
    print("Projects directory created successfully!")
    # 创建一个测试文件来验证权限
    test_file = projects_dir / "test.txt"
    try:
        test_file.write_text("Test file")
        print("Successfully created test file in projects directory")
        print(f"Test file path: {test_file}")
    except Exception as e:
        print(f"Failed to create test file: {e}")
else:
    print("Failed to create projects directory!")

# 打印当前目录结构
print("\nCurrent directory structure:")
try:
    for item in pathlib.Path("d:\workspace\Doc\project_doc_manager").iterdir():
        if item.is_dir():
            print(f"- {item.name}/")
        else:
            print(f"- {item.name}")
except Exception as e:
    print(f"Error listing directory: {e}")
