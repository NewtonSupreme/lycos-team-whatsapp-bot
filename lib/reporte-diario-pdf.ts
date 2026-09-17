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
  ventas: Array<{ nombre: string; carro: string; total: number; contado: number; cashea: number; iva: number; inicial: number; financiado: number; porCobrar: number; bancos: BankRec; departamentos: DeptRec }>;
  totalesVentas: { total: number; contado: number; cashea: number; iva: number; inicial: number; financiado: number; porCobrar: number; departamentos: DeptRec; bancos: BankRec };
  porCobrar: Array<{ nombre: string; carro: string; monto: number; observacion: string }>;
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
  taller: Array<{ carro: string; mecanico: string; trabajo: string }>;
  bancos: Array<{ banco: string; bs: number; usd: number }>;
  gastos: Array<{ concepto: string; usd: number; bs: number }>;
  gastosTotal: { usd: number; bs: number };
  generadoEn: string;
}
interface KpiPar { inicial: number; nuevos: number; total: number }

export function generateReporteDiarioPDF(data: ReporteDiarioData) {
  const doc = new jsPDF('l', 'mm', 'a4') as any; // landscape
  const pageW = doc.internal.pageSize.getWidth();  // 297
  const pageH = doc.internal.pageSize.getHeight(); // 210
  const margin = 10;
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
    { label: 'CASHEA', value: usd(tv.cashea), color: C.purple, light: [237, 233, 254] as RGB },
    // Este NO es del dia: es todo el saldo abierto del taller. Al lado de
    // «INGRESOS DIA» y «GASTOS DIA» se leia como si fueran $5.546 pendientes
    // de ese mismo dia.
    { label: 'POR COBRAR (TOTAL)', value: usd(data.porCobrarTotal), color: C.amber, light: C.amberL },
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

  // ══════════════ S1 · TABLA PRINCIPAL (ingresos + bancos por cliente) ══════════════
  section('1 · Ingresos y registro de clientes', 'Bancos en Bs · DIV/BINANCE/ZELLE en $');
  autoTable(doc, {
    startY: y,
    head: [['Nº', 'CLIENTE', 'CARRO', 'TOTAL', 'CONT.', 'CASHEA', 'IVA', 'INIC.', 'FINAN', 'X COB', 'PM BCO', 'PM EXT', 'P.BCM', 'P.BCO', 'BNC', 'DIV', 'BINAN', 'ZELLE', 'EF.BS']],
    body: data.ventas.map((v, i) => [
      i + 1, v.nombre.substring(0, 22), carro(v.carro),
      usd(v.total), usd(v.contado), usd(v.cashea), usd(v.iva), usd(v.inicial), usd(v.financiado), usd(v.porCobrar),
      bs(v.bancos.pago_movil_banesco), bs(v.bancos.pago_movil_exterior), bs(v.bancos.punto_bancamiga),
      bs(v.bancos.punto_banesco), bs(v.bancos.bnc), fmt(v.bancos.dolares), fmt(v.bancos.binance), fmt(v.bancos.zelle), bs(v.bancos.efectivo_bs),
    ]),
    foot: [[
      '', 'TOTALES', '', usd(tv.total), usd(tv.contado), usd(tv.cashea), usd(tv.iva), usd(tv.inicial), usd(tv.financiado), usd(tv.porCobrar),
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
      1: { cellWidth: 34, halign: 'left' },
      2: { cellWidth: 28, halign: 'left' },
    },
    margin: { left: margin, right: margin },
    tableWidth: pageW - margin * 2,
  });
  afterTable();

  // Helper de sección con dos tablas lado a lado
  const half = (pageW - margin * 2 - 6) / 2;

  // ══════════════ S3 · SISTEMA  +  S4 · FORMA DE PAGO ══════════════
  section('3 · Resumen por sistema   ·   4 · Forma de pago');
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
  section('7 · Detalle de método de pago (a qué banco/cuenta cayó)');
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
  section('5 · Facturas   ·   6 · Caja   ·   12 · Resumen de bancos');
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

  // ══════════════ S2 · CUENTAS POR COBRAR ══════════════
  if (data.porCobrar.length) {
    section('2 · Cuentas por cobrar', `Total: ${usd(data.porCobrarTotal)}`);
    autoTable(doc, {
      startY: y,
      head: [['CLIENTE', 'VEHÍCULO', 'MONTO $', 'OBSERVACIÓN']],
      body: data.porCobrar.map(p => [p.nombre.substring(0, 26), (p.carro || '—').substring(0, 24), usd(p.monto), (p.observacion || '').substring(0, 60)]),
      foot: [['', 'TOTAL', usd(data.porCobrarTotal), '']],
      theme: 'grid',
      headStyles: { fillColor: C.amber, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 6.5, cellPadding: 1.4, textColor: C.dark },
      footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.amberL },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 55 }, 2: { cellWidth: 28, halign: 'right' }, 3: { cellWidth: 'auto' } },
      margin: { left: margin, right: margin },
    });
    afterTable();
  }

  // ══════════════ S10 Artículos  +  S11 Carros en taller ══════════════
  section('10 · Control de inventario / artículos   ·   11 · Carros en taller');
  const yIt = y;
  autoTable(doc, {
    startY: yIt,
    head: [['ARTÍCULO', 'CANT']],
    body: (data.articulos.length ? data.articulos : [{ articulo: 'Sin salidas registradas', cantidad: 0 }]).map(a => [a.articulo.substring(0, 40), a.cantidad]),
    theme: 'grid',
    headStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.3, textColor: C.dark },
    columnStyles: { 0: { cellWidth: half - 18 }, 1: { cellWidth: 18, halign: 'center' } },
    margin: { left: margin, right: pageW - margin - half }, tableWidth: half,
  });
  const aEnd = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: yIt,
    head: [['CARRO', 'MECÁNICO', 'TRABAJO']],
    body: (data.taller.length ? data.taller : [{ carro: 'Sin vehículos en taller', mecanico: '—', trabajo: '—' }]).map(t => [t.carro.substring(0, 26), t.mecanico.substring(0, 16), t.trabajo.substring(0, 30)]),
    theme: 'grid',
    headStyles: { fillColor: C.blue, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.3, textColor: C.dark },
    columnStyles: { 0: { cellWidth: (half - 6) * 0.36 }, 1: { cellWidth: (half - 6) * 0.28 }, 2: { cellWidth: 'auto' } },
    margin: { left: margin + half + 6, right: margin }, tableWidth: half,
  });
  y = Math.max(aEnd, doc.lastAutoTable.finalY) + 5;

  // ══════════════ S8 · KPIs REDES / APP / RCV / CERT ══════════════
  section('8 · KPIs: Redes, App y Trámites   ·   9 · Clientes en base de datos');
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
  section('13 · Gastos del día', `Total: ${usd(data.gastosTotal.usd)}  ·  ${bs(data.gastosTotal.bs)} Bs`);
  autoTable(doc, {
    startY: y,
    head: [['Nº', 'CONCEPTO', 'Bs', '$']],
    body: (data.gastos.length ? data.gastos : [{ concepto: 'Sin gastos registrados', bs: 0, usd: 0 }]).map((g, i) => [i + 1, g.concepto, bs(g.bs), usd(g.usd)]),
    foot: [['', 'TOTAL', bs(data.gastosTotal.bs), usd(data.gastosTotal.usd)]],
    theme: 'grid',
    headStyles: { fillColor: C.red, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.4, textColor: C.dark },
    footStyles: { fillColor: C.dark, textColor: C.white, fontSize: 6.5, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 35, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' } },
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
