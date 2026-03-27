#!/usr/bin/env python3
"""
测试导出需求清单功能
"""

import json
import sys
from app.utils.document_manager import DocumentManager

# 测试导出需求清单功能
def test_export_requirements():
    try:
        # 创建文档管理器实例
        doc_manager = DocumentManager()
        
        # 加载测试项目
        project_id = "project_20260321080707"
        result = doc_manager.load_project(project_id)
        
        if result.get('status') != 'success':
            print(f"加载项目失败: {result.get('message')}")
            return False
        
        project_config = result.get('project', {})
        
        # 导出需求清单
        json_content = doc_manager.export_requirements_to_json(project_config)
        
        # 保存到文件
        output_file = f"requirements_{project_config.get('name', 'project')}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(json_content)
        
        print(f"导出成功！文件已保存到: {output_file}")
        print("\n导出内容预览:")
        print(json_content[:500] + "..." if len(json_content) > 500 else json_content)
        
        return True
    except Exception as e:
        print(f"测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_export_requirements()
    sys.exit(0 if success else 1)
