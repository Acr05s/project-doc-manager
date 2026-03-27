from pathlib import Path

print("Current working directory:", Path.cwd())

projects_dir = Path('projects')
print("\nProjects directory:")
print(f"Exists: {projects_dir.exists()}")
if projects_dir.exists():
    print(f"Is directory: {projects_dir.is_dir()}")
    print("Files and directories:")
    for item in projects_dir.iterdir():
        print(f"  {item.name} {'(dir)' if item.is_dir() else ''}")

uploads_projects_dir = Path('uploads') / 'projects'
print("\nUploads/projects directory:")
print(f"Exists: {uploads_projects_dir.exists()}")
if uploads_projects_dir.exists():
    print(f"Is directory: {uploads_projects_dir.is_dir()}")
    print("Files and directories:")
    for item in uploads_projects_dir.iterdir():
        print(f"  {item.name} {'(dir)' if item.is_dir() else ''}")
