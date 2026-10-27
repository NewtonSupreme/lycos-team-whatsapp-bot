import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * La factura de una venta, escrita desde el servidor.
 *
 * Es lo mismo que hace `registrarFactura` (lib/supabase.ts) cuando una orden se cobra a mano desde
 * Servicios o el punto de venta; esa corre en el navegador y no sirve para una acción del servidor
 * como registrar una venta desde la conciliación bancaria. Sin factura, la venta quedaba fuera de
 * Facturas y de los reportes que cuentan por factura: «registrada» pero a medias.
 *
 * Una referencia no recibe dos facturas: si ya existe, se devuelve esa.
 */
export async function crearFacturaServidor(db: SupabaseClient, f: {
  referenciaId: string; referenciaTabla: string; moduloOrigen: 'servicios' | 'ventas_pos' | 'reportes';
  cliente: string; vehiculo?: string | null; totalBase: number; tasa?: number | null; totalBs?: number | null;
  items: unknown[]; metodosPago: Record<string, number>; conIva: boolean; notas?: string | null;
  emitidoPor: string; fecha: string; sedeId?: string | null; comprobanteReferencia?: string | null;
}): Promise<{ id: string; correlativo: string; nueva: boolean } | null> {
  const { data: previa } = await db.from('facturas').select('id, correlativo').eq('referencia_id', f.referenciaId).limit(1).maybeSingle();
  if (previa) return { id: previa.id, correlativo: previa.correlativo, nueva: false };

  const anio = new Date().getFullYear();
  let correlativo: string | null = null;
  try {
    const { data } = await db.rpc('generar_correlativo_factura');
    if (typeof data === 'string' && data) correlativo = data;
  } catch { /* el respaldo de abajo */ }
  if (!correlativo) {
    const { count } = await db.from('facturas').select('*', { count: 'exact', head: true }).like('correlativo', `FAC-${anio}-%`);
    correlativo = `FAC-${anio}-${String((count || 0) + 1).padStart(4, '0')}`;
  }

  const { data, error } = await db.from('facturas').insert({
    correlativo, tipo: 'servicio', modulo_origen: f.moduloOrigen, referencia_id: f.referenciaId, referencia_tabla: f.referenciaTabla,
    cliente: f.cliente || 'Consumidor Final', vehiculo: f.vehiculo || null, total: f.totalBase, moneda: 'USD',
    tasa_cambio: f.tasa || null, total_bs: f.totalBs || null, items: f.items, metodos_pago: f.metodosPago, con_iva: f.conIva,
    estado: 'pagado', notas: f.notas || null, emitido_por: f.emitidoPor, fecha_emision: f.fecha, sede_id: f.sedeId || null,
    comprobante_referencia: f.comprobanteReferencia || null,
  }).select('id, correlativo').single();
  if (error) { console.error('crearFacturaServidor:', error.message); return null; }
  return { id: data.id, correlativo: data.correlativo, nueva: true };
}
