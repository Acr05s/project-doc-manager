#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理 requirements.json 中的 uploaded_docs 旧数据

使用方法:
    python cleanup_requirements.py <项目名称>
    
示例:
    python cleanup_requirements.py 智慧党建
"""

import json
import sys
from pathlib import Path

# 项目基础路径
PROJECTS_BASE = Path(__file__).parent.parent / "projects"


def cleanup_requirements(project_name):
    """清理指定项目的 requirements.json"""
    req_path = PROJECTS_BASE / project_name / "config" / "requirements.json"
    
    if not req_path.exists():
        print(f"未找到 requirements.json: {req_path}")
        return False
    
    try:
        with open(req_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        documents = data.get('documents', {})
        cleaned_count = 0
        
        for cycle_name, cycle_data in documents.items():
            if 'uploaded_docs' in cycle_data and cycle_data['uploaded_docs']:
                count = len(cycle_data['uploaded_docs'])
                cycle_data['uploaded_docs'] = []
                cleaned_count += count
                print(f"  清理周期 {cycle_name}: {count} 个 uploaded_docs")
        
        if cleaned_count > 0:
            # 保存清理后的文件
            with open(req_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"\n共清理 {cleaned_count} 个旧数据记录")
            print("已保存清理后的文件")
        else:
            print("未发现需要清理的旧数据")
        
        return True
        
    except Exception as e:
        print(f"清理失败: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("用法: python cleanup_requirements.py <项目名称>")
        print("示例:")
        print("  python cleanup_requirements.py 智慧党建")
        sys.exit(1)
    
    project_name = sys.argv[1]
    
    print(f"开始清理项目: {project_name}")
    print()
    
    if cleanup_requirements(project_name):
        print("\n[OK] 清理完成")
    else:
        print("\n[ERROR] 清理失败")
        sys.exit(1)


if __name__ == '__main__':
    main()
