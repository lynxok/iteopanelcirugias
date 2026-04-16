
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Load env vars manually
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
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

console.log('Using Supabase URL:', supabaseUrl);
// console.log('Using Key:', supabaseKey.substring(0, 10) + '...');

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'quirofano' }
});

async function check() {
    console.log('--- Comprehensive Search for Capital ---');

    // 1. Fetch ALL users
    const { data: allUsers, error: uError } = await supabase.from('users').select('id, name, vendor_id, role');
    if (uError) console.error('Error fetching users:', uError);
    else {
        console.log(`\nFound ${allUsers.length} total users.`);

        // Search specifically for "Capital" in name
        const capitalMatch = allUsers.filter(u => u.name && u.name.toUpperCase().includes('CAPITAL'));
        if (capitalMatch.length > 0) {
            console.log('User(s) with "CAPITAL" in name:');
            capitalMatch.forEach(u => console.log(` - ${u.name} (ID: ${u.id}, VendorID: ${u.vendor_id}, Role: ${u.role})`));
        } else {
            console.log('No user found with "CAPITAL" in name.');
        }

        // Just list unique Vendor IDs available on users
        const userVendorIds = [...new Set(allUsers.map(u => u.vendor_id).filter(Boolean))];
        console.log(`User-linked Vendor IDs (${userVendorIds.length}):`, userVendorIds);
    }

    // 2. Fetch ALL Surgeries' distinct Vendor IDs
    const { data: surgeries, error: sError } = await supabase.from('surgeries').select('vendor_id, medical_coverage');
    if (sError) console.error('Error fetching surgeries:', sError);
    else {
        console.log(`\nAnalyzing ${surgeries.length} total surgeries.`);
        const counts = {};
        surgeries.forEach(s => {
            const vid = s.vendor_id || 'NULL';
            counts[vid] = (counts[vid] || 0) + 1;
        });

        console.log('Vendor ID Usage in Surgeries:');
        for (const [vid, count] of Object.entries(counts)) {
            // Find user name for this vendor ID
            let label = 'Unknown';
            const userById = allUsers?.find(u => u.id === vid);
            if (userById) label = `User.ID: ${userById.name}`;

            const userByVendorId = allUsers?.find(u => u.vendor_id === vid);
            if (userByVendorId) label = `User.VendorID: ${userByVendorId.name}`;

            console.log(` - ${vid}: ${count} surgeries (${label})`);
        }

        // Check specifically for OSER surgeries again with this broader context
        const oserSurgeries = surgeries.filter(s => s.medical_coverage && s.medical_coverage.toUpperCase().includes('OSER'));
        console.log(`\nOSER Surgeries (${oserSurgeries.length}):`);
        const oserCounts = {};
        oserSurgeries.forEach(s => {
            const vid = s.vendor_id || 'NULL';
            oserCounts[vid] = (oserCounts[vid] || 0) + 1;
        });
        for (const [vid, count] of Object.entries(oserCounts)) {
            let label = 'Unknown';
            const userById = allUsers?.find(u => u.id === vid);
            if (userById) label = `User.ID: ${userById.name}`;
            const userByVendorId = allUsers?.find(u => u.vendor_id === vid);
            if (userByVendorId) label = `User.VendorID: ${userByVendorId.name}`;
            console.log(` - ${vid}: ${count} surgeries (${label})`);
        }
    }
}

check();
