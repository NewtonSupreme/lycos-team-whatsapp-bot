import * as XLSX from 'xlsx';
import { normKey, numeroPlano, parseFechaUniversal } from '@/lib/conciliacion/leer-estado';
import type { FichaOrden } from './identificar';

/*
 * Otros reportes de Cashea: el de órdenes / ventas / clientes, que trae por cada orden
 * quién compró (cédula, nombre, teléfono), cuándo y por cuánto. No trae cuotas, pero con
 * él el sistema sabe de qué cliente es cada orden y la enlaza sola con su venta.
 *
 * Como Cashea cambia los nombres de las columnas entre reportes, se buscan por lo que
 * significan y no por el texto exacto. Si un reporte trae el título en las primeras filas,
 * la cabecera se busca en las 15 primeras.
 */

const COLUMNAS: Record<keyof Omit<FichaOrden, 'orden'> | 'orden', string[]> = {
  orden: ['ordenid', 'idorden', 'idordencashea', 'nroorden', 'numeroorden', 'numerodeorden', 'orden', 'order', 'orderid'],
  cedula: ['cedula', 'cedulacliente', 'cedulaidentidad', 'documento', 'documentoidentidad', 'identificacion', 'nrodocumento', 'ci', 'dni', 'rif'],
  cliente: ['cliente', 'nombrecliente', 'nombreyapellido', 'nombrecompleto', 'nombre', 'comprador', 'usuario'],
  telefono: ['telefono', 'telefonocliente', 'celular', 'movil'],
  fecha: ['fechadecompra', 'fechacompra', 'fechaorden', 'fechadeorden', 'fechadelaorden', 'fechacreacion', 'fecha'],
  total: ['montototal', 'totalorden', 'montodelaorden', 'montoorden', 'montocompra', 'montodecompra', 'totalusd', 'total', 'monto'],
  inicial: ['montoinicial', 'inicialusd', 'inicial', 'pagoinicial'],
  financiado: ['montofinanciado', 'financiado', 'montoafinanciar'],
  factura: ['nrofactura', 'numerofactura', 'factura'],
};

function columna(cab: string[], campo: keyof typeof COLUMNAS): number {
  for (const alias of COLUMNAS[campo]) {
    const i = cab.findIndex(c => c === alias);
    if (i >= 0) return i;
  }
  // Coincidencia parcial («# Orden», «Cédula del cliente»), sin confundir «fecha tasa» con la de compra.
  for (const alias of COLUMNAS[campo]) {
    if (alias.length < 5) continue;
    const i = cab.findIndex(c => c.includes(alias) && !c.includes('tasa') && !c.includes('cuota'));
    if (i >= 0) return i;
  }
  return -1;
}

function cabecera(filas: unknown[][]): { i: number; cab: string[] } | null {
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const cab = (filas[i] || []).map(c => normKey(c));
    if (columna(cab, 'orden') >= 0 && (columna(cab, 'cedula') >= 0 || columna(cab, 'cliente') >= 0 || columna(cab, 'telefono') >= 0)) return { i, cab };
  }
  return null;
}

/** ¿Es un reporte de órdenes (con quién compró) y no el de cuotas cobradas? */
export function esReporteOrdenesCashea(buf: Buffer): boolean {
  try {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
    const c = cabecera(filas);
    return !!c && !c.cab.some(x => x.includes('cuotapagada'));
  } catch { return false; }
}

export function leerOrdenesCashea(buf: Buffer): { fichas: FichaOrden[]; avisos: string[]; columnas: string[] } {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const fichas: FichaOrden[] = []; const avisos: string[] = []; const columnas = new Set<string>();
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, defval: '', raw: true });
    const c = cabecera(filas);
    if (!c) continue;
    const idx = Object.fromEntries((Object.keys(COLUMNAS) as Array<keyof typeof COLUMNAS>).map(k => [k, columna(c.cab, k)])) as Record<keyof typeof COLUMNAS, number>;
    for (const [k, i] of Object.entries(idx)) if (i >= 0) columnas.add(k);
    const val = (f: unknown[], k: keyof typeof COLUMNAS) => (idx[k] >= 0 ? f[idx[k]] : '');
    const num = (f: unknown[], k: keyof typeof COLUMNAS) => { const x = numeroPlano(val(f, k)); return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null; };
    filas.slice(c.i + 1).forEach((f, j) => {
      const orden = String(val(f, 'orden') ?? '').replace(/\.0+$/, '').trim();
      if (!/^\d{5,}$/.test(orden)) { if (orden) avisos.push(`${nombre} fila ${c.i + j + 2}: orden «${orden}» no reconocida.`); return; }
      const ced = String(val(f, 'cedula') ?? '').trim();
      fichas.push({
        orden,
        cedula: ced || null,
        cliente: String(val(f, 'cliente') ?? '').trim() || null,
        telefono: String(val(f, 'telefono') ?? '').trim() || null,
        fecha: parseFechaUniversal(val(f, 'fecha')),
        total: num(f, 'total'), inicial: num(f, 'inicial'), financiado: num(f, 'financiado'),
        factura: String(val(f, 'factura') ?? '').trim() || null,
      });
    });
  }
  return { fichas, avisos: avisos.slice(0, 20), columnas: [...columnas] };
}
