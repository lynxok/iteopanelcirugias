
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

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'quirofano' }
});

async function check() {
    console.log('--- Inspecting Surgery Groups for Capital Identification ---');

    console.log('\n--- MARI SOL (a6fe3558-0c99-4d04-b9ce-95ac2e89113e) ---');
    const { data: mariSol } = await supabase.from('surgeries')
        .select('id, surgery_date, medical_coverage, procedure_name')
        .eq('vendor_id', 'a6fe3558-0c99-4d04-b9ce-95ac2e89113e')
        .limit(5);
    console.table(mariSol);

    console.log('\n--- UNASSIGNED (NULL) OSER Surgeries ---');
    const { data: unassignedOser } = await supabase.from('surgeries')
        .select('id, surgery_date, medical_coverage, procedure_name')
        .is('vendor_id', null)
        .ilike('medical_coverage', '%OSER%')
        .limit(5);
    console.table(unassignedOser);

    console.log('\n--- VENDOR ID: b0e36a69-b05d-4bf8-9236-ef8562584e23 (7 Surgeries) ---');
    const { data: vendorB } = await supabase.from('surgeries')
        .select('id, surgery_date, medical_coverage, procedure_name')
        .eq('vendor_id', 'b0e36a69-b05d-4bf8-9236-ef8562584e23')
        .limit(5);
    console.table(vendorB);

    console.log('\n--- VENDOR ID: afc1028b-514b-4e79-aabc-0ebf9de1b930 (2 Surgeries) ---');
    const { data: vendorA } = await supabase.from('surgeries')
        .select('id, surgery_date, medical_coverage, procedure_name')
        .eq('vendor_id', 'afc1028b-514b-4e79-aabc-0ebf9de1b930')
        .limit(5);
    console.table(vendorA);
}

check();
