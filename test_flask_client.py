#!/usr/bin/env python3
"""
使用Flask测试客户端测试导出需求清单API
"""

from main import create_app

# 创建Flask应用实例
app = create_app()

# 测试导出需求清单API
def test_export_requirements_api():
    with app.test_client() as client:
        # 测试导出需求清单端点
        project_id = "project_20260321080707"
        response = client.get(f"/api/project/export-requirements?project_id={project_id}")
        
        print(f"测试API端点: /api/project/export-requirements")
        print(f"项目ID: {project_id}")
        print(f"响应状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")
        
        if response.status_code == 200:
            # 保存响应内容
            content = response.data.decode('utf-8')
            output_file = "flask_client_export_result.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"\nAPI测试成功！")
            print(f"响应内容已保存到: {output_file}")
            print("\n响应内容预览:")
            print(content[:500] + "..." if len(content) > 500 else content)
            return True
        else:
            print(f"\nAPI测试失败: {response.status_code}")
            print(f"响应内容: {response.data.decode('utf-8')}")
            return False

if __name__ == "__main__":
    success = test_export_requirements_api()
    exit(0 if success else 1)
