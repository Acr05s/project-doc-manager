from app.utils.document_manager import get_manager
from app.utils.folder_manager import FolderManager
from app.utils.base import DocumentConfig
import zipfile
import os
from pathlib import Path

# 初始化配置和管理器
config = DocumentConfig()
folders = FolderManager(config)
manager = get_manager()

# 确保项目存在
project_name = '智慧党建'
project_id = 'project_20260324201229'

# 创建测试ZIP文件
print('Creating test ZIP file...')
test_files = [
    '项目立项申请书.pdf',
    '项目可行性研究报告.pdf',
    '项目可研评审.pdf'
]

# 创建临时目录
temp_dir = Path('temp_test')
temp_dir.mkdir(exist_ok=True)

# 创建测试文件
for file_name in test_files:
    file_path = temp_dir / file_name
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(f'Test content for {file_name}')

# 创建ZIP文件
zip_path = Path('test_docs.zip')
with zipfile.ZipFile(zip_path, 'w') as zf:
    for file_name in test_files:
        zf.write(temp_dir / file_name, file_name)

print(f'Created test ZIP file: {zip_path}')

# 加载项目配置
print('Loading project...')
project_result = manager.load_project(project_id)
if project_result.get('status') != 'success':
    print('Failed to load project:', project_result)
    exit(1)

project_config = project_result.get('project')
print(f'Loaded project: {project_config.get("name")}')

# 解压并匹配
print('Extracting and matching ZIP file...')
result = manager.extract_zipfile(str(zip_path), project_config)
print('Extraction and matching result:', result)

# 检查项目目录结构
print('Checking project directory structure...')
project_folder = folders.get_project_folder(project_name)
uploads_folder = folders.get_documents_folder(project_name)
print(f'Project folder: {project_folder}')
print(f'Uploads folder: {uploads_folder}')

# 列出uploads目录内容
print('Contents of uploads folder:')
for item in uploads_folder.iterdir():
    print(f'  {item.name}')
    if item.is_dir():
        for subitem in item.iterdir():
            print(f'    {subitem.name}')

# 检查项目配置是否包含matching_result
print('Checking if matching_result is in project config...')
project_result_after = manager.load_project(project_id)
project_config_after = project_result_after.get('project')
if 'matching_result' in project_config_after:
    print('matching_result found in project config:')
    for cycle, docs in project_config_after['matching_result'].items():
        print(f'  Cycle: {cycle}')
        for doc in docs:
            print(f'    {doc}')
else:
    print('matching_result not found in project config')

# 清理临时文件
print('Cleaning up...')
zip_path.unlink(missing_ok=True)
for file_name in test_files:
    (temp_dir / file_name).unlink(missing_ok=True)
temp_dir.rmdir()

print('Test completed!')
