#!/usr/bin/env python3
"""
命令行工具：导出需求清单

使用方法：
    python export_requirements.py [project_id]

示例：
    python export_requirements.py project_20260321080707
"""

import sys
import json
from app.utils.document_manager import DocumentManager

# 主函数
def main():
    print("=== 导出需求清单工具 ===")
    
    # 获取项目ID
    if len(sys.argv) > 1:
        project_id = sys.argv[1]
    else:
        project_id = "project_20260321080707"  # 默认项目ID
    
    print(f"正在导出项目 {project_id} 的需求清单...")
    
    try:
        # 创建文档管理器实例
        doc_manager = DocumentManager()
        print("✓ 创建文档管理器成功")
        
        # 加载项目
        result = doc_manager.load_project(project_id)
        
        if result.get('status') != 'success':
            print(f"✗ 加载项目失败: {result.get('message')}")
            return 1
        
        project_config = result.get('project', {})
        project_name = project_config.get('name', '未知项目')
        print(f"✓ 加载项目成功: {project_name}")
        
        # 导出需求清单
        json_content = doc_manager.export_requirements_to_json(project_config)
        print("✓ 导出需求清单成功")
        
        # 保存到文件
        output_file = f"requirements_{project_name}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(json_content)
        print(f"✓ 保存文件成功: {output_file}")
        
        # 验证JSON格式
        try:
            parsed_json = json.loads(json_content)
            print("✓ JSON格式验证成功")
            print(f"  项目名称: {parsed_json.get('项目信息', {}).get('项目名称')}")
            print(f"  项目周期: {len(parsed_json.get('项目信息', {}).get('项目周期', []))} 个")
            print(f"  需求清单: {len(parsed_json.get('需求清单', {}))} 个周期")
        except json.JSONDecodeError as e:
            print(f"✗ JSON格式验证失败: {e}")
            return 1
        
        print("\n=== 导出完成 ===")
        print(f"✓ 需求清单已成功导出到: {output_file}")
        print("\n使用方法：")
        print("1. 运行此脚本：python export_requirements.py [项目ID]")
        print("2. 查看生成的JSON文件")
        print("3. 根据需要修改或使用导出的数据")
        
        return 0
        
    except Exception as e:
        print(f"✗ 导出失败: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
