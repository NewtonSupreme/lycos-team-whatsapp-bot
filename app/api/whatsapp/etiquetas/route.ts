import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/**
 * Qué está pasando con cada cliente que escribe, para etiquetar su chat.
 *
 * La lista de conversaciones sin etiquetas obliga a abrir una por una para
 * saber cuál espera un presupuesto y cuál tiene el carro dentro. La etiqueta se
 * saca de lo que de verdad hay en el sistema, no del texto del mensaje:
 * adivinar por palabras da «cita» a quien escribió «no puedo ir a la cita».
 *
 * Se devuelven cuatro conjuntos de identificadores de cliente y la pantalla
 * decide la etiqueta con ellos. Es una petición para toda la lista, en vez de
 * una por conversación.
 */

const DIA = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface EtiquetasWhatsApp {
  /** Clientes con una orden abierta ahora mismo. */
  enTaller: string[];
  /** Clientes con una cita de hoy en adelante. */
  conCita: string[];
  /** Clientes con un presupuesto sin cerrar. */
  conPresupuesto: string[];
  /** Clientes con una venta en los últimos 30 días. */
  conVenta: string[];
  avisos: string[];
}

export async function GET(req: NextRequest) {
  const auth = await authorize('whatsapp', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoy = iso(new Date());
  const hace30 = iso(new Date(Date.now() - 30 * DIA));

  const conSede = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    (sede ? q.eq('sede_id', sede) : q);

  // Estados que significan «el carro está en el taller». Los terminales no
  // cuentan: un servicio completado hace un mes no es un cliente en taller.
  const ACTIVOS = ['pendiente', 'confirmada', 'en_revision', 'en_proceso', 'en_progreso'];

  const [rServ, rCitas, rPres, rVentas] = await Promise.all([
    conSede(auth.db.from('servicios').select('cliente_id')
      .in('estado', ACTIVOS).not('cliente_id', 'is', null).limit(3000)),
    conSede(auth.db.from('citas').select('cliente_id')
      .gte('fecha', hoy).not('cliente_id', 'is', null).limit(3000)),
    conSede(auth.db.from('presupuestos').select('cliente_id')
      .in('estado', ['borrador', 'enviado', 'aprobado'])
      .not('cliente_id', 'is', null).limit(3000)),
    conSede(auth.db.from('ventas_dia').select('cliente_id')
      .gte('fecha', hace30).not('cliente_id', 'is', null).limit(3000)),
  ]);

  const avisos: string[] = [];
  const ids = (
    r: { data: unknown; error: unknown }, que: string,
  ): string[] => {
    if (r.error) {
      // Se avisa en vez de devolver un conjunto vacío en silencio: sin la
      // etiqueta la lista sigue funcionando, pero hay que saber por qué falta.
      avisos.push(`No se pudieron leer ${que}.`);
      return [];
    }
    const filas = (r.data as { cliente_id: string | null }[]) || [];
    return [...new Set(filas.map(x => x.cliente_id).filter(Boolean) as string[])];
  };

  const salida: EtiquetasWhatsApp = {
    enTaller: ids(rServ, 'los servicios activos'),
    conCita: ids(rCitas, 'las citas'),
    conPresupuesto: ids(rPres, 'los presupuestos'),
    conVenta: ids(rVentas, 'las ventas'),
    avisos,
  };

  return NextResponse.json(salida);
}
