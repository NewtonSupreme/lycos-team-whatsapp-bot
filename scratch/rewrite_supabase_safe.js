const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/supabase.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Ensure imports
if (!content.includes('withSedeFilter')) {
  content = content.replace(
    "import { createClient } from '@supabase/supabase-js';",
    "import { createClient } from '@supabase/supabase-js';\nimport { withSedeFilter, withSedeInsert } from '@/lib/db-filters';"
  );
}

// 1. Wrap supabase.from('table') with withSedeFilter()
// We look for supabase.from('xyz') and replace it with withSedeFilter(supabase.from('xyz'))
content = content.replace(/supabase\.from\((['"`][a-zA-Z0-9_]+['"`])\)/g, "withSedeFilter(supabase.from($1))");

// 2. Wrap .insert(payload) with .insert(withSedeInsert(payload))
// Only apply this if it hasn't been applied yet.
// We look for .insert(something) but avoid matching .insert(withSedeInsert(...
content = content.replace(/\.insert\((?!withSedeInsert)([^)]+)\)/g, ".insert(withSedeInsert($1))");

// 3. Wrap .upsert(payload, ...) with .upsert(withSedeInsert(payload), ...)
content = content.replace(/\.upsert\((?!withSedeInsert)([^,]+),/g, ".upsert(withSedeInsert($1),");

// 4. Since we replaced `supabase.from('...')` with `withSedeFilter(...)`, any existing 
// `await withSedeFilter(supabase.from('...'))` (if I had done some manually) would become 
// `await withSedeFilter(withSedeFilter(supabase.from('...')))`. Let's clean that up.
content = content.replace(/withSedeFilter\(withSedeFilter\(/g, "withSedeFilter(");

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ lib/supabase.ts updated safely');
