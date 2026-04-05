"""PDF转换服务 - 将Office文档转换为PDF（跨平台版）

支持平台：
- Windows/Ubuntu: 优先使用 LibreOffice（无需安装Office）
- 备选方案: docx2pdf（仅Windows，仅docx）
- 备选方案: COM（仅Windows，需要安装Office）

特点：
1. 优先使用LibreOffice，跨平台，速度快
2. 不依赖Microsoft Office
3. 支持国产系统（安装LibreOffice即可）
"""

import os
import platform
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
        
        转换优先级：
        1. LibreOffice（跨平台，推荐）
        2. docx2pdf（仅Windows，仅docx）
        3. COM（仅Windows，需安装Office）
        """
        input_path = str(input_path)
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
            import uuid
            temp_pdf_path = os.path.join(self.preview_temp_dir, f"{uuid.uuid4()}.pdf")
        else:
            temp_pdf_path = tempfile.mktemp(suffix='.pdf')
        
        errors = []
        
        # 1. 优先使用LibreOffice（跨平台，不依赖Office）
        if self._check_libreoffice():
            try:
                self._convert_with_libreoffice(input_path, temp_pdf_path)
                self._save_record(doc_id, temp_pdf_path, input_path)
                return temp_pdf_path
            except Exception as e:
                errors.append(f"LibreOffice: {e}")
                print(f"[PDFConversionService] LibreOffice失败: {e}")
        
        # 2. Windows下尝试docx2pdf（仅docx）
        if self.platform == 'Windows' and ext == '.docx':
            try:
                from docx2pdf import convert
                convert(input_path, temp_pdf_path)
                self._save_record(doc_id, temp_pdf_path, input_path)
                return temp_pdf_path
            except Exception as e:
                errors.append(f"docx2pdf: {e}")
                print(f"[PDFConversionService] docx2pdf失败: {e}")
        
        # 3. Windows下尝试COM（需要安装Office，但会弹窗，不建议在服务器使用）
        # 注意：COM转换会弹出打印机对话框，不适合后台服务
        # 仅在没有其他选择时使用
        if self.platform == 'Windows' and not errors:
            # 只有在前面的方法都没尝试过（理论上不会到这里）才使用COM
            try:
                print("[PDFConversionService] 尝试COM转换（可能弹出打印机对话框）...")
                self._convert_with_com(input_path, temp_pdf_path, ext)
                self._save_record(doc_id, temp_pdf_path, input_path)
                return temp_pdf_path
            except Exception as e:
                errors.append(f"COM: {e}")
                print(f"[PDFConversionService] COM失败: {e}")
        
        # 所有方法都失败，清理临时文件
        if os.path.exists(temp_pdf_path):
            try:
                os.remove(temp_pdf_path)
            except:
                pass
        
        error_msg = "PDF转换失败。"
        if not self._check_libreoffice():
            error_msg += " 未检测到LibreOffice，请安装: https://www.libreoffice.org/download/"
        else:
            error_msg += " 详情: " + "; ".join(errors)
        raise Exception(error_msg)
    
    def _save_record(self, doc_id, pdf_path, input_path):
        """保存转换记录"""
        if doc_id:
            file_mtime = os.path.getmtime(input_path)
            pdf_conversion_record.add_record(doc_id, pdf_path, input_path)
            if doc_id in pdf_conversion_record.records:
                pdf_conversion_record.records[doc_id]['file_mtime'] = file_mtime
                pdf_conversion_record._save_records()
    
    def _convert_with_libreoffice(self, input_path, output_path):
        """使用LibreOffice转换（跨平台，推荐）"""
        libreoffice_cmd = 'soffice' if shutil.which('soffice') else 'libreoffice'
        
        try:
            output_dir = os.path.dirname(output_path)
            
            result = subprocess.run(
                [libreoffice_cmd, '--headless', '--convert-to', 'pdf',
                 '--outdir', output_dir, input_path],
                check=True,
                capture_output=True,
                text=True,
                timeout=60
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
            raise Exception("LibreOffice转换超时")
        except subprocess.CalledProcessError as e:
            raise Exception(f"LibreOffice错误: {e.stderr}")
    
    def _convert_with_com(self, input_path, output_path, ext):
        """使用COM转换（Windows备选，需要Office）"""
        import comtypes.client
        import pythoncom
        
        app = None
        try:
            pythoncom.CoInitialize()
            
            if ext in ['.doc', '.docx']:
                app = comtypes.client.CreateObject('Word.Application')
                app.Visible = False
                doc = app.Documents.Open(input_path)
                doc.SaveAs(output_path, FileFormat=17)
                doc.Close()
                app.Quit()
                
            elif ext in ['.xls', '.xlsx']:
                app = comtypes.client.CreateObject('Excel.Application')
                app.Visible = False
                wb = app.Workbooks.Open(input_path)
                wb.ExportAsFixedFormat(0, output_path)
                wb.Close()
                app.Quit()
                
            elif ext in ['.ppt', '.pptx']:
                app = comtypes.client.CreateObject('PowerPoint.Application')
                app.Visible = False
                pres = app.Presentations.Open(input_path)
                pres.SaveAs(output_path, 32)
                pres.Close()
                app.Quit()
                
        finally:
            if app:
                try:
                    app.Quit()
                except:
                    pass
            try:
                pythoncom.CoUninitialize()
            except:
                pass
    
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
            
            # 使用PageRange参数只转换第一页
            # LibreOffice PDF导出参数：PageRange=1-1 表示只转第1页
            result = subprocess.run(
                [libreoffice_cmd, '--headless', '--convert-to', 'pdf:draw_pdf_Export:PageRange=1-1',
                 '--outdir', output_dir, input_path],
                check=True,
                capture_output=True,
                text=True,
                timeout=30  # 第一页转换超时30秒
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
