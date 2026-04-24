"""多维报表服务"""

from datetime import datetime, timedelta
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
    
    def __init__(self, doc_manager, user_manager, user_context=None):
        self.doc_manager = doc_manager
        self.user_manager = user_manager
        self.user_context = user_context  # {'id': int, 'role': str, 'organization': str}
    
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
        """加载所有项目详情（根据用户权限过滤）"""
        # 管理员、PMO、PMO负责人可以看到所有项目
        if self.user_context and self.user_context.get('role') not in ('admin', 'pmo', 'pmo_leader', None):
            accessible = self.doc_manager.get_user_accessible_projects(
                self.user_context['id'],
                self.user_context['role'],
                self.user_context.get('organization', '')
            )
            accessible_ids = {p['id'] for p in accessible}
            all_projects = self.doc_manager.projects.list_all()
            details = []
            for proj_info in all_projects:
                if proj_info['id'] not in accessible_ids:
                    continue
                config = self.doc_manager.projects.load(proj_info['id'])
                if config:
                    details.append({**proj_info, 'config': config})
            return details

        all_projects = self.doc_manager.projects.list_all()
        details = []
        for proj_info in all_projects:
            config = self.doc_manager.projects.load(proj_info['id'])
            if config:
                details.append({**proj_info, 'config': config})
        return details
    
    def _load_project_docs_metadata(self):
        """轻量级加载项目文档元数据（仅用于 get_doc_changes，避免加载完整配置）"""
        all_projects = self.doc_manager.projects.list_all()
        results = []
        for proj_info in all_projects:
            pid = proj_info['id']
            # 权限检查
            if self.user_context and self.user_context.get('role') not in ('admin', 'pmo', 'pmo_leader', None):
                cfg = self.doc_manager.projects.load(pid)
                if not cfg:
                    continue
                party_b = cfg.get('party_b', '')
                creator_id = cfg.get('creator_id', 0)
                user_id = self.user_context['id']
                user_org = self.user_context.get('organization', '')
                user_role = self.user_context['role']
                # contractor 只能看 approved 项目和自己的项目
                if user_role == 'contractor':
                    status = cfg.get('status', 'approved')
                    if status != 'approved' and creator_id != user_id and party_b != user_org:
                        continue
                # project_admin 只能看自己创建或自己单位的项目
                elif user_role == 'project_admin':
                    if creator_id != user_id and party_b != user_org:
                        continue
                results.append({
                    'id': pid,
                    'name': cfg.get('name', pid),
                    'cycles': cfg.get('cycles', []),
                    'documents': cfg.get('documents', {})
                })
            else:
                # 管理员/PMO: 只加载 cycles 和 documents，不加载完整 requirements
                cfg = self.doc_manager.projects.load(pid)
                if cfg:
                    results.append({
                        'id': pid,
                        'name': cfg.get('name', pid),
                        'cycles': cfg.get('cycles', []),
                        'documents': cfg.get('documents', {})
                    })
        return results
    
    def _overview_report(self):
        """平台概览报表"""
        projects = self._load_all_project_details()
        
        # 管理员、PMO、PMO负责人看到全部承建单位，其他角色只看到涉及自己的
        if self.user_context and self.user_context.get('role') not in ('admin', 'pmo', 'pmo_leader', None):
            org_set = set()
            for p in projects:
                pb = p['config'].get('party_b', '')
                if pb:
                    org_set.add(pb)
            total_organizations = len(org_set)
        else:
            orgs = self.user_manager.list_organizations()
            total_organizations = len(orgs)
        
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
            'total_organizations': total_organizations,
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

        # 非管理员/PMO 只能看到本单位数据
        my_org = None
        if self.user_context and self.user_context.get('role') not in ('admin', 'pmo', 'pmo_leader', None):
            my_org = self.user_context.get('organization', '') or ''

        if my_org is not None:
            # 承建单位用户或项目经理：只展示本单位
            org_stats = {my_org: {
                'project_count': 0,
                'total_docs': 0,
                'completed_docs': 0,
                'accepted_projects': 0
            }}
        else:
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
            # 非管理员只统计本单位的项目
            if my_org is not None and org != my_org:
                continue
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
        review_total = 0
        review_filled = 0

        for p in projects:
            cfg = p['config']
            documents = cfg.get('documents', {})

            for cycle in cfg.get('cycles', []):
                cycle_info = documents.get(cycle, {})
                if not isinstance(cycle_info, dict):
                    continue
                required = cycle_info.get('required_docs', [])
                uploaded = cycle_info.get('uploaded_docs', [])

                # 统计审查结果填写情况
                for doc in uploaded:
                    review_total += 1
                    if doc.get('review_result', '').strip():
                        review_filled += 1

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
            'total_missing': len(missing_docs),
            'review_stats': {
                'total': review_total,
                'filled': review_filled,
                'rate': round(review_filled / review_total * 100, 1) if review_total > 0 else 0,
            }
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

    def get_doc_changes(self, period: str = 'day') -> Dict[str, Any]:
        """获取文档变化统计数据（真实数据）

        Args:
            period: day / 3days / 7days / month

        Returns:
            {labels, added, updated, deleted, details}
        """
        now = datetime.now()
        period_map = {'day': 1, '3days': 3, '7days': 7, 'month': 30}
        days = period_map.get(period, 1)
        cutoff = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

        # 生成日期标签
        date_labels = []
        for i in range(days):
            d = cutoff + timedelta(days=i + 1)
            date_labels.append(d.strftime('%m-%d'))
        if days == 1:
            date_labels = [now.strftime('%m-%d')]
            cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # 按日期统计
        added_by_date = {lbl: 0 for lbl in date_labels}
        updated_by_date = {lbl: 0 for lbl in date_labels}
        deleted_by_date = {lbl: 0 for lbl in date_labels}
        details = []

        projects = self._load_project_docs_metadata()
        for p in projects:
            project_id = p.get('id', '')
            project_name = p.get('name', project_id)
            documents = p.get('documents', {})

            for cycle in p.get('cycles', []):
                cycle_info = documents.get(cycle, {})
                if not isinstance(cycle_info, dict):
                    continue
                uploaded_docs = cycle_info.get('uploaded_docs', [])
                # 统计每个文档名出现次数来判断新增/更新
                doc_name_counts = {}
                for doc in uploaded_docs:
                    dn = str(doc.get('doc_name', '')).strip()
                    if not dn:
                        continue
                    doc_name_counts[dn] = doc_name_counts.get(dn, 0) + 1

                seen_in_period = {}
                for doc in uploaded_docs:
                    upload_time_str = str(doc.get('upload_time', '')).strip()
                    if not upload_time_str:
                        continue
                    ut = self._parse_upload_time(upload_time_str)
                    if ut is None or ut < cutoff:
                        continue

                    dn = str(doc.get('doc_name', '')).strip()
                    if not dn:
                        continue
                    date_key = ut.strftime('%m-%d')
                    if date_key not in added_by_date:
                        continue

                    is_update = doc_name_counts.get(dn, 1) > 1 and dn in seen_in_period
                    seen_in_period[dn] = True

                    if is_update:
                        updated_by_date[date_key] = updated_by_date.get(date_key, 0) + 1
                        change_type = 'updated'
                    else:
                        added_by_date[date_key] = added_by_date.get(date_key, 0) + 1
                        change_type = 'added'

                    details.append({
                        'doc_name': dn,
                        'project_name': project_name,
                        'project_id': project_id,
                        'cycle': cycle,
                        'time': ut.strftime('%Y-%m-%d %H:%M:%S'),
                        'type': change_type,
                        'doc_id': doc.get('doc_id', ''),
                        'filename': doc.get('original_filename') or doc.get('filename') or '',
                        'review_result': doc.get('review_result', ''),
                    })

                    # 检查文档属性是否有更新（与上传时间不同才算属性更新）
                    if 'updated_at' in doc:
                        updated_at_str = str(doc.get('updated_at', '')).strip()
                        if updated_at_str and updated_at_str != upload_time_str:
                            updated_at = self._parse_upload_time(updated_at_str)
                            if updated_at and updated_at >= cutoff:
                                date_key2 = updated_at.strftime('%m-%d')
                                if date_key2 in updated_by_date:
                                    updated_by_date[date_key2] = updated_by_date.get(date_key2, 0) + 1
                                details.append({
                                    'doc_name': dn,
                                    'project_name': project_name,
                                    'project_id': project_id,
                                    'cycle': cycle,
                                    'time': updated_at.strftime('%Y-%m-%d %H:%M:%S'),
                                    'type': 'updated',
                                    'doc_id': doc.get('doc_id', ''),
                                    'filename': doc.get('original_filename') or doc.get('filename') or '',
                                    'review_result': doc.get('review_result', ''),
                                })

        # 归档记录 (从 archive_approvals 查询)
        try:
            if self.user_manager and hasattr(self.user_manager, 'db_path'):
                import sqlite3, json as _json
                conn = sqlite3.connect(self.user_manager.db_path)
                conn.row_factory = sqlite3.Row
                cutoff_str = cutoff.strftime('%Y-%m-%d %H:%M:%S')
                # 使用 resolved_at（归档完成时间）而非 created_at（提交时间）
                rows = conn.execute(
                    "SELECT project_id, doc_names, cycle, resolved_at FROM archive_approvals "
                    "WHERE status = 'approved' AND resolved_at IS NOT NULL AND resolved_at >= ? ORDER BY resolved_at DESC",
                    (cutoff_str,)
                ).fetchall()
                conn.close()
                for row in rows:
                    ct = self._parse_upload_time(str(row['resolved_at']))
                    if ct is None:
                        continue
                    date_key = ct.strftime('%m-%d')
                    # doc_names 是 JSON 数组，展开每个文档名
                    raw_names = row['doc_names'] or '[]'
                    try:
                        names = _json.loads(raw_names) if isinstance(raw_names, str) else raw_names
                    except Exception:
                        names = [raw_names]
                    for dname in (names if isinstance(names, list) else [names]):
                        if date_key in deleted_by_date:
                            deleted_by_date[date_key] = deleted_by_date.get(date_key, 0) + 1
                        details.append({
                            'doc_name': str(dname) if dname else '',
                            'project_name': '',
                            'project_id': row['project_id'] or '',
                            'cycle': row['cycle'] or '',
                            'time': ct.strftime('%Y-%m-%d %H:%M:%S'),
                            'type': 'archived',
                            'doc_id': '',
                            'filename': '',
                        })
        except Exception:
            pass

        # 按时间倒序排列
        details.sort(key=lambda x: x.get('time', ''), reverse=True)
        # 限制明细数量
        details = details[:200]

        return {
            'labels': date_labels,
            'added': [added_by_date.get(lbl, 0) for lbl in date_labels],
            'updated': [updated_by_date.get(lbl, 0) for lbl in date_labels],
            'deleted': [deleted_by_date.get(lbl, 0) for lbl in date_labels],
            'details': details,
        }

    @staticmethod
    def _parse_upload_time(value: str):
        """解析上传时间字符串"""
        if not value:
            return None
        s = value.strip()
        candidates = [
            s, s.replace('T', ' '), s.split('.')[0],
            s.replace('T', ' ').split('.')[0],
        ]
        for c in candidates:
            c = c.split('+')[0].split('Z')[0].strip()
            for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                try:
                    return datetime.strptime(c, fmt)
                except Exception:
                    continue
        return None
