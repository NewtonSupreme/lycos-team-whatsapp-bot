import { cargarDatosCaja, construirFlujo, type CuentaCaja } from '@/lib/caja/flujo';
import { analizarPeriodo } from '@/lib/utilidad/periodo';
import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { BANK_METHODS, binToUSD } from '@/lib/reporte/ventas-mapping';
import { lineasDeMetodos, resumenCorto } from '@/lib/pagos/desglose';
import { categoriaLabel } from '@/lib/categorias';
import {
  colorPorIndice, etiquetaGasto, type Cobrar, type Indicador, type Pagar, type PuntoFlujo,
  type ResumenFinanzas, type SaldoCuenta, type Tajada, type Transaccion,
} from '@/lib/finanzas/tipos';

export const dynamic = 'force-dynamic';

/**
 * Todo lo que enseña la vista de Finanzas, calculado en un sitio.
 *
 * Se hace en el servidor y de una sola vez porque las seis tarjetas de arriba,
 * el flujo de caja, los dos anillos y los indicadores salen todos de las mismas
 * filas. Calcularlos por separado —una petición por panel— daría cifras que no
 * cuadran entre sí en cuanto una venta se registre a mitad de camino.
 *
 * Sobre la moneda: todo sale en dólares. Cada cobro en bolívares se convierte
 * con la tasa de SU día, que viene en la propia fila, no con la de hoy: un
 * cobro de julio convertido a la tasa de septiembre es un ingreso inventado.
 * La conversión a bolívares para pintar se hace en la pantalla.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const DIA = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Variación porcentual. `null` cuando no hay base con la que comparar. */
function variacion(actual: number, previo: number): number | null {
  // Sin base no hay porcentaje. Devolver 100% «porque antes era cero» es la
  // clase de cifra que hizo que un mes normal pareciera un −77%.
  if (!previo) return null;
  return r2(((actual - previo) / Math.abs(previo)) * 100);
}

interface FilaVenta {
  id: string; fecha: string | null; cliente: string | null; categoria: string | null;
  total_ingresos: number | null; tasa: number | null; tasa_cambio: number | null;
  estado: string | null; saldo_pendiente: number | null; notas: string | null;
  metodos_pago: Record<string, number> | null;
  [bin: string]: unknown;
}

interface FilaEgreso {
  id: string; fecha: string | null; categoria: string | null; total_egresos: number | null;
  moneda: string | null; tasa_cambio: number | null; metodo_pago: string | null;
  estado_pago: string | null; proveedor: string | null; notas: string | null;
  cliente_nombre: string | null; placa: string | null; fecha_vencimiento: string | null;
  monto_pagado: number | null;
  /** El reparto por cuenta de lo pagado, cada cuenta en su moneda. */
  metodos_pago?: Record<string, number> | null;
}

/** Lo cobrado en una venta, en dólares, sumando sus bins con su propia tasa. */
function ingresoUSD(v: FilaVenta): number {
  const tasa = Number(v.tasa) || Number(v.tasa_cambio) || 0;
  let suma = 0;
  let hayBins = false;
  for (const m of BANK_METHODS) {
    const nativo = Number(v[m.id] as number) || 0;
    if (nativo === 0) continue;
    hayBins = true;
    suma += binToUSD(m.id, nativo, tasa);
  }
  // 511 de 607 ventas no tienen desglose por banco: para esas el importe
  // registrado es `total_ingresos`, que ya está en dólares. Sin este respaldo
  // el 84% de los ingresos desaparecería del panel.
  return hayBins ? r2(suma) : r2(Number(v.total_ingresos) || 0);
}

/** Un egreso en dólares. Los hay guardados en bolívares y hay que traerlos. */
function egresoUSD(e: FilaEgreso): number {
  const monto = Number(e.total_egresos) || 0;
  if (String(e.moneda || 'USD').toUpperCase() === 'USD') return r2(monto);
  const tasa = Number(e.tasa_cambio) || 0;
  // Sin tasa no se puede convertir. Se deja en cero y se avisa: colar
  // bolívares como dólares multiplicaría el gasto por ochocientos.
  return tasa > 0 ? r2(monto / tasa) : 0;
}

export async function GET(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoy = new Date();

  // Por defecto, el mes en curso: es el período con el que se cuadra la caja.
  const desde = url.searchParams.get('desde')
    || iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const hasta = url.searchParams.get('hasta') || iso(hoy);

  const dDesde = new Date(`${desde}T00:00:00`);
  const dHasta = new Date(`${hasta}T00:00:00`);
  const dias = Math.max(1, Math.round((dHasta.getTime() - dDesde.getTime()) / DIA) + 1);

  // El período anterior de la MISMA duración, pegado al de ahora. Comparar un
  // trozo de mes contra un mes entero es lo que produce caídas que no existen.
  const prevHasta = iso(new Date(dDesde.getTime() - DIA));
  const prevDesde = iso(new Date(dDesde.getTime() - dias * DIA));

  const binCols = BANK_METHODS.map(m => m.id).join(', ');

  const [rVentas, rPrevVentas, rEgresos, rPrevEgresos, rFacturas, rCuentas, rServicios, rTasa] =
    await Promise.all([
      (() => {
        let q = auth.db.from('ventas_dia')
          .select(`id, fecha, cliente, categoria, total_ingresos, tasa, tasa_cambio, estado, saldo_pendiente, notas, metodos_pago, ${binCols}`)
          .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
        if (sede) q = q.eq('sede_id', sede);
        return q;
      })(),
      (() => {
        let q = auth.db.from('ventas_dia')
          .select(`id, fecha, total_ingresos, tasa, tasa_cambio, ${binCols}`)
          .gte('fecha', prevDesde).lte('fecha', prevHasta);
        if (sede) q = q.eq('sede_id', sede);
        return q;
      })(),
      (() => {
        let q = auth.db.from('egresos')
          .select('id, fecha, categoria, total_egresos, moneda, tasa_cambio, metodo_pago, metodos_pago, estado_pago, proveedor, notas, cliente_nombre, placa, fecha_vencimiento, monto_pagado')
          .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
        if (sede) q = q.eq('sede_id', sede);
        return q;
      })(),
      (() => {
        let q = auth.db.from('egresos')
          .select('id, fecha, total_egresos, moneda, tasa_cambio')
          .gte('fecha', prevDesde).lte('fecha', prevHasta);
        if (sede) q = q.eq('sede_id', sede);
        return q;
      })(),
      // Las facturas pendientes son las cuentas por cobrar. No se filtran por
      // el período: una deuda de hace tres meses sigue debiéndose hoy.
      (() => {
        let q = auth.db.from('facturas')
          .select('id, correlativo, cliente, total, fecha_emision, estado')
          .eq('estado', 'pendiente').order('fecha_emision', { ascending: true }).limit(300);
        if (sede) q = q.eq('sede_id', sede);
        return q;
      })(),
      (() => {
        let q = auth.db.from('cuentas_financieras')
          .select('id, nombre, tipo, moneda, banco, bin, saldo_inicial, desde, orden')
          .eq('activo', true).order('orden');
        if (sede) q = q.or(`sede_id.eq.${sede},sede_id.is.null`);
        return q;
      })(),
      // Para los indicadores: cuántos servicios se hicieron y qué costaron.
      (() => {
        let q = auth.db.from('servicios')
          .select('id, fecha, estado, costo_final, total_pagado, costo_estimado, items')
          .gte('fecha', desde).lte('fecha', hasta).limit(3000);
        if (sede) q = q.eq('sede_id', sede);
        return q;
      })(),
      auth.db.from('tasas_bcv').select('bcv, fecha').order('fecha', { ascending: false }).limit(1),
    ]);

  if (rVentas.error) return NextResponse.json({ error: rVentas.error.message }, { status: 500 });

  const ventas = (rVentas.data as unknown as FilaVenta[]) || [];
  const ventasPrev = (rPrevVentas.data as unknown as FilaVenta[]) || [];
  const egresos = (rEgresos.data as unknown as FilaEgreso[]) || [];
  const egresosPrev = (rPrevEgresos.data as unknown as FilaEgreso[]) || [];
  const avisos: string[] = [];

  // Cualquier consulta que falle se cuenta. Antes solo se miraba la de ventas,
  // así que un panel podía salir en cero por un error y parecer un dato.
  for (const [que, r] of [
    ['los gastos', rEgresos], ['las cuentas', rCuentas], ['los servicios', rServicios],
  ] as const) {
    if (r.error) avisos.push(`No se pudieron leer ${que}: ${r.error.message}`);
  }

  const tasaHoy = Number((rTasa.data as { bcv: number }[] | null)?.[0]?.bcv) || 0;
  if (!tasaHoy) avisos.push('No hay tasa del BCV registrada; los importes se muestran en dólares.');

  // ── Ingresos y gastos ─────────────────────────────────────────────────────
  const ingresos = r2(ventas.reduce((s, v) => s + ingresoUSD(v), 0));
  const ingresosPrev = r2(ventasPrev.reduce((s, v) => s + ingresoUSD(v), 0));

  const sinTasa = egresos.filter(e =>
    String(e.moneda || 'USD').toUpperCase() !== 'USD' && !(Number(e.tasa_cambio) > 0));
  if (sinTasa.length > 0) {
    avisos.push(`${sinTasa.length} gasto(s) en bolívares no tienen tasa guardada y quedan fuera del total.`);
  }

  const gastos = r2(egresos.reduce((s, e) => s + egresoUSD(e), 0));
  const gastosPrev = r2(egresosPrev.reduce((s, e) => s + egresoUSD(e), 0));

  // La utilidad sale del MISMO cálculo que Finanzas › Utilidad. Antes era «lo cobrado − todo lo gastado»:
  // restaba piezas de carros que aún no se cobran y gastos sin pagar contra solo lo cobrado, y daba
  // utilidades negativas que no existían (octubre: −$569 en vez de +$4.062).
  const [uAct, uPrev] = await Promise.all([
    analizarPeriodo(auth.db, { desde, hasta, sede: sede || null }).catch(() => null),
    analizarPeriodo(auth.db, { desde: prevDesde, hasta: prevHasta, sede: sede || null }).catch(() => null),
  ]);
  if (!uAct) avisos.push('No se pudo calcular la utilidad del período; se muestra lo cobrado menos lo gastado.');
  const totalCobrado = ingresos; const totalGastado = gastos;
  const ventasBase = uAct ? uAct.estado.ventas.base : ingresos;
  const ventasBasePrev = uPrev ? uPrev.estado.ventas.base : ingresosPrev;
  const costosGastos = uAct ? r2(uAct.estado.costoCarros.total + uAct.estado.gastosTaller.total) : gastos;
  const costosGastosPrev = uPrev ? r2(uPrev.estado.costoCarros.total + uPrev.estado.gastosTaller.total) : gastosPrev;
  const utilidad = uAct ? uAct.estado.utilidad : r2(ingresos - gastos);
  const utilidadPrev = uPrev ? uPrev.estado.utilidad : r2(ingresosPrev - gastosPrev);
  const margen = ventasBase > 0 ? r2((utilidad / ventasBase) * 100) : 0;
  const margenPrev = ventasBasePrev > 0 ? r2((utilidadPrev / ventasBasePrev) * 100) : 0;

  // ── Cuentas por cobrar ────────────────────────────────────────────────────
  // Se comprueba el error a propósito. La primera versión pedía `numero` y
  // `fecha`, que en esta tabla se llaman `correlativo` y `fecha_emision`:
  // PostgREST devolvía error, `data` venía vacío y el panel enseñaba «$0,00 ·
  // 0 facturas pendientes» habiendo 68. Un cero silencioso es peor que un
  // error, porque nadie va a comprobarlo.
  if (rFacturas.error) {
    avisos.push(`No se pudieron leer las facturas pendientes: ${rFacturas.error.message}`);
  }

  const facturas = (rFacturas.data as {
    id: string; correlativo: string | null; cliente: string | null;
    total: number | null; fecha_emision: string | null;
  }[]) || [];

  const porCobrarLista: Cobrar[] = facturas.map(f => {
    const emitida = f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : null;
    return {
      id: f.id,
      cliente: f.cliente || 'Sin cliente',
      documento: f.correlativo || '—',
      monto: r2(Number(f.total) || 0),
      dias: emitida
        ? Math.max(0, Math.round((hoy.getTime() - new Date(`${emitida}T00:00:00`).getTime()) / DIA))
        : 0,
    };
  }).sort((a, b) => b.dias - a.dias);

  const porCobrarTotal = r2(porCobrarLista.reduce((s, x) => s + x.monto, 0));

  // ── Cuentas por pagar ─────────────────────────────────────────────────────
  // Un gasto que no está pagado es un compromiso, esté dentro del período o
  // no; por eso se piden aparte del cálculo del mes.
  let qPagar = auth.db.from('egresos')
    .select('id, proveedor, categoria, notas, total_egresos, moneda, tasa_cambio, fecha_vencimiento, monto_pagado, estado_pago')
    .neq('estado_pago', 'pagado').limit(300);
  if (sede) qPagar = qPagar.eq('sede_id', sede);
  const rPagar = await qPagar;

  const porPagarLista: Pagar[] = ((rPagar.data as unknown as FilaEgreso[]) || []).map(e => {
    const total = egresoUSD(e);
    const pagado = r2(Number(e.monto_pagado) || 0);
    const venc = e.fecha_vencimiento ? String(e.fecha_vencimiento).slice(0, 10) : null;
    return {
      id: e.id,
      proveedor: e.proveedor || 'Sin proveedor',
      descripcion: etiquetaGasto(e.categoria),
      monto: r2(Math.max(0, total - pagado)),
      vencimiento: venc,
      dias: venc
        ? Math.round((new Date(`${venc}T00:00:00`).getTime() - hoy.getTime()) / DIA)
        : null,
    };
  }).filter(x => x.monto > 0)
    // Lo que vence antes, arriba; lo sin fecha al final.
    .sort((a, b) => (a.dias ?? 9e9) - (b.dias ?? 9e9));

  const porPagarTotal = r2(porPagarLista.reduce((s, x) => s + x.monto, 0));

  const kpis: ResumenFinanzas['kpis'] = {
    ingresos: { valor: ventasBase, variacion: variacion(ventasBase, ventasBasePrev) },
    gastos: { valor: costosGastos, variacion: variacion(costosGastos, costosGastosPrev) },
    utilidad: { valor: utilidad, variacion: variacion(utilidad, utilidadPrev) },
    margen: {
      valor: margen,
      // El margen es un porcentaje: su «variación» son puntos, no un
      // porcentaje de un porcentaje.
      variacion: margenPrev ? r2(margen - margenPrev) : null,
    },
    porCobrar: {
      valor: porCobrarTotal, variacion: null,
      pie: `${porCobrarLista.length} factura(s) pendiente(s)`,
    },
    porPagar: {
      valor: porPagarTotal, variacion: null,
      pie: `${porPagarLista.length} compromiso(s)`,
    },
  };

  // ── Flujo de caja ─────────────────────────────────────────────────────────
  // El tramo se elige por la longitud del período: por días si es corto, por
  // semanas en un mes, por meses si abarca varios. Un mes en tramos diarios
  // son treinta barras ilegibles.
  const agrupacionPedida = url.searchParams.get('agrupacion');
  const agrupacion: 'dia' | 'semana' | 'mes' =
    agrupacionPedida === 'dia' || agrupacionPedida === 'semana' || agrupacionPedida === 'mes'
      ? agrupacionPedida
      : dias <= 10 ? 'dia' : dias <= 62 ? 'semana' : 'mes';

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const tramoDe = (fecha: string): { clave: string; etiqueta: string } => {
    const d = new Date(`${fecha.slice(0, 10)}T00:00:00`);
    if (agrupacion === 'dia') {
      return { clave: fecha.slice(0, 10), etiqueta: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` };
    }
    if (agrupacion === 'mes') {
      return { clave: fecha.slice(0, 7), etiqueta: `${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` };
    }
    // Semana contada desde el inicio del período, no la semana del calendario:
    // así «Semana 1» es la primera del rango que se está viendo.
    const n = Math.floor((d.getTime() - dDesde.getTime()) / (7 * DIA)) + 1;
    return { clave: `s${String(n).padStart(3, '0')}`, etiqueta: `Semana ${n}` };
  };

  const tramos = new Map<string, { etiqueta: string; ingresos: number; gastos: number }>();
  const tocar = (clave: string, etiqueta: string) => {
    if (!tramos.has(clave)) tramos.set(clave, { etiqueta, ingresos: 0, gastos: 0 });
    return tramos.get(clave)!;
  };
  for (const v of ventas) {
    if (!v.fecha) continue;
    const t = tramoDe(v.fecha);
    tocar(t.clave, t.etiqueta).ingresos += ingresoUSD(v);
  }
  for (const e of egresos) {
    if (!e.fecha) continue;
    const t = tramoDe(e.fecha);
    tocar(t.clave, t.etiqueta).gastos += egresoUSD(e);
  }

  let acumulado = 0;
  const flujo: PuntoFlujo[] = [...tramos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, t]) => {
      acumulado += t.ingresos - t.gastos;
      return {
        etiqueta: t.etiqueta,
        ingresos: r2(t.ingresos),
        gastos: r2(t.gastos),
        acumulado: r2(acumulado),
      };
    });

  // ── Los dos anillos ───────────────────────────────────────────────────────
  const enTajadas = (
    mapa: Map<string, number>, total: number, etiquetar: (k: string) => string,
  ): Tajada[] => [...mapa.entries()]
    .filter(([, m]) => m > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([clave, monto], i) => ({
      clave,
      etiqueta: etiquetar(clave),
      monto: r2(monto),
      pct: total > 0 ? r2((monto / total) * 100) : 0,
      color: colorPorIndice(i),
    }));

  const porCategoria = new Map<string, number>();
  for (const e of egresos) {
    const k = (e.categoria || 'otro').toLowerCase();
    porCategoria.set(k, (porCategoria.get(k) || 0) + egresoUSD(e));
  }
  const gastosPorCategoria = enTajadas(porCategoria, gastos, etiquetaGasto);

  const porMetodo = new Map<string, number>();
  let ventasSinDesglose = 0;
  for (const v of ventas) {
    const tasa = Number(v.tasa) || Number(v.tasa_cambio) || 0;
    let hay = false;
    for (const m of BANK_METHODS) {
      const nativo = Number(v[m.id] as number) || 0;
      if (nativo === 0) continue;
      hay = true;
      porMetodo.set(m.id, (porMetodo.get(m.id) || 0) + binToUSD(m.id, nativo, tasa));
    }
    if (!hay) {
      ventasSinDesglose += 1;
      const monto = r2(Number(v.total_ingresos) || 0);
      if (monto > 0) porMetodo.set('sin_clasificar', (porMetodo.get('sin_clasificar') || 0) + monto);
    }
  }
  if (ventasSinDesglose > 0) {
    avisos.push(
      `${ventasSinDesglose} venta(s) del período no tienen desglose por banco; `
      + 'se muestran como «Sin clasificar».',
    );
  }
  const etiquetaBin = (k: string) =>
    k === 'sin_clasificar' ? 'Sin clasificar'
      : BANK_METHODS.find(m => m.id === k)?.label || k;
  const ingresosPorMetodo = enTajadas(porMetodo, ingresos, etiquetaBin);

  // ── Transacciones recientes ───────────────────────────────────────────────
  // Ingresos y gastos en una sola lista ordenada por fecha: es como se lee un
  // extracto, y separarlos obliga a cruzar dos tablas con la vista.
  const limpiaNotas = (t?: string | null) =>
    String(t || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

  const binPrincipal = (v: FilaVenta): string | null => {
    let mejor: { id: string; usd: number } | null = null;
    const tasa = Number(v.tasa) || Number(v.tasa_cambio) || 0;
    for (const m of BANK_METHODS) {
      const usd = binToUSD(m.id, Number(v[m.id] as number) || 0, tasa);
      if (usd > 0 && (!mejor || usd > mejor.usd)) mejor = { id: m.id, usd };
    }
    return mejor?.id ?? null;
  };

  const transacciones: Transaccion[] = [
    ...ventas.map<Transaccion>(v => {
      const bin = binPrincipal(v);
      return {
        id: `v-${v.id}`,
        fecha: (v.fecha || '').slice(0, 10),
        tipo: 'ingreso',
        descripcion: limpiaNotas(v.notas) || v.cliente || 'Venta',
        categoria: categoriaLabel(v.categoria) || 'Servicio',
        metodo: bin ? etiquetaBin(bin) : 'Sin clasificar',
        metodoBin: bin,
        monto: ingresoUSD(v),
        estado: Number(v.saldo_pendiente) > 0.01 ? 'Pendiente' : 'Completado',
      };
    }),
    ...egresos.map<Transaccion>(e => ({
      id: `e-${e.id}`,
      fecha: (e.fecha || '').slice(0, 10),
      tipo: 'gasto',
      descripcion: limpiaNotas(e.notas) || e.proveedor || e.placa || 'Gasto',
      categoria: etiquetaGasto(e.categoria),
      metodo: (() => {
        const lineas = lineasDeMetodos(e.metodos_pago || null, Number(e.tasa_cambio) || 0);
        if (lineas.length > 1) return resumenCorto(lineas);
        return e.metodo_pago ? etiquetaBin(e.metodo_pago) : 'Sin registrar';
      })(),
      metodoBin: e.metodo_pago || null,
      monto: egresoUSD(e),
      estado: String(e.estado_pago || 'pagado') === 'pagado' ? 'Completado' : 'Pendiente',
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 40);

  // ── Saldos en cuentas ─────────────────────────────────────────────────────
  // El saldo se calcula, no se guarda: un número que hay que mantener a mano
  // se desincroniza el primer día. Entra lo cobrado por esa cuenta desde su
  // fecha de arranque y sale lo pagado con ese método.
  const cuentasRaw = (rCuentas.data as {
    id: string; nombre: string; tipo: SaldoCuenta['tipo']; moneda: SaldoCuenta['moneda'];
    banco: string | null; bin: string | null; saldo_inicial: number; desde: string; orden: number;
  }[]) || [];

  let cuentas: SaldoCuenta[] = [];
  if (cuentasRaw.length > 0) {
    // La regla del saldo vive en UN sitio (lib/caja/flujo.ts): ventas, cobros, gastos, traspasos y
    // movimientos manuales. Finanzas, el flujo de caja y el PDF no pueden decir cosas distintas.
    const defs: CuentaCaja[] = cuentasRaw.map(c => ({
      id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda as CuentaCaja['moneda'], bin: c.bin,
      saldo_inicial: Number(c.saldo_inicial) || 0, desde: String(c.desde).slice(0, 10),
    }));
    const arranqueMin = defs.reduce((min, c) => (c.desde < min ? c.desde : min), defs[0].desde);
    const datosCaja = await cargarDatosCaja(auth.db, { sede: sede || null, desde: arranqueMin, hasta, cuentas: defs });
    cuentas = cuentasRaw.map(c => {
      const def = defs.find(d => d.id === c.id)!;
      const f = construirFlujo(def, datosCaja, { desde: def.desde, hasta });
      for (const a of f.avisos) avisos.push(a);
      return {
        id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda,
        banco: c.banco, bin: c.bin,
        saldoInicial: r2(def.saldo_inicial),
        entradas: f.entradas,
        salidas: f.salidas,
        saldo: f.saldoFinal,
        ...(f.desgloseBnc ? { desglose: f.desgloseBnc } : {}),
      };
    });
    // La cuenta de Cashea es el mismo dinero que ya está dentro del BNC: se
    // muestra como desglose y nunca se suma aparte.
    const bnc = cuentas.find(c => c.bin === 'bnc');
    if (bnc) cuentas = cuentas.map(c => (c.bin === 'cashea' ? { ...c, incluidaEn: bnc.nombre } : c));

    if (cuentas.every(c => c.saldoInicial === 0)) {
      avisos.push(
        'Los saldos de arranque de las cuentas están en cero: lo que se ve es el '
        + 'movimiento registrado, no el saldo real. Ponlos en «Gestionar cuentas».',
      );
    }
  }

  // ── Indicadores ───────────────────────────────────────────────────────────
  const servicios = (rServicios.data as {
    id: string; estado: string | null;
    costo_final: number | null; total_pagado: number | null; costo_estimado: number | null;
    items: { costo_unitario?: number; cantidad?: number }[] | null;
  }[]) || [];

  const CANCELADOS = new Set(['cancelada', 'cancelado', 'anulada']);
  const hechos = servicios.filter(s => !CANCELADOS.has(String(s.estado || '').toLowerCase()));
  const nServicios = hechos.length;

  const facturadoServicios = r2(hechos.reduce((s, x) => s + Math.max(
    Number(x.costo_final) || 0, Number(x.total_pagado) || 0, Number(x.costo_estimado) || 0,
  ), 0));

  // Coste directo: lo que costaron los repuestos que salieron del almacén.
  const costeDirecto = r2(hechos.reduce((s, x) => s + (Array.isArray(x.items)
    ? x.items.reduce((t, it) => t + (Number(it.costo_unitario) || 0) * (Number(it.cantidad) || 1), 0)
    : 0), 0));

  const ticket = nServicios > 0 ? r2(facturadoServicios / nServicios) : 0;
  const costePorServicio = nServicios > 0 ? r2((costeDirecto + gastos) / nServicios) : 0;

  // Días de cobranza: la edad media de lo que está pendiente.
  const diasCobranza = porCobrarLista.length > 0
    ? Math.round(porCobrarLista.reduce((s, x) => s + x.dias, 0) / porCobrarLista.length)
    : 0;

  const indicadores: Indicador[] = [
    {
      clave: 'ticket', etiqueta: 'Ticket promedio', valor: ticket, formato: 'dinero',
      variacion: null, subirEsBueno: true,
      ayuda: 'Lo que deja de media cada servicio del período.',
    },
    {
      clave: 'servicios', etiqueta: 'Servicios realizados', valor: nServicios, formato: 'numero',
      variacion: null, subirEsBueno: true,
      ayuda: 'Órdenes del período sin contar las anuladas.',
    },
    {
      clave: 'coste', etiqueta: 'Costo promedio por servicio', valor: costePorServicio,
      formato: 'dinero', variacion: null, subirEsBueno: false,
      ayuda: 'Repuestos del almacén más los gastos del período, repartido entre los servicios.',
    },
    {
      clave: 'rentabilidad', etiqueta: 'Rentabilidad por servicio',
      valor: r2(ticket - costePorServicio), formato: 'dinero',
      variacion: null, subirEsBueno: true,
      ayuda: 'Ticket promedio menos el costo promedio.',
    },
    {
      clave: 'equilibrio', etiqueta: 'Punto de equilibrio', valor: gastos, formato: 'dinero',
      variacion: null, subirEsBueno: false,
      ayuda: 'Lo que hay que facturar para cubrir los gastos del período.',
    },
    {
      clave: 'cobranza', etiqueta: 'Días de cobranza promedio', valor: diasCobranza,
      formato: 'dias', variacion: null, subirEsBueno: false,
      ayuda: 'Antigüedad media de las facturas que siguen sin cobrar.',
    },
  ];

  if (egresos.length === 0) {
    avisos.push(
      'No hay gastos registrados en el período, así que la utilidad y el margen '
      + 'salen iguales a los ingresos. Regístralos para que las cifras sean reales.',
    );
  }

  const resumen: ResumenFinanzas = {
    desde, hasta, tasa: tasaHoy,
    kpis, flujo, agrupacionFlujo: agrupacion,
    totalCobrado, totalGastado,
    utilidadDetalle: uAct ? {
      ventas: uAct.estado.ventas.base, costoCarros: uAct.estado.costoCarros.total, gastosTaller: uAct.estado.gastosTaller.total,
      iva: uAct.estado.ventas.iva, enProceso: uAct.estado.costoCarros.enProceso.total, entroCajaUsd: uAct.estado.caja.totalEntradoUsdDelDia,
      puntaje: uAct.diagnostico.puntaje, criticos: uAct.diagnostico.resumen.criticos,
    } : null,
    gastosPorCategoria, ingresosPorMetodo, transacciones, cuentas,
    porCobrar: porCobrarLista.slice(0, 40),
    porPagar: porPagarLista.slice(0, 40),
    indicadores, avisos,
  };

  return NextResponse.json(resumen);
}
