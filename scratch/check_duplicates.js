const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function countSedes() {
  const { data: sedes } = await supabase.from('sedes').select('*');
  console.log('Total Sedes:', sedes.length);
  sedes.forEach(s => console.log(`- ${s.nombre} (${s.id})`));
}

countSedes();
