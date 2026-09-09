import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const iso = (d: Date) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
};

/**
 * Todo lo que necesita la pantalla de RRHH en una sola consulta.
 *
 * Los indicadores se derivan de los datos, no se guardan: el estado "en
 * vacaciones" sale de tener vacaciones aprobadas que cubren hoy, y los presentes
 * salen de la asistencia del día. Guardarlos aparte sería tener dos verdades.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('empleados', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoy = url.searchParams.get('fecha') || iso(new Date());
  const hoyD = new Date(hoy + 'T00:00:00');
  const en30 = iso(new Date(hoyD.getTime() + 30 * 86400000));

  // ── Plantilla ────────────────────────────────────────────────────────────
  let uq = auth.db.from('usuarios').select(
    'id, nombre, username, email, telefono, cedula, rol, especialidad, foto_url, avatar_url, activo, sede_id, cargo, area, tipo_contrato, fecha_ingreso, fecha_nacimiento, fecha_egreso, updated_at',
  ).order('nombre');
  if (sede) uq = uq.eq('sede_id', sede);
  const { data: usuarios, error } = await uq;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const activos = (usuarios || []).filter(u => u.activo !== false);
  const ids = activos.map(u => u.id);

  if (ids.length === 0) {
    return NextResponse.json({
      fecha: hoy, empleados: [], kpis: vacio(), asistenciaHoy: { presentes: 0, tardanzas: 0, ausentes: 0 },
      cumpleanos: [], vacacionesProximas: [], evaluaciones: [], capacitaciones: [],
      distribucion: [], antiguedad: [],
    });
  }

  // ── Movimientos ──────────────────────────────────────────────────────────
  const [asis, vaca, perm, evals, capas] = await Promise.all([
    auth.db.from('rrhh_asistencia').select('empleado_id, estado, hora_entrada').eq('fecha', hoy).in('empleado_id', ids),
    auth.db.from('rrhh_vacaciones').select('*').eq('estado', 'aprobada').in('empleado_id', ids).gte('fecha_fin', hoy).order('fecha_inicio'),
    auth.db.from('rrhh_permisos').select('*').eq('estado', 'aprobado').in('empleado_id', ids).lte('fecha_inicio', hoy).gte('fecha_fin', hoy),
    auth.db.from('rrhh_evaluaciones').select('*').in('empleado_id', ids).order('fecha', { ascending: false }).limit(400),
    auth.db.from('rrhh_capacitaciones').select('*').in('empleado_id', ids).order('fecha', { ascending: false }).limit(400),
  ]);

  const asistencia = asis.data || [];
  const vacaciones = vaca.data || [];
  const permisos = perm.data || [];

  const enVacacionesHoy = new Set(
    vacaciones.filter(v => v.fecha_inicio <= hoy && v.fecha_fin >= hoy).map(v => v.empleado_id),
  );
  const conPermisoHoy = new Set(permisos.map(p => p.empleado_id));
  const asistenciaPorId = new Map(asistencia.map(a => [a.empleado_id, a]));

  const presentes = asistencia.filter(a => a.estado === 'presente').length;
  const tardanzas = asistencia.filter(a => a.estado === 'tardanza').length;
  // Ausente es quien no marcó y no está de vacaciones ni de permiso: el que
  // falta sin avisar no puede quedar contado igual que el que avisó.
  const ausentes = activos.filter(u =>
    !asistenciaPorId.has(u.id) && !enVacacionesHoy.has(u.id) && !conPermisoHoy.has(u.id),
  ).length + asistencia.filter(a => a.estado === 'ausente').length;

  // ── Empleados con su estado del día ──────────────────────────────────────
  const empleados = (usuarios || []).map(u => ({
    ...u,
    estado: u.activo === false ? 'inactivo'
      : enVacacionesHoy.has(u.id) ? 'vacaciones'
        : conPermisoHoy.has(u.id) ? 'permiso'
          : 'activo',
    asistencia_hoy: asistenciaPorId.get(u.id)?.estado ?? null,
  }));

  // ── Cumpleaños del mes y próximos ────────────────────────────────────────
  const mesActual = Number(hoy.slice(5, 7));
  const cumpleMes = activos.filter(u => u.fecha_nacimiento && Number(String(u.fecha_nacimiento).slice(5, 7)) === mesActual);

  const cumpleanos = activos
    .filter(u => u.fecha_nacimiento)
    .map(u => {
      const mmdd = String(u.fecha_nacimiento).slice(5);
      const esteAnio = new Date(`${hoy.slice(0, 4)}-${mmdd}T00:00:00`);
      const proximo = esteAnio >= hoyD ? esteAnio : new Date(`${Number(hoy.slice(0, 4)) + 1}-${mmdd}T00:00:00`);
      return { id: u.id, nombre: u.nombre, foto_url: u.foto_url || u.avatar_url, fecha: iso(proximo), dias: Math.round((proximo.getTime() - hoyD.getTime()) / 86400000) };
    })
    .filter(c => c.dias <= 45)
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 5);

  // ── Vacaciones que vienen ────────────────────────────────────────────────
  const porId = new Map(activos.map(u => [u.id, u]));
  const vacacionesProximas = vacaciones
    .filter(v => v.fecha_fin >= hoy && v.fecha_inicio <= en30)
    .slice(0, 5)
    .map(v => ({
      ...v,
      nombre: porId.get(v.empleado_id)?.nombre || '—',
      foto_url: porId.get(v.empleado_id)?.foto_url || porId.get(v.empleado_id)?.avatar_url || null,
    }));

  // ── Distribución por área ────────────────────────────────────────────────
  const areas = new Map<string, number>();
  activos.forEach(u => {
    const a = (u.area || '').trim() || 'Sin área';
    areas.set(a, (areas.get(a) || 0) + 1);
  });
  const distribucion = Array.from(areas.entries())
    .map(([area, total]) => ({ area, total, pct: Math.round((total / activos.length) * 100) }))
    .sort((a, b) => b.total - a.total);

  // ── Antigüedad ───────────────────────────────────────────────────────────
  const TRAMOS = [
    { label: '< 1 año', min: 0, max: 1 },
    { label: '1 - 2 años', min: 1, max: 2 },
    { label: '2 - 3 años', min: 2, max: 3 },
    { label: '3 - 5 años', min: 3, max: 5 },
    { label: '> 5 años', min: 5, max: Infinity },
  ];
  const antiguedad = TRAMOS.map(t => ({
    label: t.label,
    total: activos.filter(u => {
      if (!u.fecha_ingreso) return false;
      const anios = (hoyD.getTime() - new Date(String(u.fecha_ingreso) + 'T00:00:00').getTime()) / (365.25 * 86400000);
      return anios >= t.min && anios < t.max;
    }).length,
  }));
  const sinFechaIngreso = activos.filter(u => !u.fecha_ingreso).length;

  // ── Rotación de los últimos 12 meses ─────────────────────────────────────
  // Solo cuenta como baja quien tiene fecha de egreso dentro del año. Deducirla
  // de `updated_at` daba un porcentaje falso: esa columna cambia con cualquier
  // edición, y las cuentas viejas desactivadas hace años contaban como bajas de
  // hoy. Mientras nadie tenga fecha de egreso, la rotación es 0 de verdad.
  const haceUnAnio = iso(new Date(hoyD.getTime() - 365 * 86400000));
  const bajas = (usuarios || []).filter(u =>
    u.activo === false && u.fecha_egreso && String(u.fecha_egreso).slice(0, 10) >= haceUnAnio,
  ).length;
  const rotacion = activos.length + bajas > 0 ? Math.round((bajas / (activos.length + bajas)) * 100) : 0;

  return NextResponse.json({
    fecha: hoy,
    empleados,
    kpis: {
      total: activos.length,
      presentes,
      tardanzas,
      ausentes,
      pctPresentes: activos.length > 0 ? Math.round((presentes / activos.length) * 100) : 0,
      enVacaciones: enVacacionesHoy.size,
      permisos: conPermisoHoy.size,
      cumpleanosMes: cumpleMes.length,
      rotacion,
      bajas,
    },
    asistenciaHoy: { presentes, tardanzas, ausentes },
    cumpleanos,
    vacacionesProximas,
    evaluaciones: evals.data || [],
    capacitaciones: capas.data || [],
    distribucion,
    antiguedad,
    sinFechaIngreso,
  });
}

function vacio() {
  return {
    total: 0, presentes: 0, tardanzas: 0, ausentes: 0, pctPresentes: 0,
    enVacaciones: 0, permisos: 0, cumpleanosMes: 0, rotacion: 0, bajas: 0,
  };
}
