# -*- coding: utf-8 -*-
"""数据迁移脚本 - 从 JSON 迁移到 SQLite

使用方法:
    python -m app.utils.migrate_data

迁移内容:
    1. projects_index.json → projects_index.db (全局索引库)
    2. 各项目 zip_uploads.json → projects_index.db (ZIP上传记录)
    3. 各项目的 documents_index.json → 项目数据库 documents.db

迁移策略:
    - 保留原有 JSON 文件作为备份
    - 数据库和 JSON 双写（读优先数据库）
    - 迁移前自动备份
"""

import os
import sys
import json
import shutil
import logging
from datetime import datetime
from pathlib import Path

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_config():
    """获取配置"""
    from app.utils.base import get_config
    return get_config()


def backup_json_file(file_path: str) -> bool:
    """备份 JSON 文件"""
    try:
        if not os.path.exists(file_path):
            return False
        
        backup_path = f"{file_path}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(file_path, backup_path)
        logger.info(f"已备份: {file_path} → {backup_path}")
        return True
    except Exception as e:
        logger.error(f"备份失败 {file_path}: {e}")
        return False


def migrate_projects_index(config) -> int:
    """迁移全局项目索引
    
    兼容旧格式：顶层 key 直接是 project_xxx，不再嵌套在 projects 里
    也会迁移 deleted_projects
    
    Returns:
        迁移的项目数量
    """
    logger.info("=" * 60)
    logger.info("迁移 1/3: projects_index.json")
    logger.info("=" * 60)
    
    projects_base = config.get('projects_base_folder', 'projects')
    projects_base = os.path.abspath(projects_base)
    index_file = os.path.join(projects_base, 'projects_index.json')
    
    if not os.path.exists(index_file):
        logger.info("projects_index.json 不存在，跳过")
        return 0
    
    # 备份
    backup_json_file(index_file)
    
    try:
        with open(index_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 获取数据库
        from app.utils.db_manager import get_projects_index_db
        db = get_projects_index_db()
        
        migrated_count = 0
        
        # 兼容两种格式：
        # 旧格式: 顶层 key 直接是 project_xxx
        # 新格式: { "projects": { "project_xxx": {...} } }
        
        if 'projects' in data:
            # 新格式
            projects = data.get('projects', {})
        else:
            # 旧格式：直接遍历顶层 key
            projects = {}
            for key, value in data.items():
                if key not in ('updated_time',) and isinstance(value, dict):
                    projects[key] = value
        
        for project_id, info in projects.items():
            if isinstance(info, dict):
                # 检查是否是已删除项目
                deleted = 1 if info.get('deleted') or project_id.startswith('deleted_') else 0
                
                db.create_project(
                    project_id=project_id,
                    name=info.get('name', project_id),
                    created_time=info.get('created_time'),
                    description=info.get('description', '')
                )
                
                # 如果是已删除项目，更新状态
                if deleted:
                    db.update_project(
                        project_id,
                        deleted=1,
                        deleted_time=info.get('deleted_time', datetime.now().isoformat())
                    )
                
                migrated_count += 1
        
        logger.info(f"✓ 已迁移 {migrated_count} 个项目到数据库")
        
        # 迁移已删除项目（如果没有在上面处理）
        deleted_projects = data.get('deleted_projects', {})
        for project_id, info in deleted_projects.items():
            if isinstance(info, dict) and project_id not in projects:
                db.update_project(
                    project_id,
                    deleted=1,
                    deleted_time=info.get('deleted_time', datetime.now().isoformat())
                )
        
        return migrated_count
        
    except Exception as e:
        logger.error(f"迁移 projects_index.json 失败: {e}")
        import traceback
        traceback.print_exc()
        return 0


def migrate_zip_uploads(config) -> int:
    """迁移 ZIP 上传记录
    
    兼容格式：
    - 数组格式: [{id, name, path, ...}]
    - 字典格式: {zip_uploads: [...]}
    
    Returns:
        迁移的记录数量
    """
    logger.info("=" * 60)
    logger.info("迁移 2/3: 各项目 zip_uploads.json")
    logger.info("=" * 60)
    
    projects_base = config.get('projects_base_folder', 'projects')
    projects_base = os.path.abspath(projects_base)
    
    if not os.path.exists(projects_base):
        logger.warning(f"项目目录不存在: {projects_base}")
        return 0
    
    from app.utils.db_manager import get_projects_index_db
    db = get_projects_index_db()
    
    total_count = 0
    
    # 遍历所有项目目录
    for entry in os.listdir(projects_base):
        project_dir = os.path.join(projects_base, entry)
        if not os.path.isdir(project_dir):
            continue
        
        # 跳过特殊目录
        if entry.startswith('.') or entry in ('logs', 'requirements'):
            continue
        
        zip_uploads_file = os.path.join(project_dir, 'zip_uploads.json')
        
        if not os.path.exists(zip_uploads_file):
            continue
        
        try:
            # 备份
            backup_json_file(zip_uploads_file)
            
            with open(zip_uploads_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 兼容两种格式
            if isinstance(data, list):
                records = data
            elif isinstance(data, dict):
                records = data.get('zip_uploads', [])
            else:
                continue
            
            # 获取项目的 project_id
            project_info = db.get_project_by_name(entry)
            project_id = project_info['id'] if project_info else entry
            
            for record in records:
                zip_id = record.get('id', '')
                zip_name = record.get('name', record.get('zip_filename', ''))
                zip_path = record.get('path', '')
                file_count = record.get('file_count', 0)
                matched_count = record.get('matched_count', 0)
                status = record.get('status', 'completed')
                upload_time = record.get('upload_time')
                
                db.add_zip_upload(
                    project_id=project_id,
                    zip_filename=zip_name,
                    file_path=zip_path,
                    file_count=file_count,
                    matched_count=matched_count,
                    status=status,
                    upload_time=upload_time
                )
                total_count += 1
            
            logger.info(f"✓ 已迁移 {len(records)} 条 ZIP 记录: {entry}")
            
        except Exception as e:
            logger.error(f"迁移项目 {entry} 的 zip_uploads.json 失败: {e}")
    
    logger.info(f"✓ 共迁移 {total_count} 条 ZIP 上传记录")
    return total_count


def migrate_documents_index(config) -> int:
    """迁移各项目的文档索引
    
    兼容格式：
    - {documents: {doc_id: {...}}}
    - 直接以 doc_id 为 key
    
    Returns:
        迁移的项目数量
    """
    logger.info("=" * 60)
    logger.info("迁移 3/3: 各项目的 documents_index.json")
    logger.info("=" * 60)
    
    projects_base = config.get('projects_base_folder', 'projects')
    projects_base = os.path.abspath(projects_base)
    migrated_count = 0
    total_docs = 0
    
    if not os.path.exists(projects_base):
        logger.warning(f"项目目录不存在: {projects_base}")
        return 0
    
    for entry in os.listdir(projects_base):
        project_dir = os.path.join(projects_base, entry)
        if not os.path.isdir(project_dir):
            continue
        
        # 跳过特殊目录
        if entry.startswith('.') or entry in ('logs', 'requirements'):
            continue
        
        # 检查 documents_index.json 是否存在
        data_dir = os.path.join(project_dir, 'data')
        doc_index_file = os.path.join(data_dir, 'documents_index.json')
        
        if not os.path.exists(doc_index_file):
            continue
        
        try:
            # 备份
            backup_json_file(doc_index_file)
            
            with open(doc_index_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 获取项目数据库
            from app.utils.db_manager import get_project_documents_db
            db = get_project_documents_db(entry)
            
            # 兼容两种格式
            # 新格式: {documents: {doc_id: {...}}}
            # 旧格式: 直接以 doc_id 为 key
            if 'documents' in data:
                documents = data.get('documents', {})
            else:
                # 旧格式：直接遍历顶层 key
                documents = {}
                for key, value in data.items():
                    if key not in ('updated_time',) and isinstance(value, dict):
                        documents[key] = value
            
            doc_count = 0
            
            for doc_id, doc_info in documents.items():
                if isinstance(doc_info, dict):
                    # 提取字段（兼容不同格式）
                    cycle = doc_info.get('cycle', doc_info.get('category', ''))
                    doc_name = doc_info.get('doc_name', doc_info.get('name', ''))
                    file_path = doc_info.get('file_path', doc_info.get('path', ''))
                    file_size = doc_info.get('file_size', 0)
                    file_type = doc_info.get('file_type', doc_info.get('type'))
                    original_filename = doc_info.get('original_filename', doc_info.get('filename', ''))
                    status = doc_info.get('status', 'uploaded')
                    
                    # 状态字段兼容
                    if doc_info.get('archived', False):
                        status = 'archived'
                    elif doc_info.get('pending', False):
                        status = 'pending'
                    
                    db.add_document(
                        doc_id=doc_id,
                        project_id=doc_info.get('project_id', ''),
                        project_name=entry,
                        cycle=cycle,
                        doc_name=doc_name,
                        file_path=file_path,
                        file_size=file_size,
                        file_type=file_type,
                        original_filename=original_filename,
                        status=status
                    )
                    doc_count += 1
            
            logger.info(f"✓ 已迁移项目 {entry}: {doc_count} 个文档")
            total_docs += doc_count
            migrated_count += 1
            
        except Exception as e:
            logger.error(f"迁移项目 {entry} 的 documents_index.json 失败: {e}")
            import traceback
            traceback.print_exc()
    
    logger.info(f"✓ 共迁移 {migrated_count} 个项目的 {total_docs} 个文档")
    return migrated_count


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("数据迁移工具：JSON → SQLite")
    print("=" * 60)
    print()
    print("迁移策略：")
    print("  - 保留原有 JSON 文件作为备份（.backup_时间戳）")
    print("  - 数据库和 JSON 双写（读优先数据库）")
    print("  - 如需回滚，可删除 .db 文件，恢复 .backup_ 文件")
    print()
    
    # 确认操作
    response = input("是否开始迁移? (y/n): ").strip().lower()
    if response != 'y':
        print("已取消")
        return
    
    print()
    
    # 获取配置
    try:
        config = get_config()
    except Exception as e:
        logger.error(f"获取配置失败: {e}")
        return
    
    # 执行迁移
    start_time = datetime.now()
    
    project_count = migrate_projects_index(config)
    zip_count = migrate_zip_uploads(config)
    docs_count = migrate_documents_index(config)
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    # 统计
    print()
    print("=" * 60)
    print("迁移完成!")
    print("=" * 60)
    print(f"  - 项目索引: {project_count} 个")
    print(f"  - ZIP上传记录: {zip_count} 条")
    print(f"  - 项目文档索引: {docs_count} 个项目")
    print(f"  - 耗时: {elapsed:.2f} 秒")
    print()
    print("备份文件已创建（.backup_时间戳 后缀）")
    print()
    print("下一步:")
    print("  1. 重启应用使数据库生效")
    print("  2. 检查功能是否正常")
    print("  3. 如需回滚，删除 .db 文件，将 .backup_ 文件改回原名")
    print()


if __name__ == '__main__':
    main()
