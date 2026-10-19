import { NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import { devolverInventarioDeOrden, type RenglonServicio } from '@/lib/inventario/descontar';
import { ESTADOS_QUE_VENCEN, HORAS_PARA_POR_CONFIRMAR } from '@/lib/servicios/columnas';

export const dynamic = 'force-dynamic';

/*
 * Lo que lleva 24 h en «Entrada» sin moverse pasa solo a «Por confirmar».
 *
 * Sin cron: el plan gratis de Vercel solo deja uno al día. Lo dispara la
 * pantalla de Servicios al abrirse, y como mucho una vez cada 10 minutos por
 * sede (el resto de llamadas vuelve al instante sin tocar la base). Así el
 * tablero siempre está al día cuando alguien lo mira, a coste casi cero.
 *
 * «Sin moverse» = `updated_at` viejo: cualquier cambio a la orden le da otras
 * 24 h. Los repuestos que la orden había sacado vuelven al almacén, igual que
 * al cancelarla a mano.
 */
const INTERVALO_MS = 10 * 60 * 1000;
const ultimaCorrida = new Map<string, number>();

export async function POST() {
  const auth = await authorize('servicios', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sede = auth.effectiveSede(null);
  const clave = sede || 'todas';
  const ahora = Date.now();
  if (ahora - (ultimaCorrida.get(clave) || 0) < INTERVALO_MS) {
    return NextResponse.json({ movidas: 0, omitido: true });
  }
  ultimaCorrida.set(clave, ahora);

  const limite = new Date(ahora - HORAS_PARA_POR_CONFIRMAR * 3600 * 1000).toISOString();
  let q = auth.db.from('servicios')
    .select('id, estado, items, seguimiento, placa, nombre_cliente')
    .in('estado', ESTADOS_QUE_VENCEN as unknown as string[])
    .lt('updated_at', limite)
    .limit(200);
  if (sede) q = q.eq('sede_id', sede);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let movidas = 0;
  const avisos: string[] = [];
  for (const orden of data || []) {
    const items: RenglonServicio[] = Array.isArray(orden.items) ? orden.items : [];
    let itemsFinales: RenglonServicio[] | undefined;
    if (items.length) {
      const r = await devolverInventarioDeOrden(auth.db, items);
      if (r.movimientos.length) itemsFinales = r.items;
      avisos.push(...r.avisos);
    }
    const marca = new Date().toISOString();
    const seguimiento = [
      ...(Array.isArray(orden.seguimiento) ? orden.seguimiento : []),
      { fecha: marca, accion: `Pasó a «Por confirmar»: ${HORAS_PARA_POR_CONFIRMAR} h en Entrada sin avanzar`, usuario: 'Sistema', tipo: 'sistema' },
    ];
    // Solo si sigue en Entrada: si alguien la movió mientras tanto, no se pisa.
    const { error: errUp, count } = await auth.db.from('servicios')
      .update({ estado: 'cancelada', seguimiento, updated_at: marca, ...(itemsFinales ? { items: itemsFinales } : {}) }, { count: 'exact' })
      .eq('id', orden.id)
      .in('estado', ESTADOS_QUE_VENCEN as unknown as string[]);
    if (errUp) { avisos.push(`${orden.placa || orden.id}: ${errUp.message}`); continue; }
    if (count) movidas += 1;
  }

  if (movidas > 0) {
    await logActivityServer(auth.db, {
      usuario: 'Sistema',
      modulo: 'Servicios',
      accion: 'Pasó entradas a Por confirmar',
      detalles: `${movidas} orden(es) con ${HORAS_PARA_POR_CONFIRMAR} h en Entrada sin avanzar`,
      referencia_tabla: 'servicios',
    });
  }
  return NextResponse.json({ movidas, avisos });
}
