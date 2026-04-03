"""PDF转换记录管理服务"""

import json
import os
from pathlib import Path
from datetime import datetime

class PDFConversionRecord:
    """PDF转换记录管理类"""
    
    def __init__(self):
        """初始化PDF转换记录管理器"""
        self.records_file = Path('uploads/temp/preview/conversion_records.json')
        self.records_file.parent.mkdir(parents=True, exist_ok=True)
        self.records = self._load_records()
    
    def _load_records(self):
        """加载转换记录"""
        if self.records_file.exists():
            try:
                with open(self.records_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[PDFConversionRecord] 加载记录失败: {e}")
        return {}
    
    def _save_records(self):
        """保存转换记录"""
        try:
            with open(self.records_file, 'w', encoding='utf-8') as f:
                json.dump(self.records, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[PDFConversionRecord] 保存记录失败: {e}")
    
    def get_record(self, doc_id):
        """获取转换记录
        
        Args:
            doc_id: 文档ID
            
        Returns:
            Dict: 转换记录，如果不存在返回None
        """
        return self.records.get(doc_id)
    
    def add_record(self, doc_id, pdf_path, file_path):
        """添加转换记录
        
        Args:
            doc_id: 文档ID
            pdf_path: PDF文件路径
            file_path: 源文件路径
        """
        self.records[doc_id] = {
            'pdf_path': pdf_path,
            'file_path': file_path,
            'converted_at': datetime.now().isoformat(),
            'last_accessed': datetime.now().isoformat()
        }
        self._save_records()
    
    def update_access_time(self, doc_id):
        """更新访问时间
        
        Args:
            doc_id: 文档ID
        """
        if doc_id in self.records:
            self.records[doc_id]['last_accessed'] = datetime.now().isoformat()
            self._save_records()
    
    def delete_record(self, doc_id):
        """删除转换记录并清理PDF文件
        
        Args:
            doc_id: 文档ID
        """
        if doc_id in self.records:
            pdf_path = self.records[doc_id]['pdf_path']
            # 删除PDF文件
            if os.path.exists(pdf_path):
                try:
                    os.remove(pdf_path)
                    print(f"[PDFConversionRecord] 删除PDF文件: {pdf_path}")
                except Exception as e:
                    print(f"[PDFConversionRecord] 删除PDF文件失败: {e}")
            # 删除记录
            del self.records[doc_id]
            self._save_records()
    
    def cleanup_old_records(self, days=7):
        """清理过期记录
        
        Args:
            days: 过期天数
        """
        import time
        current_time = time.time()
        expired_docs = []
        
        for doc_id, record in self.records.items():
            last_accessed = record.get('last_accessed', record.get('converted_at'))
            if last_accessed:
                accessed_time = datetime.fromisoformat(last_accessed).timestamp()
                if current_time - accessed_time > days * 24 * 3600:
                    expired_docs.append(doc_id)
        
        for doc_id in expired_docs:
            self.delete_record(doc_id)
        
        print(f"[PDFConversionRecord] 清理了 {len(expired_docs)} 个过期记录")


# 创建全局PDF转换记录实例
pdf_conversion_record = PDFConversionRecord()