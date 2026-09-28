import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { completarFactura } from '@/lib/facturas/completar';
import {
  montoConMoneda, nombreDeLinea, tipoDePago, totalUSD, type LineaPago,
} from '@/lib/pagos/desglose';

export interface InvoiceData {
  id?: string;
  correlativo?: string;
  fecha: string;
  cliente?: string;
  /**
   * La cedula o RIF del cliente.
   *
   * Una factura a nombre de alguien necesita su documento; sin el es una nota
   * de entrega, no una factura. Se pide en la orden de servicio y hasta ahora
   * no llegaba al PDF.
   */
  cedula?: string | null;
  vehiculo?: string;
  items: Array<{
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    total: number;
  }>;
  total: number;
  notas?: string;
  pago_usd?: number;
  pago_ves?: number;
  tasa_bcv?: number;
  tasa_cambio?: number;
  total_ves?: number;
  iva_aplicado?: boolean;
  metodos_pago?: any;
  currency?: string;
  // Abono / Pending fields
  tiene_abono?: boolean;
  abono?: number;
  total_abonado?: number;
  saldo_pendiente?: number;
  estado?: 'pagado' | 'pendiente';
  // Historial de abonos (para mostrar todos los pagos parciales)
  abonos?: Array<{
    monto: number;
    metodo_pago?: string;
    created_at?: string;
    saldo_despues?: number;
  }>;
  es_abono?: boolean; // si esta factura representa un abono individual
  // Comprobante de pago (referencia + imagen del pago móvil / transferencia)
  comprobante_url?: string;
  comprobante_referencia?: string;
  /**
   * Quién hizo el trabajo. Si no llega, se busca por la orden o la venta; y si
   * tampoco consta, la factura dice «Sin asignar» en vez de callarlo.
   */
  mecanico?: string | null;
  /** Cómo se pagó, ya en líneas. Si no llega, se saca de `metodos_pago` o de la venta. */
  pagos?: LineaPago[];
  /** La tasa con la que se cobraron los bolívares. */
  tasa_pago?: number | null;
  /** El día en que el vehículo entró al taller. */
  fecha_entrada?: string | null;
  /** El día en que la venta quedó pagada; puede ser posterior a la venta. */
  fecha_pago?: string | null;
  /** Para encontrar la orden o la venta de esta factura. */
  servicio_id?: string | null;
  venta_id?: string | null;
  referencia_id?: string | null;
  referencia_tabla?: string | null;
}

/**
 * La fecha como se lee en Venezuela: 16/09/2026.
 *
 * El PDF imprimia `data.fecha` en crudo, y lo que llega es la fecha ISO de la
 * base (`2026-09-16`). En un documento que va al cliente eso se lee como el mes
 * 09 del dia 16 solo si ya sabes que es ISO.
 *
 * El `T12:00:00` es a proposito: `new Date('2026-09-16')` se interpreta como
 * medianoche UTC y en Venezuela (UTC-4) se imprimiria el 15.
 */
function fechaVE(iso?: string | null): string {
  const t = String(iso || '').trim();
  if (!t) return '';
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(t);
  const d = new Date(soloFecha ? `${t}T12:00:00` : t);
  if (Number.isNaN(d.getTime())) return t;  // lo que no se entiende se deja tal cual
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Carga una imagen remota o dataURL y la devuelve como dataURL para jsPDF. */
async function loadImageAsDataURL(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    let dataUrl = url;
    if (!url.startsWith('data:')) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const blob = await res.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 600, height: img.naturalHeight || 800 });
      img.onerror = () => resolve({ width: 600, height: 800 });
      img.src = dataUrl;
    });
    return { dataUrl, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}

/** Dibuja una página de "Comprobante de Pago" con la referencia y la imagen adjunta. */
async function drawComprobantePage(doc: any, data: any) {
  if (!data?.comprobante_url && !data?.comprobante_referencia) return;
  doc.addPage('a4', 'p');
  const pageW = doc.internal.pageSize.getWidth();
  const black = [15, 23, 42] as [number, number, number];
  const grayLight = [148, 163, 184] as [number, number, number];
  const orange = [249, 115, 22] as [number, number, number];

  doc.setTextColor(...black);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bolditalic');
  doc.text('LYCOS TEAM', 20, 24);
  doc.setTextColor(...orange);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROBANTE DE PAGO', 20, 31);

  doc.setDrawColor(226, 232, 240);
  doc.line(20, 36, pageW - 20, 36);

  let y = 46;
  doc.setTextColor(...grayLight);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  if (data.correlativo || data.id) {
    doc.text('FACTURA / NOTA:', 20, y);
    doc.setTextColor(...black);
    doc.setFontSize(10);
    doc.text(String(data.correlativo || data.id?.slice(0, 8)?.toUpperCase() || ''), 55, y);
    y += 7;
  }
  if (data.cliente) {
    doc.setTextColor(...grayLight);
    doc.setFontSize(8);
    doc.text('CLIENTE:', 20, y);
    doc.setTextColor(...black);
    doc.setFontSize(10);
    doc.text(String(data.cliente).toUpperCase(), 55, y);
    y += 7;
  }
  if (data.comprobante_referencia) {
    doc.setTextColor(...grayLight);
    doc.setFontSize(8);
    doc.text('REFERENCIA:', 20, y);
    doc.setTextColor(...orange);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(String(data.comprobante_referencia), 55, y);
    y += 9;
  }

  if (data.comprobante_url) {
    const img = await loadImageAsDataURL(data.comprobante_url);
    if (img) {
      const maxW = pageW - 40;
      const maxH = doc.internal.pageSize.getHeight() - y - 20;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = (pageW - w) / 2;
      try {
        const fmt = img.dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(img.dataUrl, fmt, x, y + 2, w, h, undefined, 'FAST');
      } catch { /* si falla la imagen, igual queda la referencia */ }
    } else {
      doc.setTextColor(...grayLight);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('(No se pudo cargar la imagen del comprobante)', 20, y + 4);
    }
  }
}

export interface PrintOptions {
  mode: 'single' | 'dual' | 'diferente';
  side?: 'left' | 'right';
  currencyMode?: 'usd' | 'dual' | 'auto';
}

export type InvoicePDFItem = InvoiceData & { iva_aplicado?: boolean; tasa_bcv?: number; total_ves?: number };

export const generateInvoicePDF = async (
  dataList: InvoicePDFItem[],
  options: PrintOptions = { mode: 'dual', currencyMode: 'dual' }
) => {
  // Orientation: Landscape (l), Unit: mm, Format: a4 (297x210)
  const doc = new jsPDF('l', 'mm', 'a4') as any;

  // El mecánico y el cobro real, que ninguna pantalla traía completos.
  dataList = await Promise.all(dataList.map(d => (d ? completarFactura(d as never) : d)));

  const drawInvoice = (data: any, startX: number) => {
    if (!data) return;

    // Colors
    const black = [15, 23, 42] as [number, number, number];
    const grayDark = [71, 85, 105] as [number, number, number];
    const grayLight = [148, 163, 184] as [number, number, number];
    const border = [226, 232, 240] as [number, number, number];
    const orange = [249, 115, 22] as [number, number, number];
    const white = [255, 255, 255] as [number, number, number];

    const margin = startX + 12;
    const rightAlign = startX + 136.5;

    // ── Header Section ──────────────────────────────────────────
    doc.setTextColor(...black);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bolditalic');
    doc.text('LYCOS TEAM', margin, 25);

    doc.setTextColor(...grayLight);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('MECÁNICA INTEGRAL', margin, 31);

    // Correlativo / Nota de Entrega (Top Right)
    const correlativoLabel = data.correlativo ? 'FACTURA' : 'NOTA DE ENTREGA #';
    const correlativoValue = data.correlativo || (data.id ? data.id.slice(0, 8).toUpperCase() : 'BORRADOR');
    doc.setTextColor(...grayLight);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(correlativoLabel, rightAlign, 20, { align: 'right' });

    doc.setTextColor(...black);
    doc.setFontSize(14);
    doc.text(correlativoValue, rightAlign, 27, { align: 'right' });
    
    doc.setTextColor(...grayDark);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(fechaVE(data.fecha), rightAlign, 33, { align: 'right' });

    // Entrada del vehículo y día del pago. La fecha de arriba es la de la
    // venta; un carro que entró el 21 y se pagó el 25 tiene que decir las dos.
    {
      const partes: Array<[string, string, [number, number, number]]> = [];
      if (data.fecha_entrada) partes.push(['ENTRADA:', fechaVE(data.fecha_entrada), grayDark]);
      if (data.fecha_pago) partes.push(['PAGADO:', fechaVE(data.fecha_pago), [22, 163, 74]]);
      else if (data.estado === 'pendiente') partes.push(['PAGO:', 'PENDIENTE', orange]);
      let x = margin;
      doc.setFontSize(7);
      for (const [etq, val, color] of partes) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...grayLight);
        doc.text(etq, x, 35.5);
        x += doc.getTextWidth(etq) + 1;
        doc.setTextColor(...color);
        doc.text(val, x, 35.5);
        x += doc.getTextWidth(val) + 5;
      }
      doc.setFont('helvetica', 'normal');
    }

    // Divider
    doc.setDrawColor(...border);
    doc.setLineWidth(0.4);
    doc.line(margin, 38, rightAlign, 38);

    // ── Client Info ─────────────────────────────────────────────
    doc.setTextColor(...grayLight);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE / TITULAR:', margin, 48);
    
    doc.setTextColor(...black);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(data.cliente?.toUpperCase() || 'CONSUMIDOR FINAL', margin, 54);

    // La cedula va debajo del nombre, no en su propia fila: cuando no la hay
    // —y en muchas fichas todavia no la hay— no queda un hueco con etiqueta.
    if (data.cedula) {
      doc.setTextColor(...grayDark);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(String(data.cedula).toUpperCase(), margin, 58.5);
    }
    
    doc.setTextColor(...grayLight);
    doc.setFontSize(7);
    doc.text('VEHÍCULO / MODELO:', rightAlign, 48, { align: 'right' });
    
    doc.setTextColor(...black);
    doc.setFontSize(11);
    doc.text(data.vehiculo?.toUpperCase() || '---', rightAlign, 54, { align: 'right' });

    // El mecánico va siempre. Si no consta, se dice: una nota de entrega sin
    // responsable es justo lo que hay que notar.
    const mecanico = String(data.mecanico || '').trim();
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...grayLight);
    const etiquetaMec = 'MECÁNICO: ';
    const nombreMec = (mecanico || 'SIN ASIGNAR').toUpperCase().slice(0, 44);
    doc.setTextColor(...(mecanico ? grayDark : orange));
    doc.text(nombreMec, rightAlign, 58.5, { align: 'right' });
    doc.setTextColor(...grayLight);
    doc.text(etiquetaMec, rightAlign - doc.getTextWidth(nombreMec), 58.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    // ── Pending Status Ribbon ───────────────────────────────────
    if (data.estado === 'pendiente') {
      const ribbonY = 40;
      const ribbonH = 14;
      const ribbonColor = [245, 158, 11] as [number, number, number]; // amber

      doc.setFillColor(...ribbonColor);
      doc.roundedRect(margin, ribbonY, 60, ribbonH, 2, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('PENDIENTE', margin + 30, ribbonY + 5, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('POR PAGAR', margin + 30, ribbonY + 12, { align: 'center' });
    }

    // ── Table ───────────────────────────────────────────────────
    const bcvRateUsed = data.tasa_bcv || data.tasa_cambio || 518.0;
    const isDual = options.currencyMode === 'dual';

    // En euros solo si TODO el cobro fue en euros. Con que una parte lo fuera,
    // la factura entera pasaba a «€55.00» aunque los precios son en dólares.
    const mpFactura = (data.metodos_pago && typeof data.metodos_pago === 'object') ? data.metodos_pago : {};
    const conDineroMp = Object.entries(mpFactura).filter(([, v]) => Number(v) > 0);
    const todoEnEuros = conDineroMp.length > 0 && conDineroMp.every(([k]) => k === 'euros');
    const isEuro = data.currency === 'eur' || todoEnEuros || /euro/i.test(data.notas || '');
    const sym = isEuro ? '€' : '$';
    const primaryLabel = isEuro ? 'TOTAL EUR' : 'TOTAL USD';
    const totalBoxLabel = isEuro ? 'MONTO TOTAL EUR' : 'MONTO TOTAL USD';

    const tableHead = isDual 
      ? [['DESCRIPCIÓN DEL SERVICIO', 'CANT', 'TOTAL BS', primaryLabel]]
      : [['DESCRIPCIÓN DEL SERVICIO', 'CANT', primaryLabel]];

    const tableRows = data.items.map((item: any) => isDual 
      ? [
          item.descripcion.toUpperCase(),
          item.cantidad,
          `${(Number(item.total) * bcvRateUsed).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`,
          `${sym}${Number(item.total).toFixed(2)}`
        ]
      : [
          item.descripcion.toUpperCase(),
          item.cantidad,
          `${sym}${Number(item.total).toFixed(2)}`
        ]
    );

    autoTable(doc, {
      startY: 62,
      head: tableHead,
      body: tableRows,
      theme: 'plain',
      headStyles: { 
        fillColor: [255, 255, 255], 
        textColor: black, 
        fontSize: 8, 
        fontStyle: 'bold',
        lineColor: black,
        lineWidth: { bottom: 1.2 }
      },
      styles: { 
        fontSize: 8, 
        textColor: [20, 20, 20],
        cellPadding: 3,
        font: 'helvetica'
      },
      // El ancho útil es de 124,5 mm (del margen al borde derecho). Los anchos
      // fijos suman 68 y la descripción se queda con el resto.
      //
      // «CANT» salía partido en dos líneas («CA / NT») porque su columna medía
      // 10 mm, y un importe en bolívares como «126.976,97 Bs.» tampoco cabía en
      // los 20 mm de la suya. En una factura que se entrega al cliente, un
      // encabezado roto en dos parece un error de impresión.
      columnStyles: isDual ? {
        0: { cellWidth: 'auto' },
        // 16 mm: con 13 el «CANT» en negrita seguía partiéndose en «CAN / T».
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 29, halign: 'right', fontStyle: 'bold', textColor: grayDark },
        3: { cellWidth: 23, halign: 'right', fontStyle: 'bold', textColor: black }
      } : {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: black }
      },
      margin: { left: margin, right: (doc.internal.pageSize.width - rightAlign) }
    });

    // ── Totals Section ──────────────────────────────────────────
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    
    // Total Box
    const boxWidth = 75;
    const boxX = rightAlign - boxWidth;
    const boxY = finalY + 12;
    const boxHeight = 25;

    // Subtotal and IVA
    doc.setTextColor(...grayLight);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SUBTOTAL GENERAL', boxX, finalY + 5);
    doc.setTextColor(...grayDark);
    doc.text(`${sym}${Number(data.total / (data.iva_aplicado ? 1.16 : 1)).toFixed(2)}`, rightAlign, finalY + 5, { align: 'right' });

    if (data.iva_aplicado) {
      doc.setTextColor(...grayLight);
      doc.text('IVA (16%)', boxX, finalY + 10);
      doc.setTextColor(...orange);
      doc.text(`+${sym}${Number(data.total - (data.total / 1.16)).toFixed(2)}`, rightAlign, finalY + 10, { align: 'right' });
    }

    // BLACK BOX
    doc.setFillColor(...black);
    doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');

    // Total USD
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.text(totalBoxLabel, boxX + 4, boxY + 8);
    
    doc.setTextColor(...orange);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bolditalic');
    doc.text(`${sym}${Number(data.total).toFixed(2)}`, rightAlign - 4, boxY + 9, { align: 'right' });

    // Total VES
    if (isDual) {
      doc.setDrawColor(255, 255, 255, 0.15);
      doc.line(boxX + 4, boxY + 13, rightAlign - 4, boxY + 13);

      doc.setTextColor(180, 180, 180);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('TOTAL EN BOLÍVARES (BS)', boxX + 4, boxY + 20);
      
      doc.setTextColor(...white);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const vesTotal = data.total_ves || (data.total * bcvRateUsed);
      doc.text(`${vesTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`, rightAlign - 4, boxY + 20, { align: 'right' });
    }

    // ── Bottom Info ─────────────────────────────────────────────
    let infoY = boxY + boxHeight + 10;
    
    if (isDual && (data.tasa_bcv || data.tasa_cambio)) {
      doc.setTextColor(...grayLight);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(`TASA DE CAMBIO BCV: ${data.tasa_bcv || data.tasa_cambio} Bs/$`, margin, infoY);
      infoY += 5;
    }

    // ── Forma de pago ─────────────────────────────────────────
    // Cuál, cuánto y en qué moneda, línea por línea. Un pago mixto se lee
    // entero: «Pago Móvil · Banesco Bs. 8.556,63 (≈ $10,00)» y debajo el resto.
    {
      const pagos: LineaPago[] = Array.isArray(data.pagos) ? data.pagos : [];
      const visibles = pagos.slice(0, 5);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...grayLight);
      doc.text('FORMA DE PAGO:', margin, infoY);
      const anchoEtiqueta = doc.getTextWidth('FORMA DE PAGO:') + 1.5;
      doc.setTextColor(...(pagos.length ? black : orange));
      doc.text(tipoDePago(pagos).toUpperCase(), margin + anchoEtiqueta, infoY);
      // El total equivalente solo si todas las líneas se pueden pasar a dólares:
      // sin la tasa del euro saldría un total menor que el cobrado.
      if (pagos.length > 1 && pagos.every(l => l.usd > 0)) {
        doc.setTextColor(...grayDark);
        doc.text(`TOTAL EQUIV. $${totalUSD(pagos).toFixed(2)}`, rightAlign, infoY, { align: 'right' });
      }
      infoY += 4.2;
      doc.setFont('helvetica', 'normal');
      for (const l of visibles) {
        doc.setTextColor(...grayDark);
        doc.text(`• ${nombreDeLinea(l)}`.toUpperCase(), margin + 2, infoY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...black);
        // Mismo formato que el resto de la factura: «$150.00» y «126.976,97 Bs.».
        const monto = l.moneda === 'USD'
          ? `$${l.monto.toFixed(2)}`
          : l.moneda === 'Bs'
            ? `${l.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`
            : montoConMoneda(l.monto, l.moneda);
        const equiv = l.moneda !== 'USD' && l.usd > 0 ? `  (equiv. $${l.usd.toFixed(2)})` : '';
        doc.text(`${monto}${equiv}`, rightAlign, infoY, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        infoY += 3.8;
      }
      if (pagos.length > visibles.length) {
        doc.setTextColor(...grayLight);
        doc.text(`+ ${pagos.length - visibles.length} método(s) más`, margin + 2, infoY);
        infoY += 3.8;
      }
      infoY += 1.5;
    }

    // Abono / Pending info — con historial completo de abonos
    if (data.estado === 'pendiente' || data.es_abono || (data.abonos && data.abonos.length > 0)) {
      if (data.notas || data.tiene_abono) infoY += 2;

      const abonosList = data.abonos || [];
      const totalAbonado = data.total_abonado ?? data.abono ?? (abonosList.reduce((s: number, a: any) => s + Number(a.monto || 0), 0));
      const saldo = data.saldo_pendiente ?? Math.max(0, Number(data.total) - totalAbonado);
      const pendiente = data.estado === 'pendiente' && saldo > 0.001;

      // Altura dinámica según cantidad de abonos
      const baseH = 11;
      const rowH = 4;
      const boxH = baseH + (abonosList.length > 0 ? abonosList.length * rowH + 4 : 0);

      doc.setFillColor(pendiente ? 245 : 34, pendiente ? 158 : 197, pendiente ? 11 : 94, 0.12);
      doc.roundedRect(margin, infoY, rightAlign - margin, boxH, 2, 2, 'F');

      doc.setTextColor(pendiente ? 245 : 22, pendiente ? 158 : 163, pendiente ? 11 : 74);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(pendiente ? 'PENDIENTE POR PAGAR' : 'VENTA SALDADA', margin + 3, infoY + 6);

      // Resumen lado derecho
      doc.setTextColor(...grayDark);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      const resumen = `Abonado: $${Number(totalAbonado).toFixed(2)}  |  Restante: $${Number(saldo).toFixed(2)}`;
      doc.text(resumen, rightAlign - 3, infoY + 6, { align: 'right' });

      // Detalle de cada abono
      if (abonosList.length > 0) {
        let ay = infoY + 11;
        doc.setFontSize(6.5);
        doc.setTextColor(...grayLight);
        doc.text('HISTORIAL DE ABONOS:', margin + 3, ay);
        ay += 4;
        doc.setTextColor(...grayDark);
        abonosList.forEach((a: any, i: number) => {
          const fecha = fechaVE(a.created_at);
          const metodo = a.metodo_pago ? a.metodo_pago.replace(/_/g, ' ') : '';
          const linea = `Abono ${i + 1}: $${Number(a.monto).toFixed(2)}${fecha ? `  ·  ${fecha}` : ''}${metodo ? `  ·  ${metodo}` : ''}`;
          doc.text(linea, margin + 5, ay);
          if (a.saldo_despues != null) {
            doc.text(`Saldo: $${Number(a.saldo_despues).toFixed(2)}`, rightAlign - 3, ay, { align: 'right' });
          }
          ay += rowH;
        });
      }

      infoY += boxH + 2;
    }

    // Notes if exists
    if (data.notas) {
      doc.setTextColor(...grayLight);
      doc.setFontSize(7);
      doc.text('NOTAS:', margin, infoY);
      doc.setTextColor(...grayDark);
      doc.setFontSize(7);
      const splitNotes = doc.splitTextToSize(data.notas.toUpperCase(), 100);
      doc.text(splitNotes, margin + 12, infoY);
    }

    doc.setTextColor(...grayDark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bolditalic');
    doc.text('¡GRACIAS POR CONFIAR EN LYCOS TEAM!', startX + 74.25, 194, { align: 'center' });

    doc.setTextColor(...grayLight);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('San Antonio de los Altos, Edo. Miranda - Lycos Team CRM 2026', startX + 74.25, 202, { align: 'center' });
  };

  // «Diferente» son dos facturas distintas en la misma hoja: se dibuja igual
  // que la dual. Caía en la rama de una sola y la segunda no salía.
  if (options.mode === 'dual' || options.mode === 'diferente') {
    // If we have only one invoice, draw it twice
    const data1 = dataList[0];
    const data2 = dataList.length > 1 ? dataList[1] : dataList[0];

    drawInvoice(data1, 0);

    // Draw Vertical Cutting Line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(148.5, 10, 148.5, 200);
    doc.setLineDashPattern([], 0);

    drawInvoice(data2, 148.5);
  } else {
    // Single mode
    const startX = options.side === 'right' ? 148.5 : 0;
    
    // Draw Vertical Cutting Line (as reference)
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.05);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(148.5, 10, 148.5, 200);
    doc.setLineDashPattern([], 0);

    drawInvoice(dataList[0], startX);
  }

  // ── Páginas de Comprobante de Pago ──────────────────────────────
  // Adjunta la imagen/referencia del pago para que se imprima junto con la factura.
  const seen = new Set<string>();
  for (const d of dataList) {
    if (!d) continue;
    const key = `${d.id || d.correlativo || ''}|${d.comprobante_url || ''}|${d.comprobante_referencia || ''}`;
    if ((d.comprobante_url || d.comprobante_referencia) && !seen.has(key)) {
      seen.add(key);
      await drawComprobantePage(doc, d);
    }
  }

  // Save
  // El archivo se llama como el documento: con correlativo es una FACTURA y sin
  // el una NOTA DE ENTREGA, que es lo que ya dice impreso arriba a la derecha.
  // Antes todo salia como «Nota_…» y una factura fiscal no se distinguia del
  // resto en la carpeta de descargas.
  const cliente0 = dataList[0].cliente?.replace(/\s+/g, '_') || 'Cliente';
  const tipo0 = dataList[0].correlativo ? 'Factura' : 'Nota';
  const fileName = dataList.length > 1
    ? `${tipo0}_Lycos_${dataList[0].id?.slice(0, 4)}_${dataList[1].id?.slice(0, 4)}.pdf`
    : `${tipo0}_Lycos_${dataList[0].correlativo || cliente0}.pdf`;
    
  doc.save(fileName);
};

/**
 * El comprobante de un gasto.
 *
 * Imprimía «LYCOS TEAM», la tabla y el total: sin fecha, sin a quién se le
 * pagó y sin de dónde salió el dinero, que es justo lo que se busca en un
 * comprobante de pago. Ahora lleva todo eso, y si el gasto está fiado o
 * abonado a medias lo dice en vez de rotularlo «TOTAL PAGADO».
 */
export interface EgresoPDF {
  id?: string;
  fecha: string;
  categoria?: string;
  proveedor?: string | null;
  placa?: string | null;
  vehiculo_info?: string | null;
  cliente_nombre?: string | null;
  items: Array<{ descripcion: string; cantidad: number; precio_unitario: number; total: number }>;
  total: number;
  notas?: string | null;
  enlace?: string | null;
  estado_pago?: string | null;
  monto_pagado?: number | null;
  fecha_vencimiento?: string | null;
  pagos?: LineaPago[];
  /** Compatibilidad con quien aún pasa `cliente` como destinatario. */
  cliente?: string;
}

export const generateEgresoPDF = (data: EgresoPDF) => {
  const doc = new jsPDF() as any;

  const slate900 = [15, 23, 42] as [number, number, number];
  const slate600 = [71, 85, 105] as [number, number, number];
  const slate400 = [148, 163, 184] as [number, number, number];
  const slate200 = [226, 232, 240] as [number, number, number];
  const rojo = [220, 38, 38] as [number, number, number];
  const verde = [21, 128, 61] as [number, number, number];
  const ambar = [194, 65, 12] as [number, number, number];
  const izq = 20;
  const der = 190;

  // Cabecera
  doc.setTextColor(...slate900);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bolditalic');
  doc.text('LYCOS TEAM', izq, 28);
  doc.setTextColor(...slate400);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROBANTE DE EGRESO / PAGO', izq, 34);

  doc.setFontSize(7);
  doc.text('Nº', der, 22, { align: 'right' });
  doc.setTextColor(...slate900);
  doc.setFontSize(12);
  doc.text((data.id || 'EGRESO').slice(0, 8).toUpperCase(), der, 28, { align: 'right' });
  doc.setTextColor(...slate600);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(fechaVE(data.fecha), der, 34, { align: 'right' });

  doc.setDrawColor(...slate200);
  doc.line(izq, 40, der, 40);

  // A quién, por qué y para qué carro
  const dato = (etiqueta: string, valor: string, x: number, y: number, alinear: 'left' | 'right' = 'left') => {
    doc.setTextColor(...slate400);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(etiqueta, x, y, { align: alinear });
    doc.setTextColor(...slate900);
    doc.setFontSize(10.5);
    doc.text(valor, x, y + 5.5, { align: alinear });
  };
  dato('PAGADO A', String(data.proveedor || data.cliente || 'Sin indicar').toUpperCase().slice(0, 40), izq, 49);
  dato('CATEGORÍA', String(data.categoria || 'Otro').toUpperCase(), der, 49, 'right');
  if (data.placa) {
    dato('VEHÍCULO',
      `${data.placa}${data.vehiculo_info ? ` · ${data.vehiculo_info}` : ''}`.toUpperCase().slice(0, 48), izq, 63);
    if (data.cliente_nombre) dato('CLIENTE', data.cliente_nombre.toUpperCase().slice(0, 32), der, 63, 'right');
  }

  autoTable(doc, {
    startY: data.placa ? 76 : 64,
    head: [['#', 'Concepto', 'Cant.', 'Precio', 'Total']],
    body: data.items.map((item, i) => [
      i + 1,
      String(item.descripcion || '').toUpperCase(),
      item.cantidad,
      `$${Number(item.precio_unitario).toFixed(2)}`,
      `$${Number(item.total).toFixed(2)}`,
    ]),
    theme: 'plain',
    headStyles: {
      fillColor: [255, 255, 255], textColor: slate900, fontSize: 8.5, fontStyle: 'bold',
      lineColor: slate900, lineWidth: { bottom: 0.8 },
    },
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: slate600 },
    columnStyles: {
      0: { cellWidth: 10 }, 2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: slate900 },
    },
    margin: { left: izq, right: 210 - der },
  });

  let y = ((doc as any).lastAutoTable.finalY || 110) + 10;

  // Totales: lo que costó, lo que se pagó y lo que se debe
  const total = Number(data.total) || 0;
  const estado = data.estado_pago || 'pagado';
  const pagado = estado === 'pagado' ? total : estado === 'parcial' ? Number(data.monto_pagado) || 0 : 0;
  const debe = Math.max(0, total - pagado);
  const fila = (etiqueta: string, valor: string, color: [number, number, number], grande = false) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(grande ? 11 : 9);
    doc.setTextColor(...slate600);
    doc.text(etiqueta, 130, y);
    doc.setTextColor(...color);
    doc.text(valor, der, y, { align: 'right' });
    y += grande ? 7 : 5.5;
  };
  fila('TOTAL DEL GASTO', `$${total.toFixed(2)}`, rojo, true);
  if (debe > 0.009) {
    fila('PAGADO', `$${pagado.toFixed(2)}`, verde);
    fila('SE DEBE', `$${debe.toFixed(2)}`, ambar);
    if (data.fecha_vencimiento) fila('VENCE', fechaVE(data.fecha_vencimiento), ambar);
  }

  // De qué cuenta salió
  y += 4;
  const pagos = Array.isArray(data.pagos) ? data.pagos : [];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...slate400);
  doc.text('PAGADO DESDE:', izq, y);
  doc.setTextColor(...(pagos.length ? slate900 : ambar));
  doc.text(
    pagos.length ? tipoDePago(pagos).toUpperCase() : (pagado > 0 ? 'NO CONSTA LA CUENTA' : 'AÚN NO SE HA PAGADO'),
    izq + doc.getTextWidth('PAGADO DESDE:') + 2, y,
  );
  y += 5.5;
  for (const l of pagos) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...slate600);
    doc.text(`• ${nombreDeLinea(l)}`.toUpperCase(), izq + 2, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...slate900);
    const monto = l.moneda === 'USD'
      ? `$${l.monto.toFixed(2)}`
      : l.moneda === 'Bs'
        ? `${l.monto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`
        : montoConMoneda(l.monto, l.moneda);
    const equiv = l.moneda !== 'USD' && l.usd > 0 ? `  (equiv. $${l.usd.toFixed(2)})` : '';
    doc.text(`${monto}${equiv}`, der, y, { align: 'right' });
    y += 5;
  }

  if (data.enlace || data.notas) {
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...slate600);
    if (data.enlace) { doc.text(`Referencia: ${data.enlace}`, izq, y); y += 5; }
    if (data.notas) doc.text(doc.splitTextToSize(`Nota: ${data.notas}`, der - izq), izq, y);
  }

  doc.setFontSize(6.5);
  doc.setTextColor(...slate400);
  doc.text('Lycos Team · San Antonio de los Altos · Documento interno', 105, 287, { align: 'center' });

  doc.save(`Egreso_Lycos_${data.fecha}_${data.id?.slice(0, 4) || 'E'}.pdf`);
};
