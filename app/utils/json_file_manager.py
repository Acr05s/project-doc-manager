"""JSON文件管理模块

专门用于处理JSON文件的读写操作。
注意：Flask开发模式是单线程的，不需要额外的线程锁。
"""

import json
import os
from typing import Dict, Any, Optional
from pathlib import Path


class JSONFileManager:
    """JSON文件管理器，提供简单的JSON文件读写操作"""
    
    def __init__(self):
        """初始化JSON文件管理器"""
        pass
    
    def read_json(self, file_path: str) -> Optional[Dict[str, Any]]:
        """读取JSON文件
        
        Args:
            file_path: 文件路径
            
        Returns:
            Optional[Dict[str, Any]]: JSON数据，如果文件不存在或解析失败返回None
        """
        file_path = os.path.abspath(file_path)
        
        if not os.path.exists(file_path):
            return None
        
        # 尝试多种编码读取
        encodings = ['utf-8', 'gbk', 'utf-8-sig', 'latin-1']
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                    # 尝试解析JSON
                    return json.loads(content)
            except UnicodeDecodeError:
                continue
            except json.JSONDecodeError as e:
                # JSON解析错误，可能是文件格式问题
                print(f"JSON解析错误 ({encoding}): {e}")
                continue
            except Exception as e:
                print(f"读取文件错误 ({encoding}): {e}")
                continue
        
        # 所有编码都失败，返回None
        print(f"无法读取文件: {file_path}")
        return None
    
    def write_json(self, file_path: str, data: Dict[str, Any]) -> bool:
        """写入JSON文件
        
        Args:
            file_path: 文件路径
            data: 要写入的数据
            
        Returns:
            bool: 是否写入成功
        """
        file_path = os.path.abspath(file_path)
        
        try:
            # 确保目录存在
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"写入文件失败: {file_path}, 错误: {e}")
            return False
    
    def update_json(self, file_path: str, update_func) -> bool:
        """更新JSON文件
        
        Args:
            file_path: 文件路径
            update_func: 更新函数，接收当前数据，返回新数据
            
        Returns:
            bool: 是否更新成功
        """
        file_path = os.path.abspath(file_path)
        
        # 读取当前数据
        current_data = self.read_json(file_path)
        if current_data is None:
            current_data = {}
        
        # 应用更新
        try:
            new_data = update_func(current_data)
            # 写入更新后的数据
            return self.write_json(file_path, new_data)
        except Exception as e:
            print(f"更新文件失败: {file_path}, 错误: {e}")
            return False
    
    def get_project_file_path(self, projects_base_folder: str, project_id: str) -> str:
        """获取项目文件路径
        
        Args:
            projects_base_folder: 项目基础目录
            project_id: 项目ID
            
        Returns:
            str: 项目JSON文件路径
        """
        return os.path.join(projects_base_folder, f"{project_id}.json")
    
    def _get_zip_uploads_file(self, project_file: str) -> str:
        """获取ZIP上传记录文件路径
        
        Args:
            project_file: 项目JSON文件路径
            
        Returns:
            str: ZIP上传记录文件路径
        """
        project_dir = os.path.dirname(project_file)
        return os.path.join(project_dir, 'zip_uploads.json')
    
    def add_zip_upload_record(self, project_file: str, zip_info: Dict[str, Any]) -> bool:
        """添加ZIP上传记录
        
        Args:
            project_file: 项目JSON文件路径
            zip_info: ZIP包信息
            
        Returns:
            bool: 是否添加成功
        """
        zip_uploads_file = self._get_zip_uploads_file(project_file)
        
        def update_func(data):
            # 确保数据是列表
            if not isinstance(data, list):
                data = []
            
            # 添加新的ZIP上传记录
            data.append(zip_info)
            return data
        
        return self.update_json(zip_uploads_file, update_func)
    
    def get_zip_upload_records(self, project_file: str) -> Optional[list]:
        """获取ZIP上传记录
        
        Args:
            project_file: 项目JSON文件路径
            
        Returns:
            Optional[list]: ZIP上传记录列表
        """
        zip_uploads_file = self._get_zip_uploads_file(project_file)
        data = self.read_json(zip_uploads_file)
        if data and isinstance(data, list):
            return data
        return []
    
    def update_zip_upload_record(self, project_file: str, zip_id: str, update_data: Dict[str, Any]) -> bool:
        """更新ZIP上传记录
        
        Args:
            project_file: 项目JSON文件路径
            zip_id: ZIP记录ID
            update_data: 更新数据
            
        Returns:
            bool: 是否更新成功
        """
        zip_uploads_file = self._get_zip_uploads_file(project_file)
        
        def update_func(data):
            if isinstance(data, list):
                for record in data:
                    if record.get('id') == zip_id:
                        record.update(update_data)
                        break
            return data
        
        return self.update_json(zip_uploads_file, update_func)
    
    def delete_zip_upload_record(self, project_file: str, zip_id: str) -> bool:
        """删除ZIP上传记录
        
        Args:
            project_file: 项目JSON文件路径
            zip_id: ZIP记录ID
            
        Returns:
            bool: 是否删除成功
        """
        zip_uploads_file = self._get_zip_uploads_file(project_file)
        
        def update_func(data):
            if isinstance(data, list):
                # 同时支持按 id 或 name/path 删除（兼容旧格式记录）
                filtered_data = []
                for record in data:
                    record_id = record.get('id', '')
                    record_name = record.get('name', '')
                    record_path = record.get('path', '') or record.get('zip_path', '')
                    # 不匹配 id、name 或 path 的记录保留
                    if record_id != zip_id and record_name != zip_id and record_path != zip_id:
                        filtered_data.append(record)
                data = filtered_data
            return data
        
        return self.update_json(zip_uploads_file, update_func)
    
    def save_project(self, project_file: str, project_data: Dict[str, Any]) -> bool:
        """保存项目配置
        
        Args:
            project_file: 项目JSON文件路径
            project_data: 项目数据
            
        Returns:
            bool: 是否保存成功
        """
        return self.write_json(project_file, project_data)
    
    def load_project(self, project_file: str) -> Optional[Dict[str, Any]]:
        """加载项目配置
        
        Args:
            project_file: 项目JSON文件路径
            
        Returns:
            Optional[Dict[str, Any]]: 项目数据
        """
        return self.read_json(project_file)


# 创建全局JSON文件管理器实例
json_file_manager = JSONFileManager()
