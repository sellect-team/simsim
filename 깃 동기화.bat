@echo off
chcp 65001 >nul
title 심심 공작소 — 깃 동기화
cd /d "%~dp0"

REM ── 둘이 같이 고칠 때 쓰는 한 방 도구 ──
REM   ① 상대가 고친 것을 받고  ② 내가 고친 것을 올린다.
REM   중간에 겹치면 멈추고 무엇이 겹쳤는지 알려 준다.

echo ============================================
echo   깃 동기화 (받기 → 올리기)
echo ============================================
echo.

echo [1/4] 내가 고친 것 살펴보는 중…
git status --short
echo.

REM 고친 것이 있으면 먼저 담아 둔다 (받는 동안 안 섞이게)
git diff --quiet && git diff --cached --quiet
if errorlevel 1 (
  echo [2/4] 내 변경을 잠시 넣어 둡니다…
  git stash push -u -m "동기화 임시" >nul 2>&1
  set 넣어둠=1
) else (
  echo [2/4] 내가 고친 것이 없습니다.
  set 넣어둠=
)

echo [3/4] 상대가 고친 것 받는 중…
git pull --rebase origin main
if errorlevel 1 (
  echo.
  echo [!] 받다가 멈췄습니다. 겹친 곳을 손으로 고친 뒤
  echo     git rebase --continue  를 치세요.
  pause
  exit /b 1
)

if defined 넣어둠 (
  echo      넣어 둔 내 변경을 되돌립니다…
  git stash pop
  if errorlevel 1 (
    echo.
    echo [!] 내 변경과 상대 변경이 같은 곳을 건드렸습니다.
    echo     그 파일을 열어 고른 뒤 다시 실행하세요.
    pause
    exit /b 1
  )
)

echo [4/4] 내가 고친 것 올리는 중…
git diff --quiet && git diff --cached --quiet
if errorlevel 1 (
  git add -A app views 2>nul
  git add -A *.bat *.md .gitignore 2>nul
  set /p 메모=무엇을 고쳤나요 (엔터만 치면 '작업'):
  if "%메모%"=="" set 메모=작업
  git commit -q -m "%메모%"
  git push origin main
  echo.
  echo   올렸습니다.
) else (
  echo   올릴 것이 없습니다 ^(받기만 했습니다^).
)

echo.
echo ============================================
git log --oneline -5
echo ============================================
pause
