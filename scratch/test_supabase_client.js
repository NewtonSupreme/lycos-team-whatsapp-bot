const { createClient } = require('@supabase/supabase-js');
try {
  const sb = createClient('', '');
  console.log('Client created with empty strings');
} catch (e) {
  console.log('Error creating client with empty strings:', e.message);
}
