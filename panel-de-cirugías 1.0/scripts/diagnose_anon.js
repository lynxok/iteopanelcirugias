
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Read keys
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

async function checkAnonAccess() {
    console.log(`\nChecking Anon access...`);
    // Use schema 'quirofano' as per supabase.ts
    const client = createClient(supabaseUrl, anonKey, {
        db: { schema: 'quirofano' },
        auth: { persistSession: false, autoRefreshToken: false }
    });

    // Check users (should be readable if app works)
    const { data: users, error: userError, count: userCount } = await client
        .from('users')
        .select('*', { count: 'exact', head: true });

    if (userError) {
        console.error('Error reading users as ANON:', userError.message);
    } else {
        console.log(`Success reading users as ANON. Count: ${userCount}`);
    }

    // Check catalog_items
    const { data: catalog, error: catError, count: catCount } = await client
        .from('catalog_items')
        .select('*', { count: 'exact', head: true });

    if (catError) {
        console.error('Error reading catalog_items as ANON:', catError.message);
    } else {
        console.log(`Reading catalog_items as ANON. Count: ${catCount}`);
    }
}

checkAnonAccess();
