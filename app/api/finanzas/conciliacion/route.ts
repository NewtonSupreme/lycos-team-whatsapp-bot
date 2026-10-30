import { NextRequest, NextResponse } from 'next/server';
import { esReporteOrdenesCashea, leerOrdenesCashea } from '@/lib/cashea/ordenes-reporte';
import { guardarFichasOrdenes } from '@/lib/cashea/descontar';
import { createHash } from 'node:crypto';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import {
  BANCOS_CONCILIABLES, PlantillaInvalida, leerEstadoDeCuenta,
  type BancoConciliable, type EstadoLeido,
} from '@/lib/conciliacion/leer-estado';
import { CUENTAS_DEL_BANCO, conciliar } from '@/lib/conciliacion/motor';
import { cargarSistema } from '@/lib/conciliacion/sistema';
import { aplicarDescuento, prepararDescuento, type ResultadoDescuento } from '@/lib/cashea/descontar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const mas = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

/*
 * Conciliación bancaria: se sube el estado de cuenta tal como lo exporta el
 * banco y se cruza con lo que el sistema registró para esa cuenta.
 *
 *   POST multipart: banco (banesco|bnc|exterior|cashea), archivo,
 *                   cruce? (BNC ↔ reporte de Cashea, para explicar las cuotas)
 *
 * El archivo no se guarda: se lee en memoria y se descarta. Queda en la
 * bitácora quién concilió qué banco y período, y el resultado resumido.
 *
 * Los movimientos de bancos en Bs (BNC, Banesco, Exterior) se enriquecen con
 * la tasa del cierre de caja del día para mostrar el equivalente en USD
 * a la tasa exacta del momento del cobro o pago (UI y PDF).
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Son las finanzas de la empresa: hace falta ver también las ventas.
  if (!auth.can('ventas', 'leer')) return NextResponse.json({ error: 'Sin permiso para ver las finanzas.' }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'No llegó ningún archivo.' }, { status: 400 }); }
  const banco = String(form.get('banco') || '') as BancoConciliable;
  if (!(banco in BANCOS_CONCILIABLES)) return NextResponse.json({ error: 'Elige el banco del estado de cuenta.' }, { status: 400 });

  const leer = async (campo: string): Promise<{ buf: Buffer; nombre: string } | null> => {
    const f = form.get(campo);
    if (!f || typeof f === 'string') return null;
    if (f.size > MAX_BYTES) throw new PlantillaInvalida(`El archivo «${f.name}» pesa más de 5 MB: no parece un estado de cuenta.`);
    return { buf: Buffer.from(await f.arrayBuffer()), nombre: f.name };
  };

  let estado: EstadoLeido;
  let cruce: EstadoLeido | null = null;
  let nombreArchivo = '';
  // Huella del archivo: identifica la versión EXACTA del estado de cuenta (dos descargas del mismo período no se confunden).
  let huellaArchivo = '';
  try {
    const a = await leer('archivo');
    if (!a) return NextResponse.json({ error: 'Adjunta el estado de cuenta.' }, { status: 400 });
    nombreArchivo = a.nombre;
    huellaArchivo = createHash('sha256').update(a.buf).digest('hex');
    // Un reporte de órdenes de Cashea (cédula, cliente…) no es un estado de cuenta, pero no se
    // desperdicia: se guarda lo que dice de cada orden y con eso se enlazan solas con su venta.
    if (banco === 'cashea' && esReporteOrdenesCashea(a.buf)) {
      const { fichas, columnas } = leerOrdenesCashea(a.buf);
      const g = fichas.length ? await guardarFichasOrdenes(auth.db, fichas) : null;
      return NextResponse.json({
        error: g
          ? `Ese es un reporte de órdenes de Cashea, no el de cuotas cobradas. Guardé ${fichas.length} orden(es) (${g.nuevas} nuevas) con ${columnas.filter(x => x !== 'orden').join(', ')}: desde ahora el sistema reconoce de quién es cada una. Para conciliar, sube el reporte de cuotas cobradas.`
          : 'Ese parece un reporte de órdenes de Cashea, pero no encontré ninguna orden legible.',
      }, { status: 422 });
    }
    estado = leerEstadoDeCuenta(a.buf, banco);
    const c = await leer('cruce');
    if (c) {
      const esperado: BancoConciliable = (banco === 'bnc' || banco === 'bnc_cuotas') ? 'cashea' : 'bnc';
      cruce = leerEstadoDeCuenta(c.buf, esperado);
    }
  } catch (e) {
    if (e instanceof PlantillaInvalida) return NextResponse.json({ error: e.message, detectado: e.detectado }, { status: 422 });
    return NextResponse.json({ error: 'No se pudo leer el archivo. ¿Es el que exporta el banco, sin modificar?' }, { status: 422 });
  }

  // Una ventana alrededor del período: los registros atrasados o adelantados
  // se cruzan igual (y se marcan); lo de Cashea se registra con más retraso.
  const bancoEfectivo = estado.banco;
  const margen = bancoEfectivo === 'cashea' || bancoEfectivo === 'bnc' || bancoEfectivo === 'bnc_cuotas' ? 25 : 12;
  const sede = auth.effectiveSede(String(form.get('sede') || '') || null);

  // ── Tasas del día: enriquecer movimientos en Bs con su equivalente en USD ──
  // Cashea ya trae tasa y usd desde el reporte. BNC, Banesco y Exterior son
  // puramente en Bs: inyectamos la tasa del cierre de caja de cada día para
  // poder mostrar ambas monedas en la UI y el PDF.
  if (bancoEfectivo !== 'cashea') {
    try {
      const { data: cierres } = await auth.db
        .from('cierres_caja')
        .select('fecha, tasa_cambio')
        .gte('fecha', mas(estado.desde, -3))
        .lte('fecha', mas(estado.hasta, 1))
        .order('fecha');

      if (cierres && cierres.length > 0) {
        const tasaMap = new Map<string, number>();
        for (const c of cierres) {
          const t = Number(c.tasa_cambio);
          if (t > 0) tasaMap.set(String(c.fecha).slice(0, 10), t);
        }
        const fechasOrdenadas = [...tasaMap.keys()].sort();
        // Fallback: si no hay cierre exacto, usa el cierre más reciente anterior
        const tasaParaFecha = (fecha: string): number => {
          if (tasaMap.has(fecha)) return tasaMap.get(fecha)!;
          let ultima = 0;
          for (const f of fechasOrdenadas) {
            if (f <= fecha) ultima = tasaMap.get(f)!;
            else break;
          }
          return ultima;
        };
        for (const mov of estado.movimientos) {
          if (!mov.tasa || mov.tasa <= 0) {
            const t = tasaParaFecha(mov.fecha);
            if (t > 0) mov.tasa = t;
          }
        }
      }
    } catch {
      // No crítico: si falla la consulta de tasas se muestra solo Bs
    }
  }

  // Cashea: las cuotas se descuentan solas al conciliar. Solo lo seguro: órdenes ya
  // enlazadas o con UNA venta que cuadra al céntimo; lo dudoso queda para decidir.
  // Cada pago se aplica una sola vez (su referencia queda en el cobro).
  let autoCuotas: (ResultadoDescuento & { pendientes: number }) | null = null;
  if (bancoEfectivo === 'cashea' && String(form.get('auto_cuotas') || '1') !== '0' && auth.can('ventas', 'editar')) {
    try {
      const previa = await prepararDescuento(auth.db, estado, sede);
      const elecciones: Record<string, string | null> = {};
      for (const g of previa.grupos) if (g.estado === 'sugerida' && g.venta) elecciones[g.clave] = g.venta.id;
      const r = await aplicarDescuento(auth.db, estado, sede, elecciones, auth.user?.nombre || 'Conciliación');
      autoCuotas = { ...r, pendientes: previa.resumen.porResolver };
      if (r.aplicados.length || r.enlazadas) {
        await logActivityServer(auth.db, {
          usuario: auth.user?.nombre || 'Sistema', modulo: 'Finanzas', accion: 'Cuotas de Cashea descontadas (automático)',
          detalles: `${r.aplicados.length} cuota(s), $${r.totalUSD.toFixed(2)} · ${r.enlazadas} orden(es) enlazada(s) · ${r.rechazados.length} sin aplicar`,
          referencia_tabla: 'abonos', referencia_id: null, sede_id: sede,
        });
      }
    } catch { /* no crítico: se concilia igual y se pueden descontar a mano */ }
  }

  try {
    const cuentas = CUENTAS_DEL_BANCO[bancoEfectivo] || CUENTAS_DEL_BANCO[banco];
    const sistema = await cargarSistema(auth.db, {
      desde: mas(estado.desde, -margen), hasta: mas(estado.hasta, margen), sede,
      cuentas, banco: bancoEfectivo,
    });
    const resultado = conciliar(estado, sistema, cruce);

    // ── Seguimiento: la corrida queda guardada y se compara con la anterior del mismo período ──
    const ing = resultado.ingresos; const egr = resultado.egresos;
    const conciliados = ing.conciliados.length + egr.conciliados.length + ing.justificados.length + egr.justificados.length;
    const pendientes = ing.sinRegistrar.length + ing.noLlegaron.length + ing.diferencias.length + ing.enOtraCuenta.length + ing.inicialesSinCuenta.length
      + egr.sinRegistrar.length + egr.noSalieron.length + egr.diferencias.length;
    // Lo que entró al banco cada día (según el estado de cuenta) y qué lo explica: en ventas y cobros de ese día,
    // en una inicial o cuota de una venta anterior, justificado, o todavía sin registrar. Así el reporte diario
    // puede decir cuánto entró de verdad, no solo lo que se vendió ese día.
    const enUsd = bancoEfectivo === 'cashea';
    const valor = (m: { monto: number; usd?: number | null }) => Math.round((enUsd ? Math.abs(m.usd ?? 0) : Math.abs(m.monto)) * 100) / 100;
    const entradasPorDia: Record<string, { total: number; enSistema: number; deVentasAnteriores: number; justificado: number; sinRegistrar: number; otraCuenta: number }> = {};
    const suma = (fecha: string, campo: 'enSistema' | 'deVentasAnteriores' | 'justificado' | 'sinRegistrar' | 'otraCuenta', monto: number) => {
      const d = (entradasPorDia[fecha] ||= { total: 0, enSistema: 0, deVentasAnteriores: 0, justificado: 0, sinRegistrar: 0, otraCuenta: 0 });
      d[campo] = Math.round((d[campo] + monto) * 100) / 100;
      d.total = Math.round((d.total + monto) * 100) / 100;
    };
    for (const p of resultado.ingresos.conciliados) for (const m of p.banco) suma(m.fecha, p.regla === 'inicial_tardia' ? 'deVentasAnteriores' : 'enSistema', valor(m));
    for (const d of resultado.ingresos.diferencias) suma(d.banco.fecha, 'enSistema', valor(d.banco));
    for (const m of resultado.ingresos.justificados) suma(m.fecha, 'justificado', valor(m));
    for (const m of resultado.ingresos.sinRegistrar) suma(m.fecha, 'sinRegistrar', valor(m));
    for (const x of resultado.ingresos.enOtraCuenta) suma(x.banco.fecha, 'otraCuenta', valor(x.banco));
    let corridaId: string | null = null;
    let anterior: { creada: string; pendientes: number | null; porcentaje: number | null; usuario: string | null } | null = null;
    let seguimientos: Record<string, { accion: string; resuelto: boolean; motivo: string | null; usuario: string | null; fecha: string }> = {};
    try {
      const { data: prev } = await auth.db.from('conciliacion_corridas').select('created_at, pendientes, porcentaje, usuario')
        .eq('banco', bancoEfectivo).eq('desde', estado.desde).eq('hasta', estado.hasta).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (prev) anterior = { creada: prev.created_at, pendientes: prev.pendientes, porcentaje: prev.porcentaje, usuario: prev.usuario };
      const { data: fila } = await auth.db.from('conciliacion_corridas').insert({
        banco: bancoEfectivo, desde: estado.desde, hasta: estado.hasta, archivo: nombreArchivo, usuario: auth.user?.nombre || null, sede_id: sede,
        cuadra: resultado.veredicto.cuadra, porcentaje: resultado.veredicto.porcentaje, en_juego: resultado.veredicto.enJuego,
        movimientos: resultado.totalMovimientos, conciliados, pendientes,
        resumen: {
          sinRegistrar: ing.sinRegistrar.length, noLlegaron: ing.noLlegaron.length, montosDistintos: ing.diferencias.length + egr.diferencias.length,
          otraCuenta: ing.enOtraCuenta.length, pagosSinGasto: egr.sinRegistrar.length, gastosNoSalieron: egr.noSalieron.length,
          justificados: ing.justificados.length + egr.justificados.length, totalBanco: ing.totalBanco, totalSistema: ing.totalSistema,
          moneda: enUsd ? 'USD' : 'Bs',
          huella: huellaArchivo,
          entradasPorDia,
          // El saldo que dice el banco: el flujo de caja lo compara con el del sistema.
          saldos: { inicial: estado.saldoInicial ?? null, final: estado.saldoFinal ?? null, desde: estado.desde, hasta: estado.hasta },
          // Registros del sistema que el banco confirmó (venta, cobro o gasto): el reporte diario les pone su sello de «conciliado».
          ids: [...new Set([
            ...ing.conciliados.flatMap(p => p.sistema.map(s => `${s.tabla}:${s.registroId}`)),
            ...egr.conciliados.flatMap(p => p.sistema.map(s => `${s.tabla}:${s.registroId}`)),
            ...ing.sistemaJustificados.map(x => `${x.sistema.tabla}:${x.sistema.registroId}`),
            ...egr.sistemaJustificados.map(x => `${x.sistema.tabla}:${x.sistema.registroId}`),
          ])].slice(0, 1500),
          // Lo que falta por aclarar, para leerlo en el reporte sin abrir la conciliación.
          pendientesDetalle: [
            ...ing.sinRegistrar.map(m => ({ tipo: 'Cobro sin registrar', fecha: m.fecha, ref: m.referencia, monto: Math.abs(m.monto) })),
            ...ing.diferencias.map(d => ({ tipo: 'Monto distinto', fecha: d.banco.fecha, ref: d.banco.referencia, monto: Math.abs(d.diferencia), concepto: d.sistema.concepto })),
            ...ing.noLlegaron.map(s => ({ tipo: 'No llegó al banco', fecha: s.fecha, ref: '', monto: s.monto, concepto: s.concepto })),
            ...egr.sinRegistrar.map(m => ({ tipo: 'Pago sin gasto', fecha: m.fecha, ref: m.referencia, monto: Math.abs(m.monto) })),
            ...egr.noSalieron.map(s => ({ tipo: 'Gasto que no salió', fecha: s.fecha, ref: '', monto: s.monto, concepto: s.concepto })),
          ].slice(0, 40),
        },
      }).select('id').single();
      corridaId = fila?.id ?? null;
      // Lo último que se hizo con cada movimiento de este período (para marcar lo que está en seguimiento).
      const { data: acc } = await auth.db.from('conciliacion_acciones').select('movimiento_hash, accion, resuelto, motivo, usuario, created_at')
        .eq('banco', bancoEfectivo).gte('fecha', mas(estado.desde, -margen)).lte('fecha', mas(estado.hasta, margen))
        .not('movimiento_hash', 'is', null).order('created_at', { ascending: false }).limit(2000);
      for (const a of acc || []) {
        const h = String(a.movimiento_hash);
        if (!seguimientos[h]) seguimientos[h] = { accion: a.accion, resuelto: a.resuelto, motivo: a.motivo, usuario: a.usuario, fecha: a.created_at };
      }
    } catch { /* el seguimiento no debe impedir ver la conciliación */ }
    await logActivityServer(auth.db, {
      usuario: auth.user?.nombre || 'Sistema',
      modulo: 'Finanzas',
      accion: `Concilió ${BANCOS_CONCILIABLES[bancoEfectivo]?.nombre || bancoEfectivo}`,
      detalles: `${estado.desde} a ${estado.hasta} · ${resultado.veredicto.cuadra ? 'CUADRA' : 'NO CUADRA'} · ${resultado.veredicto.porcentaje}% conciliado · ${nombreArchivo}`,
      referencia_tabla: 'conciliacion',
      sede_id: sede,
    });
    return NextResponse.json({
      resultado,
      meta: {
        archivo: nombreArchivo,
        banco: bancoEfectivo,
        cruce: cruce ? { banco: cruce.banco, desde: cruce.desde, hasta: cruce.hasta, movimientos: cruce.movimientos.length } : null,
        autoCuotas, corridaId, anterior, seguimientos,
        generadoPor: auth.user?.nombre || '',
        generadoEn: new Date().toISOString(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo conciliar: ${(e as Error).message}` }, { status: 500 });
  }
}
