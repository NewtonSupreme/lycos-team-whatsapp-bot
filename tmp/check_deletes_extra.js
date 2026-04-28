
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDeletes() {
  console.log('--- Buscando rastro de eliminaciones ---');
  
  // 1. Check all unique actions in activity_log
  const { data: actions } = await supabase.from('activity_log').select('accion');
  if (actions) {
    const unique = [...new Set(actions.map(a => a.accion))];
    console.log('Acciones encontradas en logs:', unique);
  }

  // 2. Check for soft-deletes in metadata if any table uses it
  // (We don't see soft-delete columns, but maybe in a jsonb field?)
  
  // 3. Search for the string "mensaje eliminado" or "borrado" in all messages
  const { data: messages } = await supabase
    .from('mensajes_whatsapp')
    .select('body, from_number')
    .or('body.ilike.%eliminado%,body.ilike.%borrado%');

  if (messages && messages.length > 0) {
    console.log('Mensajes que mencionan "eliminado" o "borrado":');
    messages.forEach(m => console.log(`- ${m.from_number}: ${m.body}`));
  } else {
    console.log('No hay mensajes literales con esas palabras.');
  }
}

checkDeletes();
