import os

with open('directory_check.txt', 'w', encoding='utf-8') as f:
    f.write("Current working directory: " + os.getcwd() + '\n\n')
    
    f.write("Checking projects directory:\n")
    if os.path.exists('projects'):
        f.write("projects directory exists\n")
        files = os.listdir('projects')
        f.write(f"Files in projects: {files}\n")
        # 写入子目录内容
        for item in files:
            item_path = os.path.join('projects', item)
            if os.path.isdir(item_path):
                f.write(f"  Directory: {item}\n")
                subfiles = os.listdir(item_path)
                f.write(f"  Files: {subfiles[:5]}..." if len(subfiles) > 5 else f"  Files: {subfiles}\n")
    else:
        f.write("projects directory does not exist\n")
    
    f.write("\nChecking uploads/projects directory:\n")
    if os.path.exists('uploads/projects'):
        f.write("uploads/projects directory exists\n")
        files = os.listdir('uploads/projects')
        f.write(f"Files in uploads/projects: {files}\n")
    else:
        f.write("uploads/projects directory does not exist\n")

print("Directory check written to directory_check.txt")
