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
                
                # 尝试多种方式查找项目目录
                possible_paths = [
                    projects_base / project_name,
                    projects_base / project_id,
                    projects_base / f"{project_name}_{project_id}"
                ]
                
                for path in possible_paths:
                    if path.exists() and path.is_dir():
                        project_dir = path
                        break
                
                if not project_dir:
                    raise Exception('项目目录不存在')
                
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

    def start_download_package_task(self, project_id: str, project_config: Dict[str, Any]) -> Dict[str, Any]:
        """启动下载打包任务（按周期/文档类型组织）"""
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
                
                # 获取项目数据
                documents = project_config.get('documents', {})
                # 获取周期的正确顺序（cycles 列表定义了顺序）
                cycles_order = project_config.get('cycles', [])
                
                # 统计文件总数
                total_files = sum(
                    len(doc_data.get('uploaded_docs', []))
                    for doc_data in documents.values()
                    if isinstance(doc_data, dict)
                )
                
                if total_files == 0:
                    raise Exception('没有可打包的文件')
                
                # 创建临时目录和ZIP文件
                temp_dir = Path('uploads/temp/packages')
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                project_name = project_config.get('name', '项目文档')
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
                        doc_type_seq = 0
                        
                        for req_doc in required_docs:
                            doc_name = req_doc.get('name', '未知')
                            
                            # 如果该文档类型没有上传的文件，跳过
                            if doc_name not in doc_files_map:
                                continue
                            
                            # 文档类型序号递增（1.1, 1.2, 1.3...）
                            doc_type_seq += 1
                            
                            # 直接遍历该文档类型的所有文件
                            doc_files = doc_files_map[doc_name]
                            
                            # 按子目录排序（无子目录的在前），确保顺序一致
                            def get_sort_key(doc_meta):
                                d = doc_meta.get('directory', '') or ''
                                d = d.strip()
                                if d == '/':
                                    d = ''
                                return (d != '', d)  # 无子目录的排在前面，然后按目录名排序
                            
                            sorted_files = sorted(doc_files, key=get_sort_key)
                            
                            # 先分组：无子目录的文件 和 有子目录的文件
                            files_no_subdir = [f for f in sorted_files if not (f.get('directory', '') or '').strip() or (f.get('directory', '') or '').strip() == '/']
                            files_with_subdir = [f for f in sorted_files if (f.get('directory', '') or '').strip() and (f.get('directory', '') or '').strip() != '/']
                            
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
                                    continue
                                
                                # 解析文件路径
                                file_path_obj = Path(file_path)
                                if not file_path_obj.is_absolute():
                                    if file_path.startswith('projects/'):
                                        base_dir = self.doc_manager.config.projects_base_folder.parent
                                        file_path_obj = base_dir / file_path
                                    else:
                                        project_uploads_dir = self.doc_manager.config.projects_base_folder / project_name / 'uploads'
                                        file_path_obj = project_uploads_dir / file_path
                                
                                if not file_path_obj.exists():
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
                                else:
                                    # 无子目录：前缀 X.Y.N，放文档类型目录下
                                    file_index_prefix = f"{cycle_idx}.{doc_type_seq}.{_item_seq_val}"
                                    archive_dir = f"{project_name}/{cycle_idx}.{clean_cycle}/{cycle_idx}.{doc_type_seq} {doc_name}"
                                
                                clean_name = clean_filename(filename, file_index_prefix)
                                archive_path = f"{archive_dir}/{clean_name}"
                                
                                zipf.write(file_path_obj, archive_path)
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