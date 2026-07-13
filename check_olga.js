const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://svazupuylnaxqmtaastz.supabase.co';
const supabaseKey = 'sb_secret_2ujV8BQOS3szAuqAWSXiDw_PLAVMG9h';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: s } = await supabase.from('servicios').select('*').eq('id', 'df8fcd80-9720-44cd-af01-8ea0cc65c069').single();
  console.log("=== SERVICIO OLGA ANGLE ===");
  console.log(s);

  const { data: logs } = await supabase.from('historial_actividad').select('*').ilike('detalles', '%OLGA%').order('created_at', { ascending: false });
  console.log("\n=== HISTORIAL ACTIVIDAD OLGA ANGLE ===");
  logs?.forEach(l => {
    console.log(`[${l.created_at}] Usuario: ${l.usuario} | Módulo: ${l.modulo} | Acción: ${l.accion} | Detalles: ${l.detalles}`);
  });
}

run().then(() => console.log("\nFin")).catch(console.error);
