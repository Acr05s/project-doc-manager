"""JSON文件管理模块

专门用于处理JSON文件的读写操作。
使用文件系统级别的锁（fcntl.flock）支持多进程并发访问，
同时保留线程锁兜底，适用于 gunicorn 多 worker 场景。
"""

import json
import os
import sys
import threading
import tempfile
from typing import Dict, Any, Optional
from pathlib import Path
from contextlib import contextmanager

# 跨进程文件锁实现
_IS_POSIX = sys.platform != 'win32'

if _IS_POSIX:
    import fcntl

    @contextmanager
    def _file_lock(path: str, exclusive: bool = True):
        """POSIX 文件系统级锁（跨进程）
        
        在同一路径加锁，支持多进程互斥访问。
        锁文件路径：<原文件>.lock
        """
        lock_path = path + '.lock'
        # 确保锁文件所在目录存在
        lock_dir = os.path.dirname(lock_path)
        if lock_dir:
            os.makedirs(lock_dir, exist_ok=True)
        
        fd = open(lock_path, 'w')
        try:
            flag = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
            fcntl.flock(fd, flag)
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            fd.close()
else:
    # Windows 降级为线程锁（Windows 通常不跑多 worker gunicorn）
    import msvcrt

    @contextmanager
    def _file_lock(path: str, exclusive: bool = True):
        """Windows 文件锁（线程级，Windows 多进程场景较少用）"""
        lock_path = path + '.lock'
        lock_dir = os.path.dirname(lock_path)
        if lock_dir:
            os.makedirs(lock_dir, exist_ok=True)
        
        fd = open(lock_path, 'w')
        try:
            # Windows: 锁定文件头 1 字节
            msvcrt.locking(fd.fileno(), msvcrt.LK_NBLCK, 1)
            yield
        except OSError:
            # 尝试阻塞等待
            import time
            for _ in range(50):
                time.sleep(0.1)
                try:
                    msvcrt.locking(fd.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    continue
            yield
        finally:
            try:
                msvcrt.locking(fd.fileno(), msvcrt.LK_UNLCK, 1)
            except Exception:
                pass
            fd.close()


# 线程锁字典（在同一进程内多线程间再加一层保护）
_thread_locks: Dict[str, threading.RLock] = {}
_thread_locks_meta = threading.RLock()


def get_file_lock(file_path: str):
    """获取线程级文件锁（保留向后兼容）
    
    注意：这个锁只在进程内有效。
    对于跨进程场景，请使用 atomic_write_json / locked_read_json。
    """
    with _thread_locks_meta:
        if file_path not in _thread_locks:
            _thread_locks[file_path] = threading.RLock()
        return _thread_locks[file_path]


def _atomic_write(file_path: str, content: str) -> bool:
    """原子写入文件
    
    先写入临时文件，再用 os.replace 原子替换，
    防止写到一半时其他进程读到损坏的文件。
    """
    dir_path = os.path.dirname(file_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)
    
    # 在同目录下创建临时文件（确保同一文件系统，rename 才是原子的）
    tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_path or '.', suffix='.tmp')
    try:
        with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())  # 确保写到磁盘
        os.replace(tmp_path, file_path)  # 原子替换
        return True
    except Exception as e:
        print(f"原子写入失败: {file_path}, 错误: {e}")
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        return False


class JSONFileManager:
    """JSON文件管理器
    
    提供跨进程安全的 JSON 文件读写操作。
    使用文件系统锁（fcntl.flock）+ 原子写，支持 gunicorn 多 worker 场景。
    """
    
    def read_json(self, file_path: str) -> Optional[Dict[str, Any]]:
        """读取JSON文件（跨进程安全）
        
        使用共享读锁，允许多个进程同时读，但排斥写操作。
        """
        file_path = os.path.abspath(file_path)
        
        if not os.path.exists(file_path):
            return None
        
        with _file_lock(file_path, exclusive=False):  # 共享读锁
            encodings = ['utf-8', 'gbk', 'utf-8-sig', 'latin-1']
            for encoding in encodings:
                try:
                    with open(file_path, 'r', encoding=encoding) as f:
                        content = f.read()
                    return json.loads(content)
                except UnicodeDecodeError:
                    continue
                except json.JSONDecodeError as e:
                    print(f"JSON解析错误 ({encoding}): {e}")
                    continue
                except Exception as e:
                    print(f"读取文件错误 ({encoding}): {e}")
                    continue
        
        print(f"无法读取文件: {file_path}")
        return None
    
    def write_json(self, file_path: str, data: Dict[str, Any]) -> bool:
        """写入JSON文件（跨进程安全，原子写）
        
        使用排他写锁 + 原子写，确保：
        1. 同一时刻只有一个进程写入
        2. 写入过程中其他进程读到的是旧的完整文件，而不是损坏的中间状态
        """
        file_path = os.path.abspath(file_path)
        
        try:
            content = json.dumps(data, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"JSON序列化失败: {e}")
            return False
        
        with _file_lock(file_path, exclusive=True):  # 排他写锁
            return _atomic_write(file_path, content)
    
    def update_json(self, file_path: str, update_func) -> bool:
        """原子性更新JSON文件（读-改-写 作为一个整体）
        
        在排他锁保护下完成整个 读-改-写 流程，防止并发修改丢失。
        """
        file_path = os.path.abspath(file_path)
        
        with _file_lock(file_path, exclusive=True):  # 排他写锁持续整个操作
            # 在锁内读取（不再递归加锁，直接读文件）
            current_data = self._read_json_unlocked(file_path)
            if current_data is None:
                current_data = {}
            
            try:
                new_data = update_func(current_data)
                content = json.dumps(new_data, ensure_ascii=False, indent=2)
                return _atomic_write(file_path, content)
            except Exception as e:
                print(f"更新文件失败: {file_path}, 错误: {e}")
                return False
    
    def _read_json_unlocked(self, file_path: str) -> Optional[Dict[str, Any]]:
        """不加锁读取 JSON（仅在已持有锁时内部调用）"""
        if not os.path.exists(file_path):
            return None
        
        encodings = ['utf-8', 'gbk', 'utf-8-sig', 'latin-1']
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    return json.loads(f.read())
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            except Exception:
                continue
        return None
    
    def get_project_file_path(self, projects_base_folder: str, project_id: str) -> str:
        return os.path.join(projects_base_folder, f"{project_id}.json")
    
    def _get_zip_uploads_file(self, project_file: str) -> str:
        project_dir = os.path.dirname(project_file)
        return os.path.join(project_dir, 'zip_uploads.json')
    
    def add_zip_upload_record(self, project_file: str, zip_info: Dict[str, Any]) -> bool:
        zip_uploads_file = self._get_zip_uploads_file(project_file)
        
        def update_func(data):
            if not isinstance(data, list):
                data = []
            data.append(zip_info)
            return data
        
        return self.update_json(zip_uploads_file, update_func)
    
    def get_zip_upload_records(self, project_file: str) -> Optional[list]:
        zip_uploads_file = self._get_zip_uploads_file(project_file)
        data = self.read_json(zip_uploads_file)
        if data and isinstance(data, list):
            return data
        return []
    
    def update_zip_upload_record(self, project_file: str, zip_id: str, update_data: Dict[str, Any]) -> bool:
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
        zip_uploads_file = self._get_zip_uploads_file(project_file)
        
        def update_func(data):
            if isinstance(data, list):
                filtered_data = []
                for record in data:
                    record_id = record.get('id', '')
                    record_name = record.get('name', '')
                    record_path = record.get('path', '') or record.get('zip_path', '')
                    if record_id != zip_id and record_name != zip_id and record_path != zip_id:
                        filtered_data.append(record)
                data = filtered_data
            return data
        
        return self.update_json(zip_uploads_file, update_func)
    
    def save_project(self, project_file: str, project_data: Dict[str, Any]) -> bool:
        return self.write_json(project_file, project_data)
    
    def load_project(self, project_file: str) -> Optional[Dict[str, Any]]:
        return self.read_json(project_file)


# 全局单例
json_file_manager = JSONFileManager()
