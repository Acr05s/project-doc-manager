"""测试配置版本管理功能"""
import sys
import json

sys.path.insert(0, '.')
from app.utils.document_manager import DocumentManager

# 创建文档管理器
dm = DocumentManager({'base_dir': '.'})

# 获取第一个项目ID
projects = dm.get_projects_list()
if not projects:
    print('没有可用的项目')
    sys.exit(1)

project_id = projects[0]['id']
print(f'测试项目ID: {project_id}')

# 列出当前版本
print('\n=== 列出当前版本 ===')
result = dm.list_versions(project_id)
print(json.dumps(result, ensure_ascii=False, indent=2))

# 保存新版本
print('\n=== 保存新版本 ===')
result = dm.save_version(project_id, '测试版本v1', '这是一个测试版本')
print(json.dumps(result, ensure_ascii=False, indent=2))

# 再次列出版本
print('\n=== 再次列出版本 ===')
result = dm.list_versions(project_id)
print(f'版本数量: {len(result.get("versions", []))}')
for v in result.get('versions', []):
    print(f'  - {v["version_name"]} ({v["filename"]})')

print('\n测试完成！')
