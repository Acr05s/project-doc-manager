"""
生成示例需求清单Excel文件
运行此脚本可生成示例的需求清单文件
"""

import pandas as pd
from pathlib import Path


def create_sample_requirements():
    """生成示例需求清单"""
    
    # 示例数据
    data = {
        'A': [  # 项目周期
            '需求阶段',
            '需求阶段',
            '需求阶段',
            '概念设计',
            '概念设计',
            '概念设计',
            '详细设计',
            '详细设计',
            '详细设计',
            '开发阶段',
            '开发阶段',
            '开发阶段',
            '测试阶段',
            '测试阶段',
            '测试阶段',
            '验收交付',
            '验收交付'
        ],
        'B': [  # 预留列
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
        ],
        'C': [  # 文档名称
            '项目建议书',
            '可行性分析报告',
            '需求规格说明书',
            '概念设计评审表',
            '系统概要设计文档',
            '技术方案说明书',
            '详细设计文档',
            '数据库设计文档',
            '接口设计说明书',
            '源代码',
            '开发日志',
            '单元测试报告',
            '系统测试计划',
            '测试用例',
            '测试报告',
            '验收报告',
            '用户手册'
        ],
        'D': [  # 文档要求
            '需要技术负责人签字，公司盖章',
            '需要经理和技术负责人签字',
            '详细规格说明，需要客户确认签字',
            '内部评审，所有参与人签字',
            '架构师设计，需要盖章确认',
            '完整的技术方案，需要签字和盖章',
            '代码级详细设计，需要审核签字',
            'ER图和规范说明，需要签字确认',
            '所有接口定义清晰，技术负责人签字',
            '完整注释，代码审查通过',
            '每日开发记录和进度汇总',
            '单元测试覆盖率>80%，需要签字',
            '明确测试范围和测试策略',
            '科学全面的测试用例设计',
            '问题清单和通过验证，需要盖章',
            '客户最终验收签字，公司盖章',
            '操作指南和常见问题解决方案'
        ]
    }
    
    # 创建DataFrame
    df = pd.DataFrame(data)
    
    # 生成示例文件
    output_file = Path(__file__).parent / '示例需求清单.xlsx'
    
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, header=False, sheet_name='需求清单')
        
        # 可选：调整列宽
        worksheet = writer.sheets['需求清单']
        worksheet.column_dimensions['A'].width = 15
        worksheet.column_dimensions['C'].width = 20
        worksheet.column_dimensions['D'].width = 35
    
    print(f"✅ 示例文件已生成: {output_file}")
    print("\n文件说明:")
    print("- A列（项目周期）: 项目的各个阶段")
    print("- B列（预留）: 可用于其他信息")
    print("- C列（文档名称）: 该周期需要的文档名称")
    print("- D列（文档要求）: 对该文档的具体要求")


if __name__ == '__main__':
    create_sample_requirements()
