#!/usr/bin/env python3
"""
测试相对路径功能
"""
import os
import sys
import tempfile
import shutil
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent / 'project_doc_manager'
sys.path.insert(0, str(project_root))

from app.utils.document_manager import DocumentManager

def create_test_zip():
    """创建测试ZIP文件"""
    import zipfile
    
    # 创建临时目录
    temp_dir = tempfile.mkdtemp()
    
    # 创建测试文件
    test_files = [
        '合同/合同1.pdf',
        '发票/发票1.pdf',
        '报告/报告1.pdf'
    ]
    
    for file_path in test_files:
        full_path = Path(temp_dir) / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(f'Test content for {file_path}')
    
    # 创建ZIP文件
    zip_path = Path(temp_dir) / 'test_docs.zip'
    with zipfile.ZipFile(zip_path, 'w') as zf:
        for file_path in test_files:
            full_path = Path(temp_dir) / file_path
            zf.write(full_path, file_path)
    
    return str(zip_path), temp_dir

def test_relative_path():
    """测试相对路径功能"""
    print("开始测试相对路径功能...")
    
    # 初始化文档管理器
    doc_manager = DocumentManager()
    
    # 确保projects目录存在
    projects_dir = project_root / 'projects'
    if not projects_dir.exists():
        projects_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建测试项目
    project_name = "测试项目"
    project_id = f"test_project_{os.getpid()}"
    
    # 检查项目目录是否存在
    project_dir = projects_dir / project_name
    if project_dir.exists():
        shutil.rmtree(project_dir)
    
    # 创建项目目录结构
    project_dir.mkdir(parents=True, exist_ok=True)
    uploads_dir = project_dir / 'uploads'
    uploads_dir.mkdir(exist_ok=True)
    
    # 创建项目配置文件
    project_config = {
        'id': project_id,
        'name': project_name,
        'cycles': ['2024-01'],
        'documents': {
            '2024-01': {
                'required_docs': [
                    {'doc_name': '合同', 'required': True},
                    {'doc_name': '发票', 'required': True},
                    {'doc_name': '报告', 'required': True}
                ]
            }
        }
    }
    
    # 保存项目配置
    config_path = project_dir / 'config.json'
    import json
    config_path.write_text(json.dumps(project_config, ensure_ascii=False, indent=2))
    
    # 加载项目
    doc_manager.load_project(project_id)
    
    # 创建测试ZIP文件
    zip_path, temp_dir = create_test_zip()
    
    try:
        # 解压并匹配ZIP文件
        print(f"解压ZIP文件: {zip_path}")
        result = doc_manager.extract_zipfile(zip_path, project_config)
        print(f"解压结果: {result}")
        
        # 检查ZIP文件是否被删除
        if not Path(zip_path).exists():
            print("✓ ZIP文件已成功删除")
        else:
            print("✗ ZIP文件未被删除")
        
        # 重新加载项目配置
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                updated_config = json.load(f)
        except UnicodeDecodeError:
            # 尝试使用gbk编码
            with open(config_path, 'r', encoding='gbk') as f:
                updated_config = json.load(f)
        
        # 检查文件路径是否为相对路径
        print("\n检查文件路径是否为相对路径:")
        if 'documents' in updated_config:
            for cycle, cycle_info in updated_config['documents'].items():
                if 'uploaded_docs' in cycle_info:
                    for doc in cycle_info['uploaded_docs']:
                        file_path = doc.get('file_path')
                        if file_path:
                            if not Path(file_path).is_absolute():
                                print(f"✓ 文件路径是相对路径: {file_path}")
                            else:
                                print(f"✗ 文件路径是绝对路径: {file_path}")
        
        # 检查项目目录结构
        print("\n检查项目目录结构:")
        if uploads_dir.exists():
            for root, dirs, files in os.walk(uploads_dir):
                level = root.replace(str(uploads_dir), '').count(os.sep)
                indent = ' ' * 2 * level
                print(f"{indent}{os.path.basename(root)}/")
                subindent = ' ' * 2 * (level + 1)
                for file in files:
                    print(f"{subindent}{file}")
        
        # 测试文档预览功能
        print("\n测试文档预览功能:")
        if 'documents' in updated_config:
            for cycle, cycle_info in updated_config['documents'].items():
                if 'uploaded_docs' in cycle_info:
                    for doc in cycle_info['uploaded_docs']:
                        doc_id = doc.get('doc_id')
                        if doc_id:
                            try:
                                preview = doc_manager.get_document_preview(doc_id)
                                print(f"✓ 文档预览成功: {doc_id}")
                            except Exception as e:
                                print(f"✗ 文档预览失败: {doc_id}, 错误: {e}")
        
        # 测试文档包导出功能
        print("\n测试文档包导出功能:")
        try:
            result = doc_manager.export_documents_package(project_name)
            if result.get('status') == 'success':
                export_path = result.get('path')
                if export_path and Path(export_path).exists():
                    print(f"✓ 文档包导出成功: {export_path}")
                    # 删除测试导出文件
                    Path(export_path).unlink()
                else:
                    print("✗ 文档包导出失败: 路径不存在")
            else:
                print(f"✗ 文档包导出失败: {result.get('message')}")
        except Exception as e:
            print(f"✗ 文档包导出失败: {e}")
            
    finally:
        # 清理临时文件
        if temp_dir and Path(temp_dir).exists():
            shutil.rmtree(temp_dir)
        
        # 清理测试项目
        if project_dir.exists():
            shutil.rmtree(project_dir)
    
    print("\n测试完成!")

if __name__ == "__main__":
    test_relative_path()
