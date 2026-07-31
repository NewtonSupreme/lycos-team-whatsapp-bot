const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('--- Buscando cliente José Ruso ---');
  const { data: clients, error: e1 } = await supabase.from('clientes')
    .select('*')
    .ilike('nombre', '%Jos%Rus%')
    .or('apellido.ilike.%Rus%');
  console.log(clients || e1);

  console.log('\n--- Buscando cliente Emily Almeida ---');
  const { data: emilys, error: e2 } = await supabase.from('clientes')
    .select('*')
    .ilike('nombre', '%Emily%')
    .or('apellido.ilike.%Almeida%');
  console.log(emilys || e2);

  console.log('\n--- Buscando vehículo AA3420F ---');
  const { data: vehs, error: e3 } = await supabase.from('vehiculos')
    .select('*')
    .eq('placa', 'AA3420F');
  console.log(vehs || e3);

  console.log('\n--- Buscando logs recientes relacionados ---');
  const { data: logs, error: e4 } = await supabase.from('logs_admin')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(logs?.filter(l => JSON.stringify(l).includes('AA3420F') || JSON.stringify(l).includes('Ruso') || JSON.stringify(l).includes('Emily')));
}
run();
