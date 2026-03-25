# 测试main.py是否能正常导入
import traceback

try:
    print("Testing main.py import...")
    from main import create_app
    print("Successfully imported create_app")
    
    app = create_app()
    print("Successfully created app")
    print("All tests passed!")
except Exception as e:
    print(f"Error: {e}")
    traceback.print_exc()
