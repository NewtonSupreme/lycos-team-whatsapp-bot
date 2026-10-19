import { jsPDF } from 'jspdf';
import { RIF_TEXTO } from '@/lib/empresa';
import autoTable from 'jspdf-autotable';

/**
 * Los reportes de Recursos Humanos, en PDF imprimible.
 *
 * Hasta ahora el menú de «Reportes» solo cambiaba de pestaña: enseñaba la tabla
 * en pantalla y ahí se acababa. Un reporte de RRHH existe para imprimirse,
 * firmarse o mandarse, así que aquí se generan de verdad.
 *
 * Todos comparten cabecera y pie para que se reconozcan como del mismo taller,
 * y todos dicen con qué fecha se sacaron: un listado de personal sin fecha no
 * sirve para nada dentro de un mes.
 */

const NARANJA: [number, number, number] = [249, 115, 22];
const GRIS: [number, number, number] = [138, 144, 156];
const TINTA: [number, number, number] = [22, 24, 29];

export interface FilaReporte {
  [columna: string]: string | number | null | undefined;
}

export interface ReporteRRHH {
  titulo: string;
  subtitulo?: string;
  sede?: string | null;
  /** Cabeceras de la tabla, en orden. */
  columnas: string[];
  /** Cada fila, con los valores en el mismo orden que `columnas`. */
  filas: (string | number)[][];
  /** Pares "etiqueta: valor" que se imprimen antes de la tabla. */
  resumen?: { etiqueta: string; valor: string }[];
  /** Texto al pie, para aclaraciones. */
  nota?: string;
  /** Horizontal cuando hay muchas columnas. */
  apaisado?: boolean;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

function selloFecha(): string {
  const d = new Date();
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`
    + ` ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

/** Cabecera común. Devuelve la altura donde puede empezar el contenido. */
function cabecera(doc: jsPDF, r: ReporteRRHH, ancho: number): number {
  doc.setFillColor(...NARANJA);
  doc.rect(0, 0, ancho, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...TINTA);
  doc.text('LYCOS TEAM', 14, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text(`Recursos Humanos · ${RIF_TEXTO}`, 14, 19);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...TINTA);
  doc.text(r.titulo.toUpperCase(), ancho - 14, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  const sub = [r.subtitulo, r.sede ? `Sede ${r.sede}` : null].filter(Boolean).join('  ·  ');
  if (sub) doc.text(sub, ancho - 14, 19, { align: 'right' });
  doc.text(`Emitido ${selloFecha()}`, ancho - 14, 23.5, { align: 'right' });

  doc.setDrawColor(232, 234, 237);
  doc.line(14, 27, ancho - 14, 27);
  return 33;
}

/** Genera y descarga el PDF. */
export function generarReporteRRHH(r: ReporteRRHH): void {
  const doc = new jsPDF(r.apaisado ? 'l' : 'p', 'mm', 'a4');
  const ancho = doc.internal.pageSize.getWidth();
  let y = cabecera(doc, r, ancho);

  // ── Resumen en tarjetas ──────────────────────────────────────────────────
  if (r.resumen && r.resumen.length > 0) {
    const cajas = r.resumen.slice(0, 5);
    const util = ancho - 28;
    const w = (util - (cajas.length - 1) * 3) / cajas.length;
    cajas.forEach((c, i) => {
      const x = 14 + i * (w + 3);
      doc.setFillColor(250, 251, 252);
      doc.setDrawColor(238, 240, 243);
      doc.roundedRect(x, y, w, 15, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GRIS);
      doc.text(c.etiqueta.toUpperCase(), x + 3, y + 5.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...TINTA);
      doc.text(String(c.valor), x + 3, y + 11.5);
    });
    y += 21;
  }

  // ── La tabla ─────────────────────────────────────────────────────────────
  if (r.filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text('No hay registros en este período.', ancho / 2, y + 12, { align: 'center' });
    y += 24;
  } else {
    autoTable(doc, {
      startY: y,
      head: [r.columnas],
      body: r.filas.map(f => f.map(v => (v == null ? '—' : String(v)))),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: TINTA, lineColor: [238, 240, 243] },
      headStyles: { fillColor: [250, 251, 252], textColor: [91, 97, 110], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [253, 253, 254] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  if (r.nota) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(doc.splitTextToSize(r.nota, ancho - 28), 14, y);
  }

  // ── Pie con paginación ───────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  const alto = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= paginas; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text(`${r.filas.length} registro(s)`, 14, alto - 8);
    doc.text(`Página ${i} de ${paginas}`, ancho - 14, alto - 8, { align: 'right' });
  }

  const limpio = r.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  doc.save(`${limpio}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
