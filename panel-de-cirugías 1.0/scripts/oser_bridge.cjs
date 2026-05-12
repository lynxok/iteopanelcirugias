
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3001;
const BASE_PATH = path.resolve(__dirname, '..');
const SCRAPER_PATH = path.join(BASE_PATH, 'sai-scraper', 'sai-scraper');

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'alive' }));
        return;
    }

    if (req.url.startsWith('/sync')) {
        const urlParams = new URL(req.url, `http://localhost:${PORT}`);
        const nuc = urlParams.searchParams.get('nuc');

        if (!nuc) {
            // Si no hay NUC, corremos el proceso de búsqueda de candidatos (listado)
            // Para simplicidad en este MVP, el bridge ejecutará una versión ligera del script de sincronización
            // que devuelve el JSON de diferencias.
            runSyncProcess(res);
        } else {
            // Si hay NUC, corremos solo ese
            runSingleScraper(nuc, res);
        }
        return;
    }

    res.writeHead(404);
    res.end();
});

function runSyncProcess(res) {
    console.log('[Bridge] Iniciando proceso de sincronización completa...');
    
    // Ejecutamos el script que ya creamos pero capturamos su salida JSON
    // Nota: El script sync_oser_dates.cjs imprime mucho texto. 
    // Para el bridge, lo ideal es que el script de Node devuelva un JSON estructurado.
    // Voy a crear una versión "silenciosa" o que emita JSON al final.
    
    const nodeProcess = spawn('node', ['scripts/sync_oser_dates.cjs'], {
        cwd: BASE_PATH,
        env: { ...process.env, JSON_OUTPUT: 'true' } // Pasamos una flag
    });

    let output = '';
    nodeProcess.stdout.on('data', (data) => { output += data.toString(); });
    nodeProcess.on('close', (code) => {
        // Por ahora, como el script actual es para consola, vamos a parsear lo que podamos
        // o simplemente devolver que terminó. 
        // MEJOR: Vamos a delegar la lógica de "comparación" al bridge para tener control total.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Sync process finished', code }));
    });
}

function runSingleScraper(nuc, res) {
    console.log(`[Bridge] Ejecutando scraper para NUC: ${nuc}`);
    const pythonProcess = spawn('python', ['scraper.py', nuc], {
        cwd: SCRAPER_PATH
    });

    pythonProcess.on('close', (code) => {
        const resultPath = path.join(SCRAPER_PATH, `historial_${nuc}.json`);
        if (fs.existsSync(resultPath)) {
            const data = fs.readFileSync(resultPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        } else {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'No se generó el archivo de resultados' }));
        }
    });
}

server.listen(PORT, () => {
    console.log(`[Oser Bridge] Servidor escuchando en http://localhost:${PORT}`);
});
