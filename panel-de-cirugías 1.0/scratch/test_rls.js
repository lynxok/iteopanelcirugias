import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wbguwmbwutvhqsirtjps.supabase.co';
const supabaseAnonKey = 'sb_publishable_HHSflu6QFeTOAOz32W2UdQ_wSQyiPIC';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
        schema: 'quirofano'
    }
});

async function testUpsert() {
    console.log('Probando upsert en admin_settings...');
    const { data, error } = await supabase
        .from('admin_settings')
        .upsert({ 
            key: 'test_key', 
            value: JSON.stringify({ test: true }),
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error('Error en upsert:', error);
    } else {
        console.log('Upsert exitoso:', data);
    }
}

testUpsert();
