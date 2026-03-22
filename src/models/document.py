"""文档模型"""
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

class Document:
    """文档模型"""
    
    def __init__(self, doc_id: str, cycle: str, doc_name: str, filename: str, file_path: str):
        """初始化文档
        
        Args:
            doc_id: 文档ID
            cycle: 项目周期
            doc_name: 文档名称
            filename: 文件名
            file_path: 文件路径
        """
        self.id = doc_id
        self.cycle = cycle
        self.doc_name = doc_name
        self.filename = filename
        self.file_path = file_path
        self.original_filename = filename
        self.doc_date = ""
        self.sign_date = ""
        self.signer = ""
        self.no_signature = False
        self.has_seal = False
        self.party_a_seal = False
        self.party_b_seal = False
        self.no_seal = False
        self.other_seal = ""
        self.upload_time = datetime.now().isoformat()
        self.source = "unknown"
        self.detected_signature = False
        self.detected_seal = False
        self.signature_confidence = 0.0
        self.seal_confidence = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典
        
        Returns:
            dict: 文档信息
        """
        return {
            'id': self.id,
            'cycle': self.cycle,
            'doc_name': self.doc_name,
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_path': self.file_path,
            'doc_date': self.doc_date,
            'sign_date': self.sign_date,
            'signer': self.signer,
            'no_signature': self.no_signature,
            'has_seal': self.has_seal,
            'party_a_seal': self.party_a_seal,
            'party_b_seal': self.party_b_seal,
            'no_seal': self.no_seal,
            'other_seal': self.other_seal,
            'upload_time': self.upload_time,
            'source': self.source,
            'detected_signature': self.detected_signature,
            'detected_seal': self.detected_seal,
            'signature_confidence': self.signature_confidence,
            'seal_confidence': self.seal_confidence
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Document':
        """从字典创建文档
        
        Args:
            data: 文档数据
            
        Returns:
            Document: 文档对象
        """
        doc = cls(
            doc_id=data.get('id'),
            cycle=data.get('cycle'),
            doc_name=data.get('doc_name'),
            filename=data.get('filename'),
            file_path=data.get('file_path')
        )
        
        # 填充其他字段
        for key, value in data.items():
            if hasattr(doc, key):
                setattr(doc, key, value)
        
        return doc
    
    def update(self, data: Dict[str, Any]):
        """更新文档信息
        
        Args:
            data: 更新数据
        """
        for key, value in data.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def exists(self) -> bool:
        """检查文件是否存在
        
        Returns:
            bool: 文件是否存在
        """
        return Path(self.file_path).exists()
