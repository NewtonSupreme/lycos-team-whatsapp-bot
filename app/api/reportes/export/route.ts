import { authorize } from '@/lib/auth-server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { inferirCategoria, buildCategoriaColumns, buildPagoColumns, categoriaLabel } from '@/lib/categorias';
import { buildUtilidad } from '@/lib/utilidad';

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
  const auth = await authorize('reportes', 'leer');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
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

      // La placa en su propia columna: metida entre paréntesis detrás del
      // modelo no se podía ni ordenar ni buscar.
      const numCols = 10;
      const hdrs = [ 'Nº', 'FECHA', 'HORA', 'CLIENTE', 'TELÉFONO', 'VEHÍCULO', 'PLACA', 'SERVICIO', 'ESTADO', 'DESCRIPCIÓN / MOTIVO' ];
      ws.columns = [
        { width: 5 }, { width: 13 }, { width: 10 }, { width: 25 }, { width: 15 },
        { width: 22 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 45 }
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

      ws.mergeCells('D3:G3');
      const gClient = ws.getCell('D3');
      gClient.value = '▸  CLIENTE Y VEHÍCULO';
      gClient.font = { name: 'Calibri', size: 11, bold: true, color: { argb: CITAS_COLOR.white } };
      gClient.alignment = { horizontal: 'center', vertical: 'middle' };
      gClient.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369a1' } };

      ws.mergeCells('H3:J3');
      const gServ = ws.getCell('H3');
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
        let nPlaca = '—';
        if (v.vehiculos) {
          nVehiculo = `${v.vehiculos.marca || ''} ${v.vehiculos.modelo || ''}`.trim() || '—';
          nPlaca = String(v.vehiculos.placa || '').toUpperCase() || '—';
        }

        const rowValues = [
          idx + 1,
          v.fecha,
          v.hora,
          nCliente,
          nTelf,
          nVehiculo,
          nPlaca,
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

          if (colNumber === 4 || colNumber === 6 || colNumber === 10) {
            cell.alignment.horizontal = 'left';
          }

          const bgColor = isEven ? CITAS_COLOR.white : CITAS_COLOR.lightBg;

          // Status colors
          if (colNumber === 9 && v.estado) {
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

      // ── Identificación real del cliente: NOMBRE + PLACA + VEHÍCULO ──────────
      // (antes la columna "CLIENTES" era un simple conteo y siempre salía "1")
      const numCols = 33; // Columns A to AG
      const hdrs = [
        'Nº', 'FECHA', 'CLIENTE', 'PLACA', 'VEHÍCULO', 'CLASIFICACIÓN',
        'SILENCIADOR', 'CAUCHERA', 'ALINEACION', 'ELECTRONICA', 'MECANICA', 'FRENOS', 'LAVADO', 'REPUESTOS', 'TOTAL (SERVICIOS)',
        '', // GAP column (P)
        'CONTADO', 'X COBRAR', 'CASHEA / BNC', 'IVA', 'INICIAL', 'FINAN.',
        'PM BANESCO', 'PM EXT.', 'P. BANCAMIGA', 'P. BANESCO', 'BNC',
        'DIVISAS ($)', 'BINANCE', 'ZELLE', 'EFECT. BS',
        'TASA', 'NOTAS' // AG
      ];

      ws.columns = [
        { width: 5 }, { width: 12 }, { width: 26 }, { width: 12 }, { width: 22 }, { width: 18 }, // 1-6 General
        { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 }, // 7-15 Serv
        { width: 2.5 }, // 16 gap
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, // 17-22 Pagos
        { width: 14 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 10 }, // 23-27 Bancos
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, // 28-31 Extranjera
        { width: 10 }, { width: 35 } // 32-33 Otros
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

      ws.mergeCells('A3:F3');
      const gGeneral = ws.getCell('A3');
      gGeneral.value = '▸  IDENTIFICACIÓN DEL CLIENTE Y VEHÍCULO';
      gGeneral.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      gGeneral.alignment = { horizontal: 'center', vertical: 'middle' };
      gGeneral.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF607d8b' } };

      ws.mergeCells('G3:O3');
      const gServ = ws.getCell('G3');
      gServ.value = '▸  SERVICIOS CLASIFICADOS POR TIPO';
      gServ.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      gServ.alignment = { horizontal: 'center', vertical: 'middle' };
      gServ.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.grayHdr } };

      ws.getCell('P3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

      ws.mergeCells('Q3:' + colLetter(numCols) + '3');
      const gPago = ws.getCell('Q3');
      gPago.value = '▸  MÉTODOS DE PAGO Y NOTAS';
      gPago.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      gPago.alignment = { horizontal: 'center', vertical: 'middle' };
      gPago.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0d47a1' } };

      // ROW 4
      const row4 = ws.getRow(4);
      row4.height = 20;

      const sections: [string, string, string][] = [
        ['A4:F4', 'Cliente · Placa · Vehículo · Clasificación', 'FF546e7a'],
        ['G4:O4', 'Ingresos por Categoría', 'FF455a64'],
        ['P4:P4', '', COLOR.primary],
        ['Q4:V4', 'Pagos Estándar', 'FF1565c0'],
        ['W4:AA4', 'Bancos Locales', 'FF0277bd'],
        ['AB4:AE4', 'Extranjera', 'FF00695c'],
        ['AF4:AG4', 'Extra', 'FF6a1b9a'],
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
          fgColor: { argb: ci === 15 ? COLOR.primary : ci <= 14 ? COLOR.grayHdr : 'FF1976d2' },
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

        // Clasificación: la guardada, o inferida de la descripción/notas (históricos).
        const cat = v.categoria || inferirCategoria(
          (v.desglose?.[0]?.descripcion) || parsedNotas || ''
        );
        const total = Number(v.total_ingresos) || 0;

        // Si el registro no trae las columnas por categoría (históricos), se derivan
        // de la clasificación para que el monto NO quede sólo en "Total (Servicios)".
        const catCols: Record<string, number> = {
          silenciador: Number(v.silenciador) || 0,
          cauchera: Number(v.cauchera) || 0,
          alineacion: Number(v.alineacion) || 0,
          electronica: Number(v.electronica) || 0,
          mecanica: Number(v.mecanica) || 0,
          frenos: Number(v.frenos) || 0,
          lavado: Number(v.lavado) || 0,
          repuestos: Number(v.repuestos) || 0,
        };
        const yaClasificado = Object.values(catCols).some(n => n > 0);
        if (!yaClasificado && total > 0) {
          Object.assign(catCols, buildCategoriaColumns(cat, total));
        }

        // Métodos de pago: si el registro no trae las columnas, se derivan del jsonb.
        const pagoCols: Record<string, number> = {
          dolares: Number(v.dolares) || 0,
          binance: Number(v.binance) || 0,
          zelle: Number(v.zelle) || 0,
          efectivo_bs: Number(v.efectivo_bs) || 0,
          cashea: Number(v.cashea) || 0,
          pago_movil_banesco: Number(v.pago_movil_banesco) || 0,
          pago_movil_exterior: Number(v.pago_movil_exterior) || 0,
          punto_bancamiga: Number(v.punto_bancamiga) || 0,
          punto_banesco: Number(v.punto_banesco) || 0,
          bnc: Number(v.bnc) || 0,
        };
        const yaPagos = Object.values(pagoCols).some(n => n > 0);
        if (!yaPagos && v.metodos_pago) {
          Object.assign(pagoCols, buildPagoColumns(v.metodos_pago));
        }

        const rowValues = [
          idx + 1,
          v.fecha,
          // ✅ Identificación real del cliente (antes: un conteo que siempre era "1")
          v.cliente || 'Consumidor Final',
          (v.placa || '—').toString().toUpperCase(),
          v.vehiculo_info || '—',
          categoriaLabel(cat),
          catCols.silenciador, catCols.cauchera, catCols.alineacion, catCols.electronica,
          catCols.mecanica, catCols.frenos, catCols.lavado, catCols.repuestos,
          total,
          null, // Gap
          v.contado || 0, v.por_cobrar || 0, pagoCols.cashea, v.iva || 0, v.inicial || 0, v.financiado || 0,
          pagoCols.pago_movil_banesco, pagoCols.pago_movil_exterior, pagoCols.punto_bancamiga, pagoCols.punto_banesco, pagoCols.bnc,
          pagoCols.dolares, pagoCols.binance, pagoCols.zelle, pagoCols.efectivo_bs,
          v.tasa || v.tasa_cambio || 0, parsedNotas
        ];

        const row = ws.addRow(rowValues);
        row.height = 20;

        const isEven = idx % 2 === 0;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { name: 'Calibri', size: 10, color: { argb: COLOR.black } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

          // Numéricas: categorías (7-15) y pagos/tasa (17-32)
          if ((colNumber >= 7 && colNumber <= 15) || (colNumber >= 17 && colNumber <= 32)) {
            cell.numFmt = '#,##0.00';
            cell.alignment.horizontal = 'right';
          }
          // Cliente y vehículo alineados a la izquierda (texto)
          if (colNumber === 3 || colNumber === 5 || colNumber === 33) cell.alignment.horizontal = 'left';
          // Placa destacada
          if (colNumber === 4) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.primary } };
          }

          if (colNumber === 16) {
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
      ws.mergeCells(`A${currentRowIdx}:F${currentRowIdx}`);
      const ttlKey = totalRow.getCell(1);
      ttlKey.value = 'MONTO TOTAL ( RANGO SELECCIONADO )';
      ttlKey.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
      ttlKey.alignment = { horizontal: 'center', vertical: 'middle' };
      ttlKey.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

      // Suma desde la primera columna numérica (7) hasta antes de NOTAS (33); salta el gap (16) y TASA (32).
      for (let c = 7; c <= numCols - 1; c++) {
        if (c === 16 || c === 32) {
          if (c === 16) totalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
          continue;
        }
        const cell = totalRow.getCell(c);
        const colLetterStr = colLetter(c);
        if (data.length > 0) {
          cell.value = { formula: `SUM(${colLetterStr}6:${colLetterStr}${currentRowIdx - 1})`, date1904: false };
        } else {
          cell.value = 0;
        }
        cell.numFmt = '#,##0.00';
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.white } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
      }

      // ═══════════════════════════════════════════════════════════════════
      //  HOJA 2 — UTILIDAD POR CLIENTE / VEHÍCULO  (Ingresos − Egresos)
      // ═══════════════════════════════════════════════════════════════════
      await addUtilidadSheet(workbook, db, from, to);

      // ═══════════════════════════════════════════════════════════════════
      //  HOJA 3 — EGRESOS DETALLADOS (con el vehículo/servicio asociado)
      // ═══════════════════════════════════════════════════════════════════
      await addEgresosSheet(workbook, db, from, to);

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

// ═════════════════════════════════════════════════════════════════════════════
//  HOJA — UTILIDAD POR CLIENTE / VEHÍCULO
//  Ingresos (ventas_dia) − Egresos asociados (egresos) = Utilidad real
// ═════════════════════════════════════════════════════════════════════════════
async function addUtilidadSheet(workbook: ExcelJS.Workbook, db: any, from: string, to: string) {
  const filas = await buildUtilidad(db, { desde: from, hasta: to });

  const ws = workbook.addWorksheet('Utilidad por Vehículo', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  const hdrs = ['Nº', 'CLIENTE', 'PLACA', 'VEHÍCULO', 'INGRESOS', 'EGRESOS', 'UTILIDAD', 'MARGEN %', 'VENTAS', 'GASTOS'];
  ws.columns = [
    { width: 5 }, { width: 30 }, { width: 13 }, { width: 26 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 11 }, { width: 9 }, { width: 9 },
  ];
  const nCols = hdrs.length;

  // Título
  const r1 = ws.getRow(1); r1.height = 34;
  ws.mergeCells(`A1:${colLetter(nCols)}1`);
  const t = ws.getCell('A1');
  t.value = `⚙  LYCOS TEAM — UTILIDAD POR CLIENTE / VEHÍCULO (${from} — ${to})`;
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR.white } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

  const r2 = ws.getRow(2); r2.height = 18;
  ws.mergeCells(`A2:${colLetter(nCols)}2`);
  const s = ws.getCell('A2');
  s.value = 'Utilidad = Ingresos del vehículo − Egresos asociados a ese vehículo';
  s.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFbbdefb' } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };

  // Encabezados
  const r3 = ws.getRow(3); r3.height = 24;
  hdrs.forEach((h, i) => {
    const c = r3.getCell(i + 1);
    c.value = h;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR.white } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.grayHdr } };
    c.border = { bottom: { style: 'medium', color: { argb: COLOR.accent } } };
  });

  let idx = 4;
  filas.forEach((f, i) => {
    const row = ws.addRow([
      i + 1, f.cliente, f.placa, f.vehiculo,
      f.ingresos, f.egresos, f.utilidad, f.margen, f.n_ventas, f.n_egresos,
    ]);
    row.height = 18;
    const isEven = i % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: COLOR.black } };
      cell.alignment = { horizontal: col === 2 || col === 4 ? 'left' : 'center', vertical: 'middle' };
      if (col >= 5 && col <= 7) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
      if (col === 8) { cell.numFmt = '0.0"%"'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
      if (col === 3) cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.primary } };
      // Utilidad en verde si es positiva, roja si es negativa
      if (col === 7) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: f.utilidad >= 0 ? 'FF1b5e20' : 'FFc62828' } };
      }
      if (col === 6 && f.egresos > 0) cell.font = { name: 'Calibri', size: 10, color: { argb: 'FFc62828' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? COLOR.white : COLOR.lightBg } };
      cell.border = { bottom: { style: 'hair', color: { argb: COLOR.border } } };
    });
    idx++;
  });

  // Totales
  const tr = ws.addRow([]);
  tr.height = 24;
  ws.mergeCells(`A${idx}:D${idx}`);
  const tk = tr.getCell(1);
  tk.value = 'TOTALES';
  tk.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
  tk.alignment = { horizontal: 'center', vertical: 'middle' };
  tk.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.primary } };
  for (let c = 5; c <= 7; c++) {
    const cell = tr.getCell(c);
    cell.value = filas.length ? { formula: `SUM(${colLetter(c)}4:${colLetter(c)}${idx - 1})`, date1904: false } : 0;
    cell.numFmt = '#,##0.00';
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.white } };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  HOJA — EGRESOS DETALLADOS (con vehículo / servicio asociado)
// ═════════════════════════════════════════════════════════════════════════════
async function addEgresosSheet(workbook: ExcelJS.Workbook, db: any, from: string, to: string) {
  const { data: egresos } = await db
    .from('egresos').select('*')
    .gte('fecha', from).lte('fecha', to)
    .order('fecha', { ascending: true });

  const rows = egresos || [];

  const ws = workbook.addWorksheet('Egresos', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  const hdrs = ['Nº', 'FECHA', 'HORA', 'CATEGORÍA', 'DESCRIPCIÓN', 'CLIENTE ASOCIADO', 'PLACA', 'VEHÍCULO', 'PAGADO A', 'MÉTODO', 'ORIGEN', 'MONTO'];
  ws.columns = [
    { width: 5 }, { width: 12 }, { width: 8 }, { width: 18 }, { width: 34 },
    { width: 26 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 16 }, { width: 10 }, { width: 13 },
  ];
  const nCols = hdrs.length;

  const r1 = ws.getRow(1); r1.height = 34;
  ws.mergeCells(`A1:${colLetter(nCols)}1`);
  const t = ws.getCell('A1');
  t.value = `⚙  LYCOS TEAM — REGISTRO DE EGRESOS (${from} — ${to})`;
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR.white } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7f1d1d' } };

  const r2 = ws.getRow(2); r2.height = 24;
  hdrs.forEach((h, i) => {
    const c = r2.getCell(i + 1);
    c.value = h;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR.white } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991b1b' } };
    c.border = { bottom: { style: 'medium', color: { argb: COLOR.accent } } };
  });

  let idx = 3;
  rows.forEach((e: any, i: number) => {
    const desc = e.notas || e.desglose?.[0]?.descripcion || '—';
    const row = ws.addRow([
      i + 1, e.fecha, e.hora || '—', e.categoria || 'otro', desc,
      e.cliente_nombre || '—', (e.placa || '—').toString().toUpperCase(), e.vehiculo_info || '—',
      e.proveedor || e.cliente || '—', e.metodo_pago || '—', (e.origen || 'panel').toUpperCase(),
      Number(e.total_egresos) || 0,
    ]);
    row.height = 18;
    const isEven = i % 2 === 0;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: COLOR.black } };
      cell.alignment = { horizontal: [5, 6, 8, 9].includes(col) ? 'left' : 'center', vertical: 'middle', wrapText: true };
      if (col === 12) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFc62828' } };
      }
      if (col === 7) cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR.primary } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? COLOR.white : COLOR.lightBg } };
      cell.border = { bottom: { style: 'hair', color: { argb: COLOR.border } } };
    });
    idx++;
  });

  const tr = ws.addRow([]);
  tr.height = 24;
  ws.mergeCells(`A${idx}:K${idx}`);
  const tk = tr.getCell(1);
  tk.value = 'TOTAL EGRESOS';
  tk.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
  tk.alignment = { horizontal: 'center', vertical: 'middle' };
  tk.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7f1d1d' } };
  const tc = tr.getCell(12);
  tc.value = rows.length ? { formula: `SUM(L3:L${idx - 1})`, date1904: false } : 0;
  tc.numFmt = '#,##0.00';
  tc.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR.white } };
  tc.alignment = { horizontal: 'right', vertical: 'middle' };
  tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
}
