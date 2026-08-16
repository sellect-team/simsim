@echo off
chcp 65001 >nul
title Claude 로그인 (최초 1회)
echo ============================================
echo   Claude 로그인을 시작합니다
echo.
echo   1) 잠시 후 브라우저가 열립니다
echo   2) 지금 쓰시는 Claude 계정으로 로그인
echo   3) "Authorize(허용)" 버튼 클릭
echo   4) 이 창에 성공 메시지가 뜨면 창을 닫으세요
echo.
echo   완료되면 앱의 AI 제안/채팅 기능이 바로 작동합니다.
echo ============================================
echo.
claude /login
echo.
echo ============================================
echo   위에 성공(logged in) 표시가 보이면 완료!
echo   이 창은 닫으셔도 됩니다.
echo ============================================
pause
