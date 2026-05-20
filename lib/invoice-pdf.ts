import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceData {
  id?: string;
  fecha: string;
  cliente?: string;
  vehiculo?: string;
  items: Array<{
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    total: number;
  }>;
  total: number;
  notas?: string;
  pago_usd?: number;
  pago_ves?: number;
  tasa_bcv?: number;
  tasa_cambio?: number;
  total_ves?: number;
  iva_aplicado?: boolean;
}

export interface PrintOptions {
  mode: 'single' | 'dual' | 'diferente';
  side?: 'left' | 'right';
  currencyMode?: 'usd' | 'dual' | 'auto';
}

export const generateInvoicePDF = (
  dataList: (InvoiceData & { iva_aplicado?: boolean; tasa_bcv?: number; total_ves?: number })[],
  options: PrintOptions = { mode: 'dual', currencyMode: 'dual' }
) => {
  // Orientation: Landscape (l), Unit: mm, Format: a4 (297x210)
  const doc = new jsPDF('l', 'mm', 'a4') as any;

  const drawInvoice = (data: any, startX: number) => {
    if (!data) return;

    // Colors
    const black = [15, 23, 42] as [number, number, number];
    const grayDark = [71, 85, 105] as [number, number, number];
    const grayLight = [148, 163, 184] as [number, number, number];
    const border = [226, 232, 240] as [number, number, number];
    const orange = [249, 115, 22] as [number, number, number];
    const white = [255, 255, 255] as [number, number, number];

    const margin = startX + 12;
    const rightAlign = startX + 136.5;

    // ── Header Section ──────────────────────────────────────────
    doc.setTextColor(...black);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bolditalic');
    doc.text('LYCOS TEAM', margin, 25);

    doc.setTextColor(...grayLight);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('MECÁNICA INTEGRAL', margin, 31);

    // Nota de Entrega Title (Top Right)
    doc.setTextColor(...grayLight);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTA DE ENTREGA #', rightAlign, 20, { align: 'right' });
    
    doc.setTextColor(...black);
    doc.setFontSize(14);
    doc.text(`${data.id?.slice(0, 8).toUpperCase() || 'TEMP-' + Date.now().toString().slice(-6)}`, rightAlign, 27, { align: 'right' });
    
    doc.setTextColor(...grayDark);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(data.fecha, rightAlign, 33, { align: 'right' });

    // Divider
    doc.setDrawColor(...border);
    doc.setLineWidth(0.4);
    doc.line(margin, 38, rightAlign, 38);

    // ── Client Info ─────────────────────────────────────────────
    doc.setTextColor(...grayLight);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE / TITULAR:', margin, 48);
    
    doc.setTextColor(...black);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(data.cliente?.toUpperCase() || 'CONSUMIDOR FINAL', margin, 54);
    
    doc.setTextColor(...grayLight);
    doc.setFontSize(7);
    doc.text('VEHÍCULO / MODELO:', rightAlign, 48, { align: 'right' });
    
    doc.setTextColor(...black);
    doc.setFontSize(11);
    doc.text(data.vehiculo?.toUpperCase() || '---', rightAlign, 54, { align: 'right' });

    // ── Table ───────────────────────────────────────────────────
    const bcvRateUsed = data.tasa_bcv || data.tasa_cambio || 518.0;
    const isDual = options.currencyMode === 'dual';

    const tableHead = isDual 
      ? [['DESCRIPCIÓN DEL SERVICIO', 'CANT', 'TOTAL BS', 'TOTAL USD']]
      : [['DESCRIPCIÓN DEL SERVICIO', 'CANT', 'TOTAL USD']];

    const tableRows = data.items.map((item: any) => isDual 
      ? [
          item.descripcion.toUpperCase(),
          item.cantidad,
          `${(Number(item.total) * bcvRateUsed).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`,
          `$${Number(item.total).toFixed(2)}`
        ]
      : [
          item.descripcion.toUpperCase(),
          item.cantidad,
          `$${Number(item.total).toFixed(2)}`
        ]
    );

    autoTable(doc, {
      startY: 62,
      head: tableHead,
      body: tableRows,
      theme: 'plain',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: black, 
        fontSize: 8, 
        fontStyle: 'bold',
        lineColor: black,
        lineWidth: { bottom: 1.2 }
      },
      styles: { 
        fontSize: 8, 
        textColor: [20, 20, 20],
        cellPadding: 3,
        font: 'helvetica'
      },
      columnStyles: isDual ? {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: grayDark },
        3: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: black }
      } : {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: black }
      },
      margin: { left: margin, right: (doc.internal.pageSize.width - rightAlign) }
    });

    // ── Totals Section ──────────────────────────────────────────
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    
    // Total Box
    const boxWidth = 75;
    const boxX = rightAlign - boxWidth;
    const boxY = finalY + 12;
    const boxHeight = 25;

    // Subtotal and IVA
    doc.setTextColor(...grayLight);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SUBTOTAL GENERAL', boxX, finalY + 5);
    doc.setTextColor(...grayDark);
    doc.text(`$${Number(data.total / (data.iva_aplicado ? 1.16 : 1)).toFixed(2)}`, rightAlign, finalY + 5, { align: 'right' });

    if (data.iva_aplicado) {
      doc.setTextColor(...grayLight);
      doc.text('IVA (16%)', boxX, finalY + 10);
      doc.setTextColor(...orange);
      doc.text(`+$${Number(data.total - (data.total / 1.16)).toFixed(2)}`, rightAlign, finalY + 10, { align: 'right' });
    }

    // BLACK BOX
    doc.setFillColor(...black);
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

    // Total USD
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.text('MONTO TOTAL USD', boxX + 4, boxY + 8);
    
    doc.setTextColor(...orange);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bolditalic');
    doc.text(`$${Number(data.total).toFixed(2)}`, rightAlign - 4, boxY + 9, { align: 'right' });

    // Total VES
    if (isDual) {
      doc.setDrawColor(255, 255, 255, 0.15);
      doc.line(boxX + 4, boxY + 13, rightAlign - 4, boxY + 13);

      doc.setTextColor(180, 180, 180);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('TOTAL EN BOLÍVARES (BS)', boxX + 4, boxY + 20);
      
      doc.setTextColor(...white);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const vesTotal = data.total_ves || (data.total * bcvRateUsed);
      doc.text(`${vesTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`, rightAlign - 4, boxY + 20, { align: 'right' });
    }

    // ── Bottom Info ─────────────────────────────────────────────
    let infoY = boxY + boxHeight + 10;
    
    if (isDual && (data.tasa_bcv || data.tasa_cambio)) {
      doc.setTextColor(...grayLight);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(`TASA DE CAMBIO BCV: ${data.tasa_bcv || data.tasa_cambio} Bs/$`, margin, infoY);
      infoY += 5;
    }

    // Notes if exists
    if (data.notas) {
      doc.setTextColor(...grayLight);
      doc.setFontSize(7);
      doc.text('NOTAS:', margin, infoY);
      doc.setTextColor(...grayDark);
      doc.setFontSize(7);
      const splitNotes = doc.splitTextToSize(data.notas.toUpperCase(), 100);
      doc.text(splitNotes, margin + 12, infoY);
    }

    doc.setTextColor(...grayDark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bolditalic');
    doc.text('¡GRACIAS POR CONFIAR EN LYCOS TEAM!', startX + 74.25, 194, { align: 'center' });

    doc.setTextColor(...grayLight);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('San Antonio de los Altos, Edo. Miranda - Lycos Team CRM 2026', startX + 74.25, 202, { align: 'center' });
  };

  if (options.mode === 'dual') {
    // If we have only one invoice, draw it twice
    const data1 = dataList[0];
    const data2 = dataList.length > 1 ? dataList[1] : dataList[0];

    drawInvoice(data1, 0);

    // Draw Vertical Cutting Line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(148.5, 10, 148.5, 200);
    doc.setLineDashPattern([], 0);

    drawInvoice(data2, 148.5);
  } else {
    // Single mode
    const startX = options.side === 'right' ? 148.5 : 0;
    
    // Draw Vertical Cutting Line (as reference)
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.05);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(148.5, 10, 148.5, 200);
    doc.setLineDashPattern([], 0);

    drawInvoice(dataList[0], startX);
  }

  // Save
  const fileName = dataList.length > 1 
    ? `Dual_Lycos_${dataList[0].id?.slice(0,4)}_${dataList[1].id?.slice(0,4)}.pdf`
    : `Nota_Lycos_${dataList[0].cliente?.replace(/\s/g, '_') || 'Cliente'}.pdf`;
    
  doc.save(fileName);
};

export const generateEgresoPDF = (data: InvoiceData & { categoria?: string }) => {
  const doc = new jsPDF() as any;

  // Colors
  const slate900 = [15, 23, 42] as [number, number, number];
  const slate600 = [71, 85, 105] as [number, number, number];
  const slate500 = [100, 116, 139] as [number, number, number];
  const slate400 = [148, 163, 184] as [number, number, number];
  const slate200 = [226, 232, 240] as [number, number, number];
  const accentRed = [225, 29, 72] as [number, number, number]; 

  // Header 
  doc.setTextColor(...slate900);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('LYCOS TEAM', 20, 30);

  doc.setTextColor(...slate500);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROBANTE DE EGRESO / PAGO', 20, 36);

  // Divider
  doc.setDrawColor(...slate200);
  doc.line(20, 50, 190, 50);

  // Table
  const tableRows = data.items.map((item, i) => [
    i + 1,
    item.descripcion,
    item.cantidad,
    `$${Number(item.precio_unitario).toFixed(2)}`,
    `$${Number(item.total).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 85,
    head: [['#', 'Concepto / Descripción', 'Cant.', 'Precio Unit.', 'Total']],
    body: tableRows,
    theme: 'plain',
    headStyles: { 
      fillColor: [255, 255, 255], 
      textColor: slate900, 
      fontSize: 9, 
      fontStyle: 'bold',
      lineColor: slate900,
      lineWidth: { bottom: 1 }
    },
    margin: { left: 20, right: 20 }
  });

  // Totals
  const finalY = (doc as any).lastAutoTable.finalY || 120;
  
  doc.setTextColor(...slate900);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PAGADO', 140, finalY + 15);
  
  doc.setTextColor(...accentRed);
  doc.text(`$${Number(data.total).toFixed(2)}`, 190, finalY + 15, { align: 'right' });

  // Save
  doc.save(`Egreso_Lycos_${data.fecha}_${data.id?.slice(0, 4) || 'E'}.pdf`);
};
