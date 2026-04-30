const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
  console.log('Checking inventory table schema...');
  const { data, error } = await supabase
    .from('inventario')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns found in first row:', Object.keys(data[0]));
  } else {
    console.log('Table is empty, trying to get column names via RPC or just metadata if possible...');
    // Try to insert a dummy row and see what happens? No, destructive.
    // Let's try to select specific columns that we suspect might be missing.
    const columns = ['precio_bs', 'unidad', 'notas', 'marca', 'codigo'];
    for (const col of columns) {
      const { error: colError } = await supabase
        .from('inventario')
        .select(col)
        .limit(1);
      if (colError) {
        console.log(`Column '${col}' seems to be MISSING. Error:`, colError.message);
      } else {
        console.log(`Column '${col}' is PRESENT.`);
      }
    }
  }
}

checkSchema();
