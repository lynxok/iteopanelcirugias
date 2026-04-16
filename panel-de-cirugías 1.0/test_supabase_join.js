
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: 'quirofano' }
});

async function test() {
    const todayStr = '2026-02-09';
    const { data, error } = await supabase
        .from('surgeries')
        .select(`
            *,
            patients (full_name),
            doctors!doctor_id (full_name)
        `)
        .eq('surgery_date', todayStr)
        .eq('operating_room_id', '301')
        .order('start_time');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

test();
