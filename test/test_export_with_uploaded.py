#!/usr/bin/env python3
"""
测试导出需求清单功能（包含已上传文档）
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.utils.document_manager import DocumentManager

def test_export_requirements_with_uploaded():
    """测试导出需求清单功能（包含已上传文档）"""
    print("测试导出需求清单功能（包含已上传文档）...")
    
    # 创建文档管理器实例
    doc_manager = DocumentManager()
    
    # 模拟项目配置（包含已上传文档）
    project_config = {
        'id': 'test_project',
        'name': '测试项目',
        'created_time': '2026-03-23T12:00:00',
        'cycles': ['项目立项', '项目准备'],
        'documents': {
            '项目立项': {
                'required_docs': [
                    {
                        'index': 1,
                        'name': '项目立项报告',
                        'requirement': '需要领导签字',
                        'status': 'uploaded'
                    }
                ],
                'uploaded_docs': [
                    {
                        'doc_id': 'project_init_report_001',
                        'doc_name': '项目立项报告',
                        'original_filename': '项目立项报告_v1.0.docx',
                        'file_path': 'uploads/项目立项/项目立项报告/项目立项报告_v1.0.docx',
                        'upload_time': '2026-03-23T13:00:00',
                        'doc_date': '2026-03-20',
                        'signer': '张三',
                        'sign_date': '2026-03-22',
                        'has_seal': True,
                        'party_a_seal': True,
                        'party_b_seal': False,
                        'other_seal': ''
                    }
                ]
            },
            '项目准备': {
                'required_docs': [
                    {
                        'index': 1,
                        'name': '项目计划',
                        'requirement': '需要团队成员签字',
                        'status': 'uploaded'
                    }
                ],
                'uploaded_docs': [
                    {
                        'doc_id': 'project_plan_001',
                        'doc_name': '项目计划',
                        'original_filename': '项目计划_v1.0.xlsx',
                        'file_path': 'uploads/项目准备/项目计划/项目计划_v1.0.xlsx',
                        'upload_time': '2026-03-23T14:00:00',
                        'doc_date': '2026-03-21',
                        'signer': '李四',
                        'sign_date': '2026-03-23',
                        'has_seal': False,
                        'party_a_seal': False,
                        'party_b_seal': True,
                        'other_seal': ''
                    }
                ]
            }
        }
    }
    
    try:
        # 测试导出功能
        json_content = doc_manager.export_requirements_to_json(project_config)
        print("导出成功!")
        print("导出的JSON内容:")
        print(json_content)
        
        # 验证导出的JSON格式是否符合模板
        import json
        export_data = json.loads(json_content)
        
        # 检查必要的键
        assert '项目信息' in export_data
        assert '资料需求' in export_data
        assert '目录结构' in export_data
        assert '匹配结果' in export_data
        
        # 检查目录结构
        assert '项目立项' in export_data['目录结构']
        assert '项目准备' in export_data['目录结构']
        
        # 检查匹配结果
        assert '项目立项' in export_data['匹配结果']
        assert '项目准备' in export_data['匹配结果']
        assert '项目立项报告' in export_data['匹配结果']['项目立项']
        assert '项目计划' in export_data['匹配结果']['项目准备']
        
        # 检查已匹配文件
        assert len(export_data['匹配结果']['项目立项']['项目立项报告']['已匹配文件']) > 0
        assert len(export_data['匹配结果']['项目准备']['项目计划']['已匹配文件']) > 0
        
        print("\n验证成功! 导出的JSON格式符合模板要求，包含目录结构和匹配结果。")
        return True
    
    except Exception as e:
        print(f"测试失败: {e}")
        return False

if __name__ == '__main__':
    test_export_requirements_with_uploaded()
