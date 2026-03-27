"""项目管理模块

提供项目的创建、加载、保存、删除等核心管理功能。
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List

from .base import DocumentConfig, setup_logging
from .folder_manager import FolderManager
from .requirements_loader import RequirementsLoader
from .json_file_manager import json_file_manager
from .project_data_manager import ProjectDataManager

logger = setup_logging(__name__)


class ProjectManager:
    """项目管理器"""
    
    def __init__(self, config: DocumentConfig, folder_manager: FolderManager):
        """初始化项目管理器
        
        Args:
            config: 文档配置实例
            folder_manager: 文件夹管理器实例
        """
        self.config = config
        self.folder_manager = folder_manager
        self.requirements_loader = RequirementsLoader(config)
        self.data_manager = ProjectDataManager(config)
        
        # 项目索引（内存缓存）
        self.projects_db: Dict[str, Dict[str, Any]] = {}
        
        # 已删除项目索引（软删除）
        self.deleted_projects: Dict[str, Dict[str, Any]] = {}
        
        # 加载项目索引
        self._load_projects_index()
    
    def _load_projects_index(self):
        """加载项目索引（兼容新旧格式）"""
        try:
            index_file = self.config.projects_folder / 'projects_index.json'
            logger.info(f"[DEBUG] 尝试加载项目索引文件: {index_file}")
            logger.info(f"[DEBUG] 文件是否存在: {index_file.exists()}")
            
            if not index_file.exists():
                logger.error(f"项目索引文件不存在: {index_file}")
                self.projects_db = {}
                self.deleted_projects = {}
                return
            
            data = json_file_manager.read_json(str(index_file))
            logger.info(f"[DEBUG] 读取到的数据: {data}")
            
            if data:
                # 新格式：{"projects": {...}}
                if 'projects' in data:
                    self.projects_db = data.get('projects', {})
                # 旧格式：直接用项目ID作为键
                else:
                    # 过滤掉非项目键（如updated_time, deleted_projects）
                    self.projects_db = {
                        k: v for k, v in data.items() 
                        if isinstance(v, dict) and 'id' in v and k != 'deleted_projects'
                    }
                
                # 加载已删除项目
                if 'deleted_projects' in data:
                    self.deleted_projects = data.get('deleted_projects', {})
                else:
                    self.deleted_projects = {}
                
                logger.info(f"已加载 {len(self.projects_db)} 个项目, {len(self.deleted_projects)} 个已删除项目")
                logger.info(f"[DEBUG] 项目列表: {list(self.projects_db.keys())}")
            else:
                logger.error(f"项目索引文件为空或读取失败: {index_file}")
                self.projects_db = {}
                self.deleted_projects = {}
        except Exception as e:
            logger.error(f"加载项目索引失败: {e}")
            import traceback
            logger.error(f"[DEBUG] 错误堆栈: {traceback.format_exc()}")
            self.projects_db = {}
            self.deleted_projects = {}
    
    def _save_projects_index(self):
        """保存项目索引（保持旧格式兼容）"""
        try:
            index_file = self.config.projects_folder / 'projects_index.json'
            
            # 保持旧格式：直接用项目ID作为键
            data = {
                'updated_time': datetime.now().isoformat()
            }
            # 添加所有项目
            data.update(self.projects_db)
            
            # 添加已删除项目
            data['deleted_projects'] = self.deleted_projects
            
            json_file_manager.write_json(str(index_file), data)
                
        except Exception as e:
            logger.error(f"保存项目索引失败: {e}")
    
    def create(self, name: str, description: str = '',
              requirements_file: Optional[str] = None,
              party_a: str = '', party_b: str = '',
              supervisor: str = '', manager: str = '',
              duration: str = '') -> Dict[str, Any]:
        """创建新项目
        
        Args:
            name: 项目名称
            description: 项目描述
            requirements_file: 需求文件路径（Excel或JSON）
            party_a: 甲方
            party_b: 乙方
            supervisor: 监理单位
            manager: 项目管理单位
            duration: 工期
            
        Returns:
            Dict: 创建结果
        """
        try:
            # 生成项目ID
            project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            # 创建项目配置
            project_config = {
                'id': project_id,
                'name': name,
                'description': description,
                'party_a': party_a,
                'party_b': party_b,
                'supervisor': supervisor,
                'manager': manager,
                'duration': duration,
                'created_time': datetime.now().isoformat(),
                'updated_time': datetime.now().isoformat(),
                'cycles': [],
                'documents': {}
            }
            
            # 如果有需求文件，加载需求
            if requirements_file:
                requirements = self.requirements_loader.load(requirements_file)
                project_config['cycles'] = requirements.get('cycles', [])
                project_config['documents'] = requirements.get('documents', {})
            
            # 创建项目文件夹结构（使用新的数据管理器）
            self.data_manager.create_project_structure(name)
            
            # 保存项目配置
            self._save_project_config(project_id, project_config)
            
            # 添加到索引
            self.projects_db[project_id] = {
                'id': project_id,
                'name': name,
                'description': description,
                'created_time': project_config['created_time']
            }
            self._save_projects_index()
            
            logger.info(f"项目创建成功: {name} (ID: {project_id})")
            
            return {
                'status': 'success',
                'project_id': project_id,
                'config': project_config
            }
            
        except Exception as e:
            logger.error(f"创建项目失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def _save_project_config(self, project_id: str, config: Dict[str, Any]):
        """保存项目配置
        
        Args:
            project_id: 项目ID
            config: 项目配置
        """
        # 获取项目名称
        project_name = config.get('name', project_id)
        # 使用新的数据管理器保存配置
        self.data_manager.save_full_config(project_name, config)
    
    def load(self, project_id: str) -> Optional[Dict[str, Any]]:
        """加载项目配置
        
        Args:
            project_id: 项目ID
            
        Returns:
            Optional[Dict]: 项目配置，不存在返回None
        """
        try:
            logger.info(f"[DEBUG] 开始加载项目: {project_id}")
            
            # 首先尝试从项目索引中获取项目名称
            project_info = self.projects_db.get(project_id)
            logger.info(f"[DEBUG] 项目索引信息: {project_info}")
            
            if not project_info:
                logger.error(f"[DEBUG] 项目索引中不存在: {project_id}")
                return None
            
            project_name = project_info['name'] if project_info and 'name' in project_info else project_id
            logger.info(f"[DEBUG] 项目名称: {project_name}")
            
            # 使用新的数据管理器加载完整配置
            config = self.data_manager.load_full_config(project_name)
            logger.info(f"[DEBUG] 从新数据管理器加载配置结果: {config is not None}")
            
            if not config:
                # 尝试从旧位置加载（向后兼容）
                logger.info(f"[DEBUG] 新数据管理器加载失败，尝试旧位置")
                
                # 尝试两种旧格式：
                # 1. 直接在项目目录下的 project_config.json
                old_config_file = self.config.projects_folder / project_name / "project_config.json"
                logger.info(f"[DEBUG] 旧位置配置文件 (格式1): {old_config_file}, 是否存在: {old_config_file.exists()}")
                
                # 2. 在 projects 目录下的 project_id.json
                old_config_file2 = self.config.projects_folder / f"{project_id}.json"
                logger.info(f"[DEBUG] 旧位置配置文件 (格式2): {old_config_file2}, 是否存在: {old_config_file2.exists()}")
                
                if old_config_file.exists():
                    config = json_file_manager.read_json(str(old_config_file))
                    logger.info(f"[DEBUG] 从旧位置 (格式1) 加载配置结果: {config}")
                elif old_config_file2.exists():
                    config = json_file_manager.read_json(str(old_config_file2))
                    logger.info(f"[DEBUG] 从旧位置 (格式2) 加载配置结果: {config}")
                
                # 如果加载成功，迁移到新结构
                if config:
                    logger.info(f"[DEBUG] 从旧位置加载成功，开始迁移到新结构")
                    self.data_manager.save_full_config(project_name, config)
                    logger.info(f"[DEBUG] 迁移到新结构成功")
                
                if not config:
                    logger.warning(f"项目配置不存在: {project_id}")
                    return None
            
            logger.info(f"[DEBUG] 项目加载成功: {project_id}")
            return config
            
        except Exception as e:
            logger.error(f"加载项目失败: {e}")
            import traceback
            logger.error(f"[DEBUG] 错误堆栈: {traceback.format_exc()}")
            return None
    
    def load_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """根据名称加载项目
        
        Args:
            name: 项目名称
            
        Returns:
            Optional[Dict]: 项目配置
        """
        for project_id, info in self.projects_db.items():
            if info.get('name') == name:
                return self.load(project_id)
        return None
    
    def save(self, project_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """保存项目配置
        
        Args:
            project_id: 项目ID
            config: 项目配置
            
        Returns:
            Dict: 保存结果
        """
        try:
            # 更新时间戳
            config['updated_time'] = datetime.now().isoformat()
            
            # 保存配置
            self._save_project_config(project_id, config)
            
            # 更新索引
            if project_id in self.projects_db:
                self.projects_db[project_id]['updated_time'] = config['updated_time']
                self._save_projects_index()
            
            logger.info(f"项目保存成功: {project_id}")
            
            return {'status': 'success'}
            
        except Exception as e:
            logger.error(f"保存项目失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def delete(self, project_id: str, permanent: bool = False) -> Dict[str, Any]:
        """删除项目（软删除）
        
        Args:
            project_id: 项目ID
            permanent: 是否永久删除（true=永久删除，false=软删除）
            
        Returns:
            Dict: 删除结果
        """
        try:
            # 检查项目是否存在
            if permanent:
                # 永久删除：先检查活动项目列表，再检查已删除列表
                if project_id in self.projects_db:
                    project_info = self.projects_db[project_id].copy()
                elif project_id in self.deleted_projects:
                    project_info = self.deleted_projects[project_id].copy()
                else:
                    return {'status': 'error', 'message': '项目不存在'}
            else:
                # 软删除：从正常项目列表中查找
                if project_id not in self.projects_db:
                    return {'status': 'error', 'message': '项目不存在'}
                project_info = self.projects_db[project_id].copy()
            
            if permanent:
                # 永久删除：删除项目文件
                project_name = project_info.get('name', '')
                if project_name:
                    # 使用新的数据管理器删除项目
                    self.data_manager.delete_project(project_name)
                
                # 向后兼容：删除旧位置的配置文件
                old_config_file = self.config.projects_folder / f"{project_id}.json"
                if old_config_file.exists():
                    old_config_file.unlink()
                
                # 从相应的列表中移除
                if project_id in self.projects_db:
                    del self.projects_db[project_id]
                elif project_id in self.deleted_projects:
                    del self.deleted_projects[project_id]
                
                logger.info(f"项目已永久删除: {project_id}")
            else:
                # 软删除：移到已删除列表
                project_info['deleted_time'] = datetime.now().isoformat()
                self.deleted_projects[project_id] = project_info
                
                # 从活动项目列表中移除
                del self.projects_db[project_id]
                
                logger.info(f"项目已软删除: {project_id}")
            
            # 保存索引
            self._save_projects_index()
            
            return {'status': 'success', 'message': '项目已删除' if not permanent else '项目已永久删除'}
            
        except Exception as e:
            logger.error(f"删除项目失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def restore(self, project_id: str) -> Dict[str, Any]:
        """恢复已删除的项目
        
        Args:
            project_id: 项目ID
            
        Returns:
            Dict: 恢复结果
        """
        try:
            # 检查项目是否在已删除列表中
            if project_id not in self.deleted_projects:
                return {'status': 'error', 'message': '项目不在回收站中'}
            
            # 获取项目信息
            project_info = self.deleted_projects[project_id].copy()
            
            # 移除删除时间戳
            project_info.pop('deleted_time', None)
            
            # 恢复到活动项目列表
            self.projects_db[project_id] = project_info
            
            # 从已删除列表中移除
            del self.deleted_projects[project_id]
            
            # 保存索引
            self._save_projects_index()
            
            logger.info(f"项目已恢复: {project_id}")
            
            return {'status': 'success', 'message': '项目已恢复'}
            
        except Exception as e:
            logger.error(f"恢复项目失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def list_deleted(self) -> List[Dict[str, Any]]:
        """列出所有已删除项目
        
        Returns:
            List: 已删除项目列表
        """
        return [
            {
                'id': project_id,
                'name': info.get('name', ''),
                'description': info.get('description', ''),
                'deleted_time': info.get('deleted_time', ''),
                'created_time': info.get('created_time', '')
            }
            for project_id, info in self.deleted_projects.items()
        ]
    
    def list_all(self) -> List[Dict[str, Any]]:
        """列出所有项目
        
        Returns:
            List[Dict]: 项目列表
        """
        return [
            {
                'id': project_id,
                'name': info.get('name', ''),
                'description': info.get('description', ''),
                'created_time': info.get('created_time', ''),
                'updated_time': info.get('updated_time', '')
            }
            for project_id, info in self.projects_db.items()
        ]
    
    def get_by_id(self, project_id: str) -> Optional[Dict[str, Any]]:
        """获取项目信息
        
        Args:
            project_id: 项目ID
            
        Returns:
            Optional[Dict]: 项目信息
        """
        return self.projects_db.get(project_id)
    
    def search(self, keyword: str) -> List[Dict[str, Any]]:
        """搜索项目
        
        Args:
            keyword: 关键字
            
        Returns:
            List[Dict]: 匹配的项目列表
        """
        results = []
        keyword_lower = keyword.lower()
        
        for project_id, info in self.projects_db.items():
            name = info.get('name', '').lower()
            desc = info.get('description', '').lower()
            
            if keyword_lower in name or keyword_lower in desc:
                results.append({
                    'id': project_id,
                    'name': info.get('name', ''),
                    'description': info.get('description', '')
                })
        
        return results
    
    def update(self, project_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """更新项目信息
        
        Args:
            project_id: 项目ID
            updates: 更新内容
            
        Returns:
            Dict: 更新结果
        """
        try:
            config = self.load(project_id)
            if not config:
                return {'status': 'error', 'message': '项目不存在'}
            
            # 更新字段
            for key in ['name', 'description']:
                if key in updates:
                    config[key] = updates[key]
            
            # 保存
            self.save(project_id, config)
            
            # 更新索引
            if project_id in self.projects_db:
                for key in ['name', 'description']:
                    if key in updates:
                        self.projects_db[project_id][key] = updates[key]
                self._save_projects_index()
            
            return {'status': 'success', 'config': config}
            
        except Exception as e:
            logger.error(f"更新项目失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def duplicate(self, project_id: str, new_name: str) -> Dict[str, Any]:
        """复制项目
        
        Args:
            project_id: 源项目ID
            new_name: 新项目名称
            
        Returns:
            Dict: 复制结果
        """
        try:
            # 加载源项目
            source_config = self.load(project_id)
            if not source_config:
                return {'status': 'error', 'message': '源项目不存在'}
            
            # 创建新项目
            result = self.create(
                name=new_name,
                description=source_config.get('description', '')
            )
            
            if result['status'] != 'success':
                return result
            
            new_project_id = result['project_id']
            
            # 复制文档配置
            new_config = self.load(new_project_id)
            new_config['cycles'] = source_config.get('cycles', [])
            new_config['documents'] = source_config.get('documents', {})
            self.save(new_project_id, new_config)
            
            # 复制文件（如果需要）
            source_name = source_config.get('name', '')
            if source_name:
                source_folder = self.folder_manager.get_documents_folder(source_name)
                if source_folder.exists():
                    target_folder = self.folder_manager.get_documents_folder(new_name)
                    self.folder_manager.copy_folder(source_folder, target_folder)
            
            logger.info(f"项目复制成功: {project_id} -> {new_name}")
            
            return {
                'status': 'success',
                'project_id': new_project_id,
                'name': new_name
            }
            
        except Exception as e:
            logger.error(f"复制项目失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def get_stats(self, project_id: str) -> Dict[str, Any]:
        """获取项目统计信息
        
        Args:
            project_id: 项目ID
            
        Returns:
            Dict: 统计信息
        """
        config = self.load(project_id)
        if not config:
            return {'error': '项目不存在'}
        
        stats = {
            'project_name': config.get('name', ''),
            'total_cycles': len(config.get('cycles', [])),
            'total_documents': 0,
            'total_files': 0
        }
        
        # 统计文档和文件
        for cycle, docs_info in config.get('documents', {}).items():
            stats['total_documents'] += len(docs_info.get('required_docs', []))
            stats['total_files'] += len(docs_info.get('uploaded_docs', []))
        
        # 获取文件夹大小
        project_name = config.get('name', '')
        if project_name:
            docs_folder = self.folder_manager.get_documents_folder(project_name)
            stats['folder_size'] = self.folder_manager.get_folder_size(docs_folder)
        
        return stats
    
    # ========== 配置版本管理 ==========
    
    def save_version(self, project_id: str, version_name: str, description: str = '') -> Dict[str, Any]:
        """保存当前配置为新版本
        
        Args:
            project_id: 项目ID
            version_name: 版本名称
            description: 版本描述
            
        Returns:
            Dict: 保存结果
        """
        try:
            # 加载当前配置
            config = self.load(project_id)
            if not config:
                return {'status': 'error', 'message': '项目不存在'}
            
            # 获取项目名称
            project_name = config.get('name', project_id)
            
            # 创建版本目录
            versions_dir = self.config.projects_folder / project_name / 'versions'
            versions_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成版本文件名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            safe_version_name = "".join(c for c in version_name if c.isalnum() or c in (' ', '-', '_')).strip()
            version_filename = f"{timestamp}_{safe_version_name}.json"
            version_path = versions_dir / version_filename
            
            # 添加版本元信息
            version_config = config.copy()
            version_config['_version_info'] = {
                'version_name': version_name,
                'description': description,
                'created_time': datetime.now().isoformat(),
                'filename': version_filename
            }
            
            # 保存版本文件
            with open(version_path, 'w', encoding='utf-8') as f:
                json.dump(version_config, f, ensure_ascii=False, indent=2)
            
            logger.info(f"配置版本已保存: {project_id} - {version_name}")
            
            return {
                'status': 'success',
                'version_name': version_name,
                'version_filename': version_filename,
                'created_time': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"保存配置版本失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def list_versions(self, project_id: str) -> Dict[str, Any]:
        """列出所有配置版本
        
        Args:
            project_id: 项目ID
            
        Returns:
            Dict: 版本列表
        """
        try:
            # 加载当前配置获取项目名称
            config = self.load(project_id)
            project_name = config.get('name', project_id) if config else project_id
            
            versions_dir = self.config.projects_folder / project_name / 'versions'
            
            if not versions_dir.exists():
                return {
                    'status': 'success',
                    'versions': [],
                    'current_version': None
                }
            
            versions = []
            for version_file in versions_dir.glob('*.json'):
                try:
                    with open(version_file, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                    
                    version_info = config.get('_version_info', {})
                    versions.append({
                        'filename': version_file.name,
                        'version_name': version_info.get('version_name', version_file.stem),
                        'description': version_info.get('description', ''),
                        'created_time': version_info.get('created_time', ''),
                        'cycles': config.get('cycles', []),
                        'document_count': sum(len(docs.get('required_docs', [])) for docs in config.get('documents', {}).values())
                    })
                except Exception as e:
                    logger.warning(f"读取版本文件失败: {version_file} - {e}")
            
            # 按创建时间倒序排序
            versions.sort(key=lambda x: x.get('created_time', ''), reverse=True)
            
            # 获取当前配置信息
            current_config = self.load(project_id)
            current_version = None
            if current_config:
                current_version = {
                    'cycles': current_config.get('cycles', []),
                    'document_count': sum(len(docs.get('required_docs', [])) for docs in current_config.get('documents', {}).values()),
                    'updated_time': current_config.get('updated_time', '')
                }
            
            return {
                'status': 'success',
                'versions': versions,
                'current_version': current_version
            }
            
        except Exception as e:
            logger.error(f"列出配置版本失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def load_version(self, project_id: str, version_filename: str) -> Dict[str, Any]:
        """加载指定版本的配置
        
        Args:
            project_id: 项目ID
            version_filename: 版本文件名
            
        Returns:
            Dict: 版本配置
        """
        try:
            # 加载当前配置获取项目名称
            config = self.load(project_id)
            project_name = config.get('name', project_id) if config else project_id
            
            version_path = self.config.projects_folder / project_name / 'versions' / version_filename
            
            if not version_path.exists():
                return {'status': 'error', 'message': '版本文件不存在'}
            
            with open(version_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 移除版本元信息
            config.pop('_version_info', None)
            
            # 恢复项目ID和名称
            current_config = self.load(project_id)
            if current_config:
                config['id'] = project_id
                config['name'] = current_config.get('name', '')
            
            return {
                'status': 'success',
                'config': config
            }
            
        except Exception as e:
            logger.error(f"加载配置版本失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def switch_version(self, project_id: str, version_filename: str) -> Dict[str, Any]:
        """切换到指定版本
        
        Args:
            project_id: 项目ID
            version_filename: 版本文件名
            
        Returns:
            Dict: 切换结果
        """
        try:
            # 加载版本配置
            result = self.load_version(project_id, version_filename)
            if result['status'] != 'success':
                return result
            
            config = result['config']
            
            # 先保存当前配置为新版本（备份）
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            self.save_version(project_id, f"自动备份_{timestamp}", "切换版本前的自动备份")
            
            # 应用版本配置
            self.save(project_id, config)
            
            logger.info(f"已切换配置版本: {project_id} -> {version_filename}")
            
            return {
                'status': 'success',
                'message': '版本切换成功',
                'config': config
            }
            
        except Exception as e:
            logger.error(f"切换配置版本失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def delete_version(self, project_id: str, version_filename: str) -> Dict[str, Any]:
        """删除指定版本
        
        Args:
            project_id: 项目ID
            version_filename: 版本文件名
            
        Returns:
            Dict: 删除结果
        """
        try:
            # 加载当前配置获取项目名称
            config = self.load(project_id)
            project_name = config.get('name', project_id) if config else project_id
            
            version_path = self.config.projects_folder / project_name / 'versions' / version_filename
            
            if not version_path.exists():
                return {'status': 'error', 'message': '版本文件不存在'}
            
            version_path.unlink()
            
            logger.info(f"已删除配置版本: {project_id} - {version_filename}")
            
            return {'status': 'success', 'message': '版本已删除'}
            
        except Exception as e:
            logger.error(f"删除配置版本失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def export_version(self, project_id: str, version_filename: str) -> Dict[str, Any]:
        """导出指定版本的配置
        
        Args:
            project_id: 项目ID
            version_filename: 版本文件名
            
        Returns:
            Dict: 导出结果（包含JSON内容）
        """
        try:
            # 加载版本配置
            result = self.load_version(project_id, version_filename)
            if result['status'] != 'success':
                return result
            
            config = result['config']
            version_info = None
            
            # 重新读取获取版本信息
            # 加载当前配置获取项目名称
            current_config = self.load(project_id)
            project_name = current_config.get('name', project_id) if current_config else project_id
            
            version_path = self.config.projects_folder / project_name / 'versions' / version_filename
            with open(version_path, 'r', encoding='utf-8') as f:
                full_config = json.load(f)
                version_info = full_config.get('_version_info', {})
            
            # 添加版本信息到导出内容
            config['_export_info'] = {
                'exported_from': 'version',
                'version_name': version_info.get('version_name', ''),
                'exported_time': datetime.now().isoformat(),
                'project_id': project_id
            }
            
            json_content = json.dumps(config, ensure_ascii=False, indent=2)
            
            return {
                'status': 'success',
                'json_content': json_content,
                'version_name': version_info.get('version_name', ''),
                'filename': f"{project_id}_{version_info.get('version_name', 'config')}_{datetime.now().strftime('%Y%m%d')}.json"
            }

        except Exception as e:
            logger.error(f"导出配置版本失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    # ========== 需求模板管理 ==========
    
    def save_template(self, template_name: str, template_data: Dict[str, Any], description: str = '') -> Dict[str, Any]:
        """保存需求模板
        
        Args:
            template_name: 模板名称
            template_data: 模板数据（包含cycles和documents）
            description: 模板描述
            
        Returns:
            Dict: 保存结果
        """
        try:
            # 创建模板目录
            templates_dir = self.config.projects_folder / 'templates'
            templates_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成模板ID
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            template_id = f"template_{timestamp}"
            
            # 构建模板数据
            template = {
                'id': template_id,
                'name': template_name,
                'description': description,
                'created_time': datetime.now().isoformat(),
                'cycles': template_data.get('cycles', []),
                'documents': template_data.get('documents', {})
            }
            
            # 保存模板文件
            template_path = templates_dir / f"{template_id}.json"
            with open(template_path, 'w', encoding='utf-8') as f:
                json.dump(template, f, ensure_ascii=False, indent=2)
            
            logger.info(f"需求模板已保存: {template_name}")
            
            return {
                'status': 'success',
                'template_id': template_id,
                'template_name': template_name
            }
            
        except Exception as e:
            logger.error(f"保存需求模板失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def list_templates(self) -> Dict[str, Any]:
        """列出所有需求模板
        
        Returns:
            Dict: 模板列表
        """
        try:
            templates_dir = self.config.projects_folder / 'templates'
            
            if not templates_dir.exists():
                return {'status': 'success', 'templates': []}
            
            templates = []
            for template_file in templates_dir.glob('template_*.json'):
                try:
                    with open(template_file, 'r', encoding='utf-8') as f:
                        template = json.load(f)
                    
                    templates.append({
                        'id': template.get('id', template_file.stem),
                        'name': template.get('name', template_file.stem),
                        'description': template.get('description', ''),
                        'created_time': template.get('created_time', ''),
                        'cycle_count': len(template.get('cycles', [])),
                        'document_count': sum(len(docs.get('required_docs', [])) 
                                             for docs in template.get('documents', {}).values())
                    })
                except Exception as e:
                    logger.warning(f"读取模板文件失败: {template_file} - {e}")
            
            # 按创建时间倒序排序
            templates.sort(key=lambda x: x.get('created_time', ''), reverse=True)
            
            return {'status': 'success', 'templates': templates}
            
        except Exception as e:
            logger.error(f"列出需求模板失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def load_template(self, template_id: str) -> Dict[str, Any]:
        """加载指定模板
        
        Args:
            template_id: 模板ID
            
        Returns:
            Dict: 模板数据
        """
        try:
            template_path = self.config.projects_folder / 'templates' / f"{template_id}.json"
            
            if not template_path.exists():
                return {'status': 'error', 'message': '模板不存在'}
            
            with open(template_path, 'r', encoding='utf-8') as f:
                template = json.load(f)
            
            return {
                'status': 'success',
                'template': template
            }
            
        except Exception as e:
            logger.error(f"加载需求模板失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def delete_template(self, template_id: str) -> Dict[str, Any]:
        """删除指定模板
        
        Args:
            template_id: 模板ID
            
        Returns:
            Dict: 删除结果
        """
        try:
            template_path = self.config.projects_folder / 'templates' / f"{template_id}.json"
            
            if not template_path.exists():
                return {'status': 'error', 'message': '模板不存在'}
            
            template_path.unlink()
            
            logger.info(f"已删除需求模板: {template_id}")
            
            return {'status': 'success', 'message': '模板已删除'}
            
        except Exception as e:
            logger.error(f"删除需求模板失败: {e}")
            return {'status': 'error', 'message': str(e)}
