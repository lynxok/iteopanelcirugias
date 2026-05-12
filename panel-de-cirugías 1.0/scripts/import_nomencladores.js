import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import path from 'path';


const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'quirofano' }
});

const files = [
    {
        path: 'c:\\Users\\ignac\\OneDrive\\ITEO - Personal\\Desarrollos\\Coordinación quirofano - capital - internaciones\\Nomencladores\\Nomencladores\\Nomencladores\\Nomenclador AOTER.xlsx',
        type: 'AOTER',
        codeCol: 'Código AOTER',
        descCol: 'Descripción'
    },
    {
        path: 'c:\\Users\\ignac\\OneDrive\\ITEO - Personal\\Desarrollos\\Coordinación quirofano - capital - internaciones\\Nomencladores\\Nomencladores\\Nomencladores\\Nomencaldor OSER.xlsx',
        type: 'OSER',
        codeCol: 'Codigo OSER',
        descCol: 'Descripción'
    }
];

async function importData() {
    for (const fileInfo of files) {
        console.log(`\nImporting ${fileInfo.type}...`);
        try {
            const workbook = XLSX.readFile(fileInfo.path);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(worksheet);

            const items = rawData.map(row => ({
                code: String(row[fileInfo.codeCol] || '').trim(),
                description: String(row[fileInfo.descCol] || '').trim(),
                type: fileInfo.type,
                active: true
            })).filter(item => item.code && item.description);

            console.log(`Found ${items.length} items. Uploading in batches...`);

            // Upload in batches of 100
            const batchSize = 100;
            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);
                const { error } = await supabase
                    .from('nomenclador_items')
                    .upsert(batch, { onConflict: 'code,type' });

                if (error) {
                    console.error(`Error uploading batch starting at ${i}:`, error.message);
                } else {
                    process.stdout.write('.');
                }
            }
            console.log(`\nDone importing ${fileInfo.type}.`);
        } catch (err) {
            console.error(`Error processing ${fileInfo.type}:`, err.message);
        }
    }
}

importData();
