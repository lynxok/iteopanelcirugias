import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wbguwmbwutvhqsirtjps.supabase.co';
const supabaseAnonKey = 'sb_publishable_HHSflu6QFeTOAOz32W2UdQ_wSQyiPIC';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
        schema: 'quirofano'
    }
});

async function testSelect() {
    console.log('Probando select en admin_settings...');
    const { data, error } = await supabase
        .from('admin_settings')
        .select('*');

    if (error) {
        console.error('Error en select:', error);
    } else {
        console.log('Select exitoso:', data);
    }
}

testSelect();
