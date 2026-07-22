
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    runOserScraper: (nuc, showBrowser, options) => ipcRenderer.invoke('run-oser-scraper', nuc, showBrowser, options),
    runOserWriterScraper: (action, nuc, patientName, documentNumber, address, sexo, localidad) => ipcRenderer.invoke('run-oser-writer-scraper', action, nuc, patientName, documentNumber, address, sexo, localidad),
    stopOserScraper: () => ipcRenderer.invoke('stop-oser-scraper'),
    readOserData: (nuc) => ipcRenderer.invoke('read-oser-data', nuc),
    openOserPortal: (nuc) => ipcRenderer.invoke('open-oser-portal', nuc),
    onScraperLog: (callback) => ipcRenderer.on('scraper-log', (event, message) => callback(message)),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', () => callback()),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback()),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, percent) => callback(percent)),
    restartApp: () => ipcRenderer.send('restart-app'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    onUpdateMessage: (callback) => ipcRenderer.on('update-message', (_event, value) => callback(value)),
    downloadSincronizador: () => ipcRenderer.invoke('download-sincronizador'),
    checkDependencies: () => ipcRenderer.invoke('check-dependencies'),
    installDependencies: () => ipcRenderer.invoke('install-dependencies'),
    onInstallProgress: (callback) => ipcRenderer.on('install-progress', (_event, msg) => callback(msg)),
    printWristband: (surgeryId) => ipcRenderer.invoke('print-wristband', surgeryId),
    sendReadyToPrint: (printerName) => ipcRenderer.send('ready-to-print', printerName),
    print: (printerName) => ipcRenderer.send('ready-to-print', printerName),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    savePDF: (defaultName) => ipcRenderer.invoke('save-pdf', defaultName),
    saveFile: (fileContent, defaultName, fileType) => ipcRenderer.invoke('save-file', fileContent, defaultName, fileType),
    obsRenameVideo: (tempFilePath, globalDestFolder, doctorName, patientName) => ipcRenderer.invoke('obs:rename-video', tempFilePath, globalDestFolder, doctorName, patientName),
    obsGetScreenshotPath: (globalDestFolder, doctorName, patientName) => ipcRenderer.invoke('obs:get-screenshot-path', globalDestFolder, doctorName, patientName),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    setAppPreference: (key, value) => ipcRenderer.invoke('set-app-preference', key, value),
    getAppPreference: (key) => ipcRenderer.invoke('get-app-preference', key)
});
