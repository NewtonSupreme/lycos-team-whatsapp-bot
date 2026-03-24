require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

(async () => {
  const c = await sb.from('conversaciones').select('*').limit(1);
  const m = await sb.from('mensajes_whatsapp').select('*').limit(1);
  const cli = await sb.from('clientes').select('*').limit(1);
  console.log('CONV:', c.data ? Object.keys(c.data[0] || {}) : 'null');
  console.log('MSGS:', m.data ? Object.keys(m.data[0] || {}) : 'null');
  console.log('CLI:', cli.data ? Object.keys(cli.data[0] || {}) : 'null');
})();
