"""迁移工具公共函数"""


def _check_table_exists(conn, table_name):
    """检查表是否存在
    
    Args:
        conn: SQLite连接对象
        table_name: 表名
    
    Returns:
        bool: 表是否存在
    """
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return bool(cursor.fetchone())
