const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSedesAndUsers() {
  console.log('--- SEDES ---');
  const { data: sedes, error: sedesError } = await supabase.from('sedes').select('*');
  if (sedesError) console.error('Error fetching sedes:', sedesError);
  else console.table(sedes);

  console.log('\n--- USUARIOS ---');
  const { data: usuarios, error: usersError } = await supabase
    .from('usuarios')
    .select('id, nombre, username, rol, sede_id');
  if (usersError) console.error('Error fetching users:', usersError);
  else console.table(usuarios);

  console.log('\n--- VERIFICANDO RELACIÓN ---');
  const { data: usersWithSede, error: joinError } = await supabase
    .from('usuarios')
    .select('id, nombre, sede:sedes(nombre)');
  if (joinError) console.error('Error fetching users with join:', joinError);
  else console.log(JSON.stringify(usersWithSede, null, 2));
}

checkSedesAndUsers();
