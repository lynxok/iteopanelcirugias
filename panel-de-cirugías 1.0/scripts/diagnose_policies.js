
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Read keys
const envPath = path.join(__dirname, '../.env.local');
let supabaseUrl = '';
let serviceKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            const cleanValue = value.trim().replace(/^['"]|['"]$/g, '');
            if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = cleanValue;
            if (key.trim() === 'VITE_SUPABASE_SERVICE_ROLE_KEY') serviceKey = cleanValue;
        }
    });
} catch (e) {
    console.error('Error reading .env.local');
    process.exit(1);
}

async function checkPolicies() {
    console.log(`\nChecking RLS policies for catalog_items...`);
    const client = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await client
        .from('pg_policies')
        .select('*')
        .eq('tablename', 'catalog_items');

    // Note: service role might not have permissions to query pg_catalog directly via postgrest if schema is not exposed.
    // Usually pg_catalog is not exposed.
    // However, let's try.

    if (error) {
        console.error('Error checking policies (maybe pg_policies is not exposed):', error.message);
        // Fallback: Check if we can read with authenticated role simulation? No easy way without a user JWT.
    } else {
        console.log('Policies found:', data);
    }
}

async function run() {
    await checkPolicies();
}

run();
