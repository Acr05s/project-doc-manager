# -*- coding: utf-8 -*-
"""诊断打包逻辑问题 - 直接读取JSON文件"""

import json
import os
from pathlib import Path

def read_json_file(path):
    """读取JSON文件"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"读取失败 {path}: {e}")
        return None

def diagnose():
    base_path = Path(r'd:\workspace\Doc\project_doc_manager\projects\人力资源市场平台项目')

    # 1. 读取项目配置 - 可能是 project_config.json 或 data/documents_index.json
    config = None
    for config_name in ['project_config.json', 'data/documents_index.json']:
        config_path = base_path / config_name
        config = read_json_file(config_path)
        if config:
            print(f"找到配置文件: {config_name}")
            break

    if not config:
        print("无法加载项目配置")
        return

    print(f"项目名: {config.get('name', '未知')}")

    # 2. 检查 documents 结构
    documents = config.get('documents', {})
    cycles_order = config.get('cycles', [])
    documents_archived = config.get('documents_archived', {})
    documents_not_involved = config.get('documents_not_involved', {})

    print(f"\n周期数量: {len(cycles_order)}")
    print(f"documents 键数量: {len(documents)}")
    print(f"documents_archived 键数量: {len(documents_archived)}")

    # 3. 找到包含"项目准备"的周期
    target_cycle = None
    for cycle in cycles_order:
        if '项目准备' in cycle:
            target_cycle = cycle
            break

    if not target_cycle:
        print("\n未找到包含'项目准备'的周期")
        print("所有周期:", cycles_order)
        return

    print(f"\n{'='*80}")
    print(f"目标周期: {target_cycle}")
    print(f"{'='*80}")

    doc_data = documents.get(target_cycle, {})
    required_docs = doc_data.get('required_docs', [])
    uploaded_docs = doc_data.get('uploaded_docs', [])
    archived_in_cycle = documents_archived.get(target_cycle, {})
    not_involved_in_cycle = documents_not_involved.get(target_cycle, {})

    print(f"\nrequired_docs ({len(required_docs)} 个):")
    for i, req in enumerate(required_docs, 1):
        name = req.get('name', '未知')
        archived = archived_in_cycle.get(name, False)
        not_invl = not_involved_in_cycle.get(name, False)
        status = []
        if archived: status.append('已归档')
        if not_invl: status.append('不涉及')
        print(f"  {i}. {name} [{', '.join(status) if status else '无状态'}]")

    print(f"\nuploaded_docs ({len(uploaded_docs)} 个):")
    uploaded_names = {}
    for doc in uploaded_docs:
        doc_name = doc.get('doc_name', '未知')
        filename = doc.get('original_filename', '未知')
        file_path = doc.get('file_path', '未知')
        archived = archived_in_cycle.get(doc_name, False)

        if doc_name not in uploaded_names:
            uploaded_names[doc_name] = []
        uploaded_names[doc_name].append({
            'filename': filename,
            'file_path': file_path,
            'archived': archived
        })

    for name, files in uploaded_names.items():
        archived = archived_in_cycle.get(name, False)
        print(f"\n  [{'Y' if archived else 'N'}] {name}")
        for f in files:
            print(f"      - {f['filename']}")
            print(f"        路径: {f['file_path'][:70]}..." if len(f['file_path']) > 70 else f"        路径: {f['file_path']}")

    # 4. 关键检查：对比 required_docs 和 uploaded_docs 的 doc_name
    print(f"\n{'='*80}")
    print("匹配检查:")
    print(f"{'='*80}")

    required_names = {req.get('name') for req in required_docs}
    uploaded_names_set = set(uploaded_names.keys())

    print(f"required_docs 名称集合: {len(required_names)} 个")
    print(f"uploaded_docs 名称集合: {len(uploaded_names_set)} 个")

    # 在 uploaded 但不在 required
    extra = uploaded_names_set - required_names
    if extra:
        print(f"\n⚠️ 在 uploaded 但不在 required:")
        for name in extra:
            print(f"     - {name}")

    # 在 required 但不在 uploaded
    missing = required_names - uploaded_names_set
    if missing:
        print(f"\n⚠️ 在 required 但不在 uploaded:")
        for name in missing:
            archived = archived_in_cycle.get(name, False)
            print(f"     - {name} {'✓已归档' if archived else '❌未归档'}")

    # 5. 检查 uploaded_docs 中的 file_path 是否正确
    print(f"\n{'='*80}")
    print("文件路径检查:")
    print(f"{'='*80}")

    uploads_base = base_path / 'uploads'
    for doc in uploaded_docs[:10]:
        doc_name = doc.get('doc_name', '未知')
        filename = doc.get('original_filename', '未知')
        file_path = doc.get('file_path', '')
        file_path_obj = Path(file_path)

        # 判断路径类型
        if file_path_obj.is_absolute():
            exists = file_path_obj.exists()
        else:
            # 尝试多种可能的路径
            possible_paths = [
                uploads_base / file_path,
                Path('projects') / file_path,
            ]
            exists = any(p.exists() for p in possible_paths)

        print(f"  [{'Y' if exists else 'N'}] {doc_name}: {filename}")
        print(f"       路径: {file_path[:70]}..." if len(file_path) > 70 else f"       路径: {file_path}")

if __name__ == '__main__':
    diagnose()
