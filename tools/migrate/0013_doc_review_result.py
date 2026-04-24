"""文档审查结果字段迁移

review_result 字段存储在项目 JSON 文件的 uploaded_docs[] 中，
无需 SQLite schema 变更，此脚本仅记录版本号。
"""


def description():
    return "文档审查结果字段 review_result（JSON存储，无需SQLite变更）"


def upgrade(db_path: str):
    pass
