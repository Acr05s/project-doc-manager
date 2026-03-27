"""PDF转换服务 - 将Office文档转换为PDF"""

import os
import platform
from pathlib import Path
from docx2pdf import convert as docx_to_pdf
import tempfile
import subprocess

class PDFConversionService:
    """PDF转换服务类"""
    
    def __init__(self):
        """初始化PDF转换服务"""
        self.platform = platform.system()
    
    def convert_to_pdf(self, input_path):
        """将Office文档转换为PDF
        
        Args:
            input_path: 输入文件路径
            
        Returns:
            str: 转换后的PDF文件路径
        """
        try:
            input_path = str(input_path)
            ext = os.path.splitext(input_path)[1].lower()
            
            # 创建临时PDF文件路径
            temp_pdf_path = tempfile.mktemp(suffix='.pdf')
            
            if self.platform == 'Windows':
                # Windows平台使用原有方法
                if ext in ['.docx']:
                    try:
                        docx_to_pdf(input_path, temp_pdf_path)
                    except Exception as e:
                        # docx2pdf失败，回退到libreoffice
                        self._convert_with_libreoffice(input_path, temp_pdf_path)
                elif ext in ['.doc', '.xls', '.xlsx', '.ppt', '.pptx']:
                    # Windows平台使用COM对象
                    try:
                        import comtypes.client
                        self._convert_with_com(input_path, temp_pdf_path, ext)
                    except ImportError:
                        # COM不可用，回退到libreoffice
                        self._convert_with_libreoffice(input_path, temp_pdf_path)
                    except Exception as e:
                        # COM转换失败，回退到libreoffice
                        self._convert_with_libreoffice(input_path, temp_pdf_path)
                else:
                    raise ValueError(f"不支持的文件类型: {ext}")
            elif self.platform == 'Darwin':
                # macOS平台使用libreoffice
                self._convert_with_libreoffice(input_path, temp_pdf_path)
            else:
                # Linux平台使用libreoffice
                self._convert_with_libreoffice(input_path, temp_pdf_path)
            
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