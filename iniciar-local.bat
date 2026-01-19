@echo off
REM ============================================
REM Script para iniciar Backend + páginas clonadas
REM (Modo local para ver la clonación + chat)
REM ============================================

echo.
echo ============================================
echo    INICIANDO LOCAL (BACKEND + CLON)
echo ============================================
echo.

REM Rutas
set BACKEND_PATH=%~dp0

echo [1/2] Iniciando Backend (Puerto 3001)...
start "IMBLASCO - Backend" cmd /k "cd /d "%BACKEND_PATH%" && npm run dev"

timeout /t 3 /nobreak >nul

echo [2/2] Iniciando Servidor de Páginas Scrapeadas (Puerto 3002)...
start "IMBLASCO - Páginas Scrapeadas" cmd /k "cd /d "%BACKEND_PATH%" && npm run serve-scraped"

echo.
echo ============================================
echo    SERVICIOS INICIADOS
echo ============================================
echo.
echo Backend API:        http://localhost:3001
echo Páginas Clonadas:   http://localhost:3002
echo.
echo Home:               http://localhost:3002/
echo Políticas:          http://localhost:3002/politicas-comerciales.html
echo Catálogos:          http://localhost:3002/catalogos.html
echo Descargas:          http://localhost:3002/descargas.html
echo Despachos:          http://localhost:3002/despachos.html
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
echo Los servicios continuarán ejecutándose en sus propias ventanas.
echo.
pause >nul
