import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { claveRenglon, ponerRenglonEnOrden } from '@/lib/ficha/sincronizar';
import { getPayrollService } from '@/lib/payroll/service';
import { contextoDeServicio, manoObraDeTrabajo } from '@/lib/nomina/servicio-nomina';
import { categoriaToZona, inferirCategoria } from '@/lib/categorias';
import { getRoleMeta } from '@/types';
import { ESTADOS_PANTALLA, type TipoCarga } from '@/lib/taller/pantalla';

export const dynamic = 'force-dynamic';

const r2 = (x: number) => Math.round(x * 100) / 100;
const TIPO_TEXTO: Record<TipoCarga, string> = { mano_obra: 'mano de obra', repuesto: 'repuesto', otro: 'trabajo' };

/**
 * Un mecánico carga lo que hizo desde la pantalla del taller.
 *
 *   Body: { servicio_id, empleado_id, tipo: 'mano_obra'|'repuesto'|'otro', descripcion, cantidad, precio }
 *
 * Hace lo mismo que la orden hecha a mano, en este orden:
 *   1. El renglón entra a la orden y el precio de la orden se recalcula.
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
  const tipo = (['mano_obra', 'repuesto', 'otro'].includes(String(b.tipo)) ? b.tipo : 'mano_obra') as TipoCarga;
  const descripcion = String(b.descripcion || '').replace(/\s+/g, ' ').trim();
  const cantidad = Math.max(1, Math.min(100, Math.round(Number(b.cantidad) || 1)));
  const precio = r2(Number(b.precio) || 0);

  if (!servicioId || !empleadoId) return NextResponse.json({ error: 'Elige el vehículo y quién hizo el trabajo.' }, { status: 400 });
  if (descripcion.length < 3) return NextResponse.json({ error: 'Describe el trabajo (mínimo 3 letras).' }, { status: 400 });
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

  // 1 · El renglón. Dos mecánicos pueden cargar «Soldadura»: el segundo no pisa
  //     al primero, se le agrega su nombre.
  const items = Array.isArray(orden.items) ? orden.items as Array<{ descripcion?: string }> : [];
  const ocupadas = new Set(items.map(i => claveRenglon(String(i.descripcion || ''))));
  const quien = String(persona.alias || persona.nombre).split(/\s+/)[0];
  let texto = descripcion;
  if (ocupadas.has(claveRenglon(texto))) texto = `${descripcion} (${quien})`;
  for (let k = 2; ocupadas.has(claveRenglon(texto)); k++) texto = `${descripcion} (${quien} ${k})`;
  const total = r2(precio * cantidad);
  const puesto = await ponerRenglonEnOrden(auth.db, servicioId, {
    descripcion: texto, cantidad, precio_unitario: precio, total,
    es_mano_obra: tipo === 'mano_obra',
    // Texto libre desde el piso: no sale del almacén, no mueve stock.
    sin_descuento: true,
  });
  if (!puesto.ok) return NextResponse.json({ error: puesto.aviso || 'No se pudo cargar el trabajo.' }, { status: 500 });

  // 2 y 3 · Encargado y bitácora.
  const encargados = Array.isArray(orden.encargados) ? [...orden.encargados as Array<{ empleado_id?: string }>] : [];
  if (!encargados.some(e => e?.empleado_id === persona.id)) {
    encargados.push({ nombre: persona.nombre, empleado_id: persona.id, texto_original: 'Pantalla del taller' } as never);
  }
  const ahora = new Date().toISOString();
  const seguimiento = [
    ...(Array.isArray(orden.seguimiento) ? orden.seguimiento : []),
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
  return NextResponse.json({ ok: true, renglon: texto, totalOrden: puesto.total, nomina });
}
