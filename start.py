#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Project Document Manager - Launcher
Handles environment initialization and application startup
"""

import os
import sys
import subprocess
import webbrowser
import time
import threading
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def check_python():
    """Check if Python is installed"""
    try:
        result = subprocess.run([sys.executable, '--version'], 
                              capture_output=True, text=True)
        print(f"[OK] Python detected: {result.stdout.strip()}")
        return True
    except:
        print("[ERROR] Python not detected. Please install Python 3.8+")
        print("Download: https://www.python.org/downloads/")
        input("Press Enter to exit...")
        return False

def check_dependencies(python_path):
    """Check if required dependencies are installed"""
    check_script = "import flask; import waitress; print('OK')"
    result = subprocess.run([python_path, '-c', check_script],
                          capture_output=True, text=True)
    return result.returncode == 0 and 'OK' in result.stdout

def setup_environment():
    """Setup runtime environment"""
    app_dir = Path(__file__).parent.absolute()
    os.chdir(app_dir)
    
    # Get venv paths
    venv_dir = app_dir / 'venv'
    if sys.platform == 'win32':
        python_path = venv_dir / 'Scripts' / 'python.exe'
        pip_path = venv_dir / 'Scripts' / 'pip.exe'
    else:
        python_path = venv_dir / 'bin' / 'python'
        pip_path = venv_dir / 'bin' / 'pip'
    
    # Check if venv exists
    if not venv_dir.exists():
        print("=" * 60)
        print("[INFO] Virtual environment not found.")
        print("=" * 60)
        print()
        print("Please install dependencies first by running:")
        print("  install.bat")
        print()
        print("Or manually:")
        print("  python -m venv venv")
        print("  venv\\Scripts\\pip install -r requirements.txt")
        print()
        print("=" * 60)
        raise Exception("Virtual environment not found")
    
    # Check if dependencies are installed
    if not check_dependencies(python_path):
        print("=" * 60)
        print("[INFO] Dependencies not installed or incomplete.")
        print("=" * 60)
        print()
        print("Please install dependencies by running:")
        print("  install.bat")
        print()
        print("Or manually:")
        print("  venv\\Scripts\\pip install -r requirements.txt")
        print()
        print("=" * 60)
        raise Exception("Dependencies not installed")
    
    return str(python_path)

def initialize_directories():
    """Initialize data directories"""
    dirs = ['projects', 'uploads', 'logs']
    for dir_name in dirs:
        os.makedirs(dir_name, exist_ok=True)
    print("[OK] Data directories initialized")

def open_browser_when_ready(port, max_wait=30):
    """Open browser when server is ready"""
    import urllib.request
    url = f"http://localhost:{port}"
    
    for _ in range(max_wait):
        try:
            urllib.request.urlopen(url, timeout=1)
            print("\n[OK] Server is ready!")
            print(f"[OK] Opening browser: {url}")
            webbrowser.open(url)
            return True
        except:
            time.sleep(0.5)
    return False

def start_application(python_path, port=5000, threads=10):
    """
    Start application using production WSGI server
    """
    print("\nStarting Project Document Manager...")
    print("=" * 60)
    
    is_windows = sys.platform == 'win32'
    server_name = "Waitress (Windows)" if is_windows else "Gunicorn (Linux/Mac)"
    
    print(f"   Production Server Mode ({server_name})")
    print(f"   Port: {port}")
    print("=" * 60)
    print()
    print("Starting server... Please wait...")
    print("(Browser will open automatically when ready)")
    print()
    
    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    env['FLASK_ENV'] = 'production'
    
    # Start server in production mode
    process = subprocess.Popen(
        [python_path, 'main.py', '--mode=prod', f'--port={port}', f'--threads={threads}'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        env=env,
        bufsize=1,
        universal_newlines=True
    )
    
    # Start browser opening thread
    browser_thread = threading.Thread(target=open_browser_when_ready, args=(port,))
    browser_thread.daemon = True
    browser_thread.start()
    
    # Read and display output
    try:
        while True:
            line = process.stdout.readline()
            if not line:
                break
            print(line, end='')
            
            # Check for critical errors
            if 'ModuleNotFoundError' in line or 'ImportError' in line:
                print("\n[ERROR] Missing dependency detected!")
                print("Please run: install.bat")
                process.terminate()
                return None
    except KeyboardInterrupt:
        pass
    
    return process

def main():
    """Main function"""
    is_windows = sys.platform == 'win32'
    os_name = "Windows" if is_windows else "Linux/Mac"
    
    print("=" * 60)
    print("   Project Document Manager v2.1.1B")
    print(f"   Platform: {os_name}")
    print("=" * 60 + "\n")
    
    # Check Python
    if not check_python():
        return
    
    # Setup environment
    try:
        python_path = setup_environment()
    except Exception as e:
        print(f"\n[ERROR] {e}")
        print("\n" + "=" * 60)
        print("First-time setup required:")
        print("=" * 60)
        print()
        print("1. Run install.bat (recommended)")
        print("   Or manually:")
        print("   python -m venv venv")
        print("   venv\\Scripts\\pip install -r requirements.txt")
        print()
        print("2. Then run start.bat")
        print()
        print("=" * 60)
        input("\nPress Enter to exit...")
        return
    
    # Initialize directories
    initialize_directories()
    
    # Start application
    process = None
    try:
        process = start_application(python_path, port=5000, threads=10)
        if process:
            process.wait()
    except KeyboardInterrupt:
        print("\n\nStopping server...")
        if process:
            process.terminate()
        print("[OK] Server stopped")
    except Exception as e:
        print(f"\n[ERROR] Runtime error: {e}")
        input("\nPress Enter to exit...")

if __name__ == '__main__':
    main()
