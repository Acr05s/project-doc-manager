"""项目模型"""
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path

class Project:
    """项目模型"""
    
    def __init__(self, project_id: str, name: str, description: str = ''):
        """初始化项目
        
        Args:
            project_id: 项目ID
            name: 项目名称
            description: 项目描述
        """
        self.id = project_id
        self.name = name
        self.description = description
        self.cycles: List[str] = []
        self.documents: Dict[str, Dict[str, List]] = {}
        self.created_time = datetime.now().isoformat()
        self.updated_time = datetime.now().isoformat()
        self.acceptance = {}
    
    def add_cycle(self, cycle_name: str):
        """添加项目周期
        
        Args:
            cycle_name: 周期名称
        """
        if cycle_name not in self.cycles:
            self.cycles.append(cycle_name)
        if cycle_name not in self.documents:
            self.documents[cycle_name] = {
                'required_docs': [],
                'uploaded_docs': []
            }
    
    def add_required_document(self, cycle_name: str, doc_name: str, requirement: str = ''):
        """添加需求文档
        
        Args:
            cycle_name: 周期名称
            doc_name: 文档名称
            requirement: 文档要求
        """
        if cycle_name not in self.documents:
            self.add_cycle(cycle_name)
        
        # 检查是否已存在
        for doc in self.documents[cycle_name]['required_docs']:
            if doc['name'] == doc_name:
                return
        
        self.documents[cycle_name]['required_docs'].append({
            'name': doc_name,
            'requirement': requirement,
            'status': 'pending'
        })
    
    def add_uploaded_document(self, cycle_name: str, doc_data: Dict[str, Any]):
        """添加已上传文档
        
        Args:
            cycle_name: 周期名称
            doc_data: 文档数据
        """
        if cycle_name not in self.documents:
            self.add_cycle(cycle_name)
        
        self.documents[cycle_name]['uploaded_docs'].append(doc_data)
    
    def remove_cycle(self, cycle_name: str):
        """删除项目周期
        
        Args:
            cycle_name: 周期名称
        """
        if cycle_name in self.cycles:
            self.cycles.remove(cycle_name)
        if cycle_name in self.documents:
            del self.documents[cycle_name]
    
    def remove_required_document(self, cycle_name: str, doc_name: str):
        """删除需求文档
        
        Args:
            cycle_name: 周期名称
            doc_name: 文档名称
        """
        if cycle_name in self.documents:
            docs = self.documents[cycle_name]['required_docs']
            self.documents[cycle_name]['required_docs'] = [
                d for d in docs if d['name'] != doc_name
            ]
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典
        
        Returns:
            dict: 项目信息
        """
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'cycles': self.cycles,
            'documents': self.documents,
            'created_time': self.created_time,
            'updated_time': self.updated_time,
            'acceptance': self.acceptance
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Project':
        """从字典创建项目
        
        Args:
            data: 项目数据
            
        Returns:
            Project: 项目对象
        """
        project = cls(
            project_id=data.get('id'),
            name=data.get('name'),
            description=data.get('description', '')
        )
        
        # 填充其他字段
        project.cycles = data.get('cycles', [])
        project.documents = data.get('documents', {})
        project.created_time = data.get('created_time', project.created_time)
        project.updated_time = data.get('updated_time', project.updated_time)
        project.acceptance = data.get('acceptance', {})
        
        return project
    
    def update(self, data: Dict[str, Any]):
        """更新项目信息
        
        Args:
            data: 更新数据
        """
        for key, value in data.items():
            if hasattr(self, key):
                setattr(self, key, value)
        
        self.updated_time = datetime.now().isoformat()
    
    def get_missing_documents(self) -> Dict[str, List[str]]:
        """获取缺失的文档
        
        Returns:
            dict: 各周期缺失的文档
        """
        missing = {}
        
        for cycle, cycle_data in self.documents.items():
            required_docs = cycle_data.get('required_docs', [])
            uploaded_docs = cycle_data.get('uploaded_docs', [])
            
            uploaded_names = {doc.get('doc_name') for doc in uploaded_docs}
            missing_docs = [
                doc['name'] for doc in required_docs 
                if doc['name'] not in uploaded_names
            ]
            
            if missing_docs:
                missing[cycle] = missing_docs
        
        return missing
