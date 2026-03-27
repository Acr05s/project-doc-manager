"""文件夹管理模块

提供项目文件夹结构的创建和管理功能。
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional

from .base import DocumentConfig, setup_logging, ensure_dir

logger = setup_logging(__name__)


class FolderManager:
    """文件夹管理器"""
    
    def __init__(self, config: DocumentConfig):
        """初始化文件夹管理器
        
        Args:
            config: 文档配置实例
        """
        self.config = config
    
    @property
    def base_dir(self) -> Path:
        """获取基础目录"""
        return self.config.base_dir
    
    @property
    def upload_folder(self) -> Path:
        """获取上传文件夹"""
        return self.config.upload_folder
    
    @property
    def projects_folder(self) -> Path:
        """获取项目配置文件夹"""
        return self.config.projects_folder
    
    def get_project_folder(self, project_name: str) -> Path:
        """获取项目文件夹
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: 项目文件夹路径
        """
        folder = self.config.projects_base_folder / project_name
        return ensure_dir(folder)
    
    def get_documents_folder(self, project_name: str) -> Path:
        """获取项目文档文件夹
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: 文档文件夹路径
        """
        folder = self.get_project_folder(project_name) / 'uploads'
        return ensure_dir(folder)
    
    def get_document_list_folder(self, project_name: str) -> Path:
        """获取文档清单文件夹
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: 文档清单文件夹路径
        """
        folder = self.get_project_folder(project_name) / '文档清单'
        return ensure_dir(folder)
    
    def get_document_list_path(self, project_name: str) -> Path:
        """获取文档清单文件路径
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: 文档清单JSON文件路径
        """
        folder = self.get_document_list_folder(project_name)
        return folder / f"{project_name}_文档清单.json"
    
    def get_cycle_folder(self, project_name: str, cycle_name: str) -> Path:
        """获取周期文件夹
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            
        Returns:
            Path: 周期文件夹路径
        """
        folder = self.get_documents_folder(project_name) / cycle_name.replace('/', '_')
        return ensure_dir(folder)
    
    def get_doc_folder(self, project_name: str, cycle_name: str, doc_name: str) -> Path:
        """获取文档文件夹
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            doc_name: 文档名称
            
        Returns:
            Path: 文档文件夹路径
        """
        cycle_folder = self.get_cycle_folder(project_name, cycle_name)
        folder = cycle_folder / doc_name.replace('/', '_')
        return ensure_dir(folder)
    
    def get_archive_folder(self, project_name: str, cycle_name: str, 
                          doc_name: Optional[str] = None) -> Path:
        """获取归档文件夹
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            doc_name: 文档名称（可选，有则创建子目录）
            
        Returns:
            Path: 归档文件夹路径
        """
        if doc_name:
            folder = self.get_doc_folder(project_name, cycle_name, doc_name)
        else:
            folder = self.get_cycle_folder(project_name, cycle_name)
        return ensure_dir(folder)
    
    def list_project_folders(self) -> list[str]:
        """列出所有项目文件夹
        
        Returns:
            list[str]: 项目名称列表
        """
        folders = []
        try:
            if self.config.projects_base_folder.exists():
                for item in self.config.projects_base_folder.iterdir():
                    if item.is_dir() and not item.name.startswith('.'):
                        folders.append(item.name)
        except Exception as e:
            logger.error(f"列出项目文件夹失败: {e}")
        
        return sorted(folders)
    
    def list_cycle_folders(self, project_name: str) -> list[str]:
        """列出项目的所有周期文件夹
        
        Args:
            project_name: 项目名称
            
        Returns:
            list[str]: 周期名称列表
        """
        folders = []
        try:
            docs_folder = self.get_documents_folder(project_name)
            if docs_folder.exists():
                for item in docs_folder.iterdir():
                    if item.is_dir():
                        folders.append(item.name)
        except Exception as e:
            logger.error(f"列出周期文件夹失败: {e}")
        
        return sorted(folders)
    
    def list_doc_folders(self, project_name: str, cycle_name: str) -> list[str]:
        """列出周期的所有文档文件夹
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            
        Returns:
            list[str]: 文档名称列表
        """
        folders = []
        try:
            cycle_folder = self.get_cycle_folder(project_name, cycle_name)
            if cycle_folder.exists():
                for item in cycle_folder.iterdir():
                    if item.is_dir():
                        folders.append(item.name)
        except Exception as e:
            logger.error(f"列出文档文件夹失败: {e}")
        
        return sorted(folders)
    
    def get_folder_size(self, folder: Path) -> int:
        """获取文件夹大小
        
        Args:
            folder: 文件夹路径
            
        Returns:
            int: 大小（字节）
        """
        total_size = 0
        try:
            if folder.exists():
                for item in folder.rglob('*'):
                    if item.is_file():
                        total_size += item.stat().st_size
        except Exception as e:
            logger.error(f"计算文件夹大小失败: {e}")
        
        return total_size
    
    def delete_folder(self, folder: Path, safe: bool = True) -> bool:
        """删除文件夹
        
        Args:
            folder: 文件夹路径
            safe: 是否安全删除（检查是否为空）
            
        Returns:
            bool: 是否删除成功
        """
        try:
            if not folder.exists():
                return True
            
            if safe:
                # 检查是否为空
                if any(folder.iterdir()):
                    logger.warning(f"文件夹非空，不删除: {folder}")
                    return False
            
            # 删除
            import shutil
            shutil.rmtree(folder)
            logger.info(f"已删除文件夹: {folder}")
            return True
            
        except Exception as e:
            logger.error(f"删除文件夹失败: {e}")
            return False
    
    def copy_folder(self, src: Path, dst: Path, overwrite: bool = False) -> bool:
        """复制文件夹
        
        Args:
            src: 源文件夹
            dst: 目标文件夹
            overwrite: 是否覆盖已存在的目标
            
        Returns:
            bool: 是否复制成功
        """
        try:
            if not src.exists():
                logger.warning(f"源文件夹不存在: {src}")
                return False
            
            if dst.exists() and not overwrite:
                logger.warning(f"目标文件夹已存在: {dst}")
                return False
            
            import shutil
            if dst.exists():
                shutil.rmtree(dst)
            
            shutil.copytree(src, dst)
            logger.info(f"已复制文件夹: {src} -> {dst}")
            return True
            
        except Exception as e:
            logger.error(f"复制文件夹失败: {e}")
            return False
    
    def create_project_structure(self, project_name: str) -> Dict[str, Path]:
        """创建项目基础目录结构
        
        只创建项目根目录和 uploads/ 子目录，
        不创建任何默认周期目录（周期由用户在页面上定义，按需创建）。
        
        Args:
            project_name: 项目名称
            
        Returns:
            Dict[str, Path]: 创建的文件夹路径字典
        """
        structure = {
            'project': self.get_project_folder(project_name),
            'documents': self.get_documents_folder(project_name),
            'doc_list': self.get_document_list_folder(project_name),
        }
        
        logger.info(f"已创建项目目录结构: {project_name}")
        return structure
