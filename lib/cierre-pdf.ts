import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CierreData {
  id?: string;
  sede_nombre: string;
  periodo: 'dia' | 'mes';
  fecha: string;             // DD/MM/YYYY for display
  fecha_inicio?: string;
  fecha_fin?: string;
  total_ingresos_usd: number;
  total_bs: number;
  tasa_bcv: number;
  total_clientes: number;
  total_ventas: number;
  desglose_pagos: {
    efectivo_usd?: number;
    zelle?: number;
    pago_movil_bs?: number;
    efectivo_bs?: number;
    transferencia_bs?: number;
    cashea_usd?: number;
    cashea_bs?: number;
    binance_usdt?: number;
    punto_venta_usd?: number;
    punto_venta_bs?: number;
    otro?: number;
    [key: string]: number | undefined;
  };
  ventas: Array<{
    fecha: string;
    cliente: string;
    descripcion: string;
    metodo_pago?: string;
    total_usd: number;
    total_bs: number;
    fuente?: 'pos' | 'ia' | 'scan';
  }>;
  comparativo?: {
    periodo_anterior_usd?: number;
    diferencia_pct?: number;
    periodo_label?: string;
  };
  inventario?: Array<{
    nombre: string;
    stock: number;
    precio_usd: number;
    precio_bs: number;
  }>;
  notas?: string;
  generado_por: string;
  generado_en: string;  // ISO timestamp
  servicios_detalle?: Array<{
    id: string;
    vehiculo: string;
    descripcion: string;
    estado: string;
    costo?: number;
    created_at: string;
  }>;
}

// Color palette
const C = {
  black:    [15, 23, 42] as [number, number, number],
  dark:     [30, 41, 59] as [number, number, number],
  gray:     [71, 85, 105] as [number, number, number],
  light:    [148, 163, 184] as [number, number, number],
  border:   [226, 232, 240] as [number, number, number],
  bg:       [248, 250, 252] as [number, number, number],
  orange:   [249, 115, 22] as [number, number, number],
  orangeL:  [255, 237, 213] as [number, number, number],
  green:    [34, 197, 94] as [number, number, number],
  greenL:   [220, 252, 231] as [number, number, number],
  blue:     [37, 99, 235] as [number, number, number],
  blueL:    [219, 234, 254] as [number, number, number],
  red:      [239, 68, 68] as [number, number, number],
  redL:     [254, 226, 226] as [number, number, number],
  white:    [255, 255, 255] as [number, number, number],
  purple:   [124, 58, 237] as [number, number, number],
};

function formatNum(n: number, dec = 2) {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function drawSection(doc: any, title: string, y: number, pageW: number) {
  const margin = 15;
  doc.setFillColor(...C.dark);
  doc.roundedRect(margin, y, pageW - margin * 2, 7, 1, 1, 'F');
  doc.setTextColor(...C.white);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), margin + 4, y + 4.7);
  return y + 10;
}

export function generateCierrePDF(data: CierreData) {
  const doc = new jsPDF('p', 'mm', 'a4') as any;
  const pageW = doc.internal.pageSize.getWidth();  // 210
  const pageH = doc.internal.pageSize.getHeight(); // 297
  const margin = 15;
  const colW = pageW - margin * 2;
  let y = margin;

  // ══════════════════════════════════════════════
  // HEADER
  // ══════════════════════════════════════════════
  // Orange accent bar top
  doc.setFillColor(...C.orange);
  doc.rect(0, 0, pageW, 2, 'F');

  // Logo area
  doc.setFillColor(...C.black);
  doc.roundedRect(margin, y, 55, 22, 2, 2, 'F');
  doc.setTextColor(...C.orange);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bolditalic');
  doc.text('LYCOS', margin + 4, y + 10);
  doc.setTextColor(...C.white);
  doc.text(' TEAM', margin + 22, y + 10);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 150, 150);
  doc.text('MECÁNICA INTEGRAL', margin + 4, y + 16);
  doc.text('San Antonio de los Altos, Miranda', margin + 4, y + 19.5);

  // Cierre title block (right)
  doc.setFillColor(...C.bg);
  doc.roundedRect(pageW - margin - 80, y, 80, 22, 2, 2, 'F');
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.8);
  doc.roundedRect(pageW - margin - 80, y, 80, 22, 2, 2, 'S');
  
  const periodoLabel = data.periodo === 'mes' ? `CIERRE MENSUAL` : `CIERRE DIARIO`;
  doc.setTextColor(...C.orange);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(periodoLabel, pageW - margin - 4, y + 7, { align: 'right' });
  
  doc.setTextColor(...C.dark);
  doc.setFontSize(8);
  doc.text(data.periodo === 'mes'
    ? `${data.fecha_inicio} — ${data.fecha_fin}`
    : data.fecha,
    pageW - margin - 4, y + 13, { align: 'right' });

  // Sede line
  doc.setTextColor(...C.black);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`SEDE: ${data.sede_nombre.toUpperCase()}`, pageW - margin - 4, y + 19, { align: 'right' });

  y += 28;

  // ══════════════════════════════════════════════
  // RESUMEN (4 KPI cards)
  // ══════════════════════════════════════════════
  const kpiW = colW / 4 - 2;
  const kpis = [
    { label: 'TOTAL USD', value: `$${formatNum(data.total_ingresos_usd)}`, color: C.orange, light: C.orangeL },
    { label: 'TOTAL BS.', value: `${formatNum(data.total_bs, 0)} Bs`, color: C.green, light: C.greenL },
    { label: 'CLIENTES', value: String(data.total_clientes), color: C.blue, light: C.blueL },
    { label: 'VENTAS', value: String(data.total_ventas), color: C.purple, light: [237, 233, 254] as [number, number, number] },
  ];

  kpis.forEach((k, i) => {
    const x = margin + i * (kpiW + 2.7);
    doc.setFillColor(...k.light);
    doc.roundedRect(x, y, kpiW, 18, 2, 2, 'F');
    doc.setFillColor(...k.color);
    doc.roundedRect(x, y, kpiW, 3, 1, 1, 'F');
    doc.rect(x, y + 1.5, kpiW, 1.5, 'F');

    doc.setTextColor(...k.color);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(k.label, x + kpiW / 2, y + 7, { align: 'center' });

    doc.setTextColor(...C.dark);
    doc.setFontSize(k.value.length > 10 ? 8 : 11);
    doc.setFont('helvetica', 'bold');
    doc.text(k.value, x + kpiW / 2, y + 14, { align: 'center' });
  });

  y += 22;

  // Tasa info
  doc.setTextColor(...C.gray);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tasa BCV utilizada: ${formatNum(data.tasa_bcv, 2)} Bs/$  ·  Generado: ${data.generado_en}  ·  Por: ${data.generado_por}`, margin, y);
  y += 6;

  // ══════════════════════════════════════════════
  // MÉTODOS DE PAGO
  // ══════════════════════════════════════════════
  y = drawSection(doc, 'METODOS DE PAGO', y, pageW);

  const pagosUSD: Array<[string, number, string]> = [
    ['Efectivo USD', data.desglose_pagos.efectivo_usd || 0, '$'],
    ['Zelle', data.desglose_pagos.zelle || 0, '$'],
    ['Cashea', data.desglose_pagos.cashea_usd || 0, '$'],
    ['Binance (USDT)', data.desglose_pagos.binance_usdt || 0, '$'],
    ['Punto de Venta USD', data.desglose_pagos.punto_venta_usd || 0, '$'],
    ['Euros (€)', data.desglose_pagos.euros || 0, '€'],
    ['Otro', data.desglose_pagos.otro || 0, '$'],
  ].filter(([, v]) => (v as number) > 0) as Array<[string, number, string]>;

  const pagosBS: Array<[string, number, string]> = [
    ['Pago Móvil', data.desglose_pagos.pago_movil_bs || 0, 'Bs'],
    ['Efectivo Bs.', data.desglose_pagos.efectivo_bs || 0, 'Bs'],
    ['Transferencia', data.desglose_pagos.transferencia_bs || 0, 'Bs'],
    ['Cashea (Bs)', data.desglose_pagos.cashea_bs || 0, 'Bs'],
    ['Punto de Venta Bs', data.desglose_pagos.punto_venta_bs || 0, 'Bs'],
  ].filter(([, v]) => (v as number) > 0) as Array<[string, number, string]>;

  const allPagos = [...pagosUSD.map(([l, v, c]) => [l, v > 0 ? `${c}${formatNum(v)}` : '—'] as [string, string]),
                   ...pagosBS.map(([l, v, c]) => [l, v > 0 ? `${formatNum(v)} ${c}` : '—'] as [string, string])];

  if (allPagos.length === 0) {
    allPagos.push(['Sin desglose registrado', '—']);
  }

  // Two-column payment layout
  const halfW = colW / 2 - 3;
  const leftPagos = allPagos.slice(0, Math.ceil(allPagos.length / 2));
  const rightPagos = allPagos.slice(Math.ceil(allPagos.length / 2));

  const drawPaymentTable = (items: [string, string][], startX: number, startY: number, width: number) => {
    let py = startY;
    items.forEach(([label, val], i) => {
      if (i % 2 === 0) {
        doc.setFillColor(...C.bg);
        doc.rect(startX, py - 1, width, 5.5, 'F');
      }
      doc.setTextColor(...C.gray);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(label, startX + 2, py + 3);
      doc.setTextColor(...C.dark);
      doc.setFont('helvetica', 'bold');
      doc.text(val, startX + width - 2, py + 3, { align: 'right' });
      py += 5.5;
    });
    return py;
  };

  const y1 = drawPaymentTable(leftPagos, margin, y, halfW);
  const y2 = drawPaymentTable(rightPagos, margin + halfW + 6, y, halfW);
  y = Math.max(y1, y2) + 4;

  // Comparativo (if available)
  if (data.comparativo?.periodo_anterior_usd !== undefined) {
    const diff = data.total_ingresos_usd - data.comparativo.periodo_anterior_usd;
    const pct = data.comparativo.diferencia_pct ?? (data.comparativo.periodo_anterior_usd > 0
      ? ((diff / data.comparativo.periodo_anterior_usd) * 100)
      : 0);
    const isPositive = diff >= 0;

    doc.setFillColor(...(isPositive ? C.greenL : C.redL));
    doc.roundedRect(margin, y, colW, 8, 2, 2, 'F');
    doc.setTextColor(...(isPositive ? C.green : C.red));
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `COMPARATIVO vs ${data.comparativo.periodo_label || 'Período Anterior'}: ` +
      `${isPositive ? '+' : ''}${formatNum(diff)} USD (${isPositive ? '+' : ''}${Number(pct).toFixed(1)}%)`,
      pageW / 2, y + 5, { align: 'center' }
    );
    y += 12;
  }

  // ══════════════════════════════════════════════
  // VENTAS DEL PERÍODO
  // ══════════════════════════════════════════════
  if (data.ventas && data.ventas.length > 0) {
    y = drawSection(doc, 'VENTAS DEL PERIODO', y, pageW);

    const fuenteLabel = (f?: string) => f === 'ia' ? 'IA' : f === 'scan' ? 'Scan' : 'POS';

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Cliente', 'Descripción', 'Método', 'USD', 'Bs.', 'Fuente']],
      body: data.ventas.map(v => [
        v.fecha,
        (v.cliente || 'Cons. Final').substring(0, 18),
        v.descripcion.substring(0, 30),
        v.metodo_pago || '—',
        `$${formatNum(v.total_usd)}`,
        `${formatNum(v.total_bs, 0)} Bs`,
        fuenteLabel(v.fuente)
      ]),
      foot: [['', '', '', 'TOTAL', `$${formatNum(data.total_ingresos_usd)}`, `${formatNum(data.total_bs, 0)} Bs`, '']],
      theme: 'plain',
      headStyles: {
        fillColor: C.dark,
        textColor: C.white,
        fontSize: 6.5,
        fontStyle: 'bold',
        cellPadding: 2,
      },
      bodyStyles: { fontSize: 6.5, cellPadding: 2, textColor: C.dark },
      footStyles: {
        fillColor: C.orange,
        textColor: C.white,
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 2,
      },
      alternateRowStyles: { fillColor: C.bg },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 32 },
        2: { cellWidth: 55 },
        3: { cellWidth: 22 },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 13, halign: 'center' },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ══════════════════════════════════════════════
  // INVENTARIO SNAPSHOT
  // ══════════════════════════════════════════════
  if (data.inventario && data.inventario.length > 0) {
    // Check if need new page
    if (y > pageH - 60) {
      doc.addPage();
      doc.setFillColor(...C.orange);
      doc.rect(0, 0, pageW, 2, 'F');
      y = margin;
    }

    y = drawSection(doc, 'INVENTARIO ACTUAL', y, pageW);

    autoTable(doc, {
      startY: y,
      head: [['Producto', 'Stock', 'Precio USD', 'Precio BCV (Bs)']],
      body: data.inventario.map(p => [
        p.nombre,
        p.stock,
        `$${formatNum(p.precio_usd)}`,
        `${formatNum(p.precio_bs, 0)} Bs`,
      ]),
      theme: 'plain',
      headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
      bodyStyles: { fontSize: 7, cellPadding: 2, textColor: C.dark },
      alternateRowStyles: { fillColor: C.bg },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ══════════════════════════════════════════════
  // NOTAS
  // ══════════════════════════════════════════════
  if (data.notas?.trim()) {
    if (y > pageH - 40) { doc.addPage(); doc.setFillColor(...C.orange); doc.rect(0,0,pageW,2,'F'); y = margin; }
    y = drawSection(doc, 'OBSERVACIONES Y NOTAS', y, pageW);
    doc.setFillColor(...C.bg);
    doc.roundedRect(margin, y, colW, 20, 2, 2, 'F');
    doc.setTextColor(...C.dark);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(data.notas, colW - 8);
    doc.text(splitNotes, margin + 4, y + 6);
    y += 24;
  }

  // ══════════════════════════════════════════════
  // SEGUIMIENTO DE SERVICIOS (Nueva Página)
  // ══════════════════════════════════════════════
  if (data.servicios_detalle && data.servicios_detalle.length > 0) {
    doc.addPage();
    doc.setFillColor(...C.orange);
    doc.rect(0, 0, pageW, 2, 'F');
    y = margin;

    y = drawSection(doc, 'SEGUIMIENTO Y TRACKING DE SERVICIOS', y, pageW);

    const statusMap: Record<string, string> = {
      'pendiente': 'PENDIENTE',
      'confirmado': 'CONFIRMADO',
      'en_proceso': 'EN PROCESO',
      'esperando_repuestos': 'ESP. REPUESTOS',
      'terminado': 'TERMINADO',
      'entregado': 'ENTREGADO'
    };

    autoTable(doc, {
      startY: y,
      head: [['ID', 'Vehículo', 'Descripción del Trabajo', 'Estado / Tracking', 'Fecha']],
      body: data.servicios_detalle.map(s => [
        s.id.slice(0, 6).toUpperCase(),
        (s.vehiculo || '---').toUpperCase(),
        s.descripcion.toUpperCase(),
        statusMap[s.estado] || s.estado.toUpperCase(),
        new Date(s.created_at).toLocaleDateString('es-VE')
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: C.black,
        textColor: C.white,
        fontSize: 7,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 7,
        cellPadding: 3,
        textColor: C.dark
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 35 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 20, halign: 'center' }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw;
          if (val === 'TERMINADO' || val === 'ENTREGADO') doc.setTextColor(...C.green);
          else if (val === 'EN PROCESO') doc.setTextColor(...C.blue);
          else if (val === 'PENDIENTE') doc.setTextColor(...C.orange);
        }
      },
      margin: { left: margin, right: margin }
    });
  }

  // ══════════════════════════════════════════════
  // FOOTER (last page)
  // ══════════════════════════════════════════════
  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    // Footer bar
    doc.setFillColor(...C.dark);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setFillColor(...C.orange);
    doc.rect(0, pageH - 12, 3, 12, 'F');

    doc.setTextColor(...C.light);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Lycos Team · ${data.sede_nombre} · Cierre ${data.periodo === 'mes' ? 'mensual' : 'diario'} · ${data.fecha}`, margin, pageH - 6);
    doc.text(`Pág. ${pg} / ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });

    // Signature line
    if (pg === totalPages) {
      const sigY = pageH - 18;
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.line(margin, sigY, margin + 60, sigY);
      doc.line(pageW - margin - 60, sigY, pageW - margin, sigY);
      doc.setTextColor(...C.light);
      doc.setFontSize(6);
      doc.text('Elaborado por', margin, sigY + 4);
      doc.text('Autorizado por', pageW - margin - 60, sigY + 4);
      doc.setTextColor(...C.dark);
      doc.setFont('helvetica', 'bold');
      doc.text(data.generado_por, margin, sigY + 8);
    }
  }

  // Save
  const label = data.periodo === 'mes'
    ? `Cierre_Mensual_${data.sede_nombre.replace(/\s/g, '_')}_${data.fecha_inicio?.replace(/\//g, '-') || data.fecha}`
    : `Cierre_Diario_${data.sede_nombre.replace(/\s/g, '_')}_${data.fecha.replace(/\//g, '-')}`;
  doc.save(`${label}.pdf`);
}
