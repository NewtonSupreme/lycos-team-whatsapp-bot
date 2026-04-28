
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkActivityLog() {
  console.log('--- Consultando el registro de actividades (activity_log) ---');
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al consultar activity_log:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log(`Se encontraron ${data.length} registros.`);
    data.forEach(log => {
      console.log(`[${new Date(log.created_at).toLocaleString()}] Acción: ${log.accion} - ${log.descripcion}`);
      if (log.metadata) console.log(`   Metadata: ${JSON.stringify(log.metadata)}`);
    });
  } else {
    console.log('El activity_log está vacío.');
  }
}

checkActivityLog();
