@echo off
chcp 65001 >nul
title Install Dependencies - Project Document Manager
cd /d "%~dp0"

echo ============================================
echo   Project Document Manager - Setup
echo ============================================
echo.
echo This script will install Python dependencies.
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

REM Upgrade pip
echo Upgrading pip...
venv\Scripts\python -m pip install --upgrade pip
echo.

REM Install dependencies
echo Installing dependencies...
echo This may take a few minutes depending on your network...
echo.
echo Using default PyPI repository...
echo (If download is slow, press Ctrl+C and use Tsinghua mirror:
echo  install-tsinghua.bat)
echo.

venv\Scripts\pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo [WARNING] Some dependencies may have failed to install.
    echo Try running install-tsinghua.bat for faster download.
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
