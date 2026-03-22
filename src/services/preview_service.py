"""预览服务"""
import base64
import io
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
import logging

from PyPDF2 import PdfReader
from docx import Document
import pandas as pd
from PIL import Image

logger = logging.getLogger(__name__)

class PreviewService:
    """预览服务类"""
    
    @staticmethod
    def convert_pdf_to_images(pdf_path: str, max_pages: int = 10) -> List[str]:
        """将PDF转换为图片（base64编码）
        
        Args:
            pdf_path: PDF文件路径
            max_pages: 最大转换页数
            
        Returns:
            list: base64编码的图片列表
        """
        try:
            images = []
            
            with open(pdf_path, 'rb') as f:
                pdf_reader = PdfReader(f)
                total_pages = len(pdf_reader.pages)
                
                for i in range(min(total_pages, max_pages)):
                    try:
                        page = pdf_reader.pages[i]
                        
                        if '/XObject' in page['/Resources']:
                            xObject = page['/Resources']['/XObject'].get_object()
                            
                            for obj in xObject:
                                if xObject[obj]['/Subtype'] == '/Image':
                                    size = (xObject[obj]['/Width'], xObject[obj]['/Height'])
                                    data = xObject[obj]._data
                                    
                                    if xObject[obj]['/ColorSpace'] == '/DeviceRGB':
                                        mode = "RGB"
                                    else:
                                        mode = "P"
                                    
                                    if '/Filter' in xObject[obj]:
                                        if xObject[obj]['/Filter'] == '/DCTDecode':
                                            img = Image.open(io.BytesIO(data))
                                    else:
                                        img = Image.frombytes(mode, size, data)
                                    
                                    buffered = io.BytesIO()
                                    img.save(buffered, format="PNG")
                                    img_base64 = base64.b64encode(buffered.getvalue()).decode()
                                    images.append(f"data:image/png;base64,{img_base64}")
                    except Exception as e:
                        logger.warning(f"PDF第{i+1}页转换失败: {e}")
                        continue
            
            return images
            
        except Exception as e:
            logger.error(f"PDF转图片失败: {e}")
            return []
    
    @staticmethod
    def convert_docx_to_html(docx_path: str) -> str:
        """将Word文档转换为HTML
        
        Args:
            docx_path: Word文档路径
            
        Returns:
            str: HTML内容
        """
        try:
            doc = Document(docx_path)
            html_content = ['<div class="docx-preview">']
            
            for para in doc.paragraphs:
                text = para.text.strip()
                if text:
                    style = ""
                    if para.style.name.startswith('Heading'):
                        level = para.style.name.replace('Heading ', '')
                        style = f' class="docx-h{level}"'
                    html_content.append(f'<p{style}>{text}</p>')
            
            html_content.append('</div>')
            return '\n'.join(html_content)
            
        except Exception as e:
            logger.error(f"Word转HTML失败: {e}")
            return f'<p class="error">预览失败: {str(e)}</p>'
    
    @staticmethod
    def convert_xlsx_to_html(xlsx_path: str) -> str:
        """将Excel转换为HTML表格
        
        Args:
            xlsx_path: Excel文件路径
            
        Returns:
            str: HTML内容
        """
        try:
            df = pd.read_excel(xlsx_path, nrows=100)
            html_content = ['<div class="xlsx-preview"><table class="data-table">']
            
            html_content.append('<thead><tr>')
            for col in df.columns:
                html_content.append(f'<th>{col}</th>')
            html_content.append('</tr></thead>')
            
            html_content.append('<tbody>')
            for _, row in df.iterrows():
                html_content.append('<tr>')
                for val in row:
                    html_content.append(f'<td>{val}</td>')
                html_content.append('</tr>')
            html_content.append('</tbody></table></div>')
            
            return '\n'.join(html_content)
            
        except Exception as e:
            logger.error(f"Excel转HTML失败: {e}")
            return f'<p class="error">预览失败: {str(e)}</p>'
    
    @staticmethod
    def get_image_preview(image_path: str) -> str:
        """获取图片预览
        
        Args:
            image_path: 图片路径
            
        Returns:
            str: base64编码的图片
        """
        try:
            with open(image_path, 'rb') as f:
                img_data = f.read()
                img_base64 = base64.b64encode(img_data).decode()
                ext = Path(image_path).suffix[1:]
                return f"data:image/{ext};base64,{img_base64}"
        except Exception as e:
            logger.error(f"获取图片预览失败: {e}")
            return ""
    
    @staticmethod
    def get_text_preview(text_path: str) -> str:
        """获取文本文件预览
        
        Args:
            text_path: 文本文件路径
            
        Returns:
            str: 文本内容
        """
        try:
            with open(text_path, 'r', encoding='utf-8', errors='ignore') as f:
                text_content = f.read()
                return text_content
        except Exception as e:
            logger.error(f"获取文本预览失败: {e}")
            return ""
    
    @staticmethod
    def get_document_preview(file_path: str) -> Dict[str, Any]:
        """获取文档预览内容
        
        Args:
            file_path: 文件路径
            
        Returns:
            dict: 预览结果
        """
        try:
            file_ext = Path(file_path).suffix.lower()
            
            if file_ext == '.pdf':
                images = PreviewService.convert_pdf_to_images(file_path)
                return {
                    'status': 'success',
                    'type': 'pdf',
                    'content': images,
                    'total_pages': len(images)
                }
            
            elif file_ext in ['.doc', '.docx']:
                html = PreviewService.convert_docx_to_html(file_path)
                return {
                    'status': 'success',
                    'type': 'docx',
                    'content': html
                }
            
            elif file_ext in ['.xls', '.xlsx']:
                html = PreviewService.convert_xlsx_to_html(file_path)
                return {
                    'status': 'success',
                    'type': 'xlsx',
                    'content': html
                }
            
            elif file_ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
                image_preview = PreviewService.get_image_preview(file_path)
                return {
                    'status': 'success',
                    'type': 'image',
                    'content': image_preview
                }
            
            elif file_ext in ['.txt', '.md', '.json', '.xml', '.html', '.css', '.js']:
                text_content = PreviewService.get_text_preview(file_path)
                return {
                    'status': 'success',
                    'type': 'text',
                    'content': text_content
                }
            
            else:
                return {
                    'status': 'success',
                    'type': 'unsupported',
                    'content': f'暂不支持预览此文件类型（{file_ext}），请下载后查看'
                }
                
        except Exception as e:
            logger.error(f"获取文档预览失败: {e}")
            return {'status': 'error', 'message': f'预览失败: {str(e)}'}
