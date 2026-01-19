@echo off
REM ============================================
REM Script para detener todos los servicios
REM ============================================

echo.
echo ============================================
echo    DETENIENDO SERVICIOS IMBLASCO B2B
echo ============================================
echo.

echo Deteniendo procesos de Node.js...

REM Detener procesos en los puertos específicos
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3002" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

REM Detener procesos por nombre de ventana (si existen)
taskkill /FI "WINDOWTITLE eq IMBLASCO - Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq IMBLASCO - Frontend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq IMBLASCO - Páginas Scrapeadas*" /T /F >nul 2>&1

timeout /t 2 /nobreak >nul

echo.
echo Servicios detenidos.
echo.
pause
