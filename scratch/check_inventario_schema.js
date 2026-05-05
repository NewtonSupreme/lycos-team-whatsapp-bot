require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(url, key);

(async () => {
  try {
    // Try to select one row from inventario to see columns
    const { data, error } = await sb.from('inventario').select('*').limit(1);
    if (error) {
      console.error('Error fetching inventario:', error);
    } else {
      console.log('Columns in inventario:', data && data.length > 0 ? Object.keys(data[0]) : 'No rows found, cannot infer columns from select *');
    }

    // Also try to specifically select stock_minimo to see if it fails
    const { error: colError } = await sb.from('inventario').select('stock_minimo').limit(1);
    if (colError) {
      console.error('Error selecting stock_minimo specifically:', colError.message);
    } else {
      console.log('stock_minimo column exists and is accessible.');
    }
  } catch (e) {
    console.error('Unexpected error:', e);
  }
})();
