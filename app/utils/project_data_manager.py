"""项目数据管理模块

提供项目数据的分类存储和管理功能。
数据按照功能分类存放在不同的JSON文件中，避免单个文件过大。
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

from .base import DocumentConfig, setup_logging, ensure_dir
from .json_file_manager import json_file_manager

logger = setup_logging(__name__)


class ProjectDataManager:
    """项目数据管理器
    
    管理项目的数据文件，按照功能分类存储：
    - project_info.json: 项目基本信息
    - config/requirements.json: 文档需求配置
    - data/documents_index.json: 文档索引
    - data/matching_result.json: 文档匹配结果
    - uploads/: 上传的文件
    - versions/: 配置版本历史
    - logs/: 操作日志
    """
    
    def __init__(self, config: DocumentConfig):
        """初始化项目数据管理器
        
        Args:
            config: 文档配置实例
        """
        self.config = config
    
    def _get_project_folder(self, project_name: str) -> Path:
        """获取项目文件夹"""
        return self.config.get_project_folder(project_name)
    
    def _get_project_info_path(self, project_name: str) -> Path:
        """获取项目基本信息文件路径"""
        return self.config.get_project_info_path(project_name)
    
    def _get_requirements_path(self, project_name: str) -> Path:
        """获取需求配置文件路径"""
        return self.config.get_project_config_folder(project_name) / 'requirements.json'
    
    def _get_documents_index_path(self, project_name: str) -> Path:
        """获取文档索引文件路径"""
        return self.config.get_project_data_folder(project_name) / 'documents_index.json'
    
    def _get_archived_path(self, project_name: str) -> Path:
        """获取归档状态文件路径"""
        return self.config.get_project_data_folder(project_name) / 'documents_archived.json'
    
    def _get_matching_result_path(self, project_name: str) -> Path:
        """获取匹配结果文件路径"""
        return self.config.get_project_data_folder(project_name) / 'matching_result.json'
    
    def _get_categories_path(self, project_name: str) -> Path:
        """获取目录分类文件路径"""
        return self.config.get_project_config_folder(project_name) / 'categories.json'
    
    # ========== 项目基本信息 ==========
    
    def save_project_info(self, project_name: str, info: Dict[str, Any]) -> bool:
        """保存项目基本信息
        
        Args:
            project_name: 项目名称
            info: 项目基本信息
            
        Returns:
            bool: 是否保存成功
        """
        try:
            info['updated_time'] = datetime.now().isoformat()
            json_file_manager.write_json(
                str(self._get_project_info_path(project_name)),
                info
            )
            logger.info(f"项目基本信息已保存: {project_name}")
            return True
        except Exception as e:
            logger.error(f"保存项目基本信息失败: {e}")
            return False
    
    def load_project_info(self, project_name: str) -> Optional[Dict[str, Any]]:
        """加载项目基本信息
        
        Args:
            project_name: 项目名称
            
        Returns:
            Optional[Dict]: 项目基本信息
        """
        try:
            return json_file_manager.read_json(
                str(self._get_project_info_path(project_name))
            )
        except Exception as e:
            logger.error(f"加载项目基本信息失败: {e}")
            return None
    
    # ========== 文档需求配置 ==========
    
    def save_requirements(self, project_name: str, requirements: Dict[str, Any]) -> bool:
        """保存文档需求配置
        
        Args:
            project_name: 项目名称
            requirements: 文档需求配置（cycles, documents等）
            
        Returns:
            bool: 是否保存成功
        """
        try:
            requirements['updated_time'] = datetime.now().isoformat()
            json_file_manager.write_json(
                str(self._get_requirements_path(project_name)),
                requirements
            )
            logger.info(f"文档需求配置已保存: {project_name}")
            return True
        except Exception as e:
            logger.error(f"保存文档需求配置失败: {e}")
            return False
    
    def load_requirements(self, project_name: str) -> Optional[Dict[str, Any]]:
        """加载文档需求配置
        
        Args:
            project_name: 项目名称
            
        Returns:
            Optional[Dict]: 文档需求配置
        """
        try:
            return json_file_manager.read_json(
                str(self._get_requirements_path(project_name))
            )
        except Exception as e:
            logger.error(f"加载文档需求配置失败: {e}")
            return None
    
    # ========== 文档索引 ==========
    
    def save_documents_index(self, project_name: str, documents: Dict[str, Any]) -> bool:
        """保存文档索引
        
        Args:
            project_name: 项目名称
            documents: 文档索引数据
            
        Returns:
            bool: 是否保存成功
        """
        try:
            documents['updated_time'] = datetime.now().isoformat()
            json_file_manager.write_json(
                str(self._get_documents_index_path(project_name)),
                documents
            )
            logger.info(f"文档索引已保存: {project_name}")
            return True
        except Exception as e:
            logger.error(f"保存文档索引失败: {e}")
            return False
    
    def load_documents_index(self, project_name: str) -> Dict[str, Any]:
        """加载文档索引
        
        Args:
            project_name: 项目名称
            
        Returns:
            Dict: 文档索引数据
        """
        try:
            data = json_file_manager.read_json(
                str(self._get_documents_index_path(project_name))
            )
            return data or {'documents': {}, 'updated_time': datetime.now().isoformat()}
        except Exception as e:
            logger.error(f"加载文档索引失败: {e}")
            return {'documents': {}, 'updated_time': datetime.now().isoformat()}
    
    def add_document_to_index(self, project_name: str, doc_id: str, doc_info: Dict[str, Any]) -> bool:
        """添加文档到索引
        
        Args:
            project_name: 项目名称
            doc_id: 文档ID
            doc_info: 文档信息
            
        Returns:
            bool: 是否添加成功
        """
        try:
            index = self.load_documents_index(project_name)
            if 'documents' not in index:
                index['documents'] = {}
            index['documents'][doc_id] = doc_info
            index['documents'][doc_id]['updated_time'] = datetime.now().isoformat()
            return self.save_documents_index(project_name, index)
        except Exception as e:
            logger.error(f"添加文档到索引失败: {e}")
            return False
    
    def remove_document_from_index(self, project_name: str, doc_id: str) -> bool:
        """从索引中移除文档
        
        Args:
            project_name: 项目名称
            doc_id: 文档ID
            
        Returns:
            bool: 是否移除成功
        """
        try:
            index = self.load_documents_index(project_name)
            if 'documents' in index and doc_id in index['documents']:
                del index['documents'][doc_id]
                return self.save_documents_index(project_name, index)
            return True
        except Exception as e:
            logger.error(f"从索引中移除文档失败: {e}")
            return False
    
    def get_document_from_index(self, project_name: str, doc_id: str) -> Optional[Dict[str, Any]]:
        """从索引中获取文档信息
        
        Args:
            project_name: 项目名称
            doc_id: 文档ID
            
        Returns:
            Optional[Dict]: 文档信息
        """
        try:
            index = self.load_documents_index(project_name)
            return index.get('documents', {}).get(doc_id)
        except Exception as e:
            logger.error(f"从索引中获取文档失败: {e}")
            return None
    
    # ========== 匹配结果 ==========
    
    def save_matching_result(self, project_name: str, result: Dict[str, Any]) -> bool:
        """保存文档匹配结果
        
        Args:
            project_name: 项目名称
            result: 匹配结果数据
            
        Returns:
            bool: 是否保存成功
        """
        try:
            result['updated_time'] = datetime.now().isoformat()
            json_file_manager.write_json(
                str(self._get_matching_result_path(project_name)),
                result
            )
            logger.info(f"匹配结果已保存: {project_name}")
            return True
        except Exception as e:
            logger.error(f"保存匹配结果失败: {e}")
            return False
    
    def load_matching_result(self, project_name: str) -> Optional[Dict[str, Any]]:
        """加载文档匹配结果
        
        Args:
            project_name: 项目名称
            
        Returns:
            Optional[Dict]: 匹配结果数据
        """
        try:
            return json_file_manager.read_json(
                str(self._get_matching_result_path(project_name))
            )
        except Exception as e:
            logger.error(f"加载匹配结果失败: {e}")
            return None
    
    # ========== 目录分类 ==========
    
    def save_categories(self, project_name: str, categories: Dict[str, Any]) -> bool:
        """保存目录分类
        
        Args:
            project_name: 项目名称
            categories: 目录分类数据 {cycle: {doc_name: [categories]}}
            
        Returns:
            bool: 是否保存成功
        """
        try:
            categories['updated_time'] = datetime.now().isoformat()
            json_file_manager.write_json(
                str(self._get_categories_path(project_name)),
                categories
            )
            logger.info(f"目录分类已保存: {project_name}")
            return True
        except Exception as e:
            logger.error(f"保存目录分类失败: {e}")
            return False
    
    def load_categories(self, project_name: str) -> Dict[str, Any]:
        """加载目录分类
        
        Args:
            project_name: 项目名称
            
        Returns:
            Dict: 目录分类数据
        """
        try:
            data = json_file_manager.read_json(
                str(self._get_categories_path(project_name))
            )
            return data or {'categories': {}, 'updated_time': datetime.now().isoformat()}
        except Exception as e:
            logger.error(f"加载目录分类失败: {e}")
            return {'categories': {}, 'updated_time': datetime.now().isoformat()}
    
    def get_categories_for_doc(self, project_name: str, cycle: str, doc_name: str) -> List[str]:
        """获取指定文档的目录分类
        
        Args:
            project_name: 项目名称
            cycle: 周期名称
            doc_name: 文档名称
            
        Returns:
            List[str]: 目录列表
        """
        try:
            data = self.load_categories(project_name)
            categories = data.get('categories', {})
            return categories.get(cycle, {}).get(doc_name, [])
        except Exception as e:
            logger.error(f"获取目录分类失败: {e}")
            return []
    
    def add_category_for_doc(self, project_name: str, cycle: str, doc_name: str, category: str) -> bool:
        """为指定文档添加目录分类
        
        Args:
            project_name: 项目名称
            cycle: 周期名称
            doc_name: 文档名称
            category: 目录名称
            
        Returns:
            bool: 是否添加成功
        """
        try:
            data = self.load_categories(project_name)
            if 'categories' not in data:
                data['categories'] = {}
            if cycle not in data['categories']:
                data['categories'][cycle] = {}
            if doc_name not in data['categories'][cycle]:
                data['categories'][cycle][doc_name] = []
            
            if category not in data['categories'][cycle][doc_name]:
                data['categories'][cycle][doc_name].append(category)
                return self.save_categories(project_name, data)
            return True
        except Exception as e:
            logger.error(f"添加目录分类失败: {e}")
            return False
    
    def remove_category_for_doc(self, project_name: str, cycle: str, doc_name: str, category: str) -> bool:
        """为指定文档移除目录分类
        
        Args:
            project_name: 项目名称
            cycle: 周期名称
            doc_name: 文档名称
            category: 目录名称
            
        Returns:
            bool: 是否移除成功
        """
        try:
            data = self.load_categories(project_name)
            categories = data.get('categories', {})
            if cycle in categories and doc_name in categories[cycle]:
                if category in categories[cycle][doc_name]:
                    categories[cycle][doc_name].remove(category)
                    return self.save_categories(project_name, data)
            return True
        except Exception as e:
            logger.error(f"移除目录分类失败: {e}")
            return False
    
    # ========== 项目完整配置 ==========
    
    def load_full_config(self, project_name: str) -> Optional[Dict[str, Any]]:
        """加载项目完整配置（合并所有数据文件）
        
        Args:
            project_name: 项目名称
            
        Returns:
            Optional[Dict]: 完整配置，如果没有找到任何配置文件返回 None
        """
        try:
            # 检查是否存在任何配置文件
            project_info_path = self._get_project_info_path(project_name)
            requirements_path = self._get_requirements_path(project_name)
            
            # 如果没有任何配置文件，返回 None 以触发旧格式加载
            if not (project_info_path.exists() or requirements_path.exists()):
                logger.info(f"未找到项目 {project_name} 的配置文件，返回 None 以触发旧格式加载")
                return None
            
            # 加载项目基本信息
            config = self.load_project_info(project_name) or {}
            
            # 加载需求配置
            requirements = self.load_requirements(project_name)
            if requirements:
                config['cycles'] = requirements.get('cycles', [])
                # 合并文档配置，保留原有的 uploaded_docs
                if 'documents' in config:
                    # 合并文档配置，保留原有的 uploaded_docs
                    for cycle, cycle_info in requirements.get('documents', {}).items():
                        if cycle not in config['documents']:
                            config['documents'][cycle] = cycle_info
                        else:
                            # 保留原有的 uploaded_docs
                            existing_uploaded_docs = config['documents'][cycle].get('uploaded_docs', [])
                            config['documents'][cycle].update(cycle_info)
                            config['documents'][cycle]['uploaded_docs'] = existing_uploaded_docs
                else:
                    config['documents'] = requirements.get('documents', {})
            
            # 加载目录分类并合并到 documents
            categories_data = self.load_categories(project_name)
            categories = categories_data.get('categories', {})
            if 'documents' not in config:
                config['documents'] = {}
            for cycle, cycle_cats in categories.items():
                if cycle not in config['documents']:
                    config['documents'][cycle] = {}
                if 'categories' not in config['documents'][cycle]:
                    config['documents'][cycle]['categories'] = {}
                config['documents'][cycle]['categories'].update(cycle_cats)
            
            # 清空 uploaded_docs，确保从 documents_index.json 重新加载
            # 避免 requirements.json 中的旧数据造成重复
            for cycle in config['documents']:
                if 'uploaded_docs' in config['documents'][cycle]:
                    config['documents'][cycle]['uploaded_docs'] = []
            
            # 加载文档索引并合并到 documents
            doc_index = self.load_documents_index(project_name)
            documents = doc_index.get('documents', {})
            # 获取所有已知的周期
            known_cycles = config.get('cycles', [])
            
            # 按 cycle 和 doc_name 组织文档
            for doc_id, doc_info in documents.items():
                cycle = doc_info.get('cycle')
                doc_name = doc_info.get('doc_name')
                
                # 如果没有 cycle 或 doc_name，尝试从 doc_id 中提取
                if not cycle or not doc_name:
                    # 首先尝试匹配已知的周期（支持带序号和不带序号的匹配）
                    matched_cycle = None
                    for known_cycle in known_cycles:
                        # 尝试直接匹配
                        if doc_id.startswith(known_cycle + '_'):
                            matched_cycle = known_cycle
                            break
                        # 尝试去除序号的匹配（如 "1.项目立项" 匹配 "项目立项_xxx"）
                        cycle_without_prefix = re.sub(r'^\d+[\.、\s]+', '', known_cycle)
                        if cycle_without_prefix != known_cycle:
                            if doc_id.startswith(cycle_without_prefix + '_') or doc_id.startswith(known_cycle + '_'):
                                matched_cycle = known_cycle
                                break
                        # 尝试反向匹配：doc_id 去除序号后匹配周期
                        doc_id_without_prefix = re.sub(r'^\d+[\.、\s]+', '', doc_id)
                        if doc_id_without_prefix.startswith(cycle_without_prefix + '_') or doc_id_without_prefix.startswith(known_cycle + '_'):
                            matched_cycle = known_cycle
                            break
                    
                    if matched_cycle:
                        cycle = matched_cycle
                        # 提取文档名称：从周期后到时间戳前的部分
                        # 使用原始 cycle 名称（带序号）去除前缀
                        cycle_prefixes = [matched_cycle + '_', re.sub(r'^\d+[\.、\s]+', '', matched_cycle) + '_']
                        remaining_part = doc_id
                        for prefix in cycle_prefixes:
                            if doc_id.startswith(prefix):
                                remaining_part = doc_id[len(prefix):]
                                break
                        # 找到时间戳部分
                        timestamp_part = None
                        parts = remaining_part.split('_')
                        for i, part in enumerate(parts):
                            if any(c.isdigit() for c in part) and len(part) >= 8:  # 时间戳至少8位数字
                                timestamp_part = part
                                break
                        if timestamp_part:
                            timestamp_index = parts.index(timestamp_part)
                            doc_name = '_'.join(parts[:timestamp_index]) if timestamp_index > 0 else '未知文档'
                        else:
                            doc_name = remaining_part
                    else:
                        # 如果没有匹配到已知周期，使用默认周期
                        cycle = '其他'
                        doc_name = doc_id
                
                if cycle and doc_name:
                    if cycle not in config['documents']:
                        config['documents'][cycle] = {}
                    if 'uploaded_docs' not in config['documents'][cycle]:
                        config['documents'][cycle]['uploaded_docs'] = []
                    # 检查是否已存在（基于 doc_id、file_path 或 original_filename）
                    file_path = doc_info.get('file_path', '')
                    original_filename = doc_info.get('original_filename', '')
                    existing = None
                    for d in config['documents'][cycle]['uploaded_docs']:
                        if d.get('doc_id') == doc_id:
                            existing = d
                            break
                        # 也检查 file_path 和 original_filename
                        if file_path and d.get('file_path') == file_path:
                            existing = d
                            break
                        if original_filename and d.get('original_filename') == original_filename:
                            existing = d
                            break
                    
                    if existing:
                        # 更新已存在的文档信息，确保状态同步，但保留原有的文档要求等属性
                        # 只更新文档索引中的属性，不覆盖原有的属性
                        for key, value in doc_info.items():
                            # 只更新文档索引中特有的属性，如文件路径、大小等
                            if key not in ['requirement', 'attributes']:
                                existing[key] = value
                    else:
                        # 只有当文档在文档索引中存在时才添加到 uploaded_docs
                        # 这样可以避免已删除的文档被重新添加
                        config['documents'][cycle]['uploaded_docs'].append(doc_info)
            
            # 对每个周期的 uploaded_docs 进行去重清理
            # 基于 file_path 和 original_filename 去重，保留最新的
            for cycle_name in config['documents']:
                if 'uploaded_docs' in config['documents'][cycle_name]:
                    uploaded_docs = config['documents'][cycle_name]['uploaded_docs']
                    seen_files = {}  # key: file_path or original_filename, value: index
                    unique_docs = []
                    
                    for doc in uploaded_docs:
                        # 使用 file_path 或 original_filename 作为去重键
                        file_key = doc.get('file_path') or doc.get('original_filename') or doc.get('doc_id')
                        if not file_key:
                            unique_docs.append(doc)
                            continue
                            
                        if file_key in seen_files:
                            # 已存在，保留时间戳更新的（或后面的）
                            existing_idx = seen_files[file_key]
                            existing_doc = unique_docs[existing_idx]
                            
                            # 比较上传时间，保留更新的
                            existing_time = existing_doc.get('upload_time', '') or existing_doc.get('timestamp', '')
                            current_time = doc.get('upload_time', '') or doc.get('timestamp', '')
                            
                            if current_time >= existing_time:
                                # 替换为当前的（更新的或相同但后面的）
                                unique_docs[existing_idx] = doc
                                seen_files[file_key] = existing_idx
                        else:
                            seen_files[file_key] = len(unique_docs)
                            unique_docs.append(doc)
                    
                    config['documents'][cycle_name]['uploaded_docs'] = unique_docs
            
            # 加载归档状态
            try:
                archived_data = json_file_manager.read_json(
                    str(self._get_archived_path(project_name))
                )
                if archived_data and 'documents_archived' in archived_data:
                    config['documents_archived'] = archived_data['documents_archived']
            except Exception as e:
                logger.warning(f"加载归档状态失败: {e}")
            
            return config
        except Exception as e:
            logger.error(f"加载完整配置失败: {e}")
            return None
    
    def save_full_config(self, project_name: str, config: Dict[str, Any]) -> bool:
        """保存项目完整配置（分发到各个数据文件）
        
        Args:
            project_name: 项目名称
            config: 完整配置
            
        Returns:
            bool: 是否保存成功
        """
        try:
            # 保存项目基本信息
            project_info = {
                'id': config.get('id'),
                'name': config.get('name'),
                'description': config.get('description'),
                'party_a': config.get('party_a'),
                'party_b': config.get('party_b'),
                'supervisor': config.get('supervisor'),
                'manager': config.get('manager'),
                'duration': config.get('duration'),
                'created_time': config.get('created_time'),
                'updated_time': datetime.now().isoformat()
            }
            self.save_project_info(project_name, project_info)
            
            # 保存需求配置
            # 注意：uploaded_docs 不再保存到 requirements.json，
            # 而是单独保存到 documents_index.json，避免重复数据
            requirements = {
                'cycles': config.get('cycles', []),
                'documents': {}
            }
            for cycle, cycle_info in config.get('documents', {}).items():
                if isinstance(cycle_info, dict):
                    requirements['documents'][cycle] = {
                        'required_docs': cycle_info.get('required_docs', []),
                        # 'uploaded_docs': cycle_info.get('uploaded_docs', []),  # 不再保存 uploaded_docs
                        'categories': cycle_info.get('categories', {})
                    }
            self.save_requirements(project_name, requirements)
            
            # 保存目录分类
            categories_data = {'categories': {}}
            for cycle, cycle_info in config.get('documents', {}).items():
                if isinstance(cycle_info, dict) and 'categories' in cycle_info:
                    categories_data['categories'][cycle] = cycle_info['categories']
            self.save_categories(project_name, categories_data)
            
            # 保存文档索引
            doc_index = {'documents': {}}
            for cycle, cycle_info in config.get('documents', {}).items():
                if isinstance(cycle_info, dict) and 'uploaded_docs' in cycle_info:
                    for doc in cycle_info['uploaded_docs']:
                        doc_id = doc.get('doc_id') or doc.get('id')
                        if doc_id:
                            doc_index['documents'][doc_id] = doc
            self.save_documents_index(project_name, doc_index)
            
            # 保存归档状态
            if 'documents_archived' in config:
                archived_data = {'documents_archived': config['documents_archived']}
                json_file_manager.write_json(str(self._get_archived_path(project_name)), archived_data)
            
            logger.info(f"完整配置已保存: {project_name}")
            return True
        except Exception as e:
            logger.error(f"保存完整配置失败: {e}")
            return False
    
    # ========== 项目创建和删除 ==========
    
    def create_project_structure(self, project_name: str) -> Dict[str, Path]:
        """创建项目目录结构
        
        Args:
            project_name: 项目名称
            
        Returns:
            Dict[str, Path]: 创建的目录路径
        """
        try:
            structure = {
                'project': self._get_project_folder(project_name),
                'config': self.config.get_project_config_folder(project_name),
                'data': self.config.get_project_data_folder(project_name),
                'uploads': self.config.get_project_uploads_folder(project_name),
                'versions': self.config.get_project_versions_folder(project_name),
                'logs': self.config.get_project_logs_folder(project_name)
            }
            logger.info(f"项目目录结构已创建: {project_name}")
            return structure
        except Exception as e:
            logger.error(f"创建项目目录结构失败: {e}")
            return {}
    
    def delete_project(self, project_name: str) -> bool:
        """删除项目及其所有数据
        
        Args:
            project_name: 项目名称
            
        Returns:
            bool: 是否删除成功
        """
        try:
            import shutil
            project_folder = self._get_project_folder(project_name)
            if project_folder.exists():
                shutil.rmtree(project_folder)
                logger.info(f"项目已删除: {project_name}")
            return True
        except Exception as e:
            logger.error(f"删除项目失败: {e}")
            return False
