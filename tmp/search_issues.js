
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Faltan las variables de entorno de Supabase.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function searchIssues() {
  console.log('--- Buscando mensajes con problemas o reclamos ---');
  console.log(`URL: ${supabaseUrl}`);

  const keywords = [
    'mal montado', 'sigue sonando', 'quedó mal', 'garantia', 'garantía',
    'reclamo', 'queja', 'no estoy conforme', 'devolvieron', 'fallando de nuevo',
    'problema con el servicio', 'servicio mal', 'atencion mala', 'atención mala',
    'no sirve', 'se solto', 'se soltó', 'vuelve a sonar', 'ruido despues',
    'ruido después', 'mal hecho', 'chapuza', 'cochinada', 'decepción',
    'estoy molesto', 'estoy brava', 'estoy bravo', 'perdida de tiempo',
    'pérdida de tiempo', 'no resolvieron', 'sigue igual', 'peor que antes'
  ];

  // Filtro simplificado primero para ver si hay mensajes entrantes
  const { count, error: countError } = await supabase
    .from('mensajes_whatsapp')
    .select('*', { count: 'exact', head: true })
    .eq('tipo', 'entrante');

  if (countError) {
    console.error('Error al conectar con Supabase:', countError);
    return;
  }

  console.log(`Mensajes entrantes totales en la base de datos: ${count}`);

  const orFilter = keywords.map(kw => `body.ilike.%${kw}%`).join(',');

  const { data, error } = await supabase
    .from('mensajes_whatsapp')
    .select(`
      created_at,
      body,
      from_number,
      cliente_id,
      clientes (
        nombre,
        apellido,
        telefono,
        vehiculos (
          marca,
          modelo,
          placa
        )
      )
    `)
    .eq('tipo', 'entrante')
    .or(orFilter)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al buscar mensajes:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('No se encontraron mensajes que coincidan con los criterios de búsqueda.');
    return;
  }

  console.log(`Se encontraron ${data.length} mensajes potenciales:\n`);

  data.forEach((msg, index) => {
    const cliente = msg.clientes;
    const nombreCompleto = cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido';
    let vehiculosInfo = 'No registrado';
    if (cliente && cliente.vehiculos && cliente.vehiculos.length > 0) {
      vehiculosInfo = cliente.vehiculos.map(v => `${v.marca} ${v.modelo} (${v.placa})`).join(', ');
    }

    const fecha = new Date(msg.created_at).toLocaleString('es-VE');

    console.log(`${index + 1}. [${fecha}]`);
    console.log(`   Cliente: ${nombreCompleto} (${msg.from_number})`);
    console.log(`   Vehículo: ${vehiculosInfo}`);
    console.log(`   Mensaje: "${msg.body}"`);
    console.log('--------------------------------------------------');
  });
}

searchIssues().catch(err => {
  console.error('Error no capturado:', err);
});
