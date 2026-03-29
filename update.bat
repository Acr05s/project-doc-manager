@echo off
chcp 65001 >nul
title Check for Updates
cd /d "%~dp0"
python update.py
pause
