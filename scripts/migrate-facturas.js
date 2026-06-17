const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('Migrating historical sales to facturas table...');
  
  // Get all facturas reference IDs to avoid duplicates
  const { data: facturas } = await supabase.from('facturas').select('referencia_id');
  const existingRefs = new Set((facturas || []).map(f => f.referencia_id));

  // 1. Migrar ventas_dia
  const { data: ventasDia } = await supabase.from('ventas_dia').select('*');
  const ventasDiaToMigrate = (ventasDia || []).filter(v => !existingRefs.has(v.id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  console.log(`Found ${ventasDiaToMigrate.length} ventas_dia to migrate.`);
  
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
    if (error) {
      console.error('Error inserting ventas_dia:', error.message);
    } else {
      process.stdout.write('.');
    }
  }

  // 2. Migrar ventas_silenciadores
  const { data: ventasSil } = await supabase.from('ventas_silenciadores').select('*');
  const ventasSilToMigrate = (ventasSil || []).filter(v => !existingRefs.has(v.id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  console.log(`\nFound ${ventasSilToMigrate.length} ventas_silenciadores to migrate.`);
  
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
    if (error) {
      console.error('Error inserting ventas_silenciadores:', error.message);
    } else {
      process.stdout.write('+');
    }
  }
  
  console.log('\nMigration complete.');
}

main().catch(console.error);
