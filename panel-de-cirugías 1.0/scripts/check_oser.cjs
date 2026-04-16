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
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY; // Use service role to see all data

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOser() {
    console.log('--- Checking OSER Assignment ---');

    // 1. Find "ORTOPEDIA CAPITAL" (or similar) in users (role=Ortopedia) or a vendors table
    // Based on code, it seems vendors might be users with role 'Ortopedia' or a separate table.
    // Let's check 'users' first for role 'Ortopedia'
    const { data: vendors, error: vendorError } = await supabase
        .from('users')
        .select('id, name, vendor_id') // Check if users table has vendor info directly or if it maps to a vendors table
        .eq('role', 'Ortopedia');

    // If that fails or is empty, maybe there is a 'vendors' table
    const { data: vendorsTable, error: vendorsTableError } = await supabase
        .from('vendors') // Guessing table name
        .select('*');

    let capitalVendorId = null;

    if (vendorsTable && !vendorsTableError) {
        console.log('Found vendors table:', vendorsTable.map(v => v.name));
        const capital = vendorsTable.find(v => v.name.toUpperCase().includes('CAPITAL'));
        if (capital) capitalVendorId = capital.id;
    } else if (vendors) {
        console.log('Found Ortopedia users:', vendors.map(v => v.name));
        // Maybe the user IS the vendor? 
        const capitalUser = vendors.find(v => v.name.toUpperCase().includes('CAPITAL'));
        if (capitalUser) {
            // If user has a vendor_id, maybe that's what surgeries use. Or maybe they use user.id?
            // SurgeryList says: query.eq('vendor_id', user.vendorId);
            // This suggests 'subsurgeries.vendor_id' matches 'users.vendor_id'
            // So we need the ID from the vendors table that the user points to.
            if (capitalUser.vendor_id) capitalVendorId = capitalUser.vendor_id;
        }
    }

    if (!capitalVendorId) {
        // Try searching vendors table directly again if users check was ambiguous
        const { data: vendorsDirect } = await supabase
            .from('vendors')
            .select('id, name')
            .ilike('name', '%CAPITAL%');

        if (vendorsDirect && vendorsDirect.length > 0) {
            capitalVendorId = vendorsDirect[0].id;
            console.log(`Identified Capital Vendor ID: ${capitalVendorId} (${vendorsDirect[0].name})`);
        }
    }

    if (!capitalVendorId) {
        console.error('Could not identify "ORTOPEDIA CAPITAL" vendor ID.');
        console.log('--- Debug Info ---');
        console.log('Vendors Table:', vendorsTable);
        console.log('Users (Ortopedia):', vendors);
        console.log('Vendors Direct Search:', await supabase.from('vendors').select('id, name').ilike('name', '%CAPITAL%'));
        return;
    }

    // 2. Query Surgeries with OSER
    const { data: surgeries, error: surgeryError } = await supabase
        .from('surgeries')
        .select(`
            id, 
            patient:patients(full_name), 
            medical_coverage, 
            vendor_id,
            surgery_date
        `)
        .ilike('medical_coverage', '%OSER%');

    if (surgeryError) {
        console.error('Error fetching surgeries:', surgeryError);
        return;
    }

    console.log(`Found ${surgeries.length} surgeries with OSER coverage.`);

    // 3. Verify Assignment
    const incorrect = surgeries.filter(s => s.vendor_id !== capitalVendorId);

    if (incorrect.length === 0) {
        console.log('✅ All OSER surgeries are correctly assigned to ORTOPEDIA CAPITAL.');
    } else {
        console.log(`⚠️  Found ${incorrect.length} surgeries NOT assigned to Capital:`);
        incorrect.forEach(s => {
            console.log(`- ID: ${s.id} | Date: ${s.surgery_date} | Patient: ${s.patient?.full_name} | VendorID: ${s.vendor_id || 'NULL'}`);
        });

        // Ask if user wants to update them? (We can't ask in script but we can report)
        console.log('Run an update to fix these?');
    }
}

checkOser();
