@echo off
chcp 65001 >nul
title 심심 공작소 (인터넷 공개 모드)
cd /d "%~dp0"

REM ── 비밀번호는 옆 파일(비밀번호.txt)에서 읽는다 ──
REM   이 파일은 깃(GitHub)에 올라가므로 여기에 적으면 남한테 다 보인다.
REM   비밀번호.txt 는 깃에서 빠지므로 안전하다. 없으면 만들어 준다.
REM   처음이면 **무작위로** 만든다 — 저장소에 적어 두면 그것이 곧 공개 비밀번호가 된다.
if not exist "비밀번호.txt" (
  echo studio-%RANDOM%%RANDOM%> "비밀번호.txt"
  echo [알림] 비밀번호.txt 를 새로 만들었습니다. 메모장으로 열어 바꿀 수 있습니다.
)
set /p STUDIO_PASSWORD=<"비밀번호.txt"

echo ============================================
echo   인터넷 공개 모드 (Cloudflare 터널)
echo   비밀번호: %STUDIO_PASSWORD%  (비밀번호.txt 를 열어 변경)
echo   터널 창에 표시되는 trycloudflare.com 주소로
echo   어디서든 접속할 수 있습니다. (주소는 실행마다 바뀜)
echo ============================================
start "생성엔진(ComfyUI)" /min cmd /c "cd /d ComfyUI_windows_portable && .\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --disable-auto-launch"
timeout /t 3 /nobreak >nul
start "Cloudflare 터널 (여기 표시된 주소로 접속)" cmd /k ".\cloudflared.exe tunnel --url http://127.0.0.1:8189"
start "" http://127.0.0.1:8189/?key=%STUDIO_PASSWORD%
.\ComfyUI_windows_portable\python_embeded\python.exe "%~dp0app\server.py"
pause
