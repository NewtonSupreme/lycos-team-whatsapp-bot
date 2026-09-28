import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { getTasaDia } from '@/lib/tasas';
import { sincronizarDesdePartida, type Partida } from '@/lib/ficha/sincronizar';
import { BANK_BIN_IDS, BANK_METHODS } from '@/lib/reporte/ventas-mapping';
import { binsDeFuente, cuentaPrincipal } from '@/lib/pagos/desglose';
import type { PagoVencido } from '@/lib/alertas/pagos';

export const dynamic = 'force-dynamic';

const n2 = (n: unknown) => Number((Number(n) || 0).toFixed(2));
const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Los pagos a proveedores que ya toca pagar.
 *
 * Devuelve solo lo que vence hoy o antes. Lo que vence la semana que viene no es
 * una alerta: avisar de todo a la vez es la forma más rápida de que dejen de
 * leerse los avisos.
 *
 * Cada deuda viaja con el contacto del proveedor y con la tasa del día, que es
 * lo que administración necesita para pagar sin salir de la pantalla: el monto
 * está en dólares y se paga en bolívares.
 */
export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoy = hoyISO();

  let pq = auth.db.from('vehiculo_partidas')
    .select('id, fecha, descripcion, placa, vehiculo_info, cliente_nombre, cantidad, costo, '
      + 'monto_pagado, estado_pago, proveedor, proveedor_id, enlace, fecha_vencimiento, tipo')
    .in('estado_pago', ['por_pagar', 'parcial'])
    .not('fecha_vencimiento', 'is', null)
    .lte('fecha_vencimiento', hoy);

  let eq = auth.db.from('egresos')
    .select('id, fecha, categoria, notas, placa, vehiculo_info, cliente_nombre, total_egresos, '
      + 'monto_pagado, estado_pago, proveedor, proveedor_id, enlace, fecha_vencimiento, partida_id')
    .in('estado_pago', ['por_pagar', 'parcial'])
    .not('fecha_vencimiento', 'is', null)
    .lte('fecha_vencimiento', hoy);

  if (sede) { pq = pq.eq('sede_id', sede); eq = eq.eq('sede_id', sede); }

  const [{ data: partidas, error: e1 }, { data: egresos, error: e2 }, tasas] = await Promise.all([
    pq, eq, getTasaDia(auth.db, hoy),
  ]);
  // Un cero silencioso es peor que un error: si la consulta falla, que se sepa.
  if (e1 || e2) return NextResponse.json({ error: (e1 || e2)!.message }, { status: 500 });

  const dias = (v: string) =>
    Math.max(0, Math.round((Date.parse(hoy) - Date.parse(String(v).slice(0, 10))) / 86400000));

  // Los `select` van en varias líneas por legibilidad, y eso deja a PostgREST
  // sin inferir la forma de la fila. Se declara aquí, que además documenta qué
  // se pidió.
  type FilaComun = {
    id: string; fecha: string; placa: string | null;
    vehiculo_info: string | null; cliente_nombre: string | null;
    monto_pagado: number | null; estado_pago: string;
    proveedor: string | null; proveedor_id: string | null;
    enlace: string | null; fecha_vencimiento: string;
  };
  const filasPartida = (partidas || []) as unknown as (FilaComun & {
    descripcion: string; cantidad: number | null; costo: number | null; tipo: string | null;
  })[];
  const filasEgreso = (egresos || []) as unknown as (FilaComun & {
    categoria: string | null; notas: string | null;
    total_egresos: number | null; partida_id: string | null;
  })[];

  const pagos: PagoVencido[] = [];

  for (const p of filasPartida) {
    const total = n2((Number(p.cantidad) || 1) * (Number(p.costo) || 0));
    const pagado = p.estado_pago === 'parcial' ? n2(p.monto_pagado) : 0;
    const saldo = Math.max(0, n2(total - pagado));
    if (saldo <= 0) continue;
    pagos.push({
      origen: 'partida', id: p.id,
      concepto: p.descripcion,
      descripcion: `${p.tipo === 'repuesto' ? 'Repuesto' : p.tipo === 'insumo' ? 'Insumo' : 'Compra'} `
        + `«${p.descripcion}»${p.placa ? ` del vehículo ${p.placa}` : ''}`,
      placa: p.placa, vehiculo_info: p.vehiculo_info, cliente_nombre: p.cliente_nombre,
      saldo, total, pagado,
      fecha: String(p.fecha).slice(0, 10),
      fecha_vencimiento: String(p.fecha_vencimiento).slice(0, 10),
      diasVencido: dias(p.fecha_vencimiento),
      proveedor: (p.proveedor || '').trim() || 'Proveedor sin nombre',
      proveedor_id: p.proveedor_id,
      telefono: null, contacto: null, email: null,
      enlace: p.enlace,
    });
  }

  for (const e of filasEgreso) {
    // Un egreso nacido de un renglón de la ficha ya está en la lista por el otro
    // lado: contarlo dos veces haría saltar dos alertas por la misma deuda.
    if (e.partida_id) continue;
    const total = n2(e.total_egresos);
    const pagado = e.estado_pago === 'parcial' ? n2(e.monto_pagado) : 0;
    const saldo = Math.max(0, n2(total - pagado));
    if (saldo <= 0) continue;
    pagos.push({
      origen: 'egreso', id: e.id,
      concepto: e.notas || e.categoria || 'Egreso',
      descripcion: `${e.categoria || 'Gasto'} — ${e.notas || 'sin detalle'}`
        + (e.placa ? ` (vehículo ${e.placa})` : ''),
      placa: e.placa, vehiculo_info: e.vehiculo_info, cliente_nombre: e.cliente_nombre,
      saldo, total, pagado,
      fecha: String(e.fecha).slice(0, 10),
      fecha_vencimiento: String(e.fecha_vencimiento).slice(0, 10),
      diasVencido: dias(e.fecha_vencimiento),
      proveedor: (e.proveedor || '').trim() || 'Proveedor sin nombre',
      proveedor_id: e.proveedor_id,
      telefono: null, contacto: null, email: null,
      enlace: e.enlace,
    });
  }

  // ── El contacto del proveedor ──────────────────────────────────────────────
  // Sin esto la alerta dice a quién pagar pero no cómo llamarlo, y hay que ir a
  // buscarlo a otra pantalla justo cuando se quiere resolver rápido.
  const ids = [...new Set(pagos.map(p => p.proveedor_id).filter(Boolean))] as string[];
  if (ids.length > 0) {
    const { data: provs } = await auth.db.from('proveedores')
      .select('id, nombre, telefono, contacto, email, enlace').in('id', ids);
    const porId = new Map((provs || []).map(x => [x.id, x]));
    for (const p of pagos) {
      const pr = p.proveedor_id ? porId.get(p.proveedor_id) : null;
      if (!pr) continue;
      p.proveedor = pr.nombre || p.proveedor;
      p.telefono = pr.telefono || null;
      p.contacto = pr.contacto || null;
      p.email = pr.email || null;
      p.enlace = p.enlace || pr.enlace || null;
    }
  }

  // Lo más atrasado primero, y a igual retraso lo más grande.
  pagos.sort((a, b) => b.diasVencido - a.diasVencido || b.saldo - a.saldo);

  return NextResponse.json({
    pagos,
    total: n2(pagos.reduce((s, p) => s + p.saldo, 0)),
    vencidos: pagos.filter(p => p.diasVencido > 0).length,
    // La tasa del día, para saber cuántos bolívares son.
    tasa: tasas.bcv,
    tasaFuente: tasas.fuente,
    fecha: hoy,
  });
}

/**
 * «Ya pagué»: liquida la deuda y la deja asentada como gasto.
 *
 * Body: { origen: 'partida' | 'egreso', id, monto? }
 *
 * Marcarlo pagado no es solo quitar la alerta: el dinero salió de la caja ese
 * día y tiene que aparecer en los reportes. En un renglón de la ficha lo hace la
 * sincronización, que pone al día su egreso; en un egreso suelto se sella el
 * estado y la fecha de pago.
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('reportes', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    origen?: string; id?: string; monto?: number; cuenta?: string; tasa?: number;
    /** El reparto completo: varias cuentas, cada una en su moneda. */
    metodos_pago?: Record<string, unknown>;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const id = String(body.id || '').trim();
  const origen = body.origen === 'egreso' ? 'egreso' : 'partida';
  if (!id) return NextResponse.json({ error: 'Indica qué deuda se pagó.' }, { status: 400 });

  const hoy = hoyISO();

  /*
   * De qué cuenta salió. Se guarda en la moneda de la cuenta —bolívares a la
   * tasa del día en una cuenta en Bs—, que es como la lee Finanzas para bajar
   * el saldo de ese banco.
   */
  const meta = BANK_METHODS.find(m => m.id === body.cuenta && m.id !== 'cashea');
  const tasaPago = Number(body.tasa) || 0;
  if (body.cuenta && !meta) {
    return NextResponse.json({ error: 'Esa cuenta no existe.' }, { status: 400 });
  }
  if (meta?.moneda === 'Bs' && !(tasaPago > 0)) {
    return NextResponse.json({ error: 'Falta la tasa del día para un pago en bolívares.' }, { status: 400 });
  }
  // El reparto que manda el diálogo de pago: solo las diez cuentas, sin
  // Cashea (a un proveedor no se le paga con un crédito de cliente).
  const reparto: Record<string, number> = {};
  if (body.metodos_pago && typeof body.metodos_pago === 'object') {
    for (const [k, v] of Object.entries(body.metodos_pago)) {
      if (k === 'cashea' || !(BANK_BIN_IDS as string[]).includes(k)) {
        return NextResponse.json({ error: `«${k}» no es una cuenta del taller.` }, { status: 400 });
      }
      if (Number(v) > 0) reparto[k] = n2(v);
    }
  }
  const hayReparto = Object.keys(reparto).length > 0;
  if (!hayReparto && !meta) {
    return NextResponse.json({ error: 'Indica de qué cuenta salió el pago.' }, { status: 400 });
  }
  const conBs = Object.keys(reparto).some(k => BANK_METHODS.find(m => m.id === k)?.moneda === 'Bs');
  if (conBs && !(tasaPago > 0)) {
    return NextResponse.json({ error: 'Falta la tasa del día para un pago en bolívares.' }, { status: 400 });
  }
  const enCuenta = (usd: number): Record<string, number> | null => (hayReparto
    ? reparto
    : meta ? { [meta.id]: n2(meta.moneda === 'Bs' ? usd * tasaPago : usd) } : null);

  if (origen === 'partida') {
    const { data: previa } = await auth.db.from('vehiculo_partidas')
      .select('*').eq('id', id).maybeSingle();
    if (!previa) return NextResponse.json({ error: 'Ese renglón ya no existe.' }, { status: 404 });

    const costoTotal = n2((Number(previa.cantidad) || 1) * (Number(previa.costo) || 0));
    // Lo ya abonado antes sigue saliendo de su cuenta; lo de hoy, de la elegida.
    const previo = (previa.metodos_pago && typeof previa.metodos_pago === 'object')
      ? previa.metodos_pago as Record<string, number> : {};
    const resto = n2(costoTotal - (previa.estado_pago === 'parcial' ? Number(previa.monto_pagado) || 0 : 0));
    const hoyPagado = enCuenta(resto);
    const metodos = hoyPagado
      ? Object.entries(hoyPagado).reduce(
        (acc, [k, v]) => ({ ...acc, [k]: n2((Number(acc[k]) || 0) + v) }),
        { ...previo } as Record<string, number>,
      )
      : (Object.keys(previo).length ? previo : null);

    const { data, error } = await auth.db.from('vehiculo_partidas').update({
      metodos_pago: metodos,
      tasa_pago: tasaPago || previa.tasa_pago || null,
      estado_pago: 'pagado',
      // El abono parcial deja de tener sentido cuando ya está todo pagado: si se
      // quedara, el saldo se calcularía sobre una cifra que ya no significa nada.
      monto_pagado: 0,
      fecha_pago: hoy,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Esto es lo que convierte el pago en un gasto asentado: el egreso del
    // renglón pasa a 'pagado' con su fecha, y así entra en los reportes del día.
    const sinc = await sincronizarDesdePartida(auth.db, data as Partida, auth.user!.nombre, {
      // El precio al cliente no cambia porque se le pague al proveedor.
      actualizarOrden: false,
    });

    await logActivityServer(auth.db, {
      usuario: auth.user!.nombre, modulo: 'egresos', accion: 'Pago a proveedor',
      detalles: `${data.proveedor || 'proveedor'} · ${data.descripcion} · `
        + `$${n2((Number(data.cantidad) || 1) * (Number(data.costo) || 0)).toFixed(2)}`,
      referencia_id: id, referencia_tabla: 'vehiculo_partidas', sede_id: data.sede_id,
    });

    return NextResponse.json({ ok: true, avisos: sinc.avisos });
  }

  const { data: previa } = await auth.db.from('egresos')
    .select('id, proveedor, notas, total_egresos, sede_id, monto_pagado, metodos_pago').eq('id', id).maybeSingle();
  if (!previa) return NextResponse.json({ error: 'Ese egreso ya no existe.' }, { status: 404 });

  const restoEgreso = n2((Number(previa.total_egresos) || 0) - (Number(previa.monto_pagado) || 0));
  const hoyEgreso = enCuenta(restoEgreso > 0 ? restoEgreso : Number(previa.total_egresos) || 0);
  const previoEgreso = (previa.metodos_pago && typeof previa.metodos_pago === 'object')
    ? previa.metodos_pago as Record<string, number> : {};
  const metodosEgreso = hoyEgreso
    ? Object.entries(hoyEgreso).reduce(
      (acc, [k, v]) => ({ ...acc, [k]: n2((Number(acc[k]) || 0) + v) }),
      { ...previoEgreso } as Record<string, number>,
    )
    : null;

  const { error } = await auth.db.from('egresos').update({
    estado_pago: 'pagado',
    monto_pagado: n2(previa.total_egresos),
    fecha_pago: hoy,
    ...(metodosEgreso ? {
      metodos_pago: metodosEgreso,
      metodo_pago: cuentaPrincipal(binsDeFuente({ metodos_pago: metodosEgreso }), tasaPago),
      tasa_cambio: tasaPago || null,
    } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'egresos', accion: 'Pago a proveedor',
    detalles: `${previa.proveedor || 'proveedor'} · ${previa.notas || 'egreso'} · `
      + `$${n2(previa.total_egresos).toFixed(2)}`,
    referencia_id: id, referencia_tabla: 'egresos', sede_id: previa.sede_id,
  });

  return NextResponse.json({ ok: true, avisos: [] });
}
