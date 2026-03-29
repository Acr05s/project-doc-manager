# -*- coding: utf-8 -*-
"""
项目文档管理中心 - 安装包构建脚本
生成类似安装软件的效果，支持持久化存储和自动升级
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

# 确定项目根目录（包含main.py的目录）
SCRIPT_DIR = Path(__file__).parent.absolute()
PROJECT_ROOT = SCRIPT_DIR.parent

def clean_build_dirs():
    """清理构建目录"""
    os.chdir(PROJECT_ROOT)  # 切换到项目根目录
    dirs_to_clean = ['build', 'dist', 'installer_output']
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            print(f"清理 {dir_name}...")
            shutil.rmtree(dir_name)

def create_directory_structure():
    """创建安装目录结构"""
    dist_base = PROJECT_ROOT / 'dist' / '项目文档管理中心'
    dirs = [
        dist_base,
        dist_base / 'app',
        dist_base / 'app/utils',
        dist_base / 'app/routes',
        dist_base / 'static',
        dist_base / 'static/js/modules',
        dist_base / 'static/css',
        dist_base / 'templates',
        dist_base / 'projects',  # 数据目录
        dist_base / 'uploads',   # 上传目录
    ]
    for dir_path in dirs:
        dir_path.mkdir(parents=True, exist_ok=True)
        print(f"创建目录: {dir_path.relative_to(PROJECT_ROOT)}")

def copy_source_files():
    """复制源文件到安装目录"""
    print("\n复制源文件...")
    
    dist_base = PROJECT_ROOT / 'dist' / '项目文档管理中心'
    
    # Python文件
    shutil.copy(PROJECT_ROOT / 'main.py', dist_base / 'main.py')
    shutil.copy(PROJECT_ROOT / 'requirements.txt', dist_base / 'requirements.txt')
    shutil.copy(PROJECT_ROOT / 'Version.txt', dist_base / 'Version.txt')
    
    # Windows安装脚本
    if (PROJECT_ROOT / 'install.bat').exists():
        shutil.copy(PROJECT_ROOT / 'install.bat', dist_base / 'install.bat')
    if (PROJECT_ROOT / 'install-tsinghua.bat').exists():
        shutil.copy(PROJECT_ROOT / 'install-tsinghua.bat', dist_base / 'install-tsinghua.bat')
    
    # 工具脚本
    tools_src = PROJECT_ROOT / 'tools'
    if tools_src.exists():
        shutil.copytree(tools_src, dist_base / 'tools', dirs_exist_ok=True)
    
    # 静态文件
    shutil.copytree(PROJECT_ROOT / 'static/css', dist_base / 'static/css', dirs_exist_ok=True)
    shutil.copytree(PROJECT_ROOT / 'static/js', dist_base / 'static/js', dirs_exist_ok=True)
    images_src = PROJECT_ROOT / 'static/images'
    if images_src.exists():
        shutil.copytree(images_src, dist_base / 'static/images', dirs_exist_ok=True)
    
    # 模板
    shutil.copytree(PROJECT_ROOT / 'templates', dist_base / 'templates', dirs_exist_ok=True)
    
    # app目录
    shutil.copytree(PROJECT_ROOT / 'app', dist_base / 'app', dirs_exist_ok=True)
    
    print("源文件复制完成")

def create_launcher():
    """创建启动器脚本（支持Windows和Linux）"""
    launcher_code = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
项目文档管理中心 - 启动器
处理环境初始化和程序启动（跨平台支持）
"""

import os
import sys
import subprocess
import webbrowser
import time
from pathlib import Path

def check_python():
    """检查是否已安装Python"""
    try:
        result = subprocess.run([sys.executable, '--version'], 
                              capture_output=True, text=True)
        print(f"[OK] 检测到 {result.stdout.strip()}")
        return True
    except:
        print("[ERROR] 未检测到Python，请先安装Python 3.8+")
        print("下载地址: https://www.python.org/downloads/")
        input("按回车键退出...")
        return False

def setup_environment():
    """设置运行环境"""
    app_dir = Path(__file__).parent.absolute()
    os.chdir(app_dir)
    
    # 创建虚拟环境（如果不存在）
    venv_dir = app_dir / 'venv'
    if not venv_dir.exists():
        print("创建虚拟环境...")
        subprocess.run([sys.executable, '-m', 'venv', 'venv'], check=True)
    
    # 获取虚拟环境的Python和pip路径
    if sys.platform == 'win32':
        python_path = venv_dir / 'Scripts' / 'python.exe'
        pip_path = venv_dir / 'Scripts' / 'pip.exe'
    else:
        python_path = venv_dir / 'bin' / 'python'
        pip_path = venv_dir / 'bin' / 'pip'
    
    # 检查依赖
    print("检查依赖...")
    requirements_file = app_dir / 'requirements.txt'
    if requirements_file.exists():
        subprocess.run([str(pip_path), 'install', '-q', '-r', str(requirements_file)], 
                      check=False)
    
    return str(python_path)

def initialize_directories():
    """初始化数据目录"""
    dirs = ['projects', 'uploads', 'logs']
    for dir_name in dirs:
        os.makedirs(dir_name, exist_ok=True)
    print("[OK] 数据目录初始化完成")

def start_application(python_path, port=5000, threads=10):
    """
    启动应用程序 - 使用生产级WSGI服务器
    
    Args:
        python_path: Python解释器路径
        port: 服务器端口
        threads: 并发线程数（支持多用户并发）
    """
    print("\n启动 项目文档管理中心...")
    print("=" * 60)
    
    # 检测操作系统
    is_windows = sys.platform == 'win32'
    server_name = "Waitress (Windows)" if is_windows else "Gunicorn (Linux/Mac)"
    
    print(f"   生产服务器模式 ({server_name})")
    print("=" * 60)
    
    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    env['FLASK_ENV'] = 'production'
    
    # 使用生产模式启动
    process = subprocess.Popen(
        [python_path, 'main.py', '--mode=prod', f'--port={port}', f'--threads={threads}'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        env=env
    )
    
    # 等待服务启动
    server_started = False
    for line in process.stdout:
        print(line, end='')
        # 检测服务器启动成功标志
        if any(keyword in line for keyword in ['服务地址:', '服务器', 'Waitress', 'Listening']):
            server_started = True
            break
        if 'Error' in line or 'error' in line.lower():
            print(f"\n启动出错: {line}")
            return None
    
    if server_started:
        print("\n" + "=" * 60)
        print("[OK] 生产服务器已启动!")
        print(f"[OK] 监听端口: {port}")
        print(f"[OK] 并发线程: {threads}")
        print(f"[OK] 访问地址: http://localhost:{port}")
        print("\n提示: 支持多用户同时访问")
        print("      按 Ctrl+C 停止服务")
        print("=" * 60)
        time.sleep(1)
        webbrowser.open(f'http://localhost:{port}')
        print("\n")
    
    return process

def main():
    """主函数"""
    # 检测操作系统
    is_windows = sys.platform == 'win32'
    os_name = "Windows" if is_windows else "Linux/Mac"
    
    print("=" * 60)
    print("   项目文档管理中心 v2.1.1B")
    print(f"   运行平台: {os_name}")
    print("   生产服务器模式 (支持多用户并发)")
    print("=" * 60 + "\n")
    
    # 检查Python
    if not check_python():
        return
    
    # 设置环境
    try:
        python_path = setup_environment()
    except Exception as e:
        print(f"环境设置失败: {e}")
        return
    
    # 初始化目录
    initialize_directories()
    
    # 启动应用 - 使用生产服务器，支持多并发
    process = None
    try:
        # 配置：端口5000，10个并发线程
        process = start_application(python_path, port=5000, threads=10)
        if process:
            process.wait()
    except KeyboardInterrupt:
        print("\n\n正在停止服务...")
        if process:
            process.terminate()
        print("[OK] 服务已停止")
    except Exception as e:
        print(f"\n运行出错: {e}")
        input("按回车键退出...")

if __name__ == '__main__':
    main()
'''
    
    dist_base = PROJECT_ROOT / 'dist' / '项目文档管理中心'
    
    # 保存Python启动器（跨平台）
    with open(dist_base / 'start.py', 'w', encoding='utf-8') as f:
        f.write(launcher_code)
    
    # 创建Windows批处理文件
    batch_code = '''@echo off
chcp 65001 >nul
title Project Document Manager
cd /d "%~dp0"
echo Starting Project Document Manager...
echo.
python start.py
pause
'''
    with open(dist_base / 'start.bat', 'w', encoding='utf-8') as f:
        f.write(batch_code)
    
    # 创建Linux/Mac统一启动器（英文文件名，功能完整）
    launcher_sh = '''#!/bin/bash
# ============================================================================
# Project Document Manager - Linux/Mac Launcher
# Version: 2.1.1B
# Features: start, install, restart, stop, logs, upgrade
# ============================================================================

set -e

# 颜色定义
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# 基础配置
APP_NAME="Project Document Manager"
VERSION="2.1.1B"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$APP_DIR/venv"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$APP_DIR/.server.pid"
PORT=5000
THREADS=10

# 显示帮助信息
show_help() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $APP_NAME v$VERSION${NC}"
    echo -e "${BLUE}  Linux/Mac Launcher${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Usage: ./launcher.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start       Start the server (default)"
    echo "  install     Install/Update dependencies"
    echo "  restart     Restart the server"
    echo "  stop        Stop the running server"
    echo "  status      Check server status"
    echo "  logs        View server logs (tail -f)"
    echo "  log         View recent logs (last 50 lines)"
    echo "  upgrade     Check for updates"
    echo "  enable      Install as system service (auto-start on boot)"
    echo "  disable     Remove system service"
    echo "  service     View service status"
    echo "  help        Show this help message"
    echo ""
    echo "Options:"
    echo "  -p, --port PORT     Set server port (default: 5000)"
    echo "  -t, --threads N     Set thread count (default: 10)"
    echo ""
    echo "Examples:"
    echo "  ./launcher.sh start           # Start server"
    echo "  ./launcher.sh start -p 8080   # Start on port 8080"
    echo "  ./launcher.sh logs            # View logs in real-time"
    echo ""
}

# 检查Python环境
check_python() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}[ERROR] Python3 not found!${NC}"
        echo "Please install Python 3.8 or higher:"
        echo "  Ubuntu/Debian: sudo apt install python3 python3-venv python3-pip"
        echo "  CentOS/RHEL:   sudo yum install python3"
        echo "  macOS:         brew install python3"
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo -e "${GREEN}[OK] Python $PYTHON_VERSION detected${NC}"
}

# 创建虚拟环境
setup_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        echo -e "${YELLOW}Creating virtual environment...${NC}"
        python3 -m venv "$VENV_DIR"
    fi
    
    # 获取虚拟环境Python路径
    if [ -f "$VENV_DIR/bin/python" ]; then
        PYTHON_BIN="$VENV_DIR/bin/python"
        PIP_BIN="$VENV_DIR/bin/pip"
    else
        echo -e "${RED}[ERROR] Virtual environment creation failed!${NC}"
        exit 1
    fi
}

# 安装依赖
cmd_install() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Installing Dependencies${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    check_python
    setup_venv
    
    echo -e "${YELLOW}Upgrading pip...${NC}"
    "$PIP_BIN" install --upgrade pip -q
    
    echo -e "${YELLOW}Installing requirements...${NC}"
    if [ -f "$APP_DIR/requirements.txt" ]; then
        "$PIP_BIN" install -r "$APP_DIR/requirements.txt"
        echo -e "${GREEN}[OK] Dependencies installed successfully!${NC}"
    else
        echo -e "${RED}[ERROR] requirements.txt not found!${NC}"
        exit 1
    fi
    
    # 创建必要目录
    mkdir -p "$APP_DIR/projects" "$APP_DIR/uploads" "$APP_DIR/logs"
    echo -e "${GREEN}[OK] Directories initialized${NC}"
}

# 检查服务器状态
check_status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${GREEN}[OK] Server is running (PID: $PID)${NC}"
            echo -e "${BLUE}       Access: http://localhost:$PORT${NC}"
            return 0
        else
            echo -e "${YELLOW}[WARN] Stale PID file found, cleaning up...${NC}"
            rm -f "$PID_FILE"
            return 1
        fi
    else
        echo -e "${YELLOW}[INFO] Server is not running${NC}"
        return 1
    fi
}

# 启动服务器
cmd_start() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $APP_NAME v$VERSION${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # 检查是否已在运行
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}[WARN] Server is already running (PID: $PID)${NC}"
            echo -e "${BLUE}       Access: http://localhost:$PORT${NC}"
            return 0
        fi
    fi
    
    check_python
    
    # 检查虚拟环境
    if [ ! -d "$VENV_DIR" ]; then
        echo -e "${YELLOW}Virtual environment not found, creating...${NC}"
        cmd_install
    fi
    
    setup_venv
    
    # 创建日志目录
    mkdir -p "$LOG_DIR"
    
    echo -e "${GREEN}[OK] Starting server...${NC}"
    echo -e "${BLUE}    Port: $PORT${NC}"
    echo -e "${BLUE}    Threads: $THREADS${NC}"
    echo -e "${BLUE}    Log: $LOG_DIR/server.log${NC}"
    echo ""
    
    # 设置环境变量并启动
    export PYTHONIOENCODING=utf-8
    export FLASK_ENV=production
    export PYTHONUTF8=1
    
    # 后台启动服务器
    nohup "$PYTHON_BIN" "$APP_DIR/main.py" \\
        --mode=prod \\
        --port="$PORT" \\
        --threads="$THREADS" \\
        > "$LOG_DIR/server.log" 2>&1 &
    
    SERVER_PID=$!
    echo $SERVER_PID > "$PID_FILE"
    
    # 等待服务器启动
    echo -n "Waiting for server to start"
    for i in {1..10}; do
        sleep 1
        echo -n "."
        if curl -s http://localhost:$PORT > /dev/null 2>&1; then
            echo ""
            echo -e "${GREEN}[OK] Server started successfully!${NC}"
            echo -e "${BLUE}========================================${NC}"
            echo -e "${BLUE}  Access: http://localhost:$PORT${NC}"
            echo -e "${BLUE}========================================${NC}"
            
            # 尝试自动打开浏览器（桌面环境）
            if command -v xdg-open &> /dev/null; then
                xdg-open "http://localhost:$PORT" 2>/dev/null || true
            elif command -v open &> /dev/null; then
                open "http://localhost:$PORT" 2>/dev/null || true
            fi
            return 0
        fi
    done
    
    echo ""
    echo -e "${YELLOW}[WARN] Server may need more time to start${NC}"
    echo -e "${BLUE}       Check logs: ./launcher.sh logs${NC}"
    return 0
}

# 停止服务器
cmd_stop() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Stopping Server${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}Stopping server (PID: $PID)...${NC}"
            kill "$PID"
            
            # 等待进程结束
            for i in {1..10}; do
                if ! ps -p "$PID" > /dev/null 2>&1; then
                    break
                fi
                sleep 1
            done
            
            # 强制结束如果还在运行
            if ps -p "$PID" > /dev/null 2>&1; then
                echo -e "${YELLOW}Force stopping...${NC}"
                kill -9 "$PID" 2>/dev/null || true
            fi
            
            rm -f "$PID_FILE"
            echo -e "${GREEN}[OK] Server stopped${NC}"
        else
            echo -e "${YELLOW}[WARN] Server not running${NC}"
            rm -f "$PID_FILE"
        fi
    else
        echo -e "${YELLOW}[WARN] PID file not found${NC}"
        # 尝试查找并结束Python进程
        PIDS=$(pgrep -f "main.py" || true)
        if [ -n "$PIDS" ]; then
            echo -e "${YELLOW}Killing processes: $PIDS${NC}"
            echo "$PIDS" | xargs kill -9 2>/dev/null || true
            echo -e "${GREEN}[OK] Server stopped${NC}"
        fi
    fi
}

# 重启服务器
cmd_restart() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Restarting Server${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    cmd_stop
    sleep 2
    cmd_start
}

# 查看日志
cmd_logs() {
    if [ -f "$LOG_DIR/server.log" ]; then
        echo -e "${BLUE}========================================${NC}"
        echo -e "${BLUE}  Server Logs (Press Ctrl+C to exit)${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        tail -f "$LOG_DIR/server.log"
    else
        echo -e "${YELLOW}[WARN] Log file not found: $LOG_DIR/server.log${NC}"
        exit 1
    fi
}

# 查看近期日志
cmd_log() {
    if [ -f "$LOG_DIR/server.log" ]; then
        echo -e "${BLUE}========================================${NC}"
        echo -e "${BLUE}  Recent Logs (Last 50 lines)${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        tail -n 50 "$LOG_DIR/server.log"
    else
        echo -e "${YELLOW}[WARN] Log file not found${NC}"
        exit 1
    fi
}

# 检查升级
cmd_upgrade() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Checking for Updates${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    check_python
    setup_venv
    
    "$PYTHON_BIN" "$APP_DIR/update.py"
}

# 安装系统服务（开机自启）
cmd_enable_service() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Installing System Service${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # 检查是否为root或使用sudo
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}[WARN] This command requires root privileges${NC}"
        echo -e "${YELLOW}       Please run with sudo:${NC}"
        echo -e "       sudo ./launcher.sh enable"
        exit 1
    fi
    
    check_python
    setup_venv
    
    # 确保目录存在
    mkdir -p "$LOG_DIR"
    
    # 创建systemd服务文件
    SERVICE_NAME="doc-manager"
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    
    # 获取当前用户名（用于服务运行）
    CURRENT_USER=${SUDO_USER:-$USER}
    CURRENT_GROUP=$(id -gn "$CURRENT_USER")
    
    echo -e "${YELLOW}Creating systemd service file...${NC}"
    echo -e "${BLUE}Service Name: $SERVICE_NAME${NC}"
    echo -e "${BLUE}User: $CURRENT_USER${NC}"
    echo -e "${BLUE}Port: $PORT${NC}"
    
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Project Document Manager v$VERSION
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
Group=$CURRENT_GROUP
WorkingDirectory=$APP_DIR
Environment=PYTHONIOENCODING=utf-8
Environment=FLASK_ENV=production
Environment=PYTHONUTF8=1
Environment=PATH=$VENV_DIR/bin:/usr/local/bin:/usr/bin:/bin

ExecStart=$VENV_DIR/bin/python $APP_DIR/main.py --mode=prod --port=$PORT --threads=$THREADS
ExecReload=/bin/kill -HUP \$MAINPID
ExecStop=/bin/kill -TERM \$MAINPID

Restart=always
RestartSec=5

# 日志输出
StandardOutput=append:$LOG_DIR/server.log
StandardError=append:$LOG_DIR/server.log

[Install]
WantedBy=multi-user.target
EOF
    
    echo -e "${GREEN}[OK] Service file created: $SERVICE_FILE${NC}"
    
    # 重载systemd配置
    echo -e "${YELLOW}Reloading systemd...${NC}"
    systemctl daemon-reload
    
    # 启用服务（开机自启）
    echo -e "${YELLOW}Enabling service...${NC}"
    systemctl enable "$SERVICE_NAME"
    
    # 启动服务
    echo -e "${YELLOW}Starting service...${NC}"
    systemctl start "$SERVICE_NAME"
    
    sleep 2
    
    # 检查服务状态
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo ""
        echo -e "${GREEN}[OK] Service installed and started successfully!${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo -e "${BLUE}  Service Name: $SERVICE_NAME${NC}"
        echo -e "${BLUE}  Status: Running${NC}"
        echo -e "${BLUE}  Access: http://localhost:$PORT${NC}"
        echo -e "${BLUE}========================================${NC}"
        echo ""
        echo "Service Commands:"
        echo "  sudo systemctl start $SERVICE_NAME    # Start service"
        echo "  sudo systemctl stop $SERVICE_NAME     # Stop service"
        echo "  sudo systemctl restart $SERVICE_NAME  # Restart service"
        echo "  sudo systemctl status $SERVICE_NAME   # View status"
        echo "  sudo journalctl -u $SERVICE_NAME -f   # View logs"
        echo ""
        echo -e "${GREEN}The service will auto-start on boot.${NC}"
    else
        echo -e "${RED}[ERROR] Service failed to start${NC}"
        echo -e "${YELLOW}Check logs: sudo journalctl -u $SERVICE_NAME${NC}"
        exit 1
    fi
}

# 卸载系统服务
cmd_disable_service() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Removing System Service${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # 检查是否为root
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}[WARN] This command requires root privileges${NC}"
        echo -e "${YELLOW}       Please run with sudo:${NC}"
        echo -e "       sudo ./launcher.sh disable"
        exit 1
    fi
    
    SERVICE_NAME="doc-manager"
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    
    # 检查服务是否存在
    if [ ! -f "$SERVICE_FILE" ]; then
        echo -e "${YELLOW}[WARN] Service not found: $SERVICE_NAME${NC}"
        exit 0
    fi
    
    echo -e "${YELLOW}Stopping service...${NC}"
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    
    echo -e "${YELLOW}Disabling service...${NC}"
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    
    echo -e "${YELLOW}Removing service file...${NC}"
    rm -f "$SERVICE_FILE"
    
    echo -e "${YELLOW}Reloading systemd...${NC}"
    systemctl daemon-reload
    
    echo ""
    echo -e "${GREEN}[OK] Service removed successfully!${NC}"
    echo -e "${YELLOW}The service will no longer auto-start on boot.${NC}"
}

# 查看服务状态
cmd_service_status() {
    SERVICE_NAME="doc-manager"
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  System Service Status${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # 检查服务是否存在
    if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
        systemctl status "$SERVICE_NAME" --no-pager
    else
        echo -e "${YELLOW}[INFO] System service not installed${NC}"
        echo ""
        echo "To install as system service:"
        echo "  sudo ./launcher.sh enable"
        echo ""
        # 显示手动运行状态
        check_status
    fi
}

# 解析参数
COMMAND="start"
while [[ $# -gt 0 ]]; do
    case $1 in
        start|install|restart|stop|status|logs|log|upgrade|enable|disable|service|help)
            COMMAND="$1"
            shift
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -t|--threads)
            THREADS="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR] Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# 切换到应用目录
cd "$APP_DIR"

# 执行命令
case $COMMAND in
    start)
        cmd_start
        ;;
    install)
        cmd_install
        ;;
    restart)
        cmd_restart
        ;;
    stop)
        cmd_stop
        ;;
    status)
        check_status
        ;;
    logs)
        cmd_logs
        ;;
    log)
        cmd_log
        ;;
    upgrade)
        cmd_upgrade
        ;;
    enable)
        cmd_enable_service
        ;;
    disable)
        cmd_disable_service
        ;;
    service)
        cmd_service_status
        ;;
    help)
        show_help
        ;;
    *)
        echo -e "${RED}[ERROR] Unknown command: $COMMAND${NC}"
        show_help
        exit 1
        ;;
esac
'''
    
    with open(dist_base / 'launcher.sh', 'w', encoding='utf-8') as f:
        f.write(launcher_sh)
    
    print("启动器创建完成 (Windows + Linux/Mac)")

def create_updater():
    """创建自动升级工具"""
    updater_code = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
项目文档管理中心 - 自动升级工具
从GitHub拉取最新版本
"""

import os
import sys
import json
import shutil
import zipfile
import subprocess
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

GITHUB_REPO = "Acr05s/project-doc-manager"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

def get_current_version():
    """获取当前版本"""
    version_file = Path(__file__).parent / 'Version.txt'
    if version_file.exists():
        return version_file.read_text(encoding='utf-8').strip()
    return "unknown"

def get_latest_version():
    """从GitHub获取最新版本"""
    try:
        req = Request(GITHUB_API_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return {
                'version': data['tag_name'],
                'download_url': data['zipball_url'],
                'published_at': data['published_at'],
                'body': data['body']
            }
    except Exception as e:
        print(f"获取版本信息失败: {e}")
        return None

def download_update(download_url, save_path):
    """下载更新包"""
    try:
        print(f"下载更新包...")
        req = Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=120) as response:
            with open(save_path, 'wb') as f:
                while True:
                    chunk = response.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)
                    print(".", end='', flush=True)
        print("\n✓ 下载完成")
        return True
    except Exception as e:
        print(f"\n✗ 下载失败: {e}")
        return False

def apply_update(zip_path, app_dir):
    """应用更新"""
    try:
        print("解压更新包...")
        temp_dir = app_dir / 'update_temp'
        temp_dir.mkdir(exist_ok=True)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
        
        # 找到解压后的目录
        extracted_dirs = [d for d in temp_dir.iterdir() if d.is_dir()]
        if not extracted_dirs:
            print("✗ 更新包结构错误")
            return False
        
        source_dir = extracted_dirs[0]
        
        # 复制关键文件进行更新（保留用户数据）
        update_files = ['main.py', 'requirements.txt', 'Version.txt', 'app', 'static', 'templates', 'tools']
        for item in update_files:
            src = source_dir / item
            dst = app_dir / item
            if src.exists():
                if dst.exists():
                    if dst.is_dir():
                        shutil.rmtree(dst)
                    else:
                        dst.unlink()
                if src.is_dir():
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)
                print(f"✓ 更新 {item}")
        
        # 清理临时文件
        shutil.rmtree(temp_dir)
        zip_path.unlink()
        
        print("\n✓ 更新应用成功!")
        print("请重新启动程序以使用新版本。")
        return True
        
    except Exception as e:
        print(f"✗ 应用更新失败: {e}")
        return False

def main():
    """主函数"""
    print("=" * 50)
    print("   项目文档管理中心 - 自动升级工具")
    print("=" * 50 + "\n")
    
    app_dir = Path(__file__).parent.absolute()
    current_version = get_current_version()
    
    print(f"当前版本: {current_version}")
    print(f"检查更新中...\n")
    
    latest = get_latest_version()
    if not latest:
        print("✗ 无法获取最新版本信息")
        input("\n按回车键退出...")
        return
    
    print(f"最新版本: {latest['version']}")
    print(f"发布时间: {latest['published_at']}")
    print(f"\n更新说明:")
    print(latest['body'][:500] + "..." if len(latest['body']) > 500 else latest['body'])
    
    if latest['version'] == current_version:
        print("\n✓ 当前已是最新版本!")
        input("\n按回车键退出...")
        return
    
    print("\n发现新版本!")
    choice = input("是否下载更新? (y/n): ").strip().lower()
    
    if choice != 'y':
        print("已取消更新")
        return
    
    # 下载更新
    update_zip = app_dir / 'update.zip'
    if not download_update(latest['download_url'], update_zip):
        input("\n按回车键退出...")
        return
    
    # 应用更新
    if apply_update(update_zip, app_dir):
        # 更新版本号
        version_file = app_dir / 'Version.txt'
        version_file.write_text(latest['version'], encoding='utf-8')
        print(f"\n✓ 版本已更新至 {latest['version']}")
    
    input("\n按回车键退出...")

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n发生错误: {e}")
        input("按回车键退出...")
'''
    
    dist_base = PROJECT_ROOT / 'dist' / '项目文档管理中心'
    with open(dist_base / 'update.py', 'w', encoding='utf-8') as f:
        f.write(updater_code)
    
    # 创建批处理文件
    batch_code = '''@echo off
chcp 65001 >nul
title Check for Updates
cd /d "%~dp0"
python update.py
pause
'''
    with open(dist_base / 'update.bat', 'w', encoding='utf-8') as f:
        f.write(batch_code)
    
    print("升级工具创建完成")

def create_readme():
    """创建README文档（双平台版本）"""
    readme = '''项目文档管理中心 v2.1.1B
================================

系统要求
--------
- Windows 10/11 或 Ubuntu/Linux/macOS
- Python 3.8 或更高版本

安装说明
========

【Windows 系统】
----------------
1. 解压本压缩包到任意目录（建议 D:\项目文档管理中心）
2. 双击运行 "启动程序.bat"
3. 首次运行会自动创建虚拟环境并安装依赖（可能需要几分钟）
4. 浏览器自动打开 http://localhost:5000

【Ubuntu/Linux/macOS 系统】
--------------------------
1. 解压本压缩包到任意目录：
   unzip 项目文档管理中心_v2.1.1B_安装版_*.zip -d doc_manager
   cd doc_manager

2. 安装 Python3（如未安装）：
   # Ubuntu/Debian
   sudo apt update
   sudo apt install python3 python3-venv python3-pip
   
   # CentOS/RHEL
   sudo yum install python3
   
   # macOS
   brew install python3

3. 给启动器添加执行权限：
   chmod +x launcher.sh

4. 使用启动器（推荐）：
   
   查看帮助：
   ./launcher.sh help
   
   首次安装依赖：
   ./launcher.sh install
   
   启动服务：
   ./launcher.sh start
   
   指定端口启动：
   ./launcher.sh start -p 8080
   
   查看状态：
   ./launcher.sh status
   
   查看日志：
   ./launcher.sh logs        # 实时日志
   ./launcher.sh log         # 最近50行
   
   重启服务：
   ./launcher.sh restart
   
   停止服务：
   ./launcher.sh stop
   
   检查更新：
   ./launcher.sh upgrade

5. 浏览器打开 http://localhost:5000

【macOS 系统】
--------------
与 Linux 系统相同，使用 launcher.sh 启动器

目录结构
--------
项目文档管理中心/
├── start.bat             # Windows 启动脚本（双击运行）
├── start.py              # Python 启动器（跨平台）
├── launcher.sh           # Linux/Mac 统一启动器（功能完整）
├── update.bat            # Windows 升级工具
├── update.py             # 升级脚本（跨平台）
├── main.py               # 主程序
├── requirements.txt      # 依赖列表
├── Version.txt           # 版本信息
├── app/                  # 后端代码
├── static/               # 前端资源
├── templates/            # HTML模板
├── tools/                # 工具脚本
├── projects/             # 项目数据（自动创建）
├── uploads/              # 上传文件（自动创建）
├── logs/                 # 日志文件（自动创建）
└── venv/                 # 虚拟环境（自动创建）

Linux/Mac 启动器功能 (launcher.sh)
----------------------------------
统一命令入口，支持以下操作：

  ./launcher.sh start       # 启动服务
  ./launcher.sh install     # 安装依赖
  ./launcher.sh restart     # 重启服务
  ./launcher.sh stop        # 停止服务
  ./launcher.sh status      # 查看状态
  ./launcher.sh logs        # 实时查看日志
  ./launcher.sh log         # 查看最近50行日志
  ./launcher.sh upgrade     # 检查升级
  ./launcher.sh enable      # 安装为系统服务（开机自启）
  ./launcher.sh disable     # 卸载系统服务
  ./launcher.sh service     # 查看服务状态
  ./launcher.sh help        # 显示帮助

参数选项：
  -p, --port PORT     指定端口（默认：5000）
  -t, --threads N     指定线程数（默认：10）

Ubuntu 系统服务（开机自启）
----------------------------
将应用设置为系统服务，实现开机自动启动：

  1. 安装系统服务：
     sudo ./launcher.sh enable

  2. 查看服务状态：
     sudo ./launcher.sh service
     或：sudo systemctl status doc-manager

  3. 管理系统服务：
     sudo systemctl start doc-manager    # 启动
     sudo systemctl stop doc-manager     # 停止
     sudo systemctl restart doc-manager  # 重启
     sudo systemctl enable doc-manager   # 开机自启
     sudo systemctl disable doc-manager  # 取消自启

  4. 查看服务日志：
     sudo journalctl -u doc-manager -f   # 实时日志
     sudo journalctl -u doc-manager      # 全部日志

  5. 卸载系统服务：
     sudo ./launcher.sh disable

注意：系统服务与手动启动（./launcher.sh start）互斥，
      使用系统服务后无需再手动启动。

服务器特性（双平台）
--------------------
┌─────────────┬─────────────────┬─────────────────────────────┐
│   操作系统   │   WSGI 服务器    │           特点              │
├─────────────┼─────────────────┼─────────────────────────────┤
│   Windows   │     Waitress    │ 纯Python，无需额外依赖       │
│ Ubuntu/Linux│     Gunicorn    │ 高性能多进程，生产环境推荐   │
│   macOS     │     Gunicorn    │ 高性能多进程，生产环境推荐   │
└─────────────┴─────────────────┴─────────────────────────────┘

- 支持 10 个并发线程/进程（可配置）
- 支持多用户同时访问
- Debug模式已关闭（生产环境安全）
- 自动日志记录到 logs/server.log

使用说明
--------
1. 启动程序：
   - Windows: 双击 "start.bat"
   - Linux/Mac: ./launcher.sh start

2. 停止程序：
   - Windows: 在命令窗口按 Ctrl+C
   - Linux/Mac: ./launcher.sh stop

3. 检查更新：
   - Windows: 双击 "update.bat"
   - Linux/Mac: ./launcher.sh upgrade

4. 查看日志：
   - Windows: 查看 logs/server.log
   - Linux/Mac: ./launcher.sh logs (实时) / ./launcher.sh log (最近50行)

5. 数据备份：定期备份 projects/ 和 uploads/ 目录

6. 多用户访问：其他用户可通过 http://服务器IP:5000 访问

升级说明
--------
方式1 - 自动升级（推荐）：
   - Windows: 双击 "检查更新.bat"
   - Linux/Mac: ./launcher.sh upgrade
   程序会自动从GitHub下载最新版本

方式2 - 手动升级：
   1. 备份 projects/ 和 uploads/ 目录
   2. 下载新版本压缩包
   3. 解压覆盖原文件（保留 projects/ 和 uploads/）
   4. 重新运行启动程序

数据安全
--------
- 所有项目数据保存在 projects/ 目录
- 上传的文件保存在 uploads/ 目录
- 升级时不会删除这些目录的数据
- 建议定期备份这两个目录

注意事项
--------
- 程序运行时请勿删除 venv/ 目录
- 如需迁移数据，复制整个目录即可
- 首次启动较慢（需创建虚拟环境和安装依赖）
- Windows 和 Linux 的数据格式兼容，可以跨平台迁移

故障排查
--------
【Windows】
- 如果提示找不到Python，请安装Python 3.8+ 并勾选 "Add to PATH"

【Ubuntu/Linux】
- 如果提示权限不足，请给脚本添加执行权限：chmod +x start.sh
- 如果端口被占用，修改启动参数：python3 启动程序.py --port 8080

技术支持
--------
GitHub: https://github.com/Acr05s/project-doc-manager
'''
    
    dist_base = PROJECT_ROOT / 'dist' / '项目文档管理中心'
    with open(dist_base / 'README.txt', 'w', encoding='utf-8') as f:
        f.write(readme)
    
    print("README创建完成")

def create_installer_package():
    """创建安装包"""
    import zipfile
    from datetime import datetime
    
    print("\n创建安装包...")
    
    release_dir = PROJECT_ROOT / 'installer_output'
    release_dir.mkdir(exist_ok=True)
    
    version = datetime.now().strftime('%Y%m%d')
    zip_name = f'项目文档管理中心_v2.1.1B_安装版_{version}.zip'
    zip_path = release_dir / zip_name
    
    print(f"正在打包: {zip_name}")
    
    app_dir = PROJECT_ROOT / 'dist' / '项目文档管理中心'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_path in app_dir.rglob('*'):
            if file_path.is_file():
                arcname = file_path.relative_to(app_dir)
                zf.write(file_path, arcname)
    
    size_mb = zip_path.stat().st_size / 1024 / 1024
    print(f"[OK] 安装包创建完成: {zip_path}")
    print(f"文件大小: {size_mb:.1f} MB")
    
    return zip_path

def main():
    """主函数"""
    print("=" * 60)
    print("   项目文档管理中心 - 安装包构建")
    print("=" * 60 + "\n")
    
    # 清理旧构建
    clean_build_dirs()
    
    # 创建目录结构
    create_directory_structure()
    
    # 复制源文件
    copy_source_files()
    
    # 创建启动器
    create_launcher()
    
    # 创建升级工具
    create_updater()
    
    # 创建README
    create_readme()
    
    # 创建安装包
    zip_path = create_installer_package()
    
    print("\n" + "=" * 60)
    print("   构建完成!")
    print("=" * 60)
    print(f"\n安装包位置: {zip_path}")
    print("\n使用说明:")
    print("1. 将ZIP包解压到任意目录")
    print("2. 双击 '启动程序.bat' 运行")
    print("3. 双击 '检查更新.bat' 升级")
    print("\n特点:")
    print("- 持久化存储（数据保存在projects/和uploads/）")
    print("- 自动升级（从GitHub拉取最新版本）")
    print("- 虚拟环境隔离（venv/自动创建）")

if __name__ == '__main__':
    main()
