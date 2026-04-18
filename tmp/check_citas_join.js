require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await db.from('citas').select('*, clientes(nombre, apellido, telefono), vehiculos(marca, placa, modelo)').limit(1);
  console.log(JSON.stringify({ data, error }, null, 2));
})();
