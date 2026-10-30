import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RIF_TEXTO } from '@/lib/empresa';
import type { Diagnostico, EstadoResultados } from '@/lib/utilidad/periodo';

// ─────────────────────────────────────────────────────────────────────────────
// Reporte de utilidad del período + diagnóstico. Sale del mismo cálculo que la
// pantalla (lib/utilidad/periodo.ts): las cifras no pueden diferir.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const C = {
  black: [15, 23, 42] as RGB, dark: [30, 41, 59] as RGB, gray: [71, 85, 105] as RGB, light: [148, 163, 184] as RGB, bg: [248, 250, 252] as RGB,
  orange: [249, 115, 22] as RGB, orangeL: [255, 237, 213] as RGB, green: [22, 163, 74] as RGB, greenL: [220, 252, 231] as RGB,
  red: [220, 38, 38] as RGB, redL: [254, 226, 226] as RGB, blue: [37, 99, 235] as RGB, blueL: [219, 234, 254] as RGB,
  amber: [217, 119, 6] as RGB, amberL: [254, 243, 199] as RGB, violet: [124, 58, 237] as RGB, white: [255, 255, 255] as RGB,
};
const num = (x: number, d = 2) => (Number(x) || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (x: number) => `${x < 0 ? '-' : ''}$${num(Math.abs(x))}`;
const dmy = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const SEV: Record<string, { t: string; c: RGB }> = { critico: { t: 'CRÍTICO', c: C.red }, alto: { t: 'ALTO', c: C.orange }, medio: { t: 'MEDIO', c: C.amber }, info: { t: 'INFO', c: C.blue } };
const EFECTO: Record<string, string> = { infla: 'Utilidad más alta de lo real', reduce: 'Utilidad más baja de lo real', caja: 'Afecta caja y bancos', neutro: 'Dato que no cuadra' };

export function generarUtilidadPDF(d: { estado: EstadoResultados; diagnostico: Diagnostico; analisisIA?: string | null }) {
  const { estado: e, diagnostico: g } = d;
  const doc = new jsPDF('p', 'mm', 'a4') as jsPDF & { lastAutoTable: { finalY: number } };
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 12;
  let y = M;
  const barra = () => { doc.setFillColor(...C.orange); doc.rect(0, 0, W, 2, 'F'); };
  const asegurar = (h: number) => { if (y + h > H - 12) { doc.addPage(); barra(); y = M + 2; } };
  const seccion = (t: string, extra?: string) => {
    asegurar(24);
    doc.setFillColor(...C.dark); doc.roundedRect(M, y, W - M * 2, 7, 1, 1, 'F');
    doc.setTextColor(...C.white); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text(t.toUpperCase(), M + 3, y + 4.8);
    if (extra) doc.text(extra, W - M - 3, y + 4.8, { align: 'right' });
    y += 10;
  };
  const despues = () => { y = doc.lastAutoTable.finalY + 5; };
  const texto = (t: string, o: { s?: number; c?: RGB; b?: boolean; i?: boolean } = {}) => {
    doc.setFontSize(o.s ?? 7.5); doc.setTextColor(...(o.c ?? C.dark)); doc.setFont('helvetica', o.b ? 'bold' : o.i ? 'italic' : 'normal');
    const lineas = doc.splitTextToSize(t, W - M * 2) as string[];
    for (const l of lineas) { asegurar(5); doc.text(l, M, y); y += (o.s ?? 7.5) * 0.45; }
  };

  // ── Encabezado
  barra();
  doc.setFillColor(...C.black); doc.roundedRect(M, y, 54, 16, 2, 2, 'F');
  doc.setTextColor(...C.orange); doc.setFontSize(13); doc.setFont('helvetica', 'bolditalic'); doc.text('LYCOS', M + 4, y + 8);
  doc.setTextColor(...C.white); doc.text(' TEAM', M + 20, y + 8);
  doc.setFontSize(5); doc.setFont('helvetica', 'bold'); doc.setTextColor(150, 150, 150); doc.text(`MECÁNICA INTEGRAL · ${RIF_TEXTO}`, M + 4, y + 13);
  doc.setTextColor(...C.dark); doc.setFontSize(16); doc.text('UTILIDAD Y DIAGNÓSTICO', W - M, y + 7, { align: 'right' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  doc.text(`Del ${dmy(e.desde)} al ${dmy(e.hasta)} · ${e.dias} día(s)${e.tasaHoy ? ` · tasa de hoy ${num(e.tasaHoy, 4)} Bs/$` : ''}`, W - M, y + 12, { align: 'right' });
  doc.text(`Generado ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}`, W - M, y + 16, { align: 'right' });
  y += 22;

  // ── Veredicto
  const pos = e.utilidad >= 0;
  doc.setFillColor(...(pos ? C.greenL : C.redL)); doc.roundedRect(M, y, W - M * 2, 24, 2, 2, 'F');
  doc.setFillColor(...(pos ? C.green : C.red)); doc.rect(M, y, 2.5, 24, 'F');
  doc.setTextColor(...C.gray); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.text('UTILIDAD DEL PERÍODO', M + 6, y + 6);
  doc.setTextColor(...(pos ? C.green : C.red)); doc.setFontSize(22); doc.text(usd(e.utilidad), M + 6, y + 16);
  doc.setTextColor(...C.dark); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`Margen ${num(e.margen, 1)}% · utilidad bruta ${usd(e.utilidadBruta)} (${num(e.margenBruto, 1)}%)`, M + 6, y + 21);
  const pc = g.puntaje >= 80 ? C.green : g.puntaje >= 55 ? C.amber : C.red;
  doc.setTextColor(...pc); doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text(`${g.puntaje}/100`, W - M - 6, y + 14, { align: 'right' });
  doc.setFontSize(7); doc.text(g.puntaje >= 80 ? 'CIFRAS CONFIABLES' : g.puntaje >= 55 ? 'REVISAR ANTES DE DECIDIR' : 'DATOS CON FALLAS IMPORTANTES', W - M - 6, y + 19.5, { align: 'right' });
  y += 29;
  if (!pos) texto('La utilidad es negativa. No se ajusta: el diagnóstico de abajo separa lo que es real (gastos mayores que lo vendido) de lo que viene de datos mal cargados.', { c: C.red, b: true });

  // ── Estado de resultados
  seccion('1 · Estado de resultados', 'Lo ganado (fecha de cada registro)');
  const er: Array<[string, string, 'b' | 's' | 't']> = [['Ventas del período (sin IVA)', usd(e.ventas.base), 'b']];
  for (const x of e.ventas.porDepartamento) er.push([`   ${x.etiqueta} (${x.n})`, usd(x.usd), 's']);
  er.push(['- Costo de los carros', usd(-e.costoCarros.total), 'b']);
  for (const x of e.costoCarros.porCategoria) er.push([`   ${x.etiqueta} (${x.n})`, usd(-x.usd), 's']);
  if (e.costoCarros.traidoDeAntes > 0) er.push([`   (incluye ${usd(e.costoCarros.traidoDeAntes)} de piezas compradas antes para carros cobrados en el período)`, '', 's']);
  if (e.costoCarros.enProceso.total > 0) er.push(['   Trabajo en proceso: carros aún sin cobrar (no resta todavía)', usd(e.costoCarros.enProceso.total), 's']);
  er.push(['= Utilidad bruta', usd(e.utilidadBruta), 't']);
  er.push(['- Gastos del taller', usd(-e.gastosTaller.total), 'b']);
  for (const x of e.gastosTaller.porCategoria) er.push([`   ${x.etiqueta} (${x.n})`, usd(-x.usd), 's']);
  er.push(['= UTILIDAD DEL PERÍODO', usd(e.utilidad), 't']);
  autoTable(doc, {
    startY: y, body: er.map(f => [f[0], f[1]]), theme: 'plain',
    bodyStyles: { fontSize: 7.6, cellPadding: 1.1, textColor: C.dark }, columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    didParseCell: (h: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const tipo = er[h.row.index]?.[2];
      if (tipo === 'b') h.cell.styles.fontStyle = 'bold';
      if (tipo === 's') h.cell.styles.textColor = C.gray;
      if (tipo === 't') { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = C.bg; }
    },
    margin: { left: M, right: M },
  });
  despues();
  texto(`IVA cobrado ${usd(e.ventas.iva)}: no es ingreso, se le debe al SENIAT. Facturado con IVA: ${usd(e.ventas.facturado)}. Ventas: ${e.ventas.n}.`, { s: 6.8, c: C.gray, i: true });
  y += 2;

  // ── Caja
  seccion('2 · Caja: lo que entró y salió de verdad', 'Bs exactos · $ del día y $ de hoy');
  autoTable(doc, {
    startY: y,
    head: [['CUENTA', 'MONTO', '$ A LA TASA DEL DÍA', '$ A LA TASA DE HOY']],
    body: e.caja.porCuenta.map(c => [c.nombre, c.moneda === 'Bs' ? `Bs ${num(c.monto)}` : usd(c.monto), usd(c.usdDelDia), usd(c.usdHoy)]),
    foot: [['TOTAL ENTRÓ', `Bs ${num(e.caja.entradas.bs)} + ${usd(e.caja.entradas.usdDirecto)}`, usd(e.caja.totalEntradoUsdDelDia), usd(e.caja.totalEntradoUsdHoy)]],
    theme: 'grid', headStyles: { fillColor: C.green, textColor: C.white, fontSize: 6.8, fontStyle: 'bold' }, footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.2, cellPadding: 1.2, textColor: C.dark }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }, margin: { left: M, right: M },
  });
  despues();
  autoTable(doc, {
    startY: y,
    body: [
      ['Ventas al contado (recibido)', usd(e.ventas.contadoRecibido)], ['Iniciales de Cashea', usd(e.ventas.casheaInicial)],
      ['Cuotas de Cashea cobradas', usd(e.caja.entradas.cuotasCashea)], ['Cobros de deudas', usd(e.caja.entradas.abonos)],
      ['Diferencia cambiaria (Bs a la tasa de hoy vs la del día)', usd(e.caja.diferenciaCambiaria)],
      ['Gastos pagados', usd(-e.caja.gastosPagadosUsd)], ['NETO DE CAJA', usd(e.caja.netoCajaUsd)],
      ['Quedó por cobrar: Cashea financiado', usd(e.ventas.casheaFinanciado)], ['Quedó por cobrar: crédito a clientes', usd(e.ventas.credito)],
      ['Quedó por pagar a proveedores', usd(e.caja.gastosPorPagarUsd)],
    ],
    theme: 'striped', bodyStyles: { fontSize: 7.2, cellPadding: 1.1, textColor: C.dark }, columnStyles: { 1: { halign: 'right', cellWidth: 40, fontStyle: 'bold' } }, margin: { left: M, right: M },
  });
  despues();

  // ── Día por día
  const dias = e.porDia.filter(x => x.ventas || x.costo || x.gastos || x.cobradoUsd);
  if (dias.length > 1) {
    seccion('3 · Día por día', `${dias.length} día(s) con movimiento`);
    autoTable(doc, {
      startY: y, head: [['FECHA', 'VENTAS', 'COSTO CARROS', 'GASTOS TALLER', 'UTILIDAD', 'ENTRÓ A CAJA', 'GASTOS PAGADOS']],
      body: dias.map(x => [dmy(x.fecha), usd(x.ventas), usd(-x.costo), usd(-x.gastos), usd(x.utilidad), usd(x.cobradoUsd), usd(-x.pagadoUsd)]),
      theme: 'grid', headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.6, fontStyle: 'bold', halign: 'center' }, bodyStyles: { fontSize: 6.8, cellPadding: 1, textColor: C.dark, halign: 'right' },
      columnStyles: { 0: { halign: 'center' } },
      didParseCell: (h: any) => { if (h.section === 'body' && h.column.index === 4) h.cell.styles.textColor = String(h.cell.raw).startsWith('-') ? C.red : C.green; }, // eslint-disable-line @typescript-eslint/no-explicit-any
      margin: { left: M, right: M },
    });
    despues();
  }

  // ── Diagnóstico
  seccion('4 · Diagnóstico', `${g.hallazgos.length} hallazgo(s) · confiabilidad ${g.puntaje}/100`);
  if (!g.hallazgos.length) texto('Sin hallazgos: las cifras del período cuadran.', { c: C.green, b: true });
  for (const h of g.hallazgos) {
    asegurar(18);
    const s = SEV[h.severidad];
    doc.setFillColor(...s.c); doc.roundedRect(M, y - 3.2, 15, 4.4, 1, 1, 'F');
    doc.setTextColor(...C.white); doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.text(s.t, M + 7.5, y, { align: 'center' });
    doc.setTextColor(...C.dark); doc.setFontSize(8); doc.text(`${h.titulo}${h.total ? ` (${h.total})` : ''}`, M + 17, y);
    if (h.impactoUsd) { doc.setTextColor(...(h.impactoUsd < 0 ? C.red : C.green)); doc.text(usd(h.impactoUsd), W - M, y, { align: 'right' }); }
    y += 4;
    texto(`${EFECTO[h.efecto]}. ${h.explicacion}`, { s: 6.8, c: C.gray });
    texto(`Qué hacer: ${h.accion}`, { s: 6.8, c: C.blue, b: true });
    if (h.registros.length) {
      autoTable(doc, {
        startY: y, head: [['FECHA', 'REGISTRO', 'DETALLE', 'MONTO']],
        body: h.registros.slice(0, 60).map(r => [dmy(r.fecha), r.descripcion.substring(0, 42), (r.detalle || '').substring(0, 90), r.usd ? usd(r.usd) : '']),
        theme: 'grid', headStyles: { fillColor: C.bg, textColor: C.gray, fontSize: 6, fontStyle: 'bold' }, bodyStyles: { fontSize: 6.3, cellPadding: 0.9, textColor: C.dark },
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 52 }, 3: { cellWidth: 20, halign: 'right' } }, margin: { left: M + 4, right: M },
      });
      despues();
      if (h.registros.length > 60) texto(`… y ${h.registros.length - 60} más (están en la pantalla de Utilidad).`, { s: 6.3, c: C.gray, i: true });
    }
    y += 2;
  }

  // ── Conciliación
  if (g.conciliacion.length) {
    seccion('5 · Conciliación bancaria del período', 'Versión exacta del estado usado');
    autoTable(doc, {
      startY: y, head: [['BANCO', 'ÚLTIMO ESTADO CONCILIADO', '%', 'PEND.', 'DÍAS CUBIERTOS', 'SIN CONCILIAR', 'CAMBIOS DESPUÉS']],
      body: g.conciliacion.map(b => [
        b.nombre,
        b.ultimaCorrida ? `${b.ultimaCorrida.archivo || 'archivo'} (${dmy(b.ultimaCorrida.desde)}–${dmy(b.ultimaCorrida.hasta)})\nCargado ${b.ultimaCorrida.cargada}${b.ultimaCorrida.usuario ? ` por ${b.ultimaCorrida.usuario}` : ''}${b.ultimaCorrida.huella ? `\nHuella ${b.ultimaCorrida.huella.slice(0, 16)}` : ''}${b.ultimaCorrida.versionesAnteriores ? `\n${b.ultimaCorrida.versionesAnteriores} versión(es) anterior(es) ignorada(s)` : ''}` : 'Nunca conciliado',
        b.ultimaCorrida ? `${num(b.ultimaCorrida.porcentaje, 1)}%` : '—', b.ultimaCorrida ? String(b.ultimaCorrida.pendientes) : '—',
        `${b.diasCubiertos}/${b.diasConMovimiento}`, b.diasSinConciliar.map(f => f.slice(8, 10) + '/' + f.slice(5, 7)).join(', ') || 'Ninguno', String(b.cambiosDespues || '—'),
      ]),
      theme: 'grid', headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.4, fontStyle: 'bold' }, bodyStyles: { fontSize: 6.5, cellPadding: 1.1, textColor: C.dark },
      columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' }, 1: { cellWidth: 62 }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'center' } }, margin: { left: M, right: M },
    });
    despues();
  }

  // ── IA
  if (d.analisisIA) {
    seccion('6 · Análisis con IA', 'Sobre estas mismas cifras');
    for (const linea of d.analisisIA.split('\n')) {
      const l = linea.replace(/\*\*/g, '').trim();
      if (!l) { y += 1.5; continue; }
      if (l.startsWith('#')) texto(l.replace(/^#+\s*/, ''), { s: 8.5, b: true, c: C.violet });
      else texto(l.replace(/^[-*]\s+/, '•  '), { s: 7.2 });
    }
  }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(...C.light);
    doc.text(`Lycos Team · ${RIF_TEXTO} · Utilidad ${dmy(e.desde)}–${dmy(e.hasta)} · Documento interno`, M, H - 5);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 5, { align: 'right' });
  }
  doc.save(`LYCOS_UTILIDAD_${e.desde}_${e.hasta}.pdf`);
}
