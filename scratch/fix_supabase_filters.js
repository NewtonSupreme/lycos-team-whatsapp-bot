const fs = require('fs');

let content = fs.readFileSync('lib/supabase.ts', 'utf8');

// 1. Remove existing wrappers to start clean
content = content.replace(/withSedeFilter\s*\(\s*supabase\s*\n?\s*\.\s*from\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g, "supabase.from('$1')");
content = content.replace(/\.insert\s*\(\s*withSedeInsert\s*\(([^)]+)\)\s*\)/g, ".insert($1)");
content = content.replace(/\.upsert\s*\(\s*withSedeInsert\s*\(([^)]+)\)\s*\)/g, ".upsert($1)");

// 2. Wrap supabase.from (except for 'sedes')
content = content.replace(/supabase\s*\n?\s*\.\s*from\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, table) => {
    if (table === 'sedes') {
        return `supabase.from('${table}')`;
    }
    return `withSedeFilter(supabase.from('${table}'))`;
});

// 3. Wrap .insert(...)
// Need to be careful not to wrap empty inserts or inserts that are already wrapped (should be clean now)
content = content.replace(/\.insert\s*\(\s*([^);]+)\s*\)/g, (match, payload) => {
    if (!payload.trim()) return match;
    if (payload.includes('withSedeInsert')) return match; // safety
    return `.insert(withSedeInsert(${payload}))`;
});

// 4. Wrap .upsert(...)
content = content.replace(/\.upsert\s*\(\s*([^);]+)\s*\)/g, (match, payload) => {
    if (!payload.trim()) return match;
    if (payload.includes('withSedeInsert')) return match; // safety
    return `.upsert(withSedeInsert(${payload}))`;
});

fs.writeFileSync('lib/supabase.ts', content, 'utf8');
console.log('Fixed lib/supabase.ts');
