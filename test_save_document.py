#!/usr/bin/env python3
"""
测试文档保存功能

验证文档更新后是否正确保存到JSON文件中
"""

import json
import os
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.utils.document_manager import get_manager
from app.utils.base import get_config


def test_document_save():
    """测试文档保存功能"""
    print("=== 测试文档保存功能 ===")
    
    # 初始化文档管理器
    config = get_config()
    manager = get_manager(config)
    
    # 获取测试项目
    projects = manager.get_projects_list()
    if not projects:
        print("❌ 没有找到项目，请先创建一个测试项目")
        return False
    
    test_project = projects[0]
    project_id = test_project['id']
    project_name = test_project['name']
    print(f"使用测试项目: {project_name} (ID: {project_id})")
    
    # 加载项目配置
    project_result = manager.load_project(project_id)
    if project_result.get('status') != 'success':
        print(f"❌ 加载项目失败: {project_result.get('message')}")
        return False
    
    project_config = project_result.get('project')
    
    # 检查是否有上传的文档
    documents = manager.get_documents(project_id=project_id)
    if not documents:
        print("❌ 项目中没有上传的文档，请先上传一个测试文档")
        return False
    
    test_doc = documents[0]
    doc_id = test_doc.get('doc_id') or test_doc.get('id')
    print(f"使用测试文档: {test_doc.get('doc_name')} (ID: {doc_id})")
    
    # 1. 测试单个文档更新
    print("\n1. 测试单个文档更新...")
    
    # 准备更新数据
    update_data = {
        'note': '测试更新',
        'signer': '测试签名人',
        'doc_date': '2026-03-25'
    }
    
    # 执行更新
    update_result = manager.update_document(doc_id, update_data)
    print(f"更新结果: {update_result}")
    
    if update_result.get('status') != 'success':
        print("❌ 更新文档失败")
        return False
    
    # 2. 测试批量文档更新
    print("\n2. 测试批量文档更新...")
    
    # 执行批量更新
    batch_result = manager.batch_update_documents([doc_id], 'mark_seal')
    print(f"批量更新结果: {batch_result}")
    
    if batch_result.get('status') != 'success':
        print("❌ 批量更新文档失败")
        return False
    
    # 3. 验证数据是否保存到文件
    print("\n3. 验证数据是否保存到文件...")
    
    # 重新加载项目配置
    project_result = manager.load_project(project_id)
    project_config = project_result.get('project')
    
    # 查找更新后的文档
    updated_doc = None
    for cycle, cycle_info in project_config.get('documents', {}).items():
        if 'uploaded_docs' in cycle_info:
            for doc in cycle_info['uploaded_docs']:
                if doc.get('doc_id') == doc_id or doc.get('id') == doc_id:
                    updated_doc = doc
                    break
        if updated_doc:
            break
    
    if not updated_doc:
        print("❌ 无法在项目配置中找到更新的文档")
        return False
    
    # 验证更新的数据
    print(f"更新后的文档信息:")
    print(f"  签名人: {updated_doc.get('signer')}")
    print(f"  备注: {updated_doc.get('note')}")
    print(f"  文档日期: {updated_doc.get('doc_date')}")
    print(f"  盖章标记: {updated_doc.get('has_seal_marked')}")
    
    # 检查是否所有更新都已保存
    all_updated = True
    if updated_doc.get('signer') != update_data['signer']:
        print("❌ 签名人未更新")
        all_updated = False
    if updated_doc.get('note') != update_data['note']:
        print("❌ 备注未更新")
        all_updated = False
    if updated_doc.get('doc_date') != update_data['doc_date']:
        print("❌ 文档日期未更新")
        all_updated = False
    if not updated_doc.get('has_seal_marked'):
        print("❌ 盖章标记未更新")
        all_updated = False
    
    # 4. 验证文件是否被修改
    print("\n4. 验证文件是否被修改...")
    
    # 检查项目配置文件
    project_folder = config.projects_folder / project_name
    config_file = project_folder / 'project_config.json'
    
    if not config_file.exists():
        print(f"❌ 项目配置文件不存在: {config_file}")
        return False
    
    # 读取文件内容
    with open(config_file, 'r', encoding='utf-8') as f:
        file_content = json.load(f)
    
    # 查找文件中的文档
    file_doc = None
    for cycle, cycle_info in file_content.get('documents', {}).items():
        if 'uploaded_docs' in cycle_info:
            for doc in cycle_info['uploaded_docs']:
                if doc.get('doc_id') == doc_id or doc.get('id') == doc_id:
                    file_doc = doc
                    break
        if file_doc:
            break
    
    if not file_doc:
        print("❌ 无法在文件中找到更新的文档")
        return False
    
    # 验证文件中的数据
    file_updated = True
    if file_doc.get('signer') != update_data['signer']:
        print("❌ 文件中的签名人未更新")
        file_updated = False
    if file_doc.get('note') != update_data['note']:
        print("❌ 文件中的备注未更新")
        file_updated = False
    if file_doc.get('doc_date') != update_data['doc_date']:
        print("❌ 文件中的文档日期未更新")
        file_updated = False
    if not file_doc.get('has_seal_marked'):
        print("❌ 文件中的盖章标记未更新")
        file_updated = False
    
    if all_updated and file_updated:
        print("\n✅ 测试通过！文档更新已正确保存到JSON文件中")
        return True
    else:
        print("\n❌ 测试失败！文档更新未正确保存到JSON文件中")
        return False


if __name__ == "__main__":
    success = test_document_save()
    sys.exit(0 if success else 1)
