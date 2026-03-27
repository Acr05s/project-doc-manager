import os
import pathlib

# 检查projects目录是否存在
projects_dir = pathlib.Path("./projects")
print(f"Projects directory exists: {projects_dir.exists()}")
print(f"Projects directory path: {projects_dir.absolute()}")

# 尝试在projects目录中创建一个文件
if projects_dir.exists():
    test_file = projects_dir / "test.txt"
    try:
        test_file.write_text("Test file")
        print(f"Created test file: {test_file}")
        print(f"Test file content: {test_file.read_text()}")
        test_file.unlink()
        print("Deleted test file")
    except Exception as e:
        print(f"Error creating test file: {e}")
else:
    print("Projects directory does not exist")
