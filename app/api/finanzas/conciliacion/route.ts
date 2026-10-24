import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/auth-server';
import { logActivityServer } from '@/lib/activity-server';
import {
  BANCOS_CONCILIABLES, PlantillaInvalida, leerEstadoDeCuenta,
  type BancoConciliable, type EstadoLeido,
} from '@/lib/conciliacion/leer-estado';
import { CUENTAS_DEL_BANCO, conciliar } from '@/lib/conciliacion/motor';
import { cargarSistema } from '@/lib/conciliacion/sistema';

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
  try {
    const a = await leer('archivo');
    if (!a) return NextResponse.json({ error: 'Adjunta el estado de cuenta.' }, { status: 400 });
    nombreArchivo = a.nombre;
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

  try {
    const cuentas = CUENTAS_DEL_BANCO[bancoEfectivo] || CUENTAS_DEL_BANCO[banco];
    const sistema = await cargarSistema(auth.db, {
      desde: mas(estado.desde, -margen), hasta: mas(estado.hasta, margen), sede,
      cuentas, banco: bancoEfectivo,
    });
    const resultado = conciliar(estado, sistema, cruce);
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
        generadoPor: auth.user?.nombre || '',
        generadoEn: new Date().toISOString(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo conciliar: ${(e as Error).message}` }, { status: 500 });
  }
}
