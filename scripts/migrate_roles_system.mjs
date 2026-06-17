// ============================================================================
// Migración: rediseño del sistema de roles de Lycos Team
// ----------------------------------------------------------------------------
//  - Reinicia la tabla `roles` a los 6 roles canónicos con sus permisos.
//  - Migra usuarios: gerente→supervisor, empleado→atencion_cliente,
//    mecanico_acceso→mecanico, jefe_taller_acceso→jefe_taller.
//  - Resetea usuarios.permisos = NULL (heredan los permisos de su rol).
//  - Habilita login del personal técnico (mecánico / jefe de taller).
//
//  Uso:  node scripts/migrate_roles_system.mjs
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Cargar variables de entorno desde .env.local ---------------------------
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch (e) {
    console.error('No se pudo leer .env.local:', e.message);
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// --- Helpers de permisos -----------------------------------------------------
const perm = (c, r, e, d) => ({ crear: c, leer: r, editar: e, eliminar: d });
const full = (a) => ({ crear: a, leer: a, editar: a, eliminar: a });

const PERMISOS = {
  admin: {
    dashboard: full(true), clientes: full(true), vehiculos: full(true), servicios: full(true), taller: full(true),
    agenda: full(true), whatsapp: full(true), leads: full(true), inventario: full(true), papelera: full(true),
    ventas: full(true), ia_asistente: full(true), reportes: full(true), actividad: full(true),
    calculadora: full(true), configuracion: full(true), empleados: full(true), distribuidor: full(true), presupuestos: full(true),
  },
  supervisor: {
    dashboard: full(true), clientes: full(true), vehiculos: full(true), servicios: full(true), taller: full(true),
    agenda: full(true), whatsapp: full(true), leads: full(true), inventario: full(true), papelera: perm(false, true, true, false),
    ventas: full(true), ia_asistente: full(true), reportes: full(true), actividad: perm(false, true, false, false),
    calculadora: full(true), configuracion: full(false), empleados: perm(true, true, true, false), distribuidor: full(true), presupuestos: full(true),
  },
  cobranza: {
    dashboard: perm(false, true, false, false), clientes: perm(false, true, true, false), vehiculos: perm(false, true, false, false),
    servicios: perm(false, true, false, false), taller: full(false), agenda: full(false), whatsapp: perm(false, true, false, false),
    leads: full(false), inventario: perm(false, true, false, false), papelera: full(false), ventas: full(true),
    ia_asistente: full(false), reportes: perm(false, true, false, false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(true),
  },
  atencion_cliente: {
    dashboard: perm(false, true, false, false), clientes: full(true), vehiculos: full(true),
    servicios: perm(false, true, false, false), taller: perm(false, true, false, false), agenda: full(true), whatsapp: full(true),
    leads: full(true), inventario: perm(false, true, false, false), papelera: full(false), ventas: full(false),
    ia_asistente: full(true), reportes: full(false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(true),
  },
  jefe_taller: {
    dashboard: perm(false, true, false, false), clientes: perm(false, true, false, false), vehiculos: full(true),
    servicios: full(true), taller: full(true), agenda: perm(false, true, false, false), whatsapp: full(false),
    leads: full(false), inventario: full(true), papelera: full(false), ventas: full(false),
    ia_asistente: full(false), reportes: perm(false, true, false, false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: perm(false, true, false, false), presupuestos: perm(true, true, false, false),
  },
  mecanico: {
    dashboard: perm(false, true, false, false), clientes: full(false), vehiculos: perm(false, true, false, false),
    servicios: perm(true, true, true, false), taller: perm(false, true, true, false), agenda: full(false), whatsapp: full(false),
    leads: full(false), inventario: perm(false, true, false, false), papelera: full(false), ventas: full(false),
    ia_asistente: full(false), reportes: full(false), actividad: full(false), calculadora: full(true),
    configuracion: full(false), empleados: full(false), distribuidor: full(false), presupuestos: full(false),
  },
};

const CATALOG = [
  { nombre: 'admin', label: 'Administración', descripcion: 'Control total del sistema y de todas las sedes.' },
  { nombre: 'supervisor', label: 'Supervisor de Sede', descripcion: 'Gestiona su sede asignada: operaciones, personal y ventas.' },
  { nombre: 'cobranza', label: 'Cobranza', descripcion: 'Facturación, ventas, presupuestos y reportes financieros.' },
  { nombre: 'atencion_cliente', label: 'Atención al Cliente', descripcion: 'Recepción: clientes, vehículos, citas y mensajería.' },
  { nombre: 'jefe_taller', label: 'Jefe de Taller', descripcion: 'Lidera el taller: servicios, vehículos e inventario.' },
  { nombre: 'mecanico', label: 'Mecánico', descripcion: 'Ejecuta y actualiza los servicios del taller.' },
];

const ROLE_MIGRATION = {
  gerente: 'supervisor',
  empleado: 'atencion_cliente',
  mecanico_acceso: 'mecanico',
  jefe_taller_acceso: 'jefe_taller',
};

async function main() {
  console.log('🔧 Migrando sistema de roles de Lycos Team...\n');

  // 1) Migrar roles de usuarios heredados → canónicos
  for (const [oldRol, newRol] of Object.entries(ROLE_MIGRATION)) {
    const { data, error } = await db.from('usuarios').update({ rol: newRol }).eq('rol', oldRol).select('id');
    if (error) console.error(`   ⚠️  usuarios ${oldRol}→${newRol}:`, error.message);
    else console.log(`   ✅ usuarios ${oldRol} → ${newRol}: ${data?.length || 0}`);
  }

  // 2) Resetear permisos por-usuario (todos heredan los del rol)
  {
    const { data, error } = await db.from('usuarios').update({ permisos: null }).not('id', 'is', null).select('id');
    if (error) console.error('   ⚠️  reset permisos:', error.message);
    else console.log(`   ✅ permisos por-usuario reseteados: ${data?.length || 0}`);
  }

  // 3) Habilitar login del personal técnico sin acceso previo
  {
    const { data, error } = await db.from('usuarios')
      .update({ password_hash: 'lycos2026', activo: true })
      .in('rol', ['mecanico', 'jefe_taller'])
      .eq('password_hash', 'NO_ACCESS_STAFF')
      .select('id');
    if (error) console.error('   ⚠️  habilitar técnicos:', error.message);
    else console.log(`   ✅ personal técnico habilitado para login: ${data?.length || 0}`);
  }

  // 4) Upsert de los 6 roles canónicos con permisos
  for (const role of CATALOG) {
    const row = { ...role, permisos: PERMISOS[role.nombre] };
    const { error } = await db.from('roles').upsert(row, { onConflict: 'nombre' });
    if (error) console.error(`   ⚠️  rol ${role.nombre}:`, error.message);
    else console.log(`   ✅ rol upsert: ${role.label}`);
  }

  // 5) Eliminar roles heredados de la tabla `roles`
  {
    const legacy = Object.keys(ROLE_MIGRATION);
    const { error } = await db.from('roles').delete().in('nombre', legacy);
    if (error) console.error('   ⚠️  borrar roles heredados:', error.message);
    else console.log(`   ✅ roles heredados eliminados: ${legacy.join(', ')}`);
  }

  // 6) Verificación
  const { data: roles } = await db.from('roles').select('nombre,label').order('nombre');
  const { data: usuarios } = await db.from('usuarios').select('rol');
  const counts = {};
  for (const u of usuarios || []) counts[u.rol] = (counts[u.rol] || 0) + 1;
  console.log('\n📋 Roles en BD:', (roles || []).map(r => r.nombre).join(', '));
  console.log('👥 Usuarios por rol:', JSON.stringify(counts));
  console.log('\n✅ Migración completada.');
}

main().catch((e) => { console.error('❌ Error fatal:', e); process.exit(1); });
