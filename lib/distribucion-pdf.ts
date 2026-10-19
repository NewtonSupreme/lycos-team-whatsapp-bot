import { jsPDF } from 'jspdf';
import { RIF_TEXTO } from '@/lib/empresa';
import autoTable from 'jspdf-autotable';
import { Distribucion } from '@/types';

// ──────────────────────────────────────────────────────────────────────────────
// NOTA DE ENTREGA — Distribución de Inventario (Corporate Professional Design)
// Lycos Team — Módulo Distribuidor
// ──────────────────────────────────────────────────────────────────────────────

export function generateNotaEntregaPDF(distribucion: Distribucion, tasaBCV: number = 0): void {
  const doc = new jsPDF('p', 'mm', 'a4') as any; // Portrait, A4
  const pageW = 210;
  const pageH = 297;
  const margin = 20;
  const rightEdge = pageW - margin;

  // ── Color Palette (Corporate, Minimalist, Grayscale focused) ────────────────
  const textDark    = [30, 41, 59]   as [number, number, number]; // slate-800
  const textMuted   = [100, 116, 139] as [number, number, number]; // slate-500
  const borderLight = [226, 232, 240] as [number, number, number]; // slate-200
  const borderDark  = [148, 163, 184] as [number, number, number]; // slate-400
  const bgLight     = [248, 250, 252] as [number, number, number]; // slate-50
  const accent      = [15, 23, 42]    as [number, number, number]; // slate-900

  let y = margin;

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Logo / Company Name
  doc.setTextColor(...accent);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('LYCOS TEAM', margin, y + 6);
  
  doc.setTextColor(...textDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('INVERSIONES LYCOS 7000, C.A', margin, y + 11);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);
  doc.text(RIF_TEXTO, margin, y + 15);
  doc.text('Ctra. Panamericana Km. 14, Local Los Llaneros', margin, y + 19);
  doc.text('San Antonio de Los Altos, Edo. Miranda, Z.P. 1204', margin, y + 23);
  doc.text('Teléfonos: (0212) 3727331 / (0412) 3343519', margin, y + 27);
  doc.text('Correo: lycosteam7@gmail.com', margin, y + 31);

  // Document Title & Number
  doc.setTextColor(...accent);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTA DE ENTREGA', rightEdge, y + 8, { align: 'right' });
  
  doc.setTextColor(...textDark);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº ${distribucion.numero_nota}`, rightEdge, y + 15, { align: 'right' });

  // Date & Status
  const formattedDate = new Date(distribucion.fecha + 'T12:00:00').toLocaleDateString('es-VE', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  doc.setTextColor(...textMuted);
  doc.setFontSize(9);
  doc.text(`Fecha de emisión:`, rightEdge, y + 23, { align: 'right' });
  
  doc.setTextColor(...textDark);
  doc.setFont('helvetica', 'bold');
  doc.text(`${formattedDate}`, rightEdge, y + 27, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);
  const statusText = distribucion.estado.toUpperCase().replace('_', ' ');
  doc.text(`Estado: ${statusText}`, rightEdge, y + 31, { align: 'right' });

  y += 40;

  // Divider
  doc.setDrawColor(...borderDark);
  doc.setLineWidth(0.4);
  doc.line(margin, y, rightEdge, y);
  y += 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // INFO SECTION — Origen / Destino
  // ═══════════════════════════════════════════════════════════════════════════
  const colW = (rightEdge - margin) / 2 - 5;
  const col2X = margin + colW + 10;

  // ORIGEN
  doc.setTextColor(...textMuted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ORIGEN (DESPACHA)', margin, y);
  
  doc.setTextColor(...textDark);
  doc.setFontSize(11);
  doc.text(distribucion.sede_origen_nombre.toUpperCase(), margin, y + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...textMuted);
  doc.text(`Responsable: ${distribucion.responsable}`, margin, y + 10);

  // DESTINO
  doc.setTextColor(...textMuted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DESTINO (RECIBE)', col2X, y);
  
  doc.setTextColor(...textDark);
  doc.setFontSize(11);
  doc.text(distribucion.sede_destino_nombre.toUpperCase(), col2X, y + 5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...textMuted);
  doc.text(`Recibe: ${distribucion.recibe || '________________________'}`, col2X, y + 10);

  y += 18;

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLA DE PRODUCTOS
  // ═══════════════════════════════════════════════════════════════════════════
  const tableBody = distribucion.items.map((item, idx) => {
    const subtotalUSD = item.cantidad * item.precio_usd;
    return [
      String(idx + 1).padStart(2, '0'),
      item.codigo || '—',
      item.nombre.toUpperCase(),
      item.marca?.toUpperCase() || '—',
      String(item.cantidad),
      item.unidad.toUpperCase(),
      `$${item.precio_usd.toFixed(2)}`,
      `$${subtotalUSD.toFixed(2)}`
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'CÓDIGO', 'DESCRIPCIÓN DEL PRODUCTO', 'MARCA', 'CANT.', 'UNID.', 'PRECIO', 'SUBTOTAL']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: bgLight,
      textColor: textDark,
      fontSize: 8,
      fontStyle: 'bold',
      lineColor: borderLight,
      lineWidth: 0.1,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: textDark,
      lineColor: borderLight,
      lineWidth: 0.1,
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: [252, 253, 255] as [number, number, number],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', textColor: textMuted },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 15, halign: 'center', textColor: textMuted },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // TOTALES
  // ═══════════════════════════════════════════════════════════════════════════
  const summaryBoxW = 80;
  const summaryX = rightEdge - summaryBoxW;

  // Left side: Stats summary (clean text)
  doc.setTextColor(...textMuted);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total de items distintos: ${distribucion.total_items}`, margin, y + 5);
  doc.text(`Unidades totales despachadas: ${distribucion.total_unidades}`, margin, y + 10);

  // Right side: Totals
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...textDark);
  doc.text('TOTAL GENERAL', summaryX, y + 5);
  
  doc.setFontSize(14);
  doc.text(`$${distribucion.valor_total_usd.toFixed(2)}`, rightEdge, y + 5, { align: 'right' });

  if (tasaBCV > 0) {
    const totalBS = distribucion.valor_total_usd * tasaBCV;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    doc.text(`Total en Bs: ${totalBS.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rightEdge, y + 11, { align: 'right' });
    doc.setFontSize(7);
    doc.text(`(Tasa BCV: ${tasaBCV.toFixed(2)} Bs/$)`, rightEdge, y + 15, { align: 'right' });
  }

  y += 28;

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVACIONES
  // ═══════════════════════════════════════════════════════════════════════════
  if (distribucion.observaciones) {
    doc.setDrawColor(...borderLight);
    doc.setFillColor(...bgLight);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, rightEdge - margin, 20, 'FD');

    doc.setTextColor(...textDark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', margin + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    const splitObs = doc.splitTextToSize(distribucion.observaciones, rightEdge - margin - 8);
    doc.text(splitObs, margin + 4, y + 11);
    
    y += 28;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIRMAS
  // ═══════════════════════════════════════════════════════════════════════════
  // Always push signatures to the bottom if there is space, or just after content
  const signatureY = Math.max(y + 20, pageH - 50);
  
  const firmaW = 45;
  const firmaSpacing = (rightEdge - margin - firmaW * 3) / 2;

  const firmas = [
    { titulo: 'ELABORADO POR', nombre: distribucion.responsable, rol: 'Despacho - ' + distribucion.sede_origen_nombre },
    { titulo: 'TRASLADO / CHOFER', nombre: '________________________', rol: 'Responsable del traslado' },
    { titulo: 'RECIBIDO CONFORME', nombre: distribucion.recibe || '________________________', rol: 'Recepción - ' + distribucion.sede_destino_nombre },
  ];

  firmas.forEach((firma, i) => {
    const fx = margin + i * (firmaW + firmaSpacing);
    
    // Line
    doc.setDrawColor(...borderDark);
    doc.setLineWidth(0.3);
    doc.line(fx, signatureY, fx + firmaW, signatureY);

    // Title
    doc.setTextColor(...textDark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(firma.titulo, fx + firmaW / 2, signatureY + 5, { align: 'center' });

    // Name
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(firma.nombre.toUpperCase(), fx + firmaW / 2, signatureY + 9, { align: 'center' });

    // Role
    doc.setTextColor(...textMuted);
    doc.setFontSize(7);
    doc.text(firma.rol, fx + firmaW / 2, signatureY + 13, { align: 'center' });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 15, rightEdge, pageH - 15);

  doc.setTextColor(...textMuted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento generado automáticamente por Lycos Team System', margin, pageH - 10);
  doc.text(`Impreso el: ${new Date().toLocaleString('es-VE')}`, rightEdge, pageH - 10, { align: 'right' });

  // ── Save ──────────────────────────────────────────────────────────────────
  const fileName = `Nota_Entrega_${distribucion.numero_nota}_${distribucion.sede_destino_nombre.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
