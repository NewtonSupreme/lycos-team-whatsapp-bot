import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RIF_TEXTO } from '@/lib/empresa';
import type { FlujoCuenta, ArqueoCaja } from '@/lib/caja/flujo';

// ─────────────────────────────────────────────────────────────────────────────
// Flujo de caja de una cuenta en PDF: el saldo inicial, cada día lo que entró y lo
// que salió, el detalle de cada movimiento con su saldo corrido y las veces que se
// verificó el saldo real. Todo sale del mismo cálculo que ve la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const C = {
  black: [15, 23, 42] as RGB, dark: [30, 41, 59] as RGB, gray: [71, 85, 105] as RGB, light: [148, 163, 184] as RGB,
  bg: [248, 250, 252] as RGB, orange: [249, 115, 22] as RGB, orangeL: [255, 237, 213] as RGB, green: [22, 163, 74] as RGB,
  greenL: [220, 252, 231] as RGB, red: [220, 38, 38] as RGB, redL: [254, 226, 226] as RGB, blue: [37, 99, 235] as RGB,
  blueL: [219, 234, 254] as RGB, amber: [217, 119, 6] as RGB, amberL: [254, 243, 199] as RGB, white: [255, 255, 255] as RGB,
};

export interface DatosPdfFlujo {
  flujo: FlujoCuenta;
  arqueos: ArqueoCaja[];
  estadoBanco?: { banco: string; hasta: string; saldoFinalBanco: number; saldoSistema: number; diferencia: number } | null;
  generadoPor: string;
}

const num = (x: number) => Number(x || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaLarga = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diaSemana = (f: string) => DIA[new Date(`${f}T12:00:00`).getDay()];
const ORIGEN: Record<string, string> = { venta: 'Venta', cobro: 'Cobro', gasto: 'Gasto', traspaso: 'Traspaso', manual: 'Manual' };

export function generarFlujoCajaPDF(d: DatosPdfFlujo, opciones?: { guardar?: (doc: jsPDF) => void }) {
  const { flujo } = d;
  const c = flujo.cuenta;
  const mon = c.moneda === 'USD' ? '$' : c.moneda === 'EUR' ? '€' : 'Bs ';
  const dinero = (x: number) => `${mon}${num(x)}`;
  const doc = new jsPDF('l', 'mm', 'a4') as jsPDF & { lastAutoTable: { finalY: number } };
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 12;
  let y = M;
  const barra = () => { doc.setFillColor(...C.orange); doc.rect(0, 0, W, 2, 'F'); };
  const asegurar = (alto: number) => { if (y + alto > H - 12) { doc.addPage(); barra(); y = M + 2; } };
  const seccion = (titulo: string, extra?: string) => {
    asegurar(28);
    doc.setFillColor(...C.dark); doc.roundedRect(M, y, W - M * 2, 7, 1, 1, 'F');
    doc.setTextColor(...C.white); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(titulo.toUpperCase(), M + 4, y + 4.8);
    if (extra) doc.text(extra, W - M - 4, y + 4.8, { align: 'right' });
    y += 10;
  };
  const despues = () => { y = doc.lastAutoTable.finalY + 5; };

  // ── Encabezado ──────────────────────────────────────────────────────────────
  barra();
  doc.setFillColor(...C.black); doc.roundedRect(M, y, 60, 18, 2, 2, 'F');
  doc.setTextColor(...C.orange); doc.setFontSize(15); doc.setFont('helvetica', 'bolditalic'); doc.text('LYCOS', M + 4, y + 9);
  doc.setTextColor(...C.white); doc.text(' TEAM', M + 23, y + 9);
  doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(150, 150, 150); doc.text(`MECÁNICA INTEGRAL · ${RIF_TEXTO}`, M + 4, y + 14.5);
  doc.setTextColor(...C.dark); doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('FLUJO DE CAJA', W / 2, y + 8, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.orange); doc.text(c.nombre.toUpperCase(), W / 2, y + 13.5, { align: 'center' });
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  doc.text(`Del ${fechaLarga(flujo.desde)} al ${fechaLarga(flujo.hasta)}  ·  moneda: ${c.moneda === 'USD' ? 'dólares' : c.moneda === 'EUR' ? 'euros' : 'bolívares'}`, W / 2, y + 17.5, { align: 'center' });
  doc.setFontSize(7); doc.text(`Generado por ${d.generadoPor || 'Sistema'}`, W - M, y + 6, { align: 'right' });
  doc.text(new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }), W - M, y + 10, { align: 'right' });
  y += 24;

  // ── Cifras ──────────────────────────────────────────────────────────────────
  const neto = Math.round((flujo.entradas - flujo.salidas) * 100) / 100;
  const cajas = [
    { t: 'SALDO INICIAL DEL PERÍODO', v: dinero(flujo.saldoInicialRango), col: C.blue, luz: C.blueL },
    { t: 'ENTRADAS', v: `+${dinero(flujo.entradas)}`, col: C.green, luz: C.greenL },
    { t: 'SALIDAS', v: `-${dinero(flujo.salidas)}`, col: C.red, luz: C.redL },
    { t: 'MOVIMIENTO NETO', v: `${neto >= 0 ? '+' : '-'}${dinero(Math.abs(neto))}`, col: C.amber, luz: C.amberL },
    { t: 'SALDO FINAL', v: dinero(flujo.saldoFinal), col: C.dark, luz: C.bg },
  ];
  const w = (W - M * 2 - (cajas.length - 1) * 2.4) / cajas.length;
  cajas.forEach((k, i) => {
    const x = M + i * (w + 2.4);
    doc.setFillColor(...k.luz); doc.roundedRect(x, y, w, 16, 2, 2, 'F');
    doc.setDrawColor(...k.col); doc.setLineWidth(0.4); doc.roundedRect(x, y, w, 16, 2, 2, 'S');
    doc.setTextColor(...k.col); doc.setFontSize(5.8); doc.setFont('helvetica', 'bold'); doc.text(k.t, x + w / 2, y + 5, { align: 'center' });
    doc.setTextColor(...C.dark); doc.setFontSize(k.v.length > 16 ? 9 : 11); doc.text(k.v, x + w / 2, y + 12, { align: 'center' });
  });
  y += 21;

  // ── Avisos: lo que el lector debe saber para fiarse de las cifras ────────────
  const avisos: Array<{ t: string; col: RGB; luz: RGB }> = [];
  if (c.saldo_inicial === 0) avisos.push({ t: 'Esta cuenta no tiene saldo inicial configurado: el saldo mostrado es solo el movimiento registrado, no el dinero real.', col: C.amber, luz: C.amberL });
  else avisos.push({ t: `Saldo inicial de la cuenta: ${dinero(c.saldo_inicial)} desde el ${fechaLarga(c.desde)}.`, col: C.blue, luz: C.blueL });
  if (d.estadoBanco) {
    const e = d.estadoBanco; const ok = Math.abs(e.diferencia) < 0.01;
    avisos.push({ t: `Según el estado de cuenta (${e.banco}, al ${fechaLarga(e.hasta)}): ${dinero(e.saldoFinalBanco)}  ·  Sistema: ${dinero(e.saldoSistema)}  ·  ${ok ? 'CUADRA' : `DIFERENCIA ${dinero(e.diferencia)}`}`, col: ok ? C.green : C.red, luz: ok ? C.greenL : C.redL });
  }
  for (const a of flujo.avisos) avisos.push({ t: a, col: C.red, luz: C.redL });
  for (const a of avisos) {
    asegurar(10);
    doc.setFillColor(...a.luz); doc.roundedRect(M, y, W - M * 2, 7, 1.5, 1.5, 'F'); doc.setFillColor(...a.col); doc.rect(M, y, 2, 7, 'F');
    doc.setTextColor(...C.dark); doc.setFontSize(6.8); doc.setFont('helvetica', 'normal'); doc.text(a.t.substring(0, 200), M + 5, y + 4.4);
    y += 9;
  }
  y += 2;

  // ── 1 · Día por día ──────────────────────────────────────────────────────────
  const conMov = flujo.dias.filter(x => x.movimientos.length || x.arqueo || x.fecha === flujo.dias[0]?.fecha || x.fecha === flujo.dias[flujo.dias.length - 1]?.fecha);
  seccion('1 · Día por día', `${conMov.length} día(s) con movimiento · ${flujo.dias.length} en el período`);
  autoTable(doc, {
    startY: y,
    head: [['FECHA', 'DÍA', 'SALDO INICIAL', 'ENTRADAS', 'SALIDAS', 'SALDO FINAL', 'MOVS.', 'VERIFICADO']],
    body: conMov.map(x => [fechaLarga(x.fecha), diaSemana(x.fecha), dinero(x.saldoInicial), x.entradas ? `+${num(x.entradas)}` : '—', x.salidas ? `-${num(x.salidas)}` : '—', dinero(x.saldoFinal), String(x.movimientos.filter(m => !m.anulado).length),
      x.arqueo ? (Math.abs(x.arqueo.diferencia) < 0.01 ? `CUADRA (${dinero(x.arqueo.saldo_real)})` : `DIF. ${dinero(x.arqueo.diferencia)} (real ${dinero(x.arqueo.saldo_real)})`) : '—']),
    foot: [['TOTAL', '', dinero(flujo.saldoInicialRango), `+${num(flujo.entradas)}`, `-${num(flujo.salidas)}`, dinero(flujo.saldoFinal), '', '']],
    theme: 'grid',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.6, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 7, cellPadding: 1.4, textColor: C.dark },
    footStyles: { fillColor: C.black, textColor: C.white, fontSize: 7, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.bg },
    columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 1: { cellWidth: 14, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right', textColor: C.green, fontStyle: 'bold' }, 4: { halign: 'right', textColor: C.red, fontStyle: 'bold' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { cellWidth: 14, halign: 'center' }, 7: { cellWidth: 62 } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el tipo del gancho de autotable no deja asignar colores
    didParseCell: (h: any) => {
      if (h.section === 'body' && h.column.index === 7) { const v = String(h.cell.raw || ''); if (v.startsWith('CUADRA')) h.cell.styles.textColor = C.green; else if (v.startsWith('DIF')) h.cell.styles.textColor = C.red; }
    },
    margin: { left: M, right: M },
  });
  despues();

  // ── 2 · Detalle con saldo corrido ────────────────────────────────────────────
  const filas: Array<Array<string>> = [];
  for (const x of flujo.dias) {
    let corrido = x.saldoInicial;
    for (const m of x.movimientos) {
      if (!m.anulado) corrido = Math.round((corrido + (m.sentido === 'entrada' ? m.monto : -m.monto)) * 100) / 100;
      filas.push([fechaLarga(x.fecha), ORIGEN[m.origen] || m.origen, `${m.anulado ? '[ANULADO] ' : ''}${m.concepto}`.substring(0, 46), (m.detalle || '').substring(0, 60),
        m.sentido === 'entrada' && !m.anulado ? `+${num(m.monto)}` : m.anulado ? `(${num(m.monto)})` : '', m.sentido === 'salida' && !m.anulado ? `-${num(m.monto)}` : '', m.anulado ? '' : dinero(corrido)]);
    }
  }
  seccion('2 · Detalle de cada movimiento', `${filas.length} movimiento(s)`);
  autoTable(doc, {
    startY: y,
    head: [['FECHA', 'ORIGEN', 'CONCEPTO', 'DETALLE', 'ENTRADA', 'SALIDA', 'SALDO']],
    body: filas.length ? filas : [['', '', 'Sin movimientos en el período', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: C.green, textColor: C.white, fontSize: 6.6, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.2, textColor: C.dark },
    alternateRowStyles: { fillColor: C.bg },
    columnStyles: { 0: { cellWidth: 22, halign: 'center' }, 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 62 }, 3: { cellWidth: 'auto' }, 4: { halign: 'right', cellWidth: 26, textColor: C.green }, 5: { halign: 'right', cellWidth: 26, textColor: C.red }, 6: { halign: 'right', cellWidth: 30, fontStyle: 'bold' } },
    margin: { left: M, right: M },
  });
  despues();

  // ── 3 · Verificaciones del saldo real ────────────────────────────────────────
  const arq = d.arqueos.filter(a => a.fecha >= flujo.desde && a.fecha <= flujo.hasta);
  if (arq.length) {
    seccion('3 · Verificaciones del saldo real', `${arq.length} verificación(es)`);
    autoTable(doc, {
      startY: y,
      head: [['FECHA', 'SALDO REAL', 'SALDO DEL SISTEMA', 'DIFERENCIA', 'ORIGEN', 'POR', 'NOTA']],
      body: arq.map(a => [fechaLarga(a.fecha), dinero(a.saldo_real), dinero(a.saldo_sistema), Math.abs(a.diferencia) < 0.01 ? 'Cuadra' : dinero(a.diferencia), a.origen === 'manual' ? 'Manual' : a.origen, a.usuario || '—', (a.nota || '').substring(0, 70)]),
      theme: 'grid',
      headStyles: { fillColor: C.amber, textColor: C.white, fontSize: 6.6, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 6.8, cellPadding: 1.3, textColor: C.dark },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: M, right: M },
    });
    despues();
  }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p); doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(...C.light);
    doc.text(`Lycos Team · ${RIF_TEXTO} · Flujo de caja ${c.nombre} ${fechaLarga(flujo.desde)}–${fechaLarga(flujo.hasta)} · Documento interno`, M, H - 5);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 5, { align: 'right' });
  }
  if (opciones?.guardar) opciones.guardar(doc);
  else doc.save(`LYCOS_FLUJO_CAJA_${c.nombre.replace(/[^\w]+/g, '_')}_${flujo.desde}_${flujo.hasta}.pdf`);
}
