// ─────────────────────────────────────────────────────────────────────────────
// Lector de estados de cuenta: Banesco, BNC, Banco Exterior y Cashea.
//
// Cada banco exporta distinto (comprobado con los archivos reales de sept/oct
// 2026):
//   · Banesco  → tabla HTML con extensión .xls, UTF-8.
//                Fecha AAAA/MM/DD · Referencia · Descripción · Monto (+/-) · Balance
//   · BNC      → Excel binario (.xls) «rpt_TransactionsCustom_List».
//                Fecha DD/MM/AAAA · código · tipo · operación · descripción ·
//                referencia · Debe · Haber · Saldo, con fila «Totales».
//   · Exterior → HTML Latin-1, UNA tabla por movimiento.
//                cuenta · Fecha MM/DD/AAAA · 001 · descripción · referencia ·
//                monto (+/-) · saldo
//   · Cashea   → .xlsx con las cuotas cobradas (VES y USD, tasa, orden, factura).
//
// El lector valida la plantilla: si el archivo no es del banco elegido, lo dice
// y no sigue. Después comprueba la integridad: el saldo de cada fila tiene que
// ser el anterior más el movimiento, al céntimo. Si una fila falta o se alteró,
// se ve ahí antes de conciliar nada.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx';

import { BANCOS_CONCILIABLES, type BancoConciliable } from './bancos';

export { BANCOS_CONCILIABLES, type BancoConciliable };

/** Qué es cada movimiento del banco. Decide con qué se compara en el sistema. */
export type ClaseMovimiento =
  | 'cobro_pago_movil' | 'cobro_transferencia' | 'cobro_punto' | 'liquidacion_cashea'
  | 'pago_pago_movil' | 'pago_transferencia' | 'compra_pos'
  | 'comision' | 'impuesto' | 'interes' | 'reverso'
  | 'traspaso_interno' | 'otro_credito' | 'otro_debito'
  | 'cuota_cashea';

export interface MovimientoBanco {
  /** Fila del archivo (1 = primer movimiento), para poder ir a buscarla. */
  fila: number;
  fecha: string;            // AAAA-MM-DD
  referencia: string;
  descripcion: string;
  detalle: string;
  /** + entra, − sale. En bolívares (Cashea: bolívares pagados). */
  monto: number;
  saldo: number | null;
  clase: ClaseMovimiento;
  /** Cédula o RIF que aparece en la descripción, si hay. */
  documento: string | null;
  // Solo Cashea
  usd?: number;
  tasa?: number;
  /** Primera cuota que cubre el pago (0 = inicial). */
  cuota?: number;
  /** Todas las cuotas que cubre: un solo pago puede saldar la 2 y la 3 juntas. */
  cuotas?: number[];
  orden?: string;
  factura?: string;
}

export interface EstadoLeido {
  banco: BancoConciliable;
  titular: string | null;
  cuenta: string | null;
  desde: string;
  hasta: string;
  movimientos: MovimientoBanco[];
  saldoInicial: number | null;
  saldoFinal: number | null;
  totalCreditos: number;
  totalDebitos: number;
  /** Cada salto de saldo que no cuadra, fila por fila. Vacío = archivo íntegro. */
  saltosDeSaldo: Array<{ fila: number; esperado: number; enArchivo: number; diferencia: number }>;
  /** Totales que trae el propio archivo (BNC), contra los que sumamos nosotros. */
  totalesDelArchivo: { debitos: number; creditos: number; saldo: number } | null;
  avisos: string[];
}

export class PlantillaInvalida extends Error {
  constructor(mensaje: string, public detectado: BancoConciliable | null = null) { super(mensaje); }
}

/** RIF de Inversiones Lycos 7000: lo que entra o sale con él es entre cuentas propias. */
export const RIF_PROPIO = 'J505589709';

const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

/** «-1.234,56» / «+852.000,00» → número. Formato venezolano: punto de miles, coma decimal. */
function numeroEs(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\s|&nbsp;/g, '').replace(/^\+/, '');
  if (!s) return NaN;
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

/** Número que puede venir como 28533.45 (Cashea, BNC crudo). */
function numeroPlano(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) return numeroEs(s);
  return Number(s.replace(/,/g, ''));
}

const pad = (n: number) => String(n).padStart(2, '0');
function iso(a: number, m: number, d: number): string {
  if (!a || m < 1 || m > 12 || d < 1 || d > 31) throw new Error('fecha');
  return `${a}-${pad(m)}-${pad(d)}`;
}

function documentoDe(texto: string): string | null {
  const m = texto.toUpperCase().match(/\b([VJEGP])-?0*(\d{6,9})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

// ── Detección de plantilla ──────────────────────────────────────────────────

function esHtml(buf: Buffer): boolean {
  return /<\s*(html|table)/i.test(buf.subarray(0, 400).toString('latin1'));
}

function decodificarHtml(buf: Buffer): string {
  const utf = buf.toString('utf8');
  return utf.includes('�') ? buf.toString('latin1') : utf;
}

/** Qué banco es el archivo, mirando su estructura (no el nombre). */
export function detectarBanco(buf: Buffer): BancoConciliable | null {
  if (esHtml(buf)) {
    const t = decodificarHtml(buf);
    if (/<b>\s*Fecha\s*<\/b>[\s\S]{0,200}Referencia[\s\S]{0,200}Descripci[oó]n[\s\S]{0,200}Monto[\s\S]{0,200}Balance/i.test(t)) return 'banesco';
    if (/<td>\s*'?0115\d{16}\s*<\/td>/.test(t)) return 'exterior';
    return null;
  }
  try {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: '', raw: true });
    const texto = filas.slice(0, 20).map(f => f.join('|')).join('\n');
    if (wb.SheetNames[0] === 'rpt_TransactionsCustom_List' || /MOVIMIENTOS ENTRE FECHAS/i.test(texto)) return 'bnc';
    const cab = (filas[0] || []).map(x => String(x).toLowerCase());
    if (cab.some(c => c.includes('cuota')) && cab.some(c => c.includes('orden')) && cab.some(c => c.includes('monto pagado en usd'))) return 'cashea';
  } catch { /* no es Excel */ }
  return null;
}

// ── Clasificación de cada movimiento ───────────────────────────────────────

function clasificar(banco: BancoConciliable, desc: string, detalle: string, monto: number): ClaseMovimiento {
  const d = `${desc} ${detalle}`.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const entra = monto > 0;
  if (/\bREV[.\s]|REVERSO|DEVOL/.test(d)) return 'reverso';
  if (/I\.?S\.?L\.?R|IMPUESTO|IGTF|RETENCION|SENIAT|COBIMP/.test(d)) return 'impuesto';
  if (/INTERES|INTS\.|INTABO/.test(d)) return 'interes';
  if (/COMISION|COM\.|^COM |COM TRF|COM PAGO|COMSERV|SERV MTTO|MANTENIMIENTO|MANT Y SERV|EMISION DE ESTADO|SMS|CANAL ELECT|USO CANAL|CM COMISION|DOMICILIA/.test(d)) return 'comision';
  if (d.includes(RIF_PROPIO) || /INVERSIONES LYCOS/.test(d)) return 'traspaso_interno';
  if (/GRUPO CASHEA|J-?501934070/.test(d)) return 'liquidacion_cashea';
  if (entra) {
    if (/PUNTO|POS|TDD|TDC|LIQ(UIDACION)? ?(TARJ|VENTA)|ABONO POS|VENTA (CON )?TARJETA/.test(d)) return 'cobro_punto';
    if (/PAGO ?MOVIL|PAGOMOVIL|P2C|PM /.test(d)) return 'cobro_pago_movil';
    if (/TRANSF|TRF|DEPOSITO|ABONO/.test(d)) return 'cobro_transferencia';
    return 'otro_credito';
  }
  if (/COMPRA(S)? POS|COMPRA POS/.test(d)) return 'compra_pos';
  if (/PAGO ?MOVIL|PAGOMOVIL/.test(d)) return 'pago_pago_movil';
  if (/TRANSF|TRF|CARGO/.test(d)) return 'pago_transferencia';
  void banco;
  return 'otro_debito';
}

// ── Lectores por banco ─────────────────────────────────────────────────────

function leerBanesco(buf: Buffer): Omit<EstadoLeido, 'banco' | 'desde' | 'hasta' | 'totalCreditos' | 'totalDebitos' | 'saltosDeSaldo' | 'saldoInicial' | 'saldoFinal'> {
  const wb = XLSX.read(decodificarHtml(buf), { type: 'string', raw: true });
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  const cab = (filas[0] || []).map(x => String(x).trim().toLowerCase());
  if (cab.join('|') !== 'fecha|referencia|descripción|monto|balance') {
    throw new PlantillaInvalida('La cabecera no es la de Banesco (Fecha · Referencia · Descripción · Monto · Balance).');
  }
  const movimientos: MovimientoBanco[] = [];
  const avisos: string[] = [];
  filas.slice(1).forEach((f, i) => {
    if (f.every(c => String(c).trim() === '')) return;
    const [fe, ref, desc, monto, saldo] = f.map(c => String(c).trim());
    const m = fe.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    const mn = numeroEs(monto); const sd = numeroEs(saldo);
    if (!m || !Number.isFinite(mn)) { avisos.push(`Fila ${i + 1}: no se pudo leer («${f.join(' | ')}»).`); return; }
    movimientos.push({
      fila: i + 1, fecha: iso(+m[1], +m[2], +m[3]), referencia: ref, descripcion: desc.replace(/\s+/g, ' '), detalle: '',
      monto: r2(mn), saldo: Number.isFinite(sd) ? r2(sd) : null,
      clase: clasificar('banesco', desc, '', mn), documento: documentoDe(desc),
    });
  });
  return { titular: 'INVERSIONES LYCOS 7000, C.A.', cuenta: null, movimientos, totalesDelArchivo: null, avisos };
}

function leerExterior(buf: Buffer): ReturnType<typeof leerBanesco> {
  // Una <table> por movimiento: se leen las celdas a mano.
  const html = decodificarHtml(buf);
  const tablas = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const movimientos: MovimientoBanco[] = [];
  const avisos: string[] = [];
  let cuenta: string | null = null;
  const crudas = tablas.map(t => (t.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
    .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim())
    .filter(c => c !== ''));
  // Fecha: el banco la da MM/DD/AAAA. Se confirma con los datos: si algún
  // primer número pasa de 12, el formato es DD/MM.
  const partes = crudas.map(c => (c[1] || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)).filter(Boolean) as RegExpMatchArray[];
  const ddmm = partes.some(p => +p[1] > 12);
  crudas.forEach((c, i) => {
    if (c.length < 6) { if (c.length) avisos.push(`Fila ${i + 1}: incompleta («${c.join(' | ')}»).`); return; }
    const [cta, fe, , desc, ref, monto, saldo] = c.length >= 7 ? c : [c[0], c[1], '', c[2], c[3], c[4], c[5]];
    cuenta = cuenta || cta.replace(/^'/, '');
    const m = fe.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const mn = numeroEs(monto); const sd = numeroEs(saldo);
    if (!m || !Number.isFinite(mn)) { avisos.push(`Fila ${i + 1}: no se pudo leer («${c.join(' | ')}»).`); return; }
    const [mes, dia] = ddmm ? [+m[2], +m[1]] : [+m[1], +m[2]];
    movimientos.push({
      fila: i + 1, fecha: iso(+m[3], mes, dia), referencia: ref, descripcion: desc.replace(/\s+/g, ' '), detalle: '',
      monto: r2(mn), saldo: Number.isFinite(sd) ? r2(sd) : null,
      clase: clasificar('exterior', desc, '', mn), documento: documentoDe(desc),
    });
  });
  if (!movimientos.length) throw new PlantillaInvalida('No se encontró ningún movimiento con el formato de Banco Exterior.');
  return { titular: 'INVERSIONES LYCOS 7000, C.A.', cuenta, movimientos, totalesDelArchivo: null, avisos };
}

function leerBnc(buf: Buffer): ReturnType<typeof leerBanesco> {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  const iCab = filas.findIndex(f => f.some(c => String(c).trim() === 'Fecha') && f.some(c => String(c).trim() === 'Debe') && f.some(c => String(c).trim() === 'Haber'));
  if (iCab < 0) throw new PlantillaInvalida('No se encontró la cabecera de BNC (Fecha · … · Debe · Haber · Saldo).');
  const cab = filas[iCab].map(c => String(c).replace(/\s+/g, ' ').trim());
  const col = (nombre: string) => cab.findIndex(c => c.toLowerCase() === nombre.toLowerCase());
  const cF = col('Fecha'), cOp = cab.findIndex(c => /tipo operaci/i.test(c)), cDesc = col('Descripción');
  const cRef = col('Referencia'), cDebe = col('Debe'), cHaber = col('Haber'), cSaldo = col('Saldo');
  const cTipo = cab.findIndex(c => /tipo transacci/i.test(c));
  let titular: string | null = null; let cuenta: string | null = null;
  filas.slice(0, iCab).forEach((f, i) => {
    const j = f.findIndex(c => String(c).trim() === 'Titular');
    if (j >= 0) { titular = String(filas[i + 1]?.[j] || '').trim() || null; cuenta = String(filas[i + 1]?.[f.findIndex(c => String(c).includes('Nro. Cuenta'))] || '').trim() || null; }
  });
  const movimientos: MovimientoBanco[] = [];
  const avisos: string[] = [];
  let totalesDelArchivo: EstadoLeido['totalesDelArchivo'] = null;
  filas.slice(iCab + 1).forEach((f, i) => {
    const fe = String(f[cF] ?? '').trim();
    if (!fe) return;
    if (/^totales$/i.test(fe)) {
      totalesDelArchivo = { debitos: r2(numeroPlano(f[cDebe])), creditos: r2(numeroPlano(f[cHaber])), saldo: r2(numeroPlano(f[cSaldo])) };
      return;
    }
    const m = fe.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const debe = numeroPlano(f[cDebe]) || 0; const haber = numeroPlano(f[cHaber]) || 0;
    if (!m) { avisos.push(`Fila ${i + 1}: fecha ilegible («${fe}»).`); return; }
    const op = String(f[cOp] ?? '').trim(); const desc = String(f[cDesc] ?? '').replace(/\s+/g, ' ').trim();
    const monto = r2(haber - debe);
    const tipo = String(f[cTipo] ?? '').trim();
    movimientos.push({
      fila: i + 1, fecha: iso(+m[3], +m[2], +m[1]), referencia: String(f[cRef] ?? '').trim(),
      descripcion: op || tipo, detalle: desc, monto, saldo: Number.isFinite(numeroPlano(f[cSaldo])) ? r2(numeroPlano(f[cSaldo])) : null,
      clase: clasificar('bnc', `${op} ${tipo}`, desc, monto), documento: documentoDe(desc),
    });
  });
  return { titular, cuenta, movimientos, totalesDelArchivo, avisos };
}

function leerCashea(buf: Buffer): ReturnType<typeof leerBanesco> {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
  const k = (f: Record<string, unknown>, nombre: string) => {
    const clave = Object.keys(f).find(x => x.trim().toLowerCase() === nombre.toLowerCase());
    return clave ? f[clave] : '';
  };
  const movimientos: MovimientoBanco[] = [];
  const avisos: string[] = [];
  let titular: string | null = null;
  filas.forEach((f, i) => {
    const fechaCruda = k(f, 'Fecha de Transaccion');
    const fecha = fechaCruda instanceof Date ? fechaCruda.toISOString().slice(0, 10)
      : typeof fechaCruda === 'number' ? XLSX.SSF.format('yyyy-mm-dd', fechaCruda)
        : String(fechaCruda).slice(0, 10);
    const ves = numeroPlano(k(f, 'Monto pagado en VES'));
    const usd = numeroPlano(k(f, 'Monto Pagado en USD'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(usd)) { avisos.push(`Fila ${i + 1}: no se pudo leer.`); return; }
    titular = titular || String(k(f, 'Cuenta') || '') || null;
    const cuotasPagadas = String(k(f, '# Cuota Pagada')).split(/[,;\s]+/).map(x => Number(x)).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    const nCuota = cuotasPagadas.length ? cuotasPagadas[0] : undefined;
    const nombreCuotas = !cuotasPagadas.length ? 'Cuota ?'
      : cuotasPagadas.length === 1 ? (nCuota === 0 ? 'Inicial' : `Cuota ${nCuota}`)
        : `Cuotas ${cuotasPagadas.slice(0, -1).join(', ')} y ${cuotasPagadas[cuotasPagadas.length - 1]}`;
    movimientos.push({
      fila: i + 1, fecha, referencia: String(k(f, '# Referencia')).trim(),
      // La cuota 0 es la inicial: se paga el día de la compra a la misma cuenta.
      descripcion: `${nombreCuotas} · orden ${k(f, '# Orden')}`,
      detalle: String(k(f, 'Método de pago')),
      monto: r2(Number.isFinite(ves) ? ves : 0), saldo: null, clase: 'cuota_cashea', documento: null,
      usd: r2(usd), tasa: numeroPlano(k(f, 'Tasa de Cambio')) || undefined,
      cuota: nCuota, cuotas: cuotasPagadas,
      orden: String(k(f, '# Orden')).trim(), factura: String(k(f, '# Factura')).trim(),
    });
  });
  if (!movimientos.length) throw new PlantillaInvalida('El archivo de Cashea no trae ninguna cuota legible.');
  return { titular, cuenta: null, movimientos, totalesDelArchivo: null, avisos };
}

// ── Entrada principal ──────────────────────────────────────────────────────

/**
 * Lee el archivo y lo valida contra la plantilla del banco elegido.
 * Lanza `PlantillaInvalida` si el archivo es de otro banco o no tiene el formato.
 */
export function leerEstadoDeCuenta(buf: Buffer, bancoElegido: BancoConciliable): EstadoLeido {
  const detectado = detectarBanco(buf);
  if (!detectado) {
    throw new PlantillaInvalida(`El archivo no tiene la plantilla de ${BANCOS_CONCILIABLES[bancoElegido].nombre}. Se espera: ${BANCOS_CONCILIABLES[bancoElegido].plantilla}.`);
  }
  if (detectado !== bancoElegido) {
    throw new PlantillaInvalida(`Este archivo es un estado de ${BANCOS_CONCILIABLES[detectado].nombre}, no de ${BANCOS_CONCILIABLES[bancoElegido].nombre}. Elige el banco correcto o sube el archivo que corresponde.`, detectado);
  }
  const base = detectado === 'banesco' ? leerBanesco(buf)
    : detectado === 'exterior' ? leerExterior(buf)
      : detectado === 'bnc' ? leerBnc(buf)
        : leerCashea(buf);

  // Orden cronológico estable (Banesco y Exterior ya vienen así; Cashea no).
  const movimientos = detectado === 'cashea'
    ? [...base.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila)
    : base.movimientos;
  if (!movimientos.length) throw new PlantillaInvalida('El archivo no trae movimientos.');

  // Integridad: saldo(n) = saldo(n−1) + monto(n), al céntimo.
  const saltosDeSaldo: EstadoLeido['saltosDeSaldo'] = [];
  for (let i = 1; i < movimientos.length; i++) {
    const a = movimientos[i - 1].saldo; const b = movimientos[i].saldo;
    if (a == null || b == null) continue;
    const esperado = r2(a + movimientos[i].monto);
    if (Math.abs(esperado - b) > 0.009) saltosDeSaldo.push({ fila: movimientos[i].fila, esperado, enArchivo: b, diferencia: r2(b - esperado) });
  }
  const primero = movimientos[0];
  const ultimo = movimientos[movimientos.length - 1];
  const saldoInicial = primero.saldo != null ? r2(primero.saldo - primero.monto) : null;
  const totalCreditos = r2(movimientos.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0));
  const totalDebitos = r2(movimientos.filter(m => m.monto < 0).reduce((s, m) => s - m.monto, 0));
  const avisos = [...base.avisos];
  const tot = base.totalesDelArchivo as EstadoLeido['totalesDelArchivo'];
  if (tot) {
    if (Math.abs(tot.creditos - totalCreditos) > 0.009) avisos.push(`Los créditos sumados (${totalCreditos}) no coinciden con el total del archivo (${tot.creditos}).`);
    if (Math.abs(tot.debitos - totalDebitos) > 0.009) avisos.push(`Los débitos sumados (${totalDebitos}) no coinciden con el total del archivo (${tot.debitos}).`);
  }
  const fechas = movimientos.map(m => m.fecha).sort();
  return {
    banco: detectado, titular: base.titular, cuenta: base.cuenta,
    desde: fechas[0], hasta: fechas[fechas.length - 1],
    movimientos, saldoInicial, saldoFinal: ultimo.saldo,
    totalCreditos, totalDebitos, saltosDeSaldo, totalesDelArchivo: tot, avisos,
  };
}
