
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCancelled() {
  console.log('--- Analizando Servicios Cancelados o Pendientes con Problemas ---\n');
  const { data: services, error } = await supabase
    .from('servicios')
    .select(`
      descripcion, notas, estado, created_at,
      vehiculos (marca, modelo, placa, clientes (nombre, apellido, telefono))
    `)
    .in('estado', ['cancelado', 'pendiente']);

  if (error) return;

  services.forEach((s, i) => {
    if (s.notas && s.notas.length > 0) {
      console.log(`${i+1}. [${s.estado}] ${s.vehiculos.clientes.nombre}: "${s.descripcion}" - Notas: ${s.notas}`);
    }
  });
}

checkCancelled();
