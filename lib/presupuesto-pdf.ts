import { jsPDF } from 'jspdf';
import { RIF_TEXTO } from '@/lib/empresa';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PresupuestoPDFData {
  numero: string;
  created_at: string;
  fecha_expiracion?: string | null;
  cliente_nombre: string;
  cliente_telefono?: string | null;
  cliente_cedula?: string | null;
  cliente_direccion?: string | null;
  vehiculo_info?: string | null;
  moneda: string;
  tasa_cambio?: number | null;
  items: Array<{
    tipo: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    moneda: string;
    total: number;
  }>;
  subtotal: number;
  descuento: number;
  descuento_tipo: string;
  iva: number;
  total: number;
  notas?: string | null;
  condiciones?: string | null;
  estado: string;
  validez_dias: number;
}

export function generatePresupuestoPDF(data: PresupuestoPDFData) {
  const doc = new jsPDF('p', 'mm', 'a4') as any;

  const black = [15, 23, 42] as [number, number, number];
  const grayDark = [71, 85, 105] as [number, number, number];
  const grayLight = [148, 163, 184] as [number, number, number];
  const border = [226, 232, 240] as [number, number, number];
  const orange = [249, 115, 22] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const green = [34, 197, 94] as [number, number, number];
  const red = [239, 68, 68] as [number, number, number];

  const margin = 20;
  const rightMargin = 190;

  const sym = data.moneda === 'EUR' ? '€' : data.moneda === 'VES' ? 'Bs.' : '$';

  // ── HEADER ──────────────────────────────────────────────────────────
  // Logo area
  doc.setFillColor(...black);
  doc.roundedRect(margin, 15, 50, 18, 3, 3, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bolditalic');
  doc.text('LYCOS TEAM', margin + 5, 27);
  doc.setTextColor(...orange);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(`MECÁNICA INTEGRAL · ${RIF_TEXTO}`, margin + 5, 32);

  // Presupuesto badge
  doc.setFillColor(249, 115, 22, 0.1);
  doc.setDrawColor(...orange);
  doc.roundedRect(rightMargin - 55, 15, 55, 18, 3, 3, 'DF');
  doc.setTextColor(...orange);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('PRESUPUESTO', rightMargin - 3, 22, { align: 'right' });
  doc.setTextColor(...black);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(data.numero, rightMargin - 3, 30, { align: 'right' });

  // Fecha
  doc.setTextColor(...grayDark);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const fechaCreado = data.created_at
    ? format(new Date(data.created_at), "d 'de' MMMM, yyyy", { locale: es })
    : '-';
  doc.text(`Emitido: ${fechaCreado}`, margin, 45);

  if (data.fecha_expiracion) {
    const fechaExp = format(new Date(data.fecha_expiracion), "d 'de' MMMM, yyyy", { locale: es });
    doc.setTextColor(...red);
    doc.text(`Válido hasta: ${fechaExp}`, margin, 51);
  } else {
    doc.text(`Válido por: ${data.validez_dias} días`, margin, 51);
  }

  // Estado badge
  const estadoColors: Record<string, [number, number, number]> = {
    borrador: grayDark,
    enviado: [59, 130, 246],
    aprobado: green,
    rechazado: red,
    vencido: grayLight,
    convertido: [168, 85, 247],
  };
  const estadoColor = estadoColors[data.estado] || grayDark;
  doc.setFillColor(...estadoColor);
  doc.roundedRect(rightMargin - 40, 40, 40, 8, 2, 2, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(data.estado.toUpperCase(), rightMargin - 20, 46, { align: 'center' });

  // Divider
  doc.setDrawColor(...border);
  doc.setLineWidth(0.4);
  doc.line(margin, 56, rightMargin, 56);

  // ── CLIENT INFO ────────────────────────────────────────────────────
  doc.setTextColor(...grayLight);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', margin, 65);

  doc.setTextColor(...black);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(data.cliente_nombre.toUpperCase() || 'CONSUMIDOR FINAL', margin, 72);

  let infoY = 78;
  if (data.cliente_cedula) {
    doc.setTextColor(...grayDark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Cédula: ${data.cliente_cedula}`, margin, infoY);
    infoY += 5;
  }
  if (data.cliente_telefono) {
    doc.setTextColor(...grayDark);
    doc.setFontSize(8);
    doc.text(`Teléfono: ${data.cliente_telefono}`, margin, infoY);
    infoY += 5;
  }
  if (data.cliente_direccion) {
    doc.setTextColor(...grayDark);
    doc.setFontSize(8);
    const dirSplit = doc.splitTextToSize(data.cliente_direccion, 80);
    doc.text(dirSplit, margin, infoY);
  }

  // Vehicle info
  if (data.vehiculo_info) {
    doc.setTextColor(...grayLight);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('VEHÍCULO', rightMargin, 65, { align: 'right' });

    doc.setTextColor(...black);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(data.vehiculo_info.toUpperCase(), rightMargin, 72, { align: 'right' });
  }

  // ── TABLE ──────────────────────────────────────────────────────
  const hasDiscount = data.descuento > 0;
  const hasIVA = data.iva > 0;

  const tableHead = [
    ['#', 'DESCRIPCIÓN', 'TIPO', 'CANT', 'P.UNIT', 'TOTAL']
  ];

  const tableRows = data.items.map((item, index) => [
    index + 1,
    item.descripcion.toUpperCase(),
    item.tipo === 'servicio' ? 'SERVICIO' : item.tipo === 'repuesto' ? 'REPUESTO' : 'OTRO',
    item.cantidad,
    `${sym}${Number(item.precio_unitario).toFixed(2)}`,
    `${sym}${Number(item.total).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: Math.max(infoY + 8, 88),
    head: tableHead,
    body: tableRows,
    theme: 'plain',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: black,
      fontSize: 7,
      fontStyle: 'bold',
      lineColor: black,
      lineWidth: { bottom: 0.8 }
    },
    styles: {
      fontSize: 8,
      textColor: [20, 20, 20],
      cellPadding: 2.5,
      font: 'helvetica'
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: margin, right: margin }
  });

  // ── TOTALS ─────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable.finalY || 120;
  let totalY = finalY + 10;

  // Right-aligned totals box
  const boxX = rightMargin - 70;
  const boxW = 70;

  // Subtotal
  doc.setTextColor(...grayDark);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('SUBTOTAL', boxX, totalY);
  doc.text(`${sym}${Number(data.subtotal).toFixed(2)}`, rightMargin, totalY, { align: 'right' });
  totalY += 6;

  // Descuento
  if (hasDiscount) {
    doc.setTextColor(...red);
    doc.setFontSize(8);
    const descLabel = data.descuento_tipo === 'porcentaje'
      ? `DESCUENTO (${data.descuento}%)`
      : 'DESCUENTO';
    doc.text(descLabel, boxX, totalY);
    const descMonto = data.descuento_tipo === 'porcentaje'
      ? data.subtotal * (data.descuento / 100)
      : data.descuento;
    doc.text(`-${sym}${Number(descMonto).toFixed(2)}`, rightMargin, totalY, { align: 'right' });
    totalY += 6;
  }

  // IVA
  if (hasIVA) {
    doc.setTextColor(...orange);
    doc.setFontSize(8);
    doc.text('IVA (16%)', boxX, totalY);
    doc.text(`+${sym}${Number(data.iva).toFixed(2)}`, rightMargin, totalY, { align: 'right' });
    totalY += 8;
  } else {
    totalY += 2;
  }

  // Divider
  doc.setDrawColor(...border);
  doc.setLineWidth(0.3);
  doc.line(boxX, totalY, rightMargin, totalY);
  totalY += 6;

  // Total - big box
  doc.setFillColor(...black);
  doc.roundedRect(boxX, totalY, boxW, 20, 2, 2, 'F');

  doc.setTextColor(180, 180, 180);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PRESUPUESTO', boxX + 4, totalY + 7);

  doc.setTextColor(...orange);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bolditalic');
  doc.text(`${sym}${Number(data.total).toFixed(2)}`, rightMargin - 4, totalY + 14, { align: 'right' });

  totalY += 30;

  // Tasa de cambio
  if (data.moneda !== 'VES' && data.tasa_cambio) {
    doc.setTextColor(...grayDark);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const tasaLabel = data.moneda === 'EUR' ? 'TASA DE CAMBIO EUR' : 'TASA DE CAMBIO BCV';
    const tasaStr = data.moneda === 'EUR'
      ? `€1 = ${Number(data.tasa_cambio).toFixed(2)} Bs.`
      : `$1 = ${Number(data.tasa_cambio).toFixed(2)} Bs.`;
    doc.text(`${tasaLabel}: ${tasaStr}`, boxX, totalY);

    // Equivalent in VES
    doc.setTextColor(...black);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const totalVes = data.total * (data.tasa_cambio || 1);
    doc.text(`${totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`, rightMargin, totalY, { align: 'right' });
    totalY += 10;
  }

  // ── TERMS AND CONDITIONS ───────────────────────────────────────
  if (data.condiciones || data.notas) {
    totalY += 4;
    doc.setDrawColor(...border);
    doc.setLineWidth(0.2);
    doc.line(margin, totalY, rightMargin, totalY);
    totalY += 6;

    if (data.condiciones) {
      doc.setTextColor(...grayLight);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('TÉRMINOS Y CONDICIONES', margin, totalY);
      totalY += 4;

      doc.setTextColor(...grayDark);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      const condSplit = doc.splitTextToSize(data.condiciones, rightMargin - margin);
      doc.text(condSplit, margin, totalY);
      totalY += condSplit.length * 4 + 4;
    }

    if (data.notas) {
      doc.setTextColor(...grayLight);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTAS', margin, totalY);
      totalY += 4;

      doc.setTextColor(...grayDark);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      const notesSplit = doc.splitTextToSize(data.notas, rightMargin - margin);
      doc.text(notesSplit, margin, totalY);
    }
  }

  // ── FOOTER ─────────────────────────────────────────────────────
  doc.setDrawColor(...border);
  doc.setLineWidth(0.4);
  doc.line(margin, 282, rightMargin, 282);

  doc.setTextColor(...grayLight);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('San Antonio de los Altos, Edo. Miranda - Lycos Team CRM 2026', margin, 288);
  doc.text(`Documento generado el ${format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}`, rightMargin, 288, { align: 'right' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bolditalic');
  doc.setTextColor(...grayDark);
  doc.text('¡GRACIAS POR CONFIAR EN LYCOS TEAM!', 105, 294, { align: 'center' });

  // Save
  doc.save(`Presupuesto_${data.numero.replace(/\//g, '-')}.pdf`);
}
