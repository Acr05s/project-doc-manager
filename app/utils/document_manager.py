"""项目文档管理器"""

import json
import os
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
import shutil
import base64
import io

import pandas as pd
import cv2
import numpy as np
from PIL import Image
import pytesseract

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DocumentManager:
    """项目文档管理器"""
    
    def __init__(self, config: Optional[Dict] = None):
        """初始化文档管理器
        
        Args:
            config: 配置字典
        """
        self.config = config or {}
        self.name = "项目文档管理中心"
        self.version = "1.0.0"
        
        # 设置上传文件夹
        self.upload_folder = Path(self.config.get('upload_folder', 'uploads'))
        self.upload_folder.mkdir(parents=True, exist_ok=True)
        
        # 项目配置存储路径
        self.projects_folder = self.upload_folder / 'projects'
        self.projects_folder.mkdir(parents=True, exist_ok=True)
        
        # 缓存文件夹（用于缩略图和预览缓存）
        self.cache_folder = self.upload_folder / 'cache'
        self.cache_folder.mkdir(parents=True, exist_ok=True)
        self.thumbnail_folder = self.cache_folder / 'thumbnails'
        self.thumbnail_folder.mkdir(parents=True, exist_ok=True)
        self.preview_cache_folder = self.cache_folder / 'previews'
        self.preview_cache_folder.mkdir(parents=True, exist_ok=True)
        
        # 文档数据库（内存中，实际应使用数据库）
        self.documents_db = {}
        self.projects_db = {}
        
        # 待确认文件列表（按项目分组）
        # 结构: {project_id: [{cycle, doc_name, file_path, filename, upload_time, source_zip}, ...]}
        self.pending_files = {}
        
        # 已确认文件记录（用于去重，避免重复匹配）
        # 结构: {project_id: set([(cycle, doc_name, original_filename), ...])}
        self.confirmed_files = {}
        
        # 当前活动项目
        self.current_project = None

        # 操作日志
        self.operation_log_file = self.upload_folder / 'operations.log'
        self._init_operation_log()

        # 加载已保存的项目列表
        self._load_projects_index()
        
        # 缓存配置
        self.cache_enabled = self.config.get('cache_enabled', True)
        self.cache_ttl = self.config.get('cache_ttl', 3600)  # 缓存过期时间（秒）
        
        # 清理过期缓存
        if self.cache_enabled:
            self._clean_expired_cache()

    def _init_operation_log(self):
        """初始化操作日志文件"""
        if not self.operation_log_file.exists():
            self.operation_log_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.operation_log_file, 'w', encoding='utf-8') as f:
                f.write(f"# 操作日志 - 创建于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    def _clean_expired_cache(self):
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
    
    def _get_cache_key(self, doc_id: str, suffix: str = '') -> str:
        """生成缓存键
        
        Args:
            doc_id: 文档ID
            suffix: 后缀（如 '_thumb', '_preview'）
            
        Returns:
            str: 缓存文件名
        """
        import hashlib
        key = hashlib.md5(f"{doc_id}{suffix}".encode()).hexdigest()
        return key
    
    def _get_thumbnail_path(self, doc_id: str) -> Path:
        """获取缩略图路径
        
        Args:
            doc_id: 文档ID
            
        Returns:
            Path: 缩略图文件路径
        """
        cache_key = self._get_cache_key(doc_id, '_thumb')
        return self.thumbnail_folder / f"{cache_key}.jpg"
    
    def _get_preview_cache_path(self, doc_id: str) -> Path:
        """获取预览缓存路径
        
        Args:
            doc_id: 文档ID
            
        Returns:
            Path: 预览缓存文件路径
        """
        cache_key = self._get_cache_key(doc_id, '_preview')
        return self.preview_cache_folder / f"{cache_key}.json"
    
    def _generate_thumbnail(self, image_path: str, max_size: Tuple[int, int] = (200, 200)) -> str:
        """生成缩略图
        
        Args:
            image_path: 原始图片路径
            max_size: 最大尺寸 (width, height)
            
        Returns:
            str: 缩略图base64编码
        """
        try:
            from PIL import Image
            
            img = Image.open(image_path)
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            buffered = io.BytesIO()
            img.save(buffered, format="JPEG", quality=85)
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            return f"data:image/jpeg;base64,{img_base64}"
        except Exception as e:
            logger.error(f"生成缩略图失败: {e}")
            return ""
    
    def _save_preview_cache(self, doc_id: str, preview_data: Dict):
        """保存预览缓存
        
        Args:
            doc_id: 文档ID
            preview_data: 预览数据
        """
        try:
            cache_path = self._get_preview_cache_path(doc_id)
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(preview_data, f, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存预览缓存失败: {e}")
    
    def _load_preview_cache(self, doc_id: str) -> Optional[Dict]:
        """加载预览缓存
        
        Args:
            doc_id: 文档ID
            
        Returns:
            dict: 缓存的预览数据，如果不存在或过期则返回None
        """
        try:
            cache_path = self._get_preview_cache_path(doc_id)
            if not cache_path.exists():
                return None
            
            file_time = cache_path.stat().st_mtime
            current_time = datetime.now().timestamp()
            
            if current_time - file_time > self.cache_ttl:
                cache_path.unlink()
                return None
            
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"加载预览缓存失败: {e}")
            return None

    def log_operation(self, operation: str, details: str = '', status: str = 'success', project: str = None):
        """记录操作日志

        Args:
            operation: 操作类型
            details: 详细信息
            status: 操作状态 success/error
            project: 项目名称
        """
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        project_info = f"[{project}]" if project else ""
        log_entry = f"[{timestamp}] {project_info} [{status.upper()}] {operation}"
        if details:
            log_entry += f" - {details}"
        log_entry += "\n"

        try:
            with open(self.operation_log_file, 'a', encoding='utf-8') as f:
                f.write(log_entry)
            logger.info(f"操作日志: {log_entry.strip()}")
        except Exception as e:
            logger.error(f"写入操作日志失败: {e}")

    def get_operation_logs(self, limit: int = 100, operation_type: str = None, project: str = None) -> List[Dict]:
        """获取操作日志

        Args:
            limit: 返回数量限制
            operation_type: 过滤操作类型
            project: 过滤项目名称

        Returns:
            日志列表
        """
        logs = []
        try:
            if self.operation_log_file.exists():
                with open(self.operation_log_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()

                for line in lines:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue

                    # 解析日志行: [2024-01-01 12:00:00] [项目名] [SUCCESS] 操作 - 详情
                    import re
                    match = re.match(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\](.*?)\[(\w+)\] (.+?)(?:\s*-\s*(.*))?$', line)
                    if match:
                        timestamp, project_info, status, operation, details = match.groups()
                        project_name = project_info.strip().strip('[]')

                        # 过滤
                        if operation_type and operation_type.lower() not in operation.lower():
                            continue
                        if project and project not in project_name:
                            continue

                        logs.append({
                            'timestamp': timestamp,
                            'project': project_name,
                            'status': status.lower(),
                            'operation': operation,
                            'details': details or ''
                        })
        except Exception as e:
            logger.error(f"读取操作日志失败: {e}")

        # 返回最新的日志
        return logs[-limit:] if len(logs) > limit else logs
    
    def _load_projects_index(self):
        """加载项目索引"""
        index_file = self.projects_folder / 'projects_index.json'
        if index_file.exists():
            try:
                with open(index_file, 'r', encoding='utf-8') as f:
                    self.projects_db = json.load(f)
            except:
                self.projects_db = {}
    
    def _save_projects_index(self):
        """保存项目索引"""
        index_file = self.projects_folder / 'projects_index.json'
        try:
            with open(index_file, 'w', encoding='utf-8') as f:
                json.dump(self.projects_db, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存项目索引失败: {e}")
        
    def load_project_config(self, excel_file: str) -> Dict[str, Any]:
        """从Excel加载项目配置和文档结构
        
        适配需求清单格式：
        - 第1行：表标题（可选）
        - 第2行：列标题（分类、序号、文档名称、备注）
        - 第3行开始：数据
        - 第一列: 分类/项目周期（合并单元格，只有第一行有值）
        - 第二列: 序号
        - 第三列: 文档名称
        - 第四列: 备注/文档要求
        
        智能识别文档要求：
        - 包含"签名"或"签字"：需要签名
        - 包含"盖章"或"章"：需要盖章
        - 包含"甲方"：甲方相关
        - 包含"乙方"：乙方相关
        - 包含"业主"：业主相关
        
        Args:
            excel_file: Excel文件路径
            
        Returns:
            dict: 项目配置
        """
        try:
            logger.info(f"加载Excel文件: {excel_file}")
            
            # 读取Excel，不使用header，让列名为Unnamed: X
            df = pd.read_excel(excel_file)
            
            # 提取项目周期和文档结构
            project_config = {
                'cycles': [],
                'documents': {}
            }
            
            current_cycle = None
            
            for idx, row in df.iterrows():
                try:
                    # 尝试找到列标题行，跳过表头行
                    # 智能识别：找到包含"分类"或"序号"或"文档名称"的行作为表头
                    # 这里保持原逻辑：跳过前两行
                    if idx < 2:
                        continue
                    
                    # 获取分类（第一列）
                    category = None
                    # 尝试从多个可能的列名获取
                    for col_name in ['Unnamed: 0', 0, '分类', '周期', '项目周期']:
                        if col_name in row:
                            val = row.get(col_name)
                            if pd.notna(val) and str(val).strip():
                                category = val
                                break
                    
                    # 如果分类有值且不是NaN，则是新的周期
                    if category is not None and str(category).strip():
                        current_cycle = str(category).strip()
                        if current_cycle not in project_config['documents']:
                            project_config['cycles'].append(current_cycle)
                            project_config['documents'][current_cycle] = {
                                'required_docs': [],
                                'uploaded_docs': []
                            }
                    
                    # 如果没有当前周期，跳过
                    if not current_cycle:
                        continue
                    
                    # 获取序号（第二列）
                    doc_index = None
                    for col_name in ['Unnamed: 1', 1, '序号']:
                        if col_name in row:
                            val = row.get(col_name)
                            if pd.notna(val):
                                doc_index = val
                                break
                    
                    # 获取文档名称（第三列）
                    doc_name = None
                    for col_name in ['Unnamed: 2', 2, '文档名称', '文件名', '名称']:
                        if col_name in row:
                            val = row.get(col_name)
                            if pd.notna(val) and str(val).strip():
                                doc_name = str(val).strip()
                                break
                    
                    if doc_name:
                        # 获取文档要求/备注（第四列）
                        doc_requirement = ''
                        for col_name in ['Unnamed: 3', 3, '备注', '要求', '文档要求']:
                            if col_name in row:
                                val = row.get(col_name)
                                if pd.notna(val):
                                    doc_requirement = str(val).strip()
                                    break
                        
                        # 智能标准化文档要求
                        doc_requirement = self._standardize_requirement(doc_requirement)
                        
                        project_config['documents'][current_cycle]['required_docs'].append({
                            'index': int(doc_index) if (pd.notna(doc_index) and str(doc_index).strip() != '') else len(project_config['documents'][current_cycle]['required_docs']) + 1,
                            'name': doc_name,
                            'requirement': doc_requirement,
                            'status': 'pending'
                        })
                except Exception as row_error:
                    logger.warning(f"处理第 {idx} 行时出错: {row_error}，跳过该行")
                    continue
            
            logger.info(f"成功加载项目配置，包含 {len(project_config['cycles'])} 个周期")
            logger.info(f"周期列表: {project_config['cycles']}")
            return project_config
            
        except Exception as e:
            logger.error(f"加载Excel失败: {e}")
            import traceback
            logger.error(f"详细错误信息: {traceback.format_exc()}")
            return {'cycles': [], 'documents': {}}
    
    def _standardize_requirement(self, requirement: str) -> str:
        """智能标准化文档要求
        
        Args:
            requirement: 原始要求文本
            
        Returns:
            str: 标准化后的要求文本
        """
        if not requirement or not requirement.strip():
            return ''
        
        req_lower = requirement.lower()
        req_parts = []
        
        # 智能识别并标准化要求
        if '签名' in requirement or '签字' in requirement:
            if '甲方' in requirement:
                req_parts.append('甲方签字')
            elif '乙方' in requirement:
                req_parts.append('乙方签字')
            elif '业主' in requirement:
                req_parts.append('业主签字')
            else:
                req_parts.append('签字')
        
        if '盖章' in requirement or '章' in requirement:
            if '甲方' in requirement:
                req_parts.append('甲方盖章')
            elif '乙方' in requirement:
                req_parts.append('乙方盖章')
            else:
                req_parts.append('盖章')
        
        # 如果没有识别出任何标准要求，保留原始文本
        if not req_parts:
            return requirement.strip()
        
        return '、'.join(req_parts)
    
    def load_requirements_from_json(self, json_file: str) -> Dict[str, Any]:
        """从JSON文件加载项目配置和文档结构
        
        Args:
            json_file: JSON文件路径
            
        Returns:
            dict: 项目配置
        """
        try:
            logger.info(f"加载JSON文件: {json_file}")
            
            import json
            with open(json_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
            
            # 确保必要字段存在
            if 'cycles' not in project_config:
                project_config['cycles'] = []
            if 'documents' not in project_config:
                project_config['documents'] = {}
            
            # 确保每个周期都有required_docs和uploaded_docs
            for cycle in project_config['cycles']:
                if cycle not in project_config['documents']:
                    project_config['documents'][cycle] = {
                        'required_docs': [],
                        'uploaded_docs': []
                    }
                else:
                    if 'required_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['required_docs'] = []
                    if 'uploaded_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['uploaded_docs'] = []
            
            logger.info(f"成功从JSON加载项目配置，包含 {len(project_config['cycles'])} 个周期")
            return project_config
            
        except Exception as e:
            logger.error(f"加载JSON失败: {e}")
            return {'cycles': [], 'documents': {}}
    
    def load_requirements(self, file_path: str) -> Dict[str, Any]:
        """从文件加载项目配置（自动识别Excel或JSON格式）
        
        Args:
            file_path: 文件路径
            
        Returns:
            dict: 项目配置
        """
        from pathlib import Path
        
        file_ext = Path(file_path).suffix.lower()
        
        if file_ext in ['.xlsx', '.xls']:
            return self.load_project_config(file_path)
        elif file_ext == '.json':
            return self.load_requirements_from_json(file_path)
        else:
            raise ValueError(f"不支持的文件格式: {file_ext}，请使用Excel (.xlsx, .xls) 或 JSON (.json)")
    
    def export_requirements_to_json(self, project_config: Dict) -> str:
        """导出项目配置为JSON格式
        
        Args:
            project_config: 项目配置
            
        Returns:
            str: JSON字符串
        """
        try:
            import json
            
            # 创建导出配置（只导出需求清单，不上传的文档）
            export_config = {
                'name': project_config.get('name', '未命名项目'),
                'description': project_config.get('description', ''),
                'cycles': project_config.get('cycles', []),
                'documents': {}
            }
            
            # 只导出required_docs，不导出uploaded_docs
            for cycle, docs_info in project_config.get('documents', {}).items():
                export_config['documents'][cycle] = {
                    'required_docs': docs_info.get('required_docs', [])
                }
            
            return json.dumps(export_config, ensure_ascii=False, indent=2)
            
        except Exception as e:
            logger.error(f"导出JSON失败: {e}")
            raise
    
    # ========== 项目管理方法 ==========
    
    def create_project(self, name: str, description: str = '') -> Dict[str, Any]:
        """创建新项目
        
        Args:
            name: 项目名称
            description: 项目描述
            
        Returns:
            dict: 创建结果
        """
        try:
            project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            project_config = {
                'id': project_id,
                'name': name,
                'description': description,
                'cycles': [],
                'documents': {},
                'created_time': datetime.now().isoformat(),
                'updated_time': datetime.now().isoformat()
            }
            
            # 保存项目
            self._save_project(project_id, project_config)
            
            # 更新索引
            self.projects_db[project_id] = {
                'id': project_id,
                'name': name,
                'description': description,
                'created_time': project_config['created_time']
            }
            self._save_projects_index()
            
            return {
                'status': 'success',
                'message': '项目创建成功',
                'project': project_config
            }
            
        except Exception as e:
            logger.error(f"创建项目失败: {e}")
            return {'status': 'error', 'message': f'创建失败: {str(e)}'}
    
    def _save_project(self, project_id: str, project_config: Dict):
        """保存项目配置到文件"""
        project_file = self.projects_folder / f"{project_id}.json"
        with open(project_file, 'w', encoding='utf-8') as f:
            json.dump(project_config, f, ensure_ascii=False, indent=2)
    
    def load_project(self, project_id: str) -> Dict[str, Any]:
        """加载项目配置
        
        Args:
            project_id: 项目ID
            
        Returns:
            dict: 项目配置
        """
        try:
            project_file = self.projects_folder / f"{project_id}.json"
            if not project_file.exists():
                return {'status': 'error', 'message': '项目不存在'}
            
            with open(project_file, 'r', encoding='utf-8') as f:
                project_config = json.load(f)
            
            self.current_project = project_config
            
            # 从项目配置中恢复 documents_db
            self._restore_documents_from_project(project_config)
            
            return {
                'status': 'success',
                'project': project_config
            }
            
        except Exception as e:
            logger.error(f"加载项目失败: {e}")
            return {'status': 'error', 'message': f'加载失败: {str(e)}'}
    
    def _restore_documents_from_project(self, project_config: Dict):
        """从项目配置恢复文档数据到 documents_db"""
        try:
            documents = project_config.get('documents', {})
            for cycle, cycle_data in documents.items():
                uploaded_docs = cycle_data.get('uploaded_docs', [])
                for doc in uploaded_docs:
                    doc_id = doc.get('doc_id')
                    if doc_id:
                        # 恢复文档元数据到 documents_db
                        self.documents_db[doc_id] = {
                            'cycle': cycle,
                            'doc_name': doc.get('doc_name', ''),
                            'filename': doc.get('filename', ''),
                            'original_filename': doc.get('original_filename', ''),
                            'file_path': doc.get('file_path', ''),
                            'doc_date': doc.get('doc_date', ''),
                            'sign_date': doc.get('sign_date', ''),
                            'signer': doc.get('signer', ''),
                            'no_signature': doc.get('no_signature', False),
                            'has_seal': doc.get('has_seal', False),
                            'party_a_seal': doc.get('party_a_seal', False),
                            'party_b_seal': doc.get('party_b_seal', False),
                            'no_seal': doc.get('no_seal', False),
                            'other_seal': doc.get('other_seal', ''),
                            'upload_time': doc.get('upload_time', ''),
                            'source': doc.get('source', 'unknown'),
                        }
            logger.info(f"已从项目配置恢复 {len(self.documents_db)} 个文档到 documents_db")
        except Exception as e:
            logger.error(f"恢复文档数据失败: {e}")
    
    def save_project(self, project_config: Dict) -> Dict[str, Any]:
        """保存项目配置
        
        Args:
            project_config: 项目配置
            
        Returns:
            dict: 保存结果
        """
        try:
            project_id = project_config.get('id')
            if not project_id:
                return {'status': 'error', 'message': '项目ID不能为空'}
            
            project_config['updated_time'] = datetime.now().isoformat()
            
            # 保存项目
            self._save_project(project_id, project_config)
            
            # 更新索引
            if project_id in self.projects_db:
                self.projects_db[project_id]['name'] = project_config.get('name')
                self.projects_db[project_id]['updated_time'] = project_config['updated_time']
            else:
                self.projects_db[project_id] = {
                    'id': project_id,
                    'name': project_config.get('name'),
                    'created_time': project_config.get('created_time')
                }
            self._save_projects_index()
            
            return {
                'status': 'success',
                'message': '项目保存成功'
            }
            
        except Exception as e:
            logger.error(f"保存项目失败: {e}")
            return {'status': 'error', 'message': f'保存失败: {str(e)}'}
    
    def get_projects_list(self) -> Dict[str, Any]:
        """获取项目列表
        
        Returns:
            dict: 项目列表
        """
        return {
            'status': 'success',
            'projects': list(self.projects_db.values())
        }
    
    def delete_project(self, project_id: str) -> Dict[str, Any]:
        """删除项目
        
        Args:
            project_id: 项目ID
            
        Returns:
            dict: 删除结果
        """
        try:
            # 删除项目文件
            project_file = self.projects_folder / f"{project_id}.json"
            if project_file.exists():
                project_file.unlink()
            
            # 从索引中移除
            if project_id in self.projects_db:
                del self.projects_db[project_id]
                self._save_projects_index()
            
            return {
                'status': 'success',
                'message': '项目已删除'
            }
            
        except Exception as e:
            logger.error(f"删除项目失败: {e}")
            return {'status': 'error', 'message': f'删除失败: {str(e)}'}
    
    def update_project_structure(self, project_id: str, action: str, data: Dict) -> Dict[str, Any]:
        """更新项目结构
        
        Args:
            project_id: 项目ID
            action: 操作类型 (add_cycle, delete_cycle, rename_cycle, add_doc, delete_doc, update_doc)
            data: 操作数据
            
        Returns:
            dict: 操作结果
        """
        try:
            # 加载项目
            result = self.load_project(project_id)
            if result['status'] != 'success':
                return result
            
            project_config = result['project']
            
            if action == 'add_cycle':
                # 添加周期
                cycle_name = data.get('cycle_name')
                if not cycle_name:
                    return {'status': 'error', 'message': '周期名称不能为空'}
                if cycle_name in project_config['cycles']:
                    return {'status': 'error', 'message': '周期已存在'}
                
                project_config['cycles'].append(cycle_name)
                project_config['documents'][cycle_name] = {
                    'required_docs': [],
                    'uploaded_docs': []
                }
                
            elif action == 'delete_cycle':
                # 删除周期
                cycle_name = data.get('cycle_name')
                if cycle_name in project_config['cycles']:
                    project_config['cycles'].remove(cycle_name)
                if cycle_name in project_config['documents']:
                    del project_config['documents'][cycle_name]
                    
            elif action == 'rename_cycle':
                # 重命名周期
                old_name = data.get('old_name')
                new_name = data.get('new_name')
                if old_name in project_config['documents']:
                    project_config['documents'][new_name] = project_config['documents'].pop(old_name)
                if old_name in project_config['cycles']:
                    idx = project_config['cycles'].index(old_name)
                    project_config['cycles'][idx] = new_name
                    
            elif action == 'add_doc':
                # 添加文档
                cycle_name = data.get('cycle_name')
                doc_name = data.get('doc_name')
                doc_requirement = data.get('requirement', '')
                
                if cycle_name not in project_config['documents']:
                    return {'status': 'error', 'message': '周期不存在'}
                
                project_config['documents'][cycle_name]['required_docs'].append({
                    'name': doc_name,
                    'requirement': doc_requirement,
                    'status': 'pending'
                })
                    
            elif action == 'delete_doc':
                # 删除文档
                cycle_name = data.get('cycle_name')
                doc_name = data.get('doc_name')
                
                if cycle_name in project_config['documents']:
                    docs = project_config['documents'][cycle_name]['required_docs']
                    project_config['documents'][cycle_name]['required_docs'] = [
                        d for d in docs if d['name'] != doc_name
                    ]
                    
            elif action == 'update_doc':
                # 更新文档
                cycle_name = data.get('cycle_name')
                doc_name = data.get('doc_name')
                new_name = data.get('new_name')
                new_requirement = data.get('new_requirement')
                
                if cycle_name in project_config['documents']:
                    for doc in project_config['documents'][cycle_name]['required_docs']:
                        if doc['name'] == doc_name:
                            if new_name:
                                doc['name'] = new_name
                            if new_requirement is not None:
                                doc['requirement'] = new_requirement
                            break
            else:
                return {'status': 'error', 'message': '未知操作'}
            
            # 保存更新后的项目
            self._save_project(project_id, project_config)
            
            return {
                'status': 'success',
                'message': '项目结构已更新',
                'project': project_config
            }
            
        except Exception as e:
            logger.error(f"更新项目结构失败: {e}")
            return {'status': 'error', 'message': f'更新失败: {str(e)}'}
    
    def export_project_json(self, project_id: str) -> Dict[str, Any]:
        """导出项目配置为JSON
        
        Args:
            project_id: 项目ID
            
        Returns:
            dict: 导出结果
        """
        try:
            result = self.load_project(project_id)
            if result['status'] != 'success':
                return result
            
            return {
                'status': 'success',
                'data': result['project']
            }
            
        except Exception as e:
            logger.error(f"导出项目失败: {e}")
            return {'status': 'error', 'message': f'导出失败: {str(e)}'}

    def confirm_cycle_documents(self, project_id: str, cycle_name: str) -> Dict[str, Any]:
        """确认周期所有文档无误

        Args:
            project_id: 项目ID
            cycle_name: 周期名称

        Returns:
            dict: 确认结果
        """
        try:
            # 加载项目
            result = self.load_project(project_id)
            if result['status'] != 'success':
                return result

            project = result['project']

            # 确保cycle_confirmed字段存在
            if 'cycle_confirmed' not in project:
                project['cycle_confirmed'] = {}

            # 标记周期已确认
            project['cycle_confirmed'][cycle_name] = {
                'confirmed': True,
                'confirmed_time': datetime.now().isoformat()
            }

            # 保存项目
            self._save_project(project_id, project)

            logger.info(f"周期 {cycle_name} 文档已确认，项目 {project_id}")

            return {
                'status': 'success',
                'message': f'周期 "{cycle_name}" 文档已确认',
                'project': project
            }

        except Exception as e:
            logger.error(f"确认周期文档失败: {e}")
            return {'status': 'error', 'message': f'确认失败: {str(e)}'}

    def import_project_json(self, json_data: Dict, name: str = None) -> Dict[str, Any]:
        """从JSON导入项目配置
        
        Args:
            json_data: JSON数据
            name: 新项目名称（可选）
            
        Returns:
            dict: 导入结果
        """
        try:
            # 生成新的项目ID
            project_id = f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            # 如果提供了新名称，更新名称
            if name:
                json_data['name'] = name
            
            # 确保必要字段存在
            json_data['id'] = project_id
            json_data['created_time'] = datetime.now().isoformat()
            json_data['updated_time'] = datetime.now().isoformat()
            
            if 'cycles' not in json_data:
                json_data['cycles'] = []
            if 'documents' not in json_data:
                json_data['documents'] = {}
            
            # 保存项目
            self._save_project(project_id, json_data)
            
            # 更新索引
            self.projects_db[project_id] = {
                'id': project_id,
                'name': json_data.get('name', '未命名项目'),
                'created_time': json_data['created_time']
            }
            self._save_projects_index()
            
            return {
                'status': 'success',
                'message': '项目导入成功',
                'project': json_data
            }
            
        except Exception as e:
            logger.error(f"导入项目失败: {e}")
            return {'status': 'error', 'message': f'导入失败: {str(e)}'}
    
    def get_missing_documents(self, project_config: Dict) -> Dict[str, List]:
        """统计缺失的文档
        
        Args:
            project_config: 项目配置
            
        Returns:
            dict: 缺失文档统计
        """
        missing = {}
        
        for cycle, docs_info in project_config['documents'].items():
            missing[cycle] = []
            
            for doc in docs_info['required_docs']:
                if doc['status'] != 'uploaded':
                    missing[cycle].append({
                        'name': doc['name'],
                        'requirement': doc['requirement']
                    })
        
        return {
            'total_required': sum(len(docs) for docs in missing.values()),
            'missing_by_cycle': missing
        }
    
    def detect_signature(self, image_path: str) -> Tuple[bool, float]:
        """检测文档是否有签字（增强版）
        
        使用多种技术组合：
        - 边缘检测（Canny）
        - 形态学操作
        - 自适应阈值
        - 连通区域分析
        - 笔画宽度分析
        
        Args:
            image_path: 图像文件路径
            
        Returns:
            tuple: (是否有签字, 置信度)
        """
        try:
            image = cv2.imread(image_path)
            if image is None:
                logger.warning(f"无法读取图像: {image_path}")
                return False, 0.0
            
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # 1. 基础边缘检测
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            edges = cv2.Canny(enhanced, 50, 150)
            total_pixels = edges.shape[0] * edges.shape[1]
            edge_pixels = cv2.countNonZero(edges)
            edge_ratio = edge_pixels / total_pixels
            
            # 2. 形态学操作增强签字区域
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            dilated = cv2.dilate(edges, kernel, iterations=1)
            morph_ratio = cv2.countNonZero(dilated) / total_pixels
            
            # 3. 自适应阈值检测
            adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                           cv2.THRESH_BINARY_INV, 11, 2)
            adaptive_ratio = cv2.countNonZero(adaptive) / total_pixels
            
            # 4. 连通区域分析
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(adaptive, connectivity=8)
            if num_labels > 1:
                # 过滤掉过小的区域
                valid_components = [s for s in stats[1:] if s[4] > 50]  # 面积大于50像素
                component_score = len(valid_components) / 100.0
            else:
                component_score = 0.0
            
            # 5. 笔画宽度分析（简化版）
            # 使用距离变换估计笔画宽度
            dist_transform = cv2.distanceTransform(255 - adaptive, cv2.DIST_L2, 5)
            stroke_width = np.mean(dist_transform[dist_transform > 0])
            stroke_score = min(stroke_width / 10.0, 1.0)  # 归一化
            
            # 6. 区域检测（签字通常在文档底部）
            h, w = gray.shape
            bottom_region = gray[int(h * 0.7):, :]
            bottom_edges = cv2.Canny(bottom_region, 50, 150)
            bottom_ratio = cv2.countNonZero(bottom_edges) / (bottom_region.shape[0] * bottom_region.shape[1])
            
            # 综合评分（加权平均）
            scores = {
                'edge': min(edge_ratio * 100, 100.0),
                'morph': min(morph_ratio * 100, 100.0),
                'adaptive': min(adaptive_ratio * 100, 100.0),
                'component': min(component_score * 100, 100.0),
                'stroke': stroke_score * 100,
                'bottom': min(bottom_ratio * 100, 100.0)
            }
            
            # 权重配置
            weights = {
                'edge': 0.25,
                'morph': 0.15,
                'adaptive': 0.20,
                'component': 0.15,
                'stroke': 0.10,
                'bottom': 0.15
            }
            
            final_score = sum(scores[k] * weights[k] for k in scores)
            
            # 动态阈值：根据文档内容密度调整
            base_threshold = 1.5
            if adaptive_ratio > 0.1:  # 文档内容较多
                base_threshold = 2.0
            
            has_signature = final_score > base_threshold
            confidence = min(final_score, 100.0)
            
            logger.info(f"签字检测增强版: {image_path}, 有签字: {has_signature}, 置信度: {confidence:.2f}%, 详细评分: {scores}")
            return has_signature, confidence
            
        except Exception as e:
            logger.error(f"签字检测失败: {e}")
            return False, 0.0
    
    def detect_seal(self, image_path: str) -> Tuple[bool, float]:
        """检测文档是否有盖章（增强版）
        
        使用多种技术组合：
        - 多范围颜色检测
        - 圆形检测（Hough变换）
        - 纹理分析
        - 区域密度分析
        
        Args:
            image_path: 图像文件路径
            
        Returns:
            tuple: (是否有盖章, 置信度)
        """
        try:
            image = cv2.imread(image_path)
            if image is None:
                logger.warning(f"无法读取图像: {image_path}")
                return False, 0.0
            
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            h, w = image.shape[:2]
            total_pixels = h * w
            
            # 1. 多范围颜色检测（更精确的颜色范围）
            # 红色范围1
            lower_red1 = np.array([0, 70, 50])
            upper_red1 = np.array([10, 255, 255])
            mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
            
            # 红色范围2
            lower_red2 = np.array([170, 70, 50])
            upper_red2 = np.array([180, 255, 255])
            mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
            
            # 红色范围3（深红）
            lower_red3 = np.array([175, 70, 50])
            upper_red3 = np.array([180, 255, 255])
            
            mask_red = cv2.bitwise_or(mask_red1, cv2.bitwise_or(mask_red2, mask_red3))
            
            # 蓝色范围
            lower_blue = np.array([100, 70, 50])
            upper_blue = np.array([130, 255, 255])
            mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
            
            # 紫色范围（有些印章是紫色的）
            lower_purple = np.array([130, 70, 50])
            upper_purple = np.array([160, 255, 255])
            mask_purple = cv2.inRange(hsv, lower_purple, upper_purple)
            
            # 合并所有颜色掩码
            mask = cv2.bitwise_or(mask_red, cv2.bitwise_or(mask_blue, mask_purple))
            
            # 计算颜色得分
            colored_pixels = cv2.countNonZero(mask)
            color_ratio = colored_pixels / total_pixels
            color_score = min(color_ratio * 100, 100.0)
            
            # 2. 圆形检测（印章通常是圆形的）
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            circles = cv2.HoughCircles(
                gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=50,
                param1=50, param2=30, minRadius=20, maxRadius=min(h, w)//3
            )
            
            circle_score = 0.0
            if circles is not None:
                circles = np.round(circles[0, :]).astype("int")
                # 检查检测到的圆形是否在颜色区域内
                valid_circles = 0
                for (x, y, r) in circles:
                    # 创建圆形掩码
                    circle_mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.circle(circle_mask, (x, y), r, 255, -1)
                    # 计算圆形内颜色像素比例
                    circle_color_pixels = cv2.countNonZero(cv2.bitwise_and(mask, circle_mask))
                    circle_area = np.pi * r * r
                    if circle_color_pixels / circle_area > 0.3:  # 至少30%是目标颜色
                        valid_circles += 1
                
                circle_score = min((valid_circles / max(len(circles), 1)) * 100, 100.0)
            
            # 3. 纹理分析（印章有特定的纹理特征）
            # 使用Laplacian算子检测纹理
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            texture_variance = np.var(laplacian)
            texture_score = min(texture_variance / 1000.0 * 100, 100.0)
            
            # 4. 区域密度分析（印章区域颜色密度高）
            # 使用形态学闭运算连接相近的像素
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            # 查找轮廓
            contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            density_score = 0.0
            if contours:
                # 计算最大轮廓的填充率
                max_contour = max(contours, key=cv2.contourArea)
                contour_area = cv2.contourArea(max_contour)
                hull = cv2.convexHull(max_contour)
                hull_area = cv2.contourArea(hull)
                
                if hull_area > 0:
                    fill_ratio = contour_area / hull_area
                    # 印章的填充率通常在0.6-0.9之间
                    if 0.6 <= fill_ratio <= 0.9:
                        density_score = 90.0
                    else:
                        density_score = min(fill_ratio * 100, 100.0)
            
            # 5. 位置分析（印章通常在特定位置）
            # 检测颜色区域的质心位置
            M = cv2.moments(mask)
            if M['m00'] > 0:
                cx = int(M['m10'] / M['m00'])
                cy = int(M['m01'] / M['m00'])
                
                # 检查是否在常见盖章位置（右下角、左下角等）
                position_score = 0.0
                if cx > w * 0.7 and cy > h * 0.7:  # 右下角
                    position_score = 80.0
                elif cx < w * 0.3 and cy > h * 0.7:  # 左下角
                    position_score = 70.0
                elif cy > h * 0.6:  # 下半部分
                    position_score = 50.0
            else:
                position_score = 0.0
            
            # 综合评分
            scores = {
                'color': color_score,
                'circle': circle_score,
                'texture': texture_score,
                'density': density_score,
                'position': position_score
            }
            
            # 权重配置
            weights = {
                'color': 0.35,
                'circle': 0.25,
                'texture': 0.15,
                'density': 0.15,
                'position': 0.10
            }
            
            final_score = sum(scores[k] * weights[k] for k in scores)
            
            # 动态阈值
            base_threshold = 2.0
            if color_ratio > 0.005:  # 颜色区域较大
                base_threshold = 1.5
            
            has_seal = final_score > base_threshold
            confidence = min(final_score, 100.0)
            
            logger.info(f"盖章检测增强版: {image_path}, 有盖章: {has_seal}, 置信度: {confidence:.2f}%, 详细评分: {scores}")
            return has_seal, confidence
            
        except Exception as e:
            logger.error(f"盖章检测失败: {e}")
            return False, 0.0
    
    def upload_document(self, file, cycle: str, doc_name: str, 
                       doc_date: Optional[str] = None, sign_date: Optional[str] = None, 
                       signer: Optional[str] = None, no_signature: bool = False,
                       has_seal: bool = False,
                       party_a_seal: bool = False, party_b_seal: bool = False,
                       no_seal: bool = False, other_seal: Optional[str] = None,
                       project_id: Optional[str] = None, category: Optional[str] = None) -> Dict[str, Any]:
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
            project_id: 项目ID（可选，用于保存到项目配置）
            category: 分类名称（可选，用于组织文件）
            
        Returns:
            dict: 上传结果
        """
        try:
            # 生成文件路径
            base_folder = self.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
            
            # 如果有分类，使用分类目录
            if category:
                cycle_folder = base_folder / category.replace('/', '_')
            else:
                cycle_folder = base_folder
            
            cycle_folder.mkdir(parents=True, exist_ok=True)
            
            # 生成唯一文件名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            original_filename = file.filename
            file_ext = Path(original_filename).suffix
            new_filename = f"{signer or 'unknown'}_{timestamp}{file_ext}"
            
            file_path = cycle_folder / new_filename
            file.save(str(file_path))
            
            logger.info(f"文件上传成功: {file_path}")
            
            # 检测签字和盖章
            detected_signature = False
            detected_seal = False
            sign_confidence = 0.0
            seal_confidence = 0.0
            
            if file_ext.lower() in ['.png', '.jpg', '.jpeg', '.tiff']:
                detected_signature, sign_confidence = self.detect_signature(str(file_path))
                detected_seal, seal_confidence = self.detect_seal(str(file_path))
            
            # 保存文档元数据
            metadata = {
                'cycle': cycle,
                'doc_name': doc_name,
                'category': category,
                'filename': new_filename,
                'original_filename': original_filename,
                'file_path': str(file_path),
                'upload_time': datetime.now().isoformat(),
                'doc_date': doc_date,
                'sign_date': sign_date,
                'signer': signer,
                'no_signature': no_signature,
                'has_seal_marked': has_seal,
                'party_a_seal': party_a_seal,
                'party_b_seal': party_b_seal,
                'no_seal': no_seal,
                'other_seal': other_seal,
                'detected_signature': detected_signature,
                'sign_confidence': float(sign_confidence),
                'detected_seal': detected_seal,
                'seal_confidence': float(seal_confidence),
                'file_size': os.path.getsize(file_path)
            }
            
            # 存储元数据
            doc_id = f"{cycle}_{doc_name}_{timestamp}"
            self.documents_db[doc_id] = metadata
            metadata['doc_id'] = doc_id
            
            # 保存到项目配置（如果有项目ID）
            if project_id and project_id in self.projects_db:
                project_result = self.load_project(project_id)
                if project_result['status'] == 'success':
                    project_config = project_result['project']
                    if 'documents' not in project_config:
                        project_config['documents'] = {}
                    if cycle not in project_config['documents']:
                        project_config['documents'][cycle] = {'required_docs': [], 'uploaded_docs': []}
                    if 'uploaded_docs' not in project_config['documents'][cycle]:
                        project_config['documents'][cycle]['uploaded_docs'] = []
                    project_config['documents'][cycle]['uploaded_docs'].append(metadata)
                    self._save_project(project_id, project_config)
                    logger.info(f"已保存上传文档到项目配置: {project_id}")
            
            return {
                'status': 'success',
                'message': '文档上传成功',
                'doc_id': doc_id,
                'metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"上传文档失败: {e}")
            return {
                'status': 'error',
                'message': f'上传失败: {str(e)}',
                'doc_id': None
            }
    
    def get_documents(self, cycle: str = None, doc_name: str = None) -> List[Dict]:
        """获取文档列表
        
        Args:
            cycle: 项目周期（可选）
            doc_name: 文档名称（可选）
            
        Returns:
            list: 文档元数据列表
        """
        docs = []
        
        for doc_id, metadata in self.documents_db.items():
            if cycle and metadata['cycle'] != cycle:
                continue
            if doc_name and metadata['doc_name'] != doc_name:
                continue
            docs.append({**metadata, 'id': doc_id})
        
        return docs
    
    def _convert_pdf_to_images(self, pdf_path: str, max_pages: int = 10) -> List[str]:
        """将PDF转换为图片（base64编码）
        
        Args:
            pdf_path: PDF文件路径
            max_pages: 最大转换页数
            
        Returns:
            list: base64编码的图片列表
        """
        try:
            from PyPDF2 import PdfReader
            from PIL import Image
            
            images = []
            
            with open(pdf_path, 'rb') as f:
                pdf_reader = PdfReader(f)
                total_pages = len(pdf_reader.pages)
                
                for i in range(min(total_pages, max_pages)):
                    try:
                        page = pdf_reader.pages[i]
                        
                        if '/XObject' in page['/Resources']:
                            xObject = page['/Resources']['/XObject'].get_object()
                            
                            for obj in xObject:
                                if xObject[obj]['/Subtype'] == '/Image':
                                    size = (xObject[obj]['/Width'], xObject[obj]['/Height'])
                                    data = xObject[obj]._data
                                    
                                    if xObject[obj]['/ColorSpace'] == '/DeviceRGB':
                                        mode = "RGB"
                                    else:
                                        mode = "P"
                                    
                                    if '/Filter' in xObject[obj]:
                                        if xObject[obj]['/Filter'] == '/DCTDecode':
                                            img = Image.open(io.BytesIO(data))
                                    else:
                                        img = Image.frombytes(mode, size, data)
                                    
                                    buffered = io.BytesIO()
                                    img.save(buffered, format="PNG")
                                    img_base64 = base64.b64encode(buffered.getvalue()).decode()
                                    images.append(f"data:image/png;base64,{img_base64}")
                    except Exception as e:
                        logger.warning(f"PDF第{i+1}页转换失败: {e}")
                        continue
            
            return images
            
        except Exception as e:
            logger.error(f"PDF转图片失败: {e}")
            return []
    
    def _convert_docx_to_html(self, docx_path: str) -> str:
        """将Word文档转换为HTML
        
        Args:
            docx_path: Word文档路径
            
        Returns:
            str: HTML内容
        """
        try:
            from docx import Document
            
            doc = Document(docx_path)
            html_content = ['<div class="docx-preview">']
            
            for para in doc.paragraphs:
                text = para.text.strip()
                if text:
                    style = ""
                    if para.style.name.startswith('Heading'):
                        level = para.style.name.replace('Heading ', '')
                        style = f' class="docx-h{level}"'
                    html_content.append(f'<p{style}>{text}</p>')
            
            html_content.append('</div>')
            return '\n'.join(html_content)
            
        except Exception as e:
            logger.error(f"Word转HTML失败: {e}")
            return f'<p class="error">预览失败: {str(e)}</p>'
    
    def _convert_xlsx_to_html(self, xlsx_path: str) -> str:
        """将Excel转换为HTML表格
        
        Args:
            xlsx_path: Excel文件路径
            
        Returns:
            str: HTML内容
        """
        try:
            df = pd.read_excel(xlsx_path, nrows=100)
            html_content = ['<div class="xlsx-preview"><table class="data-table">']
            
            html_content.append('<thead><tr>')
            for col in df.columns:
                html_content.append(f'<th>{col}</th>')
            html_content.append('</tr></thead>')
            
            html_content.append('<tbody>')
            for _, row in df.iterrows():
                html_content.append('<tr>')
                for val in row:
                    html_content.append(f'<td>{val}</td>')
                html_content.append('</tr>')
            html_content.append('</tbody></table></div>')
            
            return '\n'.join(html_content)
            
        except Exception as e:
            logger.error(f"Excel转HTML失败: {e}")
            return f'<p class="error">预览失败: {str(e)}</p>'
    
    def get_document_preview(self, doc_id: str) -> Dict[str, Any]:
        """获取文档预览内容（带缓存）
        
        Args:
            doc_id: 文档ID
            
        Returns:
            dict: 预览结果
        """
        if doc_id not in self.documents_db:
            return {'status': 'error', 'message': '文档不存在'}
        
        metadata = self.documents_db[doc_id]
        file_path = metadata.get('file_path')
        
        if not file_path or not Path(file_path).exists():
            return {'status': 'error', 'message': '文件不存在'}
        
        file_ext = Path(file_path).suffix.lower()
        
        # 尝试从缓存加载
        if self.cache_enabled:
            cached_data = self._load_preview_cache(doc_id)
            if cached_data:
                logger.debug(f"使用预览缓存: {doc_id}")
                return cached_data
        
        try:
            result = None
            
            if file_ext == '.pdf':
                images = self._convert_pdf_to_images(file_path)
                result = {
                    'status': 'success',
                    'type': 'pdf',
                    'content': images,
                    'total_pages': len(images)
                }
            
            elif file_ext in ['.doc', '.docx']:
                if file_ext == '.doc':
                    # .doc 文件使用 textract 或其他方法处理
                    try:
                        import textract
                        text = textract.process(file_path).decode('utf-8', errors='ignore')
                        html = f'<div class="docx-preview"><pre>{text}</pre></div>'
                        result = {
                            'status': 'success',
                            'type': 'text',
                            'content': text
                        }
                    except Exception as e:
                        logger.warning(f"处理 .doc 文件失败: {e}")
                        result = {
                            'status': 'success',
                            'type': 'unsupported',
                            'content': '暂不支持预览 .doc 文件，请下载后查看'
                        }
                else:
                    html = self._convert_docx_to_html(file_path)
                    result = {
                        'status': 'success',
                        'type': 'docx',
                        'content': html
                    }
            
            elif file_ext in ['.xls', '.xlsx']:
                html = self._convert_xlsx_to_html(file_path)
                result = {
                    'status': 'success',
                    'type': 'xlsx',
                    'content': html
                }
            
            elif file_ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
                with open(file_path, 'rb') as f:
                    img_data = f.read()
                    img_base64 = base64.b64encode(img_data).decode()
                    result = {
                        'status': 'success',
                        'type': 'image',
                        'content': f"data:image/{file_ext[1:]};base64,{img_base64}"
                    }
            
            elif file_ext in ['.txt', '.md', '.json', '.xml', '.html', '.css', '.js']:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    text_content = f.read()
                    result = {
                        'status': 'success',
                        'type': 'text',
                        'content': text_content
                    }
            
            else:
                result = {
                    'status': 'success',
                    'type': 'unsupported',
                    'content': f'暂不支持预览此文件类型（{file_ext}），请下载后查看'
                }
            
            # 保存到缓存
            if self.cache_enabled and result and result.get('status') == 'success':
                self._save_preview_cache(doc_id, result)
                logger.debug(f"保存预览缓存: {doc_id}")
            
            return result
                
        except Exception as e:
            logger.error(f"获取文档预览失败: {e}")
            return {'status': 'error', 'message': f'预览失败: {str(e)}'}
    
    def check_document_compliance(self, doc_id: str, requirement: str) -> Dict[str, Any]:
        """检查文档是否符合要求
        
        Args:
            doc_id: 文档ID
            requirement: 文档要求（D列内容）
            
        Returns:
            dict: 检查结果
        """
        if doc_id not in self.documents_db:
            return {'status': 'error', 'message': '文档不存在'}
        
        metadata = self.documents_db[doc_id]
        requirement_lower = requirement.lower()
        
        issues = []
        
        # 检查是否需要签字
        if '签字' in requirement or '签名' in requirement or '签署' in requirement:
            has_signature = metadata.get('signer') or metadata.get('detected_signature')
            if not has_signature:
                issues.append('要求签字，但未标记签字人')
        
        # 检查是否需要盖章
        if '盖章' in requirement or '章' in requirement:
            has_any_seal = (
                metadata.get('has_seal_marked') or 
                metadata.get('party_a_seal') or 
                metadata.get('party_b_seal') or 
                metadata.get('other_seal')
            )
            if not has_any_seal:
                issues.append('要求盖章，但未标记盖章')
        
        # 检查是否需要甲方签字/盖章
        if '甲方' in requirement:
            if '签字' in requirement or '签名' in requirement:
                if not metadata.get('signer'):
                    issues.append('要求甲方签字，但未标记签字人')
            if '盖章' in requirement:
                if not metadata.get('party_a_seal'):
                    issues.append('要求甲方盖章，但未标记甲方盖章')
        
        # 检查是否需要乙方签字/盖章
        if '乙方' in requirement:
            if '签字' in requirement or '签名' in requirement:
                if not metadata.get('signer'):
                    issues.append('要求乙方签字，但未标记签字人')
            if '盖章' in requirement:
                if not metadata.get('party_b_seal'):
                    issues.append('要求乙方盖章，但未标记乙方盖章')
        
        return {
            'status': 'success',
            'is_compliant': len(issues) == 0,
            'issues': issues
        }
    
    def delete_document(self, doc_id: str) -> Dict[str, Any]:
        """删除文档
        
        Args:
            doc_id: 文档ID
            
        Returns:
            dict: 删除结果
        """
        try:
            if doc_id not in self.documents_db:
                return {'status': 'error', 'message': '文档不存在'}
            
            metadata = self.documents_db[doc_id]
            file_path = Path(metadata['file_path'])
            cycle = metadata['cycle']
            doc_name = metadata['doc_name']
            
            # 删除文件
            if file_path.exists():
                file_path.unlink()
                logger.info(f"文档已删除: {file_path}")
            
            # 删除元数据
            del self.documents_db[doc_id]
            
            # 从所有项目配置的uploaded_docs中删除对应记录
            for project_id, project_config in self.projects_db.items():
                try:
                    if 'documents' in project_config and cycle in project_config['documents']:
                        uploaded_docs = project_config['documents'][cycle].get('uploaded_docs', [])
                        # 查找并删除对应文档
                        updated_uploaded_docs = [doc for doc in uploaded_docs if doc.get('doc_id') != doc_id]
                        if len(updated_uploaded_docs) != len(uploaded_docs):
                            project_config['documents'][cycle]['uploaded_docs'] = updated_uploaded_docs
                            # 保存更新后的项目配置
                            self._save_project(project_id, project_config)
                            logger.info(f"从项目 {project_id} 的配置中删除了文档 {doc_id}")
                except Exception as e:
                    logger.error(f"更新项目配置失败: {e}")
            
            return {'status': 'success', 'message': '文档已删除'}
            
        except Exception as e:
            logger.error(f"删除文档失败: {e}")
            return {'status': 'error', 'message': f'删除失败: {str(e)}'}
    
    def batch_update_documents(self, doc_ids: List[str], action: str) -> Dict[str, Any]:
        """批量更新文档属性
        
        Args:
            doc_ids: 文档ID列表
            action: 操作类型 (seal, sign)
            
        Returns:
            dict: 更新结果
        """
        try:
            updated_count = 0
            
            for doc_id in doc_ids:
                if doc_id in self.documents_db:
                    if action == 'seal':
                        # 标记已盖章
                        self.documents_db[doc_id]['has_seal_marked'] = True
                        self.documents_db[doc_id]['no_seal'] = False
                    elif action == 'sign':
                        # 标记已签字
                        self.documents_db[doc_id]['signer'] = self.documents_db[doc_id].get('signer', '未知')
                        self.documents_db[doc_id]['no_signature'] = False
                    updated_count += 1
            
            return {
                'status': 'success', 
                'message': f'已成功更新 {updated_count} 个文档',
                'updated_count': updated_count
            }
            
        except Exception as e:
            logger.error(f"批量更新文档失败: {e}")
            return {'status': 'error', 'message': f'更新失败: {str(e)}'}
    
    def batch_delete_documents(self, doc_ids: List[str]) -> Dict[str, Any]:
        """批量删除文档
        
        Args:
            doc_ids: 文档ID列表
            
        Returns:
            dict: 删除结果
        """
        try:
            deleted_count = 0
            deleted_docs = []
            
            for doc_id in doc_ids:
                if doc_id in self.documents_db:
                    # 获取文档信息
                    metadata = self.documents_db[doc_id]
                    file_path = Path(metadata['file_path'])
                    cycle = metadata['cycle']
                    doc_name = metadata['doc_name']
                    
                    # 删除文件
                    if file_path.exists():
                        file_path.unlink()
                        logger.info(f"文档已删除: {file_path}")
                    
                    # 从数据库中删除
                    del self.documents_db[doc_id]
                    deleted_count += 1
                    deleted_docs.append({'doc_id': doc_id, 'cycle': cycle, 'doc_name': doc_name})
            
            # 从所有项目配置的uploaded_docs中删除对应记录
            for project_id, project_config in self.projects_db.items():
                try:
                    for deleted_doc in deleted_docs:
                        cycle = deleted_doc['cycle']
                        doc_id = deleted_doc['doc_id']
                        if 'documents' in project_config and cycle in project_config['documents']:
                            uploaded_docs = project_config['documents'][cycle].get('uploaded_docs', [])
                            # 查找并删除对应文档
                            updated_uploaded_docs = [doc for doc in uploaded_docs if doc.get('doc_id') != doc_id]
                            if len(updated_uploaded_docs) != len(uploaded_docs):
                                project_config['documents'][cycle]['uploaded_docs'] = updated_uploaded_docs
                                # 保存更新后的项目配置
                                self._save_project(project_id, project_config)
                                logger.info(f"从项目 {project_id} 的配置中删除了文档 {doc_id}")
                except Exception as e:
                    logger.error(f"更新项目配置失败: {e}")
            
            return {
                'status': 'success', 
                'message': f'已成功删除 {deleted_count} 个文档',
                'deleted_count': deleted_count
            }
            
        except Exception as e:
            logger.error(f"批量删除文档失败: {e}")
            return {'status': 'error', 'message': f'删除失败: {str(e)}'}
    
    def get_categories(self, cycle: str, doc_name: str) -> List[str]:
        """获取分类列表
        
        Args:
            cycle: 项目周期
            doc_name: 文档名称
            
        Returns:
            list: 分类列表
        """
        try:
            # 获取文档目录
            doc_folder = self.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
            if not doc_folder.exists():
                return []
            
            # 列出所有子目录作为分类
            categories = []
            for item in doc_folder.iterdir():
                if item.is_dir():
                    categories.append(item.name)
            
            return categories
        except Exception as e:
            logger.error(f"获取分类列表失败: {e}")
            return []
    
    def create_category(self, cycle: str, doc_name: str, category: str) -> Dict[str, Any]:
        """创建分类
        
        Args:
            cycle: 项目周期
            doc_name: 文档名称
            category: 分类名称
            
        Returns:
            dict: 创建结果
        """
        try:
            # 创建分类目录
            category_folder = self.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_') / category.replace('/', '_')
            category_folder.mkdir(parents=True, exist_ok=True)
            
            return {'status': 'success', 'message': '分类创建成功'}
        except Exception as e:
            logger.error(f"创建分类失败: {e}")
            return {'status': 'error', 'message': f'创建失败: {str(e)}'}
    
    def delete_category(self, cycle: str, doc_name: str, category: str) -> Dict[str, Any]:
        """删除分类
        
        Args:
            cycle: 项目周期
            doc_name: 文档名称
            category: 分类名称
            
        Returns:
            dict: 删除结果
        """
        try:
            # 删除分类目录
            category_folder = self.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_') / category.replace('/', '_')
            if category_folder.exists():
                shutil.rmtree(category_folder)
                logger.info(f"分类已删除: {category_folder}")
            
            return {'status': 'success', 'message': '分类删除成功'}
        except Exception as e:
            logger.error(f"删除分类失败: {e}")
            return {'status': 'error', 'message': f'删除失败: {str(e)}'}
    
    def update_document(self, doc_id: str, data: Dict) -> Dict[str, Any]:
        """更新文档元数据
        
        Args:
            doc_id: 文档ID
            data: 更新的数据
            
        Returns:
            dict: 更新结果
        """
        try:
            if doc_id not in self.documents_db:
                return {'status': 'error', 'message': '文档不存在'}
            
            metadata = self.documents_db[doc_id]
            
            # 更新允许的字段
            updatable_fields = [
                'doc_date', 'sign_date', 'signer', 'no_signature', 'has_seal_marked',
                'party_a_seal', 'party_b_seal', 'no_seal', 'other_seal'
            ]
            
            for field in updatable_fields:
                if field in data:
                    metadata[field] = data[field]
            
            metadata['update_time'] = datetime.now().isoformat()
            
            return {
                'status': 'success',
                'message': '文档信息已更新',
                'metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"更新文档失败: {e}")
            return {'status': 'error', 'message': f'更新失败: {str(e)}'}
    
    def replace_document(self, doc_id: str, file, new_data: Dict = None) -> Dict[str, Any]:
        """替换文档（覆盖上传）
        
        Args:
            doc_id: 原文档ID
            file: 新文件对象
            new_data: 新的元数据（可选）
            
        Returns:
            dict: 替换结果
        """
        try:
            if doc_id not in self.documents_db:
                return {'status': 'error', 'message': '文档不存在'}
            
            old_metadata = self.documents_db[doc_id]
            old_file_path = Path(old_metadata['file_path'])
            
            # 生成新文件名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            original_filename = file.filename
            file_ext = Path(original_filename).suffix
            new_filename = f"{old_metadata.get('signer', 'unknown')}_{timestamp}{file_ext}"
            
            # 保存新文件
            file_path = old_file_path.parent / new_filename
            file.save(str(file_path))
            
            # 删除旧文件
            if old_file_path.exists():
                old_file_path.unlink()
            
            # 更新元数据
            metadata = old_metadata.copy()
            metadata['filename'] = new_filename
            metadata['original_filename'] = original_filename
            metadata['file_path'] = str(file_path)
            metadata['upload_time'] = datetime.now().isoformat()
            metadata['file_size'] = os.path.getsize(file_path)
            
            # 更新传入的新数据
            if new_data:
                for key in ['doc_date', 'sign_date', 'signer', 'no_signature', 'has_seal_marked', 
                           'party_a_seal', 'party_b_seal', 'no_seal', 'other_seal']:
                    if key in new_data:
                        metadata[key] = new_data[key]
            
            # 重新检测签字和盖章
            if file_ext.lower() in ['.png', '.jpg', '.jpeg', '.tiff']:
                detected_signature, sign_confidence = self.detect_signature(str(file_path))
                detected_seal, seal_confidence = self.detect_seal(str(file_path))
                metadata['detected_signature'] = detected_signature
                metadata['sign_confidence'] = float(sign_confidence)
                metadata['detected_seal'] = detected_seal
                metadata['seal_confidence'] = float(seal_confidence)
            
            self.documents_db[doc_id] = metadata
            
            return {
                'status': 'success',
                'message': '文档已替换',
                'metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"替换文档失败: {e}")
            return {'status': 'error', 'message': f'替换失败: {str(e)}'}
    
    def extract_zipfile(self, zip_path: str, project_config: Dict, project_id: str = None) -> Dict[str, Any]:
        """解压ZIP文件并根据文件名匹配文档归属
        
        Args:
            zip_path: ZIP文件路径
            project_config: 项目配置
            project_id: 项目ID（用于跟踪待确认文件）
            
        Returns:
            dict: 解压和匹配结果
        """
        import zipfile
        
        try:
            extracted_files = []
            new_matched_files = []  # 新匹配到的待确认文件
            already_confirmed_files = []  # 已确认过的文件（不重复匹配）
            unmatched_files = []
            
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                # 解压到临时目录，使用时间戳区分不同上传
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                zip_basename = Path(zip_path).stem
                temp_extract_dir = self.upload_folder / 'temp_extract' / f"{timestamp}_{zip_basename}"
                temp_extract_dir.mkdir(parents=True, exist_ok=True)
                zip_ref.extractall(temp_extract_dir)
                
                # 遍历所有文件
                for file_path in temp_extract_dir.rglob('*'):
                    if file_path.is_file() and not file_path.name.startswith('.'):
                        extracted_files.append(str(file_path))

            logger.info(f"提取的文件列表: {extracted_files[:10]}")  # 只打印前10个

            # 构建文档名称映射（包含别名）
            doc_mapping = {}
            docs_count = 0
            for cycle, docs_info in project_config.get('documents', {}).items():
                for doc in docs_info.get('required_docs', []):
                    docs_count += 1
                    doc_name = doc['name'].lower().strip()
                    # 添加多种匹配模式
                    doc_mapping[doc_name] = {
                        'cycle': cycle,
                        'doc_name': doc['name'],
                        'requirement': doc.get('requirement', '')
                    }
                    # 添加去除空格和特殊字符的版本
                    simplified = ''.join(c for c in doc_name if c.isalnum())
                    if simplified and simplified not in doc_mapping:
                        doc_mapping[simplified] = doc_mapping[doc_name]

            logger.info(f"文档映射表 (共{docs_count}个文档): {list(doc_mapping.keys())[:20]}")  # 只打印前20个
            
            # 获取已确认文件记录
            confirmed_set = self.confirmed_files.get(project_id, set()) if project_id else set()
            
            # 匹配文件
            for file_path in extracted_files:
                filename = Path(file_path).stem.lower().strip()
                file_ext = Path(file_path).suffix.lower()
                original_filename = Path(file_path).name
                
                # 跳过非文档文件
                if file_ext not in ['.pdf', '.doc', '.docx', '.xlsx', '.xls', 
                                   '.png', '.jpg', '.jpeg', '.tiff', '.txt']:
                    continue
                
                matched = False
                matched_info = None
                
                # 精确匹配
                if filename in doc_mapping:
                    matched_info = doc_mapping[filename]
                    matched = True
                else:
                    # 模糊匹配 - 检查文件名是否包含文档名称
                    for doc_key, info in doc_mapping.items():
                        if doc_key in filename or filename in doc_key:
                            matched_info = info
                            matched = True
                            break
                
                if matched and matched_info:
                    # 检查是否已确认过
                    cycle = matched_info['cycle']
                    doc_name = matched_info['doc_name']
                    confirm_key = (cycle, doc_name, original_filename)
                    
                    if confirm_key in confirmed_set:
                        # 已确认过，记录但不加入待确认
                        already_confirmed_files.append({
                            'source_path': str(file_path),
                            'cycle': cycle,
                            'doc_name': doc_name,
                            'filename': original_filename,
                            'temp_path': str(file_path)
                        })
                    else:
                        # 新匹配的文件，加入待确认列表，并智能提取文档信息
                        doc_info = self.smart_extract_document_info(str(file_path))
                        new_matched_files.append({
                            'source_path': str(file_path),
                            'cycle': cycle,
                            'doc_name': doc_name,
                            'filename': original_filename,
                            'temp_path': str(file_path),
                            'upload_time': datetime.now().isoformat(),
                            'source_zip': Path(zip_path).name,
                            'doc_info': doc_info
                        })
                else:
                    unmatched_files.append({
                        'source_path': str(file_path),
                        'filename': original_filename
                    })

            # 保存待确认文件到内存
            if project_id and new_matched_files:
                if project_id not in self.pending_files:
                    self.pending_files[project_id] = []
                self.pending_files[project_id].extend(new_matched_files)

            logger.info(f"文件匹配完成: 提取{len(extracted_files)}个, 新匹配{len(new_matched_files)}个待确认, 已确认过{len(already_confirmed_files)}个, 未匹配{len(unmatched_files)}个")
            logger.info(f"项目文档配置: {project_config.get('documents', {}) if project_config else '无'}")

            return {
                'status': 'success',
                'message': f'解压完成，新匹配 {len(new_matched_files)} 个待确认文件，{len(already_confirmed_files)} 个已确认过，{len(unmatched_files)} 个文件未匹配',
                'extracted_count': len(extracted_files),
                'new_matched': new_matched_files,
                'already_confirmed': already_confirmed_files,
                'unmatched': unmatched_files
            }
            
        except Exception as e:
            logger.error(f"解压ZIP失败: {e}")
            return {'status': 'error', 'message': f'解压失败: {str(e)}'}
    
    def generate_report(self, project_config: Dict) -> Dict[str, Any]:
        """生成项目文档管理报告
        
        Args:
            project_config: 项目配置
            
        Returns:
            dict: 报告数据
        """
        try:
            cycles_detail = {}
            total_required_documents = 0
            total_uploaded_documents = 0
            total_cycles = 0
            total_completed = 0
            total_required = 0
            
            for cycle, docs_info in project_config.get('documents', {}).items():
                required_docs = docs_info.get('required_docs', [])
                uploaded_docs = docs_info.get('uploaded_docs', [])
                
                cycle_uploaded_names = set(doc.get('doc_name') for doc in uploaded_docs)
                cycle_completed = 0
                
                for req_doc in required_docs:
                    if req_doc.get('name') in cycle_uploaded_names:
                        # 检查是否需要签名或盖章
                        requirement = req_doc.get('requirement', '')
                        require_signer = '签名' in requirement or '签字' in requirement
                        require_seal = '盖章' in requirement or '章' in requirement
                        
                        if not require_signer and not require_seal:
                            # 无要求，有文档就算完成
                            cycle_completed += 1
                        else:
                            # 有要求，需要检查文档的签名和盖章状态
                            for doc in uploaded_docs:
                                if doc.get('doc_name') == req_doc.get('name'):
                                    has_signer = doc.get('signer')
                                    has_seal = doc.get('has_seal_marked') or doc.get('has_seal') or doc.get('party_a_seal') or doc.get('party_b_seal')
                                    
                                    if (not require_signer or has_signer) and (not require_seal or has_seal):
                                        cycle_completed += 1
                                        break
                
                required = len(required_docs)
                uploaded = len(cycle_uploaded_names)
                missing = required - cycle_completed
                completion_rate = cycle_completed / required * 100 if required > 0 else 0
                
                cycles_detail[cycle] = {
                    'required': required,
                    'uploaded': uploaded,
                    'missing': missing,
                    'completion_rate': completion_rate
                }
                
                total_required_documents += required
                total_uploaded_documents += uploaded
                total_cycles += 1
                total_completed += cycle_completed
                total_required += required
            
            completion_rate = total_completed / total_required * 100 if total_required > 0 else 0
            
            report = {
                'project_name': project_config.get('name', '未命名项目'),
                'generated_time': datetime.now().isoformat(),
                'total_cycles': total_cycles,
                'total_required_documents': total_required_documents,
                'total_uploaded_documents': total_uploaded_documents,
                'completion_rate': completion_rate,
                'cycles_detail': cycles_detail
            }
            
            return report
            
        except Exception as e:
            logger.error(f"生成报告失败: {e}")
            return {'status': 'error', 'message': f'生成报告失败: {str(e)}'}
    
    def check_compliance(self, project_config: Dict) -> Dict[str, Any]:
        """检查文档合规性
        
        Args:
            project_config: 项目配置
            
        Returns:
            dict: 合规性检查结果
        """
        try:
            issues = []
            total_issues = 0
            
            for cycle, docs_info in project_config.get('documents', {}).items():
                required_docs = docs_info.get('required_docs', [])
                uploaded_docs = docs_info.get('uploaded_docs', [])
                
                cycle_uploaded_names = set(doc.get('doc_name') for doc in uploaded_docs)
                
                for req_doc in required_docs:
                    doc_name = req_doc.get('name', '')
                    requirement = req_doc.get('requirement', '')
                    
                    if doc_name not in cycle_uploaded_names:
                        issues.append({
                            'cycle': cycle,
                            'doc_name': doc_name,
                            'issue': '文档缺失',
                            'requirement': requirement
                        })
                        total_issues += 1
                    else:
                        for doc in uploaded_docs:
                            if doc.get('doc_name') == doc_name:
                                doc_id = doc.get('doc_id')
                                if doc_id and doc_id in self.documents_db:
                                    compliance_result = self.check_document_compliance(doc_id, requirement)
                                    if not compliance_result.get('is_compliant', True):
                                        for issue in compliance_result.get('issues', []):
                                            issues.append({
                                                'cycle': cycle,
                                                'doc_name': doc_name,
                                                'issue': issue,
                                                'requirement': requirement
                                            })
                                            total_issues += 1
            
            return {
                'status': 'success',
                'total_issues': total_issues,
                'issues': issues,
                'is_compliant': total_issues == 0
            }
        except Exception as e:
            logger.error(f"检查合规性失败: {e}")
            return {'status': 'error', 'message': f'检查合规性失败: {str(e)}'}
    
    def smart_extract_document_info(self, file_path: str) -> Dict[str, Any]:
        """智能提取文档信息（时间、签字、盖章等）
        
        Args:
            file_path: 文档文件路径
            
        Returns:
            dict: 提取的文档信息
        """
        from pathlib import Path
        
        result = {
            'doc_date': None,
            'sign_date': None,
            'has_signature': False,
            'has_seal': False,
            'requires_signature': False,
            'requires_seal': False,
            'requires_party_a_signature': False,
            'requires_party_b_signature': False,
            'requires_party_a_seal': False,
            'requires_party_b_seal': False,
            'signer': None
        }
        
        file_ext = Path(file_path).suffix.lower()
        
        try:
            # 尝试从文件名提取日期
            filename = Path(file_path).stem
            date_from_filename = self._extract_date_from_text(filename)
            if date_from_filename:
                result['doc_date'] = date_from_filename
            
            # 对于图片文件，尝试检测签字和盖章
            if file_ext in ['.png', '.jpg', '.jpeg', '.tiff', '.bmp']:
                try:
                    has_signature, _ = self.detect_signature(file_path)
                    has_seal, _ = self.detect_seal(file_path)
                    result['has_signature'] = has_signature
                    result['has_seal'] = has_seal
                except Exception as e:
                    logger.warning(f"检测签字/盖章失败: {e}")
            
            # 对于PDF/Word等文档，尝试读取内容提取信息
            if file_ext in ['.pdf', '.doc', '.docx', '.txt']:
                try:
                    text_content = self._extract_text_from_document(file_path)
                    if text_content:
                        # 从文本中提取日期
                        dates_from_text = self._extract_all_dates_from_text(text_content)
                        if dates_from_text:
                            # 优先使用最新的日期
                            result['doc_date'] = dates_from_text[-1]
                            if len(dates_from_text) > 1:
                                result['sign_date'] = dates_from_text[0]
                        
                        # 识别要求关键字
                        result['requires_signature'] = any(keyword in text_content for keyword in ['签字', '签名', '签署'])
                        result['requires_seal'] = any(keyword in text_content for keyword in ['盖章', '签章'])
                        result['requires_party_a_signature'] = '甲方' in text_content and result['requires_signature']
                        result['requires_party_b_signature'] = '乙方' in text_content and result['requires_signature']
                        result['requires_party_a_seal'] = '甲方' in text_content and result['requires_seal']
                        result['requires_party_b_seal'] = '乙方' in text_content and result['requires_seal']
                except Exception as e:
                    logger.warning(f"提取文档内容失败: {e}")
            
        except Exception as e:
            logger.error(f"智能提取文档信息失败: {e}")
        
        return result
    
    def _extract_date_from_text(self, text: str) -> Optional[str]:
        """从文本中提取日期
        
        Args:
            text: 输入文本
            
        Returns:
            str: 提取的日期 (YYYY-MM格式或YYYY-MM-DD格式)，或None
        """
        import re
        
        # 匹配 YYYY-MM-DD 格式
        date_pattern1 = r'(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?'
        # 匹配 YYYY-MM 格式（只有年月）
        date_pattern2 = r'(\d{4})[-/年](\d{1,2})[月]?'
        
        match = re.search(date_pattern1, text)
        if match:
            year, month, day = match.groups()
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        
        match = re.search(date_pattern2, text)
        if match:
            year, month = match.groups()
            return f"{year}-{month.zfill(2)}"
        
        return None
    
    def _extract_all_dates_from_text(self, text: str) -> List[str]:
        """从文本中提取所有日期
        
        Args:
            text: 输入文本
            
        Returns:
            list: 提取的日期列表
        """
        import re
        
        dates = []
        
        # 匹配 YYYY-MM-DD 格式
        date_pattern1 = r'(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?'
        # 匹配 YYYY-MM 格式（只有年月）
        date_pattern2 = r'(\d{4})[-/年](\d{1,2})[月]?'
        
        for match in re.finditer(date_pattern1, text):
            year, month, day = match.groups()
            dates.append(f"{year}-{month.zfill(2)}-{day.zfill(2)}")
        
        for match in re.finditer(date_pattern2, text):
            year, month = match.groups()
            dates.append(f"{year}-{month.zfill(2)}")
        
        # 去重并排序
        dates = sorted(list(set(dates)))
        return dates
    
    def _extract_text_from_document(self, file_path: str) -> Optional[str]:
        """从文档中提取文本内容
        
        Args:
            file_path: 文档文件路径
            
        Returns:
            str: 提取的文本内容，或None
        """
        from pathlib import Path
        
        file_ext = Path(file_path).suffix.lower()
        text_content = ""
        
        try:
            if file_ext == '.pdf':
                # 尝试从PDF提取文本
                try:
                    from PyPDF2 import PdfReader
                    reader = PdfReader(file_path)
                    for page in reader.pages:
                        try:
                            text_content += page.extract_text() or ""
                        except:
                            pass
                except Exception as e:
                    logger.warning(f"PDF文本提取失败: {e}")
            
            elif file_ext in ['.doc', '.docx']:
                # 尝试从Word提取文本
                try:
                    from docx import Document
                    doc = Document(file_path)
                    for para in doc.paragraphs:
                        text_content += para.text + "\n"
                except Exception as e:
                    logger.warning(f"Word文本提取失败: {e}")
            
            elif file_ext == '.txt':
                # 直接读取文本文件
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    text_content = f.read()
        
        except Exception as e:
            logger.error(f"提取文档文本失败: {e}")
        
        return text_content if text_content.strip() else None

    def package_project(self, project_id: str, project_config: Dict) -> str:
        """打包项目（项目配置+文档文件）
        
        Args:
            project_id: 项目ID
            project_config: 项目配置
            
        Returns:
            str: 打包文件路径
        """
        try:
            import io
            import zipfile
            from pathlib import Path
            
            # 创建打包目录
            package_folder = self.upload_folder / 'packages'
            package_folder.mkdir(parents=True, exist_ok=True)
            
            # 生成打包文件名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            project_name = project_config.get('name', 'project').replace('/', '_').replace('\\', '_')
            package_path = package_folder / f"{project_name}_{timestamp}.zip"
            
            # 创建ZIP文件
            with zipfile.ZipFile(str(package_path), 'w', zipfile.ZIP_DEFLATED) as zip_file:
                # 1. 添加项目配置文件
                import json
                config_json = json.dumps(project_config, ensure_ascii=False, indent=2)
                zip_file.writestr('project_config.json', config_json)
                
                # 2. 添加文档元数据
                all_docs = self.get_documents()
                docs_json = json.dumps(all_docs, ensure_ascii=False, indent=2)
                zip_file.writestr('documents_metadata.json', docs_json)
                
                # 3. 复制文档文件
                copied_count = 0
                doc_counter = 1
                for doc in all_docs:
                    file_path = doc.get('file_path')
                    if file_path and Path(file_path).exists():
                        try:
                            # 保持目录结构：cycle/doc_name/filename
                            cycle = doc.get('cycle', 'unknown').replace('/', '_')
                            doc_name = doc.get('doc_name', 'unknown').replace('/', '_')
                            
                            # 生成顺序编号的文件名
                            file_ext = Path(file_path).suffix
                            new_filename = f"{doc_counter:03d}_{doc_name}{file_ext}"
                            arcname = f"documents/{cycle}/{doc_name}/{new_filename}"
                            zip_file.write(file_path, arcname)
                            copied_count += 1
                            doc_counter += 1
                        except Exception as e:
                            logger.warning(f"添加文件到ZIP失败: {file_path}, 错误: {e}")
            
            logger.info(f"项目打包完成: {package_path}, 包含 {copied_count} 个文件")
            return str(package_path)
            
        except Exception as e:
            logger.error(f"打包项目失败: {e}")
            raise