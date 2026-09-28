import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ClienteDeudor, Cobranza } from '@/lib/cobranza/tipos';

/**
 * Los PDF de cuentas por cobrar.
 *
 *   · El reporte de pendientes: todos los clientes que deben, cuánto, desde
 *     cuándo y qué abonaron. Es el que se saca para salir a cobrar.
 *   · La ficha de un cliente: cada servicio que debe, con su carro, sus
 *     fechas y su historial de abonos. Es la que se le puede mandar.
 */

type RGB = [number, number, number];
const C = {
  negro: [22, 24, 29] as RGB, gris: [91, 97, 110] as RGB, claro: [138, 144, 156] as RGB,
  borde: [232, 234, 237] as RGB, fondo: [250, 251, 252] as RGB, naranja: [249, 115, 22] as RGB,
  verde: [22, 163, 74] as RGB, rojo: [220, 38, 38] as RGB, ambar: [194, 65, 12] as RGB,
  morado: [124, 58, 237] as RGB, blanco: [255, 255, 255] as RGB,
};
const usd = (n: number) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f?: string | null) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—');
const ahora = () => new Date().toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});

function cabecera(doc: any, titulo: string, sub: string, M: number, W: number) {
  doc.setFillColor(...C.naranja); doc.rect(0, 0, W, 2, 'F');
  doc.setTextColor(...C.negro); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(19);
  doc.text('LYCOS TEAM', M, 20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.claro);
  doc.text('MECÁNICA INTEGRAL · SAN ANTONIO DE LOS ALTOS', M, 25);
  doc.setTextColor(...C.negro); doc.setFontSize(12);
  doc.text(titulo, W - M, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.gris);
  doc.text(sub, W - M, 24, { align: 'right' });
  doc.setDrawColor(...C.borde); doc.line(M, 29, W - M, 29);
}

function pie(doc: any, texto: string, M: number, W: number, H: number) {
  const n = doc.internal.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(...C.claro);
    doc.text(texto, M, H - 7);
    doc.text(`Página ${p} de ${n}`, W - M, H - 7, { align: 'right' });
  }
}

function cifras(doc: any, y: number, M: number, W: number, lista: Array<[string, string, RGB]>) {
  const w = (W - M * 2 - (lista.length - 1) * 3) / lista.length;
  lista.forEach(([et, val, color], i) => {
    const x = M + i * (w + 3);
    doc.setDrawColor(...C.borde); doc.setFillColor(...C.fondo);
    doc.roundedRect(x, y, w, 15, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(...C.claro);
    doc.text(et, x + 3, y + 5);
    doc.setFontSize(11.5); doc.setTextColor(...color);
    doc.text(val, x + 3, y + 11.8);
  });
}

/** El reporte de todos los pendientes por cobrar. */
export function generarReportePendientesPDF(data: Cobranza) {
  const doc = new jsPDF('l', 'mm', 'a4') as any;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  cabecera(doc, 'CUENTAS POR COBRAR', `Al ${fecha(data.generado)} · generado ${ahora()}`, M, W);
  const r = data.resumen;
  cifras(doc, 33, M, W, [
    ['TOTAL POR COBRAR', usd(r.total), C.rojo],
    ['LO DEBEN LOS CLIENTES', usd(r.clientesDeben), C.ambar],
    ['LO FINANCIA CASHEA / BNC', usd(r.cashea), C.morado],
    ['CLIENTES', `${r.nClientes} (${r.nVentas} ventas)`, C.negro],
    ['CON MÁS DE 30 DÍAS', String(r.vencidas30), r.vencidas30 ? C.rojo : C.negro],
  ]);

  const filas: any[] = [];
  data.clientes.forEach((c, i) => {
    c.ventas.forEach((v, j) => {
      const ult = v.abonos.length ? v.abonos[v.abonos.length - 1] : null;
      filas.push([
        j === 0 ? String(i + 1) : '',
        j === 0 ? `${c.nombre}${c.telefono && /[1-9]/.test(c.telefono) ? `\n${c.telefono}` : ''}` : '',
        fecha(v.fecha),
        `${v.placa || '—'}${v.vehiculo ? `\n${v.vehiculo}` : ''}`,
        v.trabajo.slice(0, 90),
        usd(v.total),
        usd(v.abonado),
        ult ? `${usd(ult.monto)} · ${fecha(ult.fecha)}\n${ult.metodo || ''}` : 'Sin abonos',
        v.cashea ? `Cashea/BNC ${usd(v.financiado)}${v.porCobrar > 0.009 ? `\nCliente ${usd(v.porCobrar)}` : ''}` : 'Cliente',
        `${v.dias} d`,
        usd(v.saldo),
      ]);
    });
  });

  autoTable(doc, {
    startY: 53,
    head: [['#', 'CLIENTE', 'VENTA DEL', 'VEHÍCULO', 'TRABAJO', 'TOTAL', 'ABONADO', 'ÚLTIMO ABONO', 'QUIÉN DEBE', 'DÍAS', 'DEBE']],
    body: filas.length ? filas : [['', 'No hay cuentas por cobrar', '', '', '', '', '', '', '', '', '']],
    foot: [['', 'TOTAL', '', '', '', '', '', '', '', '', usd(r.total)]],
    theme: 'grid',
    headStyles: { fillColor: C.negro, textColor: C.blanco, fontSize: 6.5, fontStyle: 'bold', halign: 'center', cellPadding: 1.6 },
    bodyStyles: { fontSize: 6.6, cellPadding: 1.6, textColor: C.negro, lineColor: C.borde, valign: 'top' },
    footStyles: { fillColor: C.negro, textColor: C.blanco, fontSize: 7.5, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: C.fondo },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 38, fontStyle: 'bold' }, 2: { cellWidth: 17 },
      3: { cellWidth: 30 }, 4: { cellWidth: 'auto', textColor: C.gris }, 5: { cellWidth: 17, halign: 'right' },
      6: { cellWidth: 17, halign: 'right', textColor: C.verde }, 7: { cellWidth: 32 }, 8: { cellWidth: 28 },
      9: { cellWidth: 11, halign: 'center' }, 10: { cellWidth: 19, halign: 'right', fontStyle: 'bold', textColor: C.rojo },
    },
    didParseCell: (d: any) => {
      if (d.section === 'body' && d.column.index === 9 && parseInt(String(d.cell.raw), 10) > 30) {
        d.cell.styles.textColor = C.rojo; d.cell.styles.fontStyle = 'bold';
      }
      if (d.section === 'body' && d.column.index === 8 && String(d.cell.raw).startsWith('Cashea')) {
        d.cell.styles.textColor = C.morado;
      }
    },
    margin: { left: M, right: M, bottom: 14 },
  });

  pie(doc, 'Lycos Team · Cuentas por cobrar · Documento interno', M, W, H);
  doc.save(`Cuentas_por_cobrar_${data.generado}.pdf`);
}

/** La ficha de deuda de un cliente. */
export function generarFichaClientePDF(c: ClienteDeudor, generado: string) {
  const doc = new jsPDF('p', 'mm', 'a4') as any;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  cabecera(doc, 'ESTADO DE CUENTA', `Al ${fecha(generado)}`, M, W);

  let y = 36;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...C.negro);
  doc.text(c.nombre.toUpperCase(), M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.gris);
  const datos = [c.cedula, c.telefono && /[1-9]/.test(c.telefono) ? c.telefono : null].filter(Boolean).join('  ·  ');
  if (datos) doc.text(datos, M, y + 5);
  y += 10;

  cifras(doc, y, M, W, [
    ['DEBE EN TOTAL', usd(c.deuda), C.rojo],
    ['LO DEBE EL CLIENTE', usd(c.deudaCliente), C.ambar],
    ['LO FINANCIA CASHEA', usd(c.deudaCashea), C.morado],
    ['ÚLTIMO ABONO', c.ultimoAbono ? `${usd(c.ultimoAbono.monto)} · ${fecha(c.ultimoAbono.fecha)}` : 'Ninguno', C.negro],
  ]);
  y += 21;

  for (const v of c.ventas) {
    if (y > H - 60) { doc.addPage(); y = 20; }
    // El servicio.
    doc.setFillColor(...C.negro);
    doc.roundedRect(M, y, W - M * 2, 7, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8); doc.setTextColor(...C.blanco);
    doc.text(`${fecha(v.fecha)}  ·  ${v.placa || 'SIN PLACA'}${v.vehiculo ? `  ·  ${v.vehiculo.toUpperCase()}` : ''}`, M + 3, y + 4.8);
    doc.text(`DEBE ${usd(v.saldo)}`, W - M - 3, y + 4.8, { align: 'right' });
    y += 9;
    autoTable(doc, {
      startY: y,
      body: [
        ['Trabajo realizado', v.trabajo],
        ['Mecánico', v.mecanico || '—'],
        ['Total del servicio', usd(v.total)],
        ['Abonado', usd(v.abonado)],
        ...(v.cashea ? [['Financiado por Cashea (BNC)', usd(v.financiado)], ['Lo debe el cliente', usd(v.porCobrar)]] : []),
        ['Días desde la venta', `${v.dias} días`],
      ],
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.3, textColor: C.negro },
      columnStyles: { 0: { cellWidth: 48, textColor: C.gris, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 2;
    autoTable(doc, {
      startY: y,
      head: [['FECHA DEL ABONO', 'CÓMO PAGÓ', 'MONTO']],
      body: v.abonos.length
        ? v.abonos.map(a => [fecha(a.fecha), a.metodo || '—', usd(a.monto)])
        : [['—', 'Todavía no ha abonado', '—']],
      foot: v.abonos.length ? [['', 'TOTAL ABONADO', usd(v.abonos.reduce((s, a) => s + a.monto, 0))]] : undefined,
      theme: 'grid',
      headStyles: { fillColor: C.fondo, textColor: C.negro, fontSize: 7, fontStyle: 'bold', lineColor: C.borde },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.4, textColor: C.negro, lineColor: C.borde },
      footStyles: { fillColor: C.fondo, textColor: C.verde, fontSize: 7.5, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 28, halign: 'right' } },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  pie(doc, `Lycos Team · Estado de cuenta de ${c.nombre}`, M, W, H);
  doc.save(`Estado_de_cuenta_${c.nombre.replace(/\W+/g, '_')}_${generado}.pdf`);
}
