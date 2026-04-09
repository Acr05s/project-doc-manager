"""PDF转换服务 - 将Office文档转换为PDF（跨平台版）

支持平台：
- Windows/Ubuntu: 优先使用 LibreOffice（无需安装Office）
- 备选方案: COM via comtypes（仅Windows，需安装Office，支持 .doc/.docx/.xls/.xlsx/.ppt/.pptx）

特点：
1. 优先使用LibreOffice，跨平台，速度快
2. Windows无LibreOffice时自动回退到 Office COM 接口（comtypes）
3. COM方案支持所有Office格式，包括旧版 .doc/.xls/.ppt
4. COM 实例复用，避免每个文件都启动新的 Office 进程
"""

import os
import platform
import threading
from pathlib import Path
import tempfile
import subprocess
import shutil
from .pdf_conversion_record import pdf_conversion_record

class PDFConversionService:
    """PDF转换服务类"""
    
    def __init__(self):
        """初始化PDF转换服务"""
        self.platform = platform.system()
        self.preview_temp_dir = None
        self._libreoffice_available = None
    
    def set_preview_temp_dir(self, temp_dir):
        """设置预览临时目录"""
        self.preview_temp_dir = temp_dir
    
    def _check_libreoffice(self):
        """检查LibreOffice是否可用"""
        if self._libreoffice_available is None:
            self._libreoffice_available = bool(
                shutil.which('libreoffice') or shutil.which('soffice')
            )
        return self._libreoffice_available
    
    def convert_to_pdf(self, input_path, doc_id=None):
        """将Office文档转换为PDF
        
        转换策略（按平台分支）：
        - Windows：优先 Office COM（comtypes），回退 LibreOffice（若已安装）
        - Linux/Ubuntu：优先 LibreOffice，无其他回退
        """
        input_path = os.path.abspath(str(input_path))
        ext = os.path.splitext(input_path)[1].lower()
        
        # 检查缓存
        if doc_id:
            record = pdf_conversion_record.get_record(doc_id)
            if record:
                pdf_path = record.get('pdf_path')
                if pdf_path and os.path.exists(pdf_path):
                    file_mtime = os.path.getmtime(input_path)
                    record_mtime = record.get('file_mtime', 0)
                    if record_mtime == file_mtime:
                        pdf_conversion_record.update_access_time(doc_id)
                        return pdf_path
        
        # 创建临时PDF路径
        if self.preview_temp_dir:
            # 使用 doc_id 作为文件名（而不是 UUID），便于缓存管理
            if doc_id:
                temp_pdf_path = os.path.join(self.preview_temp_dir, f"{doc_id}.pdf")
            else:
                import uuid
                temp_pdf_path = os.path.join(self.preview_temp_dir, f"{uuid.uuid4()}.pdf")
        else:
            temp_pdf_path = tempfile.mktemp(suffix='.pdf')
        
        errors = []
        office_exts = ('.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx')

        if self.platform == 'Windows':
            # ── Windows 分支 ──────────────────────────────────────────────────
            # 1. 优先用 Office COM（comtypes），支持所有 Office 格式，包括旧版 .doc
            if ext in office_exts:
                try:
                    self._convert_with_com(input_path, temp_pdf_path, ext)
                    if os.path.exists(temp_pdf_path) and os.path.getsize(temp_pdf_path) > 0:
                        self._save_record(doc_id, temp_pdf_path, input_path)
                        return temp_pdf_path
                    else:
                        raise Exception("COM转换未生成有效PDF文件")
                except Exception as e:
                    errors.append(f"COM: {e}")
                    print(f"[PDFConversionService] COM转换失败: {e}")
            
            # 2. COM失败时回退 LibreOffice（用户自行安装了的情况）
            if self._check_libreoffice():
                try:
                    self._convert_with_libreoffice(input_path, temp_pdf_path)
                    self._save_record(doc_id, temp_pdf_path, input_path)
                    return temp_pdf_path
                except Exception as e:
                    errors.append(f"LibreOffice: {e}")
                    print(f"[PDFConversionService] LibreOffice失败: {e}")

        else:
            # ── Linux/Ubuntu 分支 ─────────────────────────────────────────────
            # 唯一可用方案：LibreOffice
            if self._check_libreoffice():
                try:
                    self._convert_with_libreoffice(input_path, temp_pdf_path)
                    self._save_record(doc_id, temp_pdf_path, input_path)
                    return temp_pdf_path
                except Exception as e:
                    errors.append(f"LibreOffice: {e}")
                    print(f"[PDFConversionService] LibreOffice失败: {e}")
        
        # 所有方法都失败，清理临时文件
        if os.path.exists(temp_pdf_path):
            try:
                os.remove(temp_pdf_path)
            except:
                pass
        
        if self.platform == 'Windows':
            error_msg = "PDF转换失败。请确认已安装 Microsoft Office。"
            if errors:
                error_msg += " 错误详情: " + "; ".join(errors)
        else:
            error_msg = "PDF转换失败。未检测到LibreOffice，请安装: https://www.libreoffice.org/download/"
            if errors:
                error_msg += " 错误详情: " + "; ".join(errors)
        raise Exception(error_msg)
    
    def _save_record(self, doc_id, pdf_path, input_path):
        """保存转换记录"""
        if doc_id:
            file_mtime = os.path.getmtime(input_path)
            # doc_id 可能是 cache_key（含 mtime 后缀），提取原始 doc_id
            source_doc_id = doc_id.rsplit('_', 1)[0] if '_' in doc_id else doc_id
            pdf_conversion_record.add_record(doc_id, pdf_path, input_path,
                                             file_mtime=file_mtime, is_complete=True,
                                             source_doc_id=source_doc_id)
    
    def _convert_with_libreoffice(self, input_path, output_path):
        """使用LibreOffice转换（跨平台，推荐）"""
        libreoffice_cmd = 'soffice' if shutil.which('soffice') else 'libreoffice'
        
        try:
            output_dir = os.path.dirname(output_path)
            
            # 构建环境变量（继承当前环境，叠加 LANG/LC_ALL 确保中文字体支持）
            env = os.environ.copy()
            env.setdefault('LANG', 'zh_CN.UTF-8')
            env.setdefault('LC_ALL', 'zh_CN.UTF-8')
            env.setdefault('LC_CTYPE', 'zh_CN.UTF-8')
            # LibreOffice 在 Ubuntu 下需要有效的 HOME 才能读取用户配置和字体
            if 'HOME' not in env or not env['HOME']:
                env['HOME'] = '/root'
            
            result = subprocess.run(
                [libreoffice_cmd, '--headless', '--convert-to', 'pdf',
                 '--outdir', output_dir, input_path],
                check=True,
                capture_output=True,
                text=True,
                timeout=120,
                env=env
            )
            
            # LibreOffice生成的文件名是原文件名.pdf
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            generated_pdf = os.path.join(output_dir, f"{base_name}.pdf")
            
            if os.path.exists(generated_pdf):
                if generated_pdf != output_path:
                    shutil.move(generated_pdf, output_path)
            else:
                raise Exception("LibreOffice未生成PDF文件")
                
        except subprocess.TimeoutExpired:
            raise Exception("LibreOffice转换超时（120秒）")
        except subprocess.CalledProcessError as e:
            raise Exception(f"LibreOffice错误: {e.stderr}")
    
    def _convert_with_com(self, input_path, output_path, ext):
        """使用COM转换（Windows备选，需要Office）
        
        复用 Word/Excel/PowerPoint 单例实例，避免每个文件都启动新进程。
        使用线程锁保证 COM 调用的线程安全。
        """
        import comtypes.client
        import pythoncom
        
        # COM 接口要求绝对路径
        input_path = os.path.abspath(str(input_path))
        output_path = os.path.abspath(str(output_path))
        
        # 初始化 COM（每个线程都需要初始化一次）
        pythoncom.CoInitialize()
        
        try:
            if ext in ['.doc', '.docx']:
                app = _get_word_app()
                try:
                    doc = app.Documents.Open(input_path, ReadOnly=True, Visible=False)
                    try:
                        doc.SaveAs(output_path, FileFormat=17)
                    finally:
                        doc.Close(SaveChanges=0)
                except Exception as doc_err:
                    # 文档打开/保存失败，回收这个实例并抛出异常
                    print(f"[COM] Word 文档操作失败: {doc_err}")
                    _release_word_app(force=True)
                    raise
            elif ext in ['.xls', '.xlsx']:
                app = _get_excel_app()
                try:
                    wb = app.Workbooks.Open(input_path, ReadOnly=True)
                    try:
                        wb.ExportAsFixedFormat(0, output_path)
                    finally:
                        wb.Close(SaveChanges=0)
                except Exception as wb_err:
                    print(f"[COM] Excel 工作簿操作失败: {wb_err}")
                    _release_excel_app(force=True)
                    raise
            elif ext in ['.ppt', '.pptx']:
                app = _get_ppt_app()
                try:
                    pres = app.Presentations.Open(input_path, ReadOnly=True, WithWindow=False)
                    try:
                        pres.SaveAs(output_path, 32)
                    finally:
                        pres.Close()
                except Exception as pres_err:
                    print(f"[COM] PowerPoint 演示文稿操作失败: {pres_err}")
                    _release_ppt_app(force=True)
                    raise
        finally:
            pythoncom.CoUninitialize()


# ============================================================================
# COM 单例管理（进程级别复用 Office 实例）
# ============================================================================

_com_lock = threading.Lock()

# Word 单例
_word_app = None
_word_lock = threading.Lock()
_word_init_thread = None  # 哪个线程初始化的，只有同线程才能用

# Excel 单例
_excel_app = None
_excel_lock = threading.Lock()
_excel_init_thread = None

# PowerPoint 单例
_ppt_app = None
_ppt_lock = threading.Lock()
_ppt_init_thread = None


def _get_word_app():
    """获取或创建 Word COM 单例（线程安全）"""
    global _word_app, _word_init_thread
    import comtypes.client
    
    with _word_lock:
        # 如果不是同一线程初始化的，需要回收重建
        if _word_app is not None and _word_init_thread != threading.current_thread():
            _release_word_app(force=True)
        
        if _word_app is None:
            print("[COM] 创建新的 Word.Application 实例")
            _word_app = comtypes.client.CreateObject('Word.Application')
            _word_app.Visible = False
            _word_app.DisplayAlerts = 0  # 关闭警告弹窗
            _word_init_thread = threading.current_thread()
        return _word_app


def _release_word_app(force=False):
    """释放 Word COM 实例"""
    global _word_app, _word_init_thread
    with _word_lock:
        if _word_app is not None:
            try:
                _word_app.Quit()
            except:
                pass
            _word_app = None
            _word_init_thread = None
            if force:
                # 强制杀死残留的 WINWORD.EXE 进程
                _kill_process('WINWORD.EXE')
            print("[COM] Word.Application 实例已释放")


def _get_excel_app():
    """获取或创建 Excel COM 单例（线程安全）"""
    global _excel_app, _excel_init_thread
    import comtypes.client
    
    with _excel_lock:
        if _excel_app is not None and _excel_init_thread != threading.current_thread():
            _release_excel_app(force=True)
        
        if _excel_app is None:
            print("[COM] 创建新的 Excel.Application 实例")
            _excel_app = comtypes.client.CreateObject('Excel.Application')
            _excel_app.Visible = False
            _excel_app.DisplayAlerts = False
            _excel_init_thread = threading.current_thread()
        return _excel_app


def _release_excel_app(force=False):
    """释放 Excel COM 实例"""
    global _excel_app, _excel_init_thread
    with _excel_lock:
        if _excel_app is not None:
            try:
                _excel_app.Quit()
            except:
                pass
            _excel_app = None
            _excel_init_thread = None
            if force:
                _kill_process('EXCEL.EXE')
            print("[COM] Excel.Application 实例已释放")


def _get_ppt_app():
    """获取或创建 PowerPoint COM 单例（线程安全）"""
    global _ppt_app, _ppt_init_thread
    import comtypes.client
    
    with _ppt_lock:
        if _ppt_app is not None and _ppt_init_thread != threading.current_thread():
            _release_ppt_app(force=True)
        
        if _ppt_app is None:
            print("[COM] 创建新的 PowerPoint.Application 实例")
            _ppt_app = comtypes.client.CreateObject('PowerPoint.Application')
            _ppt_app.Visible = False  # PowerPoint 可能不支持 Visible=False，忽略错误
            _ppt_init_thread = threading.current_thread()
        return _ppt_app


def _release_ppt_app(force=False):
    """释放 PowerPoint COM 实例"""
    global _ppt_app, _ppt_init_thread
    with _ppt_lock:
        if _ppt_app is not None:
            try:
                _ppt_app.Quit()
            except:
                pass
            _ppt_app = None
            _ppt_init_thread = None
            if force:
                _kill_process('POWERPNT.EXE')
            print("[COM] PowerPoint.Application 实例已释放")


def _kill_process(process_name):
    """强制终止指定进程（Windows）"""
    if platform.system() != 'Windows':
        return
    try:
        import subprocess
        subprocess.run(['taskkill', '/F', '/IM', process_name],
                      capture_output=True, timeout=10)
    except Exception as e:
        print(f"[COM] 终止进程 {process_name} 失败: {e}")


def release_all_com_apps():
    """释放所有 COM 实例（用于应用关闭时清理）"""
    _release_word_app()
    _release_excel_app()
    _release_ppt_app()
    
    def convert_first_page_fast(self, input_path, output_path):
        """快速转换文档的第一页（用于大文件预览）
        
        使用LibreOffice的PageRange参数只转换第一页，速度更快
        
        Args:
            input_path: 输入文档路径
            output_path: 输出PDF路径
            
        Returns:
            bool: 是否成功
        """
        if not self._check_libreoffice():
            raise Exception("LibreOffice未安装")
        
        libreoffice_cmd = 'soffice' if shutil.which('soffice') else 'libreoffice'
        
        try:
            output_dir = os.path.dirname(output_path)
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            
            # 构建环境变量（同 _convert_with_libreoffice）
            env = os.environ.copy()
            env.setdefault('LANG', 'zh_CN.UTF-8')
            env.setdefault('LC_ALL', 'zh_CN.UTF-8')
            env.setdefault('LC_CTYPE', 'zh_CN.UTF-8')
            if 'HOME' not in env or not env['HOME']:
                env['HOME'] = '/root'
            
            # 使用PageRange参数只转换第一页
            # LibreOffice PDF导出参数：PageRange=1-1 表示只转第1页
            result = subprocess.run(
                [libreoffice_cmd, '--headless', '--convert-to', 'pdf:draw_pdf_Export:PageRange=1-1',
                 '--outdir', output_dir, input_path],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,  # 第一页转换超时30秒
                env=env
            )
            
            generated_pdf = os.path.join(output_dir, f"{base_name}.pdf")
            
            if os.path.exists(generated_pdf):
                if generated_pdf != output_path:
                    shutil.move(generated_pdf, output_path)
                return True
            else:
                raise Exception("未生成PDF文件")
                
        except subprocess.TimeoutExpired:
            raise Exception("第一页转换超时")
        except subprocess.CalledProcessError as e:
            raise Exception(f"LibreOffice错误: {e.stderr}")
    
    def extract_pdf_pages(self, input_pdf, output_pdf, pages):
        """从PDF中提取指定页面
        
        Args:
            input_pdf: 输入PDF路径
            output_pdf: 输出PDF路径
            pages: 页码列表，如 [1] 或 [1, -1]（-1表示最后一页）
            
        Returns:
            bool: 是否成功
        """
        try:
            from pypdf import PdfReader, PdfWriter
            
            reader = PdfReader(input_pdf)
            writer = PdfWriter()
            
            total_pages = len(reader.pages)
            
            for page_num in pages:
                # 处理负数（-1表示最后一页）
                if page_num < 0:
                    page_num = total_pages + page_num + 1
                
                # 转换为0-based索引
                idx = page_num - 1
                if 0 <= idx < total_pages:
                    writer.add_page(reader.pages[idx])
            
            with open(output_pdf, 'wb') as f:
                writer.write(f)
            
            return True
            
        except Exception as e:
            print(f"[PDFConversionService] 提取页面失败: {e}")
            # 如果pypdf失败，尝试直接复制原文件
            shutil.copy(input_pdf, output_pdf)
            return True
    
    def get_pdf_page_count(self, pdf_path):
        """获取PDF页数"""
        try:
            from pypdf import PdfReader
            reader = PdfReader(pdf_path)
            return len(reader.pages)
        except:
            return 0
    
    def cleanup(self, file_path):
        """清理临时文件"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except:
            pass
