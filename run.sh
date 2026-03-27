#!/bin/bash

# 项目文档管理中心 - 一键启动脚本（Linux/Mac）
# 自动检查Python环境、创建虚拟环境、安装依赖并启动应用
# 支持守护进程模式，自动重启和日志记录

set -e

# 日志文件
LOG_FILE="logs/run.log"

# 确保日志目录存在
mkdir -p logs

echo "================================================================================"
echo "项目文档管理中心 - 一键启动脚本"
echo "================================================================================"
echo "正在检查系统环境..."

# 检查Python是否安装
echo "检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python环境"
    echo "请先安装Python 3.7或更高版本"
    echo "下载地址: https://www.python.org/downloads/"
    exit 1
fi

echo "Python环境检查通过"

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "错误: 创建虚拟环境失败"
        exit 1
    fi
    echo "虚拟环境创建成功"
fi

echo "激活虚拟环境..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "错误: 激活虚拟环境失败"
    exit 1
fi

echo "虚拟环境激活成功"

echo "安装依赖包..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "错误: 安装依赖失败"
    echo "请检查网络连接或requirements.txt文件"
    exit 1
fi

echo "依赖安装成功"

echo "================================================================================"
echo "环境准备完成，正在启动应用..."
echo "================================================================================"
echo "访问地址: http://localhost:5000"
echo "API文档: http://localhost:5000/api/docs"
echo "日志文件: $LOG_FILE"
echo "================================================================================"

# 守护进程函数
function start_daemon() {
    echo "启动守护进程..."
    while true; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 启动应用..." >> "$LOG_FILE"
        python3 main.py >> "$LOG_FILE" 2>&1
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 应用异常退出，正在重启..." >> "$LOG_FILE"
        sleep 3
    done
}

# 检查是否在后台运行
if [ "$1" == "--daemon" ]; then
    # 在后台运行
    start_daemon &
    DAEMON_PID=$!
    echo "守护进程已启动，PID: $DAEMON_PID"
    echo "$DAEMON_PID" > .daemon.pid
    echo "使用 'kill $(cat .daemon.pid)' 停止守护进程"
else
    # 前台运行
    python3 main.py
fi