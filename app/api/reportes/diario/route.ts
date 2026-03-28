import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

// Convert 1-based column index to Excel letter (e.g. 1 -> A, 26 -> Z, 27 -> AA)
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url || !key) {
      return NextResponse.json({ error: 'Faltan credenciales de base de datos' }, { status: 500 });
    }
    const supabase = createClient(url, key);

    // Obtener servicios de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const { data: servicios, error } = await supabase
      .from('servicios')
      .select(`
        id, created_at, tipo, costo_final, descripcion, estado,
        vehiculo:vehiculos (
          marca, modelo, placa,
          cliente:clientes (nombre, apellido)
        )
      `)
      .gte('created_at', todayStr)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error obteniendo servicios para el reporte:', error);
      return NextResponse.json({ error: 'Error al consultar datos' }, { status: 500 });
    }

    // ──────────────────────────────────────────────────────────────
    // CREATE WORKBOOK
    // ──────────────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Lycos Team';
    workbook.lastModifiedBy = 'Lycos Team Sistema';
    workbook.created = new Date();
    workbook.modified = new Date();

    const ws = workbook.addWorksheet('Reporte Diario', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ state: 'frozen', ySplit: 7 }],
    });

    const fechaHoy = new Date().toLocaleDateString('es-VE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // Color palette
    const COLOR = {
      primary: 'FF1a1a2e',     // dark navy (header bg)
      accent:  'FFe94560',     // vivid red-pink (header text, totals)
      gold:    'FFf5a623',     // gold (section titles)
      lightBg: 'FFf8f9fa',    // light gray rows
      altRow:  'FFe8eaf6',    // subtle purple-tinted alternate rows
      white:   'FFFFFFFF',
      black:   'FF000000',
      border:  'FFbdbdbd',
      grayHdr: 'FF37474f',    // dark gray sub-headers
    };

    // ── COLUMN WIDTHS ─────────────────────────────────────────────
    // Nº | FECHA | NOMBRE | CARRO | SILENCIADOR | CAUCHERA | ALINEACION | (gap) | P.BANCAMIGA | P.BANESCO | CASHEA | EFECTIVO | ZELLE | PM BANESCO | BINANCE | WALLY | PM EXTERIOR | EFECT EUR | BANCO
    ws.columns = [
      { key: 'num',         width: 5 },
      { key: 'fecha',       width: 13 },
      { key: 'nombre',      width: 26 },
      { key: 'carro',       width: 32 },
      { key: 'silenciador', width: 14 },
      { key: 'cauchera',    width: 12 },
      { key: 'alineacion',  width: 12 },
      { key: 'gap',         width: 2.5 },
      { key: 'bancamiga',   width: 16 },
      { key: 'banesco',     width: 16 },
      { key: 'cashea',      width: 12 },
      { key: 'efectivo',    width: 13 },
      { key: 'zelle',       width: 12 },
      { key: 'pmbanesco',   width: 18 },
      { key: 'binance',     width: 12 },
      { key: 'wally',       width: 10 },
      { key: 'pmexterior',  width: 18 },
      { key: 'efecteur',    width: 14 },
      { key: 'banco',       width: 10 },
    ];

    // ─────────────────────────────────────────────────────────────
    // ROW 1 — LOGO / COMPANY TITLE
    // ─────────────────────────────────────────────────────────────
    const row1 = ws.getRow(1);
    row1.height = 40;
    ws.mergeCells('A1:G1');
    const logoCell = ws.getCell('A1');
    logoCell.value = '⚙  LYCOS TEAM';
    logoCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: COLOR.white } };
    logoCell.alignment = { horizontal: 'center', vertical: 'middle' };
    logoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

    ws.mergeCells('H1:S1');
    const subtitleCell = ws.getCell('H1');
    subtitleCell.value = 'TALLER AUTOMOTRIZ PROFESIONAL — San Antonio de los Altos, Miranda, Venezuela';
    subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFbbdefb' } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

    // ─────────────────────────────────────────────────────────────
    // ROW 2 — REPORT TITLE
    // ─────────────────────────────────────────────────────────────
    const row2 = ws.getRow(2);
    row2.height = 30;
    ws.mergeCells('A2:S2');
    const titleCell = ws.getCell('A2');
    titleCell.value = 'REPORTE CIERRE DEL DÍA';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLOR.accent } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

    // ─────────────────────────────────────────────────────────────
    // ROW 3 — DATE + summary metadata
    // ─────────────────────────────────────────────────────────────
    const row3 = ws.getRow(3);
    row3.height = 22;
    ws.mergeCells('A3:D3');
    const dateCell = ws.getCell('A3');
    dateCell.value = `📅  ${fechaHoy}`;
    dateCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF37474f' } };
    dateCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe3f2fd' } };

    ws.mergeCells('E3:G3');
    const totalServiciosCell = ws.getCell('E3');
    totalServiciosCell.value = `Servicios del día: ${(servicios || []).length}`;
    totalServiciosCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.grayHdr } };
    totalServiciosCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalServiciosCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe3f2fd' } };

    ws.mergeCells('H3:S3');
    const instrCell = ws.getCell('H3');
    instrCell.value = 'Complete los campos de pago según el método utilizado en cada operación';
    instrCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF90a4ae' } };
    instrCell.alignment = { horizontal: 'center', vertical: 'middle' };
    instrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe3f2fd' } };

    // ─────────────────────────────────────────────────────────────
    // ROW 4 — Group Labels (SERVICIO section | PAGO section)
    // ─────────────────────────────────────────────────────────────
    const row4 = ws.getRow(4);
    row4.height = 24;
    ws.mergeCells('A4:G4');
    const grpServCell = ws.getCell('A4');
    grpServCell.value = '▸  INFORMACIÓN DEL SERVICIO';
    grpServCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
    grpServCell.alignment = { horizontal: 'center', vertical: 'middle' };
    grpServCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.grayHdr } };

    ws.mergeCells('H4:H4');
    ws.getCell('H4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

    ws.mergeCells('I4:S4');
    const grpPagoCell = ws.getCell('I4');
    grpPagoCell.value = '▸  MÉTODOS DE PAGO';
    grpPagoCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
    grpPagoCell.alignment = { horizontal: 'center', vertical: 'middle' };
    grpPagoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0d47a1' } };

    // ─────────────────────────────────────────────────────────────
    // ROW 5 — Sub-section labels
    // ─────────────────────────────────────────────────────────────
    const row5 = ws.getRow(5);
    row5.height = 20;

    // Service sub-labels (span 2 each)
    const svc5headers: [string, string][] = [
      ['A5:B5', 'General'],
      ['C5:D5', 'Cliente'],
      ['E5:G5', 'Tipo de Servicio'],
    ];
    svc5headers.forEach(([range, text]) => {
      ws.mergeCells(range);
      const c = ws.getCell(range.split(':')[0]);
      c.value = text;
      c.font = { name: 'Calibri', size: 9, color: { argb: COLOR.white } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF546e7a' } };
    });

    ws.getCell('H5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

    const pago5headers: [string, string][] = [
      ['I5:J5', 'Punto'],
      ['K5:K5', 'Cashea'],
      ['L5:M5', 'Divisas'],
      ['N5:N5', 'Móvil'],
      ['O5:P5', 'Cripto/Wallet'],
      ['Q5:R5', 'Internacional'],
      ['S5:S5', 'Banco'],
    ];
    pago5headers.forEach(([range, text]) => {
      ws.mergeCells(range);
      const c = ws.getCell(range.split(':')[0]);
      c.value = text;
      c.font = { name: 'Calibri', size: 9, color: { argb: 'FFe3f2fd' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565c0' } };
    });

    // ─────────────────────────────────────────────────────────────
    // ROW 6 — Column Headers
    // ─────────────────────────────────────────────────────────────
    const row6 = ws.getRow(6);
    row6.height = 34;

    const hdrs = [
      'Nº', 'FECHA', 'NOMBRE', 'CARRO', 'SILENCIADOR', 'CAUCHERA', 'ALINEACIÓN',
      '', // gap
      'P. BANCAMIGA', 'P. BANESCO', 'CASHEA', 'EFECTIVO', 'ZELLE', 'PM BANESCO', 'BINANCE', 'WALLY', 'PM EXTERIOR', 'EF. EUR', 'BANCO'
    ];

    hdrs.forEach((label, ci) => {
      const cell = row6.getCell(ci + 1);
      cell.value = label;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.white } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: ci === 7 ? COLOR.primary : ci <= 6 ? COLOR.grayHdr : 'FF1976d2' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF90caf9' } },
        bottom: { style: 'medium', color: { argb: 'FFe94560' } },
        left: { style: 'thin', color: { argb: '88000000' } },
        right: { style: 'thin', color: { argb: '88000000' } },
      };
    });

    // ─────────────────────────────────────────────────────────────
    // ROW 7 — Separator / Decorative
    // ─────────────────────────────────────────────────────────────
    const row7 = ws.getRow(7);
    row7.height = 4;
    for (let c = 1; c <= 19; c++) {
      const cell = row7.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
    }

    // ─────────────────────────────────────────────────────────────
    // DATA ROWS starting at row 8
    // ─────────────────────────────────────────────────────────────
    const dataStartRow = 8;
    const rows = servicios || [];

    rows.forEach((srv: Record<string, unknown>, idx: number) => {
      const rowIdx = dataStartRow + idx;
      const dataRow = ws.getRow(rowIdx);
      dataRow.height = 20;

      const isAlt = idx % 2 === 1;
      const rowBg = isAlt ? COLOR.altRow : COLOR.lightBg;

      const fecha = new Date(srv.created_at as string).toLocaleDateString('es-VE');

      // Safely extract nested vehicle/client data
      const rawV = srv.vehiculo;
      const v = Array.isArray(rawV) ? rawV[0] : (rawV as Record<string, unknown> | null);
      let clienteNombre = '';
      let carroNombre = '';
      if (v) {
        const rawC = v.cliente;
        const c = Array.isArray(rawC) ? rawC[0] : (rawC as Record<string, unknown> | null);
        if (c) clienteNombre = `${c.nombre || ''} ${c.apellido || ''}`.trim();
        carroNombre = `${v.marca || ''} ${v.modelo || ''} ${v.placa ? `(${v.placa})` : ''}`.trim();
      }

      // Assign cost to relevant service column
      let silenciador: string | number = '';
      let cauchera: string | number = '';
      let alineacion: string | number = '';
      const tipo = srv.tipo as string;
      const costo = srv.costo_final ? Number(srv.costo_final) : '';

      if (tipo === 'mecanica') cauchera = costo;
      else if (tipo === 'electronica' || tipo === 'diagnostico') alineacion = costo;
      else silenciador = costo; // silenciador, otro, etc.

      const values = [
        idx + 1, fecha, clienteNombre, carroNombre,
        silenciador, cauchera, alineacion,
        '', // gap
        '', '', '', '', '', '', '', '', '', '', '', // payment methods (blank for manual fill)
      ];

      values.forEach((val, ci) => {
        const cell = dataRow.getCell(ci + 1);
        cell.value = val === '' ? null : val;

        cell.font = { name: 'Calibri', size: 10, color: { argb: COLOR.black } };
        cell.alignment = {
          horizontal: ci === 0 ? 'center' : ci <= 3 ? 'left' : 'center',
          vertical: 'middle',
          indent: ci <= 3 && ci > 0 ? 1 : 0,
        };
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: ci === 7 ? COLOR.primary : rowBg },
        };
        cell.border = {
          top: { style: 'hair', color: { argb: COLOR.border } },
          bottom: { style: 'hair', color: { argb: COLOR.border } },
          left: { style: 'thin', color: { argb: ci === 7 ? COLOR.primary : COLOR.border } },
          right: { style: 'thin', color: { argb: ci === 7 ? COLOR.primary : COLOR.border } },
        };

        // Shade payment columns lightly
        if (ci >= 8) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? 'FFe8eaf6' : 'FFf3f4fe' } };
        }
      });
    });

    // ─────────────────────────────────────────────────────────────
    // TOTALS ROW (2 rows after last data)
    // ─────────────────────────────────────────────────────────────
    const totalsRow = dataStartRow + rows.length;
    // Spacer
    const spacerRow = ws.getRow(totalsRow);
    spacerRow.height = 6;
    for (let c = 1; c <= 19; c++) {
      spacerRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
    }

    const sumRow = ws.getRow(totalsRow + 1);
    sumRow.height = 28;
    ws.mergeCells(`A${totalsRow + 1}:D${totalsRow + 1}`);
    const totalLabelCell = ws.getCell(`A${totalsRow + 1}`);
    totalLabelCell.value = 'TOTALES DEL DÍA';
    totalLabelCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR.white } };
    totalLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.grayHdr } };

    // Sum formula for monetary columns (E:G) and (I:S)
    const sumCols = [5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    sumCols.forEach(ci => {
      const cell = sumRow.getCell(ci);
      if (rows.length > 0) {
        const cl = colLetter(ci);
        cell.value = { formula: `SUM(${cl}${dataStartRow}:${cl}${dataStartRow + rows.length - 1})` };
      } else {
        cell.value = 0;
      }
      cell.numFmt = '"$"#,##0.00';
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.accent } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263238' } };
      cell.border = {
        top: { style: 'medium', color: { argb: COLOR.accent } },
        bottom: { style: 'medium', color: { argb: COLOR.accent } },
        left: { style: 'thin', color: { argb: '88ffffff' } },
        right: { style: 'thin', color: { argb: '88ffffff' } },
      };
    });

    // Gap col in totals
    sumRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

    // ─────────────────────────────────────────────────────────────
    // SECTION ROWS (COLA CROMADA, INVENTARIO, etc.) — below totals
    // ─────────────────────────────────────────────────────────────
    const sections = [
      { label: 'COLA CROMADA', cols: ['EFECTIVO', 'BANCAMIGA', 'BANESCO', 'CASHEA', 'BINANCE', 'WALLY', 'PM EXTERIOR', 'BANCO'] },
      { label: 'INVENTARIO / REPUESTOS', cols: ['DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'TOTAL', 'MÉTODO DE PAGO', 'BANCO'] },
    ];

    let nextRow = totalsRow + 3;
    sections.forEach(({ label, cols }) => {
      // Section header
      const secHdr = ws.getRow(nextRow);
      secHdr.height = 24;
      ws.mergeCells(`A${nextRow}:S${nextRow}`);
      const secHdrCell = ws.getCell(`A${nextRow}`);
      secHdrCell.value = `◆  ${label}`;
      secHdrCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR.white } };
      secHdrCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
      secHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gold.replace('FF', 'FF5') } };
      secHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf57c00' } };
      nextRow++;

      // Sub-headers
      const subHdrRow = ws.getRow(nextRow);
      subHdrRow.height = 22;
      cols.forEach((ch, ci) => {
        const cell = subHdrRow.getCell(ci + 1);
        cell.value = ch;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFef6c00' } };
        cell.border = { bottom: { style: 'medium', color: { argb: COLOR.gold } } };
      });
      nextRow++;

      // 5 blank input rows
      for (let br = 0; br < 5; br++) {
        const blankRow = ws.getRow(nextRow);
        blankRow.height = 18;
        for (let ci = 1; ci <= cols.length; ci++) {
          const c = blankRow.getCell(ci);
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: br % 2 ? 'FFfff8e1' : COLOR.white } };
          c.border = {
            top: { style: 'hair', color: { argb: COLOR.border } },
            bottom: { style: 'hair', color: { argb: COLOR.border } },
            left: { style: 'thin', color: { argb: COLOR.border } },
            right: { style: 'thin', color: { argb: COLOR.border } },
          };
        }
        nextRow++;
      }
      nextRow++; // gap
    });

    // ─────────────────────────────────────────────────────────────
    // FOOTER
    // ─────────────────────────────────────────────────────────────
    const footerRow = ws.getRow(nextRow + 1);
    footerRow.height = 20;
    ws.mergeCells(`A${nextRow + 1}:S${nextRow + 1}`);
    const footerCell = ws.getCell(`A${nextRow + 1}`);
    footerCell.value = `Generado por el Sistema Lycos Team · ${new Date().toLocaleString('es-VE')} · Documento confidencial de uso interno`;
    footerCell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FFbdbdbd' } };
    footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    footerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

    // ─────────────────────────────────────────────────────────────
    // OUTPUT
    // ─────────────────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="LYCOS_REPORTE_${new Date().toISOString().split('T')[0]}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });

  } catch (err: unknown) {
    console.error('API Reportes Error:', err);
    return NextResponse.json({ error: 'Hubo un error al generar el reporte' }, { status: 500 });
  }
}

