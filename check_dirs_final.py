import os

# 检查目录结构
def check_directory(path, name):
    result = f"{name} directory: {path}\n"
    if os.path.exists(path):
        result += f"Exists: True\n"
        if os.path.isdir(path):
            result += f"Is directory: True\n"
            files = os.listdir(path)
            result += f"Files: {files}\n"
        else:
            result += f"Is directory: False\n"
    else:
        result += f"Exists: False\n"
    return result

# 检查项目根目录
base_dir = os.getcwd()
projects_dir = os.path.join(base_dir, 'projects')
uploads_projects_dir = os.path.join(base_dir, 'uploads', 'projects')

# 生成检查结果
result = "=== Directory Structure Check ===\n"
result += f"Base directory: {base_dir}\n\n"
result += check_directory(projects_dir, "Projects")
result += "\n"
result += check_directory(uploads_projects_dir, "Uploads/Projects")

# 写入文件
with open('directory_check_final.txt', 'w', encoding='utf-8') as f:
    f.write(result)

print("Directory check written to directory_check_final.txt")
