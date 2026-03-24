"""导出管理模块

提供文档包导出功能。
"""

import json
import logging
import zipfile
from pathlib import Path
from typing import Dict, Any, Optional

from .base import DocumentConfig, setup_logging, ensure_dir
from .folder_manager import FolderManager
from .document_list import DocumentListManager

logger = setup_logging(__name__)


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
                            if not file_path.exists():
                                skipped_files.append({
                                    'cycle': cycle_name,
                                    'doc': doc_name,
                                    'filename': filename,
                                    'reason': '文件不存在'
                                })
                                continue
                            
                            # 添加到ZIP
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
            
            result = {
                'status': 'success',
                'output_path': str(output_path),
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
