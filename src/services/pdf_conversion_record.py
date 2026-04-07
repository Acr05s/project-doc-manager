"""PDF转换记录管理服务 - 使用数据库持久化存储"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict


class PDFConversionRecord:
    """PDF转换记录管理类（数据库版）

    保持与旧版 JSON 文件版相同的 API 接口，内部改用 projects_index.db 存储。
    旧版 JSON 文件中的记录会在首次加载时自动迁移到数据库。
    """

    def __init__(self):
        """初始化PDF转换记录管理器"""
        self._records_file = Path('uploads/temp/preview/conversion_records.json')
        self._records_file.parent.mkdir(parents=True, exist_ok=True)

        # 兼容旧代码的内存缓存（从数据库加载）
        self.records: Dict[str, Dict] = {}
        self._db = None
        self._migrated = False

    def _ensure_db(self):
        """延迟初始化数据库连接（避免循环导入）"""
        if self._db is not None:
            return
        try:
            from app.utils.db_manager import get_projects_index_db
            self._db = get_projects_index_db()
        except Exception as e:
            print(f"[PDFConversionRecord] 初始化数据库失败: {e}")

    def _migrate_from_json(self):
        """从旧版 JSON 文件迁移记录到数据库"""
        if self._migrated:
            return
        self._migrated = True

        if not self._records_file.exists():
            return

        try:
            with open(self._records_file, 'r', encoding='utf-8') as f:
                old_records = json.load(f)

            if not old_records:
                return

            self._ensure_db()
            if not self._db:
                return

            migrated_count = 0
            for key, record in old_records.items():
                doc_id = record.get('doc_id', key)
                pdf_path = record.get('pdf_path')
                if not pdf_path:
                    continue

                # 检查 PDF 文件是否还存在
                if not os.path.exists(pdf_path):
                    continue

                # 检查是否已经迁移过了
                existing = self._db.get_pdf_conversion(key)
                if existing:
                    continue

                file_mtime = record.get('file_mtime', 0)
                self._db.add_pdf_conversion(
                    doc_id=doc_id,
                    cache_key=key,
                    pdf_path=pdf_path,
                    source_file_path=record.get('file_path'),
                    source_file_mtime=file_mtime,
                    is_complete=record.get('is_complete', True)
                )
                migrated_count += 1

            if migrated_count > 0:
                print(f"[PDFConversionRecord] 从 JSON 迁移了 {migrated_count} 条记录到数据库")

            # 备份旧文件
            backup_path = self._records_file.with_suffix('.json.bak')
            try:
                import shutil
                shutil.move(str(self._records_file), str(backup_path))
                print(f"[PDFConversionRecord] 旧 JSON 文件已备份到: {backup_path}")
            except Exception:
                pass

        except Exception as e:
            print(f"[PDFConversionRecord] JSON 迁移失败: {e}")

    def _load_records(self):
        """加载转换记录（兼容旧接口，实际从数据库加载到内存缓存）"""
        self._ensure_db()
        self._migrate_from_json()

        if self._db:
            try:
                import sqlite3 as _sqlite3
                conn = _sqlite3.connect(self._db.db_path, timeout=5.0)
                conn.row_factory = _sqlite3.Row
                rows = conn.execute('SELECT * FROM pdf_conversions ORDER BY last_accessed DESC').fetchall()
                conn.close()

                for row in rows:
                    key = row['cache_key']
                    self.records[key] = {
                        'pdf_path': row['pdf_path'],
                        'file_path': row['source_file_path'],
                        'file_mtime': row['source_file_mtime'] or 0,
                        'converted_at': row['converted_at'],
                        'last_accessed': row['last_accessed'],
                        'is_complete': bool(row['is_complete']),
                        'doc_id': row['doc_id']
                    }
            except Exception as e:
                print(f"[PDFConversionRecord] 从数据库加载记录失败: {e}")

    def _save_records(self):
        """保存转换记录（兼容旧接口，实际写入数据库）"""
        # 新版不需要手动保存，add_record 时已经写入数据库
        pass

    def get_record(self, doc_id: str) -> Optional[Dict]:
        """获取转换记录

        Args:
            doc_id: 缓存键（可能是 cache_key = {doc_id}_{mtime}，也可能是纯 doc_id）

        Returns:
            Dict: 转换记录，如果不存在返回None
        """
        self._ensure_db()
        if self._db:
            # 先精确匹配 cache_key
            record = self._db.get_pdf_conversion(doc_id)
            if record:
                self.records[doc_id] = {
                    'pdf_path': record['pdf_path'],
                    'file_path': record['source_file_path'],
                    'file_mtime': record['source_file_mtime'] or 0,
                    'converted_at': record['converted_at'],
                    'last_accessed': record['last_accessed'],
                    'is_complete': bool(record['is_complete']),
                    'doc_id': record['doc_id']
                }
                return self.records[doc_id]

            # 如果没找到，尝试模糊匹配（以 doc_id 开头的 cache_key）
            # 这是为了兼容前端用 doc_id 查询的情况
            try:
                import sqlite3 as _sqlite3
                conn = _sqlite3.connect(self._db.db_path, timeout=5.0)
                conn.row_factory = _sqlite3.Row
                rows = conn.execute(
                    "SELECT * FROM pdf_conversions WHERE cache_key LIKE ? ORDER BY last_accessed DESC LIMIT 1",
                    (doc_id + '%',)
                ).fetchall()
                conn.close()

                if rows:
                    row = rows[0]
                    key = row['cache_key']
                    self.records[key] = {
                        'pdf_path': row['pdf_path'],
                        'file_path': row['source_file_path'],
                        'file_mtime': row['source_file_mtime'] or 0,
                        'converted_at': row['converted_at'],
                        'last_accessed': row['last_accessed'],
                        'is_complete': bool(row['is_complete']),
                        'doc_id': row['doc_id']
                    }
                    return self.records[key]
            except Exception:
                pass

        # 回退到内存缓存
        return self.records.get(doc_id)

    def add_record(self, doc_id: str, pdf_path: str, file_path: str,
                   file_mtime: float = None, is_complete: bool = True,
                   source_doc_id: str = None):
        """添加转换记录

        Args:
            doc_id: 缓存键（通常是 {doc_id}_{mtime}）
            pdf_path: PDF文件路径
            file_path: 源文件路径
            file_mtime: 源文件修改时间
            is_complete: 是否完整转换
            source_doc_id: 原始文档ID（不带 mtime 后缀）
        """
        self._ensure_db()

        # 更新内存缓存
        self.records[doc_id] = {
            'pdf_path': pdf_path,
            'file_path': file_path,
            'file_mtime': file_mtime or 0,
            'converted_at': datetime.now().isoformat(),
            'last_accessed': datetime.now().isoformat(),
            'is_complete': is_complete
        }

        # 写入数据库
        if self._db:
            try:
                self._db.add_pdf_conversion(
                    doc_id=source_doc_id or doc_id,
                    cache_key=doc_id,
                    pdf_path=pdf_path,
                    source_file_path=file_path,
                    source_file_mtime=file_mtime,
                    is_complete=is_complete
                )
            except Exception as e:
                print(f"[PDFConversionRecord] 写入数据库失败: {e}")

    def update_access_time(self, doc_id: str):
        """更新访问时间

        Args:
            doc_id: 缓存键
        """
        if doc_id in self.records:
            self.records[doc_id]['last_accessed'] = datetime.now().isoformat()

        self._ensure_db()
        if self._db:
            try:
                self._db.update_pdf_conversion_access(doc_id)
            except Exception:
                pass

    def delete_record(self, doc_id: str, cache_key: str = None):
        """删除转换记录并清理PDF文件

        Args:
            doc_id: 文档ID
            cache_key: 可选的缓存键（如果指定则精确删除）
        """
        # 从内存缓存删除
        keys_to_remove = []
        if cache_key and cache_key in self.records:
            keys_to_remove.append(cache_key)
        else:
            # 删除所有以 doc_id 开头的记录
            for key in list(self.records.keys()):
                if key == doc_id or key.startswith(doc_id + '_'):
                    keys_to_remove.append(key)

        for key in keys_to_remove:
            pdf_path = self.records[key].get('pdf_path')
            if pdf_path and os.path.exists(pdf_path):
                try:
                    os.remove(pdf_path)
                    print(f"[PDFConversionRecord] 删除PDF文件: {pdf_path}")
                except Exception as e:
                    print(f"[PDFConversionRecord] 删除PDF文件失败: {e}")
            del self.records[key]

        # 从数据库删除
        self._ensure_db()
        if self._db:
            try:
                self._db.delete_pdf_conversion(doc_id, cache_key)
            except Exception as e:
                print(f"[PDFConversionRecord] 从数据库删除记录失败: {e}")

    def cleanup_old_records(self, days=7):
        """清理过期记录

        Args:
            days: 过期天数
        """
        self._ensure_db()
        if self._db:
            try:
                self._db.cleanup_expired_pdf_conversions(days)
            except Exception as e:
                print(f"[PDFConversionRecord] 清理过期记录失败: {e}")

    def get_record_by_doc_id(self, doc_id: str) -> Optional[Dict]:
        """根据原始 doc_id（不带 mtime 后缀）获取最新的转换记录

        Args:
            doc_id: 原始文档ID

        Returns:
            Dict: 转换记录，如果不存在返回None
        """
        self._ensure_db()
        if self._db:
            record = self._db.get_pdf_conversion_by_doc_id(doc_id)
            if record:
                cache_key = record['cache_key']
                self.records[cache_key] = {
                    'pdf_path': record['pdf_path'],
                    'file_path': record['source_file_path'],
                    'file_mtime': record['source_file_mtime'] or 0,
                    'converted_at': record['converted_at'],
                    'last_accessed': record['last_accessed'],
                    'is_complete': bool(record['is_complete']),
                    'doc_id': record['doc_id']
                }
                return self.records[cache_key]

        # 回退到内存缓存
        for key, record in self.records.items():
            if record.get('doc_id') == doc_id or key.startswith(doc_id + '_'):
                return record
        return None


# 创建全局PDF转换记录实例
pdf_conversion_record = PDFConversionRecord()
