@echo off
chcp 65001 >nul
title 심심 공작소 (외부 접속 모드)
echo ============================================
echo   외부 접속 모드로 시작합니다
echo   같은 와이파이의 폰/태블릿에서 접속 가능:
echo   http://이PC의IP주소:8189
echo   (최초 1회 관리자 권한으로 방화벽 허용 필요)
echo ============================================
cd /d "%~dp0"
set STUDIO_HOST=0.0.0.0
start "생성엔진(ComfyUI)" /min cmd /c "cd /d ComfyUI_windows_portable && .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --disable-auto-launch"
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8189
.\ComfyUI_windows_portable\python_embeded\python.exe "%~dp0app\server.py"
pause
