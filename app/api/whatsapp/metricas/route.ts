import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

/**
 * Las cinco cifras de la cabecera de WhatsApp.
 *
 * Todas son del MISMO día y se comparan con el anterior. Mezclar ventanas
 * —conversaciones de hoy contra ventas del mes— daría cinco tarjetas que
 * parecen comparables y no lo son, que es la peor clase de panel.
 *
 * Lo que mide cada una:
 *   · Conversaciones — chats con actividad hoy, no chats existentes.
 *   · Nuevos clientes — fichas creadas hoy.
 *   · Citas agendadas y presupuestos — creados hoy.
 *   · Ventas cerradas — ventas registradas hoy.
 *
 * No se pretende que todas vengan del chat: el taller también agenda y cobra
 * por el mostrador. Es el pulso del día, y así se dice en la pantalla.
 */

const DIA = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface MetricaWhatsApp {
  clave: string;
  valor: number;
  /** Variación contra el día anterior. `null` si no hay con qué comparar. */
  variacion: number | null;
}

export interface MetricasWhatsApp {
  fecha: string;
  metricas: MetricaWhatsApp[];
  /** Conversaciones con mensajes sin leer, para el chip de «No leídas». */
  sinLeer: number;
  /** Total de conversaciones, para el chip de «Todas». */
  total: number;
  avisos: string[];
}

export async function GET(req: NextRequest) {
  const auth = await authorize('whatsapp', 'leer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const sede = auth.effectiveSede(url.searchParams.get('sede'));
  const hoyD = new Date();
  const hoy = url.searchParams.get('fecha') || iso(hoyD);
  const ayer = iso(new Date(new Date(`${hoy}T00:00:00`).getTime() - DIA));

  // Los límites del día en tiempo absoluto, para las tablas que guardan
  // `timestamptz` en vez de una fecha suelta.
  const desdeHoy = `${hoy}T00:00:00`;
  const desdeAyer = `${ayer}T00:00:00`;

  /** Cuenta filas sin traérselas: `head` pide solo el total. */
  const contar = async (
    tabla: string, columnaFecha: string, desde: string, hasta: string,
    extra?: (q: ReturnType<typeof queryBase>) => ReturnType<typeof queryBase>,
  ): Promise<number | null> => {
    let q = queryBase(tabla).gte(columnaFecha, desde).lt(columnaFecha, hasta);
    if (sede) q = q.eq('sede_id', sede);
    if (extra) q = extra(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function queryBase(tabla: string): any {
    return auth.db.from(tabla).select('id', { count: 'exact', head: true });
  }

  const finHoy = `${iso(new Date(new Date(`${hoy}T00:00:00`).getTime() + DIA))}T00:00:00`;

  const [
    convHoy, convAyer,
    cliHoy, cliAyer,
    citHoy, citAyer,
    preHoy, preAyer,
    venHoy, venAyer,
    sinLeerRes, totalRes,
  ] = await Promise.all([
    contar('conversaciones', 'ultimo_mensaje_at', desdeHoy, finHoy),
    contar('conversaciones', 'ultimo_mensaje_at', desdeAyer, desdeHoy),
    contar('clientes', 'created_at', desdeHoy, finHoy),
    contar('clientes', 'created_at', desdeAyer, desdeHoy),
    contar('citas', 'created_at', desdeHoy, finHoy),
    contar('citas', 'created_at', desdeAyer, desdeHoy),
    contar('presupuestos', 'created_at', desdeHoy, finHoy),
    contar('presupuestos', 'created_at', desdeAyer, desdeHoy),
    // Las ventas llevan `fecha` (un día), no marca de tiempo.
    (async () => {
      let q = queryBase('ventas_dia').eq('fecha', hoy);
      if (sede) q = q.eq('sede_id', sede);
      const { count, error } = await q;
      return error ? null : (count ?? 0);
    })(),
    (async () => {
      let q = queryBase('ventas_dia').eq('fecha', ayer);
      if (sede) q = q.eq('sede_id', sede);
      const { count, error } = await q;
      return error ? null : (count ?? 0);
    })(),
    (async () => {
      let q = queryBase('conversaciones').gt('mensajes_sin_leer', 0);
      if (sede) q = q.eq('sede_id', sede);
      const { count, error } = await q;
      return error ? null : (count ?? 0);
    })(),
    (async () => {
      let q = queryBase('conversaciones');
      if (sede) q = q.eq('sede_id', sede);
      const { count, error } = await q;
      return error ? null : (count ?? 0);
    })(),
  ]);

  const avisos: string[] = [];
  const variacion = (a: number | null, b: number | null): number | null => {
    // Sin base no hay porcentaje: un «+100% porque ayer fue cero» no informa.
    if (a == null || b == null || !b) return null;
    return Math.round(((a - b) / Math.abs(b)) * 100);
  };

  const arma = (clave: string, a: number | null, b: number | null): MetricaWhatsApp => {
    if (a == null) avisos.push(`No se pudo contar «${clave}».`);
    return { clave, valor: a ?? 0, variacion: variacion(a, b) };
  };

  const salida: MetricasWhatsApp = {
    fecha: hoy,
    metricas: [
      arma('conversaciones', convHoy, convAyer),
      arma('clientes_nuevos', cliHoy, cliAyer),
      arma('citas', citHoy, citAyer),
      arma('presupuestos', preHoy, preAyer),
      arma('ventas', venHoy, venAyer),
    ],
    sinLeer: sinLeerRes ?? 0,
    total: totalRes ?? 0,
    avisos,
  };

  return NextResponse.json(salida);
}
