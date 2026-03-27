import os
import pathlib

# 检查 uploads/projects 目录
uploads_projects_dir = pathlib.Path("d:\workspace\Doc\project_doc_manager\uploads\projects")
print(f"Uploads/Projects 目录路径: {uploads_projects_dir}")
print(f"Uploads/Projects 目录是否存在: {uploads_projects_dir.exists()}")

# 如果目录存在，列出其内容
if uploads_projects_dir.exists():
    print("\nUploads/Projects 目录内容:")
    try:
        for item in sorted(uploads_projects_dir.iterdir()):
            if item.is_dir():
                print(f"📁 {item.name}/")
            else:
                print(f"📄 {item.name}")
    except Exception as e:
        print(f"无法访问 uploads/projects 目录: {e}")

# 检查 uploads 目录
uploads_dir = pathlib.Path("d:\workspace\Doc\project_doc_manager\uploads")
print(f"\nUploads 目录是否存在: {uploads_dir.exists()}")
if uploads_dir.exists():
    print("Uploads 目录内容:")
    try:
        for item in sorted(uploads_dir.iterdir()):
            if item.is_dir():
                print(f"📁 {item.name}/")
            else:
                print(f"📄 {item.name}")
    except Exception as e:
        print(f"无法访问 uploads 目录: {e}")
