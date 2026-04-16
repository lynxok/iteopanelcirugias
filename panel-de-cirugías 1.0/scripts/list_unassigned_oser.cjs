
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

async function listUnassigned() {
    console.log('--- Checking for Unassigned OSER Surgeries ---');

    const { data: surgeries, error } = await supabase
        .from('surgeries')
        .select(`
            id, 
            surgery_date, 
            procedure_name, 
            medical_coverage, 
            vendor_id,
            patients (full_name)
        `)
        .ilike('medical_coverage', '%OSER%')
        .is('vendor_id', null)
        .order('surgery_date', { ascending: false });

    if (error) {
        console.error('Error fetching surgeries:', error);
        return;
    }

    if (surgeries.length === 0) {
        console.log('✅ All OSER surgeries have a vendor assigned.');
    } else {
        console.log(`❌ Found ${surgeries.length} OSER surgeries WITHOUT a vendor assigned:\n`);

        // Print header
        console.log('DATE       | PATIENT             | PROCEDURE');
        console.log('-----------|---------------------|-----------------------------------');

        surgeries.forEach(s => {
            const date = s.surgery_date || 'No Date   ';
            const patient = (s.patients?.full_name || 'Unknown').padEnd(20).substring(0, 19);
            const procedure = (s.procedure_name || 'No Procedure').substring(0, 50);

            console.log(`${date} | ${patient} | ${procedure}`);
        });
    }
}

listUnassigned();
