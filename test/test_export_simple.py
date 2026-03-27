#!/usr/bin/env python3
"""
简单测试导出需求清单功能
"""

import json
from app.utils.document_manager import DocumentManager

# 测试导出需求清单功能
def test_export():
    print("=== 测试导出需求清单功能 ===")
    
    try:
        # 创建文档管理器实例
        doc_manager = DocumentManager()
        print("✓ 创建文档管理器成功")
        
        # 加载项目
        project_id = "project_20260321080707"
        result = doc_manager.load_project(project_id)
        
        if result.get('status') != 'success':
            print(f"✗ 加载项目失败: {result.get('message')}")
            return False
        
        project_config = result.get('project', {})
        print(f"✓ 加载项目成功: {project_config.get('name')}")
        
        # 导出需求清单
        json_content = doc_manager.export_requirements_to_json(project_config)
        print("✓ 导出需求清单成功")
        
        # 保存到文件
        output_file = f"requirements_{project_config.get('name', 'project')}_simple.json"
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
            return False
        
        print("\n=== 测试完成 ===")
        print("✓ 所有测试通过！导出需求清单功能正常工作。")
        return True
        
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_export()
    exit(0 if success else 1)
