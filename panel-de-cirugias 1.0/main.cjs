const { app, BrowserWindow, ipcMain, dialog, session, Menu, Tray } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

// --- CARGAR VARIABLES DE ENTORNO LOCALES (.env.local) ---
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    try {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const parts = trimmed.split('=');
                const key = parts[0].trim();
                const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                if (key && val) {
                    process.env[key] = val;
                }
            }
        });
        console.log('[Electron] Variables de entorno de .env.local cargadas de forma manual.');
    } catch (e) {
        console.error('[Electron] Error al leer .env.local:', e);
    }
}

// --- CARGAR CONFIGURACIÓN DE TRAY Y AUTO-LAUNCH ---
const configPath = path.join(app.getPath('userData'), 'app-config.json');
let appConfig = {
    autoLaunch: false,
    closeToTray: false
};

try {
    if (fs.existsSync(configPath)) {
        appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.error('Error al leer app-config.json:', e);
}

// Handlers de IPC para preferencias
ipcMain.handle('set-app-preference', (event, key, value) => {
    appConfig[key] = value;
    try {
        fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
        if (key === 'autoLaunch') {
            app.setLoginItemSettings({
                openAtLogin: value,
                args: value ? ['--hidden'] : []
            });
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-app-preference', (event, key) => {
    return appConfig[key];
});

let tray = null;
function createTray() {
    const iconPath = path.join(__dirname, 'dist', 'favicon.png');
    if (!fs.existsSync(iconPath)) {
        console.log('[System Tray] No se encontró el favicon.png, no se inicia el Tray.');
        return;
    }

    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Abrir Panel de Cirugías',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Salir de la aplicación',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Panel de Cirugías ITEO');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

let activeScraperProcess = null;
let mainWindow;

// --- BLOQUEO DE INSTANCIA ÚNICA ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// Configuración de logs simples para depuración de actualizaciones
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.verifyUpdateCodeSignature = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Panel de Cirugías ITEO",
        icon: path.join(__dirname, 'dist', 'favicon.png'),
        show: !process.argv.includes('--hidden'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        }
    });

    // Controlar evento close para ocultar en Tray en lugar de cerrar
    mainWindow.on('close', (event) => {
        if (appConfig.closeToTray && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // En desarrollo usamos el servidor de Vite, en producción el archivo index.html
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:3005');
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    // Abrir enlaces externos en el navegador predeterminado del sistema
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            if (!url.includes('localhost:3005') && !url.includes('127.0.0.1')) {
                const { shell } = require('electron');
                shell.openExternal(url);
                return { action: 'deny' };
            }
        }
        return { action: 'allow' };
    });

    // --- EVENTOS DEL AUTO-UPDATER ---
    
    autoUpdater.on('update-available', () => {
        mainWindow.webContents.send('update-available');
    });

    autoUpdater.on('update-downloaded', () => {
        mainWindow.webContents.send('update-downloaded');
    });

    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow.webContents.send('download-progress', progressObj.percent);
    });
}

app.whenReady().then(() => {
    // Configurar permiso automático para cámara en la app
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            return callback(true);
        }
        callback(false);
    });

    createWindow();
    createTray();
    
    // Solo buscamos actualizaciones si la app está empaquetada
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Manejador para reiniciar e instalar la actualización
ipcMain.on('restart-app', () => {
    autoUpdater.quitAndInstall();
});

// Forzar ignorar errores de certificado SSL para el actualizador
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Manejo de actualizaciones manuales desde la UI
ipcMain.handle('check-for-updates', async () => {
    if (app.isPackaged) {
        try {
            mainWindow.webContents.send('update-message', 'Conectando con GitHub Releases...');
            const result = await autoUpdater.checkForUpdates();
            return { success: true, result };
        } catch (error) {
            console.error('Error manual check:', error);
            mainWindow.webContents.send('update-message', `Error de conexión: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    return { success: false, message: 'App no empaquetada (Modo Desarrollo)' };
});

autoUpdater.on('error', (err) => {
    console.error('Updater error:', err);
    mainWindow.webContents.send('update-message', 'Error crítico: ' + (err.message || err.toString()));
});

autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-message', 'Buscando nuevas versiones en GitHub...');
});

autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-message', '¡Actualización disponible! Descargando...');
});

autoUpdater.on('update-not-available', (info) => {
    mainWindow.webContents.send('update-message', 'La App ya está en la última versión.');
});

autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-message', 'Error al buscar actualizaciones: ' + err.message);
});

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update-message', `Descargando: ${Math.round(progressObj.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-message', 'Actualización descargada. Se instalará al reiniciar.');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (!appConfig.closeToTray) {
            app.quit();
        }
    }
});

// --- HELPER PARA CREDENCIALES SEGURAS ---
function getOserCredentials() {
    const { safeStorage } = require('electron');
    const configDir = path.join(app.getPath('userData'), 'Config');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    const configPath = path.join(configDir, 'oser_credentials.enc');

    // Si ya existe el archivo cifrado localmente, descifrarlo
    if (fs.existsSync(configPath)) {
        try {
            const encryptedData = fs.readFileSync(configPath);
            if (safeStorage.isEncryptionAvailable()) {
                const decryptedString = safeStorage.decryptString(encryptedData);
                const creds = JSON.parse(decryptedString);
                if (creds.user && creds.password) {
                    return creds;
                }
            }
        } catch (e) {
            console.error('[Electron SafeStorage] Error al descifrar credenciales locales, re-migrando:', e);
        }
    }

    // Fallback/Migración transparente:
    // 1. Verificar variables de entorno
    const envUser = process.env.OSER_USER;
    const envPass = process.env.OSER_PASSWORD;
    
    // 2. Si no están en entorno, usar el hardcoded de respaldo actual
    const defaultUser = envUser || 'iteo';
    const defaultPass = envPass || 'iln518HB';

    // Cifrar y guardar localmente para el futuro si la encriptación está disponible
    try {
        if (safeStorage.isEncryptionAvailable()) {
            const credentialsJson = JSON.stringify({ user: defaultUser, password: defaultPass });
            const encrypted = safeStorage.encryptString(credentialsJson);
            fs.writeFileSync(configPath, encrypted);
            console.log('[Electron SafeStorage] Credenciales de OSER cifradas y guardadas localmente.');
        }
    } catch (e) {
        console.error('[Electron SafeStorage] Error al guardar credenciales cifradas:', e);
    }

    return { user: defaultUser, password: defaultPass };
}

// --- IPC HANDLERS PARA EL SCRAPER ---

ipcMain.handle('run-oser-scraper', async (event, nuc, showBrowser, options = {}) => {
    return new Promise((resolve, reject) => {
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        
        // En producción, extraResources pone el script en process.resourcesPath
        const scraperDir = isDev 
            ? path.join(__dirname, 'sai-scraper', 'sai-scraper')
            : process.resourcesPath;
            
        const scraperPath = 'scraper.py'; 

        console.log(`[Electron] Scraper Dir: ${scraperDir}`);
        console.log(`[Electron] Scraper Path: ${scraperPath}`);
        event.sender.send('scraper-log', `[Electron] Iniciando scraper en: ${path.join(scraperDir, scraperPath)}`);

        console.log(`[Electron] Modo Visual: ${showBrowser} | Opciones:`, options);
        
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
        
        const args = [scraperPath, nuc];
        if (showBrowser === true) {
            args.push('--show');
        }

        // Añadir argumentos extra para auditoría histórica si existen
        if (options.status) {
            args.push('--status', options.status);
        }
        if (options.startDate) {
            args.push('--start', options.startDate);
        }
        if (options.endDate) {
            args.push('--end', options.endDate);
        }

        // Inyectar de forma segura variables de entorno al proceso hijo
        const oserCreds = getOserCredentials();
        const childEnv = {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            OSER_USER: oserCreds.user,
            OSER_PASSWORD: oserCreds.password
        };

        const pythonProcess = spawn(pythonCommand, args, {
            cwd: scraperDir,
            env: childEnv
        });

        activeScraperProcess = pythonProcess;

        // Redirigir la salida del scraper a la consola de la App
        pythonProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    event.sender.send('scraper-log', line.trim());
                }
            });
        });

        pythonProcess.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    event.sender.send('scraper-log', `[ERROR] ${line.trim()}`);
                }
            });
        });

        pythonProcess.on('close', (code) => {
            activeScraperProcess = null;
            
            // Intentar primero en C:\ y luego en AppData (debe coincidir con scraper.py)
            let baseDir = "C:\\ITEO_Oser_Sync";
            if (!fs.existsSync(baseDir)) {
                baseDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ITEO_Oser_Sync');
            }
            
            const resultPath = path.join(baseDir, `historial_${nuc}.json`);
            event.sender.send('scraper-log', `[Electron] Buscando resultado en: ${resultPath}`);
            
            if (fs.existsSync(resultPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
                    resolve({ success: true, data });
                } catch (e) {
                    resolve({ success: false, error: 'Error al leer el JSON: ' + e.message });
                }
            } else {
                // Si el código es 0, es un éxito aunque no haya archivo nuevo (tal vez no hubo cambios)
                if (code === 0) {
                    resolve({ success: true, data: null, message: 'Proceso finalizado (sin cambios nuevos).' });
                } else {
                    resolve({ 
                        success: false, 
                        error: `El scraper terminó con error (Código ${code}).` 
                    });
                }
            }
        });

        pythonProcess.on('error', (err) => {
            if (err.code === 'ENOENT') {
                resolve({ 
                    success: false, 
                    error: `No se encontró el ejecutable de Python (${pythonCommand}). Asegúrate de que Python esté instalado y en el PATH del sistema.` 
                });
            } else {
                resolve({ success: false, error: 'Error al iniciar el proceso: ' + err.message });
            }
        });
    });
});

ipcMain.handle('run-oser-writer-scraper', async (event, action, nuc, patientName, documentNumber, address, sexo, localidad) => {
    return new Promise((resolve, reject) => {
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        
        const scraperDir = isDev 
            ? path.join(__dirname, 'sai-scraper', 'sai-scraper')
            : process.resourcesPath;
            
        const scraperPath = 'writer_scraper.py'; 

        console.log(`[Electron] Writer Scraper Dir: ${scraperDir}`);
        console.log(`[Electron] Writer Scraper Path: ${scraperPath}`);
        event.sender.send('scraper-log', `[Electron] Iniciando scraper de escritura en: ${path.join(scraperDir, scraperPath)}`);
        
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
        
        const args = [
            scraperPath, 
            action || 'ingreso',
            nuc, 
            patientName || '', 
            documentNumber || '', 
            address || '',
            sexo || '',
            localidad || ''
        ];

        // Nota: Por defecto writer_scraper.py corre con show_browser=True, 
        // a menos que queramos pasar algún flag, pero lo dejamos visible por defecto.

        const oserCreds = getOserCredentials();
        const childEnv = {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            OSER_USER: oserCreds.user,
            OSER_PASSWORD: oserCreds.password
        };

        const pythonProcess = spawn(pythonCommand, args, {
            cwd: scraperDir,
            env: childEnv
        });

        activeScraperProcess = pythonProcess;

        pythonProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    event.sender.send('scraper-log', `[Escritura] ${line.trim()}`);
                }
            });
        });

        pythonProcess.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    event.sender.send('scraper-log', `[Escritura ERROR] ${line.trim()}`);
                }
            });
        });

        pythonProcess.on('close', (code) => {
            activeScraperProcess = null;
            if (code === 0) {
                resolve({ success: true, message: 'Proceso de registro e ingreso en OSER finalizado con éxito.' });
            } else {
                resolve({ success: false, error: `El scraper de escritura terminó con código ${code}.` });
            }
        });

        pythonProcess.on('error', (err) => {
            if (err.code === 'ENOENT') {
                resolve({ 
                    success: false, 
                    error: `No se encontró el ejecutable de Python (${pythonCommand}). Asegúrate de que Python esté instalado.` 
                });
            } else {
                resolve({ success: false, error: 'Error al iniciar el proceso: ' + err.message });
            }
        });
    });
});


ipcMain.handle('stop-oser-scraper', async () => {
    if (activeScraperProcess) {
        activeScraperProcess.kill();
        activeScraperProcess = null;
        return { success: true };
    }
    return { success: false, error: 'No hay ningún proceso activo.' };
});

ipcMain.handle('open-oser-portal', async (event, nuc) => {
    return new Promise((resolve) => {
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        const scraperDir = isDev 
            ? path.join(__dirname, 'sai-scraper', 'sai-scraper')
            : process.resourcesPath;
            
        const scraperPath = 'open_oser.py'; 
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
        
        const args = [scraperPath, nuc];
        const oserCreds = getOserCredentials();
        const childEnv = {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            OSER_USER: oserCreds.user,
            OSER_PASSWORD: oserCreds.password
        };

        const pythonProcess = spawn(pythonCommand, args, {
            cwd: scraperDir,
            env: childEnv
        });

        let hasResolved = false;

        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            console.log(`[Open OSER] ${output}`);
            
            if (!hasResolved) {
                if (output.includes("STATUS: OPENED")) {
                    hasResolved = true;
                    resolve({ success: true });
                } else if (output.includes("STATUS: NOT_FOUND")) {
                    hasResolved = true;
                    resolve({ success: false, error: 'Paciente no encontrado en OSER en los estados Abiertas, Pendientes o Cerradas.' });
                } else if (output.includes("STATUS: ERROR")) {
                    hasResolved = true;
                    const errorMsg = output.substring(output.indexOf("STATUS: ERROR") + 13).trim();
                    resolve({ success: false, error: errorMsg || 'Error desconocido al buscar en el portal.' });
                }
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`[Open OSER ERROR] ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            if (!hasResolved) {
                hasResolved = true;
                if (code === 0) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: `El proceso terminó inesperadamente con código ${code}.` });
                }
            }
        });

        pythonProcess.on('error', (err) => {
            if (!hasResolved) {
                hasResolved = true;
                resolve({ success: false, error: `Error al iniciar el script: ${err.message}` });
            }
        });
    });
});

ipcMain.handle('read-oser-data', async (event, nuc) => {
    let baseDir = "C:\\ITEO_Oser_Sync";
    if (!fs.existsSync(baseDir)) {
        baseDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ITEO_Oser_Sync');
    }
    const resultPath = path.join(baseDir, `historial_${nuc}.json`);
    if (fs.existsSync(resultPath)) {
        try {
            return { success: true, data: JSON.parse(fs.readFileSync(resultPath, 'utf8')) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
    return { success: false, error: 'No data' };
});

ipcMain.handle('download-sincronizador', async (event) => {
    try {
        const sourcePath = path.join(__dirname, 'CONFIGURAR_SINCRONIZADOR.bat');
        if (!fs.existsSync(sourcePath)) {
            return { success: false, error: 'El archivo configurador no se encuentra en el paquete de la aplicacion.' };
        }

        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Guardar Configurador de Sincronizador',
            defaultPath: 'CONFIGURAR_SINCRONIZADOR.bat',
            filters: [
                { name: 'Archivos de Lotes de Windows (*.bat)', extensions: ['bat'] }
            ]
        });

        if (!filePath) {
            return { success: false, cancelled: true };
        }

        fs.copyFileSync(sourcePath, filePath);
        return { success: true, path: filePath };
    } catch (err) {
        console.error('Error al descargar sincronizador:', err);
        return { success: false, error: err.message };
    }
});

// Helper para ejecutar comandos de verificación
function runCheckCommand(cmd) {
    return new Promise((resolve) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                resolve({ success: false, code: err.code, stderr });
            } else {
                resolve({ success: true, stdout });
            }
        });
    });
}

// Handler para verificar si están instalados Python, Playwright y Chromium
ipcMain.handle('check-dependencies', async () => {
    try {
        // 1. Verificar Python
        const pythonCheck = await runCheckCommand('python --version');
        if (!pythonCheck.success) {
            return { ok: false, status: 'missing_python' };
        }

        // 2. Verificar librería playwright en Python
        const playwrightCheck = await runCheckCommand('python -c "import playwright"');
        if (!playwrightCheck.success) {
            return { ok: false, status: 'missing_playwright' };
        }

        // 3. Verificar navegadores de Playwright (Chromium)
        const chromiumCheck = await runCheckCommand('python -c "from playwright.sync_api import sync_playwright; p = sync_playwright().start(); b = p.chromium.launch(headless=True); b.close(); p.stop()"');
        if (!chromiumCheck.success) {
            return { ok: false, status: 'missing_chromium' };
        }

        return { ok: true, status: 'ok' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

// Handler para instalar las dependencias automáticamente
ipcMain.handle('install-dependencies', async (event) => {
    const sendLog = (message) => {
        event.sender.send('install-progress', message);
    };

    try {
        // 1. Instalar Python si falta
        const pythonCheck = await runCheckCommand('python --version');
        if (!pythonCheck.success) {
            sendLog('Python no detectado. Iniciando descarga del instalador...');
            
            const tempDir = app.getPath('temp');
            const installerPath = path.join(tempDir, 'python_installer.exe');
            
            const url = 'https://www.python.org/ftp/python/3.11.5/python-3.11.5-amd64.exe';
            const https = require('https');
            
            await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(installerPath);
                https.get(url, (response) => {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(resolve);
                    });
                }).on('error', (err) => {
                    fs.unlink(installerPath, () => {});
                    reject(err);
                });
            });

            sendLog('Instalando Python en segundo plano... Por favor espere.');
            
            await new Promise((resolve, reject) => {
                const child = spawn(installerPath, ['/quiet', 'InstallAllUsers=1', 'PrependPath=1']);
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`El instalador de Python falló con código ${code}`));
                });
                child.on('error', reject);
            });
            
            try { fs.unlinkSync(installerPath); } catch(e) {}
            sendLog('Python instalado correctamente. Configurando rutas del sistema...');

            // Agregar directorios de Python al PATH del proceso actual en caliente
            const possiblePaths = [
                'C:\\Program Files\\Python311',
                'C:\\Program Files\\Python311\\Scripts',
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311'),
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'Scripts'),
            ];
            
            const pathsToAdd = possiblePaths.filter(p => fs.existsSync(p));
            if (pathsToAdd.length > 0) {
                process.env.PATH = pathsToAdd.join(';') + ';' + process.env.PATH;
                sendLog('Rutas de Python configuradas en memoria.');
            } else {
                sendLog('Python instalado. Se recomienda reiniciar la app si la sincronización falla.');
            }
        } else {
            sendLog('Python ya está instalado.');
        }

        // 2. Actualizar pip
        sendLog('Actualizando pip...');
        await new Promise((resolve) => {
            const child = spawn('python', ['-m', 'pip', 'install', '--upgrade', 'pip']);
            child.on('close', resolve);
            child.on('error', resolve);
        });

        // 3. Instalar playwright en python
        sendLog('Instalando paquete de navegación de Playwright...');
        await new Promise((resolve, reject) => {
            const child = spawn('python', ['-m', 'pip', 'install', 'playwright']);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`La instalación de playwright falló con código ${code}`));
            });
            child.on('error', reject);
        });

        // 4. Instalar Chromium para playwright
        sendLog('Descargando navegadores automatizados (Chromium)...');
        await new Promise((resolve, reject) => {
            const child = spawn('python', ['-m', 'playwright', 'install', 'chromium']);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`La instalación de Chromium falló con código ${code}`));
            });
            child.on('error', reject);
        });

        sendLog('¡Configuración completada con éxito!');
        return { success: true };

    } catch (error) {
        console.error('Error configurando dependencias:', error);
        sendLog(`ERROR: ${error.message}`);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-app-info', () => {
    return {
        version: app.getVersion(),
        isElectron: true
    };
});

ipcMain.handle('print-wristband', async (event, surgeryId) => {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    // Crear una ventana oculta o visible para la pulsera
    // (Ajustamos tamaño de acuerdo a la pulsera 280x30mm aproximado en pantalla)
    const printWindow = new BrowserWindow({
        width: 850,
        height: 450,
        title: 'Imprimir Pulsera - ITEO',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Deshabilitar menú por defecto
    printWindow.setMenu(null);

    if (isDev) {
        printWindow.loadURL(`http://localhost:3005/#/print-wristband/${surgeryId}`);
    } else {
        printWindow.loadFile(path.join(__dirname, 'dist', 'index.html'), {
            hash: `/print-wristband/${surgeryId}`
        });
    }
});

// Listener para imprimir sin márgenes ni cabeceras/pies de página (evita "Consola de configuración" y "sistema...")
ipcMain.on('ready-to-print', (event, printerName) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (!win) return;

    // Loggear URL y título para diagnóstico
    console.log(`[Electron Print] ready-to-print recibido. URL del remitente: "${webContents.getURL()}" | Título: "${webContents.getTitle()}"`);

    const printOptions = {
        silent: !!printerName,
        printBackground: true,
        landscape: true,
        margins: {
            marginType: 'none'
        },
        marginsType: 1, // Fallback legacy de Electron para forzar ocultación de cabeceras/pies de página
        pageRanges: [{ from: 0, to: 0 }]
    };

    if (printerName) {
        printOptions.deviceName = printerName;
        console.log(`[Electron Print] Intentando imprimir silenciosamente en: "${printerName}"`);
    } else {
        console.log(`[Electron Print] No se especificó impresora. Abriendo diálogo nativo.`);
    }

    webContents.print(printOptions, (success, failureReason) => {
        console.log(`[Electron Print] Resultado impresión: success=${success}, error=${failureReason}`);
        if (win !== mainWindow && !win.isDestroyed()) {
            win.close();
        }
    });
});

// Handler para obtener la lista de impresoras del sistema
ipcMain.handle('get-printers', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            return await mainWindow.webContents.getPrintersAsync();
        } catch (err) {
            console.error('Error al obtener impresoras:', err);
            return [];
        }
    }
    return [];
});

ipcMain.handle('save-pdf', async (event, defaultName) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar PDF',
        defaultPath: defaultName || 'Reporte.pdf',
        filters: [
            { name: 'Documentos PDF (*.pdf)', extensions: ['pdf'] }
        ]
    });

    if (!filePath) {
        return { success: false, cancelled: true };
    }

    try {
        const data = await event.sender.printToPDF({
            margins: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            },
            pageSize: 'A4',
            printBackground: true
        });

        fs.writeFileSync(filePath, data);
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Error generating PDF:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-file', async (event, fileContent, defaultName, fileType) => {
    const filters = [];
    if (fileType === 'xlsx') {
        filters.push({ name: 'Archivos Excel (*.xlsx)', extensions: ['xlsx'] });
    } else if (fileType === 'csv') {
        filters.push({ name: 'Archivos CSV (*.csv)', extensions: ['csv'] });
    } else {
        filters.push({ name: 'Todos los Archivos (*.*)', extensions: ['*'] });
    }

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar Archivo',
        defaultPath: defaultName || 'archivo',
        filters: filters
    });

    if (!filePath) {
        return { success: false, cancelled: true };
    }

    try {
        let buffer;
        if (typeof fileContent === 'string') {
            if (fileContent.startsWith('data:')) {
                const base64Data = fileContent.split(';base64,').pop();
                buffer = Buffer.from(base64Data, 'base64');
            } else {
                buffer = Buffer.from(fileContent, 'utf-8');
            }
        } else {
            // Buffer o Uint8Array/ArrayBuffer enviado desde el Renderer
            buffer = Buffer.from(fileContent);
        }
        
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Error saving file:', error);
        return { success: false, error: error.message };
    }
});

// Handler to move and rename OBS video files into doctor-specific subfolders
ipcMain.handle('obs:rename-video', async (event, tempFilePath, globalDestFolder, doctorName, patientName) => {
    try {
        if (!tempFilePath || !globalDestFolder || !doctorName || !patientName) {
            throw new Error('Faltan parámetros requeridos para renombrar el video.');
        }

        // Check if the temporary recording exists
        if (!fs.existsSync(tempFilePath)) {
            throw new Error(`El archivo de grabación temporal no existe en la ruta: ${tempFilePath}`);
        }

        // Sanitizer helper for directory and file names (valid names on Windows)
        const sanitize = (name) => {
            return name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") // Remove accents/diacritics
                .replace(/[^a-zA-Z0-9_\-\s]/g, '') // Remove illegal characters
                .trim()
                .replace(/\s+/g, '_'); // Replace spaces with underscores
        };

        const cleanDoctorName = sanitize(doctorName) || 'Medico_No_Especificado';
        const cleanPatientName = sanitize(patientName) || 'Paciente_No_Especificado';

        // Format date/timestamp for uniqueness
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

        // Create the doctor-specific subfolder if it doesn't exist
        const doctorFolderPath = path.join(globalDestFolder, cleanDoctorName);
        if (!fs.existsSync(doctorFolderPath)) {
            fs.mkdirSync(doctorFolderPath, { recursive: true });
        }

        // Extract original extension (usually .mp4, .mkv, etc.)
        const ext = path.extname(tempFilePath) || '.mp4';
        
        // Final filename
        const finalFileName = `Artroscopia_${cleanPatientName}_${timestamp}${ext}`;
        const finalFilePath = path.join(doctorFolderPath, finalFileName);

        // Move and rename with async retry logic (prevents EBUSY/lock errors from OBS muxer)
        let retries = 10;
        let delay = 500;
        let success = false;
        let lastError = null;

        for (let i = 0; i < retries; i++) {
            try {
                fs.renameSync(tempFilePath, finalFilePath);
                success = true;
                break;
            } catch (err) {
                lastError = err;
                console.warn(`[OBS Integration] Intento ${i + 1} de renombrado falló (archivo ocupado). Reintentando en ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        if (!success) {
            throw lastError || new Error('No se pudo renombrar el archivo de grabación después de varios intentos (bloqueado por OBS).');
        }

        console.log(`[OBS Integration] Video renombrado exitosamente: ${finalFilePath}`);
        return { success: true, path: finalFilePath };
    } catch (error) {
        console.error('[OBS Integration] Error al renombrar el video:', error);
        return { success: false, error: error.message };
    }
});

// Handler to generate safe screenshot path and create doctor folder
ipcMain.handle('obs:get-screenshot-path', async (event, globalDestFolder, doctorName, patientName) => {
    try {
        if (!globalDestFolder || !doctorName || !patientName) {
            throw new Error('Faltan parámetros requeridos para generar la ruta de captura.');
        }

        const sanitize = (name) => {
            return name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") // Remove accents/diacritics
                .replace(/[^a-zA-Z0-9_\-\s]/g, '') // Remove illegal characters
                .trim()
                .replace(/\s+/g, '_'); // Replace spaces with underscores
        };

        const cleanDoctorName = sanitize(doctorName) || 'Medico_No_Especificado';
        const cleanPatientName = sanitize(patientName) || 'Paciente_No_Especificado';

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

        const doctorFolderPath = path.join(globalDestFolder, cleanDoctorName);
        if (!fs.existsSync(doctorFolderPath)) {
            fs.mkdirSync(doctorFolderPath, { recursive: true });
        }

        const finalFileName = `Captura_${cleanPatientName}_${timestamp}.png`;
        const finalFilePath = path.join(doctorFolderPath, finalFileName);

        return { success: true, path: finalFilePath };
    } catch (error) {
        console.error('[OBS Integration] Error al generar ruta de captura:', error);
        return { success: false, error: error.message };
    }
});

// Handler to open directory selection dialog
ipcMain.handle('select-directory', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Seleccionar Carpeta de Destino de Grabaciones',
            properties: ['openDirectory', 'createDirectory']
        });
        return filePaths[0] || null;
    } catch (error) {
        console.error('Error al seleccionar directorio:', error);
        return null;
    }
});


