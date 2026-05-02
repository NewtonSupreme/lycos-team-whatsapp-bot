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
}

export const generateInvoicePDF = (data: InvoiceData) => {
  const doc = new jsPDF() as any;

  // Colors
  const slate900 = [15, 23, 42] as [number, number, number];
  const slate600 = [71, 85, 105] as [number, number, number];
  const slate500 = [100, 116, 139] as [number, number, number];
  const slate400 = [148, 163, 184] as [number, number, number];
  const slate200 = [226, 232, 240] as [number, number, number];
  const primaryOrange = [249, 115, 22] as [number, number, number];

  // Header - Lycos Team (Clean Style)
  doc.setTextColor(...slate900);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('LYCOS TEAM', 20, 30);

  doc.setTextColor(...slate500);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TALLER AUTOMOTRIZ PROFESIONAL', 20, 36);

  doc.setTextColor(...slate400);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('San Antonio de los Altos, Edo. Miranda, Venezuela', 20, 41);

  // Invoice Info (Top Right)
  doc.setTextColor(...slate400);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURA', 190, 25, { align: 'right' });
  
  doc.setTextColor(...slate900);
  doc.setFontSize(12);
  doc.text(`#${data.id?.slice(0, 8).toUpperCase() || 'TEMP-' + Date.now().toString().slice(-6)}`, 190, 32, { align: 'right' });
  
  doc.setTextColor(...slate500);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(data.fecha, 190, 38, { align: 'right' });

  // Divider
  doc.setDrawColor(...slate200);
  doc.line(20, 50, 190, 50);

  // Info Grid
  // Column 1: Billing
  doc.setTextColor(...slate400);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURADO A:', 20, 60);
  
  doc.setTextColor(...slate900);
  doc.setFontSize(10);
  doc.text(data.cliente || 'Consumidor Final', 20, 66);
  
  doc.setTextColor(...slate500);
  doc.setFontSize(9);
  doc.text('Control de Cierre de Caja', 20, 71);
  if (data.vehiculo) {
    doc.text(`Vehículo: ${data.vehiculo}`, 20, 76);
  }

  // Column 2: Summary (Right Aligned)
  doc.setTextColor(...slate400);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN:', 190, 60, { align: 'right' });
  
  doc.setTextColor(...slate600);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const itemsCount = data.items.length;
  doc.text(`${itemsCount} Servicios realizados`, 190, 66, { align: 'right' });

  // Table
  const tableRows = data.items.map(item => [
    item.descripcion,
    item.cantidad,
    `$${item.precio_unitario.toFixed(2)}`,
    `$${item.total.toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 85,
    head: [['Descripción', 'Cant.', 'Precio Unit.', 'Total']],
    body: tableRows,
    theme: 'plain',
    headStyles: { 
      fillColor: [255, 255, 255], 
      textColor: slate900, 
      fontSize: 10, 
      fontStyle: 'bold',
      lineColor: slate900,
      lineWidth: { bottom: 1 }
    },
    styles: { 
      fontSize: 9, 
      textColor: slate600,
      cellPadding: 4
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold', textColor: slate900 }
    },
    margin: { left: 20, right: 20 }
  });

  // Totals
  const finalY = (doc as any).lastAutoTable.finalY || 120;
  
  // Total line divider
  doc.setDrawColor(...slate200);
  doc.line(140, finalY + 5, 190, finalY + 5);

  doc.setTextColor(...slate500);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('SUBTOTAL', 140, finalY + 12);
  doc.text(`$${data.total.toFixed(2)}`, 190, finalY + 12, { align: 'right' });

  doc.setTextColor(...slate900);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', 140, finalY + 20);
  
  doc.setTextColor(...primaryOrange);
  doc.text(`$${data.total.toFixed(2)}`, 190, finalY + 20, { align: 'right' });

  // Notes
  if (data.notas) {
    const cleanNotes = data.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim();
    if (cleanNotes) {
      doc.setTextColor(...slate400);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTAS:', 20, finalY + 35);
      
      doc.setTextColor(...slate500);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      const splitNotes = doc.splitTextToSize(cleanNotes, 170);
      doc.text(splitNotes, 20, finalY + 41);
    }
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slate400);
  doc.text('Generado por Lycos Team Sistema CRM - 2026', 105, 285, { align: 'center' });
  doc.text('San Antonio de los Altos, Edo. Miranda, Venezuela', 105, 290, { align: 'center' });

  // Save
  doc.save(`Factura_Lycos_${data.fecha}_${data.id?.slice(0, 4) || 'N'}.pdf`);
};
