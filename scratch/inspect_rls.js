const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
  console.log('--- INSPECCIONANDO TABLA SEDES ---');
  
  // Intentar insertar una sede de prueba (si falla es por RLS o permisos)
  const testId = '00000000-0000-0000-0000-000000000001';
  const { error: insertError } = await supabase.from('sedes').insert({ id: testId, nombre: 'TEST' });
  if (insertError) {
    console.log('Error al insertar (posible RLS):', insertError.message);
  } else {
    console.log('Inserción exitosa (RLS abierto o deshabilitado)');
    await supabase.from('sedes').delete().eq('id', testId);
  }

  // Verificar si hay datos
  const { data: sedes, error: sedesError } = await supabase.from('sedes').select('*');
  console.log('Contenido de sedes (ANON):', sedes);
  if (sedesError) console.error('Error select sedes:', sedesError);

  // Verificar usuarios y su sede_id
  const { data: users } = await supabase.from('usuarios').select('nombre, sede_id');
  console.log('Usuarios y su sede_id:', users);
}

inspectSchema();
