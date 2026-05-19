const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1].trim()] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const db = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: sales } = await db.from('ventas_silenciadores').select('*');
  console.log(`\n--- ALL HISTORIC VENTAS_SILENCIADORES (${sales ? sales.length : 0} rows) ---`);
  if (sales) {
    sales.forEach(s => {
      console.log(`ID: ${s.id} | SedeId: ${s.sede_id} | Fecha: ${s.fecha} | Creado: ${s.created_at} | Notas: ${s.notas}`);
    });
  }
}

main().catch(console.error);
