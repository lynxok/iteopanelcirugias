
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wbguwmbwutvhqsirtjps.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ3V3bWJ3dXR2aHFzaXJ0anBzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk3ODU5NiwiZXhwIjoyMDgzNTU0NTk2fQ.mOuc9YyLdJlXhmScUat12yfRha9O-cMGtEzlywznPjA';
const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'quirofano' }
});

async function closeSurgeries() {
    const targets = [
        { name: 'PEREZ ESTEBAN DAMIAN', date: '2026-02-13' },
        { name: 'BERGARA GASTON ADALBERTO', date: '2026-02-13' },
        { name: 'MARTINEZ DANIELA', date: '2026-02-05' }
    ];

    for (const target of targets) {
        console.log(`Searching for ${target.name} on ${target.date}...`);

        // Find patient first to be sure
        const { data: patients, error: pError } = await supabase
            .from('patients')
            .select('id, full_name')
            .ilike('full_name', `%${target.name}%`);

        if (pError) {
            console.error(`Error finding patient ${target.name}:`, pError);
            continue;
        }

        if (!patients || patients.length === 0) {
            console.warn(`No patient found for ${target.name}`);
            continue;
        }

        const patientId = patients[0].id;

        // Update surgery
        const { data, error } = await supabase
            .from('surgeries')
            .update({ status: 'completed' })
            .eq('patient_id', patientId)
            .eq('surgery_date', target.date)
            .eq('status', 'scheduled')
            .select();

        if (error) {
            console.error(`Error updating surgery for ${target.name}:`, error);
        } else if (data && data.length > 0) {
            console.log(`Successfully closed surgery for ${target.name} (ID: ${data[0].id})`);
        } else {
            console.log(`No scheduled surgery found for ${target.name} on ${target.date}`);
        }
    }
}

closeSurgeries();
