// ─────────────────────────────────────────────────────────────────────────────
// Conciliar un cobro del banco con la orden/venta QUE YA EXISTE, en vez de crear una nueva.
//
// El problema que resuelve: desde la conciliación, al ver un pago «sin registrar», lo único
// cómodo era «Registrar Servicio», que CREABA una orden de servicio y una venta nuevas. Pero
// muchas veces esa venta/orden YA está en el sistema (se registró en el POS o en Servicios); solo
// que el motor no la emparejó porque le falta la referencia del banco, o porque la orden está
// completada pero su cobro nunca se volcó a `ventas_dia`. Resultado: órdenes duplicadas y dinero
// contado dos veces.
//
// Aquí se buscan esas coincidencias y se concilian SIN duplicar:
//   · VENTA existente  → se le pega la referencia del banco (y la cuenta si le faltaba) y se marca
//                        conciliada. No se crea nada.
//   · ORDEN existente sin venta → se completa esa MISMA orden y se crea su `ventas_dia` enlazada a
//                        su `servicio_id` (la orden real), con la cuenta y la referencia del banco.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildCategoriaColumns, buildPagoColumnsCompletas, inferirCategoria } from '@/lib/categorias';
import { BANK_METHODS, type BankBin } from '@/lib/reporte/ventas-mapping';

const r2 = (x: unknown) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x: unknown) => Number(x) || 0;
const sinTildes = (t: unknown) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const soloDig = (t: unknown) => String(t || '').replace(/\D/g, '');
const sumarDias = (f: string, k: number) => new Date(Date.parse(`${f}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const MONEDA_BIN = new Map(BANK_METHODS.map(m => [m.id, m.moneda]));

export interface MovParaConciliar {
  fecha: string;            // AAAA-MM-DD del banco
  montoBanco: number;       // en la moneda de la cuenta (Bs, o USD para Cashea)
  cuenta: string;           // bin: bnc, pago_movil_banesco, …
  referencia?: string | null;
  cliente?: string | null;
  placa?: string | null;
  /** El movimiento es en dólares (Cashea). */
  enDolares?: boolean;
  /** USD del movimiento a la tasa del día (lo calcula la ruta). */
  usd?: number;
}

export interface CandidatoConciliacion {
  tipo: 'venta' | 'orden';
  id: string;
  fecha: string;
  cliente: string;
  placa: string | null;
  vehiculo: string | null;
  /** Lo que vale en dólares (base registrada). */
  usd: number;
  /** Lo que ya recibió por esa cuenta (ventas). */
  enCuenta: number;
  referencia: string | null;
  estado: string;
  /** 0–100: qué tan seguro es que este cobro es de aquí. */
  puntaje: number;
  razones: string[];
  /** Qué pasará al conciliar (texto corto para el botón). */
  efecto: string;
  /** Avisos (p. ej. ya tiene otra referencia). */
  aviso: string | null;
}

/**
 * Busca órdenes de servicio y ventas que probablemente correspondan a este cobro del banco.
 * Devuelve las mejores primero; vacío si no hay nada parecido (ahí sí toca registrar nueva).
 */
export async function buscarCandidatosConciliacion(
  db: SupabaseClient, sede: string | null, mov: MovParaConciliar,
): Promise<CandidatoConciliacion[]> {
  const usdMov = r2(mov.enDolares ? mov.montoBanco : (mov.usd || 0));
  const refDig = soloDig(mov.referencia);
  const cliNorm = sinTildes(mov.cliente);
  const placaNorm = String(mov.placa || '').trim().toUpperCase();
  const desde = sumarDias(mov.fecha, -45); // el cobro puede entrar días después del trabajo
  const hasta = sumarDias(mov.fecha, 10);
  const monedaCta = MONEDA_BIN.get(mov.cuenta as BankBin) === 'Bs' ? 'Bs' : 'USD';

  // ── Ventas del período ────────────────────────────────────────────────────
  const cols = `id, fecha, cliente, placa, vehiculo_info, total_ingresos, con_iva, comprobante_referencia, saldo_pendiente, estado, servicio_id, ${[...new Set(BANK_METHODS.map(m => m.id))].join(', ')}`;
  let vq = db.from('ventas_dia').select(cols).gte('fecha', desde).lte('fecha', hasta).limit(1500);
  if (sede) vq = vq.eq('sede_id', sede);
  const { data: ventas } = await vq as { data: Array<Record<string, unknown>> | null };

  const out: CandidatoConciliacion[] = [];
  const cercaMonto = (a: number, b: number, tol = 0.02) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(0.5, b * tol);

  for (const v of (ventas || []) as Array<Record<string, unknown>>) {
    const base = n(v.total_ingresos);
    const pagadoUsd = v.con_iva ? r2(base * 1.16) : base;
    const enCuenta = n(v[mov.cuenta]);
    const refV = soloDig(v.comprobante_referencia);
    const razones: string[] = []; let p = 0; let aviso: string | null = null;

    // Referencia: la prueba más fuerte.
    const mismaRef = refDig.length >= 6 && refV.length >= 6 && (refV.endsWith(refDig.slice(-8)) || refDig.endsWith(refV.slice(-8)));
    if (mismaRef) { p += 70; razones.push('misma referencia del banco'); }

    // Monto: en la cuenta exacta (Bs) o por el total en dólares.
    if (monedaCta === 'Bs' && cercaMonto(enCuenta, mov.montoBanco, 0.005)) { p += 45; razones.push(`entró ${r2(enCuenta).toLocaleString('es-VE')} Bs por ${mov.cuenta.replace(/_/g, ' ')}`); }
    else if (usdMov > 0 && (cercaMonto(pagadoUsd, usdMov) || cercaMonto(base, usdMov))) { p += 35; razones.push(`el total ($${pagadoUsd.toFixed(2)}) cuadra con lo que entró`); }
    else if (monedaCta === 'USD' && cercaMonto(n(v[mov.cuenta]), mov.montoBanco)) { p += 40; razones.push('monto en divisas igual'); }

    // Mismo cliente / placa.
    if (placaNorm && String(v.placa || '').trim().toUpperCase() === placaNorm) { p += 25; razones.push('misma placa'); }
    if (cliNorm && cliNorm.length > 3 && sinTildes(v.cliente).includes(cliNorm.split(' ')[0])) { p += 12; razones.push('mismo cliente'); }

    // Misma fecha ayuda; muy lejos resta.
    const dd = Math.abs(Math.round((Date.parse(mov.fecha) - Date.parse(String(v.fecha))) / 86_400_000));
    if (dd === 0) p += 8; else if (dd <= 3) p += 4; else if (dd > 20) p -= 6;

    if (p < 30) continue; // nada convincente
    if (refV && !mismaRef && refDig.length >= 6) aviso = `Ya tiene otra referencia (${v.comprobante_referencia}); confirma que es el mismo pago.`;
    const faltaCuenta = monedaCta === 'Bs' && enCuenta <= 0.009;
    out.push({
      tipo: 'venta', id: String(v.id), fecha: String(v.fecha), cliente: String(v.cliente || 'Cliente'), placa: (v.placa as string) || null,
      vehiculo: (v.vehiculo_info as string) || null, usd: base, enCuenta, referencia: (v.comprobante_referencia as string) || null,
      estado: String(v.estado || ''), puntaje: Math.min(100, p), razones, aviso,
      efecto: refV && mismaRef ? 'Confirmar esta venta (ya cuadra)' : faltaCuenta ? 'Enlazar la referencia y marcar que entró por esta cuenta' : 'Enlazar la referencia del banco a esta venta',
    });
  }

  // ── Órdenes completadas/entregadas SIN su venta (su cobro no se volcó) ──────
  let sq = db.from('servicios')
    .select('id, fecha, estado, nombre_cliente, placa, vehiculo_info, costo_final, costo_estimado, total_pagado, items, categoria, tipo, con_iva, comprobante_referencia')
    .gte('fecha', desde).lte('fecha', hasta)
    .in('estado', ['completada', 'completado', 'finalizado', 'entregada', 'entregado']).limit(800);
  if (sede) sq = sq.eq('sede_id', sede);
  const { data: ords } = await sq;
  const ordIds = (ords || []).map(o => o.id);
  const conVenta = new Set<string>();
  for (let i = 0; i < ordIds.length; i += 200) {
    const { data } = await db.from('ventas_dia').select('servicio_id').in('servicio_id', ordIds.slice(i, i + 200));
    for (const v of data || []) if (v.servicio_id) conVenta.add(String(v.servicio_id));
  }
  for (const o of (ords || []) as Array<Record<string, unknown>>) {
    if (conVenta.has(String(o.id))) continue; // ya tiene venta: no es candidata a crear
    const itemsTotal = Array.isArray(o.items) ? r2((o.items as Array<Record<string, unknown>>).reduce((s, it) => s + (n(it.total) || n(it.cantidad) * n(it.precio_unitario)), 0)) : 0;
    const base = n(o.costo_final) || n(o.total_pagado) || n(o.costo_estimado) || itemsTotal;
    if (base <= 0) continue;
    const pagadoUsd = o.con_iva ? r2(base * 1.16) : base;
    const razones: string[] = []; let p = 0;
    if (usdMov > 0 && (cercaMonto(pagadoUsd, usdMov) || cercaMonto(base, usdMov))) { p += 45; razones.push(`la orden vale $${pagadoUsd.toFixed(2)}, cuadra con el pago`); }
    if (placaNorm && String(o.placa || '').trim().toUpperCase() === placaNorm) { p += 28; razones.push('misma placa'); }
    if (cliNorm && cliNorm.length > 3 && sinTildes(o.nombre_cliente).includes(cliNorm.split(' ')[0])) { p += 14; razones.push('mismo cliente'); }
    const dd = Math.abs(Math.round((Date.parse(mov.fecha) - Date.parse(String(o.fecha))) / 86_400_000));
    if (dd <= 3) p += 6; else if (dd > 25) p -= 6;
    if (p < 35) continue;
    out.push({
      tipo: 'orden', id: String(o.id), fecha: String(o.fecha), cliente: String(o.nombre_cliente || 'Cliente'), placa: (o.placa as string) || null,
      vehiculo: (o.vehiculo_info as string) || null, usd: base, enCuenta: 0, referencia: (o.comprobante_referencia as string) || null,
      estado: String(o.estado || ''), puntaje: Math.min(100, p), razones,
      aviso: 'Esta orden está completada pero su cobro no se registró; conciliar = registrar el cobro en ELLA (no se crea una orden nueva).',
      efecto: 'Registrar este cobro en la orden existente',
    });
  }

  return out.sort((a, b) => b.puntaje - a.puntaje).slice(0, 8);
}

/**
 * Conciliar una VENTA que ya existe: le pega la referencia del banco (si le falta) y, si la cuenta
 * en bolívares estaba vacía, registra que entró por ahí. No crea filas nuevas.
 */
export async function conciliarVentaExistente(
  db: SupabaseClient, mov: MovParaConciliar, ventaId: string,
): Promise<{ ok: true; cliente: string; usd: number } | { ok: false; error: string }> {
  const { data: v } = await db.from('ventas_dia').select('*').eq('id', ventaId).maybeSingle();
  if (!v) return { ok: false, error: 'Esa venta ya no existe.' };
  const cambios: Record<string, unknown> = {};
  if (mov.referencia && !String(v.comprobante_referencia || '').trim()) cambios.comprobante_referencia = String(mov.referencia);
  // Si la cuenta del banco no tiene importe en la venta y el resto cuadra, se asienta en ella.
  const monedaCta = MONEDA_BIN.get(mov.cuenta as BankBin) === 'Bs' ? 'Bs' : 'USD';
  if (monedaCta === 'Bs' && n(v[mov.cuenta]) <= 0.009) {
    const mp = (v.metodos_pago && typeof v.metodos_pago === 'object') ? { ...v.metodos_pago as Record<string, number> } : {};
    // Solo se completa la cuenta si la venta aún no tiene ninguna cuenta con dinero (no pisamos un cobro real).
    const yaCobrada = BANK_METHODS.some(m => n(v[m.id]) > 0);
    if (!yaCobrada) { cambios[mov.cuenta] = r2(mov.montoBanco); mp[mov.cuenta] = r2(mov.enDolares ? mov.montoBanco : (mov.usd || 0)); cambios.metodos_pago = mp; }
  }
  if (Object.keys(cambios).length) {
    cambios.updated_at = new Date().toISOString();
    const { error } = await db.from('ventas_dia').update(cambios).eq('id', ventaId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, cliente: String(v.cliente || 'Cliente'), usd: n(v.total_ingresos) };
}

/**
 * Conciliar una ORDEN existente sin venta: la completa y crea SU venta (enlazada a su servicio_id),
 * con la cuenta y la referencia del banco. No crea una orden nueva.
 */
export async function conciliarOrdenExistente(
  db: SupabaseClient, mov: MovParaConciliar, servicioId: string,
  opts: { usuario: string; sede: string | null; conIva: boolean; tasa: number },
): Promise<{ ok: true; ventaId: string; cliente: string; baseUsd: number; servicioId: string } | { ok: false; error: string }> {
  const { data: o } = await db.from('servicios').select('*').eq('id', servicioId).maybeSingle();
  if (!o) return { ok: false, error: 'Esa orden ya no existe.' };
  const { data: yaV } = await db.from('ventas_dia').select('id').eq('servicio_id', servicioId).limit(1);
  if (yaV?.length) return { ok: false, error: 'Esa orden ya tiene su venta registrada; concíliala como venta, no como orden.' };

  const itemsTotal = Array.isArray(o.items) ? r2((o.items as Array<Record<string, unknown>>).reduce((s, it) => s + (n(it.total) || n(it.cantidad) * n(it.precio_unitario)), 0)) : 0;
  // El pago del banco manda para el monto; la orden da cliente, vehículo e ítems.
  const pagadoUsd = r2(mov.enDolares ? mov.montoBanco : (mov.usd || 0));
  const baseUsd = opts.conIva ? r2(pagadoUsd / 1.16) : pagadoUsd;
  const categoria = String(o.categoria || o.tipo || inferirCategoria(String(o.descripcion || o.tipo_personalizado || '')));
  const metodos = { [mov.cuenta as BankBin]: r2(mov.montoBanco) } as Record<BankBin, number>;
  const fecha = String(o.fecha || mov.fecha).slice(0, 10);
  const items = Array.isArray(o.items) && o.items.length
    ? (o.items as Array<Record<string, unknown>>)
    : [{ descripcion: String(o.descripcion || o.tipo_personalizado || 'Servicio'), cantidad: 1, precio_unitario: baseUsd, total: baseUsd }];

  const vd: Record<string, unknown> = {
    fecha, cliente: String(o.nombre_cliente || 'Cliente'), cliente_id: o.cliente_id || null, vehiculo_id: o.vehiculo_id || null,
    servicio_id: servicioId, placa: o.placa || null, vehiculo_info: o.vehiculo_info || null, categoria,
    ...buildCategoriaColumns(categoria, baseUsd),
    total_ingresos: baseUsd, total_servicios: 1, total_clientes: 1,
    desglose: items, metodos_pago: metodos, ...buildPagoColumnsCompletas(metodos),
    tasa_cambio: opts.tasa || n(o.tasa_cambio) || null, con_iva: opts.conIva,
    comprobante_referencia: mov.referencia || null,
    notas: `[Conciliado] Cobro registrado en la orden existente desde la conciliación bancaria · Ref ${mov.referencia || 'S/R'} [ServicioID: ${servicioId}]`,
    creado_por: opts.usuario, sede_id: o.sede_id || opts.sede, fecha_registro: new Date().toISOString(),
    registro_atrasado: fecha < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }),
    estado: 'pagado', updated_at: new Date().toISOString(),
  };
  const { data: venta, error } = await db.from('ventas_dia').insert(vd).select('id').single();
  if (error) return { ok: false, error: error.message };

  // La orden queda completada y con su cobro (cuenta + referencia), sin tocar sus ítems.
  const seg = Array.isArray(o.seguimiento) ? [...o.seguimiento as unknown[]] : [];
  seg.push({ fecha: new Date().toISOString(), accion: `Cobro conciliado desde el banco · Ref ${mov.referencia || 'N/A'}`, usuario: opts.usuario, tipo: 'sistema' });
  await db.from('servicios').update({
    estado: ['completada', 'completado', 'finalizado'].includes(String(o.estado)) ? o.estado : 'completada',
    metodos_pago: metodos, tasa_cambio: opts.tasa || n(o.tasa_cambio) || null, con_iva: opts.conIva,
    comprobante_referencia: mov.referencia || o.comprobante_referencia || null, total_pagado: baseUsd,
    seguimiento: seg, updated_at: new Date().toISOString(),
  }).eq('id', servicioId);

  return { ok: true, ventaId: String(venta.id), cliente: String(o.nombre_cliente || 'Cliente'), baseUsd, servicioId };
}
