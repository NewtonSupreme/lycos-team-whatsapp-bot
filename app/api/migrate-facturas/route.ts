import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ──────────────────────────────────────────────────────────────────────────────
// Sincroniza la tabla `facturas` con las ventas registradas.
//
// FUENTE ÚNICA: `ventas_dia`. Toda venta del sistema (POS, silenciadores, ventas,
// y el bot al completar un servicio) crea SIEMPRE un registro en `ventas_dia`.
// `ventas_silenciadores` son solo espejos/registros secundarios de la MISMA venta,
// por eso NO se migran (evita facturas duplicadas).
//
// Idempotente: deduplica por `referencia_id` = id de la venta_dia. Llamarlo varias
// veces no crea duplicados; solo agrega las facturas que falten.
// ──────────────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase no configurado' }, { status: 500 });
  }

  try {
    // 1. IDs de venta que ya tienen factura (para no duplicar)
    const { data: facturas } = await supabase.from('facturas').select('referencia_id');
    const existingRefs = new Set((facturas || []).map(f => f.referencia_id).filter(Boolean));

    // 2. Todas las ventas_dia sin factura
    const { data: ventasDia, error: vdErr } = await supabase.from('ventas_dia').select('*');
    if (vdErr) {
      return NextResponse.json({ success: false, error: vdErr.message }, { status: 500 });
    }

    const pendientes = (ventasDia || [])
      .filter(v => !existingRefs.has(v.id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let migrated = 0;
    const errores: string[] = [];

    for (const venta of pendientes) {
      let correlativo: string | null = null;
      try {
        const { data: corr } = await supabase.rpc('generar_correlativo_factura');
        correlativo = (corr as string) || null;
      } catch { /* fallback abajo */ }
      if (!correlativo) correlativo = `FAC-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`;

      const total = Number(venta.total_ingresos || 0) * (venta.con_iva ? 1.16 : 1);
      const tasa = Number(venta.tasa_cambio || 0);

      const insertData = {
        correlativo,
        tipo: 'venta',
        modulo_origen: 'ventas_pos',
        referencia_id: venta.id,
        referencia_tabla: 'ventas_dia',
        cliente: venta.cliente || 'Consumidor Final',
        total,
        moneda: 'USD',
        tasa_cambio: tasa || null,
        total_bs: tasa ? total * tasa : null,
        items: venta.desglose || [],
        metodos_pago: venta.metodos_pago || {},
        con_iva: venta.con_iva || false,
        estado: venta.estado || 'pagado',
        notas: venta.notas,
        sede_id: venta.sede_id,
        emitido_por: venta.creado_por || 'Admin',
        fecha_emision: venta.fecha ? String(venta.fecha).split('T')[0] : String(venta.created_at).split('T')[0],
        created_at: venta.created_at,
        updated_at: venta.created_at,
      };

      const { error } = await supabase.from('facturas').insert(insertData);
      if (error) errores.push(`${venta.id}: ${error.message}`);
      else migrated++;
    }

    return NextResponse.json({
      success: true,
      migrated,
      pendientes: pendientes.length,
      yaConFactura: existingRefs.size,
      totalVentasDia: (ventasDia || []).length,
      errores: errores.slice(0, 10),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Error inesperado' }, { status: 500 });
  }
}
