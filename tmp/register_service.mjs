
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://svazupuylnaxqmtaastz.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_2ujV8BQOS3szAuqAWSXiDw_PLAVMG9h';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function registerMissingService() {
  const clienteNombre = "Jorge Muñoz";
  const vehiculoInfo = "Peugeot 206 HDi";
  const placa = "AC841AG";
  const descripcion = "Tubo de escape + Balanceo + Calibración de cauchos";
  const sedeId = "310595c5-5258-47fa-9b69-5ad9932685a7";

  try {
    // 1. Get/Create Client
    const { data: client, error: clientErr } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefono', '584146857440')
      .maybeSingle();

    let clientId = client?.id;
    if (!clientId) {
      const { data: newClient, error: newClientErr } = await supabase
        .from('clientes')
        .insert({ nombre: 'Jorge', apellido: 'Muñoz', telefono: '584146857440', sede_id: sedeId })
        .select('id').single();
      if (newClientErr) throw newClientErr;
      clientId = newClient.id;
    }

    // 2. Get/Create Vehicle
    const { data: veh, error: vehErr } = await supabase
      .from('vehiculos')
      .select('id')
      .eq('placa', placa)
      .maybeSingle();
      
    let vehicleId = veh?.id;
    if (!vehicleId) {
        const { data: newVeh, error: newVehErr } = await supabase
        .from('vehiculos')
        .insert({ cliente_id: clientId, placa: placa, marca: 'Peugeot', modelo: '206 HDi', anio: 2025, estado: 'activo', sede_id: sedeId })
        .select('id').single();
        if (newVehErr) throw newVehErr;
        vehicleId = newVeh.id;
    }


    // 3. Register Service
    const { data: newServ, error: servErr } = await supabase
      .from('servicios')
      .insert({
        cliente_id: clientId,
        vehiculo_id: vehicleId,
        nombre_cliente: clienteNombre,
        vehiculo_info: vehiculoInfo,
        placa: placa,
        descripcion: descripcion,
        estado: 'pendiente',
        tipo: 'otro',
        tipo_personalizado: 'Frenos y Lavado',
        sede_id: sedeId,
        fecha: new Date().toISOString().split('T')[0],
      })
      .select('id').single();

    if (servErr) throw servErr;
    console.log('✅ Servicio registrado exitosamente:', newServ.id);

  } catch (err) {
    console.error('❌ Error registrando servicio:', err);
  }
}

registerMissingService();
