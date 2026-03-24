#!/usr/bin/env python3
"""
直接测试导出需求清单API，不启动服务器
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import create_app

# 测试导出需求清单API
def test_export_api():
    print("=== 测试导出需求清单API ===")
    
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
            output_file = "api_test_result.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"\nAPI测试成功！")
            print(f"响应内容已保存到: {output_file}")
            print(f"文件大小: {len(content)} 字节")
            print("\n响应内容预览:")
            print(content[:500] + "..." if len(content) > 500 else content)
            return True
        else:
            print(f"\nAPI测试失败: {response.status_code}")
            print(f"响应内容: {response.data.decode('utf-8')}")
            return False

if __name__ == "__main__":
    success = test_export_api()
    exit(0 if success else 1)
