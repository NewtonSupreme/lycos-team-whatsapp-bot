const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1].trim()] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(supabaseUrl, supabaseKey);

async function main() {
  const clientPhone = '04141240708';
  const plateNumber = '7A6A7DN';
  const cementerioSedeId = '34e789ad-1234-4567-8901-abcdef654321';
  const saleId = '8efdf3d1-a5da-4d8f-a306-4284f5db7d31';

  console.log('1. Locating client Antonio González...');
  const { data: clients, error: clientErr } = await db.from('clientes')
    .select('*')
    .eq('telefono', clientPhone);
  
  if (clientErr) throw clientErr;
  if (!clients || clients.length === 0) {
    console.error('Client not found!');
    return;
  }
  
  const clientObj = clients[0];
  console.log(`Found client: ${clientObj.nombre} ${clientObj.apellido} (ID: ${clientObj.id})`);

  console.log('\n2. Checking and creating vehicle (Hyundai Accent 2002, 7A6A7DN)...');
  const { data: existingVehicles, error: vehErr } = await db.from('vehiculos')
    .select('*')
    .eq('placa', plateNumber);
  
  if (vehErr) throw vehErr;
  let vehicleId;

  if (existingVehicles && existingVehicles.length > 0) {
    vehicleId = existingVehicles[0].id;
    console.log(`Vehicle already exists with ID: ${vehicleId}`);
  } else {
    const { data: newVeh, error: createVehErr } = await db.from('vehiculos')
      .insert({
        cliente_id: clientObj.id,
        marca: 'Hyundai',
        modelo: 'Accent',
        anio: 2002,
        color: 'Blanco',
        placa: plateNumber,
        estado: 'activo',
        sede_id: cementerioSedeId
      })
      .select('id')
      .single();
    
    if (createVehErr) throw createVehErr;
    vehicleId = newVeh.id;
    console.log(`Created new vehicle for client (ID: ${vehicleId})`);
  }

  console.log('\n3. Deleting erroneous vehicle CL40Y created by bot regex failure...');
  const { data: deletedVeh, error: deleteVehErr } = await db.from('vehiculos')
    .delete()
    .eq('placa', 'CL40Y')
    .select();
  
  if (deleteVehErr) {
    console.error('Error deleting CL40Y:', deleteVehErr.message);
  } else {
    console.log(`Deleted vehicle CL40Y:`, deletedVeh);
  }

  console.log('\n4. Updating POS sale in ventas_dia to have $50 total (agreed price)...');
  const { data: updatedSale, error: updateSaleErr } = await db.from('ventas_dia')
    .update({
      total_ingresos: 50,
      total_servicios: 3,
      desglose: [
        {
          total: 10,
          cantidad: 2,
          descripcion: "Gomas varias",
          precio_unitario: 5
        },
        {
          total: 40,
          cantidad: 1,
          descripcion: "Silenciador CL40",
          precio_unitario: 40
        }
      ],
      metodos_pago: {
        otro: 0,
        zelle: 0,
        cashea: 0,
        binance: 0,
        pago_movil: 0,
        efectivo_usd: 0,
        efectivo_ves: 0,
        transferencia: 0,
        punto_de_venta: 0,
        euros: 50
      },
      notas: `| Vehículo: Hyundai Accent 2002 blanco placa ${plateNumber} | Cancela 50 Euros`
    })
    .eq('id', saleId)
    .select();

  if (updateSaleErr) {
    console.error('Error updating sale in ventas_dia:', updateSaleErr.message);
  } else {
    console.log('Successfully updated sale in ventas_dia:', updatedSale);
  }

  console.log('\n5. Creating record in ventas_silenciadores for compatibility...');
  const { data: existingSilSales, error: silErr } = await db.from('ventas_silenciadores')
    .select('*')
    .like('notas', `%Venta POS #${saleId.slice(0, 8)}%`);

  if (silErr) throw silErr;
  if (existingSilSales && existingSilSales.length > 0) {
    console.log('Record in ventas_silenciadores already exists.');
  } else {
    const { data: newSilSale, error: insertSilErr } = await db.from('ventas_silenciadores')
      .insert({
        cantidad: 1,
        modelo: 'Silenciador CL40',
        fecha: new Date('2026-05-26T14:35:05.668Z').toISOString(),
        sede_id: cementerioSedeId,
        notas: `Venta POS #${saleId.slice(0, 8)} | Items: Silenciador CL40:40, Gomas varias:10 | Total: $50 (Efectivo USD) | Cliente: Antonio González | Vehículo: Hyundai Accent 2002 7A6A7DN | Cancela 50 Euros`,
        precio_registrado: 50
      })
      .select();

    if (insertSilErr) {
      console.error('Error creating record in ventas_silenciadores:', insertSilErr.message);
    } else {
      console.log('Successfully created record in ventas_silenciadores:', newSilSale);
    }
  }

  console.log('\n6. Updating activity log details if possible...');
  const { data: activityLogs } = await db.from('logs_actividad')
    .select('*')
    .eq('referencia_id', saleId);

  if (activityLogs && activityLogs.length > 0) {
    await db.from('logs_actividad')
      .update({
        detalles: `Cliente: Antonio González, Total: $50.00`
      })
      .eq('id', activityLogs[0].id);
    console.log('Activity log updated to reflect $50 total.');
  }

  console.log('\nDatabase fix complete!');
}

main().catch(console.error);
