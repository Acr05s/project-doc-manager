#!/usr/bin/env python3
"""测试项目迁移功能"""

import json
import logging
from pathlib import Path

# 配置日志
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 添加项目根目录到Python路径
import sys
sys.path.insert(0, str(Path(__file__).parent))

from app.utils.document_manager import DocumentManager


def test_migration():
    """测试项目迁移功能"""
    logger.info("开始测试项目迁移功能...")
    
    # 初始化文档管理器
    doc_manager = DocumentManager()
    logger.info("文档管理器初始化完成")
    
    # 获取项目管理器
    if not doc_manager.projects:
        logger.error("项目管理模块不可用")
        return
    
    project_manager = doc_manager.projects
    logger.info("获取项目管理器成功")
    
    # 测试智能党建项目的迁移
    project_id = "project_20260324211200"
    logger.info(f"开始迁移项目: {project_id}")
    
    # 加载项目（触发迁移）
    config = project_manager.load(project_id)
    
    if config:
        logger.info(f"项目加载成功，配置包含 {len(config.get('cycles', []))} 个周期")
        logger.info(f"文档数量: {len(config.get('documents', {}))}")
    else:
        logger.error("项目加载失败")
    
    # 检查智能党建项目的目录结构
    project_name = "智能党建项目"
    project_folder = doc_manager.config.projects_base_folder / project_name
    logger.info(f"检查项目目录: {project_folder}")
    
    if project_folder.exists():
        logger.info("项目目录存在")
        # 检查新的目录结构
        config_folder = project_folder / "config"
        data_folder = project_folder / "data"
        uploads_folder = project_folder / "uploads"
        versions_folder = project_folder / "versions"
        logs_folder = project_folder / "logs"
        
        logger.info(f"config 目录存在: {config_folder.exists()}")
        logger.info(f"data 目录存在: {data_folder.exists()}")
        logger.info(f"uploads 目录存在: {uploads_folder.exists()}")
        logger.info(f"versions 目录存在: {versions_folder.exists()}")
        logger.info(f"logs 目录存在: {logs_folder.exists()}")
        
        # 检查配置文件
        project_info_file = project_folder / "project_info.json"
        logger.info(f"project_info.json 存在: {project_info_file.exists()}")
        
        if project_info_file.exists():
            with open(project_info_file, 'r', encoding='utf-8') as f:
                project_info = json.load(f)
            logger.info(f"项目信息: {project_info.get('name')}")
    else:
        logger.error("项目目录不存在")


if __name__ == "__main__":
    test_migration()
