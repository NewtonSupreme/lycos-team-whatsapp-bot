import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/**
 * Lo que necesita la pantalla de Facturación: los indicadores del mes y el
 * listado con sus filtros.
 *
 * Los indicadores se calculan sobre el mes en curso y se comparan con el mes
 * anterior. Cuando no hay mes anterior con el que comparar, la variación se
 * devuelve `null` y la tarjeta omite esa línea: un «+100 %» porque antes no
 * había nada no informa de nada.
 *
 * Todo se muestra en bolívares porque es la moneda de la factura fiscal. Las
 * facturas se guardan en dólares con su tasa, así que el equivalente en Bs. se
 * toma de `total_bs`, que es la cifra con la que de verdad se cobró; recalcular
 * con la tasa de hoy daría un número que nunca existió.
 */

interface FilaFactura {
  id: string;
  correlativo: string | null;
  tipo: string | null;
  cliente: string | null;
  vehiculo: string | null;
  total: number | null;
  total_bs: number | null;
  moneda: string | null;
  tasa_cambio: number | null;
  estado: string | null;
  con_iva: boolean | null;
  fecha_emision: string | null;
  emitido_por: string | null;
  modulo_origen: string | null;
  metodos_pago: Record<string, number> | null;
  items: unknown;
  notas: string | null;
}

const n2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** Bs. reales de una factura: los que se cobraron, no los de hoy. */
const enBs = (f: FilaFactura) =>
  Number(f.total_bs) || (Number(f.total) || 0) * (Number(f.tasa_cambio) || 0);

/** Variación porcentual, o `null` cuando no hay base con la que comparar. */
function variacion(ahora: number, antes: number): number | null {
  if (antes <= 0) return null;
  return Math.round(((ahora - antes) / antes) * 1000) / 10;
}

export async function GET(req: NextRequest) {
  const auth = await authorize('ventas', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const limite = Math.min(Number(url.searchParams.get('limite')) || 400, 1000);

  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString().slice(0, 10);

  const COLUMNAS = 'id, correlativo, tipo, cliente, vehiculo, total, total_bs, moneda, '
    + 'tasa_cambio, estado, con_iva, fecha_emision, emitido_por, modulo_origen, '
    + 'metodos_pago, items, notas';

  // El listado va limitado —son 884 facturas y la tabla pagina—, pero los
  // indicadores NO pueden salir de esa ventana: si el mes anterior se queda
  // fuera del corte, la variación sale disparatada. Por eso los dos meses se
  // consultan por fecha, aparte del listado.
  let qLista = auth.db.from('facturas')
    .select(COLUMNAS)
    .order('fecha_emision', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite);
  if (sede) qLista = qLista.eq('sede_id', sede);

  let qMeses = auth.db.from('facturas')
    .select(COLUMNAS)
    .gte('fecha_emision', inicioMesAnterior)
    .order('fecha_emision', { ascending: false });
  if (sede) qMeses = qMeses.eq('sede_id', sede);

  const [rLista, rMeses] = await Promise.all([qLista, qMeses]);
  if (rLista.error) return NextResponse.json({ error: rLista.error.message }, { status: 500 });
  if (rMeses.error) return NextResponse.json({ error: rMeses.error.message }, { status: 500 });

  const facturas = (rLista.data || []) as unknown as FilaFactura[];
  const ventana = (rMeses.data || []) as unknown as FilaFactura[];

  // ── El mes en curso, contra el MISMO tramo del mes anterior ──────────────
  //
  // Comparar lo que va de mes contra el mes anterior entero da una caída falsa:
  // el día 8, ocho días siempre parecerán poco al lado de treinta. Se compara
  // el mismo número de días transcurridos, que es la comparación que informa.
  const diaDeHoy = hoy.getDate();
  const corteAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, diaDeHoy + 1)
    .toISOString().slice(0, 10);

  const delMes = ventana.filter(f => (f.fecha_emision || '') >= inicioMes);
  const delAnterior = ventana.filter(f =>
    (f.fecha_emision || '') >= inicioMesAnterior && (f.fecha_emision || '') < corteAnterior);

  const ingresosMes = n2(delMes.reduce((s, f) => s + enBs(f), 0));
  const ingresosAnterior = n2(delAnterior.reduce((s, f) => s + enBs(f), 0));

  const pagadas = delMes.filter(f => f.estado === 'pagado');
  const pendientes = delMes.filter(f => f.estado === 'pendiente');
  const notasCredito = delMes.filter(f => f.tipo === 'nota_credito');

  const ticket = delMes.length > 0 ? n2(ingresosMes / delMes.length) : 0;
  const ticketAnterior = delAnterior.length > 0 ? n2(ingresosAnterior / delAnterior.length) : 0;

  // ── Cómo pagaron este mes ────────────────────────────────────────────────
  const porMetodo = new Map<string, number>();
  for (const f of delMes) {
    const m = f.metodos_pago || {};
    for (const [k, v] of Object.entries(m)) {
      const monto = Number(v) || 0;
      if (monto > 0) porMetodo.set(k, (porMetodo.get(k) || 0) + monto);
    }
  }
  const totalMetodos = [...porMetodo.values()].reduce((s, v) => s + v, 0);

  // ── Y en qué moneda ──────────────────────────────────────────────────────
  const porMoneda = new Map<string, number>();
  for (const f of delMes) {
    const k = f.moneda || 'USD';
    porMoneda.set(k, (porMoneda.get(k) || 0) + enBs(f));
  }

  return NextResponse.json({
    facturas: facturas.map(f => ({ ...f, total_bs_real: n2(enBs(f)) })),
    kpis: {
      emitidasMes: delMes.length,
      variacionEmitidas: variacion(delMes.length, delAnterior.length),
      ingresosMes,
      variacionIngresos: variacion(ingresosMes, ingresosAnterior),
      pagadas: pagadas.length,
      pctPagadas: delMes.length > 0 ? Math.round((pagadas.length / delMes.length) * 100) : 0,
      pendientes: pendientes.length,
      pctPendientes: delMes.length > 0 ? Math.round((pendientes.length / delMes.length) * 100) : 0,
      ticket,
      variacionTicket: variacion(ticket, ticketAnterior),
    },
    // Los conteos de las pestañas cuentan lo que hay en el listado, que es
    // sobre lo que filtran.
    conteos: {
      todas: facturas.length,
      pagadas: facturas.filter(f => f.estado === 'pagado').length,
      pendientes: facturas.filter(f => f.estado === 'pendiente').length,
      anuladas: facturas.filter(f => f.estado === 'anulado' || f.estado === 'anulada').length,
      notasCredito: facturas.filter(f => f.tipo === 'nota_credito').length,
    },
    metodos: [...porMetodo.entries()]
      .map(([id, monto]) => ({
        id,
        monto: n2(monto),
        pct: totalMetodos > 0 ? Math.round((monto / totalMetodos) * 100) : 0,
      }))
      .sort((a, b) => b.monto - a.monto),
    monedas: [...porMoneda.entries()]
      .map(([id, monto]) => ({
        id,
        monto: n2(monto),
        pct: ingresosMes > 0 ? Math.round((monto / ingresosMes) * 100) : 0,
      }))
      .sort((a, b) => b.monto - a.monto),
    relacionados: {
      presupuestos: facturas.filter(f => f.modulo_origen === 'presupuestos').length,
      servicios: facturas.filter(f => f.modulo_origen === 'servicios').length,
      notasCredito: notasCredito.length,
    },
    periodo: { inicioMes, inicioMesAnterior },
  });
}
