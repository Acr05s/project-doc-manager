@echo off
chcp 65001 >nul

rem 项目文档管理中心 - 一键启动脚本
rem 自动检查Python环境、创建虚拟环境、安装依赖并启动应用

echo ===============================================================================
echo 项目文档管理中心 - 一键启动脚本
echo ===============================================================================
echo 正在检查系统环境...

rem 检查Python是否安装
echo 检查Python环境...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Python环境
    echo 请先安装Python 3.7或更高版本
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Python环境检查通过

rem 检查虚拟环境是否存在
if not exist "venv" (
    echo 创建虚拟环境...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo 错误: 创建虚拟环境失败
        pause
        exit /b 1
    )
    echo 虚拟环境创建成功
)

echo 激活虚拟环境...
call "venv\Scripts\activate.bat"
if %errorlevel% neq 0 (
    echo 错误: 激活虚拟环境失败
    pause
    exit /b 1
)

echo 虚拟环境激活成功

echo 安装依赖包...
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
if %errorlevel% neq 0 (
    echo 错误: 安装依赖失败
    echo 请检查网络连接或requirements.txt文件
    pause
    exit /b 1
)

echo 依赖安装成功

echo ===============================================================================
echo 环境准备完成，正在启动应用...
echo ===============================================================================
echo 访问地址: http://localhost:5000
echo API文档: http://localhost:5000/api/docs
echo ===============================================================================

python main.py

pause