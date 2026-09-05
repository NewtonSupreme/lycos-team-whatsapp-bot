const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const env = {};
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
    const m = l.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
}
const url = env['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY;

const s = createClient(url, key);

async function test() {
  try {
    const { data, error } = await s.from('job_assignments').select('*').limit(1);
    const result = {
      error: error ? error.message : null,
      keys: data && data.length > 0 ? Object.keys(data[0]) : 'no data',
      sample: data ? data[0] : null
    };
    fs.writeFileSync(path.join(__dirname, 'out.json'), JSON.stringify(result, null, 2));
    console.log('DONE WRITING out.json');
  } catch (err) {
    fs.writeFileSync(path.join(__dirname, 'out.json'), JSON.stringify({ err: err.message || String(err) }));
  }
}
test();
