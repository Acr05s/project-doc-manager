"""插件模块 - 提供插件接口"""

from typing import Dict, Any, Optional
from app.utils.document_manager import DocumentManager

def create_plugin(config: Optional[Dict] = None):
    """创建插件实例"""
    return DocumentManager(config)

def process(data: Any, config: Optional[Dict] = None, params: Optional[Dict] = None) -> Dict[str, Any]:
    """兼容接口"""
    manager = DocumentManager(config)
    
    # params示例: {'action': 'load_project', 'file': 'project.xlsx'}
    action = params.get('action', 'info') if params else 'info'
    
    if action == 'load_project':
        project_file = params.get('file')
        return manager.load_project_config(project_file)
    elif action == 'missing_docs':
        project_config = params.get('project_config')
        return manager.get_missing_documents(project_config)
    else:
        return {
            'name': manager.name,
            'version': manager.version,
            'description': '项目文档管理中心'
        }