require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

(async () => {
  const { data: vd } = await sb.from('ventas_dia').select('*').limit(1);
  console.log('ventas_dia:', vd && vd[0] ? Object.keys(vd[0]) : 'empty');
  
  const { data: estados } = await sb.from('servicios').select('estado').limit(10);
  console.log('servicios estados:', [...new Set(estados?.map(s => s.estado) || [])]);
})();
