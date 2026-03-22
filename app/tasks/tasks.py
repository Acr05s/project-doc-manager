"""任务管理模块"""

import os
import json
import logging
from datetime import datetime
from celery import Celery
from flask import current_app

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Celery 配置
celery = Celery(
    'tasks',
    broker='memory://',
    backend='memory://'
)

# 任务状态存储
tasks_store = {}

# 任务状态
task_statuses = {
    'PENDING': 'pending',
    'STARTED': 'running',
    'SUCCESS': 'completed',
    'FAILURE': 'failed',
    'REVOKED': 'cancelled'
}

# 任务类型
task_types = {
    'package': '打包项目',
    'export': '导出需求清单',
    'report': '生成报告',
    'check': '检查异常'
}

@celery.task(bind=True)
def package_project_task(self, project_id, project_config):
    """打包项目任务"""
    task_id = self.request.id
    tasks_store[task_id] = {
        'id': task_id,
        'type': 'package',
        'name': task_types['package'],
        'status': 'running',
        'progress': 0,
        'message': '开始打包项目...',
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    try:
        from app.utils.document_manager import DocumentManager
        doc_manager = DocumentManager()
        
        # 模拟打包进度
        for i in range(1, 11):
            self.update_state(
                state='STARTED',
                meta={
                    'progress': i * 10,
                    'message': f'正在打包项目... {i * 10}%'
                }
            )
            tasks_store[task_id]['progress'] = i * 10
            tasks_store[task_id]['message'] = f'正在打包项目... {i * 10}%'
            tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            # 实际打包操作
            if i == 5:
                # 模拟打包过程
                package_path = doc_manager.package_project(project_id, project_config)
                tasks_store[task_id]['result'] = {
                    'package_path': package_path
                }
        
        tasks_store[task_id]['status'] = 'completed'
        tasks_store[task_id]['message'] = '项目打包完成'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
        return {
            'status': 'success',
            'message': '项目打包完成',
            'result': tasks_store[task_id].get('result', {})
        }
        
    except Exception as e:
        tasks_store[task_id]['status'] = 'failed'
        tasks_store[task_id]['message'] = f'打包失败: {str(e)}'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        raise

@celery.task(bind=True)
def export_requirements_task(self, project_id, project_config):
    """导出需求清单任务"""
    task_id = self.request.id
    tasks_store[task_id] = {
        'id': task_id,
        'type': 'export',
        'name': task_types['export'],
        'status': 'running',
        'progress': 0,
        'message': '开始导出需求清单...',
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    try:
        from app.utils.document_manager import DocumentManager
        doc_manager = DocumentManager()
        
        # 模拟导出进度
        for i in range(1, 6):
            self.update_state(
                state='STARTED',
                meta={
                    'progress': i * 20,
                    'message': f'正在导出需求清单... {i * 20}%'
                }
            )
            tasks_store[task_id]['progress'] = i * 20
            tasks_store[task_id]['message'] = f'正在导出需求清单... {i * 20}%'
            tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            # 实际导出操作
            if i == 3:
                json_content = doc_manager.export_requirements_to_json(project_config)
                tasks_store[task_id]['result'] = {
                    'content': json_content
                }
        
        tasks_store[task_id]['status'] = 'completed'
        tasks_store[task_id]['message'] = '需求清单导出完成'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
        return {
            'status': 'success',
            'message': '需求清单导出完成',
            'result': tasks_store[task_id].get('result', {})
        }
        
    except Exception as e:
        tasks_store[task_id]['status'] = 'failed'
        tasks_store[task_id]['message'] = f'导出失败: {str(e)}'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        raise

@celery.task(bind=True)
def generate_report_task(self, project_config):
    """生成报告任务"""
    task_id = self.request.id
    tasks_store[task_id] = {
        'id': task_id,
        'type': 'report',
        'name': task_types['report'],
        'status': 'running',
        'progress': 0,
        'message': '开始生成报告...',
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    try:
        from app.utils.document_manager import DocumentManager
        doc_manager = DocumentManager()
        
        # 模拟报告生成进度
        for i in range(1, 8):
            self.update_state(
                state='STARTED',
                meta={
                    'progress': round(i * 14.28),
                    'message': f'正在生成报告... {round(i * 14.28)}%'
                }
            )
            tasks_store[task_id]['progress'] = round(i * 14.28)
            tasks_store[task_id]['message'] = f'正在生成报告... {round(i * 14.28)}%'
            tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            # 实际报告生成操作
            if i == 4:
                report = doc_manager.generate_report(project_config)
                tasks_store[task_id]['result'] = {
                    'report': report
                }
        
        tasks_store[task_id]['status'] = 'completed'
        tasks_store[task_id]['message'] = '报告生成完成'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
        return {
            'status': 'success',
            'message': '报告生成完成',
            'result': tasks_store[task_id].get('result', {})
        }
        
    except Exception as e:
        tasks_store[task_id]['status'] = 'failed'
        tasks_store[task_id]['message'] = f'报告生成失败: {str(e)}'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        raise

@celery.task(bind=True)
def check_compliance_task(self, project_config):
    """检查异常任务"""
    task_id = self.request.id
    tasks_store[task_id] = {
        'id': task_id,
        'type': 'check',
        'name': task_types['check'],
        'status': 'running',
        'progress': 0,
        'message': '开始检查异常...',
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    try:
        from app.utils.document_manager import DocumentManager
        doc_manager = DocumentManager()
        
        # 模拟检查进度
        for i in range(1, 7):
            self.update_state(
                state='STARTED',
                meta={
                    'progress': round(i * 16.67),
                    'message': f'正在检查异常... {round(i * 16.67)}%'
                }
            )
            tasks_store[task_id]['progress'] = round(i * 16.67)
            tasks_store[task_id]['message'] = f'正在检查异常... {round(i * 16.67)}%'
            tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
            
            # 实际检查操作
            if i == 3:
                compliance = doc_manager.check_compliance(project_config)
                tasks_store[task_id]['result'] = {
                    'compliance': compliance
                }
        
        tasks_store[task_id]['status'] = 'completed'
        tasks_store[task_id]['message'] = '异常检查完成'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        
        return {
            'status': 'success',
            'message': '异常检查完成',
            'result': tasks_store[task_id].get('result', {})
        }
        
    except Exception as e:
        tasks_store[task_id]['status'] = 'failed'
        tasks_store[task_id]['message'] = f'检查失败: {str(e)}'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        raise

def get_task_status(task_id):
    """获取任务状态"""
    return tasks_store.get(task_id)

def list_tasks():
    """列出所有任务"""
    return list(tasks_store.values())

def cancel_task(task_id):
    """取消任务"""
    if task_id in tasks_store:
        # 取消 Celery 任务
        celery.control.revoke(task_id, terminate=True)
        # 更新任务状态
        tasks_store[task_id]['status'] = 'cancelled'
        tasks_store[task_id]['message'] = '任务已取消'
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        return True
    return False

def update_task_status(task_id, status, message=None, progress=None):
    """更新任务状态"""
    if task_id in tasks_store:
        tasks_store[task_id]['status'] = status
        if message:
            tasks_store[task_id]['message'] = message
        if progress is not None:
            tasks_store[task_id]['progress'] = progress
        tasks_store[task_id]['updated_at'] = datetime.now().isoformat()
        return True
    return False