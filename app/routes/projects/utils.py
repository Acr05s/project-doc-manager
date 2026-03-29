"""项目路由工具函数"""

doc_manager = None

def init_doc_manager(manager):
    """初始化文档管理器"""
    global doc_manager
    doc_manager = manager

def get_doc_manager():
    """获取文档管理器实例"""
    global doc_manager
    if doc_manager is None:
        raise RuntimeError("DocumentManager not initialized. Call init_doc_manager first.")
    return doc_manager
