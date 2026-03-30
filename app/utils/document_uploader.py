"""文档上传模块

提供文档上传功能。
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from .base import DocumentConfig, setup_logging
from .folder_manager import FolderManager
from .image_analyzer import ImageAnalyzer

logger = setup_logging(__name__)


class DocumentUploader:
    """文档上传器"""
    
    def __init__(self, config: DocumentConfig, folder_manager: FolderManager):
        """初始化文档上传器
        
        Args:
            config: 文档配置实例
            folder_manager: 文件夹管理器实例
        """
        self.config = config
        self.folder_manager = folder_manager
        self.upload_folder = config.upload_folder
        self.image_analyzer = ImageAnalyzer(config)
    
    def upload(self, file, cycle: str, doc_name: str,
              doc_date: Optional[str] = None, sign_date: Optional[str] = None,
              signer: Optional[str] = None, no_signature: bool = False,
              has_seal: bool = False, party_a_seal: bool = False,
              party_b_seal: bool = False, no_seal: bool = False,
              other_seal: Optional[str] = None,
              category: Optional[str] = None,
              project_name: Optional[str] = None) -> Dict[str, Any]:
        """上传文档
        
        Args:
            file: 文件对象
            cycle: 项目周期
            doc_name: 文档名称
            doc_date: 文档日期
            sign_date: 签字日期
            signer: 签字人
            no_signature: 不涉及签字
            has_seal: 是否盖章（通用）
            party_a_seal: 甲方盖章
            party_b_seal: 乙方盖章
            no_seal: 不涉及盖章
            other_seal: 其它盖章（标注）
            category: 分类名称
            project_name: 项目名称
            
        Returns:
            Dict: 上传结果
        """
        try:
            # 生成文件路径
            if project_name:
                # 使用项目的文件夹结构，保存到 temp 目录
                base_folder = self.folder_manager.get_documents_folder(project_name) / 'temp' / cycle.replace('/', '_') / doc_name.replace('/', '_')
            else:
                # 兼容旧版，使用上传文件夹
                base_folder = self.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
            
            # 如果有分类，使用分类目录
            if category:
                cycle_folder = base_folder / category.replace('/', '_')
            else:
                cycle_folder = base_folder
            
            cycle_folder.mkdir(parents=True, exist_ok=True)
            
            # 生成唯一文件名（保留原始文件名）
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            original_filename = file.filename
            file_ext = Path(original_filename).suffix
            # 提取原始文件名主体（不含扩展名）
            original_name = Path(original_filename).stem
            # 清理不安全字符，保留字母、数字、中文、下划线、连字符和点
            safe_name = ''.join(c for c in original_name if c.isalnum() or c in '._- ' or ord(c) > 127)
            # 确保文件名不为空
            if not safe_name:
                safe_name = 'unknown'
            # 生成新文件名：原始文件名_时间戳.扩展名
            new_filename = f"{safe_name}_{timestamp}{file_ext}"
            
            file_path = cycle_folder / new_filename
            file.save(str(file_path))
            
            logger.info(f"文件上传成功: {file_path}")
            
            # 如果是图片，进行图像分析
            image_info = {}
            if file_ext.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
                try:
                    image_info = self.image_analyzer.analyze_document(str(file_path))
                except Exception as e:
                    logger.warning(f"图像分析失败: {e}")
            
            # 提取目录信息
            # 默认保存到根目录 "/"，与从ZIP中选择的文件保持一致
            directory = '/'
            if category:
                # 如果指定了分类，使用分类作为目录
                directory = category
            
            # 构建返回信息
            # 保存相对路径，以便在不同环境中都能正确找到文件
            if project_name:
                # 相对路径：projects/{project_name}/uploads/temp/{cycle}/{doc_name}/{new_filename}
                if category:
                    relative_path = f"projects/{project_name}/uploads/temp/{cycle.replace('/', '_')}/{doc_name.replace('/', '_')}/{category.replace('/', '_')}/{new_filename}"
                else:
                    relative_path = f"projects/{project_name}/uploads/temp/{cycle.replace('/', '_')}/{doc_name.replace('/', '_')}/{new_filename}"
            else:
                # 兼容旧版，使用相对路径
                try:
                    relative_path = str(file_path.relative_to(self.config.base_dir))
                except ValueError:
                    # 如果file_path不在base_dir下，使用绝对路径
                    relative_path = str(file_path)
            
            result = {
                'status': 'success',
                'original_filename': original_filename,
                'saved_filename': new_filename,
                'path': relative_path,
                'cycle': cycle,
                'doc_name': doc_name,
                'size': file_path.stat().st_size,
                'upload_time': datetime.now().isoformat(),
                'directory': directory
            }
            
            # 添加文档元数据
            if doc_date:
                result['doc_date'] = doc_date
            if sign_date:
                result['sign_date'] = sign_date
            if signer:
                result['signer'] = signer
            if no_signature:
                result['no_signature'] = True
            if has_seal:
                result['has_seal'] = True
            if party_a_seal:
                result['party_a_seal'] = True
            if party_b_seal:
                result['party_b_seal'] = True
            if no_seal:
                result['no_seal'] = True
            if other_seal:
                result['other_seal'] = other_seal
            if category:
                result['category'] = category
            if project_name:
                result['project_name'] = project_name
            
            # 添加图像分析结果
            if image_info:
                result['image_analysis'] = image_info
            
            return result
            
        except Exception as e:
            logger.error(f"上传文件失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def upload_multiple(self, files: list, cycle: str, doc_name: str,
                       **kwargs) -> Dict[str, Any]:
        """批量上传文档
        
        Args:
            files: 文件对象列表
            cycle: 项目周期
            doc_name: 文档名称
            **kwargs: 其他参数，包括 project_name
            
        Returns:
            Dict: 上传结果
        """
        results = []
        errors = []
        
        for file in files:
            result = self.upload(file, cycle, doc_name, **kwargs)
            if result.get('status') == 'success':
                results.append(result)
            else:
                errors.append({
                    'filename': file.filename,
                    'error': result.get('message', '未知错误')
                })
        
        return {
            'status': 'success' if results else 'error',
            'total': len(files),
            'success_count': len(results),
            'error_count': len(errors),
            'results': results,
            'errors': errors
        }
    
    def get_uploaded_files(self, cycle: str, doc_name: str,
                          category: Optional[str] = None,
                          project_name: Optional[str] = None) -> list:
        """获取已上传的文件列表
        
        Args:
            cycle: 项目周期
            doc_name: 文档名称
            category: 分类名称
            project_name: 项目名称
            
        Returns:
            list: 文件列表
        """
        if project_name:
            # 使用项目的文件夹结构
            base_folder = self.folder_manager.get_documents_folder(project_name) / cycle.replace('/', '_') / doc_name.replace('/', '_')
        else:
            # 兼容旧版，使用上传文件夹
            base_folder = self.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
        
        if category:
            base_folder = base_folder / category.replace('/', '_')
        
        if not base_folder.exists():
            return []
        
        files = []
        for f in base_folder.iterdir():
            if f.is_file():
                files.append({
                    'name': f.name,
                    'size': f.stat().st_size,
                    'modified': datetime.fromtimestamp(f.stat().st_mtime).isoformat()
                })
        
        return sorted(files, key=lambda x: x['modified'], reverse=True)
    
    def delete_file(self, file_path: str) -> Dict[str, Any]:
        """删除上传的文件
        
        Args:
            file_path: 文件路径
            
        Returns:
            Dict: 删除结果
        """
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
                logger.info(f"文件已删除: {file_path}")
                return {'status': 'success'}
            else:
                return {'status': 'error', 'message': '文件不存在'}
        except Exception as e:
            logger.error(f"删除文件失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def move_file(self, source_path: str, target_cycle: str, 
                 target_doc: str, target_category: Optional[str] = None) -> Dict[str, Any]:
        """移动文件到其他目录
        
        Args:
            source_path: 源文件路径
            target_cycle: 目标周期
            target_doc: 目标文档
            target_category: 目标分类
            
        Returns:
            Dict: 移动结果
        """
        try:
            source = Path(source_path)
            if not source.exists():
                return {'status': 'error', 'message': '源文件不存在'}
            
            # 构建目标路径
            target_folder = self.upload_folder / target_cycle.replace('/', '_') / \
                           target_doc.replace('/', '_')
            
            if target_category:
                target_folder = target_folder / target_category.replace('/', '_')
            
            target_folder.mkdir(parents=True, exist_ok=True)
            target_path = target_folder / source.name
            
            # 移动文件
            source.rename(target_path)
            
            logger.info(f"文件已移动: {source_path} -> {target_path}")
            
            return {
                'status': 'success',
                'new_path': str(target_path)
            }
        except Exception as e:
            logger.error(f"移动文件失败: {e}")
            return {'status': 'error', 'message': str(e)}
