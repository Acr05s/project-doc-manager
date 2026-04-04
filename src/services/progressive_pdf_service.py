"""渐进式PDF预览服务 - 先转换第一页和最后一页，然后后台转换其他页"""

import os
import json
import hashlib
import tempfile
import platform
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, Future
import threading
import time


class ProgressivePDFService:
    """渐进式PDF转换服务"""
    
    # 缓存目录
    CACHE_DIR = Path(tempfile.gettempdir()) / "doc_preview_cache"
    
    # 转换状态存储
    CONVERSION_STATUS: Dict[str, Dict] = {}
    STATUS_LOCK = threading.Lock()
    
    def __init__(self):
        self.platform = platform.system()
        self.executor = ThreadPoolExecutor(max_workers=2)
        self._ensure_cache_dir()
    
    def _ensure_cache_dir(self):
        """确保缓存目录存在"""
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    
    def _get_file_hash(self, file_path: str) -> str:
        """获取文件哈希值（用于缓存）"""
        stat = os.stat(file_path)
        content = f"{file_path}_{stat.st_size}_{stat.st_mtime}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def _get_cache_info_path(self, file_hash: str) -> Path:
        """获取缓存信息文件路径"""
        return self.CACHE_DIR / f"{file_hash}_info.json"
    
    def _get_cache_page_path(self, file_hash: str, page: int) -> Path:
        """获取缓存页面路径"""
        return self.CACHE_DIR / f"{file_hash}_page_{page}.png"
    
    def _get_cache_pdf_path(self, file_hash: str) -> Path:
        """获取完整PDF缓存路径"""
        return self.CACHE_DIR / f"{file_hash}_full.pdf"
    
    def _convert_page_to_image(self, pdf_path: str, page_num: int, output_path: str) -> bool:
        """将PDF的指定页面转换为图片"""
        try:
            # 使用pdftoppm或convert命令
            if self.platform == 'Windows':
                # 尝试使用pdftoppm (poppler-utils)
                try:
                    cmd = [
                        'pdftoppm',
                        '-f', str(page_num),
                        '-l', str(page_num),
                        '-png',
                        '-r', '150',  # 150 DPI
                        pdf_path,
                        output_path.replace('.png', '')
                    ]
                    subprocess.run(cmd, check=True, capture_output=True, timeout=30)
                    return True
                except:
                    pass
            
            # 回退方案：使用pdf2image
            try:
                from pdf2image import convert_from_path
                images = convert_from_path(
                    pdf_path, 
                    first_page=page_num, 
                    last_page=page_num,
                    dpi=150
                )
                if images:
                    images[0].save(output_path, 'PNG')
                    return True
            except Exception as e:
                print(f"pdf2image转换失败: {e}")
            
            return False
        except Exception as e:
            print(f"页面转换失败: {e}")
            return False
    
    def _get_pdf_page_count(self, pdf_path: str) -> int:
        """获取PDF总页数"""
        try:
            # 尝试使用PyPDF2
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(pdf_path)
                return len(reader.pages)
            except:
                pass
            
            # 回退：使用pdfinfo
            try:
                result = subprocess.run(
                    ['pdfinfo', pdf_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                for line in result.stdout.split('\n'):
                    if line.startswith('Pages:'):
                        return int(line.split(':')[1].strip())
            except:
                pass
            
            return 0
        except Exception as e:
            print(f"获取页数失败: {e}")
            return 0
    
    def start_conversion(self, source_path: str, source_type: str = 'office') -> str:
        """
        开始渐进式转换

        Args:
            source_path: 源文件路径
            source_type: 源文件类型 ('office' 或 'pdf')

        Returns:
            file_hash: 文件哈希值，用于后续查询
        """
        file_hash = self._get_file_hash(source_path)

        # 检查内存中是否已有转换状态
        with self.STATUS_LOCK:
            if file_hash in self.CONVERSION_STATUS:
                if self.CONVERSION_STATUS[file_hash].get('status') == 'completed':
                    return file_hash
                # 已在转换中，直接返回

        # 检查磁盘缓存：PDF是否已存在（避免 gunicorn 重启后重复转换）
        cached_pdf_path = self._get_cache_pdf_path(file_hash)
        if cached_pdf_path.exists():
            # PDF 已缓存，直接标记完成
            total_pages = self._get_pdf_page_count(str(cached_pdf_path))
            with self.STATUS_LOCK:
                self.CONVERSION_STATUS[file_hash] = {
                    'status': 'completed',
                    'source_path': source_path,
                    'pages_ready': list(range(1, total_pages + 1)) if total_pages > 0 else [],
                    'total_pages': total_pages,
                    'start_time': time.time(),
                    'completed_time': time.time()
                }
            print(f"[ProgressivePDFService] 使用磁盘缓存PDF: {cached_pdf_path}")
            return file_hash

        # 提交转换任务
        future = self.executor.submit(self._do_conversion, source_path, file_hash, source_type)

        with self.STATUS_LOCK:
            self.CONVERSION_STATUS[file_hash] = {
                'status': 'converting',
                'source_path': source_path,
                'future': future,
                'pages_ready': [],
                'total_pages': 0,
                'start_time': time.time()
            }

        return file_hash
    
    def _do_conversion(self, source_path: str, file_hash: str, source_type: str):
        """执行转换（在后台线程中）"""
        try:
            # 1. 首先转换整个文档为PDF（如果是Office文档）
            pdf_path = self._get_cache_pdf_path(file_hash)
            
            if source_type == 'office' or source_type in ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']:
                # 需要先转换为PDF（source_type='office' 来自 preview.py）
                pdf_path = self._convert_office_to_pdf(source_path, pdf_path)
            else:
                # 已经是PDF，复制到缓存
                import shutil
                shutil.copy2(source_path, pdf_path)
            
            if not pdf_path or not os.path.exists(pdf_path):
                self._update_status(file_hash, 'failed', error='PDF转换失败')
                return
            
            # 2. 获取总页数
            total_pages = self._get_pdf_page_count(pdf_path)
            self._update_status(file_hash, 'converting', total_pages=total_pages)
            
            # 3. 优先转换第一页和最后一页
            priority_pages = [1]  # 第一页
            if total_pages > 1:
                priority_pages.append(total_pages)  # 最后一页
            
            for page in priority_pages:
                output_path = str(self._get_cache_page_path(file_hash, page))
                if self._convert_page_to_image(pdf_path, page, output_path):
                    self._add_ready_page(file_hash, page)
            
            # 4. 标记高优先级页面完成
            self._update_status(file_hash, 'priority_done', 
                              priority_pages=priority_pages)
            
            # 5. 后台转换其他页面
            for page in range(1, total_pages + 1):
                if page in priority_pages:
                    continue
                
                output_path = str(self._get_cache_page_path(file_hash, page))
                if self._convert_page_to_image(pdf_path, page, output_path):
                    self._add_ready_page(file_hash, page)
            
            # 6. 完成
            self._update_status(file_hash, 'completed')
            
        except Exception as e:
            self._update_status(file_hash, 'failed', error=str(e))
    
    def _convert_office_to_pdf(self, input_path: str, output_path: str) -> Optional[str]:
        """将Office文档转换为PDF"""
        try:
            ext = Path(input_path).suffix.lower()
            
            if self.platform == 'Windows':
                # Windows平台使用COM对象
                if ext in ['.doc', '.docx']:
                    try:
                        import comtypes.client
                        app = comtypes.client.CreateObject('Word.Application')
                        app.Visible = False
                        doc = app.Documents.Open(input_path)
                        doc.SaveAs(output_path, FileFormat=17)
                        doc.Close()
                        app.Quit()
                        return output_path
                    except:
                        pass
                elif ext in ['.xls', '.xlsx']:
                    try:
                        import comtypes.client
                        app = comtypes.client.CreateObject('Excel.Application')
                        app.Visible = False
                        wb = app.Workbooks.Open(input_path)
                        wb.ExportAsFixedFormat(0, output_path)
                        wb.Close()
                        app.Quit()
                        return output_path
                    except:
                        pass
            
            # 回退到libreoffice
            import subprocess
            import tempfile
            
            with tempfile.TemporaryDirectory() as tmpdir:
                subprocess.run(
                    ['libreoffice', '--headless', '--convert-to', 'pdf', 
                     '--outdir', tmpdir, input_path],
                    check=True,
                    capture_output=True,
                    timeout=60
                )
                
                base_name = Path(input_path).stem
                generated_pdf = Path(tmpdir) / f"{base_name}.pdf"
                if generated_pdf.exists():
                    import shutil
                    shutil.copy2(generated_pdf, output_path)
                    return output_path
            
            return None
            
        except Exception as e:
            print(f"Office转PDF失败: {e}")
            return None
    
    def _update_status(self, file_hash: str, status: str, **kwargs):
        """更新转换状态"""
        with self.STATUS_LOCK:
            if file_hash in self.CONVERSION_STATUS:
                self.CONVERSION_STATUS[file_hash]['status'] = status
                self.CONVERSION_STATUS[file_hash].update(kwargs)
    
    def _add_ready_page(self, file_hash: str, page: int):
        """添加已准备好的页面"""
        with self.STATUS_LOCK:
            if file_hash in self.CONVERSION_STATUS:
                if 'pages_ready' not in self.CONVERSION_STATUS[file_hash]:
                    self.CONVERSION_STATUS[file_hash]['pages_ready'] = []
                if page not in self.CONVERSION_STATUS[file_hash]['pages_ready']:
                    self.CONVERSION_STATUS[file_hash]['pages_ready'].append(page)
    
    def get_status(self, file_hash: str) -> Dict:
        """获取转换状态"""
        with self.STATUS_LOCK:
            if file_hash not in self.CONVERSION_STATUS:
                return {'status': 'not_found'}
            
            status_info = self.CONVERSION_STATUS[file_hash].copy()
            # 移除不可序列化的future对象
            status_info.pop('future', None)
            return status_info
    
    def get_page(self, file_hash: str, page: int) -> Optional[Path]:
        """
        获取指定页面的图片路径
        
        Returns:
            Path对象如果页面已准备好，否则None
        """
        page_path = self._get_cache_page_path(file_hash, page)
        if page_path.exists():
            return page_path
        return None
    
    def get_preview_html(self, file_hash: str, total_pages: int = 0) -> str:
        """生成渐进式预览HTML"""
        status = self.get_status(file_hash)
        
        # 生成页面占位符
        pages_html = []
        for page in range(1, total_pages + 1):
            page_path = self._get_cache_page_path(file_hash, page)
            if page_path.exists():
                # 页面已加载
                pages_html.append(f'''
                <div class="page-container" data-page="{page}">
                    <div class="page-number">第 {page} 页</div>
                    <img src="/api/documents/preview/page/{file_hash}/{page}" 
                         alt="第{page}页" 
                         class="page-image"
                         loading="lazy">
                </div>
                ''')
            else:
                # 页面加载中
                pages_html.append(f'''
                <div class="page-container loading" data-page="{page}" id="page-{page}">
                    <div class="page-number">第 {page} 页</div>
                    <div class="page-loading">
                        <div class="loading-spinner"></div>
                        <span>加载中...</span>
                    </div>
                </div>
                ''')
        
        # 状态文本
        status_text = {
            'converting': '正在转换文档...',
            'priority_done': '首末页已就绪，继续加载中...',
            'completed': '全部加载完成',
            'failed': '转换失败'
        }.get(status['status'], '加载中...')
        
        html = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>文档预览</title>
            <style>
                body {{
                    margin: 0;
                    padding: 20px;
                    background: #f5f5f5;
                    font-family: Arial, sans-serif;
                }}
                .status-bar {{
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: #333;
                    color: white;
                    padding: 10px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    z-index: 1000;
                }}
                .status-bar .status {{
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }}
                .loading-spinner {{
                    width: 16px;
                    height: 16px;
                    border: 2px solid #fff;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }}
                @keyframes spin {{
                    to {{ transform: rotate(360deg); }}
                }}
                .page-list {{
                    margin-top: 60px;
                    max-width: 900px;
                    margin-left: auto;
                    margin-right: auto;
                }}
                .page-container {{
                    background: white;
                    margin: 20px 0;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }}
                .page-container.loading {{
                    min-height: 400px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                }}
                .page-number {{
                    font-size: 14px;
                    color: #666;
                    margin-bottom: 10px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #eee;
                }}
                .page-image {{
                    max-width: 100%;
                    height: auto;
                    display: block;
                    margin: 0 auto;
                }}
                .page-loading {{
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 15px;
                    color: #999;
                }}
                .page-loading .loading-spinner {{
                    border-color: #ddd;
                    border-top-color: #333;
                    width: 40px;
                    height: 40px;
                }}
            </style>
        </head>
        <body>
            <div class="status-bar">
                <div class="status">
                    <div class="loading-spinner" id="status-spinner"></div>
                    <span id="status-text">{status_text}</span>
                </div>
                <span id="page-count">共 {total_pages} 页</span>
            </div>
            <div class="page-list" id="page-list">
                {''.join(pages_html)}
            </div>
            
            <script>
                const fileHash = '{file_hash}';
                const totalPages = {total_pages};
                
                // 轮询检查页面加载状态
                function checkPages() {{
                    fetch(`/api/documents/preview/status/${{fileHash}}`)
                        .then(r => r.json())
                        .then(data => {{
                            // 更新状态文本
                            const statusText = document.getElementById('status-text');
                            const spinner = document.getElementById('status-spinner');
                            
                            if (data.status === 'completed') {{
                                statusText.textContent = '全部加载完成';
                                spinner.style.display = 'none';
                            }} else if (data.status === 'failed') {{
                                statusText.textContent = '加载失败: ' + (data.error || '未知错误');
                                spinner.style.display = 'none';
                            }}
                            
                            // 检查每个页面
                            if (data.pages_ready) {{
                                data.pages_ready.forEach(page => {{
                                    const container = document.getElementById(`page-${{page}}`);
                                    if (container && container.classList.contains('loading')) {{
                                        container.classList.remove('loading');
                                        container.innerHTML = `
                                            <div class="page-number">第 ${{page}} 页</div>
                                            <img src="/api/documents/preview/page/${{fileHash}}/${{page}}" 
                                                 alt="第${{page}}页" 
                                                 class="page-image">
                                        `;
                                    }}
                                }});
                            }}
                            
                            // 如果还没完成，继续轮询
                            if (data.status !== 'completed' && data.status !== 'failed') {{
                                setTimeout(checkPages, 2000);
                            }}
                        }})
                        .catch(e => {{
                            console.error('检查状态失败:', e);
                            setTimeout(checkPages, 5000);
                        }});
                }}
                
                // 开始轮询
                setTimeout(checkPages, 1000);
            </script>
        </body>
        </html>
        '''
        
        return html


# 全局服务实例
progressive_pdf_service = ProgressivePDFService()
