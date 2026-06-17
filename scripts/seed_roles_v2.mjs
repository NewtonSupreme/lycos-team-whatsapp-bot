// Reseed de los 7 roles canónicos con los permisos por defecto actuales.
//  - Agrega el rol 'dueno' (solo lectura, ve todo).
//  - Refresca permisos: la eliminación definitiva es exclusiva de 'admin'.
//  Uso: node scripts/seed_roles_v2.mjs
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

const full = (a) => ({ crear: a, leer: a, editar: a, eliminar: a });
const manage = (c, r, e) => ({ crear: c, leer: r, editar: e, eliminar: false });
const ver = () => ({ crear: false, leer: true, editar: false, eliminar: false });
const none = () => ({ crear: false, leer: false, editar: false, eliminar: false });

const PERMISOS = {
  admin: {
    dashboard: full(true), clientes: full(true), vehiculos: full(true), servicios: full(true), taller: full(true),
    agenda: full(true), whatsapp: full(true), leads: full(true), inventario: full(true), papelera: full(true),
    ventas: full(true), ia_asistente: full(true), reportes: full(true), actividad: full(true),
    calculadora: full(true), configuracion: full(true), empleados: full(true), distribuidor: full(true), presupuestos: full(true),
  },
  dueno: {
    dashboard: ver(), clientes: ver(), vehiculos: ver(), servicios: ver(), taller: ver(),
    agenda: ver(), whatsapp: ver(), leads: ver(), inventario: ver(), papelera: ver(),
    ventas: ver(), ia_asistente: ver(), reportes: ver(), actividad: ver(),
    calculadora: full(true), configuracion: ver(), empleados: ver(), distribuidor: ver(), presupuestos: ver(),
  },
  supervisor: {
    dashboard: manage(true, true, true), clientes: manage(true, true, true), vehiculos: manage(true, true, true),
    servicios: manage(true, true, true), taller: manage(true, true, true), agenda: manage(true, true, true), whatsapp: manage(true, true, true),
    leads: manage(true, true, true), inventario: manage(true, true, true), papelera: manage(false, true, true),
    ventas: manage(true, true, true), ia_asistente: manage(true, true, true), reportes: ver(), actividad: ver(),
    calculadora: full(true), configuracion: none(), empleados: manage(true, true, true), distribuidor: manage(true, true, true), presupuestos: manage(true, true, true),
  },
  cobranza: {
    dashboard: ver(), clientes: manage(false, true, true), vehiculos: ver(),
    servicios: ver(), taller: none(), agenda: none(), whatsapp: ver(),
    leads: none(), inventario: ver(), papelera: none(), ventas: manage(true, true, true),
    ia_asistente: none(), reportes: ver(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: manage(true, true, true),
  },
  atencion_cliente: {
    dashboard: ver(), clientes: manage(true, true, true), vehiculos: manage(true, true, true),
    servicios: ver(), taller: ver(), agenda: manage(true, true, true), whatsapp: manage(true, true, true),
    leads: manage(true, true, true), inventario: ver(), papelera: none(), ventas: none(),
    ia_asistente: manage(true, true, true), reportes: none(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: manage(true, true, true),
  },
  jefe_taller: {
    dashboard: ver(), clientes: ver(), vehiculos: manage(true, true, true),
    servicios: manage(true, true, true), taller: manage(true, true, true), agenda: ver(), whatsapp: none(),
    leads: none(), inventario: manage(true, true, true), papelera: none(), ventas: none(),
    ia_asistente: none(), reportes: ver(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: ver(), presupuestos: manage(true, true, false),
  },
  mecanico: {
    dashboard: ver(), clientes: none(), vehiculos: ver(),
    servicios: manage(true, true, true), taller: manage(false, true, true), agenda: none(), whatsapp: none(),
    leads: none(), inventario: ver(), papelera: none(), ventas: none(),
    ia_asistente: none(), reportes: none(), actividad: none(), calculadora: full(true),
    configuracion: none(), empleados: none(), distribuidor: none(), presupuestos: none(),
  },
};

// REGLA: la eliminación es exclusiva de 'admin' → forzar eliminar=false en el resto.
// El Dueño es solo-lectura: nunca crea/edita/elimina.
for (const [rol, perms] of Object.entries(PERMISOS)) {
  if (rol === 'admin') continue;
  const soloLectura = rol === 'dueno';
  for (const mod of Object.keys(perms)) {
    perms[mod] = soloLectura
      ? { crear: false, leer: perms[mod].leer, editar: false, eliminar: false }
      : { ...perms[mod], eliminar: false };
  }
}

const CATALOG = [
  { nombre: 'admin', label: 'Administración', descripcion: 'Control total del sistema y de todas las sedes.' },
  { nombre: 'dueno', label: 'Dueño', descripcion: 'Visualiza absolutamente todo en todas las sedes. Solo lectura: no crea, edita ni elimina.' },
  { nombre: 'supervisor', label: 'Supervisor de Sede', descripcion: 'Gestiona su sede asignada: operaciones, personal y ventas.' },
  { nombre: 'cobranza', label: 'Cobranza', descripcion: 'Facturación, ventas, presupuestos y reportes financieros.' },
  { nombre: 'atencion_cliente', label: 'Atención al Cliente', descripcion: 'Recepción: clientes, vehículos, citas y mensajería.' },
  { nombre: 'jefe_taller', label: 'Jefe de Taller', descripcion: 'Lidera el taller: servicios, vehículos e inventario.' },
  { nombre: 'mecanico', label: 'Mecánico', descripcion: 'Ejecuta y actualiza los servicios del taller.' },
];

for (const role of CATALOG) {
  const { error } = await db.from('roles').upsert({ ...role, permisos: PERMISOS[role.nombre] }, { onConflict: 'nombre' });
  console.log(error ? `⚠️  ${role.nombre}: ${error.message}` : `✅ ${role.label}`);
}
const { data } = await db.from('roles').select('nombre').order('nombre');
console.log('\nRoles en BD:', data.map(r => r.nombre).join(', '));
