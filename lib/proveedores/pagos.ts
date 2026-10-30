// ─────────────────────────────────────────────────────────────────────────────
// Pagos y abonos a proveedores.
//
// Lo que se le debe a un proveedor vive en dos sitios: los renglones de la ficha de
// un vehículo (`vehiculo_partidas`, con su gasto espejo en `egresos`) y los gastos
// sueltos (`egresos` sin partida). Un pago puede:
//   · ir GENERAL: se reparte a las deudas del proveedor, la que vence antes primero;
//   · ir DIRIGIDO: a las deudas de un carro, un cliente, una orden, o a las que se elijan;
//   · sobrar: lo que excede la deuda queda como SALDO A FAVOR, que luego se aplica.
//
// Cada pedazo aplicado actualiza su deuda por el mismo camino de siempre (el renglón
// se sincroniza con su gasto), suma a la deuda las cuentas de las que salió ese pedazo
// y queda anotado con el saldo antes y después. Anular un pago revierte cada pedazo.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';
import { binsDeFuente, cuentaPrincipal } from '@/lib/pagos/desglose';
import { esGastoDelTaller, sincronizarDesdePartida, type Partida } from '@/lib/ficha/sincronizar';

const r2 = (x: unknown) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x: unknown) => Number(x) || 0;
const s = (x: unknown) => String(x ?? '');
const norm = (t: unknown) => s(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const hoyCaracas = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

export interface Deuda {
  origen: 'partida' | 'egreso'; id: string; fecha: string; vence: string | null; vencida: boolean;
  proveedor: string; proveedor_id: string | null; concepto: string; categoria: string | null;
  placa: string | null; vehiculo: string | null; cliente: string | null; servicio_id: string | null;
  total: number; pagado: number; saldo: number; estado_pago: string;
}

/** La clave de un proveedor: su id del catálogo o su nombre escrito. */
export const claveProveedor = (id: string | null | undefined, nombre: string | null | undefined) => (id ? `id:${id}` : `n:${norm(nombre)}`);

/** Todas las deudas abiertas (o las de un proveedor), con lo pagado y lo que falta. */
export async function deudasAbiertas(db: SupabaseClient, o: { sede: string | null; proveedorId?: string | null; proveedorNombre?: string | null }): Promise<Deuda[]> {
  const hoy = hoyCaracas();
  let pq = db.from('vehiculo_partidas').select('id, fecha, descripcion, tipo, origen, placa, vehiculo_info, cliente_nombre, servicio_id, cantidad, costo, monto_pagado, estado_pago, proveedor, proveedor_id, fecha_vencimiento').in('estado_pago', ['por_pagar', 'parcial']).limit(5000);
  let eq = db.from('egresos').select('id, fecha, categoria, notas, desglose, placa, vehiculo_info, cliente_nombre, servicio_id, total_egresos, monto_pagado, estado_pago, proveedor, proveedor_id, fecha_vencimiento').in('estado_pago', ['por_pagar', 'parcial']).is('partida_id', null).limit(5000);
  if (o.sede) { pq = pq.eq('sede_id', o.sede); eq = eq.eq('sede_id', o.sede); }
  const [{ data: ps, error: e1 }, { data: es, error: e2 }] = await Promise.all([pq, eq]);
  if (e1 || e2) throw new Error((e1 || e2)!.message);
  const out: Deuda[] = [];
  for (const p of ps || []) {
    // Solo es deuda con un proveedor lo que el taller compró: no lo que trajo el cliente ni la mano
    // de obra propia (esa se paga por nómina; contarla aquí la pagaría dos veces).
    if (!esGastoDelTaller(p)) continue;
    const total = r2(n(p.cantidad || 1) * n(p.costo)); const pagado = p.estado_pago === 'parcial' ? r2(p.monto_pagado) : 0;
    const saldo = r2(total - pagado); if (saldo <= 0.009) continue;
    out.push({ origen: 'partida', id: p.id, fecha: s(p.fecha).slice(0, 10), vence: p.fecha_vencimiento, vencida: !!p.fecha_vencimiento && p.fecha_vencimiento < hoy,
      proveedor: s(p.proveedor).trim() || 'Sin proveedor', proveedor_id: p.proveedor_id, concepto: s(p.descripcion), categoria: s(p.tipo) || 'repuestos',
      placa: p.placa, vehiculo: p.vehiculo_info, cliente: p.cliente_nombre, servicio_id: p.servicio_id, total, pagado, saldo, estado_pago: p.estado_pago });
  }
  for (const e of es || []) {
    const total = r2(e.total_egresos); const pagado = e.estado_pago === 'parcial' ? r2(e.monto_pagado) : 0;
    const saldo = r2(total - pagado); if (saldo <= 0.009) continue;
    const desc = Array.isArray(e.desglose) && e.desglose.length ? e.desglose.map((d: { descripcion?: string }) => d?.descripcion).filter(Boolean).join(', ') : '';
    out.push({ origen: 'egreso', id: e.id, fecha: s(e.fecha).slice(0, 10), vence: e.fecha_vencimiento, vencida: !!e.fecha_vencimiento && e.fecha_vencimiento < hoy,
      proveedor: s(e.proveedor).trim() || 'Sin proveedor', proveedor_id: e.proveedor_id, concepto: desc || s(e.notas) || s(e.categoria) || 'Gasto', categoria: e.categoria,
      placa: e.placa, vehiculo: e.vehiculo_info, cliente: e.cliente_nombre, servicio_id: e.servicio_id, total, pagado, saldo, estado_pago: e.estado_pago });
  }
  // Del proveedor: por su id del catálogo o por su nombre (hay compras con el nombre escrito a mano y sin id).
  const filtradas = (o.proveedorId || o.proveedorNombre)
    ? out.filter(d => (o.proveedorId && d.proveedor_id === o.proveedorId) || (o.proveedorNombre && norm(d.proveedor) === norm(o.proveedorNombre)))
    : out;
  // La que vence (o se compró) antes, primero: así se paga un abono general.
  return filtradas.sort((a, b) => (a.vence || a.fecha).localeCompare(b.vence || b.fecha) || a.fecha.localeCompare(b.fecha));
}

/** Cuánto vale en dólares un pago repartido en cuentas (Bs a la tasa del pago). */
export function usdDelPago(metodos: Record<string, number>, tasa: number): number {
  let t = 0;
  for (const [k, v] of Object.entries(metodos)) {
    const m = BANK_METHODS.find(x => x.id === k); if (!m || n(v) <= 0) continue;
    t += m.moneda === 'Bs' ? (tasa > 0 ? n(v) / tasa : 0) : n(v);
  }
  return r2(t);
}

export interface Aplicacion { origen: 'partida' | 'egreso'; id: string; monto: number; saldoAntes: number; saldoDespues: number; concepto: string; placa: string | null }

/** El reparto, sin tocar nada: la vista previa y el pago usan exactamente esto. */
export function repartir(deudas: Deuda[], montoUsd: number, montos?: Record<string, number>): { aplicaciones: Aplicacion[]; sobrante: number } {
  let resto = r2(montoUsd); const aplicaciones: Aplicacion[] = [];
  for (const d of deudas) {
    if (resto <= 0.009) break;
    const pedido = montos?.[`${d.origen}:${d.id}`];
    const tope = pedido != null ? Math.min(r2(pedido), d.saldo) : d.saldo;
    const x = r2(Math.min(tope, resto)); if (x <= 0.009) continue;
    aplicaciones.push({ origen: d.origen, id: d.id, monto: x, saldoAntes: d.saldo, saldoDespues: r2(d.saldo - x), concepto: d.concepto, placa: d.placa });
    resto = r2(resto - x);
  }
  return { aplicaciones, sobrante: r2(resto) };
}

const prorratear = (metodos: Record<string, number>, parte: number, total: number): Record<string, number> => {
  const f = total > 0 ? parte / total : 0; const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(metodos)) if (n(v) > 0) out[k] = r2(n(v) * f);
  return out;
};
const sumar = (a: Record<string, unknown> | null | undefined, b: Record<string, number>, signo = 1): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(a || {})) out[k] = r2(v);
  for (const [k, v] of Object.entries(b)) out[k] = r2((out[k] || 0) + signo * v);
  for (const k of Object.keys(out)) if (out[k] <= 0.009) delete out[k];
  return out;
};

/** Suma (o resta, al anular) `x` dólares pagados a una deuda, por el camino de siempre. */
async function moverDeuda(db: SupabaseClient, origen: 'partida' | 'egreso', id: string, x: number, metodos: Record<string, number>, tasa: number, fecha: string, usuario: string, signo: 1 | -1): Promise<string | null> {
  if (origen === 'partida') {
    const { data: p } = await db.from('vehiculo_partidas').select('*').eq('id', id).maybeSingle();
    if (!p) return 'El renglón ya no existe.';
    const total = r2(n(p.cantidad || 1) * n(p.costo));
    const antes = p.estado_pago === 'pagado' ? total : p.estado_pago === 'parcial' ? r2(p.monto_pagado) : 0;
    const ahora = r2(Math.max(0, Math.min(total, antes + signo * x)));
    const estado = ahora >= total - 0.009 ? 'pagado' : ahora > 0.009 ? 'parcial' : 'por_pagar';
    const mp = sumar(p.metodos_pago as Record<string, unknown>, metodos, signo);
    const { data: nueva, error } = await db.from('vehiculo_partidas').update({
      estado_pago: estado, monto_pagado: estado === 'parcial' ? ahora : 0, fecha_pago: estado === 'pagado' ? fecha : (estado === 'parcial' ? fecha : null),
      metodos_pago: Object.keys(mp).length ? mp : null, tasa_pago: tasa || p.tasa_pago || null, updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) return error.message;
    await sincronizarDesdePartida(db as never, nueva as Partida, usuario, { actualizarOrden: false });
    return null;
  }
  const { data: e } = await db.from('egresos').select('id, total_egresos, monto_pagado, estado_pago, metodos_pago, tasa_cambio').eq('id', id).maybeSingle();
  if (!e) return 'El gasto ya no existe.';
  const total = r2(e.total_egresos);
  const antes = e.estado_pago === 'pagado' || !e.estado_pago ? total : e.estado_pago === 'parcial' ? r2(e.monto_pagado) : 0;
  const ahora = r2(Math.max(0, Math.min(total, antes + signo * x)));
  const estado = ahora >= total - 0.009 ? 'pagado' : ahora > 0.009 ? 'parcial' : 'por_pagar';
  const mp = sumar(e.metodos_pago as Record<string, unknown>, metodos, signo);
  const { error } = await db.from('egresos').update({
    estado_pago: estado, monto_pagado: ahora, fecha_pago: estado === 'por_pagar' ? null : fecha,
    metodos_pago: Object.keys(mp).length ? mp : null,
    metodo_pago: Object.keys(mp).length ? cuentaPrincipal(binsDeFuente({ metodos_pago: mp }), tasa || n(e.tasa_cambio)) : null,
    tasa_cambio: tasa || e.tasa_cambio || null, updated_at: new Date().toISOString(),
  }).eq('id', id);
  return error ? error.message : null;
}

export interface EntradaPago {
  fecha: string; proveedor: string; proveedor_id: string | null; metodos_pago: Record<string, number>; tasa: number;
  modo: 'general' | 'dirigido' | 'saldo_favor'; criterio?: Record<string, unknown> | null;
  /** Para un dirigido: qué deudas («partida:id» / «egreso:id») y cuánto a cada una (vacío = el saldo entero). */
  objetivos?: Record<string, number | null>;
  referencia?: string | null; comprobante_url?: string | null; nota?: string | null;
  usuario: string; sede: string | null;
  /** Pago anterior cuyo saldo a favor se está usando (no sale dinero nuevo). */
  origen_pago_id?: string | null; monto_usd?: number;
}

export async function registrarPago(db: SupabaseClient, e: EntradaPago): Promise<{ ok: true; pago: Record<string, unknown>; aplicaciones: Aplicacion[]; sobrante: number; errores: string[] } | { ok: false; error: string }> {
  const conBs = Object.entries(e.metodos_pago).some(([k, v]) => n(v) > 0 && BANK_METHODS.find(m => m.id === k)?.moneda === 'Bs');
  if (conBs && !(e.tasa > 0)) return { ok: false, error: 'Falta la tasa del día para la parte en bolívares.' };
  const montoUsd = e.modo === 'saldo_favor' ? r2(e.monto_usd) : usdDelPago(e.metodos_pago, e.tasa);
  if (!(montoUsd > 0)) return { ok: false, error: 'El pago tiene que tener un monto.' };
  if (Object.keys(e.metodos_pago).some(k => k === 'cashea' || !BANK_METHODS.some(m => m.id === k))) return { ok: false, error: 'A un proveedor se le paga desde una cuenta del taller (no con Cashea).' };

  let deudas = await deudasAbiertas(db, { sede: e.sede, proveedorId: e.proveedor_id, proveedorNombre: e.proveedor });
  if (e.modo !== 'general' && e.objetivos) {
    const elegidas = new Set(Object.keys(e.objetivos));
    deudas = deudas.filter(d => elegidas.has(`${d.origen}:${d.id}`));
    if (!deudas.length) return { ok: false, error: 'Las deudas elegidas ya no están abiertas: recarga la pantalla.' };
  }
  const montos: Record<string, number> = {};
  for (const [k, v] of Object.entries(e.objetivos || {})) if (v != null && n(v) > 0) montos[k] = n(v);
  const { aplicaciones, sobrante } = repartir(deudas, montoUsd, montos);

  const { data: pago, error } = await db.from('pagos_proveedor').insert({
    fecha: e.fecha, proveedor: e.proveedor, proveedor_id: e.proveedor_id, metodos_pago: e.metodos_pago, tasa: e.tasa || null,
    monto_usd: montoUsd, aplicado_usd: r2(montoUsd - sobrante), saldo_favor_usd: sobrante, modo: e.modo, criterio: e.criterio || null,
    referencia: e.referencia || null, comprobante_url: e.comprobante_url || null, nota: e.nota || null, usuario: e.usuario, sede_id: e.sede,
    origen_pago_id: e.origen_pago_id || null,
  }).select().single();
  if (error) return { ok: false, error: error.message };

  const errores: string[] = [];
  for (const a of aplicaciones) {
    // Con saldo a favor no sale dinero hoy: las cuentas ya se movieron en el pago original.
    const mp = e.modo === 'saldo_favor' ? {} : prorratear(e.metodos_pago, a.monto, montoUsd);
    const err = await moverDeuda(db, a.origen, a.id, a.monto, mp, e.tasa, e.fecha, e.usuario, 1);
    if (err) { errores.push(`${a.concepto}: ${err}`); continue; }
    await db.from('pagos_proveedor_aplicaciones').insert({ pago_id: pago.id, origen: a.origen, registro_id: a.id, monto_usd: a.monto, metodos_pago: mp, saldo_antes: a.saldoAntes, saldo_despues: a.saldoDespues, descripcion: a.concepto, placa: a.placa });
  }
  if (e.origen_pago_id) {
    const { data: o } = await db.from('pagos_proveedor').select('saldo_favor_usd').eq('id', e.origen_pago_id).maybeSingle();
    if (o) await db.from('pagos_proveedor').update({ saldo_favor_usd: r2(Math.max(0, n(o.saldo_favor_usd) - (montoUsd - sobrante))) }).eq('id', e.origen_pago_id);
  }
  return { ok: true, pago, aplicaciones, sobrante, errores };
}

export async function anularPago(db: SupabaseClient, id: string, motivo: string, usuario: string): Promise<{ ok: true; revertidas: number; errores: string[] } | { ok: false; error: string }> {
  const { data: p } = await db.from('pagos_proveedor').select('*').eq('id', id).maybeSingle();
  if (!p) return { ok: false, error: 'Ese pago no existe.' };
  if (p.anulado) return { ok: false, error: 'Ese pago ya estaba anulado.' };
  const { data: usos } = await db.from('pagos_proveedor').select('id').eq('origen_pago_id', id).eq('anulado', false).limit(1);
  if (usos?.length) return { ok: false, error: 'Su saldo a favor ya se usó en otro pago: anula primero ese.' };
  const { data: apl } = await db.from('pagos_proveedor_aplicaciones').select('*').eq('pago_id', id).eq('revertido', false);
  const errores: string[] = []; let revertidas = 0;
  for (const a of apl || []) {
    const err = await moverDeuda(db, a.origen, a.registro_id, r2(a.monto_usd), (a.metodos_pago || {}) as Record<string, number>, n(p.tasa), s(p.fecha), usuario, -1);
    if (err) { errores.push(`${a.descripcion}: ${err}`); continue; }
    await db.from('pagos_proveedor_aplicaciones').update({ revertido: true }).eq('id', a.id);
    revertidas++;
  }
  if (p.origen_pago_id) {
    const { data: o } = await db.from('pagos_proveedor').select('saldo_favor_usd').eq('id', p.origen_pago_id).maybeSingle();
    if (o) await db.from('pagos_proveedor').update({ saldo_favor_usd: r2(n(o.saldo_favor_usd) + n(p.aplicado_usd)) }).eq('id', p.origen_pago_id);
  }
  await db.from('pagos_proveedor').update({ anulado: true, anulado_por: usuario, anulado_motivo: motivo, anulado_en: new Date().toISOString(), saldo_favor_usd: 0 }).eq('id', id);
  return { ok: true, revertidas, errores };
}
