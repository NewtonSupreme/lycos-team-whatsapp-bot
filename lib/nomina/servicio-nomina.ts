import { claveRenglon } from '@/lib/ficha/sincronizar';
import { manoObraDeRenglon, type CostoDeFicha } from '@/lib/nomina/mano-obra';
import { getPayrollService } from '@/lib/payroll/service';

/**
 * La nómina de una orden de servicio, vista desde la orden.
 *
 * Cuatro reglas que la nómina no respetaba y que hacían que pagara de más, de
 * menos o en la semana equivocada:
 *
 *   1. La comisión «sobre mano de obra» se calcula sobre la mano de obra: el
 *      precio del renglón menos lo que costó la pieza que puso el taller.
 *   2. Un trabajo no puede valer más que la orden entera. Así entró un número
 *      de teléfono leído como precio: $4.123.295.
 *   3. El trabajo cuenta en la semana en que se entregó el carro, no en la que
 *      entró. Una orden abierta el lunes y cerrada el lunes siguiente caía en
 *      una semana que podía estar ya liquidada.
 *   4. Si cambia el costo de una pieza en la ficha, cambia la mano de obra:
 *      las comisiones pendientes de esa orden se recalculan.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

const CERRADAS = ['completada', 'completado', 'finalizado', 'finalizada'];
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const diaCaracas = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

export interface ContextoServicio {
  existe: boolean;
  estado: string;
  cerrada: boolean;
  cancelada: boolean;
  /** El día en que cuenta el trabajo: el de cierre si ya cerró, si no el de la orden. */
  fechaTrabajo: string | null;
  /** Tope de lo que puede valer un trabajo: el total de la orden con IVA. */
  topeUSD: number;
  items: Array<{ descripcion?: string; total?: number; cantidad?: number; es_mano_obra?: boolean; costo_unitario?: number }>;
  costos: Map<string, CostoDeFicha>;
}

export async function contextoDeServicio(db: Db, servicioId: string): Promise<ContextoServicio> {
  const [{ data: s }, { data: partidas }] = await Promise.all([
    db.from('servicios').select('id, estado, fecha, fecha_fin, items, costo_estimado, costo_final, con_iva')
      .eq('id', servicioId).maybeSingle(),
    db.from('vehiculo_partidas').select('descripcion, clave_item, cantidad, costo, origen, tipo')
      .eq('servicio_id', servicioId),
  ]);
  const costos = new Map<string, CostoDeFicha>();
  for (const p of (partidas || []) as Array<Record<string, unknown>>) {
    const clave = claveRenglon(p.clave_item || p.descripcion);
    const prev = costos.get(clave);
    const costo = r2((Number(p.costo) || 0) * (Number(p.cantidad) || 1));
    costos.set(clave, {
      costo: r2((prev?.costo || 0) + costo),
      origen: String(p.origen || 'taller'),
      tipo: String(p.tipo || 'repuesto'),
    });
  }
  if (!s) {
    return { existe: false, estado: '', cerrada: false, cancelada: false, fechaTrabajo: null, topeUSD: Infinity, items: [], costos };
  }
  const estado = String(s.estado || '');
  const cerrada = CERRADAS.includes(estado);
  const items = Array.isArray(s.items) ? s.items : [];
  const totalItems = r2(items.reduce((a: number, i: { total?: number }) => a + (Number(i?.total) || 0), 0));
  const total = Math.max(totalItems, Number(s.costo_final) || 0, Number(s.costo_estimado) || 0);
  return {
    existe: true,
    estado,
    cerrada,
    cancelada: estado.startsWith('cancel') || estado === 'anulada',
    fechaTrabajo: cerrada && s.fecha_fin ? diaCaracas(s.fecha_fin) : (s.fecha || null),
    // IVA y un dólar de redondeo de margen.
    topeUSD: total > 0 ? r2(total * 1.16 + 1) : Infinity,
    items,
    costos,
  };
}

/** La mano de obra de un trabajo de la orden, a partir de su renglón. */
export function manoObraDeTrabajo(
  ctx: ContextoServicio,
  trabajo: { descripcion?: string | null; ingreso_total: number; mano_obra?: number | null },
): number {
  const clave = claveRenglon(trabajo.descripcion);
  const item = ctx.items.find(i => claveRenglon(i.descripcion) === clave);
  const ficha = ctx.costos.get(clave) || null;
  if (!item && !ficha) {
    // Trabajo que no es un renglón de la orden (la orden entera, una
    // comisión manual…): se respeta lo que diga.
    return r2(trabajo.mano_obra != null ? Number(trabajo.mano_obra) : trabajo.ingreso_total);
  }
  return manoObraDeRenglon({
    total: Number(trabajo.ingreso_total) || 0,
    cantidad: item?.cantidad,
    es_mano_obra: item?.es_mano_obra,
    costo_unitario: item?.costo_unitario,
  }, ficha);
}

/**
 * Pone al día las comisiones pendientes de una orden: su mano de obra, su día
 * y su tope. Lo llama la ficha al cambiar un costo y la orden al cerrarse.
 * Lo liquidado nunca se toca.
 */
export async function recalcularTrabajosDeServicio(db: Db, servicioId: string, usuario: string): Promise<number> {
  const ctx = await contextoDeServicio(db, servicioId);
  if (!ctx.existe) return 0;
  const { data: jobs } = await db.from('job_assignments').select('*')
    .eq('referencia_id', servicioId).eq('estado', 'pendiente').eq('es_override', false);
  const svc = getPayrollService(db as never);
  let cambiados = 0;
  for (const j of (jobs || []) as Array<Record<string, any>>) {
    const mo = manoObraDeTrabajo(ctx, { descripcion: j.descripcion, ingreso_total: Number(j.ingreso_total), mano_obra: Number(j.mano_obra) });
    const fecha = ctx.fechaTrabajo || j.fecha;
    const cambiaMo = Math.abs(mo - (Number(j.mano_obra) || 0)) > 0.009;
    const cambiaFecha = fecha !== j.fecha;
    if (!cambiaMo && !cambiaFecha) continue;
    if (!cambiaMo) {
      // Solo el día: basta moverlo, con sus comisiones en cascada.
      await db.from('job_assignments').update({ fecha, updated_at: new Date().toISOString() })
        .or(`id.eq.${j.id},override_de.eq.${j.id}`).eq('estado', 'pendiente');
      cambiados++;
      continue;
    }
    // Cambió la base: se vuelve a calcular la comisión con la regla vigente.
    await db.from('job_assignments').delete().eq('override_de', j.id).eq('estado', 'pendiente');
    await db.from('job_assignments').delete().eq('id', j.id);
    const manual = j.desglose?.manual ? Number(j.comision_usd) : null;
    await svc.createJobAssignment({
      empleado_id: j.empleado_id, es_taller: j.es_taller, zona: j.zona, tipo_trabajo: j.tipo_trabajo,
      descripcion: j.descripcion, servicio_key: j.servicio_key, cantidad: Number(j.cantidad) || 1,
      ingreso_total: Number(j.ingreso_total), mano_obra: mo, moneda: j.moneda,
      tasa_cambio: Number(j.tasa_cambio) || undefined, fecha,
      referencia_tabla: 'servicios', referencia_id: servicioId,
      cliente: j.desglose?.cliente ?? null, vehiculo: j.desglose?.vehiculo ?? null, placa: j.desglose?.placa ?? null,
      comision_manual: manual, sede_id: j.sede_id, created_by: usuario,
    });
    cambiados++;
  }
  return cambiados;
}
