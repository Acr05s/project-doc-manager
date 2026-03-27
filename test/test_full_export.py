#!/usr/bin/env python3
"""
综合测试导出需求清单功能
"""

import json
import os
from app.utils.document_manager import DocumentManager

# 测试完整的导出流程
def test_full_export():
    try:
        print("=== 测试导出需求清单功能 ===")
        
        # 1. 创建文档管理器实例
        doc_manager = DocumentManager()
        print("✓ 创建文档管理器成功")
        
        # 2. 加载测试项目
        project_id = "project_20260321080707"
        print(f"✓ 加载项目: {project_id}")
        
        result = doc_manager.load_project(project_id)
        if result.get('status') != 'success':
            print(f"✗ 加载项目失败: {result.get('message')}")
            return False
        
        project_config = result.get('project', {})
        print(f"✓ 项目加载成功: {project_config.get('name')}")
        
        # 3. 导出需求清单
        print("✓ 开始导出需求清单")
        json_content = doc_manager.export_requirements_to_json(project_config)
        
        # 4. 验证导出内容
        if not json_content:
            print("✗ 导出内容为空")
            return False
        
        # 5. 解析JSON内容
        try:
            parsed_json = json.loads(json_content)
            print("✓ JSON格式正确")
            
            # 验证关键字段
            if '项目信息' in parsed_json:
                print(f"✓ 包含项目信息: {parsed_json['项目信息'].get('项目名称')}")
            if '需求清单' in parsed_json:
                cycles = parsed_json['需求清单']
                print(f"✓ 包含需求清单: {len(cycles)} 个周期")
                
                # 验证第一个周期
                if cycles:
                    first_cycle = list(cycles.keys())[0]
                    docs = cycles[first_cycle]
                    print(f"✓ 第一个周期 '{first_cycle}' 包含 {len(docs)} 个文档")
                    
        except json.JSONDecodeError as e:
            print(f"✗ JSON解析失败: {e}")
            return False
        
        # 6. 保存到文件
        output_file = f"requirements_{project_config.get('name', 'project')}_test.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(json_content)
        
        print(f"✓ 导出成功！文件已保存到: {output_file}")
        print(f"✓ 文件大小: {os.path.getsize(output_file)} 字节")
        
        print("\n=== 测试完成 ===")
        print("所有测试通过！导出需求清单功能正常工作。")
        return True
        
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_full_export()
    exit(0 if success else 1)
