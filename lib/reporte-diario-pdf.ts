import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─────────────────────────────────────────────────────────────────────────────
// Reporte Diario Completo (13 secciones) en PDF. Consume el JSON de
// /api/reportes/diario. Todo el contenido proviene de la plataforma.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const C = {
  black: [15, 23, 42] as RGB,
  dark: [30, 41, 59] as RGB,
  gray: [71, 85, 105] as RGB,
  light: [148, 163, 184] as RGB,
  border: [226, 232, 240] as RGB,
  bg: [248, 250, 252] as RGB,
  orange: [249, 115, 22] as RGB,
  orangeL: [255, 237, 213] as RGB,
  green: [22, 163, 74] as RGB,
  greenL: [220, 252, 231] as RGB,
  blue: [37, 99, 235] as RGB,
  blueL: [219, 234, 254] as RGB,
  amber: [217, 119, 6] as RGB,
  amberL: [254, 243, 199] as RGB,
  red: [239, 68, 68] as RGB,
  purple: [124, 58, 237] as RGB,
  white: [255, 255, 255] as RGB,
};

const fmt = (x: number, dec = 2) =>
  Number(x || 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const usd = (x: number) => `$${fmt(x)}`;
const bs = (x: number) => `${fmt(x, 0)}`;

/**
 * El carro para la columna CARRO, recortado sin perder la placa.
 *
 * Antes se cortaba a 20 caracteres a secas y «Chevrolet Spark AC383BA» salía
 * como «Chevrolet Spark AC38»: la placa, que es lo único que identifica al
 * vehículo, quedaba mutilada. Aquí se recorta el modelo y la placa se conserva
 * entera.
 */
const carro = (texto: string, largo = 22): string => {
  const t = String(texto || '').trim();
  if (!t) return '—';
  if (t.length <= largo) return t;
  // La placa es la última palabra cuando lleva dígitos: 5 a 9 caracteres.
  const partes = t.split(/\s+/);
  const ultima = partes[partes.length - 1];
  const esPlaca = /\d/.test(ultima) && ultima.length >= 5 && ultima.length <= 9;
  if (!esPlaca) return t.slice(0, largo);
  const sitio = largo - ultima.length - 1;
  if (sitio < 3) return ultima;   // si no cabe ni el modelo, manda la placa
  return `${partes.slice(0, -1).join(' ').slice(0, sitio).trim()} ${ultima}`;
};

interface DeptRec { silenciador: number; cauchera: number; alineacion: number; electronica: number; mecanica: number; frenos: number; lavado: number; repuestos: number; }
interface BankRec { pago_movil_banesco: number; bnc: number; punto_banesco: number; punto_bancamiga: number; pago_movil_exterior: number; dolares: number; binance: number; zelle: number; efectivo_bs: number; cashea: number; }

export interface ReporteDiarioData {
  fecha: string;
  fechaLabel: string;
  tasa: number;
  ventas: Array<{ nombre: string; carro: string; placa?: string; trabajo?: string; pago?: string; mecanico?: string; total: number; contado: number; cashea: number; iva: number; inicial: number; financiado: number; porCobrar: number; bancos: BankRec; departamentos: DeptRec }>;
  totalesVentas: { total: number; contado: number; cashea: number; iva: number; inicial: number; financiado: number; porCobrar: number; departamentos: DeptRec; bancos: BankRec };
  porCobrar: Array<{ nombre: string; carro: string; placa?: string; monto: number; observacion: string }>;
  porCobrarTotal: number;
  sistema: Array<{ sistema: string; cantidad: number; monto: number }>;
  sistemaTotal: number;
  formaPago: Array<{ forma: string; cantidad: number; monto: number }>;
  formaPagoTotal: number;
  facturasMontos: { base: number; iva: number; total: number };
  caja: { inicial: number; financiado: number; total: number };
  metodoPago: Array<{ metodo: string; moneda: string; cantidad: number; montoBs: number; tasa: number; montoUsd: number }>;
  metodoPagoTotalUsd: number;
  kpis: { redes: KpiPar; app: KpiPar; rcv: KpiPar; cert: KpiPar };
  clientesBD: { total: number; nuevos: number };
  articulos: Array<{ articulo: string; cantidad: number }>;
  taller: Array<{ carro: string; placa?: string; mecanico: string; trabajo: string }>;
  /** Cada carro que entró, se movió o salió ese día. */
  seguimiento?: Array<{
    id: string; cliente: string; carro: string; placa: string; trabajo: string;
    mecanico: string; estado: string; entrada: string; ultimo: string; movimientos: number; monto: number;
    /** Pagado, Cashea pendiente, debe tanto… */
    pago?: string;
  }>;
  /** Lo cobrado ese día de ventas de otros días. */
  cobros?: Array<{
    cliente: string; carro: string; placa: string; fechaVenta: string; monto: number;
    pago: string; saldoDespues: number; tipo: string;
  }>;
  cobrosTotal?: number;
  bancos: Array<{ banco: string; bs: number; usd: number }>;
  gastos: Array<{ concepto: string; proveedor?: string; placa?: string; cuenta?: string; usd: number; bs: number }>;
  gastosTotal: { usd: number; bs: number };
  generadoEn: string;
}
interface KpiPar { inicial: number; nuevos: number; total: number }

export function generateReporteDiarioPDF(data: ReporteDiarioData) {
  const doc = new jsPDF('l', 'mm', 'a4') as any; // landscape
  const pageW = doc.internal.pageSize.getWidth();  // 297
  const pageH = doc.internal.pageSize.getHeight(); // 210
  const margin = 12;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageH - 10) { doc.addPage(); accentBar(); y = margin; }
  };
  const accentBar = () => { doc.setFillColor(...C.orange); doc.rect(0, 0, pageW, 2, 'F'); };
  const section = (title: string, extra?: string) => {
    // Se reserva sitio para el titulo Y para unas filas de su tabla. Con solo
    // 14 mm cabia el titulo y nada mas, asi que la seccion 7 salia sola al pie
    // de la primera pagina y su tabla empezaba en la siguiente.
    ensure(30);
    doc.setFillColor(...C.dark);
    doc.roundedRect(margin, y, pageW - margin * 2, 7, 1, 1, 'F');
    doc.setTextColor(...C.white); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 4, y + 4.8);
    if (extra) doc.text(extra, pageW - margin - 4, y + 4.8, { align: 'right' });
    y += 10;
  };
  const afterTable = () => { y = doc.lastAutoTable.finalY + 5; };

  // ══════════════ HEADER ══════════════
  accentBar();
  doc.setFillColor(...C.black);
  doc.roundedRect(margin, y, 60, 18, 2, 2, 'F');
  doc.setTextColor(...C.orange); doc.setFontSize(15); doc.setFont('helvetica', 'bolditalic');
  doc.text('LYCOS', margin + 4, y + 9);
  doc.setTextColor(...C.white); doc.text(' TEAM', margin + 23, y + 9);
  doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(150, 150, 150);
  doc.text('MECÁNICA INTEGRAL · San Antonio de los Altos', margin + 4, y + 14.5);

  doc.setTextColor(...C.dark); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DIARIO', pageW / 2, y + 8, { align: 'center' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  doc.text(data.fechaLabel, pageW / 2, y + 14, { align: 'center' });

  doc.setFillColor(...C.bg);
  doc.roundedRect(pageW - margin - 60, y, 60, 18, 2, 2, 'F');
  doc.setDrawColor(...C.orange); doc.setLineWidth(0.6);
  doc.roundedRect(pageW - margin - 60, y, 60, 18, 2, 2, 'S');
  doc.setTextColor(...C.orange); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text('TASA BCV', pageW - margin - 4, y + 6, { align: 'right' });
  doc.setTextColor(...C.dark); doc.setFontSize(11);
  doc.text(`${fmt(data.tasa)} Bs/$`, pageW - margin - 4, y + 12, { align: 'right' });
  y += 24;

  // ══════════════ KPIs SUPERIORES ══════════════
  const tv = data.totalesVentas;
  const topKpis = [
    { label: 'INGRESOS DÍA', value: usd(tv.total), color: C.orange, light: C.orangeL },
    { label: 'CONTADO', value: usd(tv.contado), color: C.green, light: C.greenL },
    { label: 'CASHEA / BNC', value: usd(tv.cashea), color: C.purple, light: [237, 233, 254] as RGB },
    // Este NO es del dia: es todo el saldo abierto del taller. Al lado de
    // «INGRESOS DIA» y «GASTOS DIA» se leia como si fueran $5.546 pendientes
    // de ese mismo dia.
    { label: 'POR COBRAR (TOTAL)', value: usd(data.porCobrarTotal), color: C.amber, light: C.amberL },
    { label: 'COBRADO DE DEUDAS', value: usd(data.cobrosTotal || 0), color: C.green, light: C.greenL },
    { label: 'GASTOS DÍA', value: usd(data.gastosTotal.usd), color: C.red, light: [254, 226, 226] as RGB },
    { label: 'CLIENTES BD', value: `${data.clientesBD.total} (+${data.clientesBD.nuevos})`, color: C.blue, light: C.blueL },
  ];
  const kW = (pageW - margin * 2) / topKpis.length - 2;
  topKpis.forEach((k, i) => {
    const x = margin + i * (kW + 2.4);
    doc.setFillColor(...k.light); doc.roundedRect(x, y, kW, 15, 2, 2, 'F');
    doc.setFillColor(...k.color); doc.roundedRect(x, y, kW, 2.5, 1, 1, 'F'); doc.rect(x, y + 1.3, kW, 1.2, 'F');
    doc.setTextColor(...k.color); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
    doc.text(k.label, x + kW / 2, y + 6.5, { align: 'center' });
    doc.setTextColor(...C.dark); doc.setFontSize(k.value.length > 11 ? 8 : 10); doc.setFont('helvetica', 'bold');
    doc.text(k.value, x + kW / 2, y + 12, { align: 'center' });
  });
  y += 20;

  // ══════════════ SEGUIMIENTO DE VEHÍCULOS (arriba) ══════════════
  // Lo primero que se lee: qué carros entraron, se movieron o salieron ese
  // día, en qué quedaron y si ya pagaron. Iba al final, detrás de los gastos.
  const seg = data.seguimiento || [];
  section('1 · Seguimiento de vehículos del día', `${seg.length} vehículo${seg.length === 1 ? '' : 's'}`);
  const ESTADOS: Record<string, string> = {
    pendiente: 'PENDIENTE', confirmada: 'CONFIRMADA', en_revision: 'EN REVISIÓN', en_proceso: 'EN PROCESO',
    completada: 'COMPLETADA', completado: 'COMPLETADA', finalizado: 'ENTREGADO', cancelada: 'CANCELADA',
  };
  autoTable(doc, {
    startY: y,
    head: [['ID', 'ENTRADA', 'CLIENTE', 'VEHÍCULO', 'PLACA', 'TRABAJO', 'MECÁNICO', 'ESTADO', 'PAGO', 'ÚLTIMO MOVIMIENTO']],
    body: (seg.length ? seg : [{
      id: '—', entrada: '', cliente: 'Sin movimientos de vehículos este día', carro: '', placa: '',
      trabajo: '', mecanico: '', estado: '', ultimo: '', movimientos: 0, monto: 0, pago: '',
    }]).map(s => [
      s.id, s.entrada, s.cliente.substring(0, 24), s.carro.substring(0, 22), s.placa || '—',
      s.trabajo.substring(0, 60), s.mecanico.substring(0, 22),
      ESTADOS[s.estado] || s.estado.toUpperCase().replace(/_/g, ' '),
      s.pago || '—',
      s.ultimo.substring(0, 60),
    ]),
    theme: 'grid',
    headStyles: { fillColor: C.black, textColor: C.white, fontSize: 6.3, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 6.2, cellPadding: 1.3, textColor: C.dark, valign: 'middle' },
    alternateRowStyles: { fillColor: C.bg },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 15, halign: 'center' },
      2: { cellWidth: 30 }, 3: { cellWidth: 26 }, 4: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 'auto' }, 6: { cellWidth: 28 }, 7: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      8: { cellWidth: 30, fontStyle: 'bold' }, 9: { cellWidth: 44 },
    },
    didParseCell: (d: any) => {
      if (d.section !== 'body') return;
      const v = String(d.cell.raw || '');
      if (d.column.index === 8) {
        d.cell.styles.textColor = v.startsWith('Pagado') ? C.green
          : v.startsWith('Cashea') ? C.purple
            : v.startsWith('Debe') || v.startsWith('Sin cobro') ? C.red : C.gray;
      }
      if (d.column.index !== 7) return;
      if (v === 'COMPLETADA' || v === 'ENTREGADO') d.cell.styles.textColor = C.green;
      else if (v === 'EN PROCESO' || v === 'EN REVISIÓN') d.cell.styles.textColor = C.blue;
      else if (v === 'CANCELADA') d.cell.styles.textColor = C.red;
      else if (v) d.cell.styles.textColor = C.orange;
    },
    margin: { left: margin, right: margin },
  });
  afterTable();

  // ══════════════ S1 · TABLA PRINCIPAL (ingresos + bancos por cliente) ══════════════
  section('2 · Ingresos y registro de clientes', 'Bancos en Bs · DIV/BINANCE/ZELLE en $');
  autoTable(doc, {
    startY: y,
    head: [['Nº', 'CLIENTE', 'CARRO', 'PLACA', 'TOTAL', 'CONT.', 'CASHEA/BNC', 'IVA', 'INIC.', 'FINAN', 'X COB', 'PM BCO', 'PM EXT', 'P.BCM', 'P.BCO', 'BNC', 'DIV', 'BINAN', 'ZELLE', 'EF.BS']],
    body: data.ventas.map((v, i) => [
      i + 1, v.nombre.substring(0, 22), carro(v.carro, 18), v.placa || '—',
      usd(v.total), usd(v.contado), usd(v.cashea), usd(v.iva), usd(v.inicial), usd(v.financiado), usd(v.porCobrar),
      bs(v.bancos.pago_movil_banesco), bs(v.bancos.pago_movil_exterior), bs(v.bancos.punto_bancamiga),
      bs(v.bancos.punto_banesco), bs(v.bancos.bnc), fmt(v.bancos.dolares), fmt(v.bancos.binance), fmt(v.bancos.zelle), bs(v.bancos.efectivo_bs),
    ]),
    foot: [[
      '', 'TOTALES', '', '', usd(tv.total), usd(tv.contado), usd(tv.cashea), usd(tv.iva), usd(tv.inicial), usd(tv.financiado), usd(tv.porCobrar),
      bs(tv.bancos.pago_movil_banesco), bs(tv.bancos.pago_movil_exterior), bs(tv.bancos.punto_bancamiga),
      bs(tv.bancos.punto_banesco), bs(tv.bancos.bnc), fmt(tv.bancos.dolares), fmt(tv.bancos.binance), fmt(tv.bancos.zelle), bs(tv.bancos.efectivo_bs),
    ]],
    theme: 'grid',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 5, fontStyle: 'bold', halign: 'center', cellPadding: 1 },
    bodyStyles: { fontSize: 5, cellPadding: 1, textColor: C.dark, halign: 'right' },
    footStyles: { fillColor: C.orange, textColor: C.white, fontSize: 5.2, fontStyle: 'bold', halign: 'right', cellPadding: 1 },
    alternateRowStyles: { fillColor: C.bg },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' },
      1: { cellWidth: 30, halign: 'left' },
      2: { cellWidth: 24, halign: 'left' },
      // La placa aparte: es lo que identifica el carro en el taller.
      3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    tableWidth: pageW - margin * 2,
  });
  afterTable();

  // ══════════════ S1b · DETALLE DE CADA VENTA ══════════════
  // Lo que la tabla de bancos no dice: qué se le hizo, quién lo hizo y cómo
  // pagó, cuenta por cuenta. Así no hay que ir a Servicios a buscarlo.
  section('3 · Detalle de cada venta', `${data.ventas.length} venta${data.ventas.length === 1 ? '' : 's'}`);
  autoTable(doc, {
    startY: y,
    head: [['Nº', 'CLIENTE', 'VEHÍCULO', 'PLACA', 'TRABAJO REALIZADO', 'MECÁNICO', 'CÓMO PAGÓ', 'TOTAL', 'DEBE']],
    body: (data.ventas.length ? data.ventas : [{ nombre: 'Sin ventas este día', carro: '', total: 0, porCobrar: 0, financiado: 0 } as never])
      .map((v: ReporteDiarioData['ventas'][number], i: number) => [
        data.ventas.length ? i + 1 : '',
        v.nombre.substring(0, 28),
        v.carro || '—',
        v.placa || '—',
        (v.trabajo || '—').substring(0, 160),
        v.mecanico || '—',
        v.pago || '—',
        data.ventas.length ? usd(v.total) : '',
        data.ventas.length && (v.porCobrar + v.financiado) > 0.01 ? usd(v.porCobrar + v.financiado) : '',
      ]),
    theme: 'grid',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6, fontStyle: 'bold', halign: 'center', cellPadding: 1.2 },
    bodyStyles: { fontSize: 6, cellPadding: 1.3, textColor: C.dark, valign: 'top' },
    alternateRowStyles: { fillColor: C.bg },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 32 }, 2: { cellWidth: 26 },
      3: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, 4: { cellWidth: 'auto' },
      5: { cellWidth: 30 }, 6: { cellWidth: 50 }, 7: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
      8: { cellWidth: 16, halign: 'right', textColor: C.amber, fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });
  afterTable();

  // ══════════════ S1c · COBROS DE VENTAS DE OTROS DÍAS ══════════════
  // Abonos y pagos completos que entraron hoy por ventas anteriores. Su dinero
  // ya está sumado en el resumen de bancos de este día.
  const cobros = data.cobros || [];
  if (cobros.length) {
    section('4 · Cobros de ventas de otros días', `${cobros.length} cobro${cobros.length === 1 ? '' : 's'} · ${usd(data.cobrosTotal || 0)}`);
    autoTable(doc, {
      startY: y,
      head: [['CLIENTE', 'VEHÍCULO', 'PLACA', 'VENTA DEL', 'TIPO', 'CÓMO PAGÓ', 'COBRADO', 'QUEDA']],
      body: cobros.map(c => [
        c.cliente.substring(0, 28), c.carro || '—', c.placa || '—', c.fechaVenta, c.tipo, c.pago,
        usd(c.monto), c.saldoDespues > 0.009 ? usd(c.saldoDespues) : 'Saldada',
      ]),
      foot: [['', '', '', '', '', 'TOTAL COBRADO', usd(data.cobrosTotal || 0), '']],
      theme: 'grid',
      headStyles: { fillColor: C.green, textColor: C.white, fontSize: 6.2, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 6.2, cellPadding: 1.3, textColor: C.dark, valign: 'top' },
      footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.2, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 40 }, 1: { cellWidth: 32 }, 2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 22 }, 5: { cellWidth: 'auto' },
        6: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 18, halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });
    afterTable();
  }

  // Helper de sección con dos tablas lado a lado
  const half = (pageW - margin * 2 - 6) / 2;

  // ══════════════ S3 · SISTEMA  +  S4 · FORMA DE PAGO ══════════════
  // Dos tablas lado a lado no se pueden partir entre páginas: la de la derecha
  // se perdía. Se reserva el alto de la más larga antes de empezar.
  ensure(12 + (Math.max(data.sistema.length, data.formaPago.length) + 2) * 7.5);
  section('5 · Resumen por sistema   ·   6 · Forma de pago');
  const yStart = y;
  autoTable(doc, {
    startY: yStart,
    head: [['SISTEMA', 'CANT', 'MONTO $']],
    body: data.sistema.map(s => [s.sistema, s.cantidad, usd(s.monto)]),
    foot: [['TOTAL', '', usd(data.sistemaTotal)]],
    theme: 'grid',
    headStyles: { fillColor: C.blue, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4, textColor: C.dark },
    footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: half - 34 }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 20, halign: 'right' } },
    margin: { left: margin, right: pageW - margin - half },
    tableWidth: half,
  });
  const leftEnd = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: yStart,
    head: [['FORMA DE PAGO', 'CANT', 'MONTO $']],
    body: data.formaPago.map(f => [f.forma, f.cantidad, usd(f.monto)]),
    foot: [['TOTAL', '', usd(data.formaPagoTotal)]],
    theme: 'grid',
    headStyles: { fillColor: C.green, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4, textColor: C.dark },
    footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: half - 34 }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 20, halign: 'right' } },
    margin: { left: margin + half + 6, right: margin },
    tableWidth: half,
  });
  y = Math.max(leftEnd, doc.lastAutoTable.finalY) + 5;

  // ══════════════ S7 · DETALLE POR MÉTODO DE PAGO ══════════════
  section('7 · Detalle de método de pago (a qué banco o cuenta cayó)');
  autoTable(doc, {
    startY: y,
    head: [['MÉTODO / BANCO', 'CANT', 'MONTO (Bs)', 'TASA', 'EQUIV. $']],
    body: data.metodoPago.map(m => [m.metodo, m.cantidad, bs(m.montoBs), fmt(m.tasa), usd(m.montoUsd)]),
    foot: [['TOTAL', '', '', '', usd(data.metodoPagoTotalUsd)]],
    theme: 'grid',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4, textColor: C.dark },
    footStyles: { fillColor: C.orange, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    // La primera columna se estira. Con las cinco a ancho fijo la tabla medía
    // 173 mm dentro de los 277 disponibles: dejaba 104 mm en blanco a la
    // derecha mientras el resto del reporte ocupa la página entera, y autoTable
    // avisaba de esos 104 en cada generación.
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 25, halign: 'right' }, 4: { cellWidth: 30, halign: 'right' } },
    margin: { left: margin, right: margin },
  });
  afterTable();

  // ══════════════ S5 Facturas · S6 Caja · S12 Bancos (3 mini tablas) ══════════════
  section('8 · Facturas   ·   9 · Caja   ·   10 · Todo lo que entró a cada banco hoy');
  const yS = y;
  const third = (pageW - margin * 2 - 12) / 3;
  autoTable(doc, {
    startY: yS,
    head: [['FACTURAS', 'MONTO $']],
    body: [['Base imponible', usd(data.facturasMontos.base)], ['IVA (16%)', usd(data.facturasMontos.iva)]],
    foot: [['TOTAL', usd(data.facturasMontos.total)]],
    theme: 'grid',
    headStyles: { fillColor: C.blue, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4 }, footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: third - 24 }, 1: { cellWidth: 24, halign: 'right' } },
    margin: { left: margin, right: pageW - margin - third }, tableWidth: third,
  });
  const e1 = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: yS,
    head: [['CAJA', 'MONTO $']],
    body: [['Inicial', usd(data.caja.inicial)], ['Financiado', usd(data.caja.financiado)]],
    foot: [['TOTAL', usd(data.caja.total)]],
    theme: 'grid',
    headStyles: { fillColor: C.purple, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4 }, footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: third - 24 }, 1: { cellWidth: 24, halign: 'right' } },
    margin: { left: margin + third + 6, right: margin + third + 6 }, tableWidth: third,
  });
  const e2 = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: yS,
    head: [['BANCO', 'Bs', '$']],
    body: data.bancos.map(b => [b.banco, bs(b.bs), usd(b.usd)]),
    theme: 'grid',
    headStyles: { fillColor: C.green, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4 },
    columnStyles: { 0: { cellWidth: third - 44 }, 1: { cellWidth: 26, halign: 'right' }, 2: { cellWidth: 18, halign: 'right' } },
    margin: { left: margin + (third + 6) * 2, right: margin }, tableWidth: third,
  });
  y = Math.max(e1, e2, doc.lastAutoTable.finalY) + 5;

  // ══════════════ 11 · CUENTAS POR COBRAR ══════════════
  // La lista completa de deudores tiene su propio reporte («Pendientes»):
  // metida aquí ocupaba tres páginas del diario, igual todos los días. Aquí va
  // el total y lo que se quedó debiendo HOY.
  {
    const nuevas = data.ventas.filter(v => (v.porCobrar + v.financiado) > 0.009);
    section('11 · Cuentas por cobrar', `Total abierto: ${usd(data.porCobrarTotal)} · ${data.porCobrar.length} ventas`);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.gray);
    doc.text('El detalle de todos los clientes que deben está en el «Reporte de pendientes». Aquí, lo que quedó por cobrar de las ventas de hoy:', margin, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['CLIENTE', 'VEHÍCULO', 'PLACA', 'TOTAL', 'LO FINANCIA CASHEA', 'LO DEBE EL CLIENTE']],
      body: nuevas.length
        ? nuevas.map(v => [v.nombre.substring(0, 30), (v.carro || '—').substring(0, 28), v.placa || '—', usd(v.total), usd(v.financiado), usd(v.porCobrar)])
        : [['Todas las ventas de hoy quedaron pagadas', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: C.amber, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 6.8, cellPadding: 1.5, textColor: C.dark },
      alternateRowStyles: { fillColor: C.amberL },
      columnStyles: {
        0: { cellWidth: 60 }, 1: { cellWidth: 55 }, 2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 'auto', halign: 'right' }, 4: { cellWidth: 38, halign: 'right', textColor: C.purple },
        5: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: C.amber },
      },
      margin: { left: margin, right: margin },
    });
    afterTable();
  }

  // ══════════════ 12 · ARTÍCULOS  ·  13 · CARROS EN TALLER ══════════════
  // Iban lado a lado: al partirse entre páginas, la tabla de la derecha dejaba
  // páginas casi en blanco. Ahora van una debajo de otra, a lo ancho.
  section('12 · Control de inventario: artículos que salieron hoy', `${data.articulos.length} artículo(s)`);
  autoTable(doc, {
    startY: y,
    head: [['ARTÍCULO', 'CANT', 'ARTÍCULO', 'CANT']],
    // A dos columnas: la lista es larga y cada renglón es corto.
    body: (() => {
      const a = data.articulos.length ? data.articulos : [{ articulo: 'Sin salidas registradas', cantidad: 0 }];
      const mitad = Math.ceil(a.length / 2);
      return Array.from({ length: mitad }, (_, i) => [
        a[i].articulo.substring(0, 60), String(a[i].cantidad || ''),
        a[i + mitad] ? a[i + mitad].articulo.substring(0, 60) : '', a[i + mitad] ? String(a[i + mitad].cantidad) : '',
      ]);
    })(),
    theme: 'grid',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.6, cellPadding: 1.3, textColor: C.dark },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 14, halign: 'center' } },
    margin: { left: margin, right: margin },
  });
  afterTable();

  const taller = data.taller.slice(0, 20);
  section('13 · Carros abiertos en el taller', data.taller.length > taller.length
    ? `${taller.length} más recientes de ${data.taller.length}` : `${taller.length} carro(s)`);
  autoTable(doc, {
    startY: y,
    head: [['CARRO', 'PLACA', 'MECÁNICO', 'TRABAJO']],
    body: (taller.length ? taller : [{ carro: 'Sin vehículos en taller', placa: '', mecanico: '—', trabajo: '—' }])
      .map(t => [t.carro.substring(0, 40), t.placa || '—', t.mecanico.substring(0, 30), t.trabajo.substring(0, 110)]),
    theme: 'grid',
    headStyles: { fillColor: C.blue, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.6, cellPadding: 1.3, textColor: C.dark },
    alternateRowStyles: { fillColor: C.bg },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, 2: { cellWidth: 45 }, 3: { cellWidth: 'auto' } },
    margin: { left: margin, right: margin },
  });
  afterTable();

  // ══════════════ S8 · KPIs REDES / APP / RCV / CERT ══════════════
  section('14 · KPIs: redes, app y trámites   ·   clientes en base de datos');
  const kpiDefs: Array<[string, KpiPar, RGB]> = [
    ['REDES / INSTAGRAM', data.kpis.redes, C.purple],
    ['REGISTRO EN LA APP', data.kpis.app, C.blue],
    ['RCV', data.kpis.rcv, C.green],
    ['CERTIFICADO MÉDICO', data.kpis.cert, C.amber],
    ['CLIENTES EN BD', { inicial: data.clientesBD.total - data.clientesBD.nuevos, nuevos: data.clientesBD.nuevos, total: data.clientesBD.total }, C.orange],
  ];
  const kW2 = (pageW - margin * 2) / kpiDefs.length - 2;
  ensure(20);
  kpiDefs.forEach(([label, par, color], i) => {
    const x = margin + i * (kW2 + 2.4);
    doc.setFillColor(...C.bg); doc.roundedRect(x, y, kW2, 17, 2, 2, 'F');
    doc.setDrawColor(...color); doc.setLineWidth(0.4); doc.roundedRect(x, y, kW2, 17, 2, 2, 'S');
    doc.setTextColor(...color); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
    doc.text(label, x + kW2 / 2, y + 4.5, { align: 'center' });
    doc.setTextColor(...C.gray); doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
    doc.text(`Inicial ${par.inicial}   ·   Nuevos +${par.nuevos}`, x + kW2 / 2, y + 9.5, { align: 'center' });
    doc.setTextColor(...C.dark); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`${par.total}`, x + kW2 / 2, y + 15, { align: 'center' });
  });
  y += 22;

  // ══════════════ S13 · GASTOS ══════════════
  section('15 · Gastos del día', `Total: ${usd(data.gastosTotal.usd)}  ·  ${bs(data.gastosTotal.bs)} Bs`);
  autoTable(doc, {
    startY: y,
    // De qué cuenta salió cada gasto, a quién y para qué carro.
    head: [['Nº', 'CONCEPTO', 'PROVEEDOR', 'PLACA', 'PAGADO DESDE', 'Bs', '$']],
    body: (data.gastos.length ? data.gastos : [{ concepto: 'Sin gastos registrados', bs: 0, usd: 0 }])
      .map((g, i) => [i + 1, g.concepto, (g.proveedor || '—').substring(0, 24), g.placa || '—', g.cuenta || '—', bs(g.bs), usd(g.usd)]),
    foot: [['', 'TOTAL', '', '', '', bs(data.gastosTotal.bs), usd(data.gastosTotal.usd)]],
    theme: 'grid',
    headStyles: { fillColor: C.red, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4, textColor: C.dark },
    footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 40 },
      3: { cellWidth: 18, halign: 'center', fontStyle: 'bold' }, 4: { cellWidth: 52 },
      5: { cellWidth: 28, halign: 'right' }, 6: { cellWidth: 24, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });
  afterTable();

  // ══════════════ FOOTER en todas las páginas ══════════════
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(6); doc.setFont('helvetica', 'italic'); doc.setTextColor(...C.light);
    doc.text(`Generado por Sistema Lycos Team · ${data.generadoEn} · Documento interno`, margin, pageH - 5);
    doc.text(`Página ${p} de ${pages}`, pageW - margin, pageH - 5, { align: 'right' });
  }

  doc.save(`LYCOS_REPORTE_DIARIO_${data.fecha}.pdf`);
}
