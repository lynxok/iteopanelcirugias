@echo off
title Configuración de Sincronizador ITEO
echo ===================================================
echo   CONFIGURANDO DEPENDENCIAS PARA OSER (ITEO)
echo ===================================================
echo.

:: Verificar si Python está instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python no detectado. Descargando e instalando...
    powershell -Command "Invoke-WebRequest -Uri https://www.python.org/ftp/python/3.11.5/python-3.11.5-amd64.exe -OutFile python_installer.exe"
    echo [!] Ejecutando instalador de Python. POR FAVOR, MARCA LA OPCION 'Add Python to PATH'
    start /wait python_installer.exe /quiet InstallAllUsers=1 PrependPath=1
    del python_installer.exe
    echo [OK] Python instalado. Reinicia este script para continuar.
    pause
    exit
)

echo [OK] Python detectado.
echo [!] Instalando robot de navegacion (Playwright)...
python -m pip install --upgrade pip
pip install playwright
playwright install chromium

echo.
echo ===================================================
echo   CONFIGURACION COMPLETADA EXITOSAMENTE
echo   Ya puedes usar la sincronizacion en esta PC.
echo ===================================================
pause
