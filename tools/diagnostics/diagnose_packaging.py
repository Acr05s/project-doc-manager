# -*- coding: utf-8 -*-
"""诊断打包逻辑问题 - 检查 documents_archived, required_docs, uploaded_docs 匹配情况"""

import sys
sys.path.insert(0, '.')

from app.utils.document_manager import DocumentManager
import json

def diagnose_packaging_issue(project_name):
    """诊断项目打包问题"""
    dm = DocumentManager()

    # 加载项目配置
    full_config = dm.load_full_config(project_name)
    if not full_config or full_config.get('status') != 'success':
        print(f"❌ 加载项目失败: {project_name}")
        return

    project = full_config.get('project', {})
    documents = project.get('documents', {})
    cycles_order = project.get('cycles', [])
    documents_archived = project.get('documents_archived', {})
    documents_not_involved = project.get('documents_not_involved', {})

    print(f"\n{'='*80}")
    print(f"项目: {project_name}")
    print(f"周期数量: {len(cycles_order)}")
    print(f"{'='*80}\n")

    # 遍历每个周期
    for cycle in cycles_order:
        if cycle not in documents:
            continue

        doc_data = documents[cycle]
        if not isinstance(doc_data, dict):
            continue

        required_docs = doc_data.get('required_docs', [])
        uploaded_docs = doc_data.get('uploaded_docs', [])

        # 构建 uploaded_docs 的 doc_name 集合
        uploaded_doc_names = set()
        for doc in uploaded_docs:
            if isinstance(doc, dict):
                doc_name = doc.get('doc_name', '未知')
                uploaded_doc_names.add(doc_name)

        # 获取归档状态
        archived_in_cycle = documents_archived.get(cycle, {})
        not_involved_in_cycle = documents_not_involved.get(cycle, {})

        print(f"\n{'='*80}")
        print(f"周期: {cycle}")
        print(f"required_docs 数量: {len(required_docs)}")
        print(f"uploaded_docs 数量: {len(uploaded_docs)}")
        print(f"已归档 doc_name 数量: {len(archived_in_cycle)}")
        print(f"不涉及 doc_name 数量: {len(not_involved_in_cycle)}")
        print(f"{'='*80}")

        # 详细对比 required_docs 和 uploaded_docs
        print(f"\n📋 required_docs 中的文档:")
        for i, req in enumerate(required_docs, 1):
            doc_name = req.get('name', '未知')
            archived = archived_in_cycle.get(doc_name, False)
            not_invl = not_involved_in_cycle.get(doc_name, False)
            has_upload = doc_name in uploaded_doc_names

            status = []
            if archived:
                status.append('已归档✓')
            if not_invl:
                status.append('不涉及')
            if has_upload:
                status.append('有上传文件')
            if not status:
                status.append('❌ 无状态')

            status_str = ', '.join(status)
            print(f"  {i}. {doc_name} [{status_str}]")

        print(f"\n📁 uploaded_docs 中的文档类型 (去重后):")
        for name in sorted(uploaded_doc_names):
            archived = archived_in_cycle.get(name, False)
            print(f"  - {name} {'✓已归档' if archived else '❌未归档'}")

        # 关键检查：找出不匹配的 doc_name
        required_names = {req.get('name') for req in required_docs}
        print(f"\n🔍 匹配检查:")
        print(f"  required_docs 中的名称集合: {len(required_names)} 个")
        print(f"  uploaded_docs 中的名称集合: {len(uploaded_doc_names)} 个")

        # 找出在 uploaded_docs 但不在 required_docs 中的
        extra_in_uploaded = uploaded_doc_names - required_names
        if extra_in_uploaded:
            print(f"\n  ⚠️  在 uploaded_docs 中但不在 required_docs 中的:")
            for name in extra_in_uploaded:
                print(f"     - {name}")

        # 找出在 required_docs 但不在 uploaded_docs 中的
        missing_in_uploaded = required_names - uploaded_doc_names
        if missing_in_uploaded:
            print(f"\n  ⚠️  在 required_docs 中但不在 uploaded_docs 中的:")
            for name in missing_in_uploaded:
                archived = archived_in_cycle.get(name, False)
                print(f"     - {name} {'✓已归档' if archived else '❌未归档'}")

        # 检查具体的 uploaded_docs 文件
        print(f"\n📂 uploaded_docs 详细文件列表:")
        for doc in uploaded_docs:
            if isinstance(doc, dict):
                doc_name = doc.get('doc_name', '未知')
                filename = doc.get('original_filename', '未知')
                file_path = doc.get('file_path', '未知')
                archived = archived_in_cycle.get(doc_name, False)
                print(f"  [{'✓' if archived else ' '}] {doc_name}")
                print(f"      文件: {filename}")
                print(f"      路径: {file_path[:80]}..." if len(file_path) > 80 else f"      路径: {file_path}")

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else "示例项目"
    diagnose_packaging_issue(target)
