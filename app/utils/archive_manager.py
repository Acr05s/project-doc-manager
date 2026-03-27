"""归档管理模块

提供文档归档功能，包括文档编号重算和文件移动。
"""

import logging
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, List

from .base import DocumentConfig, setup_logging
from .folder_manager import FolderManager
from .document_list import DocumentListManager
from .doc_naming import DocumentNamer

logger = setup_logging(__name__)


class ArchiveManager:
    """归档管理器"""
    
    def __init__(self, config: DocumentConfig, folder_manager: FolderManager,
                 doc_list_manager: DocumentListManager):
        """初始化归档管理器
        
        Args:
            config: 文档配置实例
            folder_manager: 文件夹管理器实例
            doc_list_manager: 文档清单管理器实例
        """
        self.config = config
        self.folder_manager = folder_manager
        self.doc_list_manager = doc_list_manager
        self.namer = DocumentNamer(config)
    
    def archive(self, project_name: str, cycle_name: str, doc_name: str,
                source_file: Path, original_filename: str,
                doc_number: Optional[str] = None) -> Dict[str, Any]:
        """归档文档
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            doc_name: 文档名称
            source_file: 源文件路径
            original_filename: 原始文件名
            doc_number: 文档编号（可选，如果未提供则自动生成）
            
        Returns:
            Dict: 归档结果
        """
        try:
            # 加载文档清单
            doc_list = self.doc_list_manager.load(project_name)
            if not doc_list:
                return {'status': 'error', 'message': '文档清单不存在'}
            
            # 获取周期和文档索引
            cycle_index = self.doc_list_manager.get_cycle_index(doc_list, cycle_name)
            doc_index = self.doc_list_manager.get_doc_index(doc_list, cycle_name, doc_name)
            
            if cycle_index == 0 or doc_index == 0:
                return {'status': 'error', 'message': f'周期或文档不存在: {cycle_name}/{doc_name}'}
            
            # 检查是否已有文件
            existing_files = self.doc_list_manager.get_existing_files(
                doc_list, cycle_name, doc_name
            )
            has_multiple = len(existing_files) > 0
            
            # 生成文档编号
            if not doc_number:
                doc_number = self.namer.generate_doc_number(
                    project_name, cycle_index, doc_index
                )
            
            # 如果有多个文件，需要创建子目录
            if has_multiple:
                doc_number = f"{cycle_index}.{doc_index}"
            
            # 确定目标文件夹
            if has_multiple:
                # 多个文件，放在子目录中
                target_folder = self.folder_manager.get_doc_folder(
                    project_name, cycle_name, doc_name
                )
                # 生成带序号的文件名
                file_index = self.namer.get_next_file_index(
                    target_folder, f"{cycle_index}.{doc_index}"
                )
                final_doc_number = f"{cycle_index}.{doc_index}.{file_index}"
            else:
                # 单个文件，直接放在周期文件夹
                target_folder = self.folder_manager.get_cycle_folder(
                    project_name, cycle_name
                )
                final_doc_number = doc_number
            
            # 生成目标文件名
            target_filename = self._generate_archive_filename(
                final_doc_number, original_filename
            )
            target_path = target_folder / target_filename
            
            # 复制文件
            shutil.copy2(source_file, target_path)
            
            # 更新文档清单
            file_info = {
                'filename': target_filename,
                'original_filename': original_filename,
                'archived_time': self._get_timestamp(),
                'path': str(target_path)
            }
            
            self.doc_list_manager.add_file(doc_list, cycle_name, doc_name, file_info)
            self.doc_list_manager.save(project_name, doc_list)
            
            # 重新编号所有文件（如果有多个）
            if has_multiple:
                self._renumber_files(project_name, doc_list, cycle_name, doc_name)
            
            logger.info(f"文档已归档: {source_file} -> {target_path}")
            
            return {
                'status': 'success',
                'path': str(target_path),
                'filename': target_filename,
                'doc_number': final_doc_number
            }
            
        except Exception as e:
            logger.error(f"归档文档失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def _generate_archive_filename(self, doc_number: str, original_filename: str) -> str:
        """生成归档后的文件名
        
        Args:
            doc_number: 文档编号
            original_filename: 原始文件名
            
        Returns:
            str: 归档后的文件名
        """
        # 获取扩展名
        ext = Path(original_filename).suffix
        
        # 清理原始文件名
        clean_name = self.namer.remove_leading_number(Path(original_filename).stem)
        
        return f"{doc_number}_{clean_name}{ext}"
    
    def _renumber_files(self, project_name: str, doc_list: Dict,
                       cycle_name: str, doc_name: str):
        """重新编号所有文件
        
        当文档下有多个文件时，确保编号连续
        
        Args:
            project_name: 项目名称
            doc_list: 文档清单
            cycle_name: 周期名称
            doc_name: 文档名称
        """
        cycle_index = self.doc_list_manager.get_cycle_index(doc_list, cycle_name)
        doc_index = self.doc_list_manager.get_doc_index(doc_list, cycle_name, doc_name)
        
        files = self.doc_list_manager.get_files(doc_list, cycle_name, doc_name)
        if len(files) <= 1:
            return
        
        # 获取目标文件夹
        target_folder = self.folder_manager.get_doc_folder(
            project_name, cycle_name, doc_name
        )
        
        # 重新编号
        base_number = f"{cycle_index}.{doc_index}"
        
        for i, file_info in enumerate(files, 1):
            old_filename = file_info.get('filename', '')
            old_path = target_folder / old_filename
            
            if not old_path.exists():
                continue
            
            # 生成新文件名
            new_number = f"{base_number}.{i}"
            ext = Path(old_filename).suffix
            
            # 获取原文件名（去掉旧编号）
            stem = Path(old_filename).stem
            # 去掉前面的编号部分
            clean_stem = self._strip_doc_number(stem)
            
            new_filename = f"{new_number}_{clean_stem}{ext}"
            new_path = target_folder / new_filename
            
            # 重命名文件
            if old_path != new_path:
                old_path.rename(new_path)
            
            # 更新文档清单
            file_info['filename'] = new_filename
            file_info['doc_number'] = new_number
        
        # 保存更新后的文档清单
        self.doc_list_manager.save(project_name, doc_list)
    
    def _strip_doc_number(self, filename: str) -> str:
        """去掉文件名中的文档编号
        
        Args:
            filename: 文件名
            
        Returns:
            str: 去掉编号后的文件名
        """
        import re
        # 匹配编号格式: 4.1_ 或 4.2.1_
        pattern = r'^\d+\.\d+(\.\d+)?_'
        return re.sub(pattern, '', filename)
    
    def unarchive(self, project_name: str, cycle_name: str, doc_name: str,
                  filename: str, target_folder: Path) -> Dict[str, Any]:
        """取消归档（将文件移出归档目录）
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            doc_name: 文档名称
            filename: 文件名
            target_folder: 目标文件夹
            
        Returns:
            Dict: 操作结果
        """
        try:
            # 加载文档清单
            doc_list = self.doc_list_manager.load(project_name)
            if not doc_list:
                return {'status': 'error', 'message': '文档清单不存在'}
            
            # 查找文件
            source_folder = self.folder_manager.get_doc_folder(
                project_name, cycle_name, doc_name
            )
            source_path = source_folder / filename
            
            if not source_path.exists():
                return {'status': 'error', 'message': '文件不存在'}
            
            # 移动文件
            target_path = target_folder / filename
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source_path), str(target_path))
            
            # 更新文档清单
            self.doc_list_manager.remove_file(doc_list, cycle_name, doc_name, filename)
            self.doc_list_manager.save(project_name, doc_list)
            
            logger.info(f"已取消归档: {source_path} -> {target_path}")
            
            return {
                'status': 'success',
                'path': str(target_path)
            }
            
        except Exception as e:
            logger.error(f"取消归档失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def delete_archived(self, project_name: str, cycle_name: str, 
                       doc_name: str, filename: str) -> Dict[str, Any]:
        """删除归档文件
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            doc_name: 文档名称
            filename: 文件名
            
        Returns:
            Dict: 操作结果
        """
        try:
            # 加载文档清单
            doc_list = self.doc_list_manager.load(project_name)
            if not doc_list:
                return {'status': 'error', 'message': '文档清单不存在'}
            
            # 查找并删除文件
            source_folder = self.folder_manager.get_doc_folder(
                project_name, cycle_name, doc_name
            )
            source_path = source_folder / filename
            
            if source_path.exists():
                source_path.unlink()
            
            # 更新文档清单
            self.doc_list_manager.remove_file(doc_list, cycle_name, doc_name, filename)
            self.doc_list_manager.save(project_name, doc_list)
            
            logger.info(f"已删除归档文件: {source_path}")
            
            return {'status': 'success'}
            
        except Exception as e:
            logger.error(f"删除归档文件失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def get_archived_files(self, project_name: str, cycle_name: str,
                          doc_name: str) -> List[Dict[str, Any]]:
        """获取已归档的文件列表
        
        Args:
            project_name: 项目名称
            cycle_name: 周期名称
            doc_name: 文档名称
            
        Returns:
            List[Dict]: 文件列表
        """
        doc_list = self.doc_list_manager.load(project_name)
        if not doc_list:
            return []
        
        return self.doc_list_manager.get_files(doc_list, cycle_name, doc_name)
    
    def _get_timestamp(self) -> str:
        """获取当前时间戳"""
        from datetime import datetime
        return datetime.now().isoformat()
