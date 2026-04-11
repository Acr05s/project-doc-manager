#!/usr/bin/env python3
"""
诊断脚本：定位 "cannot access local variable 'is'" 错误的来源

使用方法（在远程服务器上运行）：
    cd /path/to/project_doc_manager
    python3 diagnose_is_error.py

或者直接测试 python-magic：
    python3 -c "import magic; print(magic.from_buffer(b'test', mime=True))"
"""
import sys
import os

print("=" * 70)
print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")
print(f"Current directory: {os.getcwd()}")
print("=" * 70)
print()

# ---- 1. 测试所有关键依赖 ----
print("STEP 1: 测试依赖库导入...")
print("-" * 50)

test_imports = [
    ('flask', 'import flask'),
    ('werkzeug', 'import werkzeug'),
    ('jinja2', 'import jinja2'),
    ('pandas', 'import pandas'),
    ('openpyxl', 'import openpyxl'),
    ('docx', 'from docx import Document'),
    ('pptx', 'from pptx import Presentation'),
    ('magic', 'import magic'),                     # 重点！
    ('cv2', 'import cv2'),
    ('PIL', 'from PIL import Image'),
    ('numpy', 'import numpy'),
    ('pytesseract', 'import pytesseract'),
    ('PyPDF2', 'import PyPDF2'),
    ('reportlab', 'import reportlab'),
    ('flasgger', 'import flasgger'),
    ('flask_cors', 'import flask_cors'),
]

failed_imports = []
for name, stmt in test_imports:
    try:
        exec(stmt)
        print(f"  [OK]   {name}")
    except Exception as e:
        print(f"  [FAIL] {name}: {e}")
        failed_imports.append((name, str(e)))
        import traceback
        traceback.print_exc()
        print()

print()
if failed_imports:
    print(f"!! 失败的库: {[f[0] for f in failed_imports]}")
else:
    print("所有依赖导入成功")

# ---- 2. 特别测试 python-magic（重点） ----
print()
print("=" * 70)
print("STEP 2: 测试 python-magic（最可能的错误来源）...")
print("-" * 50)
try:
    import magic
    print(f"  python-magic 版本: {getattr(magic, '__version__', 'unknown')}")
    print(f"  python-magic 文件: {magic.__file__}")
    
    # 测试 from_buffer（这个方法内部可能触发 is 变量错误）
    try:
        result = magic.from_buffer(b"test content", mime=True)
        print(f"  magic.from_buffer(): OK -> {result}")
    except Exception as e:
        print(f"  magic.from_buffer(): FAILED -> {e}")
        import traceback
        traceback.print_exc()
    
    # 测试 from_file
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as f:
            f.write(b"test content for magic")
            tmp = f.name
        result = magic.from_file(tmp, mime=True)
        os.unlink(tmp)
        print(f"  magic.from_file(): OK -> {result}")
    except Exception as e:
        print(f"  magic.from_file(): FAILED -> {e}")
        import traceback
        traceback.print_exc()

    print()
    print("  !! 建议: 项目代码中不使用 python-magic，请在服务器上卸载：")
    print("     pip uninstall python-magic -y")

except ImportError:
    print("  python-magic 未安装（这是正确的状态）")

# ---- 3. 测试 PEP 709 相关模式 ----
print()
print("=" * 70)
print("STEP 3: 测试 PEP 709 (inline comprehensions) 兼容性...")
print("-" * 50)

pep709_tests = [
    ("列表推导式 + is not None", lambda: [x for x in [1, None, 3] if x is not None]),
    ("lambda + is", lambda: (lambda x: x is None)(None)),
    ("嵌套推导式", lambda: {k: v for k, v in {'a': 1, 'b': 2}.items() if v is not None}),
    ("三元表达式 + is", lambda: 'yes' if None is None else 'no'),
]

for name, fn in pep709_tests:
    try:
        result = fn()
        print(f"  [OK]   {name} -> {result}")
    except Exception as e:
        print(f"  [FAIL] {name} -> {e}")
        import traceback
        traceback.print_exc()

# ---- 4. 测试 Flask 应用初始化 ----
print()
print("=" * 70)
print("STEP 4: 测试 Flask 应用初始化...")
print("-" * 50)
try:
    from app import create_app
    print("  [OK]   create_app 导入成功")
    try:
        app = create_app()
        print("  [OK]   Flask app 创建成功")
        
        # 测试路由注册
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        preview_routes = [r for r in rules if 'preview' in r]
        print(f"  [OK]   找到 {len(preview_routes)} 个预览相关路由: {preview_routes[:5]}")
    except Exception as e:
        print(f"  [FAIL] Flask app 创建失败: {e}")
        import traceback
        traceback.print_exc()
except Exception as e:
    print(f"  [FAIL] create_app 导入失败: {e}")
    import traceback
    traceback.print_exc()

# ---- 5. pip list ----
print()
print("=" * 70)
print("STEP 5: 已安装的 Python 包...")
print("-" * 50)
try:
    import subprocess
    result = subprocess.run(
        [sys.executable, '-m', 'pip', 'list', '--format=columns'],
        capture_output=True, text=True, timeout=10
    )
    output = result.stdout
    # 高亮可能的问题包
    for line in output.split('\n'):
        if 'magic' in line.lower() or 'flask' in line.lower() or 'werkzeug' in line.lower():
            print(f"  >>> {line}")
        else:
            print(f"      {line}")
    if result.stderr:
        print(f"  stderr: {result.stderr}")
except Exception as e:
    print(f"  pip list failed: {e}")

print()
print("=" * 70)
print("诊断完成")
print("=" * 70)
print()
print("如果 STEP 2 中 python-magic 导入失败并报 'is' 错误，")
print("请在远程服务器上执行以下命令：")
print()
print("  pip uninstall python-magic python-magic-bin -y")
print("  sudo systemctl restart <你的服务名>")
print()
