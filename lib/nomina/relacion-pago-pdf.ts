import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Las hojas de nómina del taller.
 *
 * Dos documentos, los mismos que administración lleva a mano:
 *
 *  · RELACIÓN DE PAGO — una hoja por persona con TODOS sus trabajos de la
 *    semana: fecha, placa, qué hizo, cuánto dejó el trabajo, qué porcentaje le
 *    toca y cuánto cobra. Es la que se le enseña al técnico cuando pregunta
 *    "¿y esto de dónde sale?", así que cada renglón tiene que poder rastrearse.
 *
 *  · NÓMINA CONSOLIDADA — una fila por persona con sus totales y el total
 *    general. Es la que se firma para pagar.
 *
 * Todo en dólares, que es como calcula el motor. Los montos en bolívares se
 * muestran como referencia con la tasa del día, nunca como el monto de pago.
 */

export interface TrabajoRelacion {
  fecha: string;
  zona?: string | null;
  tipo_trabajo?: string | null;
  descripcion?: string | null;
  ingreso_total?: number | null;
  ingreso_usd?: number | null;
  mano_obra_usd?: number | null;
  comision_usd: number;
  es_override?: boolean;
  moneda?: string | null;
  desglose?: {
    pct?: number; base?: string | number; placa?: string | null;
    cliente?: string | null; vehiculo?: string | null; regla?: string | null;
    sobre?: string | null;
  } | null;
}

export interface RelacionPagoData {
  empleado_nombre: string;
  cedula?: string | null;
  alias?: string | null;
  cargo?: string | null;
  area?: string | null;
  rol?: string | null;
  periodo_inicio: string;
  periodo_fin: string;
  sede_nombre?: string | null;
  sueldo_base: number;
  total_comisiones: number;
  total_overrides: number;
  total_flat: number;
  bruto: number;
  deducciones: number;
  total_pagar: number;
  trabajos: TrabajoRelacion[];
  adelantos?: { fecha: string; motivo?: string | null; monto_usd: number }[];
  /** Referencia informativa. Si falta, no se imprime ninguna conversión. */
  tasa_bs?: number | null;
  recibo_numero?: string | null;
  nota?: string | null;
  borrador?: boolean;
}

export interface FilaConsolidada {
  empleado_nombre: string;
  cedula?: string | null;
  cargo?: string | null;
  trabajos: number;
  sueldo_base: number;
  comisiones: number;
  overrides: number;
  bruto: number;
  deducciones: number;
  total_pagar: number;
}

const NEGRO: [number, number, number] = [15, 23, 42];
const GRIS: [number, number, number] = [100, 116, 139];
const GRIS_CLARO: [number, number, number] = [148, 163, 184];
const NARANJA: [number, number, number] = [249, 115, 22];
const BLANCO: [number, number, number] = [255, 255, 255];
const VERDE: [number, number, number] = [22, 163, 74];
const ROJO: [number, number, number] = [220, 38, 38];

const money = (n?: number | null) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const bs = (n: number, tasa: number) =>
  `Bs. ${(n * tasa).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "1 al 7 de septiembre de 2026" — y si cruza de mes, lo dice completo. */
function rotuloPeriodo(inicio: string, fin: string): string {
  const [ay, am, ad] = inicio.split('-').map(Number);
  const [by, bm, bd] = fin.split('-').map(Number);
  if (ay === by && am === bm) return `${ad} al ${bd} de ${MESES[am - 1]} de ${ay}`;
  if (ay === by) return `${ad} de ${MESES[am - 1]} al ${bd} de ${MESES[bm - 1]} de ${ay}`;
  return `${ad} de ${MESES[am - 1]} de ${ay} al ${bd} de ${MESES[bm - 1]} de ${by}`;
}

const dm = (iso?: string | null) => {
  if (!iso) return '—';
  const [, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}`;
};

/** Cabecera común de las dos hojas. Devuelve la Y donde sigue el contenido. */
function cabecera(doc: jsPDF, titulo: string, subtitulo: string, ancho: number, borrador?: boolean): number {
  const margen = 14;

  doc.setFillColor(...NEGRO);
  doc.roundedRect(margen, 12, 56, 17, 2.5, 2.5, 'F');
  doc.setTextColor(...BLANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('LYCOS TEAM', margen + 5, 21);
  doc.setTextColor(...NARANJA);
  doc.setFontSize(6.5);
  doc.text('TALLER AUTOMOTRIZ', margen + 5, 25.5);

  doc.setTextColor(...NEGRO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(titulo, ancho - margen, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(subtitulo, ancho - margen, 26, { align: 'right' });

  // Un borrador tiene que gritar que lo es: si no, alguien paga con él.
  if (borrador) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.roundedRect(margen, 31, 46, 6, 1.5, 1.5, 'FD');
    doc.setTextColor(180, 83, 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('BORRADOR — NO ES COMPROBANTE DE PAGO', margen + 2, 35.2);
  }

  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(0.7);
  doc.line(margen, borrador ? 40 : 33, ancho - margen, borrador ? 40 : 33);

  return borrador ? 46 : 39;
}

/** Relación de pago de una persona: la hoja con todos sus trabajos. */
export function generateRelacionPagoPDF(d: RelacionPagoData) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const ancho = 210;
  const margen = 14;

  let y = cabecera(doc, 'RELACIÓN DE PAGO', rotuloPeriodo(d.periodo_inicio, d.periodo_fin), ancho, d.borrador);

  // ── Identidad del trabajador ─────────────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margen, y, ancho - margen * 2, 20, 2, 2, 'F');

  doc.setTextColor(...NEGRO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(d.empleado_nombre + (d.alias ? `  (${d.alias})` : ''), margen + 4, y + 7.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  const identidad = [
    d.cedula ? `C.I. ${d.cedula}` : null,
    d.cargo,
    d.area ? `Área: ${d.area}` : null,
  ].filter(Boolean).join('   ·   ');
  doc.text(identidad || 'Sin datos de ficha', margen + 4, y + 13.5);

  const derecha = [
    d.sede_nombre ? `Sede: ${d.sede_nombre}` : null,
    d.recibo_numero ? `Recibo ${d.recibo_numero}` : null,
  ].filter(Boolean);
  derecha.forEach((t, i) => {
    doc.text(t!, ancho - margen - 4, y + 7.5 + i * 5, { align: 'right' });
  });
  doc.text(`Período: ${d.periodo_inicio} al ${d.periodo_fin}`, ancho - margen - 4, y + 17, { align: 'right' });

  y += 26;

  // ── Trabajos del período ─────────────────────────────────────────────────
  doc.setTextColor(...NEGRO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DETALLE DE TRABAJOS', margen, y);
  y += 2;

  const filas = d.trabajos.map(t => {
    const pct = t.desglose?.pct;
    const baseUsada = t.desglose?.base === 'mano_obra'
      ? Number(t.mano_obra_usd || 0)
      : Number(t.ingreso_usd ?? t.ingreso_total ?? 0);
    const vehiculo = [t.desglose?.placa, t.desglose?.vehiculo].filter(Boolean).join(' · ');
    const concepto = t.es_override
      ? `Supervisión sobre ${t.desglose?.sobre || 'trabajo del taller'}`
      : (t.tipo_trabajo || t.descripcion || 'Trabajo');
    return [
      dm(t.fecha),
      vehiculo || (t.desglose?.cliente ?? '—'),
      concepto,
      (t.zona || '—').replace(/_/g, ' '),
      money(baseUsada),
      pct != null ? `${pct}%` : '—',
      money(t.comision_usd),
    ];
  });

  if (filas.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIS_CLARO);
    doc.text('Sin trabajos registrados en este período.', margen, y + 8);
    y += 14;
  } else {
    autoTable(doc, {
      startY: y + 2,
      head: [['Fecha', 'Vehículo / cliente', 'Trabajo', 'Zona', 'Monto', '%', 'Comisión']],
      body: filas,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.8, textColor: NEGRO, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: NEGRO, textColor: BLANCO, fontSize: 7, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 251, 252] },
      columnStyles: {
        0: { cellWidth: 13, halign: 'center' },
        1: { cellWidth: 38 },
        2: { cellWidth: 52 },
        3: { cellWidth: 22 },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 12, halign: 'center' },
        6: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margen, right: margen },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── Adelantos ────────────────────────────────────────────────────────────
  if (d.adelantos && d.adelantos.length > 0) {
    doc.setTextColor(...NEGRO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ADELANTOS DESCONTADOS', margen, y);
    autoTable(doc, {
      startY: y + 2,
      head: [['Fecha', 'Motivo', 'Monto']],
      body: d.adelantos.map(a => [dm(a.fecha), a.motivo || '—', money(a.monto_usd)]),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.8, textColor: NEGRO, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [127, 29, 29], textColor: BLANCO, fontSize: 7, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 16, halign: 'center' }, 1: { cellWidth: 140 }, 2: { cellWidth: 26, halign: 'right' } },
      margin: { left: margen, right: margen },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── Liquidación ──────────────────────────────────────────────────────────
  if (y > 215) { doc.addPage(); y = 20; }

  const anchoCaja = 88;
  const x = ancho - margen - anchoCaja;

  const conceptos: [string, number, boolean?][] = [
    ['Sueldo base', d.sueldo_base],
    ['Comisiones', d.total_comisiones],
    ['Supervisión (override)', d.total_overrides],
    ['Destajo', d.total_flat],
  ];
  const visibles = conceptos.filter(([, v]) => Math.abs(v) > 0.001);
  const altura = (visibles.length + 2) * 6 + 22;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, anchoCaja, altura, 2, 2, 'S');

  let cy = y + 7;
  doc.setFontSize(8.5);
  for (const [etiqueta, valor] of visibles) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text(etiqueta, x + 4, cy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NEGRO);
    doc.text(money(valor), x + anchoCaja - 4, cy, { align: 'right' });
    cy += 6;
  }

  doc.setDrawColor(226, 232, 240);
  doc.line(x + 4, cy - 2.5, x + anchoCaja - 4, cy - 2.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NEGRO);
  doc.text('Total devengado', x + 4, cy + 2);
  doc.text(money(d.bruto), x + anchoCaja - 4, cy + 2, { align: 'right' });
  cy += 8;

  if (d.deducciones > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ROJO);
    doc.text('Adelantos', x + 4, cy);
    doc.text(`- ${money(d.deducciones)}`, x + anchoCaja - 4, cy, { align: 'right' });
    cy += 6;
  }

  doc.setFillColor(...NEGRO);
  doc.roundedRect(x, cy - 1, anchoCaja, 13, 2, 2, 'F');
  doc.setTextColor(...BLANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('NETO A PAGAR', x + 4, cy + 6.5);
  doc.setFontSize(13);
  doc.text(money(d.total_pagar), x + anchoCaja - 4, cy + 7, { align: 'right' });

  if (d.tasa_bs && d.tasa_bs > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_CLARO);
    doc.text(
      `Referencia: ${bs(d.total_pagar, d.tasa_bs)} a Bs. ${d.tasa_bs} por dólar. El pago se calcula en dólares.`,
      x + anchoCaja, cy + 16, { align: 'right' },
    );
  }

  // ── Firmas ───────────────────────────────────────────────────────────────
  const yFirma = Math.max(cy + 30, 250);
  doc.setDrawColor(...GRIS_CLARO);
  doc.setLineWidth(0.3);
  doc.line(margen, yFirma, margen + 62, yFirma);
  doc.line(ancho - margen - 62, yFirma, ancho - margen, yFirma);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text('Recibí conforme — ' + d.empleado_nombre, margen, yFirma + 4);
  if (d.cedula) doc.text(`C.I. ${d.cedula}`, margen, yFirma + 8);
  doc.text('Administración', ancho - margen, yFirma + 4, { align: 'right' });

  if (d.nota) {
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(`Nota: ${d.nota}`, margen, yFirma + 16, { maxWidth: ancho - margen * 2 });
  }

  pie(doc, ancho, 297);

  const nombre = d.empleado_nombre.replace(/\s+/g, '_');
  doc.save(`relacion_pago_${nombre}_${d.periodo_inicio}_${d.periodo_fin}.pdf`);
}

/** Nómina del período: una fila por persona y el total que se paga. */
export function generateNominaConsolidadaPDF(params: {
  filas: FilaConsolidada[];
  periodo_inicio: string;
  periodo_fin: string;
  sede_nombre?: string | null;
  tasa_bs?: number | null;
  borrador?: boolean;
}) {
  const doc = new jsPDF('l', 'mm', 'a4');
  const ancho = 297;
  const margen = 14;

  const y = cabecera(
    doc, 'NÓMINA DEL PERÍODO',
    `${rotuloPeriodo(params.periodo_inicio, params.periodo_fin)}${params.sede_nombre ? ` · ${params.sede_nombre}` : ''}`,
    ancho, params.borrador,
  );

  const total = params.filas.reduce((t, f) => ({
    trabajos: t.trabajos + f.trabajos,
    sueldo_base: t.sueldo_base + f.sueldo_base,
    comisiones: t.comisiones + f.comisiones,
    overrides: t.overrides + f.overrides,
    bruto: t.bruto + f.bruto,
    deducciones: t.deducciones + f.deducciones,
    total_pagar: t.total_pagar + f.total_pagar,
  }), { trabajos: 0, sueldo_base: 0, comisiones: 0, overrides: 0, bruto: 0, deducciones: 0, total_pagar: 0 });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Empleado', 'C.I.', 'Cargo', 'Trab.', 'Sueldo', 'Comisiones', 'Supervisión', 'Devengado', 'Adelantos', 'Neto a pagar']],
    body: params.filas.map((f, i) => [
      String(i + 1),
      f.empleado_nombre,
      f.cedula || '—',
      f.cargo || '—',
      String(f.trabajos),
      money(f.sueldo_base),
      money(f.comisiones),
      money(f.overrides),
      money(f.bruto),
      f.deducciones > 0 ? `- ${money(f.deducciones)}` : '—',
      money(f.total_pagar),
    ]),
    foot: [[
      '', 'TOTAL', '', '', String(total.trabajos),
      money(total.sueldo_base), money(total.comisiones), money(total.overrides),
      money(total.bruto), total.deducciones > 0 ? `- ${money(total.deducciones)}` : '—',
      money(total.total_pagar),
    ]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: NEGRO, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: NEGRO, textColor: BLANCO, fontSize: 7.5, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: NEGRO, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 54 },
      2: { cellWidth: 26 },
      3: { cellWidth: 36 },
      4: { cellWidth: 13, halign: 'center' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
      7: { cellWidth: 24, halign: 'right' },
      8: { cellWidth: 24, halign: 'right' },
      9: { cellWidth: 24, halign: 'right' },
      10: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margen, right: margen },
  });

  let yFin = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFillColor(...NEGRO);
  doc.roundedRect(ancho - margen - 92, yFin, 92, 14, 2, 2, 'F');
  doc.setTextColor(...BLANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL A PAGAR', ancho - margen - 88, yFin + 8.5);
  doc.setFontSize(14);
  doc.text(money(total.total_pagar), ancho - margen - 4, yFin + 9, { align: 'right' });

  if (params.tasa_bs && params.tasa_bs > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_CLARO);
    doc.text(
      `Referencia: ${bs(total.total_pagar, params.tasa_bs)} a Bs. ${params.tasa_bs} por dólar.`,
      ancho - margen, yFin + 18, { align: 'right' },
    );
  }

  doc.setTextColor(...VERDE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${params.filas.length} trabajador(es) · ${total.trabajos} trabajo(s) en el período`, margen, yFin + 9);

  yFin += 34;
  doc.setDrawColor(...GRIS_CLARO);
  doc.setLineWidth(0.3);
  [margen, margen + 92, margen + 184].forEach(x => doc.line(x, yFin, x + 74, yFin));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  ['Elaborado por', 'Revisado por', 'Aprobado por'].forEach((t, i) => {
    doc.text(t, margen + i * 92, yFin + 4);
  });

  pie(doc, ancho, 210);
  doc.save(`nomina_${params.periodo_inicio}_${params.periodo_fin}.pdf`);
}

function pie(doc: jsPDF, ancho: number, alto: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRIS_CLARO);
  const cuando = new Date().toLocaleString('es-VE');
  doc.text(`Lycos Team · generado el ${cuando}`, 14, alto - 8);
  doc.text('Montos en dólares (USD)', ancho - 14, alto - 8, { align: 'right' });
}
