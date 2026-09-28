import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { encargadosDeNotas } from '@/lib/nomina/encargados';

export const dynamic = 'force-dynamic';

/**
 * La revisión de la nómina: todo lo que haría que alguien cobre de menos o de más.
 *
 * GET ?inicio=&fin=&sede=
 *
 *   · sinEmpleado       comisiones que no le salen a nadie (el trabajo no está
 *                       enlazado a un empleado).
 *   · ordenesSinTrabajo órdenes entregadas en el período sin mecánico en
 *                       nómina: el trabajo se hizo y nadie cobra por él.
 *   · comisionCero      trabajos con comisión $0 que no son «del taller»: la
 *                       regla está en 0% o no hay regla.
 *   · enCurso           comisiones de órdenes abiertas: se pagan al entregar.
 *   · sinRegla          mecánicos activos sin ninguna regla de comisión.
 *   · montoImposible    trabajos que valen más que su orden entera.
 */

const CERRADAS = ['completada', 'completado', 'finalizado', 'finalizada'];
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const auth = await authorize('nomina', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const inicio = url.searchParams.get('inicio') || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const fin = url.searchParams.get('fin') || new Date().toISOString().slice(0, 10);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const db = auth.db;

  let jq = db.from('job_assignments').select('*').gte('fecha', inicio).lte('fecha', fin).eq('estado', 'pendiente');
  if (sede) jq = jq.eq('sede_id', sede);
  const { data: jobsRaw } = await jq;
  const jobs = (jobsRaw || []) as Array<Record<string, any>>;

  const servIds = [...new Set(jobs.filter(j => j.referencia_tabla === 'servicios' && j.referencia_id).map(j => j.referencia_id))];
  const servs = new Map<string, Record<string, any>>();
  for (let i = 0; i < servIds.length; i += 200) {
    const { data } = await db.from('servicios')
      .select('id, estado, fecha, nombre_cliente, placa, vehiculo_info, costo_estimado, costo_final, items')
      .in('id', servIds.slice(i, i + 200));
    for (const s of (data || [])) servs.set(s.id, s);
  }
  const totalOrden = (s?: Record<string, any>) => {
    if (!s) return 0;
    const items = Array.isArray(s.items) ? s.items : [];
    const t = items.reduce((a: number, it: any) => a + (Number(it?.total) || 0), 0);
    return Math.max(t, Number(s.costo_final) || 0, Number(s.costo_estimado) || 0);
  };
  const orden = (j: Record<string, any>) => {
    const s = servs.get(j.referencia_id);
    return s ? { cliente: s.nombre_cliente, placa: s.placa, vehiculo: s.vehiculo_info, id: s.id } : null;
  };
  const fila = (j: Record<string, any>) => ({
    id: j.id, fecha: j.fecha, empleado: j.empleado_nombre || 'Sin nombre', descripcion: j.descripcion,
    ingreso: r2(j.ingreso_usd), manoObra: r2(j.mano_obra_usd), comision: r2(j.comision_usd), orden: orden(j),
  });

  const directos = jobs.filter(j => !j.es_override);
  const sinEmpleado = directos.filter(j => !j.empleado_id && !j.es_taller).map(fila);
  const enCurso = directos.filter(j => {
    const s = servs.get(j.referencia_id);
    return s && !CERRADAS.includes(String(s.estado)) && !String(s.estado).startsWith('cancel');
  });
  const comisionCero = directos
    .filter(j => j.empleado_id && !j.es_taller && r2(j.comision_usd) === 0 && !j.desglose?.manual)
    .map(j => ({ ...fila(j), motivo: j.regla_id ? 'La regla está en 0%: define la comisión a mano' : 'No tiene regla de comisión' }));
  const montoImposible = directos
    .filter(j => j.referencia_tabla === 'servicios' && servs.has(j.referencia_id)
      && r2(j.ingreso_usd) > totalOrden(servs.get(j.referencia_id)) * 1.16 + 1)
    .map(j => ({ ...fila(j), totalOrden: r2(totalOrden(servs.get(j.referencia_id))) }));

  // Órdenes entregadas en el período sin nadie en nómina.
  let oq = db.from('servicios')
    .select('id, fecha, fecha_fin, estado, nombre_cliente, placa, vehiculo_info, costo_estimado, costo_final, notas, items')
    .in('estado', CERRADAS)
    .gte('fecha_fin', `${inicio}T04:00:00Z`)
    .lt('fecha_fin', new Date(new Date(`${fin}T04:00:00Z`).getTime() + 86400000).toISOString());
  if (sede) oq = oq.eq('sede_id', sede);
  const { data: cerradas } = await oq;
  const idsCerradas = (cerradas || []).map((s: Record<string, any>) => s.id);
  const conTrabajo = new Set<string>();
  for (let i = 0; i < idsCerradas.length; i += 200) {
    const { data } = await db.from('job_assignments').select('referencia_id').in('referencia_id', idsCerradas.slice(i, i + 200));
    for (const j of (data || [])) conTrabajo.add(j.referencia_id);
  }
  const ordenesSinTrabajo = (cerradas || [])
    .filter((s: Record<string, any>) => !conTrabajo.has(s.id))
    .map((s: Record<string, any>) => ({
      id: s.id, fecha: s.fecha, cliente: s.nombre_cliente, placa: s.placa, vehiculo: s.vehiculo_info,
      total: r2(totalOrden(s)),
      encargados: encargadosDeNotas(s.notas),
    }));

  // Mecánicos activos sin ninguna regla.
  let uq = db.from('usuarios').select('id, nombre, rol').in('rol', ['mecanico', 'jefe_taller']).neq('activo', false);
  if (sede) uq = uq.eq('sede_id', sede);
  const [{ data: mecs }, { data: reglas }] = await Promise.all([
    uq, db.from('commission_rules').select('empleado_id, valor, tipo_regla').neq('activo', false),
  ]);
  const conRegla = new Set((reglas || []).map((r: Record<string, any>) => r.empleado_id));
  const reglasCero = new Set((reglas || [])
    .filter((r: Record<string, any>) => r.tipo_regla === 'porcentaje' && Number(r.valor) === 0)
    .map((r: Record<string, any>) => r.empleado_id));
  const sinRegla = (mecs || [])
    .filter((u: Record<string, any>) => !conRegla.has(u.id) || reglasCero.has(u.id))
    .map((u: Record<string, any>) => ({
      id: u.id, nombre: u.nombre,
      motivo: conRegla.has(u.id) ? 'Su regla está en 0%: cada trabajo necesita comisión a mano' : 'No tiene regla de comisión',
    }));

  return NextResponse.json({
    periodo: { inicio, fin },
    sinEmpleado: { n: sinEmpleado.length, usd: r2(sinEmpleado.reduce((s, j) => s + j.comision, 0)), lista: sinEmpleado },
    ordenesSinTrabajo: { n: ordenesSinTrabajo.length, usd: r2(ordenesSinTrabajo.reduce((s: number, o: { total: number }) => s + o.total, 0)), lista: ordenesSinTrabajo },
    comisionCero: { n: comisionCero.length, lista: comisionCero },
    enCurso: { n: enCurso.length, usd: r2(enCurso.reduce((s, j) => s + (Number(j.comision_usd) || 0), 0)), lista: enCurso.map(fila) },
    sinRegla: { n: sinRegla.length, lista: sinRegla },
    montoImposible: { n: montoImposible.length, lista: montoImposible },
  });
}
