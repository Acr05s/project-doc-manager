import os

print("Current working directory:", os.getcwd())
print("\nChecking projects directory:")
if os.path.exists('projects'):
    print("projects directory exists")
    files = os.listdir('projects')
    print(f"Files in projects: {files}")
else:
    print("projects directory does not exist")

print("\nChecking uploads/projects directory:")
if os.path.exists('uploads/projects'):
    print("uploads/projects directory exists")
    files = os.listdir('uploads/projects')
    print(f"Files in uploads/projects: {files}")
else:
    print("uploads/projects directory does not exist")
