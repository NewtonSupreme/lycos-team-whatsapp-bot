import { binsDeColumnas, lineasDeMetodos, lineasDePago, type LineaPago } from '@/lib/pagos/desglose';
import { BANK_BIN_IDS } from '@/lib/reporte/ventas-mapping';
import { mecanicoDeOrden, servicioDeNotas } from '@/lib/facturas/mecanico';

/**
 * Lo que toda factura o nota de entrega tiene que llevar, se genere donde se
 * genere: quién hizo el trabajo y cómo pagó el cliente.
 *
 * Cada pantalla que imprime una factura —Servicios, Reportes, Facturación, el
 * punto de venta— arma los datos a su manera, y ninguna traía el mecánico ni el
 * cobro por banco. En vez de enseñárselo a las siete, el propio generador
 * completa lo que falte buscándolo por la orden o por la venta. Lo que la
 * pantalla ya traiga, manda.
 */
export interface Completable {
  id?: string;
  servicio_id?: string | null;
  venta_id?: string | null;
  referencia_id?: string | null;
  referencia_tabla?: string | null;
  notas?: string | null;
  mecanico?: string | null;
  metodos_pago?: Record<string, unknown> | null;
  pagos?: LineaPago[];
  tasa_pago?: number | null;
  tasa_bcv?: number | null;
  tasa_cambio?: number | null;
  /** El día en que el vehículo entró al taller. */
  fecha_entrada?: string | null;
  /** El día en que la venta quedó pagada, si ya lo está. */
  fecha_pago?: string | null;
  abonos?: unknown;
  [k: string]: unknown;
}

const conDinero = (lineas: LineaPago[]) => lineas.length > 0;

export async function completarFactura<T extends Completable>(d: T): Promise<T> {
  const out: T = { ...d };
  const tasa = Number(d.tasa_pago) || Number(d.tasa_cambio) || Number(d.tasa_bcv) || 0;

  // Las líneas que ya se pueden sacar de lo que trae la pantalla: las columnas
  // de una fila de ventas_dia (Reportes pasa la fila entera) o su metodos_pago.
  let pagos: LineaPago[] = d.pagos || [];
  if (!conDinero(pagos) && BANK_BIN_IDS.some(k => Number(d[k]) > 0)) {
    pagos = lineasDePago(binsDeColumnas(d as Record<string, unknown>), tasa);
  }
  const lineasPropias = lineasDeMetodos(d.metodos_pago || null, tasa);
  // Solo se da por buena si son cuentas exactas: una clave genérica
  // (`efectivo_usd`) puede ser el «efectivo por defecto» de antes, y la venta
  // guardada sabe más.
  const exactas = lineasPropias.length > 0 && lineasPropias.every(l => !l.generica);
  if (!conDinero(pagos) && exactas) pagos = lineasPropias;

  // El cliente de la base se carga aquí y no arriba: el generador de PDF no
  // tiene por qué arrastrar la sesión y la sede para dibujar una factura, y
  // fuera del navegador (las pruebas) basta con lo que trae la pantalla.
  let supabase: typeof import('@/lib/supabase')['supabase'] = null;
  try { ({ supabase } = await import('@/lib/supabase')); } catch { supabase = null; }
  if (!supabase) {
    out.pagos = conDinero(pagos) ? pagos : lineasPropias;
    return out;
  }

  const servicioId = d.servicio_id
    || (d.referencia_tabla === 'servicios' ? d.referencia_id : null)
    || servicioDeNotas(d.notas)
    || null;
  const ventaId = d.venta_id
    || (d.referencia_tabla === 'ventas_dia' ? d.referencia_id : null)
    || null;

  try {
    const [orden, trabajos, venta] = await Promise.all([
      servicioId
        ? supabase.from('servicios').select('notas, seguimiento, metodos_pago, tasa_cambio, fecha, hora, fecha_inicio, created_at')
          .eq('id', servicioId).maybeSingle()
        : Promise.resolve({ data: null }),
      servicioId || ventaId
        ? supabase.from('job_assignments').select('empleado_nombre, es_taller')
          .in('referencia_id', [servicioId, ventaId].filter(Boolean) as string[])
        : Promise.resolve({ data: [] }),
      // La venta siempre: además del cobro dice cuándo quedó pagada.
      ventaId || servicioId
        ? (ventaId
          ? supabase.from('ventas_dia').select('*').eq('id', ventaId).maybeSingle()
          : supabase.from('ventas_dia').select('*')
            .or(`servicio_id.eq.${servicioId},notas.like.%[ServicioID: ${servicioId}]%`)
            .limit(1).maybeSingle())
        : Promise.resolve({ data: null }),
    ]);

    // ── Las fechas que el cliente pregunta ──────────────────────────────
    // Cuándo entró el carro y cuándo se pagó. Una venta del 21 cobrada el 25
    // imprimía solo el 21, y no había forma de ver en la factura el día del pago.
    const o = orden.data as { fecha?: string; created_at?: string } | null;
    if (!out.fecha_entrada && o) out.fecha_entrada = o.fecha || String(o.created_at || '').slice(0, 10) || null;
    const vFila = venta.data as Record<string, unknown> | null;
    if (vFila?.id) {
      const { data: abs } = await supabase.from('abonos')
        .select('monto, metodo_pago, created_at, fecha, saldo_despues')
        .eq('venta_id', vFila.id as string).order('created_at', { ascending: true });
      const lista = (abs || []) as Array<{ monto: number; metodo_pago: string | null; created_at: string; fecha: string | null; saldo_despues: number | null }>;
      if (!Array.isArray(out.abonos) || !(out.abonos as unknown[]).length) {
        if (lista.length) (out as Record<string, unknown>).abonos = lista.map(a => ({ ...a, created_at: a.fecha || a.created_at }));
      }
      const saldo = Number(vFila.saldo_pendiente) || 0;
      if (!out.fecha_pago && saldo <= 0.009) {
        out.fecha_pago = (vFila.fecha_pago as string)
          || (lista.length ? (lista[lista.length - 1].fecha || String(lista[lista.length - 1].created_at).slice(0, 10)) : null)
          || (vFila.fecha as string) || null;
      }
    }

    if (!out.mecanico) {
      out.mecanico = mecanicoDeOrden({
        trabajos: (trabajos.data as Array<{ empleado_nombre: string; es_taller: boolean }>) || [],
        notas: (orden.data as { notas?: string } | null)?.notas ?? null,
        seguimiento: (orden.data as { seguimiento?: unknown } | null)?.seguimiento,
      });
    }

    if (!conDinero(pagos)) {
      const v = venta.data as Record<string, unknown> | null;
      const tv = Number(v?.tasa_cambio) || tasa;
      if (v && BANK_BIN_IDS.some(k => Number(v[k]) > 0)) {
        pagos = lineasDePago(binsDeColumnas(v), tv);
      } else {
        const o = orden.data as { metodos_pago?: Record<string, unknown>; tasa_cambio?: number } | null;
        const deOrden = lineasDeMetodos(o?.metodos_pago || null, Number(o?.tasa_cambio) || tasa);
        pagos = conDinero(deOrden) ? deOrden
          : v ? lineasDeMetodos(v.metodos_pago as Record<string, unknown>, tv)
            : lineasPropias;
      }
    }
  } catch (e) {
    // Una factura nunca deja de salir porque falle esta consulta: sale con lo
    // que traía la pantalla.
    console.error('No se pudo completar la factura:', e);
    if (!conDinero(pagos)) pagos = lineasPropias;
  }

  out.pagos = pagos;
  return out;
}
