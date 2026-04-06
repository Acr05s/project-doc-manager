"""任务服务模块 - 处理后台任务管理"""

import uuid
import threading
import time
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class TaskService:
    """任务服务类"""
    
    def __init__(self):
        """初始化任务服务"""
        self.tasks_store: Dict[str, Dict[str, Any]] = {}
        self.doc_manager = None
        self._tasks_file = Path('uploads/tasks/package_tasks.json')
        self._tasks_file.parent.mkdir(parents=True, exist_ok=True)
        self._load_tasks()
    
    def _load_tasks(self):
        """从文件加载任务"""
        print(f'[TaskService] 尝试从文件加载任务: {self._tasks_file}', flush=True)
        if self._tasks_file.exists():
            try:
                with open(self._tasks_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    print(f'[TaskService] 从文件加载了 {len(data)} 个任务', flush=True)
                    # 合并到现有任务存储（不覆盖已有任务）
                    for task_id, task in data.items():
                        if task_id not in self.tasks_store:
                            # 只加载已完成的任务
                            if task.get('status') == 'completed':
                                self.tasks_store[task_id] = task
                            elif task.get('status') in ['running', 'pending']:
                                task['status'] = 'failed'
                                task['message'] = '服务重启，任务中断'
                                self.tasks_store[task_id] = task
            except Exception as e:
                print(f'[TaskService] 加载任务失败: {e}', flush=True)
    
    def _save_tasks(self):
        """保存任务到文件"""
        try:
            with open(self._tasks_file, 'w', encoding='utf-8') as f:
                json.dump(self.tasks_store, f, ensure_ascii=False, indent=2)
            print(f'[TaskService] 任务已保存到文件: {self._tasks_file}', flush=True)
        except Exception as e:
            print(f'[TaskService] 保存任务失败: {e}', flush=True)
    
    def set_doc_manager(self, manager):
        """设置文档管理器"""
        self.doc_manager = manager
    
    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        # 先检查内存
        task = self.tasks_store.get(task_id)
        if task:
            print(f'[TaskService] 从内存找到任务: {task_id}', flush=True)
            return task
        
        # 如果内存中没有，直接从文件读取
        print(f'[TaskService] 内存中没有任务，从文件读取: {task_id}', flush=True)
        if self._tasks_file.exists():
            try:
                with open(self._tasks_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    task = data.get(task_id)
                    if task:
                        print(f'[TaskService] 从文件找到任务: {task_id}', flush=True)
                        # 添加到内存缓存
                        self.tasks_store[task_id] = task
                        return task
            except Exception as e:
                print(f'[TaskService] 读取文件失败: {e}', flush=True)
        
        print(f'[TaskService] 任务未找到: {task_id}', flush=True)
        return None
    
    def list_tasks(self) -> list:
        """列出所有任务"""
        return list(self.tasks_store.values())
    
    def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        if task_id in self.tasks_store:
            self.tasks_store[task_id]['status'] = 'cancelled'
            self.tasks_store[task_id]['message'] = '任务已取消'
            return True
        return False
    
    def start_package_task(self, project_id: str, project_config: Dict[str, Any]) -> Dict[str, Any]:
        """启动打包项目任务"""
        import json
        import zipfile
        from pathlib import Path
        import os
        
        # 创建任务
        task_id = str(uuid.uuid4())
        self.tasks_store[task_id] = {
            'id': task_id,
            'type': 'package',
            'name': '打包项目',
            'status': 'running',
            'progress': 0,
            'message': '开始打包项目...',
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        self._save_tasks()  # 立即保存任务
        
        # 启动后台线程执行任务
        def package_task():
            try:
                if not self.doc_manager:
                    raise Exception('文档管理器未初始化')
                
                # 获取项目数据
                project = self.doc_manager.load_project(project_id)
                if not project or project.get('status') != 'success':
                    raise Exception('项目不存在')
                
                project_data = project.get('project', {})
                project_name = project_data.get('name', 'project')
                
                # 更新进度：查找项目目录
                self.tasks_store[task_id]['progress'] = 10
                self.tasks_store[task_id]['message'] = '正在查找项目目录...'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                
                # 查找项目目录
                projects_base = Path(self.doc_manager.config.projects_base_folder)
                project_dir = None
                
                # 查找项目目录（只使用项目名称）
                project_dir = projects_base / project_name
                if not project_dir.exists() or not project_dir.is_dir():
                    raise Exception(f'项目目录不存在: {project_name}')
                
                # 创建临时目录存放打包文件
                temp_dir = projects_base / 'temp' / 'packages'
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                safe_name = ''.join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
                package_filename = f"{safe_name}_{task_id[:8]}.zip"
                package_path = temp_dir / package_filename
                
                # 统计文件数量
                total_files = 0
                for root, dirs, files in os.walk(project_dir):
                    total_files += len(files)
                
                # 更新进度：开始创建ZIP
                self.tasks_store[task_id]['progress'] = 20
                self.tasks_store[task_id]['message'] = f'正在打包项目目录... 共 {total_files} 个文件'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                
                # 创建ZIP文件
                with zipfile.ZipFile(package_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                    # 递归添加项目目录的所有内容
                    processed_files = 0
                    for root, dirs, files in os.walk(project_dir):
                        if self.tasks_store[task_id]['status'] == 'cancelled':
                            break
                        
                        for file in files:
                            if self.tasks_store[task_id]['status'] == 'cancelled':
                                break
                            
                            file_path = Path(root) / file
                            # 计算相对路径作为归档路径
                            rel_path = file_path.relative_to(project_dir.parent)
                            arcname = str(rel_path)
                            
                            try:
                                zip_file.write(file_path, arcname)
                                processed_files += 1
                            except Exception:
                                pass
                            
                            # 更新进度（20% - 90%）
                            if total_files > 0:
                                progress = 20 + int(70 * processed_files / total_files)
                                self.tasks_store[task_id]['progress'] = min(progress, 90)
                                self.tasks_store[task_id]['message'] = f'正在打包... ({processed_files}/{total_files})'
                                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                            
                            # 每10个文件保存一次进度
                            if processed_files % 10 == 0:
                                self._save_tasks()
                
                if self.tasks_store[task_id]['status'] == 'cancelled':
                    # 删除未完成的包
                    if package_path.exists():
                        package_path.unlink()
                    return
                
                # 完成任务
                self.tasks_store[task_id]['status'] = 'completed'
                self.tasks_store[task_id]['progress'] = 100
                self.tasks_store[task_id]['message'] = f'打包完成！共 {processed_files} 个文件'
                self.tasks_store[task_id]['result'] = {
                    'package_path': str(package_path),
                    'package_filename': package_filename,
                    'total_files': total_files,
                    'processed_files': processed_files
                }
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                self._save_tasks()  # 保存到文件
                
            except Exception as e:
                self.tasks_store[task_id]['status'] = 'error'
                self.tasks_store[task_id]['message'] = f'打包失败: {str(e)}'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                self._save_tasks()  # 保存到文件
        
        threading.Thread(target=package_task).start()
        
        return {
            'status': 'success',
            'task_id': task_id,
            'message': '打包任务已启动'
        }
    
    def start_export_task(self, project_id: str, project_config: Dict[str, Any]) -> Dict[str, Any]:
        """启动导出需求清单任务"""
        # 创建任务
        task_id = str(uuid.uuid4())
        self.tasks_store[task_id] = {
            'id': task_id,
            'type': 'export',
            'name': '导出需求清单',
            'status': 'running',
            'progress': 0,
            'message': '开始导出需求清单...',
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        # 启动后台线程执行任务
        def export_task():
            for i in range(1, 6):
                if self.tasks_store[task_id]['status'] == 'cancelled':
                    break
                self.tasks_store[task_id]['progress'] = i * 20
                self.tasks_store[task_id]['message'] = f'正在导出需求清单... {i * 20}%'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                time.sleep(0.3)
            
            if self.tasks_store[task_id]['status'] != 'cancelled' and self.doc_manager:
                # 实际导出操作
                json_content = self.doc_manager.export_requirements_to_json(project_config)
                self.tasks_store[task_id]['status'] = 'completed'
                self.tasks_store[task_id]['message'] = '需求清单导出完成'
                self.tasks_store[task_id]['result'] = {'content': json_content}
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
        threading.Thread(target=export_task).start()
        
        return {
            'status': 'success',
            'task_id': task_id,
            'message': '导出任务已启动'
        }
    
    def start_report_task(self, project_config: Dict[str, Any]) -> Dict[str, Any]:
        """启动生成报告任务"""
        # 创建任务
        task_id = str(uuid.uuid4())
        self.tasks_store[task_id] = {
            'id': task_id,
            'type': 'report',
            'name': '生成报告',
            'status': 'running',
            'progress': 0,
            'message': '开始生成报告...',
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        # 启动后台线程执行任务
        def report_task():
            for i in range(1, 8):
                if self.tasks_store[task_id]['status'] == 'cancelled':
                    break
                self.tasks_store[task_id]['progress'] = round(i * 14.28)
                self.tasks_store[task_id]['message'] = f'正在生成报告... {round(i * 14.28)}%'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                time.sleep(0.4)
            
            if self.tasks_store[task_id]['status'] != 'cancelled' and self.doc_manager:
                # 实际报告生成操作
                report = self.doc_manager.generate_report(project_config)
                self.tasks_store[task_id]['status'] = 'completed'
                self.tasks_store[task_id]['message'] = '报告生成完成'
                self.tasks_store[task_id]['result'] = {'report': report}
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
        threading.Thread(target=report_task).start()
        
        return {
            'status': 'success',
            'task_id': task_id,
            'message': '报告生成任务已启动'
        }
    
    def start_check_task(self, project_config: Dict[str, Any]) -> Dict[str, Any]:
        """启动检查异常任务"""
        # 创建任务
        task_id = str(uuid.uuid4())
        self.tasks_store[task_id] = {
            'id': task_id,
            'type': 'check',
            'name': '检查异常',
            'status': 'running',
            'progress': 0,
            'message': '开始检查异常...',
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        # 启动后台线程执行任务
        def check_task():
            for i in range(1, 7):
                if self.tasks_store[task_id]['status'] == 'cancelled':
                    break
                self.tasks_store[task_id]['progress'] = round(i * 16.67)
                self.tasks_store[task_id]['message'] = f'正在检查异常... {round(i * 16.67)}%'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                time.sleep(0.3)
            
            if self.tasks_store[task_id]['status'] != 'cancelled' and self.doc_manager:
                # 实际检查操作
                compliance = self.doc_manager.check_compliance(project_config)
                self.tasks_store[task_id]['status'] = 'completed'
                self.tasks_store[task_id]['message'] = '异常检查完成'
                self.tasks_store[task_id]['result'] = {'compliance': compliance}
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
        threading.Thread(target=check_task).start()
        
        return {
            'status': 'success',
            'task_id': task_id,
            'message': '异常检查任务已启动'
        }
    
    def start_pdf_conversion_task(self, file_path: str, doc_id: str) -> Dict[str, Any]:
        """启动PDF转换任务
        
        Args:
            file_path: 源文件路径
            doc_id: 文档ID
            
        Returns:
            Dict: 任务信息
        """
        from src.services.pdf_conversion_service import PDFConversionService
        from pathlib import Path
        import os
        
        # 创建任务
        task_id = str(uuid.uuid4())
        self.tasks_store[task_id] = {
            'id': task_id,
            'type': 'pdf_conversion',
            'name': 'PDF转换',
            'status': 'running',
            'progress': 0,
            'message': '开始PDF转换...',
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'file_path': file_path,
            'doc_id': doc_id
        }
        self._save_tasks()
        
        # 启动后台线程执行任务
        def pdf_conversion_task():
            try:
                from src.services.pdf_conversion_record import pdf_conversion_record
                import os
                
                # 创建预览文件临时目录
                preview_temp_dir = Path('uploads/temp/preview')
                preview_temp_dir.mkdir(parents=True, exist_ok=True)
                
                # 初始化PDF转换服务
                pdf_service = PDFConversionService()
                pdf_service.set_preview_temp_dir(str(preview_temp_dir))
                
                # 更新进度
                self.tasks_store[task_id]['progress'] = 25
                self.tasks_store[task_id]['message'] = '正在转换PDF...'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                
                # 执行转换
                pdf_path = pdf_service.convert_to_pdf(file_path, doc_id)
                
                # 保存转换记录（标记为完整转换）
                file_mtime = os.path.getmtime(file_path)
                pdf_conversion_record.add_record(doc_id, pdf_path, file_path)
                if doc_id in pdf_conversion_record.records:
                    pdf_conversion_record.records[doc_id]['file_mtime'] = file_mtime
                    pdf_conversion_record.records[doc_id]['is_complete'] = True
                    pdf_conversion_record._save_records()
                
                # 更新进度
                self.tasks_store[task_id]['progress'] = 75
                self.tasks_store[task_id]['message'] = '转换完成，保存结果...'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                
                # 完成任务
                self.tasks_store[task_id]['status'] = 'completed'
                self.tasks_store[task_id]['progress'] = 100
                self.tasks_store[task_id]['message'] = 'PDF转换完成'
                self.tasks_store[task_id]['result'] = {
                    'pdf_path': pdf_path,
                    'doc_id': doc_id
                }
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                self._save_tasks()
                
            except Exception as e:
                self.tasks_store[task_id]['status'] = 'error'
                self.tasks_store[task_id]['message'] = f'PDF转换失败: {str(e)}'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                self._save_tasks()
        
        threading.Thread(target=pdf_conversion_task).start()
        
        return {
            'status': 'success',
            'task_id': task_id,
            'message': 'PDF转换任务已启动'
        }
    
    def start_batch_pdf_conversion(self, project_id: str) -> Dict[str, Any]:
        """启动批量PDF转换任务
        
        Args:
            project_id: 项目ID
            
        Returns:
            Dict: 任务信息
        """
        import json
        from pathlib import Path
        
        # 创建任务
        task_id = str(uuid.uuid4())
        self.tasks_store[task_id] = {
            'id': task_id,
            'type': 'batch_pdf_conversion',
            'name': '批量PDF转换',
            'status': 'running',
            'progress': 0,
            'message': '开始批量PDF转换...',
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'project_id': project_id
        }
        self._save_tasks()
        
        # 启动后台线程执行任务
        def batch_conversion_task():
            try:
                if not self.doc_manager:
                    raise Exception('文档管理器未初始化')
                
                # 加载项目
                project = self.doc_manager.load_project(project_id)
                if not project or project.get('status') != 'success':
                    raise Exception('项目不存在')
                
                project_data = project.get('project', {})
                documents = project_data.get('documents', {})
                
                # 收集所有被匹配使用的文档
                files_to_convert = []
                for cycle, cycle_info in documents.items():
                    if 'uploaded_docs' in cycle_info:
                        for doc in cycle_info['uploaded_docs']:
                            # 检查文档是否被匹配（有doc_name字段）
                            doc_name = doc.get('doc_name')
                            file_path = doc.get('file_path')
                            doc_id = doc.get('doc_id')
                            if doc_name and file_path and doc_id:
                                ext = Path(file_path).suffix.lower()
                                if ext in ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']:
                                    files_to_convert.append((file_path, doc_id))
                
                total_files = len(files_to_convert)
                if total_files == 0:
                    self.tasks_store[task_id]['status'] = 'completed'
                    self.tasks_store[task_id]['progress'] = 100
                    self.tasks_store[task_id]['message'] = '没有需要转换的文档'
                    self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                    self._save_tasks()
                    return
                
                # 执行转换
                converted_count = 0
                for i, (file_path, doc_id) in enumerate(files_to_convert):
                    if self.tasks_store[task_id]['status'] == 'cancelled':
                        break
                    
                    try:
                        # 启动单个转换任务
                        self.start_pdf_conversion_task(file_path, doc_id)
                        converted_count += 1
                    except Exception as e:
                        print(f'转换文件失败 {file_path}: {e}')
                    
                    # 更新进度
                    progress = int(100 * (i + 1) / total_files)
                    self.tasks_store[task_id]['progress'] = progress
                    self.tasks_store[task_id]['message'] = f'正在转换... ({i + 1}/{total_files})'
                    self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                    if (i + 1) % 5 == 0:
                        self._save_tasks()
                
                # 完成任务
                if self.tasks_store[task_id]['status'] != 'cancelled':
                    self.tasks_store[task_id]['status'] = 'completed'
                    self.tasks_store[task_id]['progress'] = 100
                    self.tasks_store[task_id]['message'] = f'批量转换完成，成功转换 {converted_count} 个文件'
                    self.tasks_store[task_id]['result'] = {
                        'total_files': total_files,
                        'converted_files': converted_count
                    }
                    self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                    self._save_tasks()
                    
            except Exception as e:
                self.tasks_store[task_id]['status'] = 'error'
                self.tasks_store[task_id]['message'] = f'批量转换失败: {str(e)}'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                self._save_tasks()
        
        threading.Thread(target=batch_conversion_task).start()
        
        return {
            'status': 'success',
            'task_id': task_id,
            'message': '批量PDF转换任务已启动'
        }

    def start_download_package_task(self, project_id: str, project_config: Dict[str, Any], scope: str = 'matched') -> Dict[str, Any]:
        """启动下载打包任务（按周期/文档类型组织）
        
        Args:
            project_id: 项目ID
            project_config: 项目配置
            scope: 打包范围，'archived' 只打包已归档文档，'matched' 打包所有已匹配文档
        """
        import zipfile
        from pathlib import Path
        
        task_id = str(uuid.uuid4())
        self.tasks_store[task_id] = {
            'id': task_id,
            'type': 'download_package',
            'name': '打包下载',
            'status': 'running',
            'progress': 0,
            'message': '开始打包...',
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        self._save_tasks()
        
        def download_package_task():
            try:
                import os
                import re
                
                # 从后端重新获取项目数据（包含实际的文件上传记录）
                project = self.doc_manager.load_project(project_id)
                if not project or project.get('status') != 'success':
                    raise Exception('项目不存在')
                
                backend_project_config = project.get('project', {})
                
                # 获取项目数据（优先使用后端数据，包含 uploaded_docs）
                documents = backend_project_config.get('documents', project_config.get('documents', {}))
                # 获取周期的正确顺序（cycles 列表定义了顺序）
                cycles_order = backend_project_config.get('cycles', project_config.get('cycles', []))
                # 获取不涉及标记
                documents_not_involved = backend_project_config.get('documents_not_involved', project_config.get('documents_not_involved', {}))
                # 获取归档状态
                documents_archived = backend_project_config.get('documents_archived', project_config.get('documents_archived', {}))
                
                logger.info(f"[打包] 使用后端数据: cycles={len(cycles_order)}, documents={len(documents)}")
                logger.info(f"[打包] 归档状态键: {list(documents_archived.keys())[:5] if documents_archived else 'None'}")
                logger.info(f"[打包] 不涉及状态键: {list(documents_not_involved.keys())[:5] if documents_not_involved else 'None'}")
                
                # 检查特定周期
                if '7、系统开发测试' in documents_archived:
                    logger.info(f"[打包] 7、系统开发测试 归档状态: {documents_archived['7、系统开发测试']}")
                
                # 调试：检查特定周期的 uploaded_docs
                test_cycle = '7、系统开发测试'
                if test_cycle in documents:
                    test_docs = documents[test_cycle]
                    if isinstance(test_docs, dict):
                        uploaded = test_docs.get('uploaded_docs', [])
                        logger.info(f"[打包] '{test_cycle}' 有 {len(uploaded)} 个上传文件")
                        for doc in uploaded[:3]:
                            logger.info(f"[打包]   - {doc.get('doc_name')}: {doc.get('original_filename')}")
                
                # 检查归档状态的具体结构
                if test_cycle in documents_archived:
                    archived_docs = documents_archived[test_cycle]
                    logger.info(f"[打包] '{test_cycle}' 归档文档: {list(archived_docs.keys())[:10]}")
                
                # 判断文档是否应该被打包（根据scope）
                def should_include_doc(cycle, doc_name, has_uploaded_files):
                    """判断文档是否应该被打包"""
                    is_not_involved = documents_not_involved.get(cycle, {}).get(doc_name, False)
                    is_archived = documents_archived.get(cycle, {}).get(doc_name, False)
                    
                    # 标记为不涉及的文档始终包含（视为已归档）
                    if is_not_involved:
                        logger.info(f"[打包过滤] {cycle}/{doc_name}: 不涉及，包含")
                        return True
                    
                    if scope == 'archived':
                        # 只打包已归档的文档
                        result = is_archived
                        logger.info(f"[打包过滤] {cycle}/{doc_name}: archived模式, is_archived={is_archived}, 结果={result}")
                        return result
                    else:
                        # 打包所有有上传文件的文档
                        result = has_uploaded_files
                        logger.info(f"[打包过滤] {cycle}/{doc_name}: matched模式, has_files={has_uploaded_files}, 结果={result}")
                        return result
                
                # 统计文件总数（根据scope过滤）
                total_files = 0
                for cycle in cycles_order:
                    if cycle in documents:
                        doc_data = documents[cycle]
                        if isinstance(doc_data, dict):
                            for doc in doc_data.get('uploaded_docs', []):
                                if isinstance(doc, dict):
                                    doc_name = doc.get('doc_name', '')
                                    if should_include_doc(cycle, doc_name, True):
                                        total_files += 1
                
                # 统计不涉及的文档数量（只统计没有上传文件的）
                not_involved_count = 0
                for cycle in cycles_order:
                    if cycle in documents_not_involved and cycle in documents:
                        doc_data = documents[cycle]
                        if isinstance(doc_data, dict):
                            uploaded_docs = doc_data.get('uploaded_docs', [])
                            # 获取该周期下已上传的文档名称集合
                            uploaded_doc_names = {doc.get('doc_name') for doc in uploaded_docs if isinstance(doc, dict)}
                            # 只统计标记为不涉及且没有上传文件的
                            for doc_name in documents_not_involved.get(cycle, {}):
                                if doc_name not in uploaded_doc_names and should_include_doc(cycle, doc_name, False):
                                    not_involved_count += 1
                
                if total_files == 0 and not_involved_count == 0:
                    raise Exception('没有可打包的文件')
                
                # 创建临时目录和ZIP文件
                temp_dir = Path('uploads/temp/packages')
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                # 优先使用后端获取的项目名称
                project_name = backend_project_config.get('name', project_config.get('name', '项目文档'))
                safe_name = ''.join(c for c in project_name if c.isalnum() or c in (' ', '-', '_')).strip()
                package_filename = f"{safe_name}_{datetime.now().strftime('%Y%m%d')}_{task_id[:8]}.zip"
                package_path = temp_dir / package_filename
                
                # 辅助函数：清理文件名（去掉前面的非中文字符，添加X.Y.Z序号）
                def clean_filename(filename, index_prefix):
                    """
                    清理文件名并添加X.Y.Z序号前缀
                    index_prefix: 如 "1.1", "1.2.1" 等
                    """
                    import re
                    # 分离文件名和扩展名
                    name_part, ext_part = os.path.splitext(filename)
                    # 找到第一个中文字符的位置
                    match = re.search(r'[\u4e00-\u9fff]', name_part)
                    if match:
                        chinese_start = match.start()
                        clean_name = name_part[chinese_start:]
                    else:
                        clean_name = name_part
                    # 返回：X.Y.Z 清理后的文件名.扩展名
                    return f"{index_prefix} {clean_name}{ext_part}"
                
                # 辅助函数：清理名称（去掉非中文前缀）
                def clean_name_prefix(name):
                    """去掉名称前面的非中文字符"""
                    match = re.search(r'[\u4e00-\u9fff]', name)
                    if match:
                        return name[match.start():]
                    return name
                
                # 预处理：为周期分配序号
                cycle_order = {}
                for cycle_idx, cycle in enumerate(cycles_order, 1):
                    doc_data = documents.get(cycle)
                    if isinstance(doc_data, dict):
                        cycle_order[cycle] = cycle_idx
                
                # 创建ZIP文件
                processed_files = 0
                with zipfile.ZipFile(package_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    # 按照 cycles 列表的顺序处理周期
                    for cycle in cycles_order:
                        doc_data = documents.get(cycle)
                        if not isinstance(doc_data, dict):
                            continue
                        
                        cycle_idx = cycle_order.get(cycle)
                        if not cycle_idx:
                            continue
                        
                        # 获取需求文档列表（定义了页面上文档类型的顺序）
                        required_docs = doc_data.get('required_docs', [])
                        uploaded_docs = doc_data.get('uploaded_docs', [])
                        
                        # 构建文档名称到文件列表的映射
                        doc_files_map = {}
                        for doc_meta in uploaded_docs:
                            if not isinstance(doc_meta, dict):
                                continue
                            doc_name = doc_meta.get('doc_name', '未知')
                            if doc_name not in doc_files_map:
                                doc_files_map[doc_name] = []
                            doc_files_map[doc_name].append(doc_meta)
                        
                        # 按照 required_docs 的顺序处理文档类型
                        # 使用 enumerate 获取原始序号（从1开始），即使跳过某些文档也保持原始序号
                        for doc_type_seq, req_doc in enumerate(required_docs, 1):
                            doc_name = req_doc.get('name', '未知')
                            has_files = doc_name in doc_files_map and len(doc_files_map[doc_name]) > 0
                            
                            logger.info(f"[打包文档] 处理: {doc_name}, has_files={has_files}, doc_type_seq={doc_type_seq}")
                            
                            # 检查是否应该包含此文档类型
                            if not should_include_doc(cycle, doc_name, has_files):
                                logger.info(f"[打包文档] 跳过: {doc_name} (should_include_doc=false)")
                                continue
                            
                            # 如果该文档类型没有上传的文件，检查是否标记为不涉及
                            if not has_files:
                                # 检查是否标记为不涉及
                                is_not_involved = documents_not_involved.get(cycle, {}).get(doc_name, False)
                                if is_not_involved:
                                    # 创建TXT占位文件（使用原始序号）
                                    clean_cycle = clean_name_prefix(cycle)
                                    file_index_prefix = f"{cycle_idx}.{doc_type_seq}"
                                    archive_dir = f"{project_name}/{cycle_idx}.{clean_cycle}/{cycle_idx}.{doc_type_seq} {doc_name}"
                                    # 文件名格式：X.Y 文档类型名（本项目不涉及）.txt
                                    placeholder_filename = f"{file_index_prefix} {doc_name}（本项目不涉及）.txt"
                                    archive_path = f"{archive_dir}/{placeholder_filename}"
                                    # TXT文件内容
                                    txt_content = f"文档类型：{doc_name}\n状态：本项目不涉及该文档\n\n该文档类型在本项目中不需要提交。"
                                    zipf.writestr(archive_path, txt_content.encode('utf-8'))
                                    processed_files += 1
                                    # 更新进度
                                    if total_files > 0:
                                        progress = int(100 * processed_files / (total_files + not_involved_count))
                                        self.tasks_store[task_id]['progress'] = min(progress, 95)
                                    self.tasks_store[task_id]['message'] = f'正在打包... ({processed_files}/{total_files + not_involved_count})'
                                    self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                                continue
                            
                            # 直接遍历该文档类型的所有文件（已经通过should_include_doc过滤）
                            doc_files = doc_files_map[doc_name]
                            
                            # 按子目录排序（无子目录的在前），确保顺序一致
                            def get_sort_key(doc_meta):
                                d = doc_meta.get('directory', '') or ''
                                d = d.strip()
                                if d == '/':
                                    d = ''
                                return (d != '', d)  # 无子目录的排在前面，然后按目录名排序
                            
                            sorted_files = sorted(doc_files, key=get_sort_key)
                            
                            # 调试：打印所有文件的 directory 字段
                            for i, f in enumerate(sorted_files):
                                logger.info(f"[打包目录] {doc_name} 文件{i}: directory='{f.get('directory', '')}', filename='{f.get('original_filename', '')}'")
                            
                            # 先分组：无子目录的文件 和 有子目录的文件
                            files_no_subdir = [f for f in sorted_files if not (f.get('directory', '') or '').strip() or (f.get('directory', '') or '').strip() == '/']
                            files_with_subdir = [f for f in sorted_files if (f.get('directory', '') or '').strip() and (f.get('directory', '') or '').strip() != '/']
                            
                            logger.info(f"[打包目录] {doc_name}: 无子目录文件={len(files_no_subdir)}, 有子目录文件={len(files_with_subdir)}")
                            logger.info(f"[打包目录] files_no_subdir={[f.get('original_filename') for f in files_no_subdir]}")
                            logger.info(f"[打包目录] files_with_subdir={[f.get('original_filename') for f in files_with_subdir]}")
                            
                            # 为有子目录的文件按目录分组
                            subdir_groups = {}  # {directory: [files]}
                            for f in files_with_subdir:
                                d = f.get('directory', '').strip()
                                if d not in subdir_groups:
                                    subdir_groups[d] = []
                                subdir_groups[d].append(f)
                            
                            # 按目录名排序，确保子目录顺序一致
                            sorted_subdirs = sorted(subdir_groups.keys())
                            
                            # -------------------------------------------------------
                            # 新序号规则（参考图2）：
                            # 连续递增的 item_seq 分配给每个无子目录的文件和每个子目录：
                            #   无子目录文件  → X.Y.N   （直接放文档类型目录）
                            #   子目录        → X.Y.M   （目录名前缀）
                            #     子目录内文件 → X.Y.M.K  （放子目录下，K从1开始）
                            # 单文件（整个文档类型只有1个文件且无子目录）
                            #   → 直接放周期目录，前缀 X.Y（不加第三级序号）
                            # -------------------------------------------------------
                            
                            total_items = len(files_no_subdir) + len(sorted_subdirs)
                            is_single_file = (total_items == 1 and len(files_no_subdir) == 1)
                            
                            logger.info(f"[打包序号] 周期={cycle} 文档类型={doc_name} "
                                        f"无子目录文件数={len(files_no_subdir)} "
                                        f"子目录数={len(sorted_subdirs)} "
                                        f"total_items={total_items} is_single={is_single_file} "
                                        f"子目录列表={sorted_subdirs} "
                                        f"子目录文件数={[(d, len(subdir_groups[d])) for d in sorted_subdirs]}")
                            
                            # 构建处理列表: (doc_meta, item_seq, subdir_name, inner_seq)
                            # item_seq = 文件/子目录在文档类型内的全局递增序号（每次进入文档类型时重置为0）
                            # inner_seq = 子目录内文件的序号（每个子目录内从1开始）
                            processing_list = []
                            _item_seq = 0  # 改用 _item_seq 避免与外层循环变量冲突
                            
                            # 1. 无子目录的文件，每个占一个 _item_seq
                            for _f in files_no_subdir:
                                _item_seq += 1
                                processing_list.append((_f, _item_seq, None, None))
                            
                            # 2. 每个子目录占一个 _item_seq，子目录内文件使用 inner_seq（从1开始）
                            for _subdir_name in sorted_subdirs:
                                _item_seq += 1
                                _subdir_seq = _item_seq  # 该子目录占的序号
                                _subdir_files = subdir_groups[_subdir_name]
                                for _inner_idx, _f in enumerate(_subdir_files, 1):
                                    processing_list.append((_f, _subdir_seq, _subdir_name, _inner_idx))
                            
                            logger.info(f"[打包序号] processing_list长度={len(processing_list)} "
                                        f"分配预览(前5条)={[(p[1], p[2], p[3]) for p in processing_list[:5]]}")
                            
                            # 处理所有文件
                            for _doc_meta, _item_seq_val, _subdir_name, _inner_seq in processing_list:
                                file_path = _doc_meta.get('file_path')
                                if not file_path:
                                    logger.warning(f"[打包] 文件路径为空: {doc_name}")
                                    continue
                                
                                # 解析文件路径
                                file_path_obj = Path(file_path)
                                if not file_path_obj.is_absolute():
                                    # 使用 pathlib 处理跨平台路径（自动适配 Windows/Unix 分隔符）
                                    normalized_path = file_path_obj.as_posix()

                                    # 统一处理：file_path 都是相对于 projects_base_folder 的路径
                                    # 有些记录带有 projects/ 前缀（历史遗留问题），需要去掉
                                    if normalized_path.startswith('projects/'):
                                        # 去掉前缀部分
                                        relative_path = normalized_path[len('projects/'):]
                                    else:
                                        relative_path = normalized_path

                                    # 拼接完整路径
                                    file_path_obj = self.doc_manager.config.projects_base_folder / relative_path
                                
                                if not file_path_obj.exists():
                                    logger.warning(f"[打包] 文件不存在: {file_path_obj}")
                                    continue
                                
                                # 优先使用原始文件名，其次是filename字段，最后是磁盘文件名
                                filename = _doc_meta.get('original_filename') or _doc_meta.get('filename') or file_path_obj.name
                                
                                # 构建路径
                                clean_cycle = clean_name_prefix(cycle)
                                
                                if is_single_file:
                                    # 单文件：直接放在周期目录下，前缀 X.Y
                                    file_index_prefix = f"{cycle_idx}.{doc_type_seq}"
                                    archive_dir = f"{project_name}/{cycle_idx}.{clean_cycle}"
                                elif _inner_seq is not None:
                                    # 有子目录的文件：前缀 X.Y.M.K，放 X.Y.M 子目录下
                                    file_index_prefix = f"{cycle_idx}.{doc_type_seq}.{_item_seq_val}.{_inner_seq}"
                                    clean_dir = clean_name_prefix(_subdir_name)
                                    archive_dir = (
                                        f"{project_name}/{cycle_idx}.{clean_cycle}"
                                        f"/{cycle_idx}.{doc_type_seq} {doc_name}"
                                        f"/{cycle_idx}.{doc_type_seq}.{_item_seq_val} {clean_dir}"
                                    )
                                    logger.info(f"[打包子目录] {doc_name}: _subdir_name='{_subdir_name}', clean_dir='{clean_dir}', archive_dir='{archive_dir}'")
                                else:
                                    # 无子目录：前缀 X.Y.N，放文档类型目录下
                                    file_index_prefix = f"{cycle_idx}.{doc_type_seq}.{_item_seq_val}"
                                    archive_dir = f"{project_name}/{cycle_idx}.{clean_cycle}/{cycle_idx}.{doc_type_seq} {doc_name}"
                                
                                clean_name = clean_filename(filename, file_index_prefix)
                                archive_path = f"{archive_dir}/{clean_name}"
                                
                                logger.info(f"[打包写入] {doc_name}: {filename} -> {archive_path}")
                                zipf.write(file_path_obj, archive_path)
                                logger.info(f"[打包成功] {doc_name}: {filename}")
                                processed_files += 1
                                
                                # 更新进度
                                progress = int(100 * processed_files / total_files)
                                self.tasks_store[task_id]['progress'] = progress
                                self.tasks_store[task_id]['message'] = f'正在打包... ({processed_files}/{total_files})'
                                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                                
                                if processed_files % 5 == 0:
                                    self._save_tasks()
                
                # 完成任务
                self.tasks_store[task_id]['status'] = 'completed'
                self.tasks_store[task_id]['progress'] = 100
                # 区分实际文件和不涉及占位文件
                actual_files = processed_files - not_involved_count if not_involved_count > 0 else processed_files
                if not_involved_count > 0:
                    self.tasks_store[task_id]['message'] = f'打包完成！共 {actual_files} 个文件，{not_involved_count} 个不涉及占位文件'
                else:
                    self.tasks_store[task_id]['message'] = f'打包完成！共 {processed_files} 个文件'
                self.tasks_store[task_id]['result'] = {
                    'package_path': str(package_path),
                    'package_filename': package_filename,
                    'download_url': f'/api/tasks/download/{task_id}'
                }
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                self._save_tasks()
                
            except Exception as e:
                self.tasks_store[task_id]['status'] = 'error'
                self.tasks_store[task_id]['message'] = f'打包失败: {str(e)}'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                self._save_tasks()
        
        threading.Thread(target=download_package_task).start()
        
        return {
            'status': 'success',
            'task_id': task_id,
            'message': '打包任务已启动'
        }


# 创建全局任务服务实例
task_service = TaskService()