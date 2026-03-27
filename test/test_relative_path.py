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
    '测试文档1.pdf',
    '测试文档2.pdf'
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

# 检查项目配置中的文件路径是否为相对路径
print('Checking file paths in project config...')
project_result_after = manager.load_project(project_id)
project_config_after = project_result_after.get('project')

if 'documents' in project_config_after:
    for cycle, cycle_info in project_config_after['documents'].items():
        if 'uploaded_docs' in cycle_info:
            for doc in cycle_info['uploaded_docs']:
                file_path = doc.get('file_path')
                print(f'File path: {file_path}')
                print(f'Is absolute: {Path(file_path).is_absolute()}')

# 测试文档预览
print('Testing document preview...')
if 'documents' in project_config_after:
    for cycle, cycle_info in project_config_after['documents'].items():
        if 'uploaded_docs' in cycle_info:
            for doc in cycle_info['uploaded_docs']:
                doc_id = doc.get('doc_id')
                if doc_id:
                    preview_result = manager.get_document_preview(doc_id)
                    print(f'Preview result for {doc_id}: {preview_result.get("status")}')

# 测试导出文档包
print('Testing document package export...')
export_result = manager.export_documents_package(project_name)
print('Export result:', export_result)

# 清理临时文件
print('Cleaning up...')
zip_path.unlink(missing_ok=True)
for file_name in test_files:
    (temp_dir / file_name).unlink(missing_ok=True)
temp_dir.rmdir()

print('Test completed!')
