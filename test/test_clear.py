import requests
import json

# 测试删除需求（清空 cycles 和 documents）
project_id = "project_20260324141019"
url = f"http://localhost:5001/api/projects/{project_id}"

cleared_config = {
    "id": project_id,
    "name": "智慧党建",
    "cycles": [],
    "documents": {},
    "updated_time": "2026-03-24T14:33:00.000000"
}

response = requests.put(url, json=cleared_config)
print("保存结果:", response.json())

# 验证
response = requests.get(f"http://localhost:5001/api/projects/{project_id}")
project = response.json()
print("\n验证结果:")
print("周期数:", len(project['project']['cycles']))
print("周期列表:", project['project']['cycles'])
