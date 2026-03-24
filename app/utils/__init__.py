"""工具模块包

项目文档管理系统的工具模块集合。
采用模块化设计，每个模块负责特定功能。
"""

# 基础模块
from .base import DocumentConfig, get_config, setup_logging, get_base_dir

# 主管理器
from .document_manager import DocumentManager, get_manager, reset_manager

# 子模块
from .cache_manager import CacheManager
from .operation_logger import OperationLogger
from .doc_naming import DocumentNamer
from .folder_manager import FolderManager
from .document_list import DocumentListManager
from .archive_manager import ArchiveManager
from .export_manager import ExportManager
from .requirements_loader import RequirementsLoader
from .project_manager import ProjectManager
from .image_analyzer import ImageAnalyzer
from .document_uploader import DocumentUploader

__all__ = [
    # 基础
    'DocumentConfig',
    'get_config',
    'setup_logging',
    'get_base_dir',
    
    # 主类
    'DocumentManager',
    'get_manager',
    'reset_manager',
    
    # 子模块
    'CacheManager',
    'OperationLogger',
    'DocumentNamer',
    'FolderManager',
    'DocumentListManager',
    'ArchiveManager',
    'ExportManager',
    'RequirementsLoader',
    'ProjectManager',
    'ImageAnalyzer',
    'DocumentUploader',
]
