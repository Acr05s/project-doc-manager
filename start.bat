@echo off
chcp 65001 >nul
title Project Document Manager
cd /d "%~dp0"
echo Starting Project Document Manager...
echo.
python start.py
pause
