const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing raw fetch...');
  const { data, error } = await supabase.from('inventario').select('*').limit(1);
  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Success! Data:', data);
  }
}

test();
