"""PDF转换服务 - 将Office文档转换为PDF（优化版）

优化点：
1. 优先使用轻量级库（如docx2pdf），避免启动Office应用
2. 优化LibreOffice调用，使用更快的参数
3. 完善的缓存机制，避免重复转换
"""

import os
import platform
from pathlib import Path
import tempfile
import subprocess
import shutil
from .pdf_conversion_record import pdf_conversion_record

class PDFConversionService:
    """PDF转换服务类 - 优化版"""
    
    def __init__(self):
        """初始化PDF转换服务"""
        self.platform = platform.system()
        self.preview_temp_dir = None
        self._libreoffice_available = None  # 缓存可用性检查结果
        self._docx2pdf_available = None
        self._com_available = None
    
    def set_preview_temp_dir(self, temp_dir):
        """设置预览临时目录
        
        Args:
            temp_dir: 临时目录路径
        """
        self.preview_temp_dir = temp_dir
    
    def _check_libreoffice(self):
        """检查LibreOffice是否可用（带缓存）"""
        if self._libreoffice_available is None:
            self._libreoffice_available = bool(
                shutil.which('libreoffice') or shutil.which('soffice')
            )
        return self._libreoffice_available
    
    def _check_docx2pdf(self):
        """检查docx2pdf是否可用（带缓存）"""
        if self._docx2pdf_available is None:
            try:
                import docx2pdf
                self._docx2pdf_available = True
            except ImportError:
                self._docx2pdf_available = False
        return self._docx2pdf_available
    
    def _check_com(self):
        """检查COM是否可用（带缓存）"""
        if self._com_available is None:
            try:
                import comtypes.client
                self._com_available = True
            except ImportError:
                self._com_available = False
        return self._com_available
    
    def convert_to_pdf(self, input_path, doc_id=None):
        """将Office文档转换为PDF（优化版）
        
        Args:
            input_path: 输入文件路径
            doc_id: 文档ID（用于缓存）
            
        Returns:
            str: 转换后的PDF文件路径
        """
        input_path = str(input_path)
        ext = os.path.splitext(input_path)[1].lower()
        
        # 检查是否已有有效的转换记录
        if doc_id:
            record = pdf_conversion_record.get_record(doc_id)
            if record:
                pdf_path = record.get('pdf_path')
                if pdf_path and os.path.exists(pdf_path):
                    # 检查源文件是否更新
                    file_mtime = os.path.getmtime(input_path)
                    record_mtime = record.get('file_mtime', 0)
                    if record_mtime == file_mtime:
                        pdf_conversion_record.update_access_time(doc_id)
                        print(f"[PDFConversionService] 使用缓存的PDF: {pdf_path}")
                        return pdf_path
        
        # 创建临时PDF文件路径
        if self.preview_temp_dir:
            import uuid
            temp_pdf_path = os.path.join(self.preview_temp_dir, f"{uuid.uuid4()}.pdf")
        else:
            temp_pdf_path = tempfile.mktemp(suffix='.pdf')
        
        try:
            # 根据平台和文件类型选择最优的转换方法
            if self.platform == 'Windows':
                self._convert_windows(input_path, temp_pdf_path, ext)
            else:
                self._convert_linux(input_path, temp_pdf_path, ext)
            
            # 添加转换记录
            if doc_id:
                file_mtime = os.path.getmtime(input_path)
                pdf_conversion_record.add_record(doc_id, temp_pdf_path, input_path)
                # 更新文件修改时间
                if doc_id in pdf_conversion_record.records:
                    pdf_conversion_record.records[doc_id]['file_mtime'] = file_mtime
                    pdf_conversion_record._save_records()
                print(f"[PDFConversionService] 转换完成并缓存: {doc_id} -> {temp_pdf_path}")
            
            return temp_pdf_path
            
        except Exception as e:
            # 清理临时文件
            if os.path.exists(temp_pdf_path):
                try:
                    os.remove(temp_pdf_path)
                except:
                    pass
            raise Exception(f"PDF转换失败: {str(e)}")
    
    def _convert_windows(self, input_path, output_path, ext):
        """Windows平台转换（优化顺序）"""
        errors = []
        
        # 1. 对于docx，优先使用docx2pdf（最快，无需启动Office）
        if ext == '.docx':
            try:
                self._convert_with_docx2pdf(input_path, output_path)
                return
            except Exception as e:
                errors.append(f"docx2pdf: {e}")
                print(f"[PDFConversionService] docx2pdf失败，尝试其他方法: {e}")
        
        # 2. 对于所有Office文档，尝试LibreOffice（跨平台，较快）
        if self._check_libreoffice():
            try:
                self._convert_with_libreoffice(input_path, output_path)
                return
            except Exception as e:
                errors.append(f"LibreOffice: {e}")
                print(f"[PDFConversionService] LibreOffice失败，尝试COM: {e}")
        
        # 3. 最后尝试COM（较慢，需要安装Office）
        if ext in ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']:
            if self._check_com():
                try:
                    self._convert_with_com(input_path, output_path, ext)
                    return
                except Exception as e:
                    errors.append(f"COM: {e}")
                    raise Exception(f"; ".join(errors))
            else:
                errors.append("COM: 未安装comtypes或Microsoft Office")
        
        raise Exception(f"没有可用的转换工具: {'; '.join(errors)}")
    
    def _convert_linux(self, input_path, output_path, ext):
        """Linux平台转换"""
        # Linux下主要依赖LibreOffice
        if self._check_libreoffice():
            try:
                self._convert_with_libreoffice(input_path, output_path, ext)
                return
            except Exception as e:
                raise Exception(f"LibreOffice转换失败: {e}")
        else:
            raise Exception("Linux平台需要安装LibreOffice才能转换Office文档")
    
    def _convert_with_docx2pdf(self, input_path, output_path):
        """使用docx2pdf转换（仅Windows，仅docx，最快）"""
        try:
            from docx2pdf import convert
            convert(input_path, output_path)
            print(f"[PDFConversionService] docx2pdf转换成功")
        except Exception as e:
            raise Exception(f"docx2pdf转换失败: {e}")
    
    def _convert_with_com(self, input_path, output_path, ext):
        """使用COM对象转换Office文档（Windows专用，较慢）"""
        import comtypes.client
        import pythoncom
        
        app = None
        try:
            # 初始化COM
            pythoncom.CoInitialize()
            
            if ext in ['.doc', '.docx']:
                app = comtypes.client.CreateObject('Word.Application')
                app.Visible = False
                app.DisplayAlerts = False
                doc = app.Documents.Open(input_path)
                doc.SaveAs(output_path, FileFormat=17)  # 17 = PDF
                doc.Close(SaveChanges=False)
                app.Quit()
                
            elif ext in ['.xls', '.xlsx']:
                app = comtypes.client.CreateObject('Excel.Application')
                app.Visible = False
                app.DisplayAlerts = False
                wb = app.Workbooks.Open(input_path)
                wb.ExportAsFixedFormat(0, output_path)  # 0 = PDF
                wb.Close(SaveChanges=False)
                app.Quit()
                
            elif ext in ['.ppt', '.pptx']:
                app = comtypes.client.CreateObject('PowerPoint.Application')
                app.Visible = False
                app.DisplayAlerts = False
                pres = app.Presentations.Open(input_path)
                pres.SaveAs(output_path, 32)  # 32 = PDF
                pres.Close()
                app.Quit()
            
            print(f"[PDFConversionService] COM转换成功")
            
        except Exception as e:
            # 尝试清理COM对象
            if app:
                try:
                    app.Quit()
                except:
                    pass
            raise e
        finally:
            # 释放COM
            try:
                pythoncom.CoUninitialize()
            except:
                pass
    
    def _convert_with_libreoffice(self, input_path, output_path):
        """使用LibreOffice转换文档（跨平台，较快）"""
        # 确定LibreOffice命令
        libreoffice_cmd = 'soffice' if shutil.which('soffice') else 'libreoffice'
        
        try:
            # 使用优化的参数调用LibreOffice
            # --headless: 无界面模式
            # --convert-to pdf: 转换为PDF
            # --outdir: 输出目录
            output_dir = os.path.dirname(output_path)
            
            result = subprocess.run(
                [libreoffice_cmd, '--headless', '--convert-to', 'pdf', 
                 '--outdir', output_dir, input_path],
                check=True,
                capture_output=True,
                text=True,
                timeout=60  # 设置60秒超时
            )
            
            # LibreOffice生成的文件名是原文件名+.pdf
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            generated_pdf = os.path.join(output_dir, f"{base_name}.pdf")
            
            if os.path.exists(generated_pdf):
                # 重命名为我们想要的输出路径
                if generated_pdf != output_path:
                    shutil.move(generated_pdf, output_path)
            else:
                raise Exception("LibreOffice转换失败，未生成PDF文件")
            
            print(f"[PDFConversionService] LibreOffice转换成功")
            
        except subprocess.TimeoutExpired:
            raise Exception("LibreOffice转换超时（超过60秒）")
        except subprocess.CalledProcessError as e:
            raise Exception(f"LibreOffice转换失败: {e.stderr}")
    
    def cleanup(self, file_path):
        """清理临时文件
        
        Args:
            file_path: 要清理的文件路径
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass
