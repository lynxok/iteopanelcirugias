import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: patients, error: pErr } = await supabase
    .from('patients')
    .select('*')
    .ilike('full_name', '%britos%');
  
  if (pErr) { console.error('Patient error', pErr); return; }
  console.log('--- PATIENTS ---');
  console.log(patients);

  if (!patients || patients.length === 0) {
      console.log('No patients found with name Britos');
  }

  const patientIds = patients?.map(p => p.id) || [];
  
  const { data: surgeries, error: sErr } = await supabase
    .from('surgeries')
    .select('*, surgery_forms(id)')
    .in('patient_id', patientIds);

  if (sErr) { console.error('Surgery error', sErr); return; }
  console.log('--- SURGERIES ---');
  console.log(surgeries);
  
}
check();
