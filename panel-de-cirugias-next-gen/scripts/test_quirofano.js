import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('Testing connection to quirofano.doctors...');
    const { data, error } = await supabase
        .schema('quirofano')
        .from('doctors')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error connecting to quirofano schema:', error);
    } else {
        console.log('Successfully connected! Found doctors:', data);
    }
}

testConnection();
