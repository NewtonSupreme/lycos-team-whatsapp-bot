require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

(async () => {
  const { data } = await sb.from('servicios').select('sede_id').limit(1);
  console.log('sede_id:', data[0] ? data[0].sede_id : 'null');
})();
