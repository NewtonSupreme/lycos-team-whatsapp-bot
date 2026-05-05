const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSedesAndUsers() {
  const { data: sedes } = await supabase.from('sedes').select('*');
  console.log('--- SEDES RAW ---');
  console.log(JSON.stringify(sedes, null, 2));

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, nombre, username, rol, sede_id');
  console.log('\n--- USUARIOS RAW ---');
  console.log(JSON.stringify(usuarios, null, 2));
}

checkSedesAndUsers();
