@echo off
chcp 65001 >nul
title Install Dependencies (Tsinghua Mirror) - Project Document Manager
cd /d "%~dp0"

echo ============================================
echo   Project Document Manager - Setup
echo   Using Tsinghua Mirror (China)
echo ============================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found!
    echo Please install Python 3.8 or higher from:
    echo https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [OK] Python found
python --version
echo.

REM Create virtual environment
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created
) else (
    echo [OK] Virtual environment already exists
)
echo.

REM Upgrade pip using mirror
echo Upgrading pip (using Tsinghua mirror)...
venv\Scripts\python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple
echo.

REM Install dependencies using mirror
echo Installing dependencies using Tsinghua mirror...
echo This may take a few minutes...
echo.

venv\Scripts\pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

if errorlevel 1 (
    echo.
    echo [ERROR] Installation failed.
    echo Please check your network connection and try again.
    pause
    exit /b 1
)

echo.
echo ============================================
echo [OK] Dependencies installed successfully!
echo ============================================
echo.
echo You can now start the application by running:
echo   start.bat
echo.
pause
