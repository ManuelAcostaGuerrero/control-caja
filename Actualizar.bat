@echo off
setlocal
cd /d "%~dp0"
title Control Caja - Actualizar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\control-local.ps1" -Accion Actualizar
set "RC=%ERRORLEVEL%"
echo.
pause
exit /b %RC%
