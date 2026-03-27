import os

# 写入目录结构到文件
with open('dir_structure.txt', 'w', encoding='utf-8') as f:
    f.write('=== Directory Structure ===\n\n')
    
    # 检查根目录
    root_files = os.listdir('.')
    f.write('Root directory:\n')
    for file in sorted(root_files):
        if os.path.isdir(file):
            f.write(f'  [DIR]  {file}\n')
        else:
            f.write(f'  [FILE] {file}\n')
    
    f.write('\n=== Projects directory ===\n')
    projects_dir = 'projects'
    if os.path.exists(projects_dir):
        f.write(f'Projects directory exists: {projects_dir}\n')
        if os.path.isdir(projects_dir):
            files = os.listdir(projects_dir)
            for file in sorted(files):
                file_path = os.path.join(projects_dir, file)
                if os.path.isdir(file_path):
                    f.write(f'  [DIR]  {file}\n')
                else:
                    f.write(f'  [FILE] {file}\n')
        else:
            f.write('Projects is not a directory\n')
    else:
        f.write('Projects directory does not exist\n')
    
    f.write('\n=== Uploads\projects directory ===\n')
    uploads_projects_dir = 'uploads/projects'
    if os.path.exists(uploads_projects_dir):
        f.write(f'Uploads/projects directory exists: {uploads_projects_dir}\n')
        if os.path.isdir(uploads_projects_dir):
            files = os.listdir(uploads_projects_dir)
            for file in sorted(files):
                file_path = os.path.join(uploads_projects_dir, file)
                if os.path.isdir(file_path):
                    f.write(f'  [DIR]  {file}\n')
                else:
                    f.write(f'  [FILE] {file}\n')
        else:
            f.write('Uploads/projects is not a directory\n')
    else:
        f.write('Uploads/projects directory does not exist\n')

print('Directory structure has been written to dir_structure.txt')
