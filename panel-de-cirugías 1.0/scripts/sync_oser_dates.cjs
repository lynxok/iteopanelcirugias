
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuración de rutas
const BASE_PATH = path.resolve(__dirname, '..');
const SCRAPER_PATH = path.join(BASE_PATH, 'sai-scraper', 'sai-scraper');
const ENV_PATH = path.join(BASE_PATH, '.env.local');

// Modo simulación por defecto
const DRY_RUN = true; 

// Cargamos variables de entorno manualmente desde .env.local
try {
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
            process.env[key] = value;
        }
    });
} catch (e) {
    console.log('No se pudo cargar .env.local', e.message);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Faltan las credenciales de Supabase (URL o Key).');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'quirofano' }
});

/**
 * Ejecuta el scraper de Python para un NUC específico
 */
function runScraper(nuc) {
    return new Promise((resolve, reject) => {
        console.log(`[Scraper] Iniciando para NUC: ${nuc}...`);
        
        const pythonProcess = spawn('python', ['scraper.py', nuc], {
            cwd: SCRAPER_PATH
        });

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`El scraper falló con código ${code}: ${errorOutput}`));
            }

            const resultPath = path.join(SCRAPER_PATH, `historial_${nuc}.json`);
            if (fs.existsSync(resultPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
                    resolve(data);
                } catch (e) {
                    reject(new Error(`Error al leer el JSON de resultados: ${e.message}`));
                }
            } else {
                reject(new Error('No se encontró el archivo de resultados del scraper.'));
            }
        });
    });
}

/**
 * Convierte fecha de formato DD-MM-YYYY a YYYY-MM-DD
 */
function formatToISO(dateStr) {
    if (!dateStr || dateStr === "No encontrada") return null;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return null;
}

/**
 * Verifica si un string es puramente numérico
 */
function isNumeric(str) {
    return /^\d+$/.test(str);
}

/**
 * Normaliza un texto para comparación
 */
function normalizeText(text) {
    if (!text) return "";
    return text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/\s+/g, ' ') // Espacios múltiples a uno solo
        .trim();
}

/**
 * Compara procedimientos buscando palabras clave compartidas
 */
function compareProcedures(appProc, oserProc) {
    const s1 = normalizeText(appProc);
    const s2 = normalizeText(oserProc);
    
    if (s1.includes(s2) || s2.includes(s1)) return true;

    // Si no es substring exacto, miramos si las palabras importantes coinciden
    const words1 = s1.split(' ').filter(w => w.length > 3);
    const words2 = s2.split(' ').filter(w => w.length > 3);
    
    // Si al menos 2 palabras largas coinciden, lo damos por bueno (ajustable)
    let matches = 0;
    words1.forEach(w1 => {
        if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) matches++;
    });
    
    return matches >= 2;
}

async function sync() {
    console.log('=== SINCRONIZACIÓN DE AUTORIZACIONES OSER (V2.1) ===');
    console.log(DRY_RUN ? '>>> MODO SIMULACIÓN <<<' : '>>> MODO REAL <<<');

    console.log('\n[DB] Buscando cirugías de OSER...');
    
    const { data: surgeries, error } = await supabase
        .from('surgeries')
        .select(`
            id, 
            medical_coverage, 
            status, 
            authorization_date,
            procedure_name,
            patients (nuc, full_name)
        `)
        .ilike('medical_coverage', '%OSER%')
        .neq('status', 'completed');

    if (error) {
        console.error('Error al consultar Supabase:', error.message);
        return;
    }

    const candidates = surgeries.filter(s => s.patients && s.patients.nuc);
    console.log(`[DB] Se encontraron ${candidates.length} cirugías activas.`);

    for (const surgery of candidates) {
        const nuc = surgery.patients.nuc.toString();
        const patientName = surgery.patients.full_name;
        const appProcedure = surgery.procedure_name || '';
        
        console.log(`\n-------------------------------------------------`);
        console.log(`PACIENTE: ${patientName} (NUC: ${nuc})`);
        console.log(`APP PROC: ${appProcedure}`);
        
        try {
            const result = await runScraper(nuc);
            
            // 1. Procesar Fecha
            const fechaProgramada = result.FechaProgramada;
            if (fechaProgramada && fechaProgramada !== "No encontrada") {
                const isoDate = formatToISO(fechaProgramada);
                console.log(`[FECHA] Encontrada en OSER: ${fechaProgramada}`);
                if (!surgery.authorization_date) {
                    if (!DRY_RUN) {
                        await supabase.from('surgeries').update({ authorization_date: isoDate }).eq('id', surgery.id);
                        console.log(`[DB] Fecha actualizada -> ${isoDate}`);
                    } else {
                        console.log(`[SIM] Se actualizaría fecha a -> ${isoDate}`);
                    }
                } else {
                    console.log(`[INFO] Ya tenía fecha en App: ${surgery.authorization_date}`);
                }
            } else {
                console.log(`[FECHA] No encontrada en OSER.`);
            }

            // 2. Procesar Prácticas Numéricas
            const oserPractices = result.Practicas || [];
            const numericPractices = oserPractices.filter(p => isNumeric(p[0]));
            
            if (numericPractices.length > 0) {
                console.log(`[OSER] Prácticas numéricas encontradas (${numericPractices.length}):`);
                numericPractices.forEach(p => {
                    const code = p[0];
                    const desc = p[1];
                    const match = compareProcedures(appProcedure, desc);
                    const status = match ? '✅ COINCIDE' : '❌ NO COINCIDE';
                    console.log(`   - ${code}: ${desc} [${status}]`);
                });
            } else {
                console.log(`[OSER] No se encontraron prácticas con código numérico.`);
            }

        } catch (err) {
            console.error(`[ERROR] NUC ${nuc}: ${err.message}`);
        }
    }

    console.log('\n=== PROCESO FINALIZADO ===');
}

sync();
