#!/bin/bash

# 项目文档管理中心 - 守护进程脚本
# 监控服务运行状态，自动重启，记录日志

set -e

# 配置参数
APP_NAME="项目文档管理中心"
APP_DIR="$(pwd)"
LOG_DIR="$APP_DIR/logs"
DAEMON_LOG="$LOG_DIR/daemon.log"
MAX_MEMORY_USAGE=80  # 最大内存使用率（%）
CHECK_INTERVAL=60  # 检查间隔（秒）

# 确保日志目录存在
mkdir -p "$LOG_DIR"

# 日志函数
log() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $message" >> "$DAEMON_LOG"
    echo "[$timestamp] $message"
}

# 检查内存使用情况
check_memory() {
    local memory_usage=$(free | grep Mem | awk '{print $3/$2 * 100.0}')
    local memory_usage_int=$(printf "%.0f" "$memory_usage")
    
    log "当前内存使用率: ${memory_usage_int}%"
    
    if [ "$memory_usage_int" -gt "$MAX_MEMORY_USAGE" ]; then
        log "警告: 内存使用率过高 (${memory_usage_int}%)，需要重启服务"
        return 1
    fi
    
    return 0
}

# 检查服务状态
check_service() {
    local pid_file="$APP_DIR/gunicorn.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null; then
            return 0  # 服务正在运行
        fi
    fi
    
    return 1  # 服务未运行
}

# 启动服务
start_service() {
    log "================================================================================"
    log "$APP_NAME - 启动服务"
    log "================================================================================"
    
    # 检查虚拟环境
    if [ ! -d "$APP_DIR/venv" ]; then
        log "错误: 虚拟环境不存在"
        log "正在创建虚拟环境..."
        python3 -m venv "$APP_DIR/venv"
        
        # 激活虚拟环境并安装依赖
        log "激活虚拟环境..."
        source "$APP_DIR/venv/bin/activate"
        log "安装依赖..."
        pip install -r "$APP_DIR/requirements.txt"
    fi
    
    # 激活虚拟环境
    source "$APP_DIR/venv/bin/activate"
    
    # 启动生产服务
    log "启动生产服务..."
    cd "$APP_DIR"
    
    # 使用nohup后台运行，并将PID写入文件
    nohup ./start_production.sh > "$LOG_DIR/startup.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$APP_DIR/gunicorn.pid"
    
    log "服务已启动，PID: $pid"
    log "服务地址: http://0.0.0.0:5000"
    log "日志文件: $LOG_DIR/production.log"
}

# 停止服务
stop_service() {
    local pid_file="$APP_DIR/gunicorn.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        log "停止服务 (PID: $pid)..."
        
        # 优雅停止
        kill -TERM "$pid" 2>/dev/null || true
        
        # 等待进程结束
        local count=0
        while ps -p "$pid" > /dev/null && [ "$count" -lt 30 ]; do
            sleep 1
            count=$((count + 1))
        done
        
        # 如果进程仍在运行，强制停止
        if ps -p "$pid" > /dev/null; then
            log "强制停止服务..."
            kill -KILL "$pid" 2>/dev/null || true
        fi
        
        # 删除PID文件
        rm -f "$pid_file"
        log "服务已停止"
    else
        log "服务未运行"
    fi
}

# 重启服务
restart_service() {
    log "重启服务..."
    stop_service
    sleep 2
    start_service
}

# 监控服务
monitor_service() {
    log "================================================================================"
    log "$APP_NAME - 开始监控服务"
    log "================================================================================"
    log "监控间隔: ${CHECK_INTERVAL}秒"
    log "内存使用率阈值: ${MAX_MEMORY_USAGE}%"
    
    while true; do
        # 检查内存使用情况
        if ! check_memory; then
            log "内存使用率过高，重启服务..."
            restart_service
        fi
        
        # 检查服务状态
        if ! check_service; then
            log "服务未运行，启动服务..."
            start_service
        fi
        
        # 等待下一次检查
        sleep "$CHECK_INTERVAL"
    done
}

# 主函数
main() {
    case "$1" in
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        monitor)
            monitor_service
            ;;
        status)
            if check_service; then
                log "服务正在运行"
            else
                log "服务未运行"
            fi
            ;;
        update)
            log "================================================================================"
            log "$APP_NAME - 更新代码"
            log "================================================================================"
            
            # 停止服务
            log "停止服务..."
            stop_service
            
            # 拉取远程代码
            log "从远程仓库拉取代码..."
            cd "$APP_DIR"
            git pull origin main
            
            if [ $? -eq 0 ]; then
                log "代码更新成功"
                
                # 安装新依赖
                log "检查并安装依赖..."
                source "$APP_DIR/venv/bin/activate"
                pip install -r "$APP_DIR/requirements.txt"
                
                # 重新启动服务
                log "重新启动服务..."
                start_service
                log "更新完成"
            else
                log "错误: 代码更新失败"
            fi
            ;;
        *)
            echo "用法: $0 {start|stop|restart|monitor|status|update}"
            echo "  start    - 启动服务"
            echo "  stop     - 停止服务"
            echo "  restart  - 重启服务"
            echo "  monitor  - 监控服务（后台运行）"
            echo "  status   - 检查服务状态"
            echo "  update   - 从远程仓库更新代码"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"
