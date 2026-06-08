const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
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

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Panel de Cirugías ITEO",
        icon: path.join(__dirname, 'dist', 'favicon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // En desarrollo usamos el servidor de Vite, en producción el archivo index.html
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

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
    createWindow();
    
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
    if (process.platform !== 'darwin') app.quit();
});

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
        const childEnv = {
            ...process.env,
            OSER_USER: process.env.OSER_USER || 'iteo',
            OSER_PASSWORD: process.env.OSER_PASSWORD || 'iln518HB'
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

        const childEnv = {
            ...process.env,
            OSER_USER: process.env.OSER_USER || 'iteo',
            OSER_PASSWORD: process.env.OSER_PASSWORD || 'iln518HB'
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

ipcMain.handle('get-app-info', () => {
    return {
        version: app.getVersion(),
        isElectron: true
    };
});
