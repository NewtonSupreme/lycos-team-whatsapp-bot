const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function run() {
  const { data: vd } = await supabase.from('ventas_dia').select('id');
  const { data: vs } = await supabase.from('ventas_silenciadores').select('id');
  const { data: fact } = await supabase.from('facturas').select('id');
  
  fs.writeFileSync('counts.txt', `ventas_dia count: ${vd?.length}\nventas_silenciadores count: ${vs?.length}\nfacturas count: ${fact?.length}`);
}
run();
