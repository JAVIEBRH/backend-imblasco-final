@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║        INICIANDO BACKEND IMBLASCO B2B                 ║
echo ╚════════════════════════════════════════════════════════╝
echo.

echo 📍 Directorio de trabajo: %CD%
echo.

REM Verificar que existe .env
if not exist .env (
    echo ❌ ERROR: Archivo .env no encontrado
    echo    Ubicación esperada: %CD%\.env
    echo.
    echo    Ejecuta primero: ACTUALIZAR_WOOCOMMERCE.bat
    echo.
    pause
    exit /b 1
)

echo ✅ Archivo .env encontrado
echo.

REM Verificar variables críticas
findstr /C:"OPENAI_API_KEY" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  ADVERTENCIA: OPENAI_API_KEY no encontrada en .env
)

findstr /C:"WC_KEY" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  ADVERTENCIA: WC_KEY no encontrada en .env
)

findstr /C:"WC_SECRET" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  ADVERTENCIA: WC_SECRET no encontrada en .env
)

echo.
echo 🚀 Iniciando servidor...
echo    Presiona Ctrl+C para detener
echo.
echo ════════════════════════════════════════════════════════
echo.

REM Ejecutar el servidor
node src/index.js

pause
