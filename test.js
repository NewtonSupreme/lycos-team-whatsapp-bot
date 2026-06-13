const fs = require('fs');
require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  fs.writeFileSync('db_error.txt', 'Missing URL or KEY');
  process.exit(1);
}

const sb = createClient(url, key);

(async () => {
  try {
    const { data: users, error } = await sb.from('usuarios').select('*');
    if (error) {
      fs.writeFileSync('users.json', JSON.stringify({error}, null, 2));
    } else {
      fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    }
    console.log('done');
  } catch (e) {
    fs.writeFileSync('users.json', JSON.stringify({catchError: e.message}, null, 2));
    console.log('error');
  }
})();
