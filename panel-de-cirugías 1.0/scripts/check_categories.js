
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '../.env.local');
let supabaseUrl = '';
let anonKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            const cleanValue = value.trim().replace(/^['"]|['"]$/g, '');
            if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = cleanValue;
            if (key.trim() === 'VITE_SUPABASE_ANON_KEY') anonKey = cleanValue;
        }
    });
} catch (e) {
    console.error('Error reading .env.local');
    process.exit(1);
}

async function checkCategories() {
    console.log(`\nChecking Categories...`);
    const client = createClient(supabaseUrl, anonKey, {
        db: { schema: 'quirofano' },
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await client
        .from('catalog_items')
        .select('category');

    if (error) {
        console.error('Error reading categories:', error.message);
        return;
    }

    const counts = {};
    data.forEach(item => {
        const cat = item.category || 'NULL';
        counts[cat] = (counts[cat] || 0) + 1;
    });

    console.log('Category Counts:', counts);
}

checkCategories();
