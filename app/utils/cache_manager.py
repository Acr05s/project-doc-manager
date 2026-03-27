"""缓存管理模块

提供缩略图和预览缓存的管理功能。
"""

import hashlib
import io
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple, Optional, Any

import base64
from PIL import Image

from .base import DocumentConfig, setup_logging

logger = setup_logging(__name__)


class CacheManager:
    """缓存管理器"""
    
    def __init__(self, config: DocumentConfig):
        """初始化缓存管理器
        
        Args:
            config: 文档配置实例
        """
        self.config = config
        self.thumbnail_folder = config.thumbnail_folder
        self.preview_cache_folder = config.preview_cache_folder
        self.cache_enabled = config.cache_enabled
        self.cache_ttl = config.cache_ttl
        
        # 初始化缓存目录
        self._init_cache_dirs()
        
        # 清理过期缓存
        if self.cache_enabled:
            self.clean_expired_cache()
    
    def _init_cache_dirs(self):
        """初始化缓存目录"""
        self.thumbnail_folder.mkdir(parents=True, exist_ok=True)
        self.preview_cache_folder.mkdir(parents=True, exist_ok=True)
    
    def _get_cache_key(self, doc_id: str, suffix: str = '') -> str:
        """生成缓存键
        
        Args:
            doc_id: 文档ID
            suffix: 后缀（如 '_thumb', '_preview'）
            
        Returns:
            str: 缓存文件名
        """
        key = hashlib.md5(f"{doc_id}{suffix}".encode()).hexdigest()
        return key
    
    def get_thumbnail_path(self, doc_id: str) -> Path:
        """获取缩略图路径
        
        Args:
            doc_id: 文档ID
            
        Returns:
            Path: 缩略图文件路径
        """
        cache_key = self._get_cache_key(doc_id, '_thumb')
        return self.thumbnail_folder / f"{cache_key}.jpg"
    
    def get_preview_cache_path(self, doc_id: str) -> Path:
        """获取预览缓存路径
        
        Args:
            doc_id: 文档ID
            
        Returns:
            Path: 预览缓存文件路径
        """
        cache_key = self._get_cache_key(doc_id, '_preview')
        return self.preview_cache_folder / f"{cache_key}.json"
    
    def generate_thumbnail(self, image_path: str, max_size: Tuple[int, int] = (200, 200)) -> str:
        """生成缩略图
        
        Args:
            image_path: 原始图片路径
            max_size: 最大尺寸 (width, height)
            
        Returns:
            str: 缩略图base64编码
        """
        try:
            img = Image.open(image_path)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=85)
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            return f"data:image/jpeg;base64,{img_base64}"
        except Exception as e:
            logger.error(f"生成缩略图失败: {e}")
            return ""
    
    def get_thumbnail(self, doc_id: str, image_path: str, max_size: Tuple[int, int] = (200, 200)) -> str:
        """获取缩略图（带缓存）
        
        Args:
            doc_id: 文档ID
            image_path: 原始图片路径
            max_size: 最大尺寸
            
        Returns:
            str: 缩略图base64编码
        """
        if not self.cache_enabled:
            return self.generate_thumbnail(image_path, max_size)
        
        cache_path = self.get_thumbnail_path(doc_id)
        
        # 检查缓存是否存在
        if cache_path.exists():
            try:
                with open(cache_path, 'rb') as f:
                    img_base64 = base64.b64encode(f.read()).decode()
                return f"data:image/jpeg;base64,{img_base64}"
            except Exception as e:
                logger.warning(f"读取缩略图缓存失败: {e}")
        
        # 生成新缩略图
        img_base64 = self.generate_thumbnail(image_path, max_size)
        
        # 保存到缓存
        if img_base64:
            try:
                img_data = base64.b64decode(img_base64.replace('data:image/jpeg;base64,', ''))
                with open(cache_path, 'wb') as f:
                    f.write(img_data)
            except Exception as e:
                logger.warning(f"保存缩略图缓存失败: {e}")
        
        return img_base64
    
    def save_preview_cache(self, doc_id: str, preview_data: Dict[str, Any]):
        """保存预览缓存
        
        Args:
            doc_id: 文档ID
            preview_data: 预览数据
        """
        if not self.cache_enabled:
            return
            
        try:
            cache_path = self.get_preview_cache_path(doc_id)
            import json
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(preview_data, f, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存预览缓存失败: {e}")
    
    def load_preview_cache(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """加载预览缓存
        
        Args:
            doc_id: 文档ID
            
        Returns:
            Optional[Dict]: 预览数据，如果不存在或过期返回None
        """
        if not self.cache_enabled:
            return None
            
        try:
            cache_path = self.get_preview_cache_path(doc_id)
            if not cache_path.exists():
                return None
                
            # 检查是否过期
            file_time = cache_path.stat().st_mtime
            if datetime.now().timestamp() - file_time > self.cache_ttl:
                cache_path.unlink()
                return None
                
            import json
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"加载预览缓存失败: {e}")
            return None
    
    def clean_expired_cache(self):
        """清理过期的缓存文件"""
        try:
            current_time = datetime.now().timestamp()
            
            for cache_dir in [self.thumbnail_folder, self.preview_cache_folder]:
                if cache_dir.exists():
                    for file in cache_dir.iterdir():
                        if file.is_file():
                            file_time = file.stat().st_mtime
                            if current_time - file_time > self.cache_ttl:
                                file.unlink()
                                logger.debug(f"清理过期缓存: {file}")
        except Exception as e:
            logger.error(f"清理缓存失败: {e}")
    
    def clear_all_cache(self):
        """清除所有缓存"""
        try:
            for cache_dir in [self.thumbnail_folder, self.preview_cache_folder]:
                if cache_dir.exists():
                    for file in cache_dir.iterdir():
                        if file.is_file():
                            file.unlink()
            logger.info("缓存已清除")
        except Exception as e:
            logger.error(f"清除缓存失败: {e}")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息
        
        Returns:
            Dict: 缓存统计信息
        """
        stats = {
            'thumbnail_count': 0,
            'thumbnail_size': 0,
            'preview_count': 0,
            'preview_size': 0,
            'cache_enabled': self.cache_enabled,
            'cache_ttl': self.cache_ttl
        }
        
        try:
            if self.thumbnail_folder.exists():
                for f in self.thumbnail_folder.iterdir():
                    if f.is_file():
                        stats['thumbnail_count'] += 1
                        stats['thumbnail_size'] += f.stat().st_size
            
            if self.preview_cache_folder.exists():
                for f in self.preview_cache_folder.iterdir():
                    if f.is_file():
                        stats['preview_count'] += 1
                        stats['preview_size'] += f.stat().st_size
        except Exception as e:
            logger.error(f"获取缓存统计失败: {e}")
        
        return stats
