"""文件处理工具"""
import os
import shutil
import hashlib
import zipfile
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime

class FileUtils:
    """文件处理工具类"""
    
    @staticmethod
    def get_file_hash(file_path: str) -> str:
        """计算文件哈希值
        
        Args:
            file_path: 文件路径
            
        Returns:
            str: 文件哈希值
        """
        try:
            hasher = hashlib.md5()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b''):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception:
            return ""
    
    @staticmethod
    def get_file_size(file_path: str) -> int:
        """获取文件大小
        
        Args:
            file_path: 文件路径
            
        Returns:
            int: 文件大小（字节）
        """
        try:
            return os.path.getsize(file_path)
        except Exception:
            return 0
    
    @staticmethod
    def ensure_directory(directory: str):
        """确保目录存在
        
        Args:
            directory: 目录路径
        """
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    @staticmethod
    def safe_delete(file_path: str):
        """安全删除文件
        
        Args:
            file_path: 文件路径
        """
        try:
            if os.path.exists(file_path):
                if os.path.isfile(file_path):
                    os.remove(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
        except Exception:
            pass
    
    @staticmethod
    def get_unique_filename(original_filename: str, directory: str) -> str:
        """生成唯一文件名
        
        Args:
            original_filename: 原始文件名
            directory: 目标目录
            
        Returns:
            str: 唯一文件名
        """
        name, ext = os.path.splitext(original_filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_name = f"{name}_{timestamp}{ext}"
        
        # 检查是否已存在
        counter = 1
        while os.path.exists(os.path.join(directory, unique_name)):
            unique_name = f"{name}_{timestamp}_{counter}{ext}"
            counter += 1
        
        return unique_name
    
    @staticmethod
    def extract_zip(zip_path: str, extract_dir: str) -> List[str]:
        """解压ZIP文件
        
        Args:
            zip_path: ZIP文件路径
            extract_dir: 解压目录
            
        Returns:
            list: 解压的文件列表
        """
        extracted_files = []
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
                for file_info in zip_ref.infolist():
                    if not file_info.is_dir():
                        extracted_files.append(os.path.join(extract_dir, file_info.filename))
        except Exception:
            pass
        return extracted_files
    
    @staticmethod
    def create_zip(files: List[str], output_path: str) -> bool:
        """创建ZIP文件
        
        Args:
            files: 文件列表
            output_path: 输出路径
            
        Returns:
            bool: 是否成功
        """
        try:
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file in files:
                    if os.path.exists(file):
                        arcname = os.path.basename(file)
                        zipf.write(file, arcname)
            return True
        except Exception:
            return False
    
    @staticmethod
    def get_file_extension(filename: str) -> str:
        """获取文件扩展名
        
        Args:
            filename: 文件名
            
        Returns:
            str: 扩展名（小写）
        """
        return os.path.splitext(filename)[1].lower()
    
    @staticmethod
    def is_valid_file_type(filename: str, allowed_extensions: List[str]) -> bool:
        """检查文件类型是否有效
        
        Args:
            filename: 文件名
            allowed_extensions: 允许的扩展名列表
            
        Returns:
            bool: 是否有效
        """
        ext = FileUtils.get_file_extension(filename)
        return ext[1:] in allowed_extensions
