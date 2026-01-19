@echo off
REM ============================================
REM Script para iniciar Backend, Frontend y Servidor de Páginas Scrapeadas
REM ============================================

echo.
echo ============================================
echo    INICIANDO SERVICIOS IMBLASCO B2B
echo ============================================
echo.

REM Rutas
set BACKEND_PATH=%~dp0
REM El frontend está en un directorio hermano
set BASE_PATH=C:\Users\Javier
set FRONTEND_PATH=%BASE_PATH%\frontend imblsco jsreact funcional\IMBLASCOASISTENTEFRONTEND

REM Verificar que existe el directorio del frontend
if not exist "%FRONTEND_PATH%" (
    echo ERROR: No se encuentra el directorio del frontend
    echo Esperado en: %FRONTEND_PATH%
    pause
    exit /b 1
)

echo [1/3] Iniciando Backend (Puerto 3001)...
start "IMBLASCO - Backend" cmd /k "cd /d "%BACKEND_PATH%" && npm run dev"

timeout /t 3 /nobreak >nul

echo [2/3] Iniciando Frontend (Puerto 5173)...
start "IMBLASCO - Frontend" cmd /k "cd /d "%FRONTEND_PATH%" && npm run dev"

timeout /t 3 /nobreak >nul

echo [3/3] Iniciando Servidor de Páginas Scrapeadas (Puerto 3002)...
start "IMBLASCO - Páginas Scrapeadas" cmd /k "cd /d "%BACKEND_PATH%" && npm run serve-scraped"

echo.
echo ============================================
echo    SERVICIOS INICIADOS
echo ============================================
echo.
echo Backend API:          http://localhost:3001
echo Frontend React:       http://localhost:5173
echo Páginas Scrapeadas:   http://localhost:3002
echo.
echo Catálogos Scrapeados:
echo   - Home:             http://localhost:3002/
echo   - Políticas:        http://localhost:3002/politicas-comerciales.html
echo   - Catálogos:        http://localhost:3002/catalogos.html
echo   - Descargas:        http://localhost:3002/descargas.html
echo   - Despachos:        http://localhost:3002/despachos.html
echo.
echo Presiona cualquier tecla para cerrar esta ventana...
echo Los servicios continuarán ejecutándose en sus propias ventanas.
echo.
pause >nul
