@echo off
chcp 65001 >nul
title 심심 공작소
echo ============================================
echo   심심 공작소를 시작합니다
echo   1) 생성 엔진(ComfyUI) 시작
echo   2) 스튜디오 앱 시작
echo   3) 브라우저가 자동으로 열립니다
echo ============================================
cd /d "%~dp0"
start "생성엔진(ComfyUI)" /min cmd /c "cd /d ComfyUI_windows_portable && .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --disable-auto-launch"
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8189
.\ComfyUI_windows_portable\python_embeded\python.exe "%~dp0app\server.py"
pause
