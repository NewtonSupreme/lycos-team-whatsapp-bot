import { jsPDF } from 'jspdf';
import { RIF_TEXTO } from '@/lib/empresa';
import autoTable from 'jspdf-autotable';
import { NotaGanancia } from '@/types';

// ──────────────────────────────────────────────────────────────────────────────
// NOTA DE GANANCIA — Fabricante → Distribuidor → Reventa (CONFIDENCIAL)
// Lycos Team — Módulo Distribuidor / Ganancias
// ──────────────────────────────────────────────────────────────────────────────

export function generateNotaGananciaPDF(nota: NotaGanancia, tasaBCV: number = 0): void {
  const doc = new jsPDF('p', 'mm', 'a4') as any;
  const pageW = 210;
  const pageH = 297;
  const margin = 20;
  const rightEdge = pageW - margin;

  // ── Color Palette ────────────────────────────────────────────────────────────
  const textDark    = [30, 41, 59]    as [number, number, number]; // slate-800
  const textMuted   = [100, 116, 139] as [number, number, number]; // slate-500
  const borderLight = [226, 232, 240] as [number, number, number]; // slate-200
  const borderDark  = [148, 163, 184] as [number, number, number]; // slate-400
  const bgLight     = [248, 250, 252] as [number, number, number]; // slate-50
  const accent      = [15, 23, 42]    as [number, number, number]; // slate-900
  const green       = [22, 163, 74]   as [number, number, number]; // green-600
  const amber       = [180, 83, 9]    as [number, number, number]; // amber-700

  let y = margin;

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════
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
  doc.text('Documento interno — uso administrativo', margin, y + 27);

  // Title & number
  doc.setTextColor(...accent);
  doc.setFontSize(19);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTA DE GANANCIA', rightEdge, y + 8, { align: 'right' });

  doc.setTextColor(...textDark);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº ${nota.numero_nota}`, rightEdge, y + 15, { align: 'right' });

  const formattedDate = new Date(nota.fecha + 'T12:00:00').toLocaleDateString('es-VE', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  doc.setTextColor(...textMuted);
  doc.setFontSize(9);
  doc.text('Fecha de emisión:', rightEdge, y + 23, { align: 'right' });
  doc.setTextColor(...textDark);
  doc.setFont('helvetica', 'bold');
  doc.text(`${formattedDate}`, rightEdge, y + 27, { align: 'right' });

  // Confidential badge
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...amber);
  doc.setFontSize(8);
  doc.text('CONFIDENCIAL', rightEdge, y + 32, { align: 'right' });

  y += 40;

  doc.setDrawColor(...borderDark);
  doc.setLineWidth(0.4);
  doc.line(margin, y, rightEdge, y);
  y += 8;

  // ═══════════════════════════════════════════════════════════════════════════
  // INFO — Cliente / Responsable
  // ═══════════════════════════════════════════════════════════════════════════
  const colW = (rightEdge - margin) / 2 - 5;
  const col2X = margin + colW + 10;

  doc.setTextColor(...textMuted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE / REVENTA A', margin, y);
  doc.setTextColor(...textDark);
  doc.setFontSize(11);
  doc.text(nota.cliente.toUpperCase(), margin, y + 5);

  doc.setTextColor(...textMuted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ELABORADO POR', col2X, y);
  doc.setTextColor(...textDark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(nota.responsable.toUpperCase(), col2X, y + 5);

  y += 16;

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLA DE PRODUCTOS — Costo Fabricante vs Reventa vs Ganancia
  // ═══════════════════════════════════════════════════════════════════════════
  const tableBody = nota.items.map((item, idx) => [
    String(idx + 1).padStart(2, '0'),
    item.codigo || '—',
    item.nombre.toUpperCase(),
    String(item.cantidad),
    `$${item.precio_fabricante.toFixed(2)}`,
    `$${item.precio_venta.toFixed(2)}`,
    `$${item.ganancia_unit.toFixed(2)}`,
    `$${item.ganancia_total.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'CÓDIGO', 'PRODUCTO', 'CANT.', 'COSTO FAB.', 'REVENTA', 'GAN./U', 'GANANCIA']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: bgLight, textColor: textDark, fontSize: 8, fontStyle: 'bold',
      lineColor: borderLight, lineWidth: 0.1, cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8, textColor: textDark, lineColor: borderLight, lineWidth: 0.1, cellPadding: 3,
    },
    alternateRowStyles: { fillColor: [252, 253, 255] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center', textColor: textMuted },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 22, halign: 'right', textColor: amber },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: green },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // TOTALES
  // ═══════════════════════════════════════════════════════════════════════════
  const margenPct = nota.total_venta > 0 ? (nota.total_ganancia / nota.total_venta) * 100 : 0;

  const boxX = rightEdge - 90;
  const lineH = 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);
  doc.text('Costo total fabricante:', boxX, y + 5);
  doc.setTextColor(...amber);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${nota.total_costo.toFixed(2)}`, rightEdge, y + 5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);
  doc.text('Total reventa:', boxX, y + 5 + lineH);
  doc.setTextColor(...textDark);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${nota.total_venta.toFixed(2)}`, rightEdge, y + 5 + lineH, { align: 'right' });

  // Ganancia destacada
  doc.setDrawColor(...borderLight);
  doc.setFillColor(...bgLight);
  doc.rect(boxX - 4, y + 5 + lineH * 2 - 4, 94, 12, 'FD');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accent);
  doc.text('GANANCIA NETA', boxX, y + 5 + lineH * 2 + 3);
  doc.setFontSize(14);
  doc.setTextColor(...green);
  doc.text(`$${nota.total_ganancia.toFixed(2)}`, rightEdge, y + 5 + lineH * 2 + 3, { align: 'right' });

  // Left side: margin %
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);
  doc.text(`Margen de ganancia: ${margenPct.toFixed(1)}%`, margin, y + 5);
  if (tasaBCV > 0) {
    const ganBs = nota.total_ganancia * tasaBCV;
    doc.text(`Ganancia en Bs: ${ganBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, y + 11);
    doc.setFontSize(7);
    doc.text(`(Tasa BCV: ${tasaBCV.toFixed(2)} Bs/$)`, margin, y + 15);
  }

  y += 5 + lineH * 2 + 16;

  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVACIONES
  // ═══════════════════════════════════════════════════════════════════════════
  if (nota.observaciones) {
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
    const splitObs = doc.splitTextToSize(nota.observaciones, rightEdge - margin - 8);
    doc.text(splitObs, margin + 4, y + 11);
    y += 28;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 15, rightEdge, pageH - 15);
  doc.setTextColor(...textMuted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento confidencial generado por Lycos Team System — uso administrativo interno', margin, pageH - 10);
  doc.text(`Impreso el: ${new Date().toLocaleString('es-VE')}`, rightEdge, pageH - 10, { align: 'right' });

  const fileName = `Nota_Ganancia_${nota.numero_nota}_${nota.cliente.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
