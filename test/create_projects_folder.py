import os
import shutil

# 平台根目录
root_dir = 'd:\\workspace\\Doc'
print(f"Platform root directory: {root_dir}")

# 创建projects目录
projects_dir = os.path.join(root_dir, 'projects')
print(f"Creating projects directory: {projects_dir}")
if not os.path.exists(projects_dir):
    try:
        os.makedirs(projects_dir)
        print(f"✓ Successfully created projects directory: {projects_dir}")
    except Exception as e:
        print(f"✗ Failed to create projects directory: {e}")
else:
    print(f"✓ Projects directory already exists: {projects_dir}")

# 复制uploads/projects中的文件到projects目录
uploads_projects_dir = os.path.join(root_dir, 'uploads', 'projects')
print(f"Source directory: {uploads_projects_dir}")
print(f"Destination directory: {projects_dir}")

if os.path.exists(uploads_projects_dir):
    print("Copying files...")
    try:
        for file in os.listdir(uploads_projects_dir):
            src = os.path.join(uploads_projects_dir, file)
            dst = os.path.join(projects_dir, file)
            print(f"Copying: {file}")
            if os.path.isfile(src):
                shutil.copy2(src, dst)
                print(f"✓ Copied file: {file}")
            elif os.path.isdir(src):
                if not os.path.exists(dst):
                    os.makedirs(dst)
                shutil.copytree(src, dst, dirs_exist_ok=True)
                print(f"✓ Copied directory: {file}")
        print("✓ All files copied successfully")
    except Exception as e:
        print(f"✗ Failed to copy files: {e}")
else:
    print(f"✗ Uploads/projects directory does not exist: {uploads_projects_dir}")

# 检查projects目录的内容
print(f"\nContents of {projects_dir}:")
try:
    if os.path.exists(projects_dir):
        files = os.listdir(projects_dir)
        if files:
            for file in files:
                print(f"  - {file}")
        else:
            print("  (empty)")
    else:
        print(f"✗ Projects directory does not exist: {projects_dir}")
except Exception as e:
    print(f"✗ Failed to list directory contents: {e}")

print("\nOperation completed.")
