// ─────────────────────────────────────────────────────────────────────────────
// PDF de la conciliación bancaria.
//
// Pensado para que lo lea alguien que no estuvo en la pantalla (el dueño, el
// contador): arriba el veredicto y la prueba de que cada bolívar del estado
// está explicado; después, cada diferencia con nombre, fecha, monto y qué
// hacer. Solo aparecen las secciones que tienen algo.
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RIF_TEXTO } from '@/lib/empresa';
import { BANCOS_CONCILIABLES } from '@/lib/conciliacion/bancos';
import type { MovimientoBanco } from '@/lib/conciliacion/leer-estado';
import { NOMBRE_CUENTA, REGLA_TEXTO, type AsientoSistema, type ResultadoConciliacion } from '@/lib/conciliacion/motor';

type RGB = [number, number, number];
const C = {
  negro: [15, 23, 42] as RGB, oscuro: [30, 41, 59] as RGB, gris: [71, 85, 105] as RGB, claro: [148, 163, 184] as RGB,
  borde: [226, 232, 240] as RGB, fondo: [248, 250, 252] as RGB, blanco: [255, 255, 255] as RGB,
  naranja: [249, 115, 22] as RGB, naranjaL: [255, 237, 213] as RGB,
  verde: [22, 163, 74] as RGB, verdeL: [220, 252, 231] as RGB,
  rojo: [220, 38, 38] as RGB, rojoL: [254, 226, 226] as RGB,
  ambar: [217, 119, 6] as RGB, ambarL: [254, 243, 199] as RGB,
  azul: [37, 99, 235] as RGB, azulL: [219, 234, 254] as RGB,
  morado: [124, 58, 237] as RGB, moradoL: [237, 233, 254] as RGB,
};

const num = (x: number, d = 2) => Number(x || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const bs = (x: number) => `Bs ${num(x)}`;
const usd = (x: number) => `$${num(x)}`;
const f = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const r2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;
const corto = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export interface MetaConciliacion {
  archivo: string;
  cruce: { banco: string; desde: string; hasta: string; movimientos: number } | null;
  generadoPor: string;
  generadoEn: string;
}

export function generarConciliacionPDF(r: ResultadoConciliacion, meta: MetaConciliacion, opciones?: { guardar?: (doc: jsPDF) => void }) {
  const doc = new jsPDF('p', 'mm', 'a4') as jsPDF & { lastAutoTable: { finalY: number } };
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = M;
  const banco = BANCOS_CONCILIABLES[r.banco];
  const esCashea = r.banco === 'cashea';
  const e = r.estado;

  const barra = () => { doc.setFillColor(...C.naranja); doc.rect(0, 0, W, 2.2, 'F'); };
  const asegurar = (alto: number) => { if (y + alto > H - 14) { doc.addPage(); barra(); y = M + 2; } };
  const texto = (t: string, x: number, yy: number, o: { t?: number; c?: RGB; b?: boolean; a?: 'left' | 'right' | 'center'; i?: boolean } = {}) => {
    doc.setFontSize(o.t ?? 8); doc.setTextColor(...(o.c ?? C.oscuro));
    doc.setFont('helvetica', o.b ? (o.i ? 'bolditalic' : 'bold') : (o.i ? 'italic' : 'normal'));
    doc.text(t, x, yy, { align: o.a ?? 'left' });
  };
  const seccion = (titulo: string, extra?: string, color: RGB = C.negro) => {
    asegurar(26);
    doc.setFillColor(...color); doc.roundedRect(M, y, W - M * 2, 7.5, 1.2, 1.2, 'F');
    texto(titulo.toUpperCase(), M + 3.5, y + 5, { t: 8, c: C.blanco, b: true });
    if (extra) texto(extra, W - M - 3.5, y + 5, { t: 7.5, c: C.blanco, b: true, a: 'right' });
    y += 10;
  };
  const explicacion = (t: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4); doc.setTextColor(...C.gris);
    const lineas = doc.splitTextToSize(t, W - M * 2);
    asegurar(lineas.length * 3.3 + 2);
    doc.text(lineas, M, y); y += lineas.length * 3.3 + 1.5;
  };
  const tabla = (head: string[], body: (string | number)[][], estilos: Record<number, object> = {}, color: RGB = C.oscuro, pie?: (string | number)[]) => {
    autoTable(doc, {
      startY: y, head: [head], body, foot: pie ? [pie] : undefined, theme: 'grid',
      headStyles: { fillColor: color, textColor: C.blanco, fontSize: 6.8, fontStyle: 'bold', cellPadding: 1.4 },
      bodyStyles: { fontSize: 6.8, cellPadding: 1.4, textColor: C.oscuro, lineColor: C.borde, valign: 'top' },
      footStyles: { fillColor: C.fondo, textColor: C.negro, fontSize: 7, fontStyle: 'bold', lineColor: C.borde },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: estilos, margin: { left: M, right: M },
      didDrawPage: () => barra(),
    });
    y = doc.lastAutoTable.finalY + 6;
  };
  // Monto del movimiento en su moneda (Cashea: USD y Bs).
  const montoMov = (m: MovimientoBanco) => (esCashea ? `${usd(m.usd || 0)}  (${bs(Math.abs(m.monto))})` : bs(Math.abs(m.monto)));
  const montoSis = (s: AsientoSistema) => (s.enDolares ? usd(s.monto) : bs(s.monto));

  // ── Encabezado ─────────────────────────────────────────────────────────
  barra();
  doc.setFillColor(...C.negro); doc.roundedRect(M, y, 62, 20, 2, 2, 'F');
  texto('LYCOS', M + 4, y + 9.5, { t: 16, c: C.naranja, b: true, i: true });
  texto('TEAM', M + 27, y + 9.5, { t: 16, c: C.blanco, b: true, i: true });
  texto(`MECÁNICA INTEGRAL · ${RIF_TEXTO}`, M + 4, y + 15.5, { t: 5.6, c: C.claro, b: true });
  texto('CONCILIACIÓN BANCARIA', W - M, y + 6.5, { t: 15, c: C.negro, b: true, a: 'right' });
  texto(`${banco.nombre}${e.cuenta ? ` · ${e.cuenta}` : ''}`, W - M, y + 12.5, { t: 9, c: C.naranja, b: true, a: 'right' });
  texto(`Del ${f(e.desde)} al ${f(e.hasta)} · ${r.totalMovimientos} movimientos`, W - M, y + 17.5, { t: 7.5, c: C.gris, a: 'right' });
  y += 25;

  doc.setFillColor(...C.fondo); doc.setDrawColor(...C.borde); doc.roundedRect(M, y, W - M * 2, 9, 1.5, 1.5, 'FD');
  texto(`Titular: ${e.titular || '—'}`, M + 3, y + 3.8, { t: 6.8, c: C.gris });
  texto(`Archivo: ${corto(meta.archivo, 48)}`, M + 3, y + 7.3, { t: 6.8, c: C.gris });
  texto(`Generado por ${meta.generadoPor || '—'} · ${new Date(meta.generadoEn).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`, W - M - 3, y + 3.8, { t: 6.8, c: C.gris, a: 'right' });
  texto(meta.cruce ? `Cruzado con ${BANCOS_CONCILIABLES[meta.cruce.banco as keyof typeof BANCOS_CONCILIABLES]?.nombre || meta.cruce.banco} (${meta.cruce.movimientos} mov.)` : 'Sin archivo de cruce', W - M - 3, y + 7.3, { t: 6.8, c: C.gris, a: 'right' });
  y += 13;

  // ── Veredicto ──────────────────────────────────────────────────────────
  const v = r.veredicto;
  const tono = v.cuadra ? { c: C.verde, l: C.verdeL } : { c: C.rojo, l: C.rojoL };
  const altoTit = 4 + v.titulares.length * 3.8;
  doc.setFillColor(...tono.l); doc.roundedRect(M, y, W - M * 2, 15 + altoTit, 2, 2, 'F');
  doc.setFillColor(...tono.c); doc.roundedRect(M, y, 3, 15 + altoTit, 1, 1, 'F');
  texto(v.cuadra ? 'CUADRA AL CÉNTIMO' : 'NO CUADRA', M + 7, y + 8, { t: 15, c: tono.c, b: true });
  texto(`${num(v.porcentaje, 1)}% de los movimientos conciliados`, M + 7, y + 13, { t: 8, c: C.oscuro, b: true });
  texto(v.cuadra ? 'Nada pendiente' : `${esCashea ? usd(v.enJuego) : bs(v.enJuego)} por aclarar`, W - M - 4, y + 8, { t: 12, c: tono.c, b: true, a: 'right' });
  texto('dinero que banco y sistema cuentan distinto', W - M - 4, y + 13, { t: 6.5, c: C.gris, a: 'right' });
  v.titulares.forEach((t, i) => texto(`·  ${t}`, M + 7, y + 19 + i * 3.8, { t: 7.4, c: C.oscuro }));
  y += 15 + altoTit + 5;

  // ── Cifras del estado ──────────────────────────────────────────────────
  const integro = e.saltosDeSaldo.length === 0;
  const cifras: Array<[string, string, RGB]> = esCashea
    ? [
      ['CUOTAS COBRADAS', String(r.totalMovimientos), C.negro],
      ['TOTAL EN DÓLARES', usd(r.ingresos.totalBanco), C.verde],
      ['TOTAL EN BOLÍVARES', bs(e.totalCreditos), C.negro],
      ['REGISTRADO EN SISTEMA', usd(r.ingresos.totalSistema), C.azul],
      ['ÓRDENES', String(r.ordenesCashea.length), C.morado],
      ['PERÍODO', `${f(e.desde).slice(0, 5)}–${f(e.hasta).slice(0, 5)}`, C.gris],
    ]
    : [
      ['SALDO INICIAL', bs(e.saldoInicial ?? 0), C.negro],
      ['ENTRADAS', `+${bs(e.totalCreditos)}`, C.verde],
      ['SALIDAS', `-${bs(e.totalDebitos)}`, C.rojo],
      ['SALDO FINAL', bs(e.saldoFinal ?? 0), C.negro],
      ['MOVIMIENTOS', String(r.totalMovimientos), C.azul],
      ['INTEGRIDAD', integro ? 'Saldo verificado' : `${e.saltosDeSaldo.length} salto(s)`, integro ? C.verde : C.rojo],
    ];
  const cw = (W - M * 2 - 5 * 2) / 6;
  cifras.forEach(([et, val, color], i) => {
    const x = M + i * (cw + 2);
    doc.setDrawColor(...C.borde); doc.setFillColor(...C.blanco); doc.roundedRect(x, y, cw, 15, 1.6, 1.6, 'FD');
    texto(et, x + 2.5, y + 4.8, { t: 5.6, c: C.claro, b: true });
    texto(val, x + 2.5, y + 11, { t: val.length > 16 ? 7.4 : 8.8, c: color, b: true });
  });
  y += 19;
  if (!esCashea) {
    explicacion(integro
      ? `Integridad: el saldo de cada una de las ${r.totalMovimientos} filas es el anterior más el movimiento, al céntimo. ${e.totalesDelArchivo ? 'Los totales coinciden con los que imprime el banco. ' : ''}El archivo está completo y sin alterar.`
      : `Atención: en ${e.saltosDeSaldo.length} fila(s) el saldo no es el anterior más el movimiento (fila ${e.saltosDeSaldo.map(s => s.fila).slice(0, 6).join(', ')}). Falta o sobra un movimiento: vuelva a descargar el estado del banco antes de usar esta conciliación.`);
  }

  // ── Prueba: cada bolívar del estado, explicado ─────────────────────────
  if (!esCashea) {
    const { entradas: filasE0, salidas: filasS0, totalEntradas: totE, totalSalidas: totS, cuadraEntradas: okE, cuadraSalidas: okS } = r.explicacion;
    const filasE = filasE0.map(x => [x.concepto, x.monto] as [string, number]);
    const filasS = filasS0.map(x => [x.concepto, x.monto] as [string, number]);
    seccion('Cada bolívar del estado, explicado', okE && okS ? 'Explicado al céntimo' : 'Revisar', okE && okS ? C.verde : C.rojo);
    const ancho = (W - M * 2 - 4) / 2;
    const yIni = y;
    autoTable(doc, {
      startY: y, margin: { left: M, right: W - M - ancho }, tableWidth: ancho, theme: 'grid',
      head: [['ENTRADAS AL BANCO', 'Bs']], body: filasE.filter(x => x[1] > 0).map(([t, m]) => [t, num(m)]),
      foot: [[`Total explicado ${okE ? '= total del banco' : `vs ${num(e.totalCreditos)}`}`, num(totE)]],
      headStyles: { fillColor: C.verde, fontSize: 6.8, fontStyle: 'bold', textColor: C.blanco },
      bodyStyles: { fontSize: 6.8, cellPadding: 1.3, textColor: C.oscuro, lineColor: C.borde },
      footStyles: { fillColor: okE ? C.verdeL : C.rojoL, textColor: C.negro, fontSize: 7, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 28 } },
    });
    const yE = doc.lastAutoTable.finalY;
    autoTable(doc, {
      startY: yIni, margin: { left: M + ancho + 4, right: M }, tableWidth: ancho, theme: 'grid',
      head: [['SALIDAS DEL BANCO', 'Bs']], body: filasS.filter(x => x[1] > 0).map(([t, m]) => [t, num(m)]),
      foot: [[`Total explicado ${okS ? '= total del banco' : `vs ${num(e.totalDebitos)}`}`, num(totS)]],
      headStyles: { fillColor: C.rojo, fontSize: 6.8, fontStyle: 'bold', textColor: C.blanco },
      bodyStyles: { fontSize: 6.8, cellPadding: 1.3, textColor: C.oscuro, lineColor: C.borde },
      footStyles: { fillColor: okS ? C.verdeL : C.rojoL, textColor: C.negro, fontSize: 7, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 28 } },
    });
    y = Math.max(yE, doc.lastAutoTable.finalY) + 4;
    explicacion(`Lo que el sistema registró como cobrado por ${banco.nombre} en el período: ${bs(r.ingresos.totalSistema)}. Lo que entró al banco por cobros de clientes: ${bs(r.ingresos.totalBanco)}. Gastos registrados pagados desde esta cuenta: ${bs(r.egresos.totalSistema)}; pagos a terceros en el banco: ${bs(r.egresos.totalBanco)}.`);
  }

  // ── Hallazgos ──────────────────────────────────────────────────────────
  const ing = r.ingresos;
  if (ing.sinRegistrar.length) {
    seccion('Cobros en el banco que no están en el sistema', `${ing.sinRegistrar.length} · ${esCashea ? usd(ing.sinRegistrar.reduce((a, m) => a + (m.usd || 0), 0)) : bs(ing.sinRegistrar.reduce((a, m) => a + m.monto, 0))}`, C.rojo);
    explicacion('El dinero entró, pero ninguna venta ni cobro del sistema lo explica. Busque la venta y regístrela con esta cuenta (o, si es un aporte del personal o un préstamo, regístrelo como tal).');
    tabla(['FECHA', 'REFERENCIA', 'DESCRIPCIÓN DEL BANCO', 'MONTO', 'PISTA'],
      ing.sinRegistrar.map(m => [f(m.fecha), m.referencia, corto(`${m.descripcion} ${m.detalle}`.trim(), 70), montoMov(m), m.pista || '—']),
      { 0: { cellWidth: 16 }, 1: { cellWidth: 22 }, 3: { halign: 'right', cellWidth: esCashea ? 36 : 24, fontStyle: 'bold' }, 4: { cellWidth: 40, textColor: C.gris } }, C.rojo);
  }
  if (ing.noLlegaron.length) {
    seccion('Registrados en el sistema que no llegaron al banco', `${ing.noLlegaron.length} · ${esCashea ? usd(ing.noLlegaron.reduce((a, s) => a + s.monto, 0)) : bs(ing.noLlegaron.filter(s => !s.enDolares).reduce((a, s) => a + s.monto, 0))}`, C.rojo);
    explicacion(`El sistema dice que estos clientes pagaron a ${banco.nombre}, pero el dinero no aparece en el estado. O el cliente pagó a otra cuenta (corrija la cuenta en la venta), o el pago no se hizo (cóbrelo).`);
    tabla(['FECHA', 'CLIENTE', 'PLACA', 'TRABAJO', 'CUENTA', 'MONTO'],
      ing.noLlegaron.map(s => [f(s.fecha), corto(s.concepto, 26), s.placa || '—', corto(s.detalle, 40), NOMBRE_CUENTA[s.cuenta] || s.cuenta, montoSis(s)]),
      { 0: { cellWidth: 16 }, 2: { cellWidth: 16 }, 4: { cellWidth: 26 }, 5: { halign: 'right', cellWidth: 26, fontStyle: 'bold' } }, C.rojo);
  }
  if (ing.inicialesSinCuenta.length) {
    seccion('Iniciales de Cashea sin la cuenta real', `${ing.inicialesSinCuenta.length} · ${usd(ing.inicialesSinCuenta.reduce((a, s) => a + s.monto, 0))}`, C.ambar);
    explicacion('La venta guarda la inicial en «Cashea / BNC», pero no entró por ahí: no está en el BNC ni como inicial (cuota 0) en el reporte de Cashea. El cliente la pagó por otra vía (efectivo, otro banco): corrija la cuenta de la inicial en la venta para que el banco donde sí entró cuadre.');
    tabla(['FECHA', 'CLIENTE', 'PLACA', 'TRABAJO', 'INICIAL'],
      ing.inicialesSinCuenta.map(s => [f(s.fecha), corto(s.concepto, 28), s.placa || '—', corto(s.detalle, 50), usd(s.monto)]),
      { 0: { cellWidth: 16 }, 2: { cellWidth: 18 }, 4: { halign: 'right', cellWidth: 22, fontStyle: 'bold' } }, C.ambar);
  }
  if (ing.enOtraCuenta.length) {
    seccion('Cobros registrados con otra cuenta', `${ing.enOtraCuenta.length}`, C.ambar);
    explicacion(`El monto exacto entró a ${banco.nombre}, pero en el sistema la venta dice que se cobró por otra cuenta. Corrija la cuenta de la venta para que los saldos de bancos cuadren.`);
    tabla(['FECHA BANCO', 'MONTO', 'REGISTRADO COMO', 'FECHA SIST.', 'CLIENTE', 'PLACA'],
      ing.enOtraCuenta.map(x => [f(x.banco.fecha), bs(Math.abs(x.banco.monto)), NOMBRE_CUENTA[x.sistema.cuenta] || x.sistema.cuenta, f(x.sistema.fecha), corto(x.sistema.concepto, 30), x.sistema.placa || '—']),
      { 1: { halign: 'right', fontStyle: 'bold' } }, C.ambar);
  }
  const difs = [...ing.diferencias.map(d => ({ ...d, tipo: 'Cobro' })), ...r.egresos.diferencias.map(d => ({ ...d, tipo: 'Pago' }))];
  if (difs.length) {
    seccion('Montos que no coinciden', `${difs.length}`, C.ambar);
    explicacion('El banco y el sistema hablan del mismo pago, pero el monto difiere (aunque sea un céntimo). Corrija el monto en el sistema con el del banco.');
    tabla(['TIPO', 'FECHA', 'BANCO', 'SISTEMA', 'DIFERENCIA', 'CLIENTE / PROVEEDOR'],
      difs.map(d => [d.tipo, f(d.banco.fecha), esCashea ? usd(d.banco.usd || 0) : bs(Math.abs(d.banco.monto)), montoSis(d.sistema), `${d.diferencia > 0 ? '+' : ''}${num(d.diferencia)}`, corto(d.sistema.concepto, 34)]),
      { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold', textColor: C.rojo } }, C.ambar);
  }

  // Cashea por orden
  if (r.ordenesCashea.length) {
    const nOk = r.ordenesCashea.filter(o => o.estado === 'al_dia').length;
    seccion('Cashea: cada orden con su venta', `${r.ordenesCashea.length} órdenes · ${nOk} al día`, C.morado);
    explicacion('Cashea cobra en cuotas cada 14 días (la cuota 0 es la inicial). Cada orden se casa con su venta por la cuota (lo financiado ÷ 3) y por la fecha. Cuando no hay venta con Cashea que encaje, se muestran las ventas candidatas: probablemente se registraron con otro método de pago.');
    const ESTADO: Record<string, string> = { al_dia: 'Al día', cuotas_sin_registrar: 'Cuotas sin registrar', venta_no_encontrada: 'Venta no identificada', registrado_de_mas: 'Registrado de más' };
    tabla(['ORDEN · FACT.', 'CUOTAS PAGADAS', 'CUOTA', 'COBRADO', 'VENTA EN EL SISTEMA', 'SISTEMA', 'ESTADO'],
      r.ordenesCashea.map(o => [
        `${o.orden}\n${o.factura || '—'}`,
        o.cuotas.map(c => `${c.descripcion.split(' · ')[0]} ${f(c.fecha).slice(0, 5)} ${usd(c.usd || 0)}`).join('\n'),
        o.cuotaUSD ? usd(o.cuotaUSD) : '—',
        usd(o.cobradoUSD),
        o.venta
          ? `${o.venta.cliente}${o.venta.placa ? ` · ${o.venta.placa}` : ''}\n${f(o.venta.fecha)}${o.candidatos > 1 ? ` (1 de ${o.candidatos} posibles)` : ''}`
          : o.posibles.length ? `Candidatas:\n${o.posibles.map(p => `${f(p.fecha).slice(0, 5)} ${corto(p.cliente, 16)} $${num(p.total, 0)} (${p.plan}, ${corto(p.metodo, 14)})`).join('\n')}` : `Sin candidatas (venta ~${f(o.fechaEstimadaVenta)})`,
        o.venta ? usd(o.registradoUSD) : '—',
        ESTADO[o.estado],
      ]),
      { 0: { cellWidth: 22 }, 1: { cellWidth: 36 }, 2: { halign: 'right', cellWidth: 14 }, 3: { halign: 'right', cellWidth: 16, fontStyle: 'bold' }, 5: { halign: 'right', cellWidth: 18 }, 6: { cellWidth: 22, fontStyle: 'bold' } },
      C.morado);
  }
  if (r.cruceCashea) {
    const cc = r.cruceCashea;
    seccion('Cruce Cashea con el estado del BNC', `${cc.encontradas.length} de ${cc.encontradas.length + cc.faltanEnBnc.length} cuotas en el banco`, cc.faltanEnBnc.length || cc.pmBncSinCuota.length ? C.ambar : C.verde);
    explicacion(cc.faltanEnBnc.length || cc.pmBncSinCuota.length
      ? `${cc.faltanEnBnc.length} cuota(s) del reporte de Cashea no aparecen en el BNC y ${cc.pmBncSinCuota.length} pago(s) móvil(es) del BNC no son cuotas de Cashea.`
      : 'Cada cuota del reporte de Cashea aparece en el estado del BNC con la misma referencia y el mismo monto en bolívares, y no sobra ningún pago móvil.');
    if (cc.faltanEnBnc.length) {
      tabla(['FECHA', 'REFERENCIA', 'CUOTA', 'BOLÍVARES', 'DÓLARES'], cc.faltanEnBnc.map(m => [f(m.fecha), m.referencia, m.descripcion, bs(m.monto), usd(m.usd || 0)]), {}, C.ambar);
    }
  }

  const egr = r.egresos;
  if (egr.sinRegistrar.length) {
    seccion('Pagos que salieron del banco sin gasto registrado', `${egr.sinRegistrar.length} · ${bs(egr.sinRegistrar.reduce((a, m) => a - m.monto, 0))}`, C.rojo);
    explicacion('Dinero que salió a terceros (proveedores, personal, servicios) y que el sistema no tiene como gasto. Mientras no se registren, la utilidad del mes sale más alta de lo que es.');
    tabla(['FECHA', 'REFERENCIA', 'DESCRIPCIÓN DEL BANCO', 'MONTO', 'PISTA'],
      egr.sinRegistrar.map(m => [f(m.fecha), m.referencia, corto(`${m.descripcion} ${m.detalle}`.trim(), 62), bs(Math.abs(m.monto)), m.pista || '—']),
      { 0: { cellWidth: 16 }, 1: { cellWidth: 22 }, 3: { halign: 'right', cellWidth: 24, fontStyle: 'bold' }, 4: { cellWidth: 42, textColor: C.gris } }, C.rojo,
      ['', '', 'TOTAL', bs(egr.sinRegistrar.reduce((a, m) => a - m.monto, 0)), '']);
  }
  if (egr.noSalieron.length) {
    seccion('Gastos registrados que no salieron de esta cuenta', `${egr.noSalieron.length}`, C.ambar);
    explicacion(`El sistema dice que estos gastos se pagaron desde ${banco.nombre}, pero el banco no muestra la salida. Revise si se pagaron desde otra cuenta o en efectivo.`);
    tabla(['FECHA', 'PROVEEDOR', 'DETALLE', 'CUENTA', 'MONTO'],
      egr.noSalieron.map(s => [f(s.fecha), corto(s.concepto, 28), corto(s.detalle, 44), NOMBRE_CUENTA[s.cuenta] || s.cuenta, montoSis(s)]),
      { 4: { halign: 'right', fontStyle: 'bold' } }, C.ambar);
  }

  if (r.propiosDelBanco.length) {
    seccion('Movimientos propios del banco', `${r.propiosDelBanco.reduce((a, g) => a + g.movimientos.length, 0)} movimientos`, C.gris);
    explicacion('No son ventas ni gastos del taller: comisiones, impuestos, intereses, traspasos entre cuentas propias y liquidaciones de Cashea. Las comisiones e impuestos conviene registrarlos como gasto financiero del mes.');
    tabla(['CONCEPTO', 'MOVIMIENTOS', 'ENTRADAS', 'SALIDAS', 'NETO'],
      r.propiosDelBanco.map(g => {
        const mas = r2(g.movimientos.filter(m => m.monto > 0).reduce((a, m) => a + m.monto, 0));
        const menos = r2(g.movimientos.filter(m => m.monto < 0).reduce((a, m) => a - m.monto, 0));
        return [g.titulo, g.movimientos.length, mas ? num(mas) : '—', menos ? num(menos) : '—', num(g.total)];
      }),
      { 1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 28, fontStyle: 'bold' } }, C.gris);
  }
  if (r.reversos.length) {
    seccion('Reversos emparejados', `${r.reversos.length}`, C.gris);
    tabla(['FECHA', 'MOVIMIENTO ORIGINAL', 'REVERSO', 'MONTO'],
      r.reversos.map(x => [f(x.original.fecha), corto(x.original.descripcion, 40), corto(x.reverso.descripcion, 40), bs(Math.abs(x.original.monto))]),
      { 3: { halign: 'right' } }, C.gris);
  }

  // ── Conciliados (el detalle completo, al final) ────────────────────────
  const todas = [...ing.conciliados.map(p => ({ p, tipo: 'Cobro' })), ...egr.conciliados.map(p => ({ p, tipo: 'Pago' }))];
  if (todas.length) {
    seccion('Movimientos conciliados', `${todas.length} parejas`, C.verde);
    tabla(['TIPO', 'FECHA BANCO', 'MONTO BANCO', 'REGISTRO DEL SISTEMA', 'FECHA SIST.', 'REGLA'],
      todas.map(({ p, tipo }) => [
        tipo, f(p.banco[0].fecha),
        p.banco.map(m => montoMov(m)).join('\n'),
        p.sistema.map(s => `${corto(s.concepto, 26)}${s.placa ? ` · ${s.placa}` : ''} (${montoSis(s)})`).join('\n'),
        f(p.sistema[0].fecha),
        `${REGLA_TEXTO[p.regla]}${p.confianza === 'revisar' ? ' (revisar)' : ''}`,
      ]),
      { 0: { cellWidth: 12 }, 1: { cellWidth: 17 }, 2: { halign: 'right', cellWidth: esCashea ? 34 : 24 }, 4: { cellWidth: 17 }, 5: { cellWidth: 34, textColor: C.gris } }, C.verde);
  }

  // ── Pie ────────────────────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...C.borde); doc.line(M, H - 9, W - M, H - 9);
    texto(`Lycos Team · ${RIF_TEXTO} · Conciliación ${banco.nombre} ${f(e.desde)}–${f(e.hasta)} · Documento interno`, M, H - 5, { t: 6.3, c: C.claro });
    texto(`Página ${p} de ${paginas}`, W - M, H - 5, { t: 6.3, c: C.claro, a: 'right' });
  }

  if (opciones?.guardar) opciones.guardar(doc);
  else doc.save(`LYCOS_CONCILIACION_${banco.nombre.toUpperCase().replace(/\s+/g, '_')}_${e.desde}_${e.hasta}.pdf`);
  return doc;
}
