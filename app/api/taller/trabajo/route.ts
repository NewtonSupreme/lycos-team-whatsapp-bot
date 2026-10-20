import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { claveRenglon, ponerRenglonEnOrden } from '@/lib/ficha/sincronizar';
import { getPayrollService } from '@/lib/payroll/service';
import { contextoDeServicio, manoObraDeTrabajo } from '@/lib/nomina/servicio-nomina';
import { categoriaToZona, inferirCategoria } from '@/lib/categorias';
import { ajustarInventarioDeOrden, type RenglonServicio } from '@/lib/inventario/descontar';
import { getRoleMeta } from '@/types';
import { ESTADOS_PANTALLA, type TipoCarga } from '@/lib/taller/pantalla';

export const dynamic = 'force-dynamic';

const r2 = (x: number) => Math.round(x * 100) / 100;
const TIPO_TEXTO: Record<TipoCarga, string> = { mano_obra: 'mano de obra', repuesto: 'repuesto', otro: 'trabajo' };

/**
 * Un mecánico carga lo que hizo desde la pantalla del taller.
 *
 *   Body: { servicio_id, empleado_id, tipo: 'mano_obra'|'repuesto'|'otro',
 *           descripcion, cantidad, precio, inventario_id? }
 *
 * Hace lo mismo que la orden hecha a mano, en este orden:
 *   1. El renglón entra a la orden y el precio de la orden se recalcula. Si es
 *      un artículo del almacén, entra con su nombre y su costo y descuenta el
 *      stock (como en el formulario); si ya estaba en la orden, suma cantidad.
 *   2. El mecánico queda como encargado de la orden.
 *   3. La bitácora dice quién cargó qué y cuánto.
 *   4. Si es mano de obra, se crea su trabajo en la nómina (con las mismas
 *      reglas y topes que el resto del sistema). Repuestos no generan comisión.
 * Solo agrega: no borra ni cambia lo que otros cargaron.
 */
export async function POST(req: NextRequest) {
  const auth = await authorize('taller', 'editar');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 }); }
  const servicioId = String(b.servicio_id || '');
  const empleadoId = String(b.empleado_id || '');
  const inventarioId = b.inventario_id ? String(b.inventario_id) : null;
  const tipo: TipoCarga = inventarioId ? 'repuesto'
    : (['mano_obra', 'repuesto', 'otro'].includes(String(b.tipo)) ? b.tipo : 'mano_obra') as TipoCarga;
  const descripcion = String(b.descripcion || '').replace(/\s+/g, ' ').trim();
  const cantidad = Math.max(1, Math.min(100, Math.round(Number(b.cantidad) || 1)));
  const precioDado = b.precio !== undefined && b.precio !== null && b.precio !== '';
  const precio = r2(Number(b.precio) || 0);

  if (!servicioId || !empleadoId) return NextResponse.json({ error: 'Elige el vehículo y quién hizo el trabajo.' }, { status: 400 });
  if (!inventarioId && descripcion.length < 3) return NextResponse.json({ error: 'Describe el trabajo (mínimo 3 letras).' }, { status: 400 });
  if (precio < 0 || precio > 5000) return NextResponse.json({ error: 'El precio tiene que estar entre $0 y $5.000.' }, { status: 400 });

  const sede = auth.effectiveSede(null);
  const [{ data: orden }, { data: persona }] = await Promise.all([
    auth.db.from('servicios').select('id, estado, items, encargados, seguimiento, placa, vehiculo_info, nombre_cliente, categoria, descripcion, tipo, sede_id').eq('id', servicioId).maybeSingle(),
    auth.db.from('usuarios').select('id, nombre, alias, rol, activo, sede_id').eq('id', empleadoId).maybeSingle(),
  ]);
  if (!orden) return NextResponse.json({ error: 'La orden no existe.' }, { status: 404 });
  if (sede && orden.sede_id && orden.sede_id !== sede) return NextResponse.json({ error: 'La orden es de otra sede.' }, { status: 403 });
  if (!(ESTADOS_PANTALLA as readonly string[]).includes(orden.estado)) {
    return NextResponse.json({ error: 'Esa orden ya no está en el taller (está pagada o por confirmar).' }, { status: 409 });
  }
  if (!persona || persona.activo === false || !getRoleMeta(persona.rol)?.esTecnico) {
    return NextResponse.json({ error: 'Esa persona no está en el personal del taller.' }, { status: 400 });
  }

  const items = Array.isArray(orden.items) ? orden.items as RenglonServicio[] : [];
  let texto: string;
  let total: number;
  let totalOrden: number;
  const avisos: string[] = [];

  if (inventarioId) {
    // 1a · Artículo del almacén.
    const { data: art } = await auth.db.from('inventario')
      .select('id, nombre, precio_usd, precio_bs, precio_fabricante, stock, activo, sede_id').eq('id', inventarioId).maybeSingle();
    if (!art || art.activo === false) return NextResponse.json({ error: 'Ese artículo ya no está en el inventario.' }, { status: 404 });
    if (sede && art.sede_id && art.sede_id !== sede) return NextResponse.json({ error: 'Ese artículo es de otra sede.' }, { status: 403 });
    // Precio de efectivo, como el formulario de la orden (salvo que lo cambien).
    const unitario = precioDado ? precio : r2(Number(art.precio_usd) || Number(art.precio_bs) || 0);
    const previo = items.find(i => i.inventario_id === art.id && !i.sin_descuento);
    const nuevaCantidad = (previo ? Number(previo.cantidad) || 0 : 0) + cantidad;
    texto = previo?.descripcion || String(art.nombre).trim();
    total = r2(unitario * cantidad);
    const puesto = await ponerRenglonEnOrden(auth.db, servicioId, {
      descripcion: texto, cantidad: nuevaCantidad, precio_unitario: unitario, total: r2(unitario * nuevaCantidad),
      inventario_id: art.id, costo_unitario: Number(art.precio_fabricante) || 0, es_mano_obra: false, sin_descuento: false,
    }, previo?.descripcion);
    if (!puesto.ok) return NextResponse.json({ error: puesto.aviso || 'No se pudo cargar el repuesto.' }, { status: 500 });
    totalOrden = puesto.total;
    // Descuento de stock: la marca de lo ya descontado vive dentro del renglón.
    const { data: tras } = await auth.db.from('servicios').select('items').eq('id', servicioId).maybeSingle();
    const ajuste = await ajustarInventarioDeOrden(auth.db, (tras?.items || []) as RenglonServicio[]);
    if (ajuste.movimientos.length) await auth.db.from('servicios').update({ items: ajuste.items }).eq('id', servicioId);
    avisos.push(...ajuste.avisos);
    if ((Number(art.stock) || 0) < cantidad) avisos.push(`En el almacén quedaban ${Number(art.stock) || 0}: avisa para revisar el inventario.`);
  } else {
    // 1b · Texto libre. Dos mecánicos pueden cargar «Soldadura»: el segundo no
    //      pisa al primero, se le agrega su nombre. No mueve stock.
    const ocupadas = new Set(items.map(i => claveRenglon(String(i.descripcion || ''))));
    const quien = String(persona.alias || persona.nombre).split(/\s+/)[0];
    texto = descripcion;
    if (ocupadas.has(claveRenglon(texto))) texto = `${descripcion} (${quien})`;
    for (let k = 2; ocupadas.has(claveRenglon(texto)); k++) texto = `${descripcion} (${quien} ${k})`;
    total = r2(precio * cantidad);
    const puesto = await ponerRenglonEnOrden(auth.db, servicioId, {
      descripcion: texto, cantidad, precio_unitario: precio, total,
      es_mano_obra: tipo === 'mano_obra', sin_descuento: true,
    });
    if (!puesto.ok) return NextResponse.json({ error: puesto.aviso || 'No se pudo cargar el trabajo.' }, { status: 500 });
    totalOrden = puesto.total;
  }

  // 2 y 3 · Encargado y bitácora (se lee de nuevo: el paso 1 cambió la orden).
  const { data: fresca } = await auth.db.from('servicios').select('encargados, seguimiento').eq('id', servicioId).maybeSingle();
  const encargados = Array.isArray(fresca?.encargados) ? [...fresca!.encargados as Array<{ empleado_id?: string }>] : [];
  if (!encargados.some(e => e?.empleado_id === persona.id)) {
    encargados.push({ nombre: persona.nombre, empleado_id: persona.id, texto_original: 'Pantalla del taller' } as never);
  }
  const ahora = new Date().toISOString();
  const seguimiento = [
    ...(Array.isArray(fresca?.seguimiento) ? fresca!.seguimiento : []),
    {
      fecha: ahora, tipo: 'taller', usuario: `${persona.nombre} · pantalla del taller`,
      accion: `${persona.nombre} cargó ${TIPO_TEXTO[tipo]}: ${texto}${cantidad > 1 ? ` × ${cantidad}` : ''} — $${total.toFixed(2)}`,
    },
  ];
  await auth.db.from('servicios').update({ encargados, seguimiento, updated_at: ahora }).eq('id', servicioId);

  // 4 · Nómina: la mano de obra genera el trabajo del mecánico.
  let nomina: string | null = null;
  if (tipo === 'mano_obra' && total > 0) {
    try {
      const ctx = await contextoDeServicio(auth.db, servicioId);
      if (ctx.existe && !ctx.cancelada && total <= ctx.topeUSD) {
        const zona = categoriaToZona(orden.categoria || inferirCategoria(`${orden.descripcion || ''} ${orden.tipo || ''}`));
        const res = await getPayrollService(auth.db).createJobAssignment({
          empleado_id: persona.id, es_taller: false, zona, tipo_trabajo: null,
          descripcion: texto, cantidad, ingreso_total: total,
          mano_obra: manoObraDeTrabajo(ctx, { descripcion: texto, ingreso_total: total, mano_obra: total }),
          moneda: 'USD', fecha: ctx.fechaTrabajo || undefined,
          referencia_tabla: 'servicios', referencia_id: servicioId,
          cliente: orden.nombre_cliente || null, vehiculo: orden.vehiculo_info || null, placa: orden.placa || null,
          sede_id: orden.sede_id || sede, created_by: `${persona.nombre} (pantalla del taller)`,
        });
        // La pantalla la ve todo el taller: no se muestra cuánto gana cada quien.
        nomina = res.executor ? 'Quedó en tu nómina' : 'Registrado en nómina';
      } else {
        nomina = 'No se registró en nómina: revisa el monto de la orden.';
      }
    } catch (e) {
      nomina = `No se pudo registrar en nómina: ${(e as Error).message}`;
    }
  }

  await logActivityServer(auth.db, {
    usuario: `${persona.nombre} (pantalla del taller)`, modulo: 'Taller', accion: `Cargó ${TIPO_TEXTO[tipo]}`,
    detalles: `${orden.placa || ''} · ${texto} · $${total.toFixed(2)}`, referencia_tabla: 'servicios', referencia_id: servicioId,
    sede_id: orden.sede_id || sede,
  });
  return NextResponse.json({ ok: true, renglon: texto, total, totalOrden, nomina, avisos });
}
