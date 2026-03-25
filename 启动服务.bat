@echo off
chcp 65001 >nul
echo ====================================
echo   项目文档管理中心 - 启动服务
echo ====================================
echo.

:: 结束已有的Python进程（可选，避免端口冲突）
taskkill /F /IM python.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: 切换到脚本所在目录（即 project_doc_manager）
cd /d "%~dp0"

echo 当前目录: %CD%
echo 正在启动 Flask 服务，端口 5000...
echo 请在浏览器访问: http://127.0.0.1:5000
echo.
echo 按 Ctrl+C 停止服务
echo.

C:\Users\bysdc\AppData\Local\Programs\Python\Python310\python.exe main.py

pause
