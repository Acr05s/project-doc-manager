#!/bin/bash
# ============================================================================
# Project Document Manager - Linux/Mac Daemon
# Version: 2.1.1B
# Features: start, install, restart, stop, logs, upgrade
# ============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    echo -e "${BLUE}  Linux/Mac Daemon${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Usage: ./Daemon.sh [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start       Start the server (default)"
    echo "  install     Install/Update dependencies"
    echo "  restart     Restart the server"
    echo "  stop        Stop the running server"
    echo "  status      Check server status"
    echo "  logs        View server logs (tail -f)"
    echo "  log         View recent logs (last 50 lines)"
    echo "  upgrade     Upgrade to latest version (git pull + restart)"
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
    echo "  ./Daemon.sh start           # Start server"
    echo "  ./Daemon.sh start -p 8080   # Start on port 8080"
    echo "  ./Daemon.sh install         # Install dependencies"
    echo "  ./Daemon.sh upgrade         # Upgrade to latest version"
    echo "  ./Daemon.sh logs            # View logs in real-time"
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
    
    # 检查是否使用国内镜像
    local USE_MIRROR="${1:-}"
    local PIP_ARGS=""
    
    if [ "$USE_MIRROR" = "--mirror" ] || [ "$USE_MIRROR" = "-m" ]; then
        echo -e "${YELLOW}Using Tsinghua Mirror (China)...${NC}"
        PIP_ARGS="-i https://pypi.tuna.tsinghua.edu.cn/simple"
    fi
    
    check_python
    setup_venv
    
    echo -e "${YELLOW}Upgrading pip...${NC}"
    "$PIP_BIN" install --upgrade pip -q $PIP_ARGS
    
    echo -e "${YELLOW}Installing requirements...${NC}"
    if [ -f "$APP_DIR/requirements.txt" ]; then
        "$PIP_BIN" install -r "$APP_DIR/requirements.txt" $PIP_ARGS
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
    nohup "$PYTHON_BIN" "$APP_DIR/main.py" \
        --mode=prod \
        --port="$PORT" \
        --threads="$THREADS" \
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
    echo -e "${BLUE}       Check logs: ./Daemon.sh logs${NC}"
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

# 升级功能（git pull + 更新依赖 + 重启）
cmd_upgrade() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Upgrading $APP_NAME${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # 检查git是否安装
    if ! command -v git &> /dev/null; then
        echo -e "${RED}[ERROR] Git not found! Please install git first.${NC}"
        exit 1
    fi
    
    # 检查是否为git仓库
    if [ ! -d "$APP_DIR/.git" ]; then
        echo -e "${RED}[ERROR] Not a git repository! Cannot upgrade.${NC}"
        exit 1
    fi
    
    # 保存当前服务器状态
    local WAS_RUNNING=false
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            WAS_RUNNING=true
        fi
    fi
    
    # 如果服务器在运行，先停止
    if [ "$WAS_RUNNING" = true ]; then
        echo -e "${YELLOW}Stopping server before upgrade...${NC}"
        cmd_stop
        sleep 2
    fi
    
    # 执行git pull
    echo -e "${YELLOW}Pulling latest code from git...${NC}"
    cd "$APP_DIR"
    
    # 获取当前分支
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ -z "$CURRENT_BRANCH" ]; then
        echo -e "${YELLOW}[WARN] Could not determine current branch, using 'main'${NC}"
        CURRENT_BRANCH="main"
    fi
    
    echo -e "${BLUE}Current branch: $CURRENT_BRANCH${NC}"
    
    if git pull origin "$CURRENT_BRANCH"; then
        echo -e "${GREEN}[OK] Code updated successfully!${NC}"
    else
        echo -e "${RED}[ERROR] Git pull failed! Please check your network or resolve conflicts.${NC}"
        # 如果之前正在运行，尝试重新启动
        if [ "$WAS_RUNNING" = true ]; then
            echo -e "${YELLOW}Attempting to restart server...${NC}"
            cmd_start
        fi
        exit 1
    fi
    
    # 清除Python缓存
    echo -e "${YELLOW}Clearing Python cache...${NC}"
    find "$APP_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find "$APP_DIR" -name "*.pyc" -delete 2>/dev/null || true
    echo -e "${GREEN}[OK] Cache cleared${NC}"
    
    # 更新依赖
    echo ""
    echo -e "${YELLOW}Updating dependencies...${NC}"
    cmd_install
    
    # 启动服务器
    echo ""
    echo -e "${YELLOW}Starting server...${NC}"
    cmd_start
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Upgrade completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
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
        echo -e "       sudo ./Daemon.sh enable"
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
        echo -e "       sudo ./Daemon.sh disable"
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
        echo "  sudo ./Daemon.sh enable"
        echo ""
        # 显示手动运行状态
        check_status
    fi
}

# 解析参数
COMMAND="start"
MIRROR_FLAG=""
while [[ $# -gt 0 ]]; do
    case $1 in
        start|install|restart|stop|status|logs|log|upgrade|enable|disable|service|help)
            COMMAND="$1"
            shift
            ;;
        --mirror|-m)
            MIRROR_FLAG="--mirror"
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
        cmd_install "$MIRROR_FLAG"
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
