import requests
import json

# 测试API地址
base_url = 'http://localhost:5000/api/documents'

# 测试文档ID（从项目配置文件中获取一个真实的文档ID）
test_doc_id = '7、系统开发测试_项目程序员开发手册_20260324_213326'

def test_get_document():
    """测试获取文档信息API"""
    print("测试获取文档信息API...")
    url = f"{base_url}/{test_doc_id}"
    response = requests.get(url)
    print(f"状态码: {response.status_code}")
    print(f"响应内容: {json.dumps(response.json(), ensure_ascii=False, indent=2)}")
    return response.json()

def test_view_document():
    """测试查看文档API"""
    print("\n测试查看文档API...")
    url = f"{base_url}/view/{test_doc_id}"
    response = requests.get(url)
    print(f"状态码: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"文件大小: {len(response.content)} bytes")
    return response.status_code

def test_download_document():
    """测试下载文档API"""
    print("\n测试下载文档API...")
    url = f"{base_url}/download/{test_doc_id}"
    response = requests.get(url)
    print(f"状态码: {response.status_code}")
    print(f"Content-Type: {response.headers.get('Content-Type')}")
    print(f"Content-Disposition: {response.headers.get('Content-Disposition')}")
    print(f"文件大小: {len(response.content)} bytes")
    return response.status_code

if __name__ == "__main__":
    print("开始测试API...")
    print(f"测试文档ID: {test_doc_id}")
    
    # 测试获取文档信息
    doc_info = test_get_document()
    
    # 测试查看文档
    view_status = test_view_document()
    
    # 测试下载文档
    download_status = test_download_document()
    
    print("\n测试完成！")
