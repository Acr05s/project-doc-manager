"""导出管理模块

提供文档包导出功能。
"""

import json
import logging
import zipfile
import re
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

from .base import DocumentConfig, setup_logging, ensure_dir
from .folder_manager import FolderManager
from .document_list import DocumentListManager

logger = setup_logging(__name__)

# 导入公共的日志函数
from .base import log_package


class ExportManager:
    """导出管理器"""
    
    def __init__(self, config: DocumentConfig, folder_manager: FolderManager,
                 doc_list_manager: DocumentListManager):
        """初始化导出管理器
        
        Args:
            config: 文档配置实例
            folder_manager: 文件夹管理器实例
            doc_list_manager: 文档清单管理器实例
        """
        self.config = config
        self.folder_manager = folder_manager
        self.doc_list_manager = doc_list_manager
    
    def export_documents_package(self, project_name: str, 
                                 output_path: Optional[Path] = None) -> Dict[str, Any]:
        """导出文档包
        
        根据文档清单打包所有已归档的文档
        
        Args:
            project_name: 项目名称
            output_path: 输出路径（可选，默认放在项目目录下）
            
        Returns:
            Dict: 导出结果
        """
        try:
            # 加载文档清单
            doc_list = self.doc_list_manager.load(project_name)
            if not doc_list:
                return {'status': 'error', 'message': '文档清单不存在'}
            
            # 从数据库加载完整的文档信息（包含 directory 和 root_directory）
            from ..routes.documents.list import list_documents as get_list_docs
            from flask import current_app
            
            all_docs_with_metadata = []
            try:
                with current_app.test_request_context():
                    response = get_list_docs()
                    if hasattr(response, 'get_json'):
                        list_result = response.get_json()
                    else:
                        import json
                        list_result = json.loads(response.data)
                    if list_result.get('status') == 'success':
                        all_docs_with_metadata = list_result.get('data', [])
                        log_package(f'[export] Loaded {len(all_docs_with_metadata)} docs from database')
            except Exception as e:
                log_package(f'[export] Failed to load from database: {e}')
            
            # 确定输出路径
            if not output_path:
                output_path = self.folder_manager.get_project_folder(project_name) / \
                              f"{project_name}_文档包.zip"
            
            # 创建ZIP文件
            ensure_dir(output_path.parent)
            
            exported_files = []
            skipped_files = []
            
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # 遍历所有周期和文档
                for cycle in doc_list.get('cycles', []):
                    cycle_name = cycle.get('name', '')
                    
                    for doc in cycle.get('documents', []):
                        doc_name = doc.get('name', '')
                        
                        for file_info in doc.get('files', []):
                            filename = file_info.get('filename', '')
                            file_path_str = file_info.get('path', '')
                            
                            if not file_path_str:
                                skipped_files.append({
                                    'cycle': cycle_name,
                                    'doc': doc_name,
                                    'filename': filename,
                                    'reason': '路径不存在'
                                })
                                continue
                            
                            file_path = Path(file_path_str)
                            # 处理相对路径
                            if not file_path.is_absolute():
                                # 相对路径，相对于项目的uploads目录
                                project_uploads_dir = self.folder_manager.get_documents_folder(project_name)
                                file_path = project_uploads_dir / file_path_str
                            
                            if not file_path.exists():
                                skipped_files.append({
                                    'cycle': cycle_name,
                                    'doc': doc_name,
                                    'filename': filename,
                                    'reason': '文件不存在'
                                })
                                continue
                            
                            # 从数据库获取的完整信息中查找当前文件的目录信息
                            directory = ''
                            root_dir = ''
                            orig_dir = ''
                            for db_doc in all_docs_with_metadata:
                                if db_doc.get('filename') == filename or db_doc.get('original_filename') == filename:
                                    if db_doc.get('cycle') == cycle_name and db_doc.get('doc_name') == doc_name:
                                        # 优先使用 display_directory（已与前端显示逻辑对齐）
                                        directory = db_doc.get('display_directory', '') or db_doc.get('directory', '')
                                        root_dir = db_doc.get('root_directory', '')
                                        orig_dir = db_doc.get('directory', '')
                                        break
                            
                            # 兼容老数据：如果 display_directory 为空且没有 root_directory，清理 directory 中的临时目录前缀
                            if directory and directory != '/' and not root_dir:
                                dir_value = directory.lstrip('/')
                                parts = dir_value.split('/')
                                real_start_idx = 0
                                for i, part in enumerate(parts):
                                    if not re.match(r'^tmp[a-z0-9]+_\d{14,}$', part, re.IGNORECASE):
                                        real_start_idx = i
                                        break
                                meaningful_parts = parts[real_start_idx:]
                                directory = '/' + '/'.join(meaningful_parts) if meaningful_parts else '/'
                            
                            log_package(f'[export] {cycle_name}/{doc_name} | db_dir: {orig_dir} | final_dir: {directory} | root: {root_dir} | file: {filename}')
                            
                            # 添加到ZIP
                            if directory and directory != '/':
                                arcname = f"{cycle_name}/{doc_name}/{directory}/{filename}"
                            else:
                                arcname = f"{cycle_name}/{doc_name}/{filename}"
                            zipf.write(file_path, arcname)
                            exported_files.append({
                                'cycle': cycle_name,
                                'doc': doc_name,
                                'filename': filename,
                                'size': file_path.stat().st_size
                            })
            
            # 统计信息
            total_size = sum(f['size'] for f in exported_files)
            
            # 生成下载文件名
            download_name = f"{project_name}_{datetime.now().strftime('%Y%m%d')}.zip"
            
            result = {
                'status': 'success',
                'package_path': str(output_path),
                'download_name': download_name,
                'total_files': len(exported_files),
                'total_size': total_size,
                'files': exported_files,
                'skipped': skipped_files
            }
            
            logger.info(f"文档包导出成功: {output_path}, 共{len(exported_files)}个文件")
            
            return result
            
        except Exception as e:
            logger.error(f"导出文档包失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def export_project_json(self, project_name: str, 
                           output_path: Optional[Path] = None) -> Dict[str, Any]:
        """导出项目JSON配置
        
        Args:
            project_name: 项目名称
            output_path: 输出路径（可选）
            
        Returns:
            Dict: 导出结果
        """
        try:
            # 加载文档清单
            doc_list = self.doc_list_manager.load(project_name)
            if not doc_list:
                return {'status': 'error', 'message': '文档清单不存在'}
            
            # 确定输出路径
            if not output_path:
                output_path = self.folder_manager.get_project_folder(project_name) / \
                              f"{project_name}_配置.json"
            
            # 保存JSON
            ensure_dir(output_path.parent)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(doc_list, f, ensure_ascii=False, indent=2)
            
            result = {
                'status': 'success',
                'output_path': str(output_path),
                'size': output_path.stat().st_size
            }
            
            logger.info(f"项目配置导出成功: {output_path}")
            
            return result
            
        except Exception as e:
            logger.error(f"导出项目配置失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def export_requirements_json(self, project_config: Dict[str, Any],
                                output_path: Optional[Path] = None) -> Dict[str, Any]:
        """导出需求JSON
        
        Args:
            project_config: 项目配置
            output_path: 输出路径
            
        Returns:
            Dict: 导出结果
        """
        try:
            # 提取需求信息
            requirements = {
                'project_name': project_config.get('name', ''),
                'description': project_config.get('description', ''),
                'cycles': []
            }
            
            # 从项目配置中提取周期信息
            for cycle_name, docs_info in project_config.get('documents', {}).items():
                cycle_data = {
                    'name': cycle_name,
                    'documents': []
                }
                
                for doc in docs_info.get('required_docs', []):
                    cycle_data['documents'].append({
                        'name': doc.get('name', ''),
                        'requirement': doc.get('requirement', '')
                    })
                
                requirements['cycles'].append(cycle_data)
            
            # 确定输出路径
            if not output_path:
                output_path = self.config.upload_folder / 'requirements_export.json'
            
            # 保存JSON
            ensure_dir(output_path.parent)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(requirements, f, ensure_ascii=False, indent=2)
            
            result = {
                'status': 'success',
                'output_path': str(output_path),
                'cycles_count': len(requirements['cycles'])
            }
            
            logger.info(f"需求JSON导出成功: {output_path}")
            
            return result
            
        except Exception as e:
            logger.error(f"导出需求JSON失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def export_to_excel(self, project_name: str,
                       output_path: Optional[Path] = None) -> Dict[str, Any]:
        """导出文档清单到Excel
        
        Args:
            project_name: 项目名称
            output_path: 输出路径
            
        Returns:
            Dict: 导出结果
        """
        try:
            # 加载文档清单
            doc_list = self.doc_list_manager.load(project_name)
            if not doc_list:
                return {'status': 'error', 'message': '文档清单不存在'}
            
            # 确定输出路径
            if not output_path:
                output_path = self.folder_manager.get_document_list_folder(project_name) / \
                              f"{project_name}_清单.xlsx"
            
            # 使用pandas创建Excel
            import pandas as pd
            
            rows = []
            for cycle in doc_list.get('cycles', []):
                cycle_name = cycle.get('name', '')
                
                for doc in cycle.get('documents', []):
                    doc_name = doc.get('name', '')
                    requirement = doc.get('requirement', '')
                    status = doc.get('status', '')
                    
                    files = doc.get('files', [])
                    if files:
                        for f in files:
                            rows.append({
                                '周期': cycle_name,
                                '文档名称': doc_name,
                                '需求': requirement,
                                '状态': status,
                                '文件名': f.get('filename', ''),
                                '归档时间': f.get('archived_time', '')
                            })
                    else:
                        rows.append({
                            '周期': cycle_name,
                            '文档名称': doc_name,
                            '需求': requirement,
                            '状态': status,
                            '文件名': '',
                            '归档时间': ''
                        })
            
            # 创建DataFrame并保存
            df = pd.DataFrame(rows)
            ensure_dir(output_path.parent)
            df.to_excel(output_path, index=False)
            
            result = {
                'status': 'success',
                'output_path': str(output_path),
                'total_rows': len(rows)
            }
            
            logger.info(f"文档清单导出到Excel成功: {output_path}")
            
            return result
            
        except Exception as e:
            logger.error(f"导出Excel失败: {e}")
            return {'status': 'error', 'message': str(e)}
