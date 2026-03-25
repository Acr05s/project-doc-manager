"""任务服务模块 - 处理后台任务管理"""

import uuid
import threading
import time
from datetime import datetime
from typing import Dict, Any, Optional

class TaskService:
    """任务服务类"""
    
    def __init__(self):
        """初始化任务服务"""
        self.tasks_store: Dict[str, Dict[str, Any]] = {}
        self.doc_manager = None
    
    def set_doc_manager(self, manager):
        """设置文档管理器"""
        self.doc_manager = manager
    
    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        return self.tasks_store.get(task_id)
    
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
        
        # 启动后台线程执行任务
        def package_task():
            for i in range(1, 11):
                if self.tasks_store[task_id]['status'] == 'cancelled':
                    break
                self.tasks_store[task_id]['progress'] = i * 10
                self.tasks_store[task_id]['message'] = f'正在打包项目... {i * 10}%'
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
                time.sleep(0.5)
            
            if self.tasks_store[task_id]['status'] != 'cancelled' and self.doc_manager:
                # 实际打包操作
                package_path = self.doc_manager.package_project(project_id, project_config)
                self.tasks_store[task_id]['status'] = 'completed'
                self.tasks_store[task_id]['message'] = '项目打包完成'
                self.tasks_store[task_id]['result'] = {'package_path': package_path}
                self.tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
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