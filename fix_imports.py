#!/usr/bin/env python3
"""批量修复文档路由模块的导入问题"""

import re
from pathlib import Path

# 需要修改的文件列表
documents_files = [
    'app/routes/documents/preview.py',
    'app/routes/documents/download.py',
    'app/routes/documents/progress.py',
    'app/routes/documents/delete.py',
    'app/routes/documents/update.py',
    'app/routes/documents/recognize.py',
    'app/routes/documents/category.py',
    'app/routes/documents/files.py',
    'app/routes/documents/zip.py',
]

def fix_file(filepath):
    """修复单个文件的导入"""
    path = Path(filepath)
    if not path.exists():
        print(f"文件不存在: {filepath}")
        return
    
    content = path.read_text(encoding='utf-8')
    
    # 1. 修改导入语句
    content = re.sub(
        r'from \.utils import doc_manager',
        'from .utils import get_doc_manager',
        content
    )
    
    # 2. 在函数开头添加 doc_manager = get_doc_manager()
    # 匹配 try: 后面的内容，在 try: 后添加 doc_manager = get_doc_manager()
    content = re.sub(
        r'(def \w+\([^)]*\):\s*\n\s*)try:(\s*\n)',
        r'\1try:\2        doc_manager = get_doc_manager()\2',
        content
    )
    
    path.write_text(content, encoding='utf-8')
    print(f"已修复: {filepath}")

if __name__ == '__main__':
    base_dir = Path('d:/workspace/Doc/project_doc_manager')
    for filepath in documents_files:
        fix_file(base_dir / filepath)
    print("完成!")
