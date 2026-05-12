import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testSearch() {
  const { data, error } = await supabase
    .from('nomenclador_items')
    .select('code, description')
    .eq('type', 'OSER')
    .ilike('description', '%artroscopia%')
    .limit(10);
    
  console.log('Result for %artroscopia%:', data, error);
}

testSearch();
