"""ZIP文件解压和自动匹配模块"""

import zipfile
import os
import shutil
import hashlib
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging
import re

logger = logging.getLogger(__name__)


class ZipMatcher:
    """ZIP文件解压和自动匹配器"""
    
    # 支持的文档类型扩展名
    ALLOWED_EXTS = {'.pdf', '.doc', '.docx', '.xlsx', '.xls', 
                   '.png', '.jpg', '.jpeg', '.tiff', '.txt',
                   '.ppt', '.pptx', '.dwg', '.cad'}
    
    def __init__(self, config: Dict):
        self.config = config
        self.upload_folder = Path(config.get('upload_folder', 'uploads'))
        self.temp_extract = self.upload_folder / 'temp_extract'
        self.temp_extract.mkdir(parents=True, exist_ok=True)
    
    def extract_and_match(self, zip_path: str, project_config: Dict = None, 
                         progress_callback: callable = None) -> Dict[str, Any]:
        """
        解压ZIP文件并自动匹配文档，或者直接处理已解压的目录
        
        Args:
            zip_path: ZIP文件路径或已解压的目录路径
            project_config: 项目配置（包含周期和文档类型）
            progress_callback: 进度回调函数
            
        Returns:
            Dict: 解压和匹配结果
        """
        zip_path = Path(zip_path)
        
        if not zip_path.exists():
            return {'status': 'error', 'message': '文件或目录不存在'}
        
        extract_dir = zip_path
        
        # 检查是否是ZIP文件
        if zip_path.suffix.lower() == '.zip':
            # 创建解压目录
            extract_dir = self.temp_extract / f"{zip_path.stem}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            extract_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            total_steps = 100
            current_step = 0
            
            # 步骤1: 如果是ZIP文件，解压
            if zip_path.suffix.lower() == '.zip':
                if progress_callback:
                    progress_callback(5, '正在解压ZIP文件...')
                
                extracted_files = self._extract_zip(zip_path, extract_dir)
                logger.info(f"ZIP解压完成，共 {len(extracted_files)} 个文件")
            else:
                # 直接处理目录
                if progress_callback:
                    progress_callback(5, '正在处理目录...')
                logger.info(f"直接处理目录: {extract_dir}")
            
            current_step = 30
            
            # 步骤2: 扫描所有支持的文件
            if progress_callback:
                progress_callback(30, '正在扫描文件...')
            
            all_files = self._scan_files(extract_dir)
            
            current_step = 40
            
            # 步骤3: 获取项目文档需求
            if progress_callback:
                progress_callback(40, '正在加载项目配置...')
            
            doc_requirements = {}
            if project_config and 'documents' in project_config:
                doc_requirements = project_config.get('documents', {})
            
            # 步骤4: 匹配文件
            if progress_callback:
                progress_callback(50, '正在匹配文档...')
            
            matched_files = []
            unmatched_files = []
            
            for i, file_info in enumerate(all_files):
                # 更新进度
                progress = 50 + int((i / len(all_files)) * 40) if all_files else 90
                if progress_callback:
                    progress_callback(progress, f'正在匹配文档... ({i+1}/{len(all_files)})')
                
                # 尝试匹配文档类型
                match_result = self._match_file(file_info, doc_requirements)
                
                if match_result['matched']:
                    matched_files.append({
                        **file_info,
                        'matched_cycle': match_result['cycle'],
                        'matched_doc_name': match_result['doc_name'],
                        'confidence': match_result['confidence']
                    })
                else:
                    unmatched_files.append(file_info)
            
            current_step = 95
            
            # 步骤5: 复制匹配的文件到项目目录
            if progress_callback:
                progress_callback(95, '正在归档文件...')
            
            archived_files = []
            for mf in matched_files:
                target_path = self._archive_file(mf, project_config)
                if target_path:
                    archived_files.append({
                        'source': mf['path'],
                        'target': str(target_path),
                        'cycle': mf['matched_cycle'],
                        'doc_name': mf['matched_doc_name']
                    })
            
            current_step = 100
            
            if progress_callback:
                progress_callback(100, '匹配完成')
            
            # 生成用户要求的格式的匹配结果
            matching_result = self._generate_matching_result(matched_files, archived_files)
            
            # 将匹配结果添加到项目配置
            if project_config:
                project_config['matching_result'] = matching_result
            
            return {
                'status': 'success',
                'message': f'匹配完成',
                'extracted_dir': str(extract_dir),
                'total_files': len(all_files),
                'matched_count': len(matched_files),
                'unmatched_count': len(unmatched_files),
                'matched_files': matched_files,
                'unmatched_files': unmatched_files,
                'archived_files': archived_files,
                'matching_result': matching_result
            }
            
        except Exception as e:
            logger.error(f"解压匹配失败: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def _extract_zip(self, zip_path: Path, extract_dir: Path) -> List[str]:
        """解压ZIP文件"""
        extracted = []
        
        with zipfile.ZipFile(zip_path, 'r') as zf:
            for member in zf.namelist():
                # 跳过目录和隐藏文件
                if member.endswith('/') or '/' in member and member.split('/')[0].startswith('.'):
                    continue
                if member.startswith('.'):
                    continue
                    
                try:
                    zf.extract(member, extract_dir)
                    extracted.append(member)
                except Exception as e:
                    logger.warning(f"解压文件失败 {member}: {e}")
                    continue
        
        return extracted
    
    def _scan_files(self, directory: Path) -> List[Dict[str, Any]]:
        """扫描目录中的所有支持的文件"""
        files = []
        
        for ext in self.ALLOWED_EXTS:
            for file_path in directory.rglob(f'*{ext}'):
                if file_path.is_file() and not file_path.name.startswith('.'):
                    # 计算文件哈希
                    file_hash = self._calculate_file_hash(file_path)
                    
                    files.append({
                        'name': file_path.name,
                        'path': str(file_path),
                        'relative_path': str(file_path.relative_to(directory)),
                        'extension': file_path.suffix.lower(),
                        'size': file_path.stat().st_size,
                        'hash': file_hash,
                        'modified_time': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                    })
        
        return files
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """计算文件MD5哈希"""
        hash_md5 = hashlib.md5()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b''):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception:
            return ''
    
    def _match_file(self, file_info: Dict, doc_requirements: Dict) -> Dict[str, Any]:
        """
        匹配文件到文档类型
        
        返回: {matched: bool, cycle: str, doc_name: str, confidence: float}
        """
        filename = file_info['name']
        
        # 移除扩展名和常见前缀
        name_without_ext = Path(filename).stem
        name_clean = re.sub(r'^\d+[_\s]*', '', name_without_ext)  # 移除开头的数字
        name_clean = re.sub(r'^\d+\.\d+\s*', '', name_clean)  # 移除 4.1 这种前缀
        
        best_match = {
            'matched': False,
            'cycle': None,
            'doc_name': None,
            'confidence': 0.0
        }
        
        # 遍历所有周期的文档需求
        for cycle, docs_info in doc_requirements.items():
            required_docs = docs_info.get('required_docs', [])
            
            for doc in required_docs:
                doc_name = doc.get('name', '')
                if not doc_name:
                    continue
                
                # 计算匹配度
                confidence = self._calculate_match_confidence(name_clean, doc_name)
                
                if confidence > best_match['confidence']:
                    best_match = {
                        'matched': confidence >= 0.5,  # 50%以上匹配度认为是匹配
                        'cycle': cycle,
                        'doc_name': doc_name,
                        'confidence': confidence
                    }
        
        return best_match
    
    def _calculate_match_confidence(self, filename: str, doc_name: str) -> float:
        """
        计算文件名与文档名称的匹配度
        
        使用多种策略：
        1. 精确包含
        2. 关键词重叠
        3. 模糊匹配
        """
        filename_lower = filename.lower()
        doc_name_lower = doc_name.lower()
        
        # 完全包含
        if doc_name_lower in filename_lower:
            return 1.0
        
        # 提取关键词进行比较
        doc_keywords = set(re.findall(r'[\u4e00-\u9fa5a-zA-Z0-9]+', doc_name_lower))
        file_keywords = set(re.findall(r'[\u4e00-\u9fa5a-zA-Z0-9]+', filename_lower))
        
        if not doc_keywords:
            return 0.0
        
        # 计算关键词重叠率
        common = doc_keywords & file_keywords
        if common:
            overlap_ratio = len(common) / len(doc_keywords)
            return min(overlap_ratio * 1.5, 0.9)  # 关键词匹配最高0.9
        
        return 0.0
    
    def _generate_matching_result(self, matched_files: List[Dict], archived_files: List[Dict]) -> Dict:
        """生成用户要求的格式的匹配结果"""
        result = {}
        
        # 按周期分组
        cycle_files = {}
        for i, (mf, af) in enumerate(zip(matched_files, archived_files)):
            cycle = mf['matched_cycle']
            doc_name = mf['matched_doc_name']
            source_path = mf['path']
            target_path = af['target']
            original_filename = mf['name']
            
            if cycle not in cycle_files:
                cycle_files[cycle] = []
            
            # 构建目标目录路径（相对路径）
            target_dir_rel = f"{cycle}/{doc_name}"
            
            # 构建文档原始路径（相对路径）
            source_path_rel = str(Path(source_path).relative_to(self.upload_folder))
            source_path_rel = f"/uploads/{source_path_rel}"
            
            # 创建文档信息
            doc_info = {
                "序号": i + 1,
                doc_name: original_filename,
                "文档原始路径": source_path_rel,
                "目标目录": target_dir_rel,
                "甲方签字": False,
                "甲方盖章": False,
                "乙方签字": False,
                "乙方盖章": False,
                "文档日期": "",
                "甲方签字日期": "",
                "已方签字日期": "",
                "是否归档": False
            }
            
            cycle_files[cycle].append(doc_info)
        
        # 构建最终结果
        for cycle, files in cycle_files.items():
            result[cycle] = files
        
        return result
    
    def _archive_file(self, file_info: Dict, project_config: Dict) -> Optional[Path]:
        """归档文件到项目目录"""
        if not project_config:
            return None
        
        try:
            cycle = file_info.get('matched_cycle')
            doc_name = file_info.get('matched_doc_name')
            
            if not cycle or not doc_name:
                return None
            
            # 构建目标路径（与document_routes.py保持一致）
            target_dir = self.upload_folder / cycle.replace('/', '_') / doc_name.replace('/', '_')
            target_dir.mkdir(parents=True, exist_ok=True)
            
            # 目标文件路径
            source_path = Path(file_info['path'])
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            file_ext = source_path.suffix
            new_filename = f"zip_{timestamp}{file_ext}"
            target_path = target_dir / new_filename
            
            # 如果目标文件已存在，添加序号
            if target_path.exists():
                counter = 1
                while target_path.exists():
                    target_path = target_dir / f"zip_{timestamp}_{counter}{file_ext}"
                    counter += 1
            
            # 复制文件
            shutil.copy2(source_path, target_path)
            
            # 生成文档ID
            doc_id = f"{cycle}_{doc_name}_{timestamp}"
            
            # 添加到项目配置的uploaded_docs字段
            if 'documents' not in project_config:
                project_config['documents'] = {}
            
            # 保存现有的required_docs
            existing_required_docs = []
            if cycle in project_config['documents']:
                existing_required_docs = project_config['documents'][cycle].get('required_docs', [])
            
            if cycle not in project_config['documents']:
                project_config['documents'][cycle] = {'required_docs': existing_required_docs, 'uploaded_docs': []}
            elif 'uploaded_docs' not in project_config['documents'][cycle]:
                project_config['documents'][cycle]['uploaded_docs'] = []
            
            project_config['documents'][cycle]['uploaded_docs'].append({
                'doc_name': doc_name,
                'filename': new_filename,
                'original_filename': source_path.name,
                'file_path': str(target_path),
                'doc_date': '',
                'sign_date': '',
                'signer': '',
                'has_seal': False,
                'upload_time': datetime.now().isoformat(),
                'source': 'zip',
                'doc_id': doc_id
            })
            
            # 添加到documents_db（内存缓存）
            from app.utils.document_manager import get_manager
            doc_manager = get_manager()
            doc_manager.documents_db[doc_id] = {
                'cycle': cycle,
                'doc_name': doc_name,
                'filename': new_filename,
                'original_filename': source_path.name,
                'file_path': str(target_path),
                'doc_date': '',
                'sign_date': '',
                'signer': '',
                'no_signature': False,
                'has_seal_marked': False,
                'party_a_seal': False,
                'party_b_seal': False,
                'no_seal': False,
                'other_seal': '',
                'upload_time': datetime.now().isoformat(),
                'source': 'zip',
                'file_size': target_path.stat().st_size
            }
            
            return target_path
            
        except Exception as e:
            logger.error(f"归档文件失败: {e}")
            return None


def create_matcher(config: Dict) -> ZipMatcher:
    """创建ZipMatcher实例"""
    return ZipMatcher(config)
