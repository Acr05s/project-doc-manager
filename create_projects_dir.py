import os
import shutil

# 创建projects目录
projects_dir = 'projects'
if not os.path.exists(projects_dir):
    os.makedirs(projects_dir)
    print(f"Created projects directory: {projects_dir}")
else:
    print(f"Projects directory already exists: {projects_dir}")

# 复制uploads/projects中的文件到projects目录
uploads_projects_dir = 'uploads/projects'
if os.path.exists(uploads_projects_dir):
    print(f"Copying files from {uploads_projects_dir} to {projects_dir}...")
    for file in os.listdir(uploads_projects_dir):
        src = os.path.join(uploads_projects_dir, file)
        dst = os.path.join(projects_dir, file)
        if os.path.isfile(src):
            shutil.copy2(src, dst)
            print(f"Copied file: {file}")
        elif os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
            print(f"Copied directory: {file}")
else:
    print(f"Uploads/projects directory does not exist: {uploads_projects_dir}")

# 检查projects目录的内容
print(f"\nContents of {projects_dir}:")
if os.path.exists(projects_dir):
    for file in os.listdir(projects_dir):
        print(f"  - {file}")
else:
    print(f"Projects directory does not exist: {projects_dir}")
