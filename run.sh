#!/bin/bash

# 项目文档管理中心 - 一键启动脚本（Linux/Mac）
# 自动检查Python环境、创建虚拟环境、安装依赖并启动应用
# 支持守护进程模式，自动重启和日志记录
# 支持Ubuntu系统的特殊处理

set -e

# 日志文件
LOG_FILE="logs/run.log"

# 确保日志目录存在
mkdir -p logs

echo "================================================================================"
echo "项目文档管理中心 - 一键启动脚本"
echo "================================================================================"
echo "正在检查系统环境..."

# 检测操作系统类型
OS_TYPE=$(uname -s)
DISTRO_TYPE=""

if [ "$OS_TYPE" == "Linux" ]; then
    if [ -f "/etc/os-release" ]; then
        source /etc/os-release
        DISTRO_TYPE=$ID
    fi
fi

echo "操作系统: $OS_TYPE"
if [ -n "$DISTRO_TYPE" ]; then
    echo "发行版: $DISTRO_TYPE"
fi

# 检查Python是否安装
echo "检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python环境"
    echo "请先安装Python 3.7或更高版本"
    echo "下载地址: https://www.python.org/downloads/"
    exit 1
fi

echo "Python环境检查通过"

# 系统特殊处理
if [ "$DISTRO_TYPE" == "ubuntu" ] || [ "$DISTRO_TYPE" == "debian" ]; then
    echo "检测到Ubuntu/Debian系统，安装必要的系统依赖..."
    
    # 检查是否有sudo权限
    if command -v sudo &> /dev/null; then
        echo "安装系统依赖包..."
        sudo apt update -y || echo "警告: 更新包列表失败"
        sudo apt install -y python3-venv python3-dev build-essential libreoffice || echo "警告: 安装系统依赖失败"
    else
        echo "警告: 无sudo权限，无法安装系统依赖"
        echo "请手动安装: sudo apt install python3-venv python3-dev build-essential libreoffice"
    fi
elif [ "$OS_TYPE" == "Darwin" ]; then
    echo "检测到macOS系统，安装必要的系统依赖..."
    
    # 检查是否有brew
    if command -v brew &> /dev/null; then
        echo "安装系统依赖包..."
        brew install libreoffice || echo "警告: 安装LibreOffice失败"
    else
        echo "警告: 未找到Homebrew，请先安装Homebrew"
        echo "安装Homebrew: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo "然后安装LibreOffice: brew install libreoffice"
    fi
fi

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "错误: 创建虚拟环境失败"
        echo "可能需要安装python3-venv包: sudo apt install python3-venv"
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

echo "升级pip和setuptools..."
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --upgrade pip setuptools

echo "安装依赖包..."
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
if [ $? -ne 0 ]; then
    echo "错误: 安装依赖失败"
    echo "请检查网络连接或requirements.txt文件"
    exit 1
fi

echo "依赖安装成功"
echo "环境配置完成"

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
elif [ "$1" == "--update" ]; then
    # 更新模式
    echo "================================================================================"
    echo "项目文档管理中心 - 更新模式"
    echo "================================================================================"
    echo "正在从远程仓库下载更新..."
    
    # 检查git是否安装
    if ! command -v git &> /dev/null; then
        echo "错误: 未找到git命令"
        echo "请先安装git: sudo apt install git 或 brew install git"
        exit 1
    fi
    
    # 检查是否为git仓库
    if [ ! -d ".git" ]; then
        echo "错误: 当前目录不是git仓库"
        echo "请在项目根目录运行此命令"
        exit 1
    fi
    
    # 保存当前分支
    CURRENT_BRANCH=$(git branch --show-current)
    echo "当前分支: $CURRENT_BRANCH"
    
    # 暂存本地修改
    echo "暂存本地修改..."
    git stash push -m "update_temp_stash"
    
    # 拉取远程更新
    echo "拉取远程更新..."
    git pull origin $CURRENT_BRANCH
    
    # 恢复本地修改
    echo "恢复本地修改..."
    git stash pop
    
    # 安装新依赖
    echo "检查并安装新依赖..."
    if [ -d "venv" ]; then
        source venv/bin/activate
        pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
    fi
    
    echo "================================================================================"
    echo "更新完成！"
    echo "================================================================================"
    echo "可以使用以下命令启动应用:"
    echo "  ./run.sh          # 前台运行"
    echo "  ./run.sh --daemon # 后台运行"
    echo "================================================================================"
else
    # 前台运行
    python3 main.py
fi
