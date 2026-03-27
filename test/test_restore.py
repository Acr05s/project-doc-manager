import requests

# 恢复之前的数据
project_id = "project_20260324141019"
url_load = "http://localhost:5001/api/project/load"
file_path = r"d:\workspace\Doc\需求清单.xlsx"

with open(file_path, 'rb') as f:
    files = {'file': f}
    response = requests.post(url_load, files=files)
    
result = response.json()

# 保存到项目
url_save = f"http://localhost:5001/api/projects/{project_id}"
save_data = result['data']
save_data['id'] = project_id
save_data['name'] = '智慧党建'

response = requests.put(url_save, json=save_data)
print("恢复结果:", response.json()['status'])
