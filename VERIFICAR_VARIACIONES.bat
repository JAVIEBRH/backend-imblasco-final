@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║     VERIFICAR PRODUCTOS VARIABLES Y VARIACIONES       ║
echo ╚════════════════════════════════════════════════════════╝
echo.

echo 📍 Directorio de trabajo: %CD%
echo.

REM Verificar que existe .env
if not exist .env (
    echo ❌ ERROR: Archivo .env no encontrado
    echo    Ubicación esperada: %CD%\.env
    echo.
    pause
    exit /b 1
)

echo ✅ Archivo .env encontrado
echo.

REM Verificar variables de WooCommerce
findstr /C:"WC_KEY" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  ADVERTENCIA: WC_KEY no encontrada en .env
    echo.
)

findstr /C:"WC_SECRET" .env >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  ADVERTENCIA: WC_SECRET no encontrada en .env
    echo.
)

echo 🔍 Verificando productos variables y variaciones...
echo    Esto puede tardar varios minutos si hay muchos productos...
echo.

REM Ejecutar el script
node src/scripts/check-variations.js

echo.
pause
