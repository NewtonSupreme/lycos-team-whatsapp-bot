
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function check() {
  if (!url || !key) {
    console.error('Missing Supabase credentials');
    return;
  }
  const db = createClient(url, key);
  
  console.log('--- ULTIMOS MENSAJES DEL ADMIN (584123343519) ---');
  const { data: msgs } = await db.from('mensajes_whatsapp')
    .select('*')
    .or('from_number.eq.584123343519,to_number.eq.584123343519')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log(JSON.stringify(msgs, null, 2));

  console.log('\n--- ULTIMOS CAMBIOS EN INVENTARIO ---');
  const { data: inv } = await db.from('inventario')
    .select('id, nombre, stock, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);
  
  console.log(JSON.stringify(inv, null, 2));

  console.log('\n--- FECHA ACTUAL SERVIDOR ---');
  console.log(new Date().toISOString());
  
  const now = new Date();
  const vzla = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (-4 * 60) * 60000);
  console.log('Venezuela Time:', vzla.toISOString());
}

check();
