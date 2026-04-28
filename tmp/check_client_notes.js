
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkClientNotes() {
  console.log('--- Buscando Notas de Clientes ---');
  const { data: clients } = await supabase
    .from('clientes')
    .select('nombre, apellido, notas, telefono')
    .not('notas', 'is', null);

  if (clients && clients.length > 0) {
    clients.forEach(c => {
      console.log(`Cliente: ${c.nombre} ${c.apellido} (${c.telefono}) - Nota: "${c.notas}"`);
    });
  } else {
    console.log('No hay notas en la tabla de clientes.');
  }
}

checkClientNotes();
