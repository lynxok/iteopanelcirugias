
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Read keys
const envPath = path.join(__dirname, '../.env.local');
let supabaseUrl = '';
let anonKey = '';
let serviceKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            const cleanValue = value.trim().replace(/^['"]|['"]$/g, '');
            if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = cleanValue;
            if (key.trim() === 'VITE_SUPABASE_ANON_KEY') anonKey = cleanValue;
            if (key.trim() === 'VITE_SUPABASE_SERVICE_ROLE_KEY') serviceKey = cleanValue;
        }
    });
} catch (e) {
    console.error('Error reading .env.local');
    process.exit(1);
}

async function testConnection(role, key) {
    console.log(`\nTesting connection as [${role}]...`);
    const client = createClient(supabaseUrl, key, {
        db: { schema: 'quirofano' },
        auth: { persistSession: false, autoRefreshToken: false }
    });

    // Try to authenticate if not service role (simulates user user)
    // Actually for Anon we don't auth, we rely on public access or RLS for anon... 
    // BUT wait, my policy is "TO authenticated". Anon key without login is NOT authenticated.
    // The frontend user IS logged in. 

    // So for the Anon test to be valid for the "Application" scenario, I need to fetch as a logged in user?
    // Or does "authenticated" mean "has a valid JWT"?
    // The Anon key itself just identifies the API client. The RLS policies "TO authenticated" apply when there is an Authorization header with a user JWT.

    // IF I test with just Anon Key and NO user session, I expect it to FAIL if policy is "TO authenticated".
    // This script can't easily simulate a logged-in user without a login.

    // However, I can check if "service_role" sees data.

    const { data, error, count } = await client
        .from('catalog_items')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error(`[${role}] Error:`, error.message);
    } else {
        console.log(`[${role}] Success! Found ${count} items.`);
    }
}

async function run() {
    // 1. Check with Service Role (Admin)
    await testConnection('SERVICE_ROLE', serviceKey);

    // 2. Check with Anon Key (No Auth)
    // If this fails, it MIGHT be correct if policy requires auth. 
    // But if I want to debug if the policy is "too strict" or "working", this helps.
    await testConnection('ANON_PUBLIC', anonKey);

    // 3. To really test the user scenario I'd need to sign in.
    // skipping for now, let's just see if data exists at all first.
}

run();
