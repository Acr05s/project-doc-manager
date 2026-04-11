"""多维报表服务"""

from datetime import datetime
from typing import Dict, List, Any


def _check_doc_completed(req_doc, uploaded_list):
    """检查文档是否完成"""
    doc_name = req_doc.get('name')
    requirement = req_doc.get('requirement', '')
    uploaded = [d for d in uploaded_list if d.get('doc_name') == doc_name]
    has_uploaded = len(uploaded) > 0
    
    has_signature = any(d.get('signer') or d.get('no_signature') for d in uploaded)
    has_seal = any(d.get('has_seal') or d.get('has_seal_marked') or d.get('party_a_seal') or d.get('party_b_seal') or d.get('no_seal') for d in uploaded)
    
    is_completed = has_uploaded
    if requirement:
        if '签名' in requirement and not has_signature:
            is_completed = False
        if '盖章' in requirement and not has_seal:
            is_completed = False
    return is_completed


class ReportService:
    """报表服务"""
    
    REPORT_CONFIGS = {
        'overview': {
            'name': '平台概览',
            'icon': '📊',
            'description': '项目总数、承建单位、验收情况、资料完整率等核心指标'
        },
        'projects': {
            'name': '项目分析',
            'icon': '📁',
            'description': '按状态、承建单位分布的项目统计'
        },
        'organizations': {
            'name': '承建单位分析',
            'icon': '🏢',
            'description': '各承建单位的项目数量、平均资料完整率'
        },
        'documents': {
            'name': '文档分析',
            'icon': '📄',
            'description': '文档完整情况、缺失文档排行'
        },
        'acceptance': {
            'name': '验收分析',
            'icon': '✅',
            'description': '验收进度、待验收项目列表'
        },
        'trends': {
            'name': '趋势分析',
            'icon': '📈',
            'description': '项目创建趋势、验收趋势（按月统计）'
        }
    }
    
    def __init__(self, doc_manager, user_manager):
        self.doc_manager = doc_manager
        self.user_manager = user_manager
    
    def get_report_configs(self) -> List[Dict]:
        """获取所有报表配置"""
        return [
            {'key': k, **v}
            for k, v in self.REPORT_CONFIGS.items()
        ]
    
    def generate_report(self, report_type: str) -> Dict[str, Any]:
        """生成指定类型的报表"""
        if report_type == 'overview':
            return self._overview_report()
        elif report_type == 'projects':
            return self._projects_report()
        elif report_type == 'organizations':
            return self._organizations_report()
        elif report_type == 'documents':
            return self._documents_report()
        elif report_type == 'acceptance':
            return self._acceptance_report()
        elif report_type == 'trends':
            return self._trends_report()
        else:
            return self._overview_report()
    
    def _load_all_project_details(self):
        """加载所有项目详情"""
        all_projects = self.doc_manager.projects.list_all()
        details = []
        for proj_info in all_projects:
            config = self.doc_manager.projects.load(proj_info['id'])
            if config:
                details.append({**proj_info, 'config': config})
        return details
    
    def _overview_report(self):
        """平台概览报表"""
        projects = self._load_all_project_details()
        orgs = self.user_manager.list_organizations()
        
        accepted = partial = pending = 0
        complete = partial_docs = empty = 0
        total_required = total_completed = 0
        
        for p in projects:
            cfg = p['config']
            # 验收
            proj_accepted = cfg.get('acceptance', {}).get('accepted', False)
            cycles_total = cycles_accepted = 0
            for cycle, doc_data in cfg.get('documents', {}).items():
                cycles_total += 1
                if isinstance(doc_data, dict) and doc_data.get('acceptance', {}).get('accepted', False):
                    cycles_accepted += 1
            if proj_accepted:
                accepted += 1
            elif cycles_total > 0 and cycles_accepted > 0:
                partial += 1
            else:
                pending += 1
            
            # 文档
            docs_total = docs_completed = 0
            documents = cfg.get('documents', {})
            for cycle in cfg.get('cycles', []):
                cycle_info = documents.get(cycle, {})
                if not isinstance(cycle_info, dict):
                    continue
                required = cycle_info.get('required_docs', [])
                uploaded = cycle_info.get('uploaded_docs', [])
                for req in required:
                    if _check_doc_completed(req, uploaded):
                        docs_completed += 1
                    docs_total += 1
            
            total_required += docs_total
            total_completed += docs_completed
            if docs_total == 0:
                empty += 1
            elif docs_completed == docs_total:
                complete += 1
            else:
                partial_docs += 1
        
        rate = round(total_completed / total_required * 100, 1) if total_required > 0 else 0
        
        return {
            'total_projects': len(projects),
            'total_organizations': len(orgs),
            'acceptance': {'accepted': accepted, 'partial': partial, 'pending': pending},
            'document_completeness': {
                'complete': complete, 'partial': partial_docs, 'empty': empty,
                'total_required': total_required, 'total_completed': total_completed,
                'completion_rate': rate
            }
        }
    
    def _projects_report(self):
        """项目分析报表"""
        projects = self._load_all_project_details()
        
        status_counts = {'approved': 0, 'pending': 0}
        org_counts = {}
        monthly_counts = {}
        
        for p in projects:
            cfg = p['config']
            status = cfg.get('status', 'approved')
            status_counts[status] = status_counts.get(status, 0) + 1
            
            org = cfg.get('party_b', '未指定')
            org_counts[org] = org_counts.get(org, 0) + 1
            
            created = cfg.get('created_time', '')[:7]  # YYYY-MM
            if created:
                monthly_counts[created] = monthly_counts.get(created, 0) + 1
        
        return {
            'status_distribution': status_counts,
            'organization_distribution': org_counts,
            'monthly_creation': dict(sorted(monthly_counts.items())),
            'total': len(projects)
        }
    
    def _organizations_report(self):
        """承建单位分析报表"""
        projects = self._load_all_project_details()
        orgs = self.user_manager.list_organizations()
        
        org_stats = {}
        for org in orgs:
            org_stats[org['name']] = {
                'project_count': 0,
                'total_docs': 0,
                'completed_docs': 0,
                'accepted_projects': 0
            }
        
        for p in projects:
            cfg = p['config']
            org = cfg.get('party_b', '未指定')
            if org not in org_stats:
                org_stats[org] = {
                    'project_count': 0,
                    'total_docs': 0,
                    'completed_docs': 0,
                    'accepted_projects': 0
                }
            
            org_stats[org]['project_count'] += 1
            if cfg.get('acceptance', {}).get('accepted', False):
                org_stats[org]['accepted_projects'] += 1
            
            documents = cfg.get('documents', {})
            for cycle in cfg.get('cycles', []):
                cycle_info = documents.get(cycle, {})
                if not isinstance(cycle_info, dict):
                    continue
                required = cycle_info.get('required_docs', [])
                uploaded = cycle_info.get('uploaded_docs', [])
                for req in required:
                    org_stats[org]['total_docs'] += 1
                    if _check_doc_completed(req, uploaded):
                        org_stats[org]['completed_docs'] += 1
        
        result = []
        for name, stats in org_stats.items():
            rate = round(stats['completed_docs'] / stats['total_docs'] * 100, 1) if stats['total_docs'] > 0 else 0
            result.append({
                'name': name,
                'project_count': stats['project_count'],
                'completion_rate': rate,
                'accepted_projects': stats['accepted_projects'],
                'total_docs': stats['total_docs'],
                'completed_docs': stats['completed_docs']
            })
        
        result.sort(key=lambda x: x['project_count'], reverse=True)
        return {'organizations': result}
    
    def _documents_report(self):
        """文档分析报表"""
        projects = self._load_all_project_details()
        
        doc_type_stats = {}
        missing_docs = []
        completion_by_cycle = {}
        
        for p in projects:
            cfg = p['config']
            documents = cfg.get('documents', {})
            
            for cycle in cfg.get('cycles', []):
                cycle_info = documents.get(cycle, {})
                if not isinstance(cycle_info, dict):
                    continue
                required = cycle_info.get('required_docs', [])
                uploaded = cycle_info.get('uploaded_docs', [])
                
                if cycle not in completion_by_cycle:
                    completion_by_cycle[cycle] = {'total': 0, 'completed': 0}
                
                for req in required:
                    doc_name = req.get('name', '未命名')
                    doc_type = req.get('type', '其他')
                    if doc_type not in doc_type_stats:
                        doc_type_stats[doc_type] = {'total': 0, 'completed': 0}
                    
                    doc_type_stats[doc_type]['total'] += 1
                    completion_by_cycle[cycle]['total'] += 1
                    
                    if _check_doc_completed(req, uploaded):
                        doc_type_stats[doc_type]['completed'] += 1
                        completion_by_cycle[cycle]['completed'] += 1
                    else:
                        missing_docs.append({
                            'project_name': cfg.get('name'),
                            'project_id': cfg.get('id'),
                            'cycle': cycle,
                            'doc_name': doc_name
                        })
        
        for k in doc_type_stats:
            total = doc_type_stats[k]['total']
            completed = doc_type_stats[k]['completed']
            doc_type_stats[k]['rate'] = round(completed / total * 100, 1) if total > 0 else 0
        
        for k in completion_by_cycle:
            total = completion_by_cycle[k]['total']
            completed = completion_by_cycle[k]['completed']
            completion_by_cycle[k]['rate'] = round(completed / total * 100, 1) if total > 0 else 0
        
        return {
            'doc_type_stats': doc_type_stats,
            'completion_by_cycle': completion_by_cycle,
            'missing_docs_top': missing_docs[:20],
            'total_missing': len(missing_docs)
        }
    
    def _acceptance_report(self):
        """验收分析报表"""
        projects = self._load_all_project_details()
        
        accepted_projects = []
        pending_projects = []
        acceptance_by_month = {}
        
        for p in projects:
            cfg = p['config']
            acceptance = cfg.get('acceptance', {})
            
            info = {
                'id': cfg.get('id'),
                'name': cfg.get('name'),
                'party_b': cfg.get('party_b', '未指定'),
                'accepted_time': acceptance.get('accepted_time'),
                'accepted_by': acceptance.get('accepted_by')
            }
            
            if acceptance.get('accepted', False):
                accepted_projects.append(info)
                month = (acceptance.get('accepted_time') or '')[:7]
                if month:
                    acceptance_by_month[month] = acceptance_by_month.get(month, 0) + 1
            else:
                # 计算周期验收进度
                documents = cfg.get('documents', {})
                cycles_total = len(cfg.get('cycles', []))
                cycles_accepted = sum(
                    1 for c in cfg.get('cycles', [])
                    if isinstance(documents.get(c), dict) and documents[c].get('acceptance', {}).get('accepted', False)
                )
                info['cycle_progress'] = f"{cycles_accepted}/{cycles_total}"
                info['cycle_rate'] = round(cycles_accepted / cycles_total * 100, 1) if cycles_total > 0 else 0
                pending_projects.append(info)
        
        return {
            'accepted_count': len(accepted_projects),
            'pending_count': len(pending_projects),
            'accepted_projects': accepted_projects[:10],
            'pending_projects': pending_projects[:10],
            'acceptance_by_month': dict(sorted(acceptance_by_month.items()))
        }
    
    def _trends_report(self):
        """趋势分析报表"""
        projects = self._load_all_project_details()
        
        creation_by_month = {}
        acceptance_by_month = {}
        doc_upload_by_month = {}
        
        for p in projects:
            cfg = p['config']
            created_month = (cfg.get('created_time') or '')[:7]
            if created_month:
                creation_by_month[created_month] = creation_by_month.get(created_month, 0) + 1
            
            accepted_time = cfg.get('acceptance', {}).get('accepted_time')
            if accepted_time:
                month = accepted_time[:7]
                acceptance_by_month[month] = acceptance_by_month.get(month, 0) + 1
            
            # 统计文档上传时间（取所有 uploaded_docs 中最新文件的 upload_time）
            documents = cfg.get('documents', {})
            for cycle in cfg.get('cycles', []):
                cycle_info = documents.get(cycle, {})
                if not isinstance(cycle_info, dict):
                    continue
                for doc in cycle_info.get('uploaded_docs', []):
                    upload_time = doc.get('upload_time') or doc.get('created_at')
                    if upload_time:
                        month = upload_time[:7]
                        doc_upload_by_month[month] = doc_upload_by_month.get(month, 0) + 1
        
        # 合并所有月份
        all_months = sorted(set(creation_by_month.keys()) | set(acceptance_by_month.keys()) | set(doc_upload_by_month.keys()))
        
        return {
            'months': all_months,
            'creation': [creation_by_month.get(m, 0) for m in all_months],
            'acceptance': [acceptance_by_month.get(m, 0) for m in all_months],
            'doc_uploads': [doc_upload_by_month.get(m, 0) for m in all_months]
        }
