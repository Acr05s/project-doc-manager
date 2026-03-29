#!/bin/bash

# 项目文档管理中心 - 生产环境启动脚本
# 使用WSGI服务器启动，支持多人并发访问

set -e

# 配置参数
APP_NAME="项目文档管理中心"
APP_MAIN="main:app"
PORT=5000
TIMEOUT=300
# 根据CPU核心数设置工作进程数（减少工作进程数以降低内存使用）
CPU_CORES=$(nproc || echo 4)
WORKERS=$((CPU_CORES + 1))

# 日志目录
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/production.log"

# 确保日志目录存在
mkdir -p "$LOG_DIR"

# 日志函数
log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" >> "$LOG_FILE"
    echo "[$timestamp] $message"
}

log "================================================================================"
log "$APP_NAME - 生产环境启动脚本"
log "================================================================================"

# 检查虚拟环境
if [ ! -d "venv" ]; then
    log "错误: 虚拟环境不存在"
    log "请先运行 ./run.sh 创建虚拟环境"
    exit 1
fi

# 激活虚拟环境
log "激活虚拟环境..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    log "错误: 激活虚拟环境失败"
    exit 1
fi
log "虚拟环境激活成功"

# 检查WSGI服务器
log "检查WSGI服务器..."
if command -v gunicorn &> /dev/null; then
    WSGI_SERVER="gunicorn"
    WSGI_OPTS="-w $WORKERS -b 0.0.0.0:$PORT --timeout 300 --access-logfile $LOG_DIR/access.log --error-logfile $LOG_DIR/error.log"
    log "使用 gunicorn 作为WSGI服务器"
elif command -v waitress-serve &> /dev/null; then
    WSGI_SERVER="waitress-serve"
    WSGI_OPTS="--listen=0.0.0.0:$PORT --threads=4"
    log "使用 waitress 作为WSGI服务器"
else
    log "错误: 未找到WSGI服务器"
    log "请安装 gunicorn 或 waitress"
    log "安装命令: pip install gunicorn waitress"
    exit 1
fi

log "启动 $APP_NAME 生产服务..."
log "服务地址: http://0.0.0.0:$PORT"
log "工作进程数: $WORKERS"
log "日志文件: $LOG_FILE"
log "================================================================================"

# 启动WSGI服务器
if [ "$WSGI_SERVER" == "gunicorn" ]; then
    # 优化内存使用的gunicorn配置
    gunicorn \
        --workers $WORKERS \
        --bind 0.0.0.0:$PORT \
        --timeout $TIMEOUT \
        --keep-alive 60 \
        --max-requests 300 \
        --max-requests-jitter 30 \
        --limit-request-line 4094 \
        --limit-request-fields 100 \
        --access-logfile $LOG_DIR/access.log \
        --error-logfile $LOG_DIR/error.log \
        --capture-output \
        --log-level info \
        --worker-class gthread \
        --threads 2 \
        --preload \
        $APP_MAIN
else
    waitress-serve $WSGI_OPTS $APP_MAIN
fi