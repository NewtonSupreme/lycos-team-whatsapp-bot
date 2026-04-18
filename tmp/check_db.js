
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const url = "https://svazupuylnaxqmtaastz.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YXp1cHV5bG5heHFtdGFhc3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTUxMjYsImV4cCI6MjA4OTI5MTEyNn0.l_rCrXM0qmMSU6ZMkv_9aP4vQbJR3m02prauifyo09o";

async function check() {
  const db = createClient(url, key);
  let output = '';
  
  output += '--- ULTIMOS MENSAJES DEL ADMIN ---\n';
  const { data: msgs } = await db.from('mensajes_whatsapp')
    .select('body, tipo, created_at, from_number')
    .or('from_number.eq.584123343519,to_number.eq.584123343519')
    .order('created_at', { ascending: false })
    .limit(10);
  
  output += JSON.stringify(msgs, null, 2) + '\n';

  output += '\n--- ULTIMOS CAMBIOS EN INVENTARIO ---\n';
  const { data: inv } = await db.from('inventario')
    .select('id, nombre, stock, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);
  
  output += JSON.stringify(inv, null, 2) + '\n';

  output += '\n--- FECHA ACTUAL SERVIDOR ---\n';
  output += new Date().toISOString() + '\n';
  
  fs.writeFileSync('tmp/check_db_results.txt', output, 'utf8');
  console.log('Results written to tmp/check_db_results.txt');
}

check();
