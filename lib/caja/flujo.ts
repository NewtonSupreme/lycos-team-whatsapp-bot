// ─────────────────────────────────────────────────────────────────────────────
// Flujo de caja por cuenta: saldo inicial, y cada día lo que entró y lo que salió.
//
//   saldo(día) = saldo inicial (en `desde`) + entradas − salidas, acumulado día a día.
//
// Es la ÚNICA regla para el saldo de una cuenta: Finanzas, la conciliación y el PDF
// leen de aquí, así que nunca pueden decir cosas distintas. Nada se guarda como saldo;
// se guarda el punto de partida y los movimientos.
//
// Qué mueve una cuenta (cada una en SU moneda):
//   · ventas       → la columna de esa cuenta en `ventas_dia` (el BNC suma además la
//                    inicial de Cashea, que cae en el BNC), el día de la venta;
//   · cobros       → lo cobrado de ventas anteriores, el día del cobro;
//   · gastos       → lo que salió de ESTA cuenta (reparto exacto, o la cuenta suelta);
//   · traspasos    → sale de la de origen y entra a la de destino, el día del traspaso;
//   · movimientos  → los manuales (retiro, comisión, Zelle sin venta, ajuste), salvo anulados.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { BANK_METHODS } from '@/lib/reporte/ventas-mapping';

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const n = (x: unknown) => Number(x) || 0;
const iso = (x: unknown) => String(x || '').slice(0, 10);

export interface CuentaCaja {
  id: string; nombre: string; tipo: string; moneda: 'VES' | 'USD' | 'EUR';
  bin: string | null; saldo_inicial: number; desde: string;
}

export type OrigenMov = 'venta' | 'cobro' | 'gasto' | 'traspaso' | 'manual';

export interface MovimientoFlujo {
  id: string;
  fecha: string;
  origen: OrigenMov;
  sentido: 'entrada' | 'salida';
  /** En la moneda de la cuenta. */
  monto: number;
  concepto: string;
  detalle: string;
  /** Para volver al registro de donde sale (venta, gasto, traspaso…). */
  tabla: string;
  registroId: string;
  /** Solo los manuales: se pueden anular. */
  anulable?: boolean;
  referencia?: string | null;
  usuario?: string | null;
  /** Los anulados se muestran tachados y no suman. */
  anulado?: boolean;
  anuladoMotivo?: string | null;
}

export interface ArqueoCaja {
  id: string; fecha: string; saldo_real: number; saldo_sistema: number; diferencia: number;
  origen: string; nota: string | null; usuario: string | null; created_at: string;
}

export interface DiaFlujo {
  fecha: string;
  saldoInicial: number;
  entradas: number;
  salidas: number;
  saldoFinal: number;
  movimientos: MovimientoFlujo[];
  /** El último arqueo de ese día, si se verificó el saldo real. */
  arqueo: ArqueoCaja | null;
}

export interface FlujoCuenta {
  cuenta: CuentaCaja;
  desde: string;
  hasta: string;
  saldoInicialRango: number;
  saldoFinal: number;
  entradas: number;
  salidas: number;
  dias: DiaFlujo[];
  /** Todo lo que se omitió o no se pudo sumar, para no esconderlo. */
  avisos: string[];
  /** Para el BNC: cuánto de lo que entró vino de Cashea. */
  desgloseBnc?: { pmBs: number; casheaUsd: number; casheaBs: number };
}

export interface DatosCaja {
  ventas: Array<Record<string, unknown>>;
  abonos: Array<Record<string, unknown>>;
  egresos: Array<Record<string, unknown>>;
  traspasos: Array<Record<string, unknown>>;
  movimientos: Array<Record<string, unknown>>;
  arqueos: Array<Record<string, unknown>>;
  /** venta_id → cliente, para nombrar los cobros. */
  clientes: Map<string, string>;
  /** id de cuenta → nombre, para nombrar los traspasos. */
  cuentas: Map<string, string>;
}

const monedaDeBin = (bin: string): 'VES' | 'USD' | null => {
  const m = BANK_METHODS.find(x => x.id === bin);
  return m ? (m.moneda === 'Bs' ? 'VES' : 'USD') : null;
};

function primerDetalle(desglose: unknown, notas: unknown): string {
  if (Array.isArray(desglose)) {
    const d = desglose.map(x => (x && typeof x === 'object' ? String((x as { descripcion?: string }).descripcion || '') : '')).filter(Boolean);
    if (d.length) return d.join(', ').slice(0, 90);
  }
  return String(notas || '').replace(/\[[^\]]*\]/g, '').trim().slice(0, 90);
}

/** Todos los movimientos de UNA cuenta, de su fecha de arranque en adelante, sin ordenar. */
export function movimientosDeCuenta(cuenta: CuentaCaja, d: DatosCaja, hasta: string): { movs: MovimientoFlujo[]; avisos: string[]; desgloseBnc?: FlujoCuenta['desgloseBnc'] } {
  const movs: MovimientoFlujo[] = [];
  const avisos: string[] = [];
  const bin = cuenta.bin;
  let pmBs = 0, casheaUsd = 0, casheaBs = 0;
  const dentro = (f: string) => !!f && f >= cuenta.desde && f <= hasta;

  if (bin) {
    const mb = monedaDeBin(bin);
    // El bin y la cuenta se llevan en la misma moneda; si no, se sumarían bolívares a dólares.
    if (mb && mb !== cuenta.moneda) {
      avisos.push(`La cuenta «${cuenta.nombre}» está en ${cuenta.moneda} pero «${BANK_METHODS.find(x => x.id === bin)?.label}» se cobra en ${mb === 'VES' ? 'Bs' : 'USD'}: no se suma nada de ventas ni gastos hasta que se corrija su moneda.`);
    } else {
      for (const v of d.ventas) {
        const f = iso(v.fecha); if (!dentro(f)) continue;
        const cliente = String(v.cliente || 'Cliente');
        const detalle = primerDetalle(v.desglose, v.notas);
        const monto = n(v[bin]);
        if (monto > 0) {
          movs.push({ id: `venta:${v.id}:${bin}`, fecha: f, origen: 'venta', sentido: 'entrada', monto: r2(monto), concepto: cliente, detalle: [v.placa, detalle].filter(Boolean).join(' · '), tabla: 'ventas_dia', registroId: String(v.id), referencia: (v.comprobante_referencia as string) || null });
          if (bin === 'bnc') pmBs += monto;
        }
        if (bin === 'bnc') {
          // Lo de Cashea cae en el BNC: se pasa a bolívares con la tasa de la venta.
          const cu = n(v.cashea); const t = n(v.tasa_cambio) || n(v.tasa);
          if (cu > 0) {
            casheaUsd += cu; casheaBs += cu * t;
            if (t > 0) movs.push({ id: `venta:${v.id}:cashea`, fecha: f, origen: 'venta', sentido: 'entrada', monto: r2(cu * t), concepto: cliente, detalle: `Inicial de Cashea ($${cu.toFixed(2)} a ${t.toFixed(4)})`, tabla: 'ventas_dia', registroId: String(v.id) });
            else avisos.push(`La venta de ${cliente} (${f}) tiene Cashea sin tasa: no se pudo pasar a bolívares para el BNC.`);
          }
        }
      }
      for (const a of d.abonos) {
        const f = iso(a.fecha); if (!dentro(f)) continue;
        const mp = a.metodos_pago && typeof a.metodos_pago === 'object' ? a.metodos_pago as Record<string, unknown> : null;
        if (!mp) continue;
        const cliente = d.clientes.get(String(a.venta_id)) || 'Cliente';
        const monto = n(mp[bin]);
        if (monto > 0) {
          movs.push({ id: `abono:${a.id}:${bin}`, fecha: f, origen: 'cobro', sentido: 'entrada', monto: r2(monto), concepto: cliente, detalle: `Cobro de deuda${a.nota ? ` · ${String(a.nota).slice(0, 60)}` : ''}`, tabla: 'abonos', registroId: String(a.id) });
          if (bin === 'bnc') pmBs += monto;
        }
        if (bin === 'bnc') {
          const cu = n(mp.cashea); const t = n(a.tasa_cambio);
          if (cu > 0 && t > 0) {
            casheaUsd += cu; casheaBs += cu * t;
            movs.push({ id: `abono:${a.id}:cashea`, fecha: f, origen: 'cobro', sentido: 'entrada', monto: r2(cu * t), concepto: cliente, detalle: `Cuota de Cashea ($${cu.toFixed(2)})`, tabla: 'abonos', registroId: String(a.id) });
          }
        }
      }
      for (const e of d.egresos) {
        const f = iso(e.fecha); if (!dentro(f)) continue;
        const reparto = e.metodos_pago && typeof e.metodos_pago === 'object' ? e.metodos_pago as Record<string, unknown> : null;
        let monto = 0;
        if (reparto && Object.values(reparto).some(v => n(v) > 0)) {
          monto = n(reparto[bin]);
        } else if (e.metodo_pago === bin) {
          const total = n(e.total_egresos);
          const esUsd = String(e.moneda || 'USD').toUpperCase() === 'USD';
          const tasa = n(e.tasa_cambio);
          if (cuenta.moneda === 'USD') monto = esUsd ? total : (tasa > 0 ? total / tasa : 0);
          else monto = esUsd ? (tasa > 0 ? total * tasa : 0) : total;
        }
        if (monto > 0) {
          const desc = primerDetalle(e.desglose, e.notas) || String(e.categoria || '');
          movs.push({ id: `egreso:${e.id}:${bin}`, fecha: f, origen: 'gasto', sentido: 'salida', monto: r2(monto), concepto: String(e.proveedor || e.cliente_nombre || e.cliente || 'Gasto'), detalle: [e.placa, desc].filter(Boolean).join(' · '), tabla: 'egresos', registroId: String(e.id) });
        }
      }
    }
  }

  for (const t of d.traspasos) {
    const f = iso(t.fecha); if (!dentro(f)) continue;
    if (String(t.origen_id) === cuenta.id) {
      movs.push({ id: `traspaso:${t.id}:sale`, fecha: f, origen: 'traspaso', sentido: 'salida', monto: r2(n(t.monto)), concepto: `Traspaso a ${d.cuentas.get(String(t.destino_id)) || 'otra cuenta'}`, detalle: String(t.motivo || ''), tabla: 'traspasos_cuenta', registroId: String(t.id), usuario: (t.registrado_por as string) || null });
    }
    if (String(t.destino_id) === cuenta.id) {
      movs.push({ id: `traspaso:${t.id}:entra`, fecha: f, origen: 'traspaso', sentido: 'entrada', monto: r2(n(t.monto_destino) || n(t.monto)), concepto: `Traspaso desde ${d.cuentas.get(String(t.origen_id)) || 'otra cuenta'}`, detalle: String(t.motivo || ''), tabla: 'traspasos_cuenta', registroId: String(t.id), usuario: (t.registrado_por as string) || null });
    }
  }

  for (const m of d.movimientos) {
    if (String(m.cuenta_id) !== cuenta.id) continue;
    const f = iso(m.fecha); if (!dentro(f)) continue;
    movs.push({
      id: `manual:${m.id}`, fecha: f, origen: 'manual', sentido: m.sentido === 'salida' ? 'salida' : 'entrada', monto: r2(n(m.monto)),
      concepto: String(m.concepto || 'Movimiento'), detalle: [m.contraparte, m.categoria, m.notas].filter(Boolean).join(' · '),
      tabla: 'movimientos_caja', registroId: String(m.id), anulable: !m.anulado, referencia: (m.referencia as string) || null,
      usuario: (m.usuario as string) || null, anulado: !!m.anulado, anuladoMotivo: (m.anulado_motivo as string) || null,
    });
  }

  return { movs, avisos, ...(bin === 'bnc' ? { desgloseBnc: { pmBs: r2(pmBs), casheaUsd: r2(casheaUsd), casheaBs: r2(casheaBs) } } : {}) };
}

const ORDEN_ORIGEN: Record<OrigenMov, number> = { venta: 0, cobro: 1, manual: 2, gasto: 3, traspaso: 4 };
const sumarDia = (iso0: string, k: number) => new Date(Date.parse(`${iso0}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

/** El flujo día por día de una cuenta en un rango, con el saldo encadenado desde su saldo inicial. */
export function construirFlujo(cuenta: CuentaCaja, datos: DatosCaja, rango: { desde: string; hasta: string }): FlujoCuenta {
  const { movs, avisos, desgloseBnc } = movimientosDeCuenta(cuenta, datos, rango.hasta);
  const vivos = movs.filter(m => !m.anulado);
  const arqueos: ArqueoCaja[] = datos.arqueos.filter(a => String(a.cuenta_id) === cuenta.id).map(a => ({
    id: String(a.id), fecha: iso(a.fecha), saldo_real: n(a.saldo_real), saldo_sistema: n(a.saldo_sistema), diferencia: n(a.diferencia),
    origen: String(a.origen || 'manual'), nota: (a.nota as string) || null, usuario: (a.usuario as string) || null, created_at: String(a.created_at || ''),
  }));
  const desde = rango.desde < cuenta.desde ? cuenta.desde : rango.desde;

  let saldo = r2(n(cuenta.saldo_inicial));
  for (const m of vivos) if (m.fecha < desde) saldo = r2(saldo + (m.sentido === 'entrada' ? m.monto : -m.monto));
  const saldoInicialRango = saldo;

  const porDia = new Map<string, MovimientoFlujo[]>();
  for (const m of movs) { if (m.fecha < desde || m.fecha > rango.hasta) continue; (porDia.get(m.fecha) || porDia.set(m.fecha, []).get(m.fecha)!).push(m); }

  const dias: DiaFlujo[] = [];
  let entradas = 0, salidas = 0;
  for (let f = desde; f <= rango.hasta; f = sumarDia(f, 1)) {
    const delDia = (porDia.get(f) || []).sort((a, b) => ORDEN_ORIGEN[a.origen] - ORDEN_ORIGEN[b.origen]);
    const e = r2(delDia.filter(m => !m.anulado && m.sentido === 'entrada').reduce((s, m) => s + m.monto, 0));
    const s = r2(delDia.filter(m => !m.anulado && m.sentido === 'salida').reduce((t, m) => t + m.monto, 0));
    const ini = saldo;
    saldo = r2(saldo + e - s);
    entradas = r2(entradas + e); salidas = r2(salidas + s);
    const delDiaArq = arqueos.filter(a => a.fecha === f).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] || null;
    dias.push({ fecha: f, saldoInicial: ini, entradas: e, salidas: s, saldoFinal: saldo, movimientos: delDia, arqueo: delDiaArq });
  }
  return { cuenta, desde, hasta: rango.hasta, saldoInicialRango, saldoFinal: saldo, entradas, salidas, dias, avisos, ...(desgloseBnc ? { desgloseBnc } : {}) };
}

/** El saldo de una cuenta al final de un día (para el arqueo y las pantallas que solo quieren el número). */
export function saldoAl(cuenta: CuentaCaja, datos: DatosCaja, fecha: string): number {
  const { movs } = movimientosDeCuenta(cuenta, datos, fecha);
  return movs.filter(m => !m.anulado && m.fecha <= fecha).reduce((s, m) => r2(s + (m.sentido === 'entrada' ? m.monto : -m.monto)), r2(n(cuenta.saldo_inicial)));
}

// ── Carga de datos ───────────────────────────────────────────────────────────

async function todas<T>(construir: () => { range: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await construir().range(i, i + 999);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

/** Lo que hace falta para calcular el flujo de las cuentas dadas desde su arranque hasta `hasta`. */
export async function cargarDatosCaja(db: SupabaseClient, o: { sede: string | null; desde: string; hasta: string; cuentas: CuentaCaja[] }): Promise<DatosCaja> {
  const { sede, desde, hasta, cuentas } = o;
  const bins = [...new Set(cuentas.map(c => c.bin).filter(Boolean) as string[])];
  const colsVenta = ['id', 'fecha', 'cliente', 'placa', 'desglose', 'notas', 'tasa', 'tasa_cambio', 'comprobante_referencia', ...new Set([...bins, ...(bins.includes('bnc') ? ['cashea'] : [])])].join(', ');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el constructor anidado agota la inferencia de tipos
  const conSede = (q: any) => (sede ? q.eq('sede_id', sede) : q);

  const [ventas, abonos, egresos, traspasos, movimientos, arqueos, ctas] = await Promise.all([
    todas<Record<string, unknown>>(() => conSede(db.from('ventas_dia').select(colsVenta).gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas<Record<string, unknown>>(() => conSede(db.from('abonos').select('id, venta_id, fecha, tasa_cambio, metodos_pago, nota').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas<Record<string, unknown>>(() => conSede(db.from('egresos').select('id, fecha, proveedor, cliente, cliente_nombre, placa, categoria, notas, desglose, total_egresos, moneda, tasa_cambio, metodo_pago, metodos_pago').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas<Record<string, unknown>>(() => db.from('traspasos_cuenta').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha')),
    todas<Record<string, unknown>>(() => conSede(db.from('movimientos_caja').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha'))),
    todas<Record<string, unknown>>(() => conSede(db.from('arqueos_caja').select('*').order('fecha'))),
    db.from('cuentas_financieras').select('id, nombre').then(r => r.data || []),
  ]);

  const clientes = new Map<string, string>();
  const ids = [...new Set(abonos.map(a => String(a.venta_id || '')).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('ventas_dia').select('id, cliente').in('id', ids.slice(i, i + 200));
    for (const v of data || []) clientes.set(String(v.id), String(v.cliente || ''));
  }
  return { ventas, abonos, egresos, traspasos, movimientos, arqueos, clientes, cuentas: new Map((ctas as Array<{ id: string; nombre: string }>).map(c => [c.id, c.nombre])) };
}

export async function leerCuentas(db: SupabaseClient, sede: string | null): Promise<CuentaCaja[]> {
  let q = db.from('cuentas_financieras').select('id, nombre, tipo, moneda, bin, saldo_inicial, desde, orden').eq('activo', true).order('orden');
  if (sede) q = q.or(`sede_id.is.null,sede_id.eq.${sede}`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda, bin: c.bin, saldo_inicial: n(c.saldo_inicial), desde: iso(c.desde) }));
}
