import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const doctors = [
    { full_name: 'DR OBAID LUIS MARCELO', license_number: '4216', specialty: 'Cirugía' },
    { full_name: 'DR BARBERO CARLOS JULIAN', license_number: '8689', specialty: 'Cirugía' },
    { full_name: 'DR LOPEZ DARIO ALBERTO', license_number: '6925', specialty: 'Cirugía' },
    { full_name: 'DR GOLPE LUCIO MARTIN', license_number: '7267', specialty: 'Cirugía' },
    { full_name: 'DR CRESPO FERNANDO ADRIAN', license_number: '7504', specialty: 'Cirugía' },
    { full_name: 'DR RIAL PEDRO JAVIER', license_number: '9203', specialty: 'Cirugía' },
    { full_name: 'DR CASTILLO MARTIN', license_number: '12359', specialty: 'Cirugía' },
    { full_name: 'DR PEREZLINDO LUCAS', license_number: '11261', specialty: 'Cirugía' }
];

async function loadDoctors() {
    console.log('Inserting doctors into quirofano.doctors...');
    const { data, error } = await supabase
        .from('doctors')
        .insert(doctors);

    if (error) {
        console.error('Error inserting doctors:', error);
    } else {
        console.log('Doctors inserted successfully:', data);
    }
}

loadDoctors();
