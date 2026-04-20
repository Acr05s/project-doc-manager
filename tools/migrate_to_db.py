#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
数据迁移脚本：将项目配置数据从JSON文件迁移到数据库

使用方法：
    python migrate_to_db.py

迁移内容：
    - project_info.json -> 数据库 project_configs 表 (config_type='project_info')
    - requirements.json -> 数据库 project_configs 表 (config_type='requirements')
    - categories.json -> 数据库 project_configs 表 (config_type='categories')
    - documents_index.json -> 数据库 project_configs 表 (config_type='documents_index')
    - documents_index.json -> 每个项目的 documents.db (带附加属性)
    - documents_archived.json -> 数据库 project_configs 表 (config_type='documents_archived')
    - zip_uploads.json -> 数据库 project_configs 表 (config_type='zip_uploads')
    - .draft.json -> 数据库 project_configs 表 (config_type='draft')

文档附加属性包括：
    - 盖章/签字属性: has_seal, party_a_seal, party_b_seal, no_seal, no_signature
    - 签字人: party_a_signer, party_b_signer
    - 日期: doc_date, sign_date
    - 目录: directory
    - 来源: source
    - 自定义属性: custom_attrs
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from app.utils.db_manager import get_projects_index_db, get_project_documents_db


def load_json(file_path):
    """加载JSON文件"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"  加载失败: {e}")
        return None


def migrate_project(project_dir: Path, db):
    """迁移单个项目的配置数据"""
    project_name = project_dir.name
    print(f"\n处理项目: {project_name}")
    
    # 获取 project_id
    project_info_path = project_dir / 'project_info.json'
    project_id = None
    if project_info_path.exists():
        data = load_json(project_info_path)
        if data:
            project_id = data.get('id')
    
    if not project_id:
        # 尝试从数据库获取
        db_project = db.get_project_by_name(project_name)
        if db_project:
            project_id = db_project['id']
    
    if not project_id:
        print(f"  跳过: 无法获取 project_id")
        return 0
    
    print(f"  project_id: {project_id}")
    
    # 迁移各类配置
    config_mapping = {
        'project_info.json': 'project_info',
        'requirements.json': 'requirements',
        'config/requirements.json': 'requirements',
        'categories.json': 'categories',
        'config/categories.json': 'categories',
        'documents_index.json': 'documents_index',
        'data/documents_index.json': 'documents_index',
        'documents_archived.json': 'documents_archived',
        'data/documents_archived.json': 'documents_archived',
        'zip_uploads.json': 'zip_uploads',
        '.draft.json': 'draft',
    }
    
    migrated_count = 0
    docs_migrated_count = 0
    
    for file_path, config_type in config_mapping.items():
        full_path = project_dir / file_path
        if full_path.exists() and full_path.is_file():
            data = load_json(full_path)
            if data is not None:
                success = db.save_project_config(project_id, config_type, data)
                if success:
                    print(f"  [OK] {config_type}")
                    migrated_count += 1
                else:
                    print(f"  [FAIL] {config_type} (保存失败)")
    
    # 单独迁移 documents_index 到项目文档数据库（带附加属性）
    docs_index_paths = [
        project_dir / 'data' / 'documents_index.json',
        project_dir / 'documents_index.json'
    ]
    
    for docs_path in docs_index_paths:
        if docs_path.exists():
            docs_data = load_json(docs_path)
            if docs_data and 'documents' in docs_data:
                docs_list = docs_data['documents']
                if isinstance(docs_list, dict):
                    # 新格式：{doc_id: doc_info}
                    docs_list = list(docs_list.values())
                elif not isinstance(docs_list, list):
                    docs_list = []
                
                if docs_list:
                    try:
                        # 获取项目文档数据库
                        proj_db = get_project_documents_db(project_name)
                        
                        # 统计迁移的文档附加属性
                        seal_count = 0
                        custom_attr_count = 0
                        directory_count = 0
                        
                        for doc in docs_list:
                            doc_id = doc.get('doc_id') or doc.get('id', '')
                            if not doc_id:
                                continue
                            
                            # 提取附加属性
                            has_seal = 1 if doc.get('has_seal') else 0
                            party_a_seal = 1 if doc.get('party_a_seal') else 0
                            party_b_seal = 1 if doc.get('party_b_seal') else 0
                            no_seal = 1 if doc.get('no_seal') else 0
                            no_signature = 1 if doc.get('no_signature') else 0
                            party_a_signer = doc.get('party_a_signer', '') or ''
                            party_b_signer = doc.get('party_b_signer', '') or ''
                            doc_date = doc.get('doc_date', '') or ''
                            sign_date = doc.get('sign_date', '') or ''
                            directory = doc.get('directory', '/') or '/'
                            source = doc.get('source', '') or ''
                            custom_attrs = doc.get('custom_attrs', {})
                            
                            # 统计有附加属性的文档
                            if has_seal or party_a_seal or party_b_seal or no_seal or no_signature:
                                seal_count += 1
                            if custom_attrs:
                                custom_attr_count += 1
                            if directory != '/':
                                directory_count += 1
                            
                            # 保存到项目文档数据库
                            proj_db.add_document(
                                doc_id=doc_id,
                                project_id=project_id,
                                project_name=project_name,
                                cycle=doc.get('cycle', '') or '',
                                doc_name=doc.get('doc_name', '') or '',
                                file_path=doc.get('file_path', '') or '',
                                file_size=doc.get('file_size', 0) or 0,
                                file_type=doc.get('file_type'),
                                original_filename=doc.get('original_filename'),
                                status=doc.get('status', 'uploaded'),
                                has_seal=has_seal,
                                party_a_seal=party_a_seal,
                                party_b_seal=party_b_seal,
                                no_seal=no_seal,
                                no_signature=no_signature,
                                party_a_signer=party_a_signer,
                                party_b_signer=party_b_signer,
                                doc_date=doc_date,
                                sign_date=sign_date,
                                directory=directory,
                                source=source,
                                custom_attrs=custom_attrs
                            )
                        
                        docs_migrated_count = len(docs_list)
                        print(f"  [OK] documents -> documents.db ({docs_migrated_count} 个文档)")
                        if seal_count > 0:
                            print(f"       - 含盖章/签字属性: {seal_count} 个")
                        if custom_attr_count > 0:
                            print(f"       - 含自定义属性: {custom_attr_count} 个")
                        if directory_count > 0:
                            print(f"       - 含子目录: {directory_count} 个")
                        migrated_count += 1
                    except Exception as e:
                        print(f"  [FAIL] documents -> documents.db ({e})")
            break  # 只处理第一个找到的 documents_index.json
    
    return migrated_count


def main():
    print("=" * 60)
    print("项目配置数据迁移脚本")
    print("将JSON文件迁移到数据库（含文档附加属性）")
    print("=" * 60)
    
    # 获取数据库连接
    db = get_projects_index_db()
    if not db:
        print("错误: 无法连接到数据库")
        sys.exit(1)
    
    print("\n数据库连接成功")
    
    # 获取备份目录
    backup_dir = Path(__file__).parent / 'projects_json_backup'
    if not backup_dir.exists():
        print(f"错误: 备份目录不存在: {backup_dir}")
        sys.exit(1)
    
    print(f"备份目录: {backup_dir}")
    
    # 迁移每个项目
    total_migrated = 0
    project_count = 0
    total_docs = 0
    
    for item in sorted(backup_dir.iterdir()):
        if not item.is_dir():
            continue
        if item.name in ['requirements', 'common']:
            # 跳过公共目录
            continue
        
        count = migrate_project(item, db)
        total_migrated += count
        project_count += 1
    
    # 统计文档迁移结果
    print("\n" + "=" * 60)
    print(f"迁移完成!")
    print(f"处理项目数: {project_count}")
    print(f"迁移配置数: {total_migrated}")
    print("=" * 60)
    
    # 验证迁移结果
    print("\n验证迁移结果:")
    all_projects = db.list_projects(include_deleted=True)
    print(f"数据库中项目数: {len(all_projects)}")
    for proj in all_projects[:5]:
        print(f"  - {proj['name']} (ID: {proj['id']})")
    if len(all_projects) > 5:
        print(f"  ... 还有 {len(all_projects) - 5} 个项目")
    
    # 验证项目文档数据库
    print("\n验证项目文档数据库:")
    for proj in all_projects[:3]:
        try:
            proj_db = get_project_documents_db(proj['name'])
            docs = proj_db.get_documents()
            print(f"  - {proj['name']}: {len(docs)} 个文档")
            
            # 检查附加属性
            for doc in docs[:2]:
                attrs = []
                if doc.get('has_seal') or doc.get('party_a_seal') or doc.get('party_b_seal'):
                    attrs.append("盖章")
                if doc.get('no_signature'):
                    attrs.append("无签字")
                if doc.get('directory') and doc.get('directory') != '/':
                    attrs.append(f"目录:{doc['directory']}")
                if doc.get('custom_attrs'):
                    attrs.append("自定义属性")
                if attrs:
                    print(f"    * {doc['doc_name']}: {', '.join(attrs)}")
        except Exception as e:
            print(f"  - {proj['name']}: 查询失败 ({e})")


if __name__ == '__main__':
    main()
