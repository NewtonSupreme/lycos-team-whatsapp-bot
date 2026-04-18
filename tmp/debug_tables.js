const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  console.log('🔍 Debugging Supabase connection...');
  console.log('URL:', supabaseUrl);
  
  // Try to list tables via a system query (if permissions allow) or just check common names
  const tablesToCheck = ['inventario', 'inventarios', 'productos', 'stock', 'clientes'];
  
  for (const table of tablesToCheck) {
    const { data, error } = await supabase.from(table).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ Table "${table}": ${error.message}`);
    } else {
      console.log(`✅ Table "${table}" exists. Count: ${data}`);
    }
  }
}

debug();
