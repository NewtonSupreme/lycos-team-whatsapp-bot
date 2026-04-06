import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function esc(val: unknown): string {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  return '\uFEFF' + [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = searchParams.get('to') || new Date().toISOString().split('T')[0];
  const tipo = searchParams.get('tipo') || 'ventas';

  try {
    const db = createClient(supabaseUrl, supabaseKey);

    if (tipo === 'citas') {
      const { data: citas } = await db
        .from('citas')
        .select('fecha, hora, tipo_servicio, descripcion, estado, nombre_cliente, vehiculo_info, placa, telefono')
        .gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: false });

      const rows = (citas || []).map(c => ({
        'FECHA': c.fecha, 'HORA': c.hora || '', 'SERVICIO': c.tipo_servicio || '',
        'DESCRIPCION': c.descripcion || '', 'ESTADO': c.estado || '',
        'CLIENTE': c.nombre_cliente || '', 'VEHICULO': c.vehiculo_info || '',
        'PLACA': c.placa || '', 'TELEFONO': c.telefono || '',
      }));

      const csv = toCSV(rows, ['FECHA','HORA','SERVICIO','DESCRIPCION','ESTADO','CLIENTE','VEHICULO','PLACA','TELEFONO']);
      return new NextResponse(csv, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="citas_${from}_${to}.csv"` }
      });
    }

    // VENTAS — full FORMATO matching the Excel
    const { data: ventas } = await db
      .from('ventas_dia')
      .select('*')
      .gte('fecha', from).lte('fecha', to)
      .order('fecha', { ascending: true });

    const data = ventas || [];

    const SERVICES = ['silenciador','cauchera','alineacion','electronica','mecanica','frenos','lavado','repuestos'];
    const PAGOS = ['contado','por_cobrar','cashea','iva','inicial','financiado','pago_movil_banesco','pago_movil_exterior','punto_bancamiga','punto_banesco','bnc','dolares','binance','zelle','efectivo_bs'];

    const HEADERS = [
      'Nº', 'FECHA', 'CLIENTES',
      'SILENCIADOR','CAUCHERA','ALINEACION','ELECTRONICA','MECANICA','FRENOS','LAVADO','REPUESTOS',
      'TOTAL',
      'CONTADO','POR COBRAR','CASHEA','IVA','INICIAL','FINANCIADO',
      'PM BANESCO','PM EXTERIOR','P. BANCAMIGA','P. BANESCO','BNC','$','BINANCE','ZELLE','EFECTIVO BS',
      'TASA','NOTAS','FUENTE'
    ];

    const rows: Record<string, unknown>[] = data.map((v, idx) => ({
      'Nº': idx + 1,
      'FECHA': v.fecha,
      'CLIENTES': v.clientes_atendidos || v.total_clientes || 0,
      'SILENCIADOR': v.silenciador || 0,
      'CAUCHERA': v.cauchera || 0,
      'ALINEACION': v.alineacion || 0,
      'ELECTRONICA': v.electronica || 0,
      'MECANICA': v.mecanica || 0,
      'FRENOS': v.frenos || 0,
      'LAVADO': v.lavado || 0,
      'REPUESTOS': v.repuestos || 0,
      'TOTAL': v.total_ingresos || 0,
      'CONTADO': v.contado || 0,
      'POR COBRAR': v.por_cobrar || 0,
      'CASHEA': v.cashea || 0,
      'IVA': v.iva || 0,
      'INICIAL': v.inicial || 0,
      'FINANCIADO': v.financiado || 0,
      'PM BANESCO': v.pago_movil_banesco || 0,
      'PM EXTERIOR': v.pago_movil_exterior || 0,
      'P. BANCAMIGA': v.punto_bancamiga || 0,
      'P. BANESCO': v.punto_banesco || 0,
      'BNC': v.bnc || 0,
      '$': v.dolares || 0,
      'BINANCE': v.binance || 0,
      'ZELLE': v.zelle || 0,
      'EFECTIVO BS': v.efectivo_bs || 0,
      'TASA': v.tasa || 0,
      'NOTAS': v.notas || '',
      'FUENTE': v.imagen_url ? 'Scan IA' : 'Manual',
    }));

    // Totals row
    const totals: Record<string, unknown> = { 'Nº': 'TOTAL', 'FECHA': '', 'CLIENTES': 0, 'TASA': '', 'NOTAS': '', 'FUENTE': '' };
    for (const h of HEADERS.slice(3)) {
      if (h !== 'TASA' && h !== 'NOTAS' && h !== 'FUENTE') {
        totals[h] = rows.reduce((s, r) => s + Number(r[h] || 0), 0);
      }
    }
    totals['CLIENTES'] = rows.reduce((s, r) => s + Number(r['CLIENTES'] || 0), 0);
    rows.push(totals);

    // Summary block: totals by service and payment method
    const summaryRows: Record<string, unknown>[] = [
      {}, // blank row
      { 'Nº': '=== RESUMEN POR SERVICIO ===' },
      ...SERVICES.map(s => ({
        'Nº': s.toUpperCase(),
        'TOTAL': rows.slice(0,-1).reduce((sum, r) => sum + Number(r[s.toUpperCase()] || 0), 0)
      })),
      {},
      { 'Nº': '=== RESUMEN FORMAS DE PAGO ===' },
      ...PAGOS.map(p => {
        const key = {
          contado: 'CONTADO', por_cobrar: 'POR COBRAR', cashea: 'CASHEA',
          iva: 'IVA', inicial: 'INICIAL', financiado: 'FINANCIADO',
          pago_movil_banesco: 'PM BANESCO', pago_movil_exterior: 'PM EXTERIOR',
          punto_bancamiga: 'P. BANCAMIGA', punto_banesco: 'P. BANESCO',
          bnc: 'BNC', dolares: '$', binance: 'BINANCE', zelle: 'ZELLE',
          efectivo_bs: 'EFECTIVO BS'
        }[p] || p.toUpperCase();
        return {
          'Nº': key,
          'TOTAL': rows.slice(0,-1).reduce((sum, r) => sum + Number(r[key] || 0), 0)
        };
      }),
    ];

    const allRows = [...rows, ...summaryRows];
    const csv = toCSV(allRows, HEADERS);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reporte_ventas_${from}_${to}.csv"`,
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Error al generar reporte' }, { status: 500 });
  }
}
