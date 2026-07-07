const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

fetch(`${SUPABASE_URL}/rest/v1/egresos?select=*&limit=1`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
})
.then(r => r.json())
.then(data => {
  const fs = require('fs');
  fs.writeFileSync('egresos_out.json', JSON.stringify(data, null, 2));
});
