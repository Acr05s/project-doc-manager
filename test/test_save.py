import requests
import json

# 1. 先解析 Excel
url_load = "http://localhost:5001/api/project/load"
file_path = r"d:\workspace\Doc\需求清单.xlsx"

with open(file_path, 'rb') as f:
    files = {'file': f}
    response = requests.post(url_load, files=files)
    
result = response.json()
print("解析结果状态:", result['status'])
print("周期数:", len(result['data']['cycles']))

# 2. 保存到项目
project_id = "project_20260324141019"
url_save = f"http://localhost:5001/api/projects/{project_id}"

save_data = result['data']
save_data['id'] = project_id
save_data['name'] = '智慧党建'

response = requests.put(url_save, json=save_data)
print("\n保存结果:", response.json())

# 3. 验证保存
url_get = f"http://localhost:5001/api/projects/{project_id}"
response = requests.get(url_get)
project = response.json()

print("\n验证结果:")
print("周期数:", len(project['project']['cycles']))
print("周期列表:", project['project']['cycles'])
