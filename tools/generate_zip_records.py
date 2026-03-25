#!/usr/bin/env python3
"""
生成项目ZIP上传记录工具

此工具用于手动扫描项目目录和上传目录，生成ZIP上传记录并保存到项目配置文件中。
当系统自动生成的上传记录丢失或出现故障时，可以使用此工具手动恢复。
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime


def load_projects(projects_dir):
    """加载所有项目信息"""
    projects = []
    
    # 扫描projects目录下的项目文件夹
    for item in projects_dir.iterdir():
        if item.is_dir() and not item.name.startswith('.'):
            project_config_file = item / 'project_config.json'
            if project_config_file.exists():
                try:
                    with open(project_config_file, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                        projects.append({
                            'id': config.get('id'),
                            'name': config.get('name', item.name),
                            'config_file': project_config_file
                        })
                except Exception as e:
                    print(f"加载项目 {item.name} 失败: {e}")
    
    return projects


def scan_uploads(projects_dir, project_name):
    """扫描项目的上传目录，查找ZIP文件和解压目录"""
    # 尝试多种可能的上传目录路径
    possible_uploads_dirs = [
        projects_dir / project_name / 'uploads',  # 项目目录下的uploads
        projects_dir.parent / 'uploads',  # 主上传目录
        Path('d:/workspace/Doc/uploads'),  # 绝对路径（使用正斜杠）
        Path('uploads')  # 相对路径
    ]
    
    zip_records = []
    
    print(f"正在扫描上传目录，项目名称: {project_name}")
    
    for uploads_dir in possible_uploads_dirs:
        print(f"尝试上传目录: {uploads_dir}")
        
        if uploads_dir.exists():
            print(f"上传目录存在: {uploads_dir}")
            
            try:
                items = list(uploads_dir.iterdir())
                print(f"上传目录中的项目数量: {len(items)}")
                for item in items:
                    if item.is_dir() and not item.name.startswith('.') and item.name != 'temp':
                        print(f"找到解压文件夹: {item.name}")
                        # 统计文件数量
                        try:
                            file_count = sum(1 for f in item.rglob('*') if f.is_file())
                            print(f"文件数量: {file_count}")
                            # 生成记录
                            zip_record = {
                                'id': f"zip_{datetime.now().strftime('%Y%m%d%H%M%S')}_{len(zip_records)}",
                                'name': item.name,
                                'path': str(item.relative_to(uploads_dir)),
                                'file_count': file_count,
                                'upload_time': datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                                'status': '已完成'
                            }
                            zip_records.append(zip_record)
                        except Exception as e:
                            print(f"统计文件数量失败: {e}")
            except Exception as e:
                print(f"扫描上传目录失败: {e}")
        else:
            print(f"上传目录不存在: {uploads_dir}")
    
    print(f"扫描完成，找到 {len(zip_records)} 个ZIP上传记录")
    return zip_records


def update_project_config(project_config_file, zip_records):
    """更新项目的ZIP上传记录文件"""
    try:
        # 创建专门的zip_uploads.json文件
        project_dir = project_config_file.parent
        zip_uploads_file = project_dir / 'zip_uploads.json'
        
        # 读取现有记录
        if zip_uploads_file.exists():
            with open(zip_uploads_file, 'r', encoding='utf-8') as f:
                existing_records = json.load(f)
        else:
            existing_records = []
        
        # 添加新记录
        existing_ids = set(record['id'] for record in existing_records)
        new_records = [record for record in zip_records if record['id'] not in existing_ids]
        
        existing_records.extend(new_records)
        
        # 保存更新后的记录
        with open(zip_uploads_file, 'w', encoding='utf-8') as f:
            json.dump(existing_records, f, ensure_ascii=False, indent=2)
        
        return len(new_records)
    except Exception as e:
        print(f"更新ZIP上传记录失败: {e}")
        return 0


def main():
    """主函数"""
    print("=== 生成项目ZIP上传记录工具 ===")
    print()
    
    # 获取项目目录
    project_doc_manager_dir = Path(__file__).parent.parent
    projects_dir = project_doc_manager_dir / 'projects'
    
    if not projects_dir.exists():
        print(f"项目目录不存在: {projects_dir}")
        return
    
    # 加载项目
    projects = load_projects(projects_dir)
    
    if not projects:
        print("未找到项目")
        return
    
    # 显示项目列表
    print("可用项目:")
    for i, project in enumerate(projects, 1):
        print(f"{i}. {project['name']} (ID: {project['id']})")
    print()
    
    # 选择项目
    while True:
        try:
            choice = int(input("请选择项目编号: ")) - 1
            if 0 <= choice < len(projects):
                selected_project = projects[choice]
                break
            else:
                print("请输入有效的项目编号")
        except ValueError:
            print("请输入数字")
    
    print(f"\n正在处理项目: {selected_project['name']}")
    
    # 扫描上传目录
    zip_records = scan_uploads(projects_dir, selected_project['name'])
    
    if not zip_records:
        print("未找到ZIP上传记录")
        return
    
    print(f"找到 {len(zip_records)} 个ZIP上传记录")
    for record in zip_records:
        print(f"- {record['name']} ({record['file_count']}个文件)")
    
    # 确认更新
    confirm = input("\n是否将这些记录添加到项目配置中？ (y/n): ")
    if confirm.lower() != 'y':
        print("操作取消")
        return
    
    # 更新ZIP上传记录
    new_count = update_project_config(selected_project['config_file'], zip_records)
    zip_uploads_file = selected_project['config_file'].parent / 'zip_uploads.json'
    print(f"\n成功添加 {new_count} 条新记录到ZIP上传记录中")
    print(f"记录已保存到: {zip_uploads_file}")


if __name__ == '__main__':
    main()
