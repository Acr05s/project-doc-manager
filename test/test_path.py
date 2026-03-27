import os
from pathlib import Path

# 模拟项目根目录
base_dir = Path('d:\\workspace\\Doc\\project_doc_manager')

# 模拟项目名称
project_name = '智能党建项目'

# 模拟相对文件路径
relative_path = '20260324213300_大唐智慧党建平台项目验收文档3.20_20260324213324\\大唐智慧党建平台项目验收文档3.20\\7、系统开发测试\\DT-DJ-2023-07-019-V1.0 中国大唐集团有限公司智慧党建管理平台项目程序员开发手册.docx'

# 计算项目上传目录
projects_base_folder = base_dir / 'projects'
project_folder = projects_base_folder / project_name
project_uploads_dir = project_folder / 'uploads'

# 计算完整路径
full_path = project_uploads_dir / relative_path

# 打印结果
print(f"项目根目录: {base_dir}")
print(f"项目上传目录: {project_uploads_dir}")
print(f"相对路径: {relative_path}")
print(f"完整路径: {full_path}")
print(f"文件是否存在: {full_path.exists()}")
