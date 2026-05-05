require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

(async () => {
  try {
    const { data, error } = await sb.from('mensajes_whatsapp').select('*').limit(1);
    if (error) {
      console.error('Error fetching mensajes_whatsapp:', error);
    } else {
      console.log('Columns in mensajes_whatsapp:', data && data.length > 0 ? Object.keys(data[0]) : 'No rows found');
    }
  } catch (e) {
    console.error('Unexpected error:', e);
  }
})();
