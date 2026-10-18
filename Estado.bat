@echo off
setlocal
cd /d "%~dp0"
title Control Caja - Estado
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\control-local.ps1" -Accion Estado
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
