
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
            process.env[key] = value;
        }
    });
} catch (e) {
    console.log('Could not load .env.local', e);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
    console.log('--- Checking Users ---');

    // Check 'users' roles to see if we can find 'Ortopedia Capital' as a user
    const { data: users, error } = await supabase.from('users').select('id, name, role, vendor_id');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    if (users) {
        console.log(`Total users: ${users.length}`);

        const capital = users.filter(u => u.name && u.name.toUpperCase().includes('CAPITAL'));
        if (capital.length > 0) {
            console.log('Found User(s) with Capital in name:');
            console.table(capital);
        } else {
            console.log('No user found with Capital in name.');
        }

        const ortopediaUsers = users.filter(u => u.role === 'Ortopedia');
        console.log(`Found ${ortopediaUsers.length} users with role 'Ortopedia':`);
        console.table(ortopediaUsers.map(u => ({ id: u.id, name: u.name, vendor_id: u.vendor_id })));

        // Also check if any surgery has vendor_id corresponding to one of these
        if (capital.length > 0) {
            const capitalId = capital[0].id; // Assuming first one if multiple
            // Or maybe capital[0].vendor_id if that's used?

            console.log(`Checking surgeries for Capital ID: ${capitalId}`);
        }
    }
}

listTables();
