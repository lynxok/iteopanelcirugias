import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}

// Configurado específicamente para interactuar con el schema 'quirofano' por defecto
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db: {
        schema: 'quirofano'
    }
});
