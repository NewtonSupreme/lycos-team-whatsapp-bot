import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FichaVehiculo } from '@/lib/ficha/vehiculo';
import { lineasDeMetodos, resumenCorto } from '@/lib/pagos/desglose';

/**
 * La ficha del vehículo en papel.
 *
 * Lo mismo que se ve en pantalla —el carro, su dueño, cada trabajo con lo que
 * se cobró, cada pieza con lo que costó, a quién se le compró, si ya se pagó y
 * de qué cuenta— en un documento que se puede archivar, mandar o llevar al
 * taller. Es interno: lleva costos y ganancias, no es para el cliente.
 */

type RGB = [number, number, number];
const C = {
  negro: [22, 24, 29] as RGB,
  gris: [91, 97, 110] as RGB,
  claro: [138, 144, 156] as RGB,
  borde: [232, 234, 237] as RGB,
  fondo: [250, 251, 252] as RGB,
  naranja: [249, 115, 22] as RGB,
  verde: [22, 163, 74] as RGB,
  rojo: [220, 38, 38] as RGB,
  ambar: [194, 65, 12] as RGB,
  blanco: [255, 255, 255] as RGB,
};

const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const fecha = (f?: string | null) => {
  if (!f) return '—';
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(f);
};

const ESTADOS: Record<string, string> = {
  pendiente: 'Pendiente', confirmada: 'Confirmada', en_revision: 'En revisión', en_proceso: 'En proceso',
  completada: 'Completada', completado: 'Completada', finalizado: 'Entregado', cancelada: 'Cancelada',
};
const PAGO: Record<string, string> = {
  pagado: 'Pagado', por_pagar: 'Se debe', parcial: 'Abonado', no_aplica: '—',
};
const TIPOS: Record<string, string> = {
  repuesto: 'Repuesto', mano_obra: 'Mano de obra', servicio: 'Servicio', insumo: 'Insumo',
};

export function generarFichaPDF(ficha: FichaVehiculo, opciones?: { generadoPor?: string }) {
  const doc = new jsPDF('p', 'mm', 'a4') as any;
  const W = doc.internal.pageSize.getWidth();   // 210
  const H = doc.internal.pageSize.getHeight();  // 297
  const M = 12;
  let y = M;

  const barra = () => { doc.setFillColor(...C.naranja); doc.rect(0, 0, W, 2, 'F'); };
  const asegurar = (alto: number) => { if (y + alto > H - 14) { doc.addPage(); barra(); y = M + 2; } };
  const titulo = (texto: string, extra?: string) => {
    asegurar(24);
    doc.setFillColor(...C.negro);
    doc.roundedRect(M, y, W - M * 2, 7, 1, 1, 'F');
    doc.setTextColor(...C.blanco);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(texto.toUpperCase(), M + 3.5, y + 4.8);
    if (extra) doc.text(extra, W - M - 3.5, y + 4.8, { align: 'right' });
    y += 10;
  };

  // ── Cabecera ────────────────────────────────────────────────────────────
  barra();
  doc.setTextColor(...C.negro);
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(20);
  doc.text('LYCOS TEAM', M, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.claro);
  doc.text('MECÁNICA INTEGRAL · FICHA DEL VEHÍCULO · DOCUMENTO INTERNO', M, y + 13);
  const ahora = new Date().toLocaleString('es-VE', {
    timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
  doc.setFont('helvetica', 'normal');
  doc.text(`Generada el ${ahora}${opciones?.generadoPor ? ` por ${opciones.generadoPor}` : ''}`, W - M, y + 13, { align: 'right' });
  y += 19;

  // ── El carro y su dueño ────────────────────────────────────────────────
  const v = ficha.vehiculo;
  doc.setFillColor(...C.fondo);
  doc.setDrawColor(...C.borde);
  doc.roundedRect(M, y, W - M * 2, 24, 2, 2, 'FD');
  doc.setFillColor(...C.negro);
  doc.roundedRect(M + 4, y + 4, 40, 16, 1.5, 1.5, 'F');
  doc.setTextColor(...C.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(v?.placa || '—', M + 24, y + 14.2, { align: 'center' });

  doc.setTextColor(...C.negro);
  doc.setFontSize(12);
  doc.text((v?.info || 'Vehículo no registrado').slice(0, 48), M + 50, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gris);
  const datosCarro = [
    v?.anio ? `Año ${v.anio}` : '', v?.color ? `Color ${v.color}` : '',
    v?.kilometraje ? `${v.kilometraje.toLocaleString('es-VE')} km` : '', v?.vin ? `VIN ${v.vin}` : '',
  ].filter(Boolean).join('  ·  ');
  if (datosCarro) doc.text(datosCarro, M + 50, y + 14);
  const cliente = ficha.cliente;
  // «00000000» es el relleno que se puso a los clientes sin teléfono, no un número.
  const telefono = /[1-9]/.test(String(cliente?.telefono || '')) ? cliente!.telefono : null;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.negro);
  doc.text(`Cliente: ${cliente?.nombre || 'Sin cliente'}${telefono ? `  ·  ${telefono}` : ''}`, M + 50, y + 19.5);
  y += 30;

  // ── Cifras ─────────────────────────────────────────────────────────────
  const t = ficha.totales;
  const cifras: Array<[string, string, RGB]> = [
    ['COBRADO AL CLIENTE', usd(t.venta), C.negro],
    ['COSTOS', usd(t.costo), C.rojo],
    ['GANANCIA', `${usd(t.utilidad)}  (${Math.round(t.margen)}%)`, t.utilidad < 0 ? C.rojo : C.verde],
    ['SE LE DEBE A PROVEEDORES', usd(t.porPagar), t.porPagar > 0 ? C.ambar : C.negro],
  ];
  const cw = (W - M * 2 - 6) / 4;
  cifras.forEach(([et, val, color], i) => {
    const x = M + i * (cw + 2);
    doc.setDrawColor(...C.borde);
    doc.roundedRect(x, y, cw, 15, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...C.claro);
    doc.text(et, x + 3, y + 5);
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text(val, x + 3, y + 11.5);
  });
  y += 19;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...C.gris);
  doc.text(
    `En reportes: ${usd(ficha.registrado.ingresos)} cobrados en ${ficha.registrado.nVentas} venta(s) · `
    + `${usd(ficha.registrado.egresos)} gastados en ${ficha.registrado.nEgresos} egreso(s) · `
    + `utilidad registrada ${usd(ficha.registrado.utilidad)}`,
    M, y,
  );
  y += 6;

  // ── Trabajos ───────────────────────────────────────────────────────────
  titulo('Historial de trabajos', `${ficha.servicios.length} orden(es)`);
  autoTable(doc, {
    startY: y,
    head: [['FECHA', 'TRABAJO', 'ESTADO', 'RENGLONES DE LA ORDEN', 'MECÁNICO · LE QUEDÓ', 'COBRADO', 'COSTO']],
    body: (ficha.servicios.length ? ficha.servicios : [null]).map(s => s ? [
      fecha(s.fecha),
      (s.tipo_personalizado || s.descripcion || s.tipo || 'Servicio').slice(0, 60),
      ESTADOS[String(s.estado)] || s.estado || '—',
      s.items.length
        ? s.items.map(i => `${i.cantidad || 1} × ${i.descripcion || ''} (${usd(Number(i.total) || 0)})`).join('\n')
        : '—',
      s.nomina.length
        ? s.nomina.map(t => `${t.empleado}${t.esOverride ? ' (superv.)' : ''}: ${t.comision > 0 ? usd(t.comision) : 'sin definir'}`).join('\n')
        : 'Sin mecánico en nómina',
      usd(s.monto),
      s.costoFicha > 0 ? usd(s.costoFicha) : '—',
    ] : ['', 'Este vehículo no tiene órdenes registradas', '', '', '', '', '']),
    theme: 'grid',
    headStyles: { fillColor: C.fondo, textColor: C.negro, fontSize: 6.8, fontStyle: 'bold', lineColor: C.borde },
    bodyStyles: { fontSize: 7, cellPadding: 1.6, textColor: C.negro, lineColor: C.borde, valign: 'top' },
    columnStyles: {
      0: { cellWidth: 17 }, 1: { cellWidth: 34 }, 2: { cellWidth: 18 },
      3: { cellWidth: 'auto', textColor: C.gris }, 4: { cellWidth: 36 },
      5: { cellWidth: 18, halign: 'right', fontStyle: 'bold' }, 6: { cellWidth: 16, halign: 'right' },
    },
    margin: { left: M, right: M },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ── Renglones: cobro, costo, proveedor y pago ─────────────────────────
  titulo('Detalle de repuestos, mano de obra y costos', `${ficha.partidas.length} renglón(es)`);
  autoTable(doc, {
    startY: y,
    head: [['FECHA', 'DESCRIPCIÓN', 'TIPO', 'CANT', 'COBRADO', 'COSTO', 'GANANCIA', 'PROVEEDOR', 'PAGO', 'PAGADO DESDE']],
    body: (ficha.partidas.length ? ficha.partidas : [null]).map(p => {
      if (!p) return ['', 'Sin renglones en la ficha', '', '', '', '', '', '', '', ''];
      const lineas = lineasDeMetodos(p.metodos_pago || null, Number(p.tasa_pago) || 0);
      const estado = p.origen === 'cliente' ? 'Lo trajo el cliente' : (PAGO[p.estado_pago] || p.estado_pago);
      return [
        fecha(p.fecha),
        p.descripcion,
        TIPOS[p.tipo] || p.tipo,
        String(p.cantidad),
        usd(p.total_venta),
        p.total_costo > 0 ? usd(p.total_costo) : '—',
        usd(p.utilidad),
        p.proveedor || '—',
        p.saldo_proveedor > 0 ? `${estado} ${usd(p.saldo_proveedor)}` : estado,
        lineas.length ? resumenCorto(lineas) : (p.total_costo > 0 && p.estado_pago !== 'por_pagar' ? 'Sin cuenta' : '—'),
      ];
    }),
    foot: [['', 'TOTAL', '', '', usd(t.venta), usd(t.costo), usd(t.utilidad), '', t.porPagar > 0 ? `Se debe ${usd(t.porPagar)}` : '', '']],
    theme: 'grid',
    headStyles: { fillColor: C.fondo, textColor: C.negro, fontSize: 5.8, fontStyle: 'bold', lineColor: C.borde },
    bodyStyles: { fontSize: 6.6, cellPadding: 1.4, textColor: C.negro, lineColor: C.borde, valign: 'top' },
    footStyles: { fillColor: C.negro, textColor: C.blanco, fontSize: 6.6, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 15 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 15 }, 3: { cellWidth: 10, halign: 'center' },
      4: { cellWidth: 15, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 16.5, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 21 }, 8: { cellWidth: 17 }, 9: { cellWidth: 24 },
    },
    didParseCell: (d: any) => {
      if (d.section !== 'body') return;
      if (d.column.index === 6 && String(d.cell.raw).startsWith('$-')) d.cell.styles.textColor = C.rojo;
      if (d.column.index === 8) {
        const v = String(d.cell.raw);
        if (v.startsWith('Se debe') || v.startsWith('Abonado')) d.cell.styles.textColor = C.ambar;
        else if (v === 'Pagado') d.cell.styles.textColor = C.verde;
      }
      if (d.column.index === 9 && d.cell.raw === 'Sin cuenta') d.cell.styles.textColor = C.ambar;
    },
    margin: { left: M, right: M },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ── Lo que hay que revisar ────────────────────────────────────────────
  if (ficha.alertas.length) {
    titulo('Revisa esto');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.ambar);
    for (const a of ficha.alertas) {
      const lineas = doc.splitTextToSize(`• ${a}`, W - M * 2 - 4);
      asegurar(lineas.length * 3.6 + 1);
      doc.text(lineas, M + 2, y);
      y += lineas.length * 3.6 + 1;
    }
  }

  // ── Pie en todas las páginas ──────────────────────────────────────────
  const paginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.setTextColor(...C.claro);
    doc.text(`Lycos Team · Ficha de ${v?.placa || 'vehículo'} · Documento interno con costos`, M, H - 6);
    doc.text(`Página ${p} de ${paginas}`, W - M, H - 6, { align: 'right' });
  }

  doc.save(`Ficha_${(v?.placa || 'vehiculo').replace(/\W+/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
