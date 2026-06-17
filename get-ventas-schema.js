require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

(async () => {
  const { data: v, error: ve } = await sb.from('ventas').select('*').limit(1);
  console.log('ventas:', v && v[0] ? Object.keys(v[0]) : (ve || 'empty'));
})();
