@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo 🔄 Configurando repositorio Git del Backend...
echo.
git init
git add .
git commit -m "Initial commit: ImBlasco Backend - Sistema de pedidos automatizados B2B con PostgreSQL y WooCommerce"
git branch -M main
git remote add origin git@github.com:JAVIEBRH/IMBLASCOASISTENTEBACKEND.git
echo.
echo 📤 Subiendo a GitHub...
git push -u origin main
echo.
echo ✅ ¡Backend subido exitosamente!
pause
