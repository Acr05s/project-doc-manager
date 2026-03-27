"""文档命名模块

提供文档编号生成、文件名处理等功能。
"""

import re
import logging
from pathlib import Path
from typing import Dict, Any, Optional

from .base import setup_logging

logger = setup_logging(__name__)


class DocumentNamer:
    """文档命名器"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """初始化文档命名器
        
        Args:
            config: 配置字典（可选）
        """
        self.config = config or {}
    
    def remove_leading_number(self, filename: str) -> str:
        """删除文件名中第一个中文字符前的内容
        
        例如: "4.1_技术方案.pdf" -> "技术方案.pdf"
              "附件1_合同.docx" -> "合同.docx"
        
        Args:
            filename: 原始文件名
            
        Returns:
            str: 处理后的文件名
        """
        if not filename:
            return filename
        
        # 匹配第一个中文字符的位置
        match = re.search(r'[\u4e00-\u9fff]', filename)
        
        if match:
            # 如果中文字符前面有内容（包括数字和下划线），保留中文字符及之后的部分
            chinese_start = match.start()
            if chinese_start > 0:
                # 检查前面是否全是数字、点、连字符、下划线
                prefix = filename[:chinese_start]
                if re.match(r'^[\d._\-]+$', prefix):
                    return filename[chinese_start:]
        
        return filename
    
    def generate_doc_number(self, project_name: str, cycle_index: int, doc_index: int,
                            doc_type: Optional[str] = None) -> str:
        """生成文档编号
        
        编号规则：
        - 单个文件: {cycle}.{doc_type_index}_{原文件名}
        - 多个文件: {cycle}.{doc_type_index}_{文档类型}/{cycle}.{file_index}_{原文件名}
        
        例如: 
        - 第4周期第1个文档类型，1个文件 -> 4.1_文件名.pdf
        - 第4周期第2个文档类型，多个文件 -> 4.2_文档类型/4.2.1_文件名.pdf
        
        Args:
            project_name: 项目名称
            cycle_index: 周期索引（从1开始）
            doc_index: 文档类型索引（从1开始）
            doc_type: 文档类型名称
            
        Returns:
            str: 生成的文档编号
        """
        base_number = f"{cycle_index}.{doc_index}"
        
        if doc_type:
            return f"{base_number}_{doc_type}"
        
        return base_number
    
    def generate_filename(self, doc_number: str, original_filename: str, 
                          doc_folder: Optional[Path] = None) -> str:
        """生成归档后的文件名
        
        Args:
            doc_number: 文档编号
            original_filename: 原始文件名
            doc_folder: 文档目标文件夹（用于判断是否需要子目录）
            
        Returns:
            str: 归档后的文件名
        """
        # 获取文件扩展名
        path = Path(original_filename)
        ext = path.suffix
        
        # 清理原始文件名
        clean_name = self.sanitize_filename(path.stem)
        
        # 组合新文件名
        if doc_folder:
            return f"{doc_number}_{clean_name}{ext}"
        
        return f"{doc_number}_{clean_name}{ext}"
    
    def sanitize_filename(self, filename: str) -> str:
        """清理文件名中的非法字符
        
        Args:
            filename: 原始文件名
            
        Returns:
            str: 清理后的文件名
        """
        if not filename:
            return "unnamed"
        
        # 替换非法字符
        illegal_chars = r'[<>:"/\\|?*\x00-\x1f]'
        clean = re.sub(illegal_chars, '_', filename)
        
        # 移除首尾空格和点
        clean = clean.strip('. ')
        
        # 确保不为空
        if not clean:
            return "unnamed"
        
        return clean
    
    def parse_doc_number(self, filename: str) -> Optional[Dict[str, Any]]:
        """解析文档编号
        
        从文件名中提取周期号和文档索引
        
        Args:
            filename: 文件名
            
        Returns:
            Optional[Dict]: 解析结果，包含 cycle_index, doc_index, file_index 等
        """
        # 匹配格式: 4.1_文件名 或 4.2.1_文件名
        pattern = r'^(\d+)\.(\d+)(?:\.(\d+))?_'
        match = re.match(pattern, filename)
        
        if not match:
            return None
        
        result = {
            'cycle_index': int(match.group(1)),
            'doc_index': int(match.group(2))
        }
        
        if match.group(3):
            result['file_index'] = int(match.group(3))
        
        return result
    
    def get_next_file_index(self, folder: Path, base_name: str) -> int:
        """获取下一个文件索引
        
        用于当一个文档类型下有多个文件时，生成递增的索引
        
        Args:
            folder: 文件夹路径
            base_name: 基础文件名（如 "4.2_"）
            
        Returns:
            int: 下一个文件索引
        """
        if not folder.exists():
            return 1
        
        max_index = 0
        prefix = f"{base_name}."
        
        for f in folder.iterdir():
            if f.is_file() and f.name.startswith(prefix):
                # 提取文件索引
                try:
                    name_without_ext = f.stem
                    # 格式: 4.2.1_xxx -> 提取最后的数字
                    parts = name_without_ext.split('_')
                    if len(parts) >= 1:
                        idx_part = parts[0].split('.')[-1]
                        idx = int(idx_part)
                        max_index = max(max_index, idx)
                except (ValueError, IndexError):
                    continue
        
        return max_index + 1
    
    def build_doc_path(self, project_folder: Path, cycle_name: str, 
                       doc_name: str, doc_number: str, original_filename: str,
                       has_multiple_files: bool = False) -> tuple[Path, str]:
        """构建文档存储路径
        
        Args:
            project_folder: 项目文件夹
            cycle_name: 周期名称
            doc_name: 文档名称
            doc_number: 文档编号
            original_filename: 原始文件名
            has_multiple_files: 是否有多文件（需要子目录）
            
        Returns:
            tuple: (最终文件夹路径, 生成的文件名)
        """
        # 构建周期文件夹
        cycle_folder = project_folder / cycle_name.replace('/', '_')
        cycle_folder.mkdir(parents=True, exist_ok=True)
        
        # 清理文档名称作为子目录名
        doc_folder_name = self.sanitize_filename(doc_name)
        
        # 生成文件名
        clean_original = self.remove_leading_number(Path(original_filename).stem)
        ext = Path(original_filename).suffix
        filename = f"{doc_number}_{clean_original}{ext}"
        
        if has_multiple_files:
            # 多文件需要子目录
            doc_subfolder = cycle_folder / doc_folder_name
            doc_subfolder.mkdir(parents=True, exist_ok=True)
            return doc_subfolder, filename
        else:
            return cycle_folder, filename
    
    def validate_filename(self, filename: str) -> bool:
        """验证文件名是否合法
        
        Args:
            filename: 文件名
            
        Returns:
            bool: 是否合法
        """
        if not filename:
            return False
        
        # 检查是否为空或只包含空白
        if not filename.strip():
            return False
        
        # 检查是否包含非法字符
        illegal_chars = r'[<>:"/\\|?*\x00-\x1f]'
        if re.search(illegal_chars, filename):
            return False
        
        # 检查保留名称
        reserved_names = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1']
        name_without_ext = Path(filename).stem.upper()
        if name_without_ext in reserved_names:
            return False
        
        return True
