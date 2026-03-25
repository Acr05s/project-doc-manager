"""基础配置模块

提供项目文档管理系统的核心配置和基础工具函数。
该模块被其他所有模块依赖，提供基础路径解析和日志配置。
"""

import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional


def get_base_dir() -> Path:
    """获取项目根目录
    
    Returns:
        Path: 项目根目录路径
    """
    # 获取调用者的父目录（app目录）的父目录（项目根目录）
    current_file = Path(__file__).resolve()
    base_dir = current_file.parent.parent.parent
    return base_dir


def setup_logging(name: str = __name__, level: int = logging.INFO) -> logging.Logger:
    """配置日志记录器
    
    Args:
        name: 日志记录器名称
        level: 日志级别
        
    Returns:
        logging.Logger: 配置好的日志记录器
    """
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    return logging.getLogger(name)


def ensure_dir(path: Path) -> Path:
    """确保目录存在，不存在则创建
    
    Args:
        path: 目录路径
        
    Returns:
        Path: 目录路径
    """
    path.mkdir(parents=True, exist_ok=True)
    return path


class DocumentConfig:
    """文档管理系统配置类"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """初始化配置
        
        Args:
            config: 配置字典
        """
        self._config = config or {}
        self._base_dir = None
        self._init_base_dir()
        
    def _init_base_dir(self):
        """初始化基础目录"""
        base_dir = self._config.get('base_dir')
        if base_dir:
            self._base_dir = Path(base_dir)
        else:
            self._base_dir = get_base_dir()
    
    @property
    def base_dir(self) -> Path:
        """获取基础目录"""
        return self._base_dir
    
    @property
    def db_folder(self) -> Path:
        """获取数据库文件夹"""
        return ensure_dir(self._base_dir / 'db')
    
    @property
    def projects_base_folder(self) -> Path:
        """获取项目基础文件夹"""
        # 项目基础文件夹位于项目根目录下的projects目录
        projects_folder = self._base_dir / 'projects'
        # 确保文件夹存在
        if not projects_folder.exists():
            projects_folder.mkdir(parents=True, exist_ok=True)
            print(f"Created projects directory at: {projects_folder}")
        return projects_folder
    
    @property
    def upload_folder(self) -> Path:
        """获取上传文件夹"""
        return ensure_dir(self._base_dir / 'uploads')
    
    @property
    def projects_folder(self) -> Path:
        """获取项目配置文件夹"""
        return self.projects_base_folder
    
    @property
    def cache_folder(self) -> Path:
        """获取缓存文件夹"""
        return ensure_dir(self.upload_folder / 'cache')
    
    @property
    def thumbnail_folder(self) -> Path:
        """获取缩略图文件夹"""
        return ensure_dir(self.cache_folder / 'thumbnails')
    
    @property
    def preview_cache_folder(self) -> Path:
        """获取预览缓存文件夹"""
        return ensure_dir(self.cache_folder / 'previews')
    
    @property
    def operation_log_file(self) -> Path:
        """获取操作日志文件路径"""
        return self.upload_folder / 'operations.log'
    
    @property
    def cache_enabled(self) -> bool:
        """获取缓存启用状态"""
        return self._config.get('cache_enabled', True)
    
    @property
    def cache_ttl(self) -> int:
        """获取缓存过期时间（秒）"""
        return self._config.get('cache_ttl', 3600)
    
    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值
        
        Args:
            key: 配置键
            default: 默认值
            
        Returns:
            配置值
        """
        return self._config.get(key, default)


# 全局配置实例（延迟初始化）
_config_instance: Optional[DocumentConfig] = None


def get_config(config: Optional[Dict[str, Any]] = None) -> DocumentConfig:
    """获取配置实例（单例模式）
    
    Args:
        config: 配置字典
        
    Returns:
        DocumentConfig: 配置实例
    """
    global _config_instance
    if _config_instance is None or config is not None:
        _config_instance = DocumentConfig(config)
    return _config_instance
