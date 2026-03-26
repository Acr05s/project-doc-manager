"""任务服务模块 - 处理后台任务管理"""

import uuid
import threading
import time
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

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

# 创建全局任务服务实例
task_service = TaskService()