require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

(async () => {
  const { data, error } = await sb.from('citas').select('*').limit(1);
  console.log('citas:', data && data[0] ? Object.keys(data[0]) : (error || 'empty'));
  
  const { data: v, error: ve } = await sb.from('vehiculos').select('*').limit(1);
  console.log('vehiculos:', v && v[0] ? Object.keys(v[0]) : (ve || 'empty'));
  
  const { data: s, error: se } = await sb.from('servicios').select('*').limit(1);
  console.log('servicios:', s && s[0] ? Object.keys(s[0]) : (se || 'empty'));
})();
