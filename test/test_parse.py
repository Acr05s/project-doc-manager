import sys
sys.path.insert(0, r'd:\workspace\Doc\project_doc_manager')

from app.utils.requirements_loader import RequirementsLoader
from app.utils.base import DocumentConfig

config = DocumentConfig()
loader = RequirementsLoader(config)

result = loader.load(r'd:\workspace\Doc\需求清单.xlsx')

print("=== 解析结果 ===")
print(f"周期数量: {len(result.get('cycles', []))}")
print(f"周期列表: {result.get('cycles', [])}")
print(f"\n文档结构:")
for cycle, docs in result.get('documents', {}).items():
    print(f"\n周期: {cycle}")
    print(f"  必需文档数: {len(docs.get('required_docs', []))}")
    for doc in docs.get('required_docs', [])[:3]:  # 只显示前3个
        print(f"    - {doc.get('name')}: {doc.get('requirement', '无要求')}")
