const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

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

        const pythonProcess = spawn(pythonCommand, args, {
            cwd: scraperDir
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

ipcMain.handle('stop-oser-scraper', async () => {
    if (activeScraperProcess) {
        activeScraperProcess.kill();
        activeScraperProcess = null;
        return { success: true };
    }
    return { success: false, error: 'No hay ningún proceso activo.' };
});

ipcMain.handle('get-app-info', () => {
    return {
        version: app.getVersion(),
        isElectron: true
    };
});
