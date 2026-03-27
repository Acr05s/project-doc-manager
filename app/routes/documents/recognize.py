"""文档智能识别相关路由"""

from flask import request, jsonify
from typing import Dict
from .utils import get_doc_manager


def smart_recognize():
    """智能识别文档属性（签章、盖章等）"""
    try:
        file = request.files.get('file')
        party_a = request.form.get('party_a', '')
        party_b = request.form.get('party_b', '')
        requirement = request.form.get('requirement', '')
        
        if not file:
            return jsonify({'status': 'error', 'message': '未选择文件'}), 400
        
        # 保存临时文件
        import tempfile
        import os
        from pathlib import Path
        
        temp_dir = tempfile.mkdtemp()
        temp_path = Path(temp_dir) / file.filename
        file.save(str(temp_path))
        
        try:
            # 解析需要识别的属性
            attributes_to_recognize = parse_recognition_requirements(requirement)
            
            # 调用智能识别服务，传入动态配置
            result = doc_manager.smart_recognize_document(
                str(temp_path), 
                party_a, 
                party_b,
                attributes_to_recognize
            )
            return jsonify(result)
        finally:
            # 清理临时文件
            if temp_path.exists():
                temp_path.unlink()
            if Path(temp_dir).exists():
                Path(temp_dir).rmdir()
                
    except Exception as e:
        import traceback
        doc_manager.log_operation('智能识别', f'失败: {e}\n{traceback.format_exc()}', 'error')
        return jsonify({'status': 'error', 'message': str(e)}), 500


def parse_recognition_requirements(requirement: str) -> Dict:
    """解析需要识别的属性要求
    
    Args:
        requirement: 要求文本
        
    Returns:
        Dict: 需要识别的属性配置
    """
    attributes = {
        'doc_date': False,
        'sign_date': False,
        'signer': False,
        'has_seal': False,
        'party_a_seal': False,
        'party_b_seal': False,
        'no_seal': False,
        'no_signature': False,
        'other_seal': False,
        'doc_number': False
    }
    
    if not requirement or requirement == '无特殊要求' or requirement == '甲方提供':
        return attributes
    
    req_lower = requirement.lower()
    
    # 日期识别
    if '文档日期' in requirement or '日期' in requirement:
        attributes['doc_date'] = True
    
    if '签字日期' in requirement or '签署日期' in requirement:
        attributes['sign_date'] = True
    
    # 签字人识别
    if '签字' in requirement or '签名' in requirement:
        attributes['signer'] = True
        attributes['no_signature'] = True
    
    # 盖章识别
    if '甲方盖章' in requirement or '甲方章' in requirement:
        attributes['party_a_seal'] = True
        attributes['has_seal'] = True
    
    if '乙方盖章' in requirement or '乙方章' in requirement:
        attributes['party_b_seal'] = True
        attributes['has_seal'] = True
    
    if '盖章' in requirement:
        attributes['has_seal'] = True
        attributes['no_seal'] = True
    
    # 发文号识别
    if '发文号' in requirement or '文号' in requirement:
        attributes['doc_number'] = True
    
    # 其他盖章标注
    if '其它' in requirement or '其他' in requirement or '标注' in requirement:
        attributes['other_seal'] = True
    
    return attributes
