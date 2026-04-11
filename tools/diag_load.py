# -*- coding: utf-8 -*-
"""详细诊断打包逻辑 - 模拟 load_full_config 返回的数据"""

import json
import re
from pathlib import Path

def load_full_config_simulation():
    """模拟 load_full_config 的逻辑"""
    project_name = "人力资源市场平台项目"
    project_folder = Path(rf'd:\workspace\Doc\project_doc_manager\projects\{project_name}')

    # 1. 加载 requirements（包含 cycles 和 required_docs）
    requirements_path = project_folder / 'data' / 'requirements.json'
    with open(requirements_path, 'r', encoding='utf-8') as f:
        requirements = json.load(f)

    cycles = requirements.get('cycles', [])
    required_docs_map = requirements.get('documents', {})  # {周期: {required_docs: []}}

    print(f"cycles 数量: {len(cycles)}")
    print(f"cycles 列表: {cycles[:5]}...")

    # 2. 加载 documents_index
    docs_index_path = project_folder / 'data' / 'documents_index.json'
    with open(docs_index_path, 'r', encoding='utf-8') as f:
        doc_index = json.load(f)

    print(f"\ndocuments_index 记录数: {len(doc_index)}")

    # 3. 加载 documents_archived
    # 这个应该从数据库加载，这里我们直接看 JSON 文件
    archived_path = project_folder / 'data' / 'documents_archived.json'
    if archived_path.exists():
        with open(archived_path, 'r', encoding='utf-8') as f:
            archived_data = json.load(f)
        documents_archived = archived_data.get('documents_archived', {})
    else:
        documents_archived = {}
        print("\n警告: documents_archived.json 不存在!")

    print(f"\ndocuments_archived 周期数: {len(documents_archived)}")
    if '3、项目准备' in documents_archived:
        print(f"3、项目准备 归档状态: {documents_archived['3、项目准备']}")

    # 4. 模拟 load_full_config 的合并逻辑
    config = {
        'documents': {},
        'cycles': cycles
    }

    # 合并 required_docs
    for cycle, cycle_info in required_docs_map.items():
        if cycle not in config['documents']:
            config['documents'][cycle] = {}
        config['documents'][cycle].update(cycle_info)
        config['documents'][cycle]['uploaded_docs'] = []  # 清空，后面重新填充

    print(f"\n合并 required_docs 后的 documents 键: {list(config['documents'].keys())}")

    # 5. 合并 documents_index 到 uploaded_docs
    for doc_id, doc_info in doc_index.items():
        cycle = doc_info.get('cycle', '')
        doc_name = doc_info.get('doc_name', '')

        # 如果 cycle 为空，尝试从 doc_id 推断
        if not cycle:
            for known_cycle in cycles:
                # 尝试匹配：known_cycle + '_'
                if doc_id.startswith(known_cycle + '_'):
                    cycle = known_cycle
                    break
                # 去掉序号前缀后匹配
                cycle_without_prefix = re.sub(r'^\d+[\.、\s]+', '', known_cycle)
                if doc_id.startswith(cycle_without_prefix + '_') or doc_id.startswith(known_cycle + '_'):
                    cycle = known_cycle
                    break

        if cycle and doc_name:
            if cycle not in config['documents']:
                config['documents'][cycle] = {'uploaded_docs': []}
            if 'uploaded_docs' not in config['documents'][cycle]:
                config['documents'][cycle]['uploaded_docs'] = []
            config['documents'][cycle]['uploaded_docs'].append(doc_info)

    # 添加归档状态
    config['documents_archived'] = documents_archived

    return config

def diagnose_packaging(config):
    """诊断打包逻辑"""
    print("\n" + "="*80)
    print("打包逻辑诊断")
    print("="*80)

    cycles = config.get('cycles', [])
    documents = config.get('documents', {})
    documents_archived = config.get('documents_archived', {})

    # 找到"3、项目准备"周期
    target_cycle = None
    for cycle in cycles:
        if '项目准备' in cycle:
            target_cycle = cycle
            break

    if not target_cycle:
        print("未找到'项目准备'周期")
        return

    print(f"\n目标周期: {target_cycle}")
    print(f"cycles 中的顺序: {cycles.index(target_cycle) + 1}")

    doc_data = documents.get(target_cycle, {})
    required_docs = doc_data.get('required_docs', [])
    uploaded_docs = doc_data.get('uploaded_docs', [])
    archived_in_cycle = documents_archived.get(target_cycle, {})

    print(f"\nrequired_docs ({len(required_docs)} 个):")
    required_names = []
    for req in required_docs:
        name = req.get('name', '未知')
        required_names.append(name)
        archived = archived_in_cycle.get(name, False)
        print(f"  {name} - 已归档: {archived}")

    print(f"\nuploaded_docs ({len(uploaded_docs)} 个):")
    uploaded_names = {}
    for doc in uploaded_docs:
        doc_name = doc.get('doc_name', '未知')
        filename = doc.get('original_filename', '未知')
        archived = archived_in_cycle.get(doc_name, False)

        if doc_name not in uploaded_names:
            uploaded_names[doc_name] = []
        uploaded_names[doc_name].append({
            'filename': filename,
            'archived': archived
        })

    for name, files in uploaded_names.items():
        archived = archived_in_cycle.get(name, False)
        print(f"  [{'Y' if archived else 'N'}] {name} ({len(files)} 个文件)")
        for f in files:
            print(f"       - {f['filename']}")

    # 关键检查：匹配 required_docs 和 uploaded_docs
    print("\n" + "="*80)
    print("匹配检查")
    print("="*80)

    uploaded_names_set = set(uploaded_names.keys())
    required_names_set = set(required_names)

    print(f"\nrequired_docs 中的文档名: {required_names_set}")
    print(f"uploaded_docs 中的文档名: {uploaded_names_set}")

    # 在 required 但不在 uploaded
    missing = required_names_set - uploaded_names_set
    if missing:
        print(f"\n⚠️ required_docs 中有，但 uploaded_docs 中没有:")
        for name in missing:
            archived = archived_in_cycle.get(name, False)
            print(f"     - {name} (已归档: {archived})")

    # 在 uploaded 但不在 required
    extra = uploaded_names_set - required_names_set
    if extra:
        print(f"\n⚠️ uploaded_docs 中有，但 required_docs 中没有:")
        for name in extra:
            print(f"     - {name}")

    # 模拟打包逻辑：should_include_doc
    print("\n" + "="*80)
    print("模拟打包逻辑 (scope='archived')")
    print("="*80)

    def should_include_doc(cycle, doc_name, has_uploaded_files):
        is_not_involved = False  # 简化，假设没有不涉及的文档
        is_archived = documents_archived.get(cycle, {}).get(doc_name, False)

        if scope == 'archived':
            result = is_archived
            print(f"  {doc_name}: is_archived={is_archived}, 结果={result}")
            return result
        else:
            result = has_uploaded_files
            return result

    scope = 'archived'
    print(f"\n打包模式: {scope}")
    print(f"遍历 required_docs，检查归档状态:")

    include_count = 0
    for req in required_docs:
        doc_name = req.get('name', '未知')
        has_files = doc_name in uploaded_names and len(uploaded_names[doc_name]) > 0

        if should_include_doc(target_cycle, doc_name, has_files):
            include_count += 1
            print(f"    ✓ 包含: {doc_name}")
        else:
            print(f"    ✗ 跳过: {doc_name}")

    print(f"\n预计打包文件数: {include_count}")

    # 检查 uploaded_docs 中的文件名
    print("\n" + "="*80)
    print("检查 uploaded_docs 详细信息")
    print("="*80)

    for doc in uploaded_docs:
        doc_name = doc.get('doc_name', '未知')
        filename = doc.get('original_filename', '未知')
        file_path = doc.get('file_path', '未知')
        doc_id = doc.get('doc_id', '未知')

        print(f"\n文档ID: {doc_id}")
        print(f"  文档名: {doc_name}")
        print(f"  文件名: {filename}")
        print(f"  路径: {file_path[:60]}..." if len(file_path) > 60 else f"  路径: {file_path}")

if __name__ == '__main__':
    config = load_full_config_simulation()
    diagnose_packaging(config)
