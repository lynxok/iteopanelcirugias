const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
            }
        });
    }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'quirofano' }
});

async function test() {
    console.log('Testing admin_settings query...');
    const { data, error } = await supabase.from('admin_settings').select('*');
    
    if (error) {
        console.error('Error fetching admin_settings:', error);
    } else {
        console.log('Success! Data count:', data.length);
        if (data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
            console.log('Sample row:', data[0]);
        }
    }

    console.log('\nTesting role_permissions specifically...');
    const { data: perm, error: permError } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('key', 'role_permissions')
        .maybeSingle();

    if (permError) {
        console.error('Error fetching role_permissions:', permError);
    } else {
        console.log('Role permissions key found:', perm ? perm.key : 'NOT FOUND');
    }
}

test();
