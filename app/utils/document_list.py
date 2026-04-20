"""文档清单模块

提供文档清单的创建、加载和保存功能。
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

from .base import DocumentConfig, setup_logging
from .folder_manager import FolderManager
from .doc_naming import DocumentNamer

logger = setup_logging(__name__)


class DocumentListManager:
    """文档清单管理器"""
    
    def __init__(self, config: DocumentConfig, folder_manager: FolderManager):
        """初始化文档清单管理器
        
        Args:
            config: 文档配置实例
            folder_manager: 文件夹管理器实例
        """
        self.config = config
        self.folder_manager = folder_manager
        self.namer = DocumentNamer(config)
    
    def create(self, project_name: str, project_info: Dict[str, Any],
              requirements: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """创建新的文档清单
        
        Args:
            project_name: 项目名称
            project_info: 项目基本信息
            requirements: 需求数据（可选）
            
        Returns:
            Dict: 创建的文档清单
        """
        doc_list = {
            'version': '2.0',
            'project_name': project_name,
            'created_time': self._get_timestamp(),
            'updated_time': self._get_timestamp(),
            'project_info': project_info,
            'cycles': []
        }
        
        # 如果有需求，自动生成周期和文档结构
        if requirements:
            self._generate_from_requirements(doc_list, requirements)
        
        # 保存到文件
        self.save(project_name, doc_list)
        
        logger.info(f"已创建文档清单: {project_name}")
        return doc_list
    
    def _generate_from_requirements(self, doc_list: Dict, requirements: Dict):
        """根据需求生成文档清单结构
        
        Args:
            doc_list: 文档清单
            requirements: 需求数据
        """
        # 解析需求中的周期和文档类型
        cycles_data = requirements.get('cycles', [])
        
        for cycle_info in cycles_data:
            cycle_name = cycle_info.get('name', '')
            docs_info = cycle_info.get('documents', [])
            
            cycle_entry = {
                'name': cycle_name,
                'description': cycle_info.get('description', ''),
                'documents': []
            }
            
            for doc_info in docs_info:
                doc_entry = {
                    'name': doc_info.get('name', ''),
                    'requirement': doc_info.get('requirement', ''),
                    'files': [],
                    'status': 'pending'
                }
                cycle_entry['documents'].append(doc_entry)
            
            doc_list['cycles'].append(cycle_entry)
    
    def load(self, project_name: str) -> Optional[Dict[str, Any]]:
        """加载文档清单
        
        Args:
            project_name: 项目名称
            
        Returns:
            Optional[Dict]: 文档清单数据，不存在返回None
        """
        list_path = self.folder_manager.get_document_list_path(project_name)
        
        if not list_path.exists():
            logger.warning(f"文档清单不存在: {list_path}")
            return None
        
        try:
            with open(list_path, 'r', encoding='utf-8') as f:
                doc_list = json.load(f)
            
            logger.info(f"已加载文档清单: {project_name}")
            return doc_list
            
        except Exception as e:
            logger.error(f"加载文档清单失败: {e}")
            return None
    
    def save(self, project_name: str, doc_list: Dict[str, Any]) -> Dict[str, Any]:
        """保存文档清单
        
        Args:
            project_name: 项目名称
            doc_list: 文档清单数据
            
        Returns:
            Dict: 保存结果
        """
        try:
            # 更新时间戳
            doc_list['updated_time'] = self._get_timestamp()
            
            # 确保目录存在
            list_path = self.folder_manager.get_document_list_path(project_name)
            list_path.parent.mkdir(parents=True, exist_ok=True)
            
            # 保存到文件
            with open(list_path, 'w', encoding='utf-8') as f:
                json.dump(doc_list, f, ensure_ascii=False, indent=2)
            
            logger.info(f"已保存文档清单: {project_name}")
            return {'status': 'success', 'path': str(list_path)}
            
        except Exception as e:
            logger.error(f"保存文档清单失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def get_cycle(self, doc_list: Dict, cycle_name: str) -> Optional[Dict]:
        """获取周期信息
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            
        Returns:
            Optional[Dict]: 周期信息
        """
        for cycle in doc_list.get('cycles', []):
            if cycle.get('name') == cycle_name:
                return cycle
        return None
    
    def get_cycle_index(self, doc_list: Dict, cycle_name: str) -> int:
        """获取周期索引
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            
        Returns:
            int: 周期索引（从1开始），未找到返回0
        """
        cycles = doc_list.get('cycles', [])
        for i, cycle in enumerate(cycles, 1):
            if cycle.get('name') == cycle_name:
                return i
        return 0
    
    def get_doc_index(self, doc_list: Dict, cycle_name: str, doc_name: str) -> int:
        """获取文档在周期内的索引
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            doc_name: 文档名称
            
        Returns:
            int: 文档索引（从1开始），未找到返回0
        """
        cycle = self.get_cycle(doc_list, cycle_name)
        if not cycle:
            return 0
        
        docs = cycle.get('documents', [])
        for i, doc in enumerate(docs, 1):
            if doc.get('name') == doc_name:
                return i
        return 0
    
    def add_file(self, doc_list: Dict, cycle_name: str, doc_name: str, 
                 file_info: Dict[str, Any]) -> bool:
        """添加文件到文档清单
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            doc_name: 文档名称
            file_info: 文件信息
            
        Returns:
            bool: 是否添加成功
        """
        cycle = self.get_cycle(doc_list, cycle_name)
        if not cycle:
            logger.warning(f"周期不存在: {cycle_name}")
            return False
        
        docs = cycle.get('documents', [])
        for doc in docs:
            if doc.get('name') == doc_name:
                # 添加文件
                if 'files' not in doc:
                    doc['files'] = []
                doc['files'].append(file_info)
                
                # 更新状态
                if doc.get('status') == 'pending':
                    doc['status'] = 'partial'
                return True
        
        logger.warning(f"文档不存在: {doc_name}")
        return False
    
    def remove_file(self, doc_list: Dict, cycle_name: str, doc_name: str,
                    filename: str) -> bool:
        """从文档清单中移除文件
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            doc_name: 文档名称
            filename: 文件名
            
        Returns:
            bool: 是否移除成功
        """
        cycle = self.get_cycle(doc_list, cycle_name)
        if not cycle:
            return False
        
        docs = cycle.get('documents', [])
        for doc in docs:
            if doc.get('name') == doc_name:
                files = doc.get('files', [])
                for i, f in enumerate(files):
                    if f.get('filename') == filename:
                        files.pop(i)
                        
                        # 更新状态
                        if not files:
                            doc['status'] = 'pending'
                        return True
        
        return False
    
    def get_files(self, doc_list: Dict, cycle_name: str, doc_name: str) -> List[Dict]:
        """获取文档下的所有文件
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            doc_name: 文档名称
            
        Returns:
            List[Dict]: 文件列表
        """
        cycle = self.get_cycle(doc_list, cycle_name)
        if not cycle:
            return []
        
        docs = cycle.get('documents', [])
        for doc in docs:
            if doc.get('name') == doc_name:
                return doc.get('files', [])
        
        return []
    
    def get_existing_files(self, doc_list: Dict, cycle_name: str, 
                          doc_name: str) -> List[str]:
        """获取文档下已存在的文件名列表
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            doc_name: 文档名称
            
        Returns:
            List[str]: 文件名列表
        """
        files = self.get_files(doc_list, cycle_name, doc_name)
        return [f.get('filename', '') for f in files if f.get('filename')]
    
    def update_status(self, doc_list: Dict, cycle_name: str, doc_name: str,
                     status: str) -> bool:
        """更新文档状态
        
        Args:
            doc_list: 文档清单
            cycle_name: 周期名称
            doc_name: 文档名称
            status: 状态
            
        Returns:
            bool: 是否更新成功
        """
        cycle = self.get_cycle(doc_list, cycle_name)
        if not cycle:
            return False
        
        docs = cycle.get('documents', [])
        for doc in docs:
            if doc.get('name') == doc_name:
                doc['status'] = status
                return True
        
        return False
    
    def get_stats(self, doc_list: Dict) -> Dict[str, Any]:
        """获取文档清单统计信息
        
        Args:
            doc_list: 文档清单
            
        Returns:
            Dict: 统计信息
        """
        stats = {
            'total_cycles': len(doc_list.get('cycles', [])),
            'total_documents': 0,
            'total_files': 0,
            'by_status': {},
            'by_cycle': {}
        }
        
        for cycle in doc_list.get('cycles', []):
            cycle_name = cycle.get('name', '')
            cycle_doc_count = 0
            cycle_file_count = 0
            
            for doc in cycle.get('documents', []):
                stats['total_documents'] += 1
                cycle_doc_count += 1
                
                file_count = len(doc.get('files', []))
                stats['total_files'] += file_count
                cycle_file_count += file_count
                
                # 按状态统计
                status = doc.get('status', 'unknown')
                stats['by_status'][status] = stats['by_status'].get(status, 0) + 1
            
            stats['by_cycle'][cycle_name] = {
                'documents': cycle_doc_count,
                'files': cycle_file_count
            }
        
        return stats
    
    def _get_timestamp(self) -> str:
        """获取当前时间戳
        
        Returns:
            str: ISO格式时间戳
        """
        from datetime import datetime
        return datetime.now().isoformat()
    
    @staticmethod
    def get_documents_list(doc_manager, cycle=None, doc_name=None, project_id=None):
        """获取文档列表
        
        Args:
            doc_manager: 文档管理器实例
            cycle: 周期名称
            doc_name: 文档名称
            project_id: 项目ID
            
        Returns:
            List[Dict]: 文档列表
        """
        # 首先尝试从内存中获取文档
        docs = doc_manager.get_documents(cycle, doc_name, project_id)
        
        # 如果内存中没有文档，尝试从项目配置中加载
        if not docs and project_id:
            project_result = doc_manager.load_project(project_id)
            if project_result.get('status') == 'success':
                project_config = project_result.get('project')
                if project_config and 'documents' in project_config:
                    documents = project_config['documents']
                    # 遍历所有周期
                    for doc_cycle, cycle_info in documents.items():
                        # 过滤周期
                        if cycle and doc_cycle != cycle:
                            continue
                        # 检查是否有已上传的文档
                        if 'uploaded_docs' in cycle_info:
                            for doc in cycle_info['uploaded_docs']:
                                # 更灵活的文档名称匹配
                                doc_doc_name = doc.get('doc_name') or doc.get('name') or doc.get('docName')
                                # 过滤文档名称
                                if doc_name and doc_doc_name != doc_name:
                                    continue
                                # 确保文档有 ID
                                doc_id = doc.get('doc_id') or f"{doc_cycle}_{doc_doc_name}_{doc.get('upload_time', '').replace(':', '_').replace('-', '_')}"
                                # 添加到结果列表（先展开 doc，再设置 id，避免 doc 中旧的 id 字段覆盖正确的 doc_id）
                                doc_copy = dict(doc)
                                doc_copy['id'] = doc_id
                                docs.append(doc_copy)
        
        return docs
