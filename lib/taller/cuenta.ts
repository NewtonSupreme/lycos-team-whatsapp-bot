import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * «Mi cuenta» del trabajador: lo que ha cargado hoy, esta semana y la pasada,
 * con lo que se cobró por cada trabajo. Sale de `job_assignments`, la misma
 * fuente que paga la nómina, así que lo que ve el mecánico es lo que se le
 * liquida. Es privado: la pantalla lo pide con su código.
 */

export interface TrabajoCuenta {
  id: string;
  fecha: string;            // YYYY-MM-DD
  hora: string | null;      // HH:MM, hora de Venezuela
  placa: string | null;
  vehiculo: string | null;
  descripcion: string;
  monto: number;            // lo cobrado, en dólares
  estado: 'pendiente' | 'liquidado';
}

export interface PeriodoCuenta {
  desde: string;
  hasta: string;
  trabajos: TrabajoCuenta[];
  total: number;
  cantidad: number;
}

export interface CuentaTrabajador {
  persona: { id: string; nombre: string; corto: string; foto: string | null; cargo: string | null };
  hoy: PeriodoCuenta;
  semana: PeriodoCuenta;
  semanaPasada: PeriodoCuenta;
  generado: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
// Venezuela no cambia de hora: UTC−4 todo el año.
const enCaracas = (d: Date) => new Date(d.getTime() - 4 * 3600_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Hoy, el lunes de esta semana y el de la pasada, en fecha de Caracas. */
export function fechasDeCuenta(ahora = new Date()) {
  const hoy = enCaracas(ahora);
  const lunes = new Date(hoy);
  lunes.setUTCDate(hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7));
  const lunesPasado = new Date(lunes);
  lunesPasado.setUTCDate(lunes.getUTCDate() - 7);
  const domingoPasado = new Date(lunes);
  domingoPasado.setUTCDate(lunes.getUTCDate() - 1);
  return { hoy: iso(hoy), lunes: iso(lunes), lunesPasado: iso(lunesPasado), domingoPasado: iso(domingoPasado) };
}

function periodo(trabajos: TrabajoCuenta[], desde: string, hasta: string): PeriodoCuenta {
  const t = trabajos.filter(x => x.fecha >= desde && x.fecha <= hasta);
  return { desde, hasta, trabajos: t, total: r2(t.reduce((a, x) => a + x.monto, 0)), cantidad: t.length };
}

export async function cuentaDelTrabajador(db: SupabaseClient, empleadoId: string): Promise<CuentaTrabajador | null> {
  const f = fechasDeCuenta();
  const [{ data: u }, { data: jobs }] = await Promise.all([
    db.from('usuarios').select('id, nombre, alias, foto_url, cargo, especialidad').eq('id', empleadoId).maybeSingle(),
    db.from('job_assignments')
      .select('id, fecha, created_at, descripcion, referencia_tabla, referencia_id, ingreso_usd, estado, es_override')
      .eq('empleado_id', empleadoId).gte('fecha', f.lunesPasado).neq('estado', 'anulado')
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(500),
  ]);
  if (!u) return null;

  // Placa y vehículo de cada orden, en una sola consulta.
  const propios = (jobs || []).filter(j => !j.es_override);
  const ordenes = [...new Set(propios.filter(j => j.referencia_tabla === 'servicios' && j.referencia_id).map(j => j.referencia_id as string))];
  const { data: servs } = ordenes.length
    ? await db.from('servicios').select('id, placa, vehiculo_info').in('id', ordenes)
    : { data: [] as Array<{ id: string; placa: string | null; vehiculo_info: string | null }> };
  const porId = new Map((servs || []).map(s => [s.id, s]));

  const trabajos: TrabajoCuenta[] = propios.map(j => {
    const s = j.referencia_id ? porId.get(j.referencia_id) : undefined;
    const placa = s?.placa ? String(s.placa).toUpperCase() : null;
    return {
      id: j.id,
      fecha: j.fecha,
      hora: j.created_at ? enCaracas(new Date(j.created_at)).toISOString().slice(11, 16) : null,
      placa,
      vehiculo: s?.vehiculo_info ? String(s.vehiculo_info).replace(new RegExp(placa || '@@', 'i'), '').trim() || null : null,
      descripcion: String(j.descripcion || 'Trabajo').replace(/\s+/g, ' ').trim(),
      monto: r2(Number(j.ingreso_usd) || 0),
      estado: j.estado === 'liquidado' ? 'liquidado' : 'pendiente',
    };
  });

  const nombre = String(u.nombre || '');
  const partes = nombre.trim().split(/\s+/);
  return {
    persona: {
      id: u.id, nombre,
      corto: (u.alias as string) || [partes[0], partes.length > 2 ? partes[2] : partes[1]].filter(Boolean).join(' '),
      foto: (u.foto_url as string) || null,
      cargo: (u.cargo as string) || (u.especialidad as string) || null,
    },
    hoy: periodo(trabajos, f.hoy, f.hoy),
    semana: periodo(trabajos, f.lunes, f.hoy),
    semanaPasada: periodo(trabajos, f.lunesPasado, f.domingoPasado),
    generado: new Date().toISOString(),
  };
}
