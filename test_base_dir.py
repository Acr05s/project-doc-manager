from app.utils.base import get_base_dir, DocumentConfig

print("Testing get_base_dir():")
base_dir = get_base_dir()
print(f"Base directory: {base_dir}")
print(f"Base directory exists: {base_dir.exists()}")

print("\nTesting DocumentConfig:")
config = DocumentConfig()
print(f"Config base_dir: {config.base_dir}")
print(f"Projects base folder: {config.projects_base_folder}")
print(f"Upload folder: {config.upload_folder}")

print("\nTesting projects directory:")
projects_dir = config.projects_base_folder
print(f"Projects directory: {projects_dir}")
print(f"Projects directory exists: {projects_dir.exists()}")

print("\nListing projects:")
if projects_dir.exists():
    for item in projects_dir.iterdir():
        if item.is_dir():
            print(f"  - {item.name}")
