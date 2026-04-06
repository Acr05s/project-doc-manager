# -*- coding: utf-8 -*-
"""详细诊断打包逻辑 - 从数据库读取所有配置"""

import json
import re
import sqlite3
from pathlib import Path

def get_db_path():
    """获取项目数据库路径"""
    project_folder = Path(__file__).parent / 'projects' / '人力资源市场平台项目'
    return project_folder / 'data' / 'db' / 'documents.db'

def load_from_project_db(project_name):
    """从项目数据库加载所有配置"""
    # 首先从索引数据库获取 project_id
    index_db = Path(__file__).parent / 'projects' / 'projects_index.db'

    conn = sqlite3.connect(str(index_db))
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM projects WHERE name = ?", (project_name,))
    row = cursor.fetchone()
    project_id = row[0] if row else None
    conn.close()

    if not project_id:
        print(f"未找到项目: {project_name}")
        return None

    print(f"project_id: {project_id}")

    # 连接项目数据库
    project_db = Path(__file__).parent / 'projects' / project_name / 'data' / 'db' / 'documents.db'
    if not project_db.exists():
        print(f"项目数据库不存在: {project_db}")
        return None

    conn = sqlite3.connect(str(project_db))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 获取所有配置
    configs = {}
    cursor.execute("SELECT config_type, config_data FROM project_configs WHERE project_id = ?", (project_id,))
    for row in cursor.fetchall():
        config_type = row['config_type']
        config_data = json.loads(row['config_data'])
        configs[config_type] = config_data

    conn.close()

    return configs

def diagnose():
    configs = load_from_project_db("人力资源市场平台项目")

    if not configs:
        print("加载配置失败")
        return

    print(f"\n配置类型: {list(configs.keys())}")

    # 1. 获取 cycles 和 required_docs
    requirements = configs.get('requirements', {})
    cycles = requirements.get('cycles', [])
    required_docs_map = requirements.get('documents', {})

    print(f"\ncycles ({len(cycles)}): {cycles[:5]}...")

    # 2. 获取 documents_index
    doc_index = configs.get('documents_index', {})
    documents = doc_index.get('documents', {})

    print(f"documents_index 记录数: {len(documents)}")

    # 3. 获取归档状态
    archived_data = configs.get('documents_archived', {})
    documents_archived = archived_data.get('documents_archived', {})

    print(f"\ndocuments_archived 周期数: {len(documents_archived)}")

    # 找到"3、项目准备"周期
    target_cycle = None
    for cycle in cycles:
        if '项目准备' in cycle:
            target_cycle = cycle
            break

    if not target_cycle:
        print("未找到'项目准备'周期")
        print(f"所有周期: {cycles}")
        return

    print(f"\n{'='*80}")
    print(f"目标周期: {target_cycle}")
    print(f"cycles 中的序号: {cycles.index(target_cycle) + 1}")
    print(f"{'='*80}")

    # 获取 required_docs
    target_cycle_requirements = required_docs_map.get(target_cycle, {})
    required_docs = target_cycle_requirements.get('required_docs', [])

    print(f"\nrequired_docs ({len(required_docs)}):")
    for i, req in enumerate(required_docs, 1):
        name = req.get('name', '未知')
        print(f"  {i}. {name}")

    # 获取 archived 状态
    archived_in_cycle = documents_archived.get(target_cycle, {})

    print(f"\n归档状态 (documents_archived[{target_cycle}]):")
    print(f"  {archived_in_cycle}")

    # 过滤出有上传文件的文档
    print(f"\n{'='*80}")
    print("合并 documents_index 到 uploaded_docs")
    print(f"{'='*80}")

    # 按 cycle 分组
    uploaded_docs_by_cycle = {}

    for doc_id, doc_info in documents.items():
        cycle = doc_info.get('cycle', '')

        # 如果 cycle 为空，尝试从 doc_id 推断
        if not cycle:
            for known_cycle in cycles:
                if doc_id.startswith(known_cycle + '_'):
                    cycle = known_cycle
                    break
                cycle_without_prefix = re.sub(r'^\d+[\.、\s]+', '', known_cycle)
                if doc_id.startswith(cycle_without_prefix + '_'):
                    cycle = known_cycle
                    break

        if cycle not in uploaded_docs_by_cycle:
            uploaded_docs_by_cycle[cycle] = []
        uploaded_docs_by_cycle[cycle].append(doc_info)

    # 目标周期的 uploaded_docs
    uploaded_docs = uploaded_docs_by_cycle.get(target_cycle, [])

    print(f"\n{target_cycle} 的 uploaded_docs ({len(uploaded_docs)} 个):")
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
        print(f"\n  [{'Y' if archived else 'N'}] {name} ({len(files)} 个文件)")
        for f in files:
            print(f"       - {f['filename']}")

    # 匹配检查
    print(f"\n{'='*80}")
    print("匹配检查")
    print(f"{'='*80}")

    required_names = {req.get('name') for req in required_docs}
    uploaded_names_set = set(uploaded_names.keys())

    print(f"\nrequired_docs 中的文档名 ({len(required_names)}): {required_names}")
    print(f"uploaded_docs 中的文档名 ({len(uploaded_names_set)}): {uploaded_names_set}")

    # 在 required 但不在 uploaded
    missing = required_names - uploaded_names_set
    if missing:
        print(f"\n⚠️ required_docs 中有，但 uploaded_docs 中没有:")
        for name in missing:
            archived = archived_in_cycle.get(name, False)
            print(f"     - {name} (已归档: {archived})")

    # 在 uploaded 但不在 required
    extra = uploaded_names_set - required_names
    if extra:
        print(f"\n⚠️ uploaded_docs 中有，但 required_docs 中没有:")
        for name in extra:
            print(f"     - {name}")

    # 模拟打包逻辑
    print(f"\n{'='*80}")
    print("模拟打包逻辑 (scope='archived')")
    print(f"{'='*80}")

    include_count = 0
    for req in required_docs:
        doc_name = req.get('name', '未知')
        has_files = doc_name in uploaded_names and len(uploaded_names[doc_name]) > 0
        is_archived = archived_in_cycle.get(doc_name, False)

        if is_archived and has_files:
            include_count += 1
            print(f"  ✓ 包含: {doc_name} (已归档, {len(uploaded_names[doc_name])} 个文件)")
        elif is_archived and not has_files:
            print(f"  ⚠️ 已归档但无文件: {doc_name}")
        else:
            print(f"  ✗ 跳过: {doc_name} (已归档: {is_archived}, 有文件: {has_files})")

    print(f"\n预计打包文件数: {include_count}")

if __name__ == '__main__':
    diagnose()
