"""操作日志模块

提供项目操作记录和查询功能。
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from .base import DocumentConfig, setup_logging, ensure_dir

logger = setup_logging(__name__)


class OperationLogger:
    """操作日志记录器"""
    
    def __init__(self, config: DocumentConfig):
        """初始化操作日志记录器
        
        Args:
            config: 文档配置实例
        """
        self.config = config
        self.log_file = config.operation_log_file
        self._init_log_file()
    
    def _init_log_file(self):
        """初始化日志文件"""
        if not self.log_file.exists():
            self.log_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.log_file, 'w', encoding='utf-8') as f:
                f.write(f"# 操作日志 - 创建于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    def log(self, operation: str, details: str = '', status: str = 'success', 
            project: Optional[str] = None, extra: Optional[Dict[str, Any]] = None):
        """记录操作日志
        
        Args:
            operation: 操作类型
            details: 详细信息
            status: 状态（success/error/warning）
            project: 项目名称
            extra: 额外信息
        """
        try:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # 构建日志内容
            log_entry = f"[{timestamp}] [{status.upper()}] [{operation}]"
            if project:
                log_entry += f" - 项目: {project}"
            if details:
                log_entry += f" - {details}"
            if extra:
                extra_str = ", ".join(f"{k}={v}" for k, v in extra.items())
                log_entry += f" - {extra_str}"
            
            # 写入文件
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(log_entry + "\n")
            
            logger.info(f"操作日志: {operation} - {status}")
            
        except Exception as e:
            logger.error(f"记录操作日志失败: {e}")
    
    def get_logs(self, limit: int = 100, operation_type: Optional[str] = None, 
                 project: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取操作日志
        
        Args:
            limit: 返回数量限制
            operation_type: 操作类型过滤
            project: 项目名称过滤
            status: 状态过滤
            
        Returns:
            List[Dict]: 日志列表
        """
        logs = []
        
        try:
            if not self.log_file.exists():
                return logs
            
            with open(self.log_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # 从后往前读取（最新的在前）
            for line in reversed(lines[-limit * 2:]):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                # 解析日志行
                try:
                    log_entry = self._parse_log_line(line)
                    if not log_entry:
                        continue
                    
                    # 过滤
                    if operation_type and log_entry.get('operation') != operation_type:
                        continue
                    if project and log_entry.get('project') != project:
                        continue
                    if status and log_entry.get('status') != status:
                        continue
                    
                    logs.append(log_entry)
                    
                    if len(logs) >= limit:
                        break
                        
                except Exception:
                    continue
                    
        except Exception as e:
            logger.error(f"读取操作日志失败: {e}")
        
        return logs
    
    def _parse_log_line(self, line: str) -> Optional[Dict[str, Any]]:
        """解析日志行
        
        Args:
            line: 日志行
            
        Returns:
            Optional[Dict]: 解析后的日志对象
        """
        # 格式: [timestamp] [STATUS] [operation] - 项目: xxx - details
        import re
        
        pattern = r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(\w+)\] \[([^\]]+)\]'
        match = re.match(pattern, line)
        
        if not match:
            return None
        
        timestamp, status, operation = match.groups()
        
        result = {
            'timestamp': timestamp,
            'status': status.lower(),
            'operation': operation
        }
        
        # 提取项目
        project_match = re.search(r'项目:\s*([^-\n]+)', line)
        if project_match:
            result['project'] = project_match.group(1).strip()
        
        # 提取详情
        details_parts = []
        for part in line.split(' - '):
            if part.startswith('[') or '项目:' in part:
                continue
            if part.strip():
                details_parts.append(part.strip())
        
        if details_parts:
            result['details'] = ' - '.join(details_parts[1:]) if len(details_parts) > 1 else details_parts[0]
        
        return result
    
    def clear_logs(self, before_date: Optional[datetime] = None):
        """清除日志
        
        Args:
            before_date: 清除此日期之前的日志，None表示清除所有
        """
        try:
            if not self.log_file.exists():
                return
            
            if before_date is None:
                # 清除所有，保留文件头
                with open(self.log_file, 'w', encoding='utf-8') as f:
                    f.write(f"# 操作日志 - 创建于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                logger.info("操作日志已清除")
            else:
                # 保留指定日期之后的日志
                with open(self.log_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                
                with open(self.log_file, 'w', encoding='utf-8') as f:
                    for line in lines:
                        if line.strip().startswith('#'):
                            f.write(line)
                            continue
                        
                        log_entry = self._parse_log_line(line.strip())
                        if log_entry:
                            try:
                                log_time = datetime.strptime(log_entry['timestamp'], '%Y-%m-%d %H:%M:%S')
                                if log_time >= before_date:
                                    f.write(line)
                            except Exception:
                                pass
                
                logger.info(f"已清除 {before_date.strftime('%Y-%m-%d')} 之前的日志")
                
        except Exception as e:
            logger.error(f"清除日志失败: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """获取日志统计信息
        
        Returns:
            Dict: 统计信息
        """
        stats = {
            'total_count': 0,
            'by_status': {},
            'by_operation': {},
            'by_project': {}
        }
        
        try:
            if not self.log_file.exists():
                return stats
            
            with open(self.log_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            for line in lines:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                log_entry = self._parse_log_line(line)
                if not log_entry:
                    continue
                
                stats['total_count'] += 1
                
                # 按状态统计
                status = log_entry.get('status', 'unknown')
                stats['by_status'][status] = stats['by_status'].get(status, 0) + 1
                
                # 按操作统计
                operation = log_entry.get('operation', 'unknown')
                stats['by_operation'][operation] = stats['by_operation'].get(operation, 0) + 1
                
                # 按项目统计
                project = log_entry.get('project')
                if project:
                    stats['by_project'][project] = stats['by_project'].get(project, 0) + 1
                    
        except Exception as e:
            logger.error(f"获取日志统计失败: {e}")
        
        return stats
