import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import {
  ajustarInventarioDeOrden, devolverInventarioDeOrden, resumirMovimientos,
  type RenglonServicio,
} from '@/lib/inventario/descontar';

export const dynamic = 'force-dynamic';

/** Marca de las partidas creadas por el descuento; permite deshacerlas. */
const NOTA_DEL_INVENTARIO = 'Tomado del inventario al registrar el servicio.';

interface OrdenMinima {
  id: string;
  fecha?: string | null;
  placa?: string | null;
  vehiculo_id?: string | null;
  vehiculo_info?: string | null;
  cliente_id?: string | null;
  nombre_cliente?: string | null;
  sede_id?: string | null;
}

/**
 * Anota en la ficha del vehículo lo que costó cada repuesto de esta orden.
 *
 * Es la otra mitad del descuento: la pieza sale del almacén y el gasto tiene
 * que quedar cargado a ESE carro y a ESE servicio, o la utilidad por placa sale
 * inventada. Antes había que teclear cada renglón a mano en la ficha, así que
 * la tabla de partidas estaba vacía en todos los vehículos.
 *
 * Solo entran los renglones enlazados al inventario: de ellos se conoce el
 * costo real. La mano de obra no es un gasto de repuesto y no se anota aquí.
 *
 * Es idempotente por `(servicio_id, descripcion)`: guardar la orden diez veces
 * no crea diez partidas. Si el renglón cambió de cantidad o de precio, se
 * actualiza la que ya existe.
 */
async function anotarGastoEnLaFicha(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (t: string) => any },
  orden: OrdenMinima,
  items: readonly RenglonServicio[],
  usuario: string,
): Promise<string[]> {
  const avisos: string[] = [];
  if (!orden.vehiculo_id) {
    // Sin vehículo no hay ficha a la que cargarlo. Se avisa porque significa
    // que el repuesto salió y su gasto no quedó imputado a ningún carro.
    return ['El repuesto se descontó pero la orden no tiene vehículo, '
      + 'así que el gasto no se pudo cargar a ninguna ficha.'];
  }

  const repuestos = items.filter(x => x.inventario_id && !x.sin_descuento && Number(x.cantidad) > 0);
  if (repuestos.length === 0) return avisos;

  const { data: yaHay, error: errLeer } = await db
    .from('vehiculo_partidas')
    .select('id, descripcion')
    .eq('servicio_id', orden.id);

  if (errLeer) return ['No se pudo revisar la ficha del vehículo; el gasto del repuesto no se anotó.'];

  const clave = (t: unknown) => String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  const existentes = new Map<string, string>(
    ((yaHay || []) as { id: string; descripcion: string }[]).map(x => [clave(x.descripcion), x.id]),
  );

  for (const it of repuestos) {
    const cantidad = Number(it.cantidad) || 1;
    const fila = {
      vehiculo_id: orden.vehiculo_id,
      placa: orden.placa || null,
      vehiculo_info: orden.vehiculo_info || null,
      cliente_id: orden.cliente_id || null,
      cliente_nombre: orden.nombre_cliente || null,
      servicio_id: orden.id,
      fecha: (orden.fecha || new Date().toISOString()).slice(0, 10),
      descripcion: it.descripcion,
      tipo: 'repuesto',
      cantidad,
      precio_venta: Number(it.precio_unitario) || 0,
      costo: Number(it.costo_unitario) || 0,
      moneda: 'USD',
      // Lo puso el taller de su propio almacén, no el cliente.
      origen: 'taller',
      // Ya está pagado: la mercancía era del taller, no se le debe a nadie.
      estado_pago: 'pagado',
      nota: NOTA_DEL_INVENTARIO,
      registrado_por: usuario,
      sede_id: orden.sede_id || null,
      updated_at: new Date().toISOString(),
    };

    const idExistente = existentes.get(clave(it.descripcion));
    const { error } = idExistente
      ? await db.from('vehiculo_partidas').update(fila).eq('id', idExistente)
      : await db.from('vehiculo_partidas').insert(fila);

    if (error) avisos.push(`No se pudo anotar «${it.descripcion}» en la ficha del vehículo.`);
  }

  return avisos;
}

/**
 * Ajusta el inventario según los renglones de una orden de servicio.
 *
 * Se llama DESPUÉS de guardar la orden, nunca antes: así se descuenta contra lo
 * que de verdad quedó grabado, y una orden que no se pudo guardar no mueve el
 * almacén.
 *
 * El descuento se hace aquí y no en el navegador por dos razones: el stock lo
 * tocan varias pantallas a la vez, y la marca de «ya descontado» tiene que
 * escribirse junto al ajuste. Si el navegador descontara y luego fallara al
 * guardar la marca, el siguiente guardado volvería a restar.
 *
 * Llamarlo dos veces con la misma orden no hace nada la segunda vez.
 *
 *   POST { servicio_id }              → descuenta lo que falte por descontar
 *   POST { servicio_id, devolver:true } → regresa al almacén todo lo descontado
 */
export async function POST(req: NextRequest) {
  // El gate es «poder registrar el trabajo», no «administrar el almacén».
  // Exigir `inventario:editar` dejaba sin descontar justo al técnico que
  // registra la orden: el repuesto salía y el stock se quedaba igual, que es
  // exactamente lo que esto viene a arreglar.
  const auth = await authorize('servicios', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const puede = auth.can('inventario', 'editar')
    || auth.can('servicios', 'editar') || auth.can('servicios', 'crear')
    || auth.can('taller', 'editar') || auth.can('taller', 'crear');
  if (!puede) {
    return NextResponse.json({ error: 'Sin permiso para mover el inventario.' }, { status: 403 });
  }

  let cuerpo: { servicio_id?: string; devolver?: boolean };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const servicioId = String(cuerpo.servicio_id || '').trim();
  if (!servicioId) {
    return NextResponse.json({ error: 'Falta el identificador de la orden.' }, { status: 400 });
  }

  const { data: orden, error: errLeer } = await auth.db
    .from('servicios')
    .select('id, items, placa, estado, sede_id, fecha, vehiculo_id, vehiculo_info, cliente_id, nombre_cliente')
    .eq('id', servicioId)
    .maybeSingle();

  if (errLeer) return NextResponse.json({ error: errLeer.message }, { status: 500 });
  if (!orden) return NextResponse.json({ error: 'La orden no existe.' }, { status: 404 });

  const items: RenglonServicio[] = Array.isArray(orden.items) ? orden.items : [];
  if (items.length === 0) {
    return NextResponse.json({ movimientos: [], avisos: [], resumen: '' });
  }

  const resultado = cuerpo.devolver
    ? await devolverInventarioDeOrden(auth.db, items)
    : await ajustarInventarioDeOrden(auth.db, items);

  // La marca de lo descontado vive dentro del renglón, así que hay que
  // guardarla. Sin este paso el próximo guardado volvería a restar.
  if (resultado.movimientos.length > 0) {
    const { error: errGuardar } = await auth.db
      .from('servicios')
      .update({ items: resultado.items, updated_at: new Date().toISOString() })
      .eq('id', servicioId);

    if (errGuardar) {
      // Se avisa en vez de callar: el stock ya se movió y la marca no quedó,
      // así que alguien tiene que revisarlo antes de volver a guardar.
      return NextResponse.json({
        movimientos: resultado.movimientos,
        avisos: [
          ...resultado.avisos,
          'El stock se ajustó pero no se pudo dejar constancia en la orden. '
          + 'Revisa el inventario antes de volver a guardarla.',
        ],
        resumen: resumirMovimientos(resultado.movimientos),
      });
    }

    await logActivityServer(auth.db, {
      usuario: auth.user?.nombre || 'Sistema',
      modulo: 'Inventario',
      accion: cuerpo.devolver ? 'Devolución de repuestos' : 'Descuento por servicio',
      detalles: `Orden ${String(orden.placa || servicioId).slice(0, 12)} — ${resumirMovimientos(resultado.movimientos)}`,
      referencia_tabla: 'servicios',
      referencia_id: servicioId,
      sede_id: orden.sede_id ?? null,
    });
  }

  // El gasto del repuesto se carga al vehículo. Va fuera del bloque anterior a
  // propósito: si el stock ya estaba descontado pero la partida no llegó a
  // crearse, este paso la crea al volver a guardar en vez de no reintentarlo
  // nunca. Es idempotente, así que repetirlo no duplica nada.
  if (cuerpo.devolver) {
    // Una pieza que vuelve al almacén dejó de ser un gasto de ese carro.
    await auth.db.from('vehiculo_partidas').delete()
      .eq('servicio_id', servicioId)
      .eq('nota', NOTA_DEL_INVENTARIO);
  } else {
    resultado.avisos.push(
      ...await anotarGastoEnLaFicha(auth.db, orden, resultado.items, auth.user?.nombre || 'Sistema'),
    );
  }

  return NextResponse.json({
    movimientos: resultado.movimientos,
    avisos: resultado.avisos,
    resumen: resumirMovimientos(resultado.movimientos),
  });
}
