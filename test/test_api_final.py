#!/usr/bin/env python3
"""
最终测试导出需求清单API
"""

import sys
import os
import json

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import create_app

# 测试导出需求清单API
def test_export_api():
    print("=== 最终测试导出需求清单API ===")
    
    # 创建Flask应用实例
    app = create_app()
    
    with app.test_client() as client:
        # 测试导出需求清单端点
        project_id = "project_20260321080707"
        print(f"测试项目ID: {project_id}")
        
        # 发送GET请求
        response = client.get(f"/api/project/export-requirements?project_id={project_id}")
        
        print(f"响应状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")
        
        if response.status_code == 200:
            # 保存响应内容
            content = response.data.decode('utf-8')
            output_file = "final_export_result.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"\nAPI测试成功！")
            print(f"响应内容已保存到: {output_file}")
            print(f"文件大小: {len(content)} 字节")
            
            # 验证JSON格式
            try:
                parsed_json = json.loads(content)
                print("\nJSON格式验证成功！")
                print(f"项目名称: {parsed_json.get('项目信息', {}).get('项目名称')}")
                print(f"项目周期数量: {len(parsed_json.get('项目信息', {}).get('项目周期', []))}")
                print(f"需求清单周期数量: {len(parsed_json.get('需求清单', {}))}")
            except json.JSONDecodeError as e:
                print(f"\nJSON格式验证失败: {e}")
                return False
            
            return True
        else:
            print(f"\nAPI测试失败: {response.status_code}")
            print(f"响应内容: {response.data.decode('utf-8')}")
            return False

if __name__ == "__main__":
    success = test_export_api()
    if success:
        print("\n✓ 所有测试通过！导出需求清单功能正常工作。")
    else:
        print("\n✗ 测试失败！导出需求清单功能存在问题。")
    exit(0 if success else 1)
