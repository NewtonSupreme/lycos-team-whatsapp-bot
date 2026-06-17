import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase no configurado' }, { status: 500 });
  }
  console.log('Migrating historical sales to facturas table...');
  
  // Get all facturas reference IDs to avoid duplicates
  const { data: facturas } = await supabase.from('facturas').select('referencia_id');
  const existingRefs = new Set((facturas || []).map(f => f.referencia_id));

  // 1. Migrar ventas_dia
  const { data: ventasDia } = await supabase.from('ventas_dia').select('*');
  const ventasDiaToMigrate = (ventasDia || []).filter(v => !existingRefs.has(v.id)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  
  let migratedDia = 0;
  for (const venta of ventasDiaToMigrate) {
    const { data: correlativo } = await supabase.rpc('generar_correlativo_factura');
    
    const insertData = {
      correlativo: correlativo || `FAC-2026-${Math.floor(Math.random() * 9000) + 1000}`,
      tipo: 'venta',
      modulo_origen: 'ventas_pos',
      referencia_id: venta.id,
      referencia_tabla: 'ventas_dia',
      cliente: venta.cliente || 'Consumidor Final',
      total: venta.total_ingresos * (venta.con_iva ? 1.16 : 1),
      moneda: 'USD',
      tasa_cambio: venta.tasa_cambio,
      total_bs: (venta.total_ingresos * (venta.con_iva ? 1.16 : 1)) * (venta.tasa_cambio || 1),
      items: venta.desglose || [],
      metodos_pago: venta.metodos_pago || {},
      con_iva: venta.con_iva || false,
      estado: venta.estado || 'pagado',
      notas: venta.notas,
      sede_id: venta.sede_id,
      emitido_por: venta.creado_por || 'Admin',
      fecha_emision: venta.fecha ? venta.fecha.split('T')[0] : venta.created_at.split('T')[0],
      created_at: venta.created_at,
      updated_at: venta.created_at
    };
    
    const { error } = await supabase.from('facturas').insert(insertData);
    if (!error) migratedDia++;
  }

  // 2. Migrar ventas_silenciadores
  const { data: ventasSil } = await supabase.from('ventas_silenciadores').select('*');
  const ventasSilToMigrate = (ventasSil || []).filter(v => !existingRefs.has(v.id)).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  
  let migratedSil = 0;
  for (const venta of ventasSilToMigrate) {
    const { data: correlativo } = await supabase.rpc('generar_correlativo_factura');
    
    const insertData = {
      correlativo: correlativo || `FAC-2026-${Math.floor(Math.random() * 9000) + 1000}`,
      tipo: 'venta',
      modulo_origen: 'silenciadores',
      referencia_id: venta.id,
      referencia_tabla: 'ventas_silenciadores',
      cliente: venta.cliente || 'Consumidor Final',
      vehiculo: venta.vehiculo,
      total: venta.total,
      moneda: 'USD',
      items: venta.servicios || [],
      metodos_pago: venta.metodos_pago || {},
      estado: 'pagado',
      notas: venta.notas,
      sede_id: venta.sede_id,
      emitido_por: venta.registrado_por || 'Admin',
      fecha_emision: venta.fecha ? venta.fecha.split('T')[0] : venta.created_at.split('T')[0],
      created_at: venta.created_at,
      updated_at: venta.created_at
    };
    
    const { error } = await supabase.from('facturas').insert(insertData);
    if (!error) migratedSil++;
  }
  
  return NextResponse.json({
    success: true,
    migratedDia,
    migratedSil,
    ventasDiaToMigrate: ventasDiaToMigrate.length,
    ventasSilToMigrate: ventasSilToMigrate.length,
    totalFacturasNow: (facturas?.length || 0) + migratedDia + migratedSil
  });
}
