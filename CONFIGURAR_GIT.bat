@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo CONFIGURANDO GIT PARA BACKEND
echo ========================================
echo.

REM Verificar si git ya está inicializado
if exist .git (
    echo Git ya está inicializado. Continuando...
) else (
    echo Inicializando repositorio Git...
    git init
)

REM Configurar branch main
git branch -M main

REM Agregar todos los archivos
echo.
echo Agregando archivos al staging...
git add .

REM Verificar si hay cambios
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo No hay cambios para commitear.
) else (
    echo.
    echo Creando commit inicial...
    git commit -m "Initial commit: ImBlasco Backend - Sistema B2B con PostgreSQL y WooCommerce"
)

REM Configurar remote
echo.
echo Configurando remote origin...
git remote remove origin 2>nul
git remote add origin git@github.com:JAVIEBRH/IMBLASCOASISTENTEBACKEND.git

echo.
echo ========================================
echo CONFIGURACION COMPLETA
echo ========================================
echo.
echo Para hacer push, ejecuta:
echo   git push -u origin main
echo.
pause
