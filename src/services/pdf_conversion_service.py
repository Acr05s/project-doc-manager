"""PDF转换服务 - 将Office文档转换为PDF"""

import os
import platform
from pathlib import Path
from docx2pdf import convert as docx_to_pdf
import tempfile
import subprocess
from .pdf_conversion_record import pdf_conversion_record

class PDFConversionService:
    """PDF转换服务类"""
    
    def __init__(self):
        """初始化PDF转换服务"""
        self.platform = platform.system()
        self.preview_temp_dir = None
    
    def set_preview_temp_dir(self, temp_dir):
        """设置预览临时目录
        
        Args:
            temp_dir: 临时目录路径
        """
        self.preview_temp_dir = temp_dir
    
    def convert_to_pdf(self, input_path, doc_id=None):
        """将Office文档转换为PDF
        
        Args:
            input_path: 输入文件路径
            doc_id: 文档ID（可选）
            
        Returns:
            str: 转换后的PDF文件路径
        """
        try:
            input_path = str(input_path)
            ext = os.path.splitext(input_path)[1].lower()
            
            # 检查是否已有转换记录
            if doc_id:
                record = pdf_conversion_record.get_record(doc_id)
                if record:
                    pdf_path = record['pdf_path']
                    if os.path.exists(pdf_path):
                        # 更新访问时间
                        pdf_conversion_record.update_access_time(doc_id)
                        print(f"[PDFConversionService] 使用现有PDF文件: {pdf_path}")
                        return pdf_path
            
            # 创建临时PDF文件路径
            if self.preview_temp_dir:
                import uuid
                temp_pdf_path = os.path.join(self.preview_temp_dir, f"{uuid.uuid4()}.pdf")
            else:
                temp_pdf_path = tempfile.mktemp(suffix='.pdf')
            
            # 首先尝试使用libreoffice转换，这是最可靠的方法
            try:
                self._convert_with_libreoffice(input_path, temp_pdf_path)
                return temp_pdf_path
            except Exception as e:
                # LibreOffice转换失败，尝试平台特定的方法
                if self.platform == 'Windows':
                    # Windows平台使用原有方法
                    if ext in ['.docx']:
                        try:
                            docx_to_pdf(input_path, temp_pdf_path)
                        except Exception as e:
                            # docx2pdf失败，抛出异常
                            raise Exception(f"PDF转换失败: {str(e)}")
                    elif ext in ['.doc', '.xls', '.xlsx', '.ppt', '.pptx']:
                        # Windows平台使用COM对象
                        try:
                            import comtypes.client
                            self._convert_with_com(input_path, temp_pdf_path, ext)
                        except ImportError:
                            # COM不可用，抛出异常
                            raise Exception(f"PDF转换失败: COM对象不可用")
                        except Exception as e:
                            # COM转换失败，抛出异常
                            raise Exception(f"PDF转换失败: {str(e)}")
                    else:
                        raise ValueError(f"不支持的文件类型: {ext}")
                else:
                    # 非Windows平台，LibreOffice转换失败，抛出异常
                    raise Exception(f"PDF转换失败: {str(e)}")
            
            # 添加转换记录
            if doc_id:
                pdf_conversion_record.add_record(doc_id, temp_pdf_path, input_path)
                print(f"[PDFConversionService] 添加转换记录: {doc_id} -> {temp_pdf_path}")
            
            return temp_pdf_path
        except Exception as e:
            raise Exception(f"PDF转换失败: {str(e)}")
    
    def _convert_with_com(self, input_path, output_path, ext):
        """使用COM对象转换Office文档（Windows专用）"""
        try:
            import comtypes.client
            # 启动相应的Office应用程序
            if ext in ['.doc', '.docx']:
                app = comtypes.client.CreateObject('Word.Application')
                app.Visible = False
                doc = app.Documents.Open(input_path)
                doc.SaveAs(output_path, FileFormat=17)  # 17 = PDF
                doc.Close()
                app.Quit()
            elif ext in ['.xls', '.xlsx']:
                app = comtypes.client.CreateObject('Excel.Application')
                app.Visible = False
                wb = app.Workbooks.Open(input_path)
                wb.ExportAsFixedFormat(0, output_path)  # 0 = PDF
                wb.Close()
                app.Quit()
            elif ext in ['.ppt', '.pptx']:
                app = comtypes.client.CreateObject('PowerPoint.Application')
                app.Visible = False
                pres = app.Presentations.Open(input_path)
                pres.SaveAs(output_path, 32)  # 32 = PDF
                pres.Close()
                app.Quit()
        except Exception as e:
            # 尝试清理COM对象
            try:
                if 'app' in locals():
                    app.Quit()
            except:
                pass
            raise e
    
    def _convert_with_libreoffice(self, input_path, output_path):
        """使用libreoffice转换文档（跨平台）"""
        try:
            # 调用libreoffice命令进行转换
            subprocess.run(
                ['libreoffice', '--headless', '--convert-to', 'pdf', '--outdir', 
                 os.path.dirname(output_path), input_path],
                check=True,
                capture_output=True,
                text=True
            )
            # 重命名输出文件到指定路径
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            generated_pdf = os.path.join(os.path.dirname(output_path), f"{base_name}.pdf")
            if os.path.exists(generated_pdf):
                os.rename(generated_pdf, output_path)
            else:
                raise Exception("LibreOffice转换失败，未生成PDF文件")
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