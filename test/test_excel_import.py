import requests
import os

# 测试Excel导入API
url = 'http://localhost:5000/api/projects/load'
file_path = 'd:\workspace\Doc\需求清单.xlsx'

if not os.path.exists(file_path):
    print(f"文件不存在: {file_path}")
    exit(1)

print(f"测试Excel导入: {file_path}")

# 准备文件上传
try:
    with open(file_path, 'rb') as f:
        files = {'file': ('需求清单.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = requests.post(url, files=files)
        
    print(f"响应状态码: {response.status_code}")
    print(f"响应内容: {response.text}")
    
except Exception as e:
    print(f"测试失败: {e}")
