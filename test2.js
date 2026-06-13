const fs = require('fs');
require('dotenv').config({path: '.env.local'});
(async () => {
  try {
    const res = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/usuarios?select=*&limit=1', {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
    const data = await res.json();
    fs.writeFileSync('db_out2.json', JSON.stringify(data, null, 2));
  } catch(e) {
    fs.writeFileSync('db_out2.json', JSON.stringify({err: e.message}, null, 2));
  }
})();
