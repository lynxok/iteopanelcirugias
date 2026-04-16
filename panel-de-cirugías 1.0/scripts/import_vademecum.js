
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Read .env.local manually
const envPath = path.join(__dirname, '../.env.local');
let supabaseUrl = '';
let supabaseKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            const cleanValue = value.trim().replace(/^['"]|['"]$/g, '');
            if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = cleanValue;
            // Prefer Service Role Key if available
            if (key.trim() === 'VITE_SUPABASE_SERVICE_ROLE_KEY') supabaseKey = cleanValue;
        }
    });

    if (!supabaseKey) {
        // Fallback to anon key
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                const cleanValue = value.trim().replace(/^['"]|['"]$/g, '');
                if (key.trim() === 'VITE_SUPABASE_ANON_KEY') supabaseKey = cleanValue;
            }
        });
    }

} catch (e) {
    console.error('Error reading .env.local:', e);
    process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

console.log('Using Supabase Key starts with:', supabaseKey.substring(0, 10) + '...');

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function importVademecum() {
    console.log('Starting import...');

    // 2. Read existing items
    const { data: existingItems, error: fetchError } = await supabase
        .schema('quirofano')
        .from('catalog_items')
        .select('name');

    if (fetchError) {
        console.error('Error fetching existing items:', fetchError);
        return;
    }

    const existingNames = new Set(existingItems.map(i => i.name.toLowerCase().trim()));
    console.log(`Found ${existingNames.size} existing items.`);

    // 3. Read Excel
    const filePath = path.join(__dirname, '../planilla excel de pedidos.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = 'Items de cirugía';
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
        console.error(`Sheet "${sheetName}" not found.`);
        return;
    }

    // Read from row 2 (index 2) where headers are, data starts at row 3
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 3 });

    const newItems = [];

    rows.forEach(row => {
        const name = row[1]; // Column B is name
        if (name && typeof name === 'string') {
            const cleanName = name.trim();
            if (cleanName && !existingNames.has(cleanName.toLowerCase())) {
                newItems.push({
                    name: cleanName,
                    category: 'surgery', // Default to surgery
                    active: true
                });
                existingNames.add(cleanName.toLowerCase()); // Avoid duplicates within import
            }
        }
    });

    console.log(`Found ${newItems.length} new items to insert.`);

    if (newItems.length === 0) {
        console.log('No new items to insert.');
        return;
    }

    // 4. Insert in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
        const batch = newItems.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase
            .schema('quirofano')
            .from('catalog_items')
            .insert(batch);

        if (insertError) {
            console.error(`Error inserting batch ${i}:`, insertError);
        } else {
            console.log(`Inserted batch ${i} - ${i + batch.length}`);
        }
    }

    console.log('Import finished.');
}

importVademecum();
