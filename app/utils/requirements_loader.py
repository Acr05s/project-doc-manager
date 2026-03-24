"""需求加载模块

提供从Excel和JSON文件加载项目配置的功能。
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

import pandas as pd

from .base import DocumentConfig, setup_logging

logger = setup_logging(__name__)


class RequirementsLoader:
    """需求加载器"""
    
    def __init__(self, config: DocumentConfig):
        """初始化需求加载器
        
        Args:
            config: 文档配置实例
        """
        self.config = config
    
    def load_from_excel(self, excel_file: str) -> Dict[str, Any]:
        """从Excel加载项目配置和文档结构
        
        智能识别Excel格式，支持多种表头结构：
        - 第1行：表标题（可选）
        - 第2行：列标题（分类、序号、文档名称、备注）
        - 第3行开始：数据
        - 第一列: 分类/项目周期（合并单元格，只有第一行有值）
        - 第二列: 序号
        - 第三列: 文档名称
        - 第四列: 备注/文档要求
        
        智能识别文档要求：
        - 包含"签名"或"签字"：需要签名
        - 包含"盖章"或"章"：需要盖章
        - 包含"甲方"：甲方相关
        - 包含"乙方"：乙方相关
        - 包含"业主"：业主相关
        
        Args:
            excel_file: Excel文件路径
            
        Returns:
            dict: 项目配置
        """
        try:
            logger.info(f"加载Excel文件: {excel_file}")
            
            # 读取Excel，不使用header
            df = pd.read_excel(excel_file)
            
            logger.info(f"Excel文件读取成功，共 {len(df)} 行，列名: {df.columns.tolist()}")
            
            # 提取项目周期和文档结构
            project_config = {
                'cycles': [],
                'documents': {}
            }
            
            current_cycle = None
            data_start_row = self._detect_data_start_row(df)
            
            logger.info(f"检测到数据从第 {data_start_row + 1} 行开始")
            
            for idx, row in df.iterrows():
                try:
                    # 跳过表头行
                    if idx < data_start_row:
                        continue
                    
                    # 获取分类（第一列）
                    category = None
                    for col_name in ['Unnamed: 0', 0, '分类', '周期', '项目周期']:
                        if col_name in row:
                            val = row.get(col_name)
                            if pd.notna(val) and str(val).strip():
                                category = val
                                break
                    
                    # 如果分类有值且不是NaN，则是新的周期
                    if category is not None and str(category).strip():
                        current_cycle = str(category).strip()
                        if current_cycle not in project_config['documents']:
                            project_config['cycles'].append(current_cycle)
                            project_config['documents'][current_cycle] = {
                                'required_docs': [],
                                'uploaded_docs': []
                            }
                    
                    # 如果没有当前周期，跳过
                    if not current_cycle:
                        continue
                    
                    # 获取序号（第二列）
                    doc_index = None
                    for col_name in ['Unnamed: 1', 1, '序号']:
                        if col_name in row:
                            val = row.get(col_name)
                            if pd.notna(val):
                                doc_index = val
                                break
                    
                    # 获取文档名称（第三列）
                    doc_name = None
                    for col_name in ['Unnamed: 2', 2, '文档名称', '文件名', '名称']:
                        if col_name in row:
                            val = row.get(col_name)
                            if pd.notna(val) and str(val).strip():
                                doc_name = str(val).strip()
                                break
                    
                    if doc_name:
                        # 获取文档要求/备注（第四列）
                        doc_requirement = ''
                        for col_name in ['Unnamed: 3', 3, '备注', '要求', '文档要求']:
                            if col_name in row:
                                val = row.get(col_name)
                                if pd.notna(val):
                                    doc_requirement = str(val).strip()
                                    break
                        
                        # 智能标准化文档要求
                        doc_requirement = self._standardize_requirement(doc_requirement)
                        
                        project_config['documents'][current_cycle]['required_docs'].append({
                            'index': int(doc_index) if (
                                pd.notna(doc_index) and str(doc_index).strip() != ''
                            ) else len(project_config['documents'][current_cycle]['required_docs']) + 1,
                            'name': doc_name,
                            'requirement': doc_requirement,
                            'status': 'pending'
                        })
                except Exception as row_error:
                    logger.warning(f"处理第 {idx} 行时出错: {row_error}，跳过该行")
                    continue
            
            logger.info(f"成功加载项目配置，包含 {len(project_config['cycles'])} 个周期")
            logger.info(f"周期列表: {project_config['cycles']}")
            return project_config
            
        except Exception as e:
            logger.error(f"加载Excel失败: {e}")
            import traceback
            logger.error(f"详细错误信息: {traceback.format_exc()}")
            return {'cycles': [], 'documents': {}}
    
    def _detect_data_start_row(self, df) -> int:
        """智能检测数据起始行
        
        通过分析前几行内容，判断哪一行开始是实际数据：
        - 如果某行包含"分类"、"序号"、"文档名称"等列标题关键词，则下一行是数据
        - 如果没有找到列标题，则默认从第3行开始（索引2）
        
        Args:
            df: pandas DataFrame
            
        Returns:
            int: 数据起始行的索引
        """
        header_keywords = ['分类', '序号', '文档名称', '文件名', '名称', '备注', '要求', '文档要求', '周期', '项目周期']
        
        # 检查前5行
        for idx in range(min(5, len(df))):
            row = df.iloc[idx]
            row_text = ' '.join([str(v) for v in row.values if pd.notna(v)]).lower()
            
            # 如果这一行包含多个列标题关键词，则下一行是数据
            keyword_count = sum(1 for kw in header_keywords if kw.lower() in row_text)
            if keyword_count >= 2:
                logger.info(f"检测到列标题在第 {idx + 1} 行，数据从第 {idx + 2} 行开始")
                return idx + 1
        
        # 默认从第3行开始（索引2）
        logger.info(f"未检测到列标题，默认从第 3 行开始")
        return 2
    
    def _standardize_requirement(self, requirement: str) -> str:
        """智能标准化文档要求
        
        Args:
            requirement: 原始要求文本
            
        Returns:
            str: 标准化后的要求文本
        """
        if not requirement or not requirement.strip():
            return ''
        
        req_lower = requirement.lower()
        req_parts = []
        
        # 智能识别并标准化要求
        if '签名' in requirement or '签字' in requirement:
            if '甲方' in requirement:
                req_parts.append('甲方签字')
            elif '乙方' in requirement:
                req_parts.append('乙方签字')
            elif '业主' in requirement:
                req_parts.append('业主签字')
            else:
                req_parts.append('签字')
        
        if '盖章' in requirement or '章' in requirement:
            if '甲方' in requirement:
                req_parts.append('甲方盖章')
            elif '乙方' in requirement:
                req_parts.append('乙方盖章')
            else:
                req_parts.append('盖章')
        
        # 如果没有识别出任何标准要求，保留原始文本
        if not req_parts:
            return requirement.strip()
        
        return '、'.join(req_parts)
    
    def load_from_json(self, json_file: str) -> Dict[str, Any]:
        """从JSON文件加载项目配置和文档结构
        
        Args:
            json_file: JSON文件路径
            
        Returns:
            dict: 项目配置
        """
        try:
            logger.info(f"加载JSON文件: {json_file}")
            
            with open(json_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
            
            # 确保必要字段存在
            if 'cycles' not in project_config:
                project_config['cycles'] = []
            if 'documents' not in project_config:
                project_config['documents'] = {}
            
            # 确保每个周期都有required_docs和uploaded_docs
            for cycle in project_config['cycles']:
                if cycle not in project_config['documents']:
                    project_config['documents'][cycle] = {
                        'required_docs': [],
                        'uploaded_docs': []
                    }
                else:
                    if 'required_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['required_docs'] = []
                    if 'uploaded_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['uploaded_docs'] = []
            
            logger.info(f"成功从JSON加载项目配置，包含 {len(project_config['cycles'])} 个周期")
            return project_config
            
        except Exception as e:
            logger.error(f"加载JSON失败: {e}")
            return {'cycles': [], 'documents': {}}
    
    def load(self, file_path: str) -> Dict[str, Any]:
        """从文件加载项目配置（自动识别Excel或JSON格式）
        
        Args:
            file_path: 文件路径
            
        Returns:
            dict: 项目配置
        """
        file_ext = Path(file_path).suffix.lower()
        
        if file_ext in ['.xlsx', '.xls']:
            return self.load_from_excel(file_path)
        elif file_ext == '.json':
            return self.load_from_json(file_path)
        else:
            raise ValueError(
                f"不支持的文件格式: {file_ext}，请使用Excel (.xlsx, .xls) 或 JSON (.json)"
            )
    
    def export_to_json(self, project_config: Dict[str, Any]) -> str:
        """导出项目配置为JSON格式
        
        Args:
            project_config: 项目配置
            
        Returns:
            str: JSON字符串
        """
        try:
            # 创建导出配置
            export_config = {
                "项目信息": {
                    "项目名称": project_config.get('name', '未命名项目'),
                    "创建时间": project_config.get('created_time', ''),
                    "项目周期": project_config.get('cycles', []),
                    "甲方": project_config.get('party_a', ''),
                    "乙方": project_config.get('party_b', ''),
                    "监理": project_config.get('supervisor', '')
                },
                "资料需求": {
                    "项目周期": project_config.get('cycles', []),
                    "文档要求": {}
                }
            }
            
            # 添加文档要求
            documents = project_config.get('documents', {})
            for cycle, docs_info in documents.items():
                docs_list = []
                for doc in docs_info.get('required_docs', []):
                    docs_list.append({
                        'name': doc.get('name', ''),
                        'requirement': doc.get('requirement', ''),
                        'status': doc.get('status', 'pending')
                    })
                export_config["资料需求"]["文档要求"][cycle] = docs_list
            
            return json.dumps(export_config, ensure_ascii=False, indent=2)
            
        except Exception as e:
            logger.error(f"导出JSON失败: {e}")
            return '{}'
    
    def validate_requirements(self, requirements: Dict[str, Any]) -> Dict[str, Any]:
        """验证需求配置
        
        Args:
            requirements: 需求配置
            
        Returns:
            Dict: 验证结果
        """
        errors = []
        warnings = []
        
        # 检查必要字段
        if not requirements.get('cycles'):
            errors.append("缺少周期列表")
        
        if not requirements.get('documents'):
            errors.append("缺少文档配置")
        
        # 检查每个周期
        for cycle in requirements.get('cycles', []):
            docs = requirements.get('documents', {}).get(cycle, {})
            if not docs.get('required_docs'):
                warnings.append(f"周期 '{cycle}' 没有文档要求")
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }
    
    def merge_requirements(self, base: Dict[str, Any], 
                         additional: Dict[str, Any]) -> Dict[str, Any]:
        """合并需求配置
        
        Args:
            base: 基础配置
            additional: 附加配置
            
        Returns:
            Dict: 合并后的配置
        """
        merged = base.copy()
        
        # 合并周期
        base_cycles = set(merged.get('cycles', []))
        add_cycles = set(additional.get('cycles', []))
        merged['cycles'] = list(base_cycles | add_cycles)
        
        # 合并文档
        if 'documents' not in merged:
            merged['documents'] = {}
        
        for cycle, docs_info in additional.get('documents', {}).items():
            if cycle not in merged['documents']:
                merged['documents'][cycle] = {
                    'required_docs': [],
                    'uploaded_docs': []
                }
            
            # 合并required_docs
            existing_names = {
                doc['name'] for doc in merged['documents'][cycle].get('required_docs', [])
            }
            for doc in docs_info.get('required_docs', []):
                if doc['name'] not in existing_names:
                    merged['documents'][cycle]['required_docs'].append(doc)
        
        return merged
