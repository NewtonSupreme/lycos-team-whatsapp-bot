// Verificación del sistema de roles: immódulos visibles (leer) por rol según la BD.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const norm = (v) => (typeof v === 'boolean' ? { crear: v, leer: v, editar: v, eliminar: v } : (v || {}));

const { data: roles } = await db.from('roles').select('nombre,label,permisos').order('label');
const { data: usuarios } = await db.from('usuarios').select('rol');
const counts = {};
for (const u of usuarios) counts[u.rol] = (counts[u.rol] || 0) + 1;

console.log('═══ Visibilidad de módulos por rol (BD) ═══\n');
for (const r of roles) {
  const visibles = Object.entries(r.permisos || {}).filter(([, v]) => norm(v).leer).map(([k]) => k);
  const crud = Object.entries(r.permisos || {}).filter(([, v]) => { const p = norm(v); return p.crear || p.editar || p.eliminar; }).map(([k]) => k);
  console.log(`▸ ${r.label} (${r.nombre}) — ${counts[r.nombre] || 0} usuario(s)`);
  console.log(`   Ve (${visibles.length}): ${visibles.join(', ') || '—'}`);
  console.log(`   CRUD en: ${crud.join(', ') || '—'}\n`);
}
