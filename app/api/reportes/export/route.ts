import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

const CITAS_COLOR = {
  primary: 'FF0f172a',    // slate-900
  accent:  'FF0ea5e9',    // sky-500
  lightBg: 'FFf8fafc',    // slate-50
  white:   'FFFFFFFF',
  black:   'FF0f172a',
  border:  'FFcbd5e1',    // slate-300
  grayHdr: 'FF334155',    // slate-700
};

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = searchParams.get('to') || new Date().toISOString().split('T')[0];
  const tipo = searchParams.get('tipo') || 'ventas';

  try {
    const db = createClient(supabaseUrl, supabaseKey);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Lycos Team';
    workbook.lastModifiedBy = 'Lycos Team Sistema';
    workbook.created = new Date();
    workbook.modified = new Date();

    if (tipo === 'citas') {
      const { data: citas } = await db
        .from('citas')
        .select(`
          *,
          clientes ( nombre, apellido, telefono ),
          vehiculos ( marca, modelo, placa )
        `)
        .gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: true })
        .order('hora', { ascending: true });

      const data = citas || [];
      const ws = workbook.addWorksheet('Reporte de Citas', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
        views: [{ state: 'frozen', ySplit: 5 }],
      });

      const numCols = 9;
      const hdrs = [ 'Nº', 'FECHA', 'HORA', 'CLIENTE', 'TELÉFONO', 'VEHÍCULO (MARCA / PLACA)', 'SERVICIO', 'ESTADO', 'DESCRIPCIÓN / MOTIVO' ];
      ws.columns = [
        { width: 5 }, { width: 13 }, { width: 10 }, { width: 25 }, { width: 15 },
        { width: 25 }, { width: 15 }, { width: 15 }, { width: 45 }
      ];

      // ─────────────────────────────────────────────────────────────
      // ROW 1 — LOGO / COMPANY TITLE
      // ─────────────────────────────────────────────────────────────
      const row1 = ws.getRow(1);
      row1.height = 40;
      ws.mergeCells('A1:B1');
      const logoCell = ws.getCell('A1');
      logoCell.value = '⚙  LYCOS TEAM';
      logoCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: CITAS_COLOR.white } };
      logoCell.alignment = { horizontal: 'center', vertical: 'middle' };
      logoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CITAS_COLOR.primary } };

      ws.mergeCells(`C1:${colLetter(numCols)}1`);
      const subtitleCell = ws.getCell('C1');
      subtitleCell.value = 'TALLER AUTOMOTRIZ PROFESIONAL — AGENDA Y CITAS';
      subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFbae6fd' } };
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CITAS_COLOR.primary } };

      // ─────────────────────────────────────────────────────────────
      // ROW 2 — REPORT TITLE
      // ─────────────────────────────────────────────────────────────
      const row2 = ws.getRow(2);
      row2.height = 30;
      ws.mergeCells(`A2:${colLetter(numCols)}2`);
      const titleCell = ws.getCell('A2');
      titleCell.value = `REPORTE DE CITAS Y TURNOS (${from} — ${to})`;
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: CITAS_COLOR.accent } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CITAS_COLOR.primary } };

      // ─────────────────────────────────────────────────────────────
      // ROW 3 — GROUP HEADERS
      // ─────────────────────────────────────────────────────────────
      const row3 = ws.getRow(3);
      row3.height = 24;

      ws.mergeCells('A3:C3');
      const gGeneral = ws.getCell('A3');
      gGeneral.value = '▸  TIEMPO';
      gGeneral.font = { name: 'Calibri', size: 11, bold: true, color: { argb: CITAS_COLOR.white } };
      gGeneral.alignment = { horizontal: 'center', vertical: 'middle' };
      gGeneral.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284c7' } };

      ws.mergeCells('D3:F3');
      const gClient = ws.getCell('D3');
      gClient.value = '▸  CLIENTE Y VEHÍCULO';
      gClient.font = { name: 'Calibri', size: 11, bold: true, color: { argb: CITAS_COLOR.white } };
      gClient.alignment = { horizontal: 'center', vertical: 'middle' };
      gClient.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369a1' } };

      ws.mergeCells('G3:I3');
      const gServ = ws.getCell('G3');
      gServ.value = '▸  SERVICIO COMPROMETIDO';
      gServ.font = { name: 'Calibri', size: 11, bold: true, color: { argb: CITAS_COLOR.white } };
      gServ.alignment = { horizontal: 'center', vertical: 'middle' };
      gServ.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } };

      // ─────────────────────────────────────────────────────────────
      // ROW 4 — GAP (optional, we use row 5 for column headers immediately)
      // ─────────────────────────────────────────────────────────────
      const row5 = ws.getRow(5);
      row5.height = 34;

      hdrs.forEach((label, ci) => {
        const cell = row5.getCell(ci + 1);
        cell.value = label;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: CITAS_COLOR.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: CITAS_COLOR.grayHdr },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94a3b8' } },
          bottom: { style: 'medium', color: { argb: CITAS_COLOR.accent } },
          left: { style: 'thin', color: { argb: '44000000' } },
          right: { style: 'thin', color: { argb: '44000000' } },
        };
      });

      // ─────────────────────────────────────────────────────────────
      // DATA ROWS
      // ─────────────────────────────────────────────────────────────
      data.forEach((v, idx) => {
        let nCliente = v.nombre_cliente || v.telefono || '—';
        let nTelf = v.telefono || '—';
        if (v.clientes) {
          nCliente = `${v.clientes.nombre || ''} ${v.clientes.apellido || ''}`.trim();
          nTelf = v.clientes.telefono || nTelf;
        }

        let nVehiculo = '—';
        if (v.vehiculos) {
          nVehiculo = `${v.vehiculos.marca || ''} ${v.vehiculos.modelo || ''} (${v.vehiculos.placa || ''})`.trim();
        }

        const rowValues = [
          idx + 1,
          v.fecha,
          v.hora,
          nCliente,
          nTelf,
          nVehiculo,
          (v.tipo_servicio || 'Mecánica').toUpperCase(),
          (v.estado || 'Pendiente').toUpperCase(),
          v.descripcion || v.notas || '—'
        ];

        const row = ws.addRow(rowValues);
        row.height = 20;

        const isEven = idx % 2 === 0;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { name: 'Calibri', size: 10, color: { argb: CITAS_COLOR.black } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          if (colNumber === 4 || colNumber === 6 || colNumber === 9) {
            cell.alignment.horizontal = 'left';
          }

          const bgColor = isEven ? CITAS_COLOR.white : CITAS_COLOR.lightBg;

          // Status colors
          if (colNumber === 8 && v.estado) {
            const estado = v.estado.toLowerCase();
            if (estado === 'confirmada') cell.font.color = { argb: 'FF16a34a' }; // Green
            if (estado === 'pendiente') cell.font.color = { argb: 'FFca8a04' }; // Yellow
            if (estado === 'cancelada') cell.font.color = { argb: 'FFdc2626' }; // Red
            if (estado === 'ocupado') cell.font.color = { argb: 'FFef4444' }; // Red
            cell.font.bold = true;
          }

          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.border = {
            bottom: { style: 'hair', color: { argb: CITAS_COLOR.border } },
            right: { style: 'thin', color: { argb: 'FFe2e8f0' } },
          };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="REPORTE_CITAS_${from}_al_${to}.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });

    } else {
      // ─────────────────────────────────────────────────────────────
      // LOGICA ORIGINAL DE VENTAS
      // ─────────────────────────────────────────────────────────────
      const { data: ventas } = await db
        .from('ventas_dia')
        .select('*')
        .gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: true });

      const data = ventas || [];

      const ws = workbook.addWorksheet('Reporte de Ventas', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
        views: [{ state: 'frozen', ySplit: 6 }],
      });

      const numCols = 30; // Columns A to AD
      const hdrs = [
        'Nº', 'FECHA', 'CLIENTES',
        'SILENCIADOR', 'CAUCHERA', 'ALINEACION', 'ELECTRONICA', 'MECANICA', 'FRENOS', 'LAVADO', 'REPUESTOS', 'TOTAL (SERVICIOS)',
        '', // GAP column (M)
        'CONTADO', 'X COBRAR', 'CASHEA', 'IVA', 'INICIAL', 'FINAN.',
        'PM BANESCO', 'PM EXT.', 'P. BANCAMIGA', 'P. BANESCO', 'BNC',
        'DIVISAS ($)', 'BINANCE', 'ZELLE', 'EFECT. BS',
        'TASA', 'NOTAS' // AD
      ];
      
      ws.columns = [
        { width: 5 }, { width: 13 }, { width: 10 }, // 1-3 General
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, // 4-12 Serv
        { width: 2.5 }, // 13 gap
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, // 14-19 Pagos
        { width: 14 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 10 }, // 20-24 Bancos
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, // 25-28 Extranjera
        { width: 10 }, { width: 35 } // 29-30 Otros
      ];

      // ROW 1
      const row1 = ws.getRow(1);
      row1.height = 40;
      ws.mergeCells('A1:B1');
      const logoCell = ws.getCell('A1');
      logoCell.value = '⚙  LYCOS TEAM';
      logoCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLOR.white } };
      logoCell.alignment = { horizontal: 'center', vertical: 'middle' };
      logoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

      ws.mergeCells('C1:' + colLetter(numCols) + '1');
      const subtitleCell = ws.getCell('C1');
      subtitleCell.value = 'TALLER AUTOMOTRIZ PROFESIONAL — REPORTES AGRUPADOS';
      subtitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFbbdefb' } };
      subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

      // ROW 2
      const row2 = ws.getRow(2);
      row2.height = 30;
      ws.mergeCells('A2:' + colLetter(numCols) + '2');
      const titleCell = ws.getCell('A2');
      titleCell.value = `REPORTE DE VENTAS TOTALES (${from} — ${to})`;
      titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLOR.accent } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

      // ROW 3
      const row3 = ws.getRow(3);
      row3.height = 24;

      ws.mergeCells('A3:C3');
      const gGeneral = ws.getCell('A3');
      gGeneral.value = '▸  GENERAL';
      gGeneral.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      gGeneral.alignment = { horizontal: 'center', vertical: 'middle' };
      gGeneral.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF607d8b' } };

      ws.mergeCells('D3:L3');
      const gServ = ws.getCell('D3');
      gServ.value = '▸  RESUMEN DE SERVICIOS REALIZADOS';
      gServ.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      gGeneral.alignment = { horizontal: 'center', vertical: 'middle' };
      gServ.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.grayHdr } };

      ws.mergeCells('M3:M3');
      ws.getCell('M3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

      ws.mergeCells('N3:' + colLetter(numCols) + '3');
      const gPago = ws.getCell('N3');
      gPago.value = '▸  MÉTODOS DE PAGO Y NOTAS';
      gPago.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      gPago.alignment = { horizontal: 'center', vertical: 'middle' };
      gPago.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0d47a1' } };

      // ROW 4
      const row4 = ws.getRow(4);
      row4.height = 20;

      const sections: [string, string, string][] = [
        ['A4:C4', 'Información', 'FF546e7a'],
        ['D4:L4', 'Ingresos por Categoria', 'FF455a64'],
        ['M4:M4', '', COLOR.primary],
        ['N4:S4', 'Pagos Estándar', 'FF1565c0'],
        ['T4:X4', 'Bancos Locales', 'FF0277bd'],
        ['Y4:AB4', 'Extranjera', 'FF00695c'],
        ['AC4:AD4', 'Extra', 'FF6a1b9a'],
      ];

      sections.forEach(([range, label, bg]) => {
        ws.mergeCells(range);
        const cell = ws.getCell(range.split(':')[0]);
        cell.value = label;
        cell.font = { name: 'Calibri', size: 9, color: { argb: COLOR.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      });

      // ROW 5
      const row5 = ws.getRow(5);
      row5.height = 34;

      hdrs.forEach((label, ci) => {
        const cell = row5.getCell(ci + 1);
        cell.value = label;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: ci === 12 ? COLOR.primary : ci <= 11 ? COLOR.grayHdr : 'FF1976d2' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF90caf9' } },
          bottom: { style: 'medium', color: { argb: COLOR.accent } },
          left: { style: 'thin', color: { argb: '88000000' } },
          right: { style: 'thin', color: { argb: '88000000' } },
        };
      });

      // DATA
      let currentRowIdx = 6;
      data.forEach((v, idx) => {
        const parsedNotas = v.notas ? v.notas.replace(/\[FACTURA_IA_START\][\s\S]*?\[FACTURA_IA_END\]/g, '').trim() : '';
        const rowValues = [
          idx + 1,
          v.fecha,
          v.clientes_atendidos || v.total_clientes || 0,
          v.silenciador || 0, v.cauchera || 0, v.alineacion || 0, v.electronica || 0,
          v.mecanica || 0, v.frenos || 0, v.lavado || 0, v.repuestos || 0,
          v.total_ingresos || 0,
          null, // Gap
          v.contado || 0, v.por_cobrar || 0, v.cashea || 0, v.iva || 0, v.inicial || 0, v.financiado || 0,
          v.pago_movil_banesco || 0, v.pago_movil_exterior || 0, v.punto_bancamiga || 0, v.punto_banesco || 0, v.bnc || 0,
          v.dolares || 0, v.binance || 0, v.zelle || 0, v.efectivo_bs || 0,
          v.tasa || 0, parsedNotas
        ];

        const row = ws.addRow(rowValues);
        row.height = 20;

        const isEven = idx % 2 === 0;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { name: 'Calibri', size: 10, color: { argb: COLOR.black } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          if ((colNumber >= 4 && colNumber <= 12) || (colNumber >= 14 && colNumber <= 29)) {
            cell.numFmt = '#,##0.00';
            cell.alignment.horizontal = 'right';
          }
          if (colNumber === 30) cell.alignment.horizontal = 'left';

          if (colNumber === 13) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? COLOR.white : COLOR.lightBg } };
            cell.border = {
              bottom: { style: 'hair', color: { argb: COLOR.border } },
              right: { style: 'thin', color: { argb: 'FFe0e0e0' } },
            };
          }
        });
        currentRowIdx++;
      });

      // TOTALS
      const totalRow = ws.addRow([]);
      totalRow.height = 25;
      ws.mergeCells(`A${currentRowIdx}:B${currentRowIdx}`);
      const ttlKey = totalRow.getCell(1);
      ttlKey.value = 'MONTO TOTAL ( RANGO SELECCIONADO )';
      ttlKey.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      ttlKey.alignment = { horizontal: 'center', vertical: 'middle' };
      ttlKey.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

      for (let c = 3; c <= numCols - 1; c++) {
        if (c === 13 || c === 29) {
          if (c === 13) totalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
          continue;
        }
        const cell = totalRow.getCell(c);
        const colLetterStr = colLetter(c);
        if (data.length > 0) {
          cell.value = { formula: `SUM(${colLetterStr}6:${colLetterStr}${currentRowIdx - 1})` };
        } else {
          cell.value = 0;
        }
        cell.numFmt = '#,##0.00';
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.white } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="REPORTE_VENTAS_AGRUPADAS_${from}_al_${to}.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Error al generar reporte Excel' }, { status: 500 });
  }
}
