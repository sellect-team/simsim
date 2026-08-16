@echo off
chcp 65001 >nul
title 동영상 생성기 (ComfyUI + Wan 2.2 5B)
echo 동영상 생성기를 시작합니다. 잠시 후 브라우저가 열립니다...
cd /d "%~dp0ComfyUI_windows_portable"
start "" http://127.0.0.1:8188
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --auto-launch
pause
