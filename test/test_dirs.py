import os

print("Current directory:", os.getcwd())
print("\nChecking projects directory:")
print("Exists:", os.path.exists('projects'))
if os.path.exists('projects'):
    print("Is directory:", os.path.isdir('projects'))
    print("Files:", os.listdir('projects'))

print("\nChecking uploads/projects directory:")
print("Exists:", os.path.exists('uploads/projects'))
if os.path.exists('uploads/projects'):
    print("Is directory:", os.path.isdir('uploads/projects'))
    print("Files:", os.listdir('uploads/projects'))
