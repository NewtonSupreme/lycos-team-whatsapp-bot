const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fixing Rafael records...');
  
  // Update ventas_dia
  const { data: v, error: ve } = await supabase
    .from('ventas_dia')
    .update({ fecha: '2026-06-16' })
    .ilike('cliente', '%rafael%')
    .eq('fecha', '2026-06-15')
    .select();
    
  if (ve) {
    console.error('Error updating ventas_dia:', ve);
  } else {
    console.log(`Updated ${v.length} records in ventas_dia:`, v.map(r => r.id));
  }

  // Update facturas
  const { data: f, error: fe } = await supabase
    .from('facturas')
    .update({ fecha_emision: '2026-06-16' })
    .ilike('cliente', '%rafael%')
    .eq('fecha_emision', '2026-06-15')
    .select();
    
  if (fe) {
    console.error('Error updating facturas:', fe);
  } else {
    console.log(`Updated ${f.length} records in facturas:`, f.map(r => r.id));
  }
  
  // Also check if any were stored as '2026-06-16' but need to be updated? 
  // No, the user explicitly said it was registered as 15th.
  
  process.exit(0);
}
run();
