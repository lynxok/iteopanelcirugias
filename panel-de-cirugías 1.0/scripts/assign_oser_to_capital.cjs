
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

const CAPITAL_VENDOR_ID = 'a6fe3558-0c99-4d04-b9ce-95ac2e89113e';
const NEW_NAME = 'Ortopedia Capital';

async function assign() {
    console.log('--- Assigning OSER Surgeries to Capital ---');

    // 1. Rename User
    console.log(`Renaming user with Vendor ID ${CAPITAL_VENDOR_ID} to "${NEW_NAME}"...`);
    // Ideally we update by ID if we had the user ID from previous script, but we can query by vendor_id too or fetch first

    // Let's first fetch the user to get their ID just to be safe
    const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('vendor_id', CAPITAL_VENDOR_ID) // Assuming vendor_id is unique enough or we find the right one
        .single();

    if (fetchError || !user) {
        // Fallback: try to find by ID if we knew it, or just use vendor_id update
        console.log('Could not fetch user by vendor_id, trying to update directly.');
    } else {
        console.log(`Found user: ${user.name} (${user.id}). Updating name...`);
        const { error: updateError } = await supabase
            .from('users')
            .update({ name: NEW_NAME })
            .eq('id', user.id);

        if (updateError) console.error('Error updating user name:', updateError);
        else console.log('✅ User renamed successfully.');
    }

    // 2. Assign Surgeries
    console.log('Assigning unassigned OSER surgeries...');

    // Fetch count first provides a baseline
    const { count: countBefore } = await supabase
        .from('surgeries')
        .select('*', { count: 'exact', head: true })
        .ilike('medical_coverage', '%OSER%')
        .is('vendor_id', null);

    console.log(`Found ${countBefore} unassigned OSER surgeries.`);

    if (countBefore > 0) {
        const { data: updated, error: assignError } = await supabase
            .from('surgeries')
            .update({ vendor_id: CAPITAL_VENDOR_ID })
            .ilike('medical_coverage', '%OSER%')
            .is('vendor_id', null)
            .select();

        if (assignError) {
            console.error('Error assigning surgeries:', assignError);
        } else {
            console.log(`✅ Successfully assigned ${updated.length} surgeries to Capital.`);
        }
    } else {
        console.log('No surgeries to assign.');
    }
}

assign();
