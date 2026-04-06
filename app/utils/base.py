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
    
    def get_project_folder(self, project_name: str) -> Path:
        """获取指定项目的文件夹
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: 项目文件夹路径
        """
        folder = self.projects_base_folder / project_name
        return ensure_dir(folder)
    
    def get_project_info_path(self, project_name: str) -> Path:
        """获取项目基本信息文件路径
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: project_info.json 文件路径
        """
        return self.get_project_folder(project_name) / 'project_info.json'
    
    def get_project_config_folder(self, project_name: str) -> Path:
        """获取项目配置文件夹路径
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: config 文件夹路径
        """
        folder = self.get_project_folder(project_name) / 'config'
        return ensure_dir(folder)
    
    def get_project_data_folder(self, project_name: str) -> Path:
        """获取项目数据文件夹路径
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: data 文件夹路径
        """
        folder = self.get_project_folder(project_name) / 'data'
        return ensure_dir(folder)
    
    def get_project_uploads_folder(self, project_name: str) -> Path:
        """获取项目上传文件夹路径
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: uploads 文件夹路径
        """
        folder = self.get_project_folder(project_name) / 'uploads'
        return ensure_dir(folder)
    
    def get_project_versions_folder(self, project_name: str) -> Path:
        """获取项目版本历史文件夹路径
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: versions 文件夹路径
        """
        folder = self.get_project_folder(project_name) / 'versions'
        return ensure_dir(folder)
    
    def get_project_logs_folder(self, project_name: str) -> Path:
        """获取项目日志文件夹路径
        
        Args:
            project_name: 项目名称
            
        Returns:
            Path: logs 文件夹路径
        """
        folder = self.get_project_folder(project_name) / 'logs'
        return ensure_dir(folder)
    
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


def normalize_file_path(file_path: str, project_name: str, projects_base_folder: Optional[Path] = None) -> str:
    """规范化文件路径，用于统一写入 uploaded_docs 中的 file_path 字段。

    统一格式：**相对于 projects_base_folder 的正斜杠路径**，
    即 ``{项目名}/uploads/...``（不含 ``projects/`` 前缀，不含反斜杠）。

    所有写入 file_path 字段的代码都应通过此函数处理，避免格式不一致
    导致打包、验收检查等功能找不到文件。

    Args:
        file_path: 原始路径字符串（可以是绝对路径、各种相对路径格式）
        project_name: 项目名称
        projects_base_folder: projects 根目录 Path（不传则自动获取）

    Returns:
        规范化后的相对路径字符串，格式为 ``{项目名}/uploads/...``
    """
    if not file_path:
        return file_path

    # 1. 统一分隔符为正斜杠
    normalized = file_path.replace('\\', '/')

    # 2. 如果是绝对路径，尝试转为相对路径
    if Path(normalized).is_absolute():
        if projects_base_folder is None:
            cfg = get_config()
            projects_base_folder = cfg.projects_base_folder
        try:
            relative = Path(file_path).relative_to(projects_base_folder)
            return relative.as_posix()
        except ValueError:
            pass
        # 如果无法相对化，降级：尝试从项目名开始截取
        marker = f'/{project_name}/'
        idx = normalized.find(marker)
        if idx != -1:
            return normalized[idx + 1:]
        return normalized

    # 3. 去掉 "projects/" 前缀（历史遗留问题）
    if normalized.startswith('projects/'):
        normalized = normalized[len('projects/'):]

    # 4. 如果路径已经以项目名开头，直接返回
    if normalized.startswith(f'{project_name}/'):
        return normalized

    # 5. 如果是纯文件名或不带项目名的相对路径，补全前缀
    #    假设文件在 uploads 目录下
    return f'{project_name}/uploads/{normalized}'
