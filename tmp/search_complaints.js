
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findDissatisfiedCustomers() {
  console.log('--- Buscando Clientes Insatisfechos o Reclamos Post-Servicio ---\n');

  // Buscamos mensajes que contengan palabras de queja o referencia a un servicio previo
  const complaintKeywords = [
    'mal', 'sigue', 'suena', 'ruido', 'garantia', 'garantía', 
    'reclamo', 'queja', 'volvio', 'volvió', 'peor', 'fallando',
    'montaron', 'pusieron', 'hicieron', 'ayer', 'ustedes',
    'no funciona', 'falló', 'falla', 'descontento', 'molesto'
  ];

  const { data: messages, error } = await supabase
    .from('mensajes_whatsapp')
    .select(`
      id, body, from_number, created_at,
      clientes (
        nombre, apellido, telefono,
        vehiculos (marca, modelo, placa)
      )
    `)
    .eq('tipo', 'entrante')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const results = [];

  messages.forEach(m => {
    const body = m.body.toLowerCase();
    
    // Filtro manual más inteligente
    const isComplaint = (
      (body.includes('mal') && (body.includes('montado') || body.includes('quedo') || body.includes('quedó') || body.includes('servicio'))) ||
      (body.includes('sigue') && (body.includes('sonando') || body.includes('ruido') || body.includes('igual') || body.includes('falla'))) ||
      (body.includes('garantia') || body.includes('garantía')) ||
      (body.includes('reclamo') || body.includes('queja')) ||
      (body.includes('ustedes') && (body.includes('mal') || body.includes('problema') || body.includes('falló'))) ||
      (body.includes('ayer') && (body.includes('fui') || body.includes('montaron')) && (body.includes('suena') || body.includes('ruido')))
    );

    if (isComplaint) {
      results.push(m);
    }
  });

  console.log(`Se analizaron ${messages.length} mensajes. Se encontraron ${results.length} coincidencias sospechosas de ser reclamos.\n`);

  results.forEach((m, i) => {
    const c = m.clientes || {};
    const v = c.vehiculos && c.vehiculos.length > 0 ? c.vehiculos[0] : null;
    const fecha = new Date(m.created_at).toLocaleString('es-VE');

    console.log(`${i+1}. [${fecha}]`);
    console.log(`   Cliente: ${c.nombre || 'Desconocido'} ${c.apellido || ''} (${m.from_number})`);
    console.log(`   Vehículo: ${v ? v.marca + ' ' + v.modelo + ' (' + v.placa + ')' : 'No registrado'}`);
    console.log(`   Mensaje: "${m.body}"`);
    console.log('--------------------------------------------------');
  });
  
  if (results.length === 0) {
    console.log('No se encontraron reclamos claros con los filtros actuales. Probando búsqueda de "suena" después de un servicio...');
    // Opcional: buscar si el mismo número tiene un servicio previo y luego mandó un "suena"
  }
}

findDissatisfiedCustomers();
