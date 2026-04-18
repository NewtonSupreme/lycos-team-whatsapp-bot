const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count, error } = await supabase.from('inventario').select('count', { count: 'exact', head: true }).eq('activo', true);
  if (error) console.error('Error:', error);
  else console.log('Total Active Items:', count);

  const { data: firstTen } = await supabase.from('inventario').select('nombre, stock, stock_minimo, precio_usd').eq('activo', true).limit(10);
  console.log('Sample items:', firstTen);

  const lowStock = firstTen.filter(i => i.stock <= (i.stock_minimo || 1)).length;
  console.log('Low stock in sample:', lowStock);
}

check();
