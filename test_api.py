#!/usr/bin/env python3
"""
测试导出需求清单API端点
"""

import requests
import json

# 测试API端点
def test_export_api():
    try:
        # API端点URL
        url = "http://127.0.0.1:5000/api/project/export-requirements"
        params = {"project_id": "project_20260321080707"}
        
        print(f"测试API端点: {url}")
        print(f"参数: {params}")
        
        # 发送GET请求
        response = requests.get(url, params=params)
        
        print(f"响应状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")
        
        if response.status_code == 200:
            # 保存响应内容
            content = response.text
            output_file = "api_export_result.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"\nAPI测试成功！")
            print(f"响应内容已保存到: {output_file}")
            print("\n响应内容预览:")
            print(content[:500] + "..." if len(content) > 500 else content)
            return True
        else:
            print(f"\nAPI测试失败: {response.status_code}")
            print(f"响应内容: {response.text}")
            return False
    except Exception as e:
        print(f"测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_export_api()
    exit(0 if success else 1)
