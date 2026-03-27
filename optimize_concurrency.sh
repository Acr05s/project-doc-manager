#!/bin/bash

# 项目文档管理中心 - 并发优化脚本
# 解决多人访问时的性能问题

set -e

# 配置参数
APP_NAME="项目文档管理中心"
APP_MAIN="main:app"
PORT=5000
# 根据CPU核心数设置工作进程数
CPU_CORES=$(nproc || echo 4)
WORKERS=$((CPU_CORES * 2 + 1))
TIMEOUT=300

# 日志目录
LOG_DIR="logs"
ACCESS_LOG="$LOG_DIR/access.log"
ERROR_LOG="$LOG_DIR/error.log"
APP_LOG="$LOG_DIR/app.log"

# 确保日志目录存在
mkdir -p "$LOG_DIR"

# 日志函数
log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message"
    echo "[$timestamp] $message" >> "$APP_LOG"
}

log "================================================================================"
log "$APP_NAME - 并发优化脚本"
log "================================================================================"

# 检查系统资源
check_system_resources() {
    log "检查系统资源..."
    
    # 检查内存
    MEMORY=$(free -h | grep Mem | awk '{print $2}')
    log "系统内存: $MEMORY"
    
    # 检查CPU
    log "CPU核心数: $CPU_CORES"
    log "建议工作进程数: $WORKERS"
    
    # 检查磁盘空间
    DISK=$(df -h | grep '/' | head -1 | awk '{print $4}')
    log "可用磁盘空间: $DISK"
}

# 优化系统参数
optimize_system_params() {
    log "优化系统参数..."
    
    # 临时增加文件描述符限制
    ulimit -n 65536
    log "文件描述符限制: $(ulimit -n)"
    
    # 临时增加进程数限制
    ulimit -u 4096
    log "进程数限制: $(ulimit -u)"
}

# 检查并安装依赖
check_dependencies() {
    log "检查依赖..."
    
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
    if ! command -v gunicorn &> /dev/null; then
        log "安装 gunicorn..."
        pip install gunicorn
    fi
    log "gunicorn 已安装"
}

# 启动优化后的服务
start_optimized_service() {
    log "启动优化后的服务..."
    log "服务地址: http://0.0.0.0:$PORT"
    log "工作进程数: $WORKERS"
    log "超时时间: $TIMEOUT 秒"
    log "访问日志: $ACCESS_LOG"
    log "错误日志: $ERROR_LOG"
    log "应用日志: $APP_LOG"
    log "================================================================================"
    
    # 启动gunicorn服务器
    gunicorn \
        --workers $WORKERS \
        --bind 0.0.0.0:$PORT \
        --timeout $TIMEOUT \
        --keep-alive 60 \
        --max-requests 1000 \
        --max-requests-jitter 50 \
        --access-logfile $ACCESS_LOG \
        --error-logfile $ERROR_LOG \
        --capture-output \
        --log-level info \
        $APP_MAIN
}

# 主函数
main() {
    check_system_resources
    optimize_system_params
    check_dependencies
    start_optimized_service
}

# 执行主函数
main
