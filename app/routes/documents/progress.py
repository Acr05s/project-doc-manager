"""文档进度相关路由"""

from flask import request, jsonify
from .utils import get_doc_manager


def get_cycle_progress():
    """获取周期文档完成进度"""
    try:
        cycle = request.args.get('cycle')
        project_id = request.args.get('project_id')
        
        if not cycle:
            return jsonify({'status': 'error', 'message': '缺少cycle参数'}), 400
        
        # 获取文档管理器实例
        doc_manager = get_doc_manager()
        
        # 获取项目配置
        if project_id:
            project = doc_manager.load_project(project_id)
            project_config = project.get('project', {}) if project else {}
        else:
            project_config = getattr(doc_manager, 'current_project', {}) or {}
        
        # 获取该周期的需求文档数
        docs_info = project_config.get('documents', {}).get(cycle, {})
        required_docs = docs_info.get('required_docs', [])
        total_required = len(required_docs)
        
        # 获取已上传的文档
        all_docs = doc_manager.get_documents(cycle, project_id=project_id)
        
        # 已上传文档数（每个文档类型只算1个）
        doc_names = set()
        signer_count = 0
        seal_count = 0
        completed_count = 0  # 完成的文档数
        
        # 如果没有需求文档，直接按已上传文档计算进度
        if total_required == 0:
            for doc in all_docs:
                doc_name = doc.get('doc_name')
                if doc_name:
                    doc_names.add(doc_name)
            total_required = len(doc_names) or 1  # 避免除以0
            completed_count = len(doc_names)
            signer_count = completed_count
            seal_count = completed_count
        else:
            # 按文档名分组已上传的文档
            docs_by_name = {}
            for doc in all_docs:
                doc_name = doc.get('doc_name')
                if doc_name not in docs_by_name:
                    docs_by_name[doc_name] = []
                docs_by_name[doc_name].append(doc)
            
            # 检查每个需求文档的完成状态
            for req_doc in required_docs:
                doc_name = req_doc.get('name', '')
                requirement = req_doc.get('requirement', '').strip()
                has_no_requirement = not requirement
                
                # 更详细的要求识别
                require_signer = '签名' in requirement or '签字' in requirement
                require_seal = '盖章' in requirement or '章' in requirement
                require_party_a_signer = '甲方' in requirement and ('签名' in requirement or '签字' in requirement)
                require_party_b_signer = '乙方' in requirement and ('签名' in requirement or '签字' in requirement)
                require_party_a_seal = '甲方' in requirement and ('盖章' in requirement or '章' in requirement)
                require_party_b_seal = '乙方' in requirement and ('盖章' in requirement or '章' in requirement)
                require_owner_signer = '业主' in requirement and ('签名' in requirement or '签字' in requirement)
                
                uploaded_docs = docs_by_name.get(doc_name, [])
                
                if len(uploaded_docs) > 0:
                    doc_names.add(doc_name)
                    
                    # 无要求时，上传文档就算完成
                    if has_no_requirement:
                        completed_count += 1
                    else:
                        # 有要求时，检查签名和盖章
                        has_signer = any(d.get('signer') for d in uploaded_docs)
                        has_party_a_seal = any(d.get('party_a_seal') for d in uploaded_docs)
                        has_party_b_seal = any(d.get('party_b_seal') for d in uploaded_docs)
                        has_seal = any(d.get('has_seal_marked') or d.get('has_seal') or d.get('party_a_seal') or d.get('party_b_seal') for d in uploaded_docs)
                        
                        # 检查是否满足所有要求
                        all_requirements_met = False
                        
                        # 计算满足的要求数量
                        total_requirements = 0
                        met_requirements = 0
                        
                        if require_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_seal:
                            total_requirements += 1
                            if has_seal:
                                met_requirements += 1
                        if require_party_a_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_party_b_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_owner_signer:
                            total_requirements += 1
                            if has_signer:
                                met_requirements += 1
                        if require_party_a_seal:
                            total_requirements += 1
                            if has_party_a_seal:
                                met_requirements += 1
                        if require_party_b_seal:
                            total_requirements += 1
                            if has_party_b_seal:
                                met_requirements += 1
                        
                        # 判断是否满足所有要求
                        if has_no_requirement:
                            # 无要求，有文档就算完成
                            all_requirements_met = True
                        elif total_requirements > 0:
                            # 有具体要求，需要满足所有要求
                            all_requirements_met = (met_requirements == total_requirements)
                        else:
                            # 有要求但未识别出具体类型，默认只要有文档就算完成
                            # 与前端逻辑保持一致
                            all_requirements_met = True
                        
                        if all_requirements_met:
                            completed_count += 1
                        
                        # 统计满足要求的文档
                        if not require_signer or has_signer:
                            signer_count += 1
                        if not require_seal or has_seal:
                            seal_count += 1
        
        doc_count = len(doc_names)
        
        return jsonify({
            'status': 'success',
            'doc_count': doc_count,
            'signer_count': signer_count,
            'seal_count': seal_count,
            'total_required': total_required,
            'completed_count': completed_count
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500