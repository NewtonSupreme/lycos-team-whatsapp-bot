import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { PlantillaInvalida, leerEstadoDeCuenta } from '@/lib/conciliacion/leer-estado';
import { aplicarDescuento, enlazarFactura, guardarFichasOrdenes, prepararDescuento } from '@/lib/cashea/descontar';
import { esReporteOrdenesCashea, leerOrdenesCashea } from '@/lib/cashea/ordenes-reporte';
import type { FichaOrden } from '@/lib/cashea/identificar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/*
 * Descontar las cuotas de Cashea a cada cliente desde el reporte de Cashea.
 *
 *   POST multipart: archivo (reporte de cuotas cobradas .xlsx), accion
 *     · previa  → qué pagos son nuevos, de qué venta es cada orden y qué falta decidir
 *     · aplicar → descuenta; `elecciones` = JSON { [clave de la orden]: venta_id }
 *
 * El archivo no se guarda. Lo aplicado queda en los cobros de cada venta (con
 * la referencia de Cashea en la nota) y en la bitácora.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'No llegó ningún archivo.' }, { status: 400 }); }
  const accion = String(form.get('accion') || 'previa');

  const auth = await authorize('ventas', accion === 'aplicar' ? 'editar' : 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sede = auth.effectiveSede(String(form.get('sede') || '') || null);

  const f = form.get('archivo');
  if (!f || typeof f === 'string') return NextResponse.json({ error: 'Adjunta el reporte de Cashea.' }, { status: 400 });
  if (f.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo pesa más de 5 MB: no parece el reporte de Cashea.' }, { status: 422 });

  const buf = Buffer.from(await f.arrayBuffer());

  // Otro reporte de Cashea (órdenes con cédula, cliente, teléfono…): se guarda lo que dice de
  // cada orden y con eso el sistema enlaza solo las órdenes con su venta.
  if (accion === 'ordenes' || esReporteOrdenesCashea(buf)) {
    const auth2 = await authorize('ventas', 'editar');
    if (!auth2.ok) return NextResponse.json({ error: auth2.error }, { status: auth2.status });
    const { fichas, avisos, columnas } = leerOrdenesCashea(buf);
    if (!fichas.length) return NextResponse.json({ error: 'No encontré órdenes en ese archivo. Debe traer una columna de orden y otra de cédula, cliente o teléfono.' }, { status: 422 });
    const r = await guardarFichasOrdenes(auth.db, fichas);
    await logActivityServer(auth.db, { usuario: auth.user!.nombre, modulo: 'Finanzas', accion: 'Reporte de órdenes de Cashea', detalles: `${fichas.length} orden(es) · ${r.nuevas} nueva(s) · columnas: ${columnas.join(', ')}`, referencia_tabla: 'configuracion', referencia_id: null, sede_id: sede });
    return NextResponse.json({ ordenes: { leidas: fichas.length, ...r, columnas, avisos } });
  }

  let estado;
  try {
    estado = leerEstadoDeCuenta(buf, 'cashea');
  } catch (e) {
    if (e instanceof PlantillaInvalida) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'No se pudo leer el reporte. ¿Es el que descarga el portal de comercios de Cashea, sin modificar?' }, { status: 422 });
  }

  // Cada reporte enseña: la inicial (cuota 0) es el día exacto de la compra de su orden, y la
  // factura de cada orden. Con eso se fechan mejor las órdenes que vengan después.
  const aprendidas: FichaOrden[] = [];
  for (const m of estado.movimientos) {
    if (!m.orden) continue;
    const esInicial = m.cuotas?.includes(0) && m.cuotas.length === 1;
    if (esInicial || m.factura || m.cedula || m.cliente) {
      aprendidas.push({ orden: m.orden, factura: m.factura || null, cedula: m.cedula || null, cliente: m.cliente || null, ...(esInicial ? { fecha: m.fecha, inicial: m.usd ?? null } : {}) });
    }
  }
  if (aprendidas.length) await guardarFichasOrdenes(auth.db, aprendidas).catch(() => null);

  if (accion !== 'aplicar') {
    return NextResponse.json(await prepararDescuento(auth.db, estado, sede), { headers: { 'Cache-Control': 'no-store' } });
  }

  let elecciones: Record<string, string | null> = {};
  try { elecciones = JSON.parse(String(form.get('elecciones') || '{}')); } catch { /* sin elecciones: solo las ya enlazadas */ }
  const r = await aplicarDescuento(auth.db, estado, sede, elecciones, auth.user!.nombre);
  await logActivityServer(auth.db, {
    usuario: auth.user!.nombre, modulo: 'Finanzas', accion: 'Cuotas de Cashea descontadas',
    detalles: `${r.aplicados.length} cuota(s), $${r.totalUSD.toFixed(2)} · ${r.enlazadas} orden(es) enlazada(s) · ${r.rechazados.length} sin aplicar · reporte del ${estado.desde} al ${estado.hasta}`,
    referencia_tabla: 'abonos', referencia_id: null, sede_id: sede,
  });
  return NextResponse.json(r);
}

/**
 * Anotar el número de factura que se puso en Cashea para una venta.
 *   PUT { venta_id, factura }   (factura vacía = quitarla)
 */
export async function PUT(req: NextRequest) {
  const auth = await authorize('ventas', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => ({}));
  const ventaId = String(b.venta_id || '');
  const factura = String(b.factura || '').trim().slice(0, 30);
  if (!ventaId) return NextResponse.json({ error: 'Falta la venta.' }, { status: 400 });
  const { data: v } = await auth.db.from('ventas_dia').select('id, cliente').eq('id', ventaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Esa venta ya no existe.' }, { status: 404 });
  const r = await enlazarFactura(auth.db, ventaId, factura, auth.user!.nombre);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true, factura: factura || null });
}
