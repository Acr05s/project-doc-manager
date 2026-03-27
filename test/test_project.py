from app.utils.document_manager import get_manager
from app.utils.folder_manager import FolderManager
from app.utils.base import DocumentConfig

# 初始化配置和文件夹管理器
config = DocumentConfig()
folders = FolderManager(config)

print('Projects base folder:', folders.projects_folder)

# 创建测试项目
print('Creating test project...')
manager = get_manager()
result = manager.create_project('智慧党建', '测试项目')
print('Project creation result:', result)

# 加载项目并检查目录结构
project_id = result.get('project_id')
if project_id:
    project = manager.load_project(project_id)
    print('Project loaded:', project)
    print('Project name:', project.get('name'))
    
    # 检查文档文件夹
    docs_folder = folders.get_documents_folder('智慧党建')
    print('Documents folder:', docs_folder)
    print('Documents folder exists:', docs_folder.exists())
    
    # 检查项目目录结构
    project_folder = folders.get_project_folder('智慧党建')
    print('Project folder:', project_folder)
    print('Project folder exists:', project_folder.exists())
    
    # 列出项目目录内容
    import os
    print('Project folder contents:', os.listdir(project_folder))
