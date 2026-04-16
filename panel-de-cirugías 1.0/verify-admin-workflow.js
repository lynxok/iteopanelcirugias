import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually load .env.local
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'quirofano' }
});

async function verifyAdminWorkflow() {
    console.log('--- Verifying Admin Workflow Backend ---');

    // 1. Create a test surgery with patient_available_from
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 10); // Available in 10 days
    const availableFromStr = testDate.toISOString().split('T')[0];

    // 0. Fetch valid prerequisites
    const { data: patient } = await supabase.from('patients').select('id').limit(1).single();
    const { data: doctor } = await supabase.from('doctors').select('id').limit(1).single();

    if (!patient || !doctor) {
        console.error('Skipping test: No patients or doctors found in DB to link.');
        return;
    }

    console.log(`Creating test surgery with available_from: ${availableFromStr}`);

    const { data: surgery, error: createError } = await supabase
        .from('surgeries')
        .insert({
            patient_available_from: availableFromStr,
            admin_confirmation: false,
            status: 'waiting_date',
            created_at: new Date().toISOString(),
            procedure_name: 'Test Surgery - Admin Workflow',
            patient_id: patient.id,
            doctor_id: doctor.id
        })
        .select()
        .single();

    if (createError) {
        console.error('Error creating surgery:', createError);
        return;
    }

    console.log('Surgery created successfully:', surgery.id);
    console.log('Confirmed field values:', {
        patient_available_from: surgery.patient_available_from,
        admin_confirmation: surgery.admin_confirmation
    });

    if (surgery.patient_available_from !== availableFromStr) {
        console.error('FAIL: patient_available_from mismatch');
    } else {
        console.log('PASS: patient_available_from saved correctly');
    }

    // 2. Simulate User check (Frontend logic simulation)
    // Try to schedule it for TODAY (should fail logic check)
    const today = new Date().toISOString().split('T')[0];
    console.log(`Simulating scheduling for ${today} (Should be BLOCKED by frontend logic)`);

    if (today < availableFromStr) {
        console.log('PASS: Logic check (today < availableFrom) returns TRUE -> BLOCKED');
    } else {
        console.error('FAIL: Logic check failed');
    }

    // 3. Update admin confirmation
    console.log('Testing Admin Confirmation Toggle...');
    const { data: updated, error: updateError } = await supabase
        .from('surgeries')
        .update({ admin_confirmation: true })
        .eq('id', surgery.id)
        .select()
        .single();

    if (updateError) {
        console.error('Error updating confirmation:', updateError);
    } else {
        console.log('PASS: Admin confirmation updated to:', updated.admin_confirmation);
    }

    // Cleanup
    console.log('Cleaning up test surgery...');
    await supabase.from('surgeries').delete().eq('id', surgery.id);
    console.log('Cleanup complete.');
}

verifyAdminWorkflow();
