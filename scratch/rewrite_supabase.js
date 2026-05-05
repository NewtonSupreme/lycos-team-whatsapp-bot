const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/supabase.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add import if not exists
if (!content.includes('withSedeFilter')) {
  content = content.replace(
    "import { createClient } from '@supabase/supabase-js';",
    "import { createClient } from '@supabase/supabase-js';\nimport { withSedeFilter, withSedeInsert } from '@/lib/db-filters';"
  );
}

// 1. Replace all simple supabase.from(...) with withSedeFilter(supabase.from(...)) EXCEPT in places where we already did it or in checkMensajeDuplicado where it might not matter (but we should do it everywhere for safety).
// Actually, let's just do a regex replace for supabase.from(
content = content.replace(/await supabase\s*\n?\s*\.from/g, 'await withSedeFilter(supabase.from');
content = content.replace(/await supabase\.from/g, 'await withSedeFilter(supabase.from');
content = content.replace(/let query = supabase\s*\n?\s*\.from/g, 'let query = withSedeFilter(supabase.from');

// Fix closing parentheses for withSedeFilter. 
// This is tricky with regex. Instead of raw regex, I'll replace `withSedeFilter(supabase.from('tableName')` to `withSedeFilter(supabase.from('tableName'))`
content = content.replace(/withSedeFilter\(supabase\.from\((['`"][a-zA-Z_]+['`"])\)/g, "withSedeFilter(supabase.from($1))");

// 2. Wrap insert payloads with withSedeInsert
content = content.replace(/\.insert\(([^)]+)\)/g, ".insert(withSedeInsert($1))");
// Handle upsert too
content = content.replace(/\.upsert\(([^,]+),/g, ".upsert(withSedeInsert($1),");

// Check the modified content structure for Promise.all cases in fetchDashboardStats
// In fetchDashboardStats:
// supabase.from('clientes').select('*', { count: 'exact', head: true }),
// Because it's not preceded by 'await' (it's inside Promise.all), the first regex won't catch it.
content = content.replace(/supabase\.from\((['`"][a-zA-Z_]+['`"])\)/g, "withSedeFilter(supabase.from($1))");

// And we need to clean up double withSedeFilter if it happened
content = content.replace(/withSedeFilter\(withSedeFilter/g, "withSedeFilter");
content = content.replace(/\)\)\)/g, "))"); // Be careful with this, let's not break things.

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done rewriting lib/supabase.ts');
