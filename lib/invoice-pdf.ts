
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

  // Header - Lycos Team
  doc.setFillColor(26, 26, 46); // Dark Navy
  doc.rect(0, 0, 210, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('LYCOS TEAM', 20, 25);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('TALLER AUTOMOTRIZ PROFESIONAL', 20, 32);

  // Invoice Info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text('FACTURA / REPORTE DE SERVICIO', 120, 55);
  
  doc.setFontSize(10);
  doc.text(`Fecha: ${data.fecha}`, 120, 62);
  doc.text(`Nº Control: ${data.id?.slice(0, 8).toUpperCase() || 'TEMP-' + Date.now().toString().slice(-6)}`, 120, 67);

  // Client Info (if available)
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE:', 20, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(data.cliente || 'Consumidor Final', 20, 60);
  if (data.vehiculo) {
    doc.text(`Vehículo: ${data.vehiculo}`, 20, 65);
  }

  // Table
  const tableRows = data.items.map(item => [
    item.descripcion,
    item.cantidad,
    `$${item.precio_unitario.toFixed(2)}`,
    `$${item.total.toFixed(2)}`
  ]);

  doc.autoTable({
    startY: 75,
    head: [['Descripción', 'Cant.', 'Precio Unit.', 'Total']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [26, 26, 46], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' }
    }
  });

  // Totals
  const finalY = (doc as any).lastAutoTable.finalY || 100;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 140, finalY + 10);
  doc.setTextColor(233, 69, 96); // Accent Color
  doc.text(`$${data.total.toFixed(2)}`, 175, finalY + 10, { align: 'right' });

  // Notes
  if (data.notas) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Notas:', 20, finalY + 20);
    const splitNotes = doc.splitTextToSize(data.notas, 170);
    doc.text(splitNotes, 20, finalY + 25);
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('San Antonio de los Altos, Edo. Miranda, Venezuela', 105, 285, { align: 'center' });
  doc.text('Generado por Lycos Team Sistema CRM - 2026', 105, 290, { align: 'center' });

  // Save
  doc.save(`Factura_Lycos_${data.fecha}_${data.id?.slice(0, 4) || 'N'}.pdf`);
};
