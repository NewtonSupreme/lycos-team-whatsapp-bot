// ─────────────────────────────────────────────────────────────────────────────
// Lo que la conciliación escribe en el sistema, con su rastro.
//
//   · tasaDelDia: la tasa BCV de ESA fecha (no la de hoy). Un cobro del viernes
//     se convierte con la tasa del viernes aunque se registre el lunes.
//   · anotarAccion: cada decisión queda en conciliacion_acciones con el valor de
//     antes y de después y la tasa exacta usada (tasas_bcv se sobrescribe).
//   · corregirMonto / cambiarCuenta: tocan solo la cuenta indicada de una venta o
//     de un gasto, nunca el total en dólares ni la tasa guardada, y se niegan si
//     la venta ya tiene cobros posteriores.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x: unknown) => Number(x) || 0;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CUENTAS = new Set<string>(BANK_METHODS.map(m => m.id));

export interface TasaAplicada { tasa: number; fecha: string; fuente: string }

/** La tasa del día indicado: la de tasas_bcv de esa fecha o la más reciente anterior; si no hay, la del cierre de caja. */
export async function tasaDelDia(db: SupabaseClient, fecha: string): Promise<TasaAplicada | null> {
  if (!FECHA.test(fecha)) return null;
  const { data: t } = await db.from('tasas_bcv').select('fecha, bcv').lte('fecha', fecha).gt('bcv', 0)
    .order('fecha', { ascending: false }).limit(1).maybeSingle();
  if (t && n(t.bcv) > 0) {
    const f = String(t.fecha).slice(0, 10);
    return { tasa: n(t.bcv), fecha: f, fuente: f === fecha ? 'BCV del día' : `BCV del ${f} (último disponible)` };
  }
  const { data: c } = await db.from('cierres_caja').select('fecha, tasa_cambio').lte('fecha', fecha).gt('tasa_cambio', 0)
    .order('fecha', { ascending: false }).limit(1).maybeSingle();
  if (c && n(c.tasa_cambio) > 0) return { tasa: n(c.tasa_cambio), fecha: String(c.fecha).slice(0, 10), fuente: 'Cierre de caja' };
  return null;
}

export interface RegistroAccion {
  banco?: string | null;
  fecha?: string | null;
  referencia?: string | null;
  monto?: number | null;
  movimientoHash?: string | null;
  caso: string;
  accion: string;
  resuelto?: boolean;
  motivo?: string | null;
  usuario: string;
  sedeId?: string | null;
  antes?: unknown;
  despues?: unknown;
  tasa?: TasaAplicada | null;
  tabla?: string | null;
  registroId?: string | null;
  corridaId?: string | null;
}

/** Guarda el rastro de una acción. No lanza: la acción ya ocurrió y no debe fallar por su bitácora. */
export async function anotarAccion(db: SupabaseClient, a: RegistroAccion): Promise<void> {
  try {
    const { error } = await db.from('conciliacion_acciones').insert({
      corrida_id: a.corridaId && /^[0-9a-f-]{36}$/i.test(a.corridaId) ? a.corridaId : null,
      banco: a.banco || null,
      fecha: a.fecha && FECHA.test(a.fecha) ? a.fecha : null,
      referencia: a.referencia || null,
      monto: a.monto == null ? null : r2(a.monto),
      movimiento_hash: a.movimientoHash || null,
      caso: a.caso, accion: a.accion, resuelto: a.resuelto ?? true,
      motivo: a.motivo ? String(a.motivo).slice(0, 500) : null,
      usuario: a.usuario, sede_id: a.sedeId || null,
      antes: a.antes ?? null, despues: a.despues ?? null,
      tasa: a.tasa?.tasa ?? null, tasa_fecha: a.tasa?.fecha ?? null, tasa_fuente: a.tasa?.fuente ?? null,
      referencia_tabla: a.tabla || null, referencia_id: a.registroId || null,
    });
    if (error) console.error('anotarAccion:', error.message);
  } catch (e) {
    console.error('anotarAccion:', e);
  }
}

type Resultado<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; estado: number; error: string };

/** Cambia, dentro de metodos_pago, el valor que era `viejo` por `nuevo`, sin tocar las demás claves. */
function reemplazarEnMetodos(mp: unknown, cuenta: string, viejo: number, nuevo: number): Record<string, number> {
  const out: Record<string, number> = {};
  let hecho = false;
  if (mp && typeof mp === 'object') {
    for (const [k, v] of Object.entries(mp as Record<string, unknown>)) {
      if (!hecho && viejo > 0 && Math.abs(n(v) - viejo) <= 0.011 && (k === cuenta || !CUENTAS.has(k) || k === 'pago_movil' || k === 'transferencia')) {
        out[k] = nuevo; hecho = true;
      } else out[k] = n(v);
    }
  }
  if (!hecho) out[cuenta] = nuevo;
  return out;
}

async function tieneCobrosPosteriores(db: SupabaseClient, ventaId: string): Promise<boolean> {
  const { count } = await db.from('abonos').select('id', { count: 'exact', head: true }).eq('venta_id', ventaId).neq('metodo_pago', 'inicial');
  return (count || 0) > 0;
}

/**
 * Pone en el sistema el monto que el banco confirmó, para UNA cuenta de una venta
 * o de un gasto. El total en dólares y la tasa de la venta no se tocan.
 */
export async function corregirMonto(db: SupabaseClient, e: { tabla: string; registroId: string; cuenta: string; montoNuevo: number; referencia?: string | null }): Promise<Resultado<{ antes: number; despues: number; cliente: string }>> {
  const nuevo = r2(e.montoNuevo);
  if (!(nuevo > 0)) return { ok: false, estado: 400, error: 'El monto nuevo debe ser mayor a cero.' };
  if (!CUENTAS.has(e.cuenta)) return { ok: false, estado: 400, error: 'Cuenta desconocida.' };

  if (e.tabla === 'ventas_dia') {
    const { data: v } = await db.from('ventas_dia').select('*').eq('id', e.registroId).maybeSingle();
    if (!v) return { ok: false, estado: 404, error: 'Esa venta ya no existe.' };
    const viejo = r2(n(v[e.cuenta]));
    if (viejo <= 0) return { ok: false, estado: 409, error: 'Esa venta ya no tiene monto en esa cuenta: recarga la conciliación.' };
    if (await tieneCobrosPosteriores(db, e.registroId)) return { ok: false, estado: 409, error: 'La venta tiene cobros posteriores: corrígela desde «Por cobrar» para no descuadrar su saldo.' };
    const mp = reemplazarEnMetodos(v.metodos_pago, e.cuenta, viejo, nuevo);
    // La referencia del banco queda en la venta (si no tenía): así el próximo cruce las une por referencia, sin depender del monto ni de la fecha.
    const ref = String(e.referencia || '').trim();
    const cambios: Record<string, unknown> = { [e.cuenta]: nuevo, metodos_pago: mp };
    if (ref && !String(v.comprobante_referencia || '').trim()) cambios.comprobante_referencia = ref;
    const { error } = await db.from('ventas_dia').update(cambios).eq('id', e.registroId);
    if (error) return { ok: false, estado: 500, error: error.message };
    if (v.servicio_id) {
      const { data: sv } = await db.from('servicios').select('metodos_pago').eq('id', v.servicio_id).maybeSingle();
      if (sv?.metodos_pago) await db.from('servicios').update({ metodos_pago: reemplazarEnMetodos(sv.metodos_pago, e.cuenta, viejo, nuevo) }).eq('id', v.servicio_id);
    }
    return { ok: true, antes: viejo, despues: nuevo, cliente: String(v.cliente || '') };
  }

  if (e.tabla === 'egresos') {
    const { data: g } = await db.from('egresos').select('id, proveedor, metodos_pago, metodo_pago').eq('id', e.registroId).maybeSingle();
    if (!g) return { ok: false, estado: 404, error: 'Ese gasto ya no existe.' };
    const mp = g.metodos_pago && typeof g.metodos_pago === 'object' ? g.metodos_pago as Record<string, unknown> : null;
    const viejo = r2(n(mp?.[e.cuenta]));
    if (!mp || viejo <= 0) return { ok: false, estado: 409, error: 'Ese gasto no tiene el reparto por cuenta: corrígelo desde Egresos.' };
    const { error } = await db.from('egresos').update({ metodos_pago: { ...mp, [e.cuenta]: nuevo } }).eq('id', e.registroId);
    if (error) return { ok: false, estado: 500, error: error.message };
    return { ok: true, antes: viejo, despues: nuevo, cliente: String(g.proveedor || '') };
  }

  return { ok: false, estado: 400, error: 'Ese tipo de registro se corrige desde su propio módulo; aquí puedes justificarlo.' };
}

/** Mueve lo cobrado en una venta de una cuenta a otra (el cliente pagó a otro banco). Mismo monto, misma moneda. */
export async function cambiarCuenta(db: SupabaseClient, e: { registroId: string; desde: string; hacia: string }): Promise<Resultado<{ monto: number; cliente: string }>> {
  if (!CUENTAS.has(e.desde) || !CUENTAS.has(e.hacia) || e.desde === e.hacia) return { ok: false, estado: 400, error: 'Elige una cuenta distinta.' };
  const moneda = (id: string) => BANK_METHODS.find(m => m.id === id)?.moneda;
  if (moneda(e.desde) !== moneda(e.hacia)) return { ok: false, estado: 400, error: 'Las dos cuentas deben ser de la misma moneda; si cambió la moneda, regístralo como corrección de la venta.' };
  const { data: v } = await db.from('ventas_dia').select('*').eq('id', e.registroId).maybeSingle();
  if (!v) return { ok: false, estado: 404, error: 'Esa venta ya no existe.' };
  const monto = r2(n(v[e.desde]));
  if (monto <= 0) return { ok: false, estado: 409, error: 'Esa venta ya no tiene monto en esa cuenta: recarga la conciliación.' };
  if (await tieneCobrosPosteriores(db, e.registroId)) return { ok: false, estado: 409, error: 'La venta tiene cobros posteriores: corrígela desde «Por cobrar».' };
  const mp: Record<string, number> = {};
  let hecho = false;
  for (const [k, val] of Object.entries((v.metodos_pago && typeof v.metodos_pago === 'object' ? v.metodos_pago : {}) as Record<string, unknown>)) {
    if (!hecho && Math.abs(n(val) - monto) <= 0.011 && (k === e.desde || !CUENTAS.has(k) || k === 'pago_movil' || k === 'transferencia')) { mp[e.hacia] = n(val); hecho = true; } else mp[k] = n(val);
  }
  if (!hecho) { delete mp[e.desde]; mp[e.hacia] = monto; }
  const { error } = await db.from('ventas_dia').update({ [e.desde]: 0, [e.hacia]: r2(n(v[e.hacia]) + monto), metodos_pago: mp }).eq('id', e.registroId);
  if (error) return { ok: false, estado: 500, error: error.message };
  return { ok: true, monto, cliente: String(v.cliente || '') };
}
