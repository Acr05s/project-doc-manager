#!/usr/bin/env python3
"""
移动项目配置文件到对应的项目目录

将projects目录下的项目配置文件（如project_20260324211200.json）移动到对应的项目目录中，
并重命名为project_config.json
"""

import json
import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).parent
PROJECTS_DIR = BASE_DIR / 'projects'


def main():
    """主函数"""
    print("开始移动项目配置文件...")
    
    # 读取项目索引
    index_file = PROJECTS_DIR / 'projects_index.json'
    if not index_file.exists():
        print("错误: 项目索引文件不存在")
        return
    
    with open(index_file, 'r', encoding='utf-8') as f:
        index_data = json.load(f)
    
    # 提取项目信息
    projects = {}
    for key, value in index_data.items():
        if isinstance(value, dict) and 'id' in value and 'name' in value:
            projects[value['id']] = value['name']
    
    print(f"找到 {len(projects)} 个项目")
    
    # 移动每个项目的配置文件
    moved_count = 0
    for project_id, project_name in projects.items():
        # 旧配置文件路径
        old_config_file = PROJECTS_DIR / f"{project_id}.json"
        if not old_config_file.exists():
            print(f"警告: 项目 {project_name} 的配置文件不存在: {old_config_file}")
            continue
        
        # 创建项目目录
        project_dir = PROJECTS_DIR / project_name
        project_dir.mkdir(parents=True, exist_ok=True)
        
        # 新配置文件路径
        new_config_file = project_dir / 'project_config.json'
        
        # 移动文件
        try:
            # 读取旧文件内容
            with open(old_config_file, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            
            # 写入新文件
            with open(new_config_file, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, ensure_ascii=False, indent=2)
            
            # 删除旧文件
            old_config_file.unlink()
            
            print(f"✓ 已移动项目配置: {project_name} -> {new_config_file}")
            moved_count += 1
        except Exception as e:
            print(f"✗ 移动项目配置失败 {project_name}: {e}")
    
    # 处理None.json文件
    none_json_file = PROJECTS_DIR / 'None.json'
    if none_json_file.exists():
        print(f"✗ 发现 None.json 文件，这可能是一个错误的配置文件，建议手动检查")
    
    print(f"\n移动完成: 成功移动 {moved_count} 个项目配置文件")
    print("\n现在所有项目配置文件都保存在对应的项目目录中，您可以直接打包项目目录发送给别人。")


if __name__ == '__main__':
    main()
