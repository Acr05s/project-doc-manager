# 测试环境是否正常
print("Testing Python environment...")

# 检查基本导入
try:
    import sys
    print(f"Python version: {sys.version}")
    
    # 检查Flask
    import flask
    print(f"Flask version: {flask.__version__}")
    
    # 检查其他关键依赖
    import pandas
    print(f"pandas version: {pandas.__version__}")
    
    import openpyxl
    print(f"openpyxl version: {openpyxl.__version__}")
    
    import numpy
    print(f"numpy version: {numpy.__version__}")
    
    import PIL
    print(f"Pillow version: {PIL.__version__}")
    
    print("All dependencies are installed successfully!")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
