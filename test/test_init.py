from app.utils.document_manager import DocumentManager

# 测试DocumentManager的初始化
print("测试DocumentManager的初始化...")
try:
    doc_manager = DocumentManager()
    print("DocumentManager初始化成功")
    
    # 测试projects_base_folder属性
    print("测试projects_base_folder属性...")
    projects_base_folder = doc_manager.projects_base_folder
    print(f"projects_base_folder: {projects_base_folder}")
    print(f"projects_base_folder.exists(): {projects_base_folder.exists()}")
    
    # 测试创建项目
    print("测试创建项目...")
    result = doc_manager.create_project("测试项目")
    print(f"创建项目结果: {result}")
    
    print("测试成功！")
except Exception as e:
    print(f"测试失败: {e}")
    import traceback
    traceback.print_exc()
