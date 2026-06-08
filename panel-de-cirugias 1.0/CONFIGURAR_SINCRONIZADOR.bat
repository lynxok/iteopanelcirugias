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
echo [!] Actualizando pip...
python -m pip install --upgrade pip
if %errorlevel% neq 0 (
    echo [ADVERTENCIA] No se pudo actualizar pip, se continuara con la instalacion de dependencias.
)

echo [!] Instalando robot de navegacion (Playwright)...
python -m pip install playwright
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo instalar playwright. Por favor verifica tu conexion a internet o si tienes permisos.
    pause
    exit /b %errorlevel%
)

echo [!] Instalando navegadores de Playwright (Chromium)...
python -m playwright install chromium
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo instalar Chromium para Playwright.
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo   CONFIGURACION COMPLETADA EXITOSAMENTE
echo   Ya puedes usar la sincronizacion en esta PC.
echo ===================================================
pause
