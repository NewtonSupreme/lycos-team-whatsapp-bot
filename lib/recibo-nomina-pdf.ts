import { jsPDF } from 'jspdf';
import { RIF_TEXTO } from '@/lib/empresa';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface ReciboNominaData {
  recibo_numero: string;
  empleado_nombre: string;
  rol?: string;
  periodo_inicio: string;
  periodo_fin: string;
  sede_nombre?: string;
  sueldo_base: number;
  total_comisiones: number;
  total_overrides: number;
  total_flat: number;
  bruto: number;
  deducciones: number;
  total_pagar: number;
  metodo_pago?: string | null;
  pagado_por?: string | null;
  nota?: string | null;
  jobs?: Array<{ fecha: string; zona: string; tipo_trabajo?: string | null; descripcion?: string | null; comision_usd: number; es_override: boolean; moneda?: string }>;
  desglose_monedas?: Record<string, number>;
}

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Genera el recibo de pago de nómina (PDF) y lo descarga. */
export function generateReciboNominaPDF(data: ReciboNominaData) {
  const doc = new jsPDF('p', 'mm', 'a4') as any;

  const black = [15, 23, 42] as [number, number, number];
  const grayDark = [71, 85, 105] as [number, number, number];
  const grayLight = [148, 163, 184] as [number, number, number];
  const orange = [249, 115, 22] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const green = [22, 163, 74] as [number, number, number];

  const margin = 20;
  const right = 190;

  // ── HEADER ───────────────────────────────────────────────────────────
  doc.setFillColor(...black);
  doc.roundedRect(margin, 15, 52, 18, 3, 3, 'F');
  doc.setTextColor(...white);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bolditalic');
  doc.text('LYCOS TEAM', margin + 5, 27);
  doc.setTextColor(...orange);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(`NÓMINA · RECIBO DE PAGO · ${RIF_TEXTO}`, margin + 5, 32);

  doc.setDrawColor(...orange);
  doc.setFillColor(255, 247, 237);
  doc.roundedRect(right - 60, 15, 60, 18, 3, 3, 'DF');
  doc.setTextColor(...orange);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO N°', right - 55, 22);
  doc.setTextColor(...black);
  doc.setFontSize(11);
  doc.text(data.recibo_numero, right - 55, 29);

  // ── EMPLEADO / PERIODO ───────────────────────────────────────────────
  let y = 45;
  doc.setTextColor(...grayDark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('EMPLEADO', margin, y);
  doc.text('PERÍODO', right - 60, y);
  y += 6;
  doc.setTextColor(...black);
  doc.setFontSize(12);
  doc.text(data.empleado_nombre, margin, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const per = `${format(new Date(data.periodo_inicio + 'T00:00:00'), 'dd MMM', { locale: es })} → ${format(new Date(data.periodo_fin + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}`;
  doc.text(per, right - 60, y);
  y += 5;
  if (data.rol) { doc.setTextColor(...grayLight); doc.text(data.rol.replace(/_/g, ' '), margin, y); }
  if (data.sede_nombre) { doc.setTextColor(...grayLight); doc.text(data.sede_nombre, right - 60, y); }

  // ── DETALLE DE TRABAJOS ──────────────────────────────────────────────
  y += 8;
  if (data.jobs && data.jobs.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Zona / Trabajo', 'Tipo', 'Comisión']],
      body: data.jobs.map(j => [
        format(new Date(j.fecha + 'T00:00:00'), 'dd/MM'),
        `${j.zona}${j.descripcion ? ' · ' + j.descripcion.slice(0, 40) : ''}`,
        j.es_override ? 'Override' : (j.tipo_trabajo || '—'),
        money(j.comision_usd),
      ]),
      theme: 'striped',
      headStyles: { fillColor: black, textColor: white, fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: grayDark },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── RESUMEN ──────────────────────────────────────────────────────────
  const rows: Array<[string, number]> = [
    ['Sueldo base', data.sueldo_base],
    ['Comisiones', data.total_comisiones],
    ['Comisiones a destajo', data.total_flat],
    ['Comisiones override (cascada)', data.total_overrides],
  ].filter(r => (r[1] as number) !== 0) as Array<[string, number]>;

  const boxX = right - 80;
  doc.setFontSize(9);
  for (const [label, val] of rows) {
    doc.setTextColor(...grayDark); doc.setFont('helvetica', 'normal');
    doc.text(label, boxX, y);
    doc.setTextColor(...black);
    doc.text(money(val), right, y, { align: 'right' });
    y += 6;
  }
  doc.setDrawColor(...grayLight);
  doc.line(boxX, y - 2, right, y - 2);
  doc.setTextColor(...grayDark);
  doc.text('Bruto', boxX, y + 3);
  doc.setTextColor(...black); doc.setFont('helvetica', 'bold');
  doc.text(money(data.bruto), right, y + 3, { align: 'right' });
  y += 9;
  if (data.deducciones) {
    doc.setTextColor(220, 38, 38); doc.setFont('helvetica', 'normal');
    doc.text('Deducciones / adelantos', boxX, y);
    doc.text(`- ${money(data.deducciones)}`, right, y, { align: 'right' });
    y += 7;
  }

  // Total a pagar
  doc.setFillColor(...green);
  doc.roundedRect(boxX - 4, y - 2, (right - boxX) + 8, 12, 2, 2, 'F');
  doc.setTextColor(...white); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('TOTAL A PAGAR', boxX, y + 6);
  doc.setFontSize(12);
  doc.text(money(data.total_pagar), right, y + 6, { align: 'right' });
  y += 18;

  // ── PIE ──────────────────────────────────────────────────────────────
  doc.setTextColor(...grayDark); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  if (data.metodo_pago) doc.text(`Método de pago: ${data.metodo_pago}`, margin, y);
  if (data.nota) { y += 5; doc.text(`Nota: ${data.nota}`, margin, y); }
  y += 12;

  doc.setDrawColor(...grayLight);
  doc.line(margin, y, margin + 60, y);
  doc.line(right - 60, y, right, y);
  y += 5;
  doc.setTextColor(...grayLight); doc.setFontSize(8);
  doc.text('Firma empleado', margin, y);
  doc.text(`Pagado por: ${data.pagado_por || 'Administración'}`, right - 60, y);

  y += 12;
  doc.setTextColor(...grayLight); doc.setFontSize(7);
  doc.text(`Generado ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })} · Lycos Team ERP`, margin, 285);

  doc.save(`Recibo_${data.recibo_numero}_${data.empleado_nombre.replace(/\s+/g, '_')}.pdf`);
}
