
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    runOserScraper: (nuc, showBrowser, options) => ipcRenderer.invoke('run-oser-scraper', nuc, showBrowser, options),
    stopOserScraper: () => ipcRenderer.invoke('stop-oser-scraper'),
    readOserData: (nuc) => ipcRenderer.invoke('read-oser-data', nuc),
    onScraperLog: (callback) => ipcRenderer.on('scraper-log', (event, message) => callback(message)),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', () => callback()),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, percent) => callback(percent)),
    restartApp: () => ipcRenderer.send('restart-app'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    onUpdateMessage: (callback) => ipcRenderer.on('update-message', (_event, value) => callback(value))
});
