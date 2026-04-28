
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDatabase() {
  console.log('--- Inspeccionando todas las tablas de la base de datos ---\n');

  // Supabase no permite listar tablas fácilmente vía cliente anónimo/anon key si no hay RLS abierto
  // Pero podemos intentar consultar information_schema si tenemos permisos, o usar rpc si existe uno
  // Alternativamente, intentamos adivinar nombres comunes de tablas
  
  const tablesToTry = [
    'reclamos', 'quejas', 'tickets', 'soporte', 'feedback', 
    'mensajes_whatsapp', 'clientes', 'servicios', 'diagnosticos',
    'activity_log', 'citas', 'conversaciones', 'notificaciones',
    'deleted_messages', 'mensajes_borrados', 'auditoria'
  ];

  for (const table of tablesToTry) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (!error) {
      console.log(`Tabla encontrada: ${table} (Registros: ${count})`);
    }
  }

  console.log('\n--- Buscando acciones de eliminación en activity_log ---\n');
  const { data: logs, error: logError } = await supabase
    .from('activity_log')
    .select('*')
    .or('accion.ilike.%delete%,accion.ilike.%eliminar%,accion.ilike.%borrar%')
    .order('created_at', { ascending: false });

  if (logs && logs.length > 0) {
    console.log(`Se encontraron ${logs.length} registros de eliminación:\n`);
    logs.forEach(l => {
      console.log(`[${new Date(l.created_at).toLocaleString()}] Usuario: ${l.usuario} | Acción: ${l.accion} | Módulo: ${l.modulo} | Detalles: ${l.detalles}`);
    });
  } else {
    console.log('No se encontraron acciones de eliminación registradas.');
  }

  console.log('\n--- Buscando discrepancias o errores en mensajes_whatsapp ---');
  const { count: totalMsg } = await supabase.from('mensajes_whatsapp').select('*', { count: 'exact', head: true });
  console.log(`Total de mensajes actuales: ${totalMsg}`);
}

inspectDatabase();
