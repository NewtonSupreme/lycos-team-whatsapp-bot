
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function finalReport() {
  console.log('REPORTE DE RECLAMOS Y FALLAS IDENTIFICADAS\n');

  const { data: messages, error } = await supabase
    .from('mensajes_whatsapp')
    .select(`
      body, 
      from_number, 
      created_at,
      clientes (
        nombre, 
        apellido,
        vehiculos (marca, modelo, placa)
      )
    `)
    .eq('tipo', 'entrante')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const suspiciousTerms = [
    'suena', 'ruido', 'falla', 'falló', 'mal', 'problema', 
    'garantia', 'garantía', 'reclamo', 'queja', 'vibracion', 
    'golpe', 'no funciona', 'caro', 'molesto', 'peor', 'sigue'
  ];

  const results = messages.filter(m => {
    const b = m.body.toLowerCase();
    // Evitar mensajes de descripción de imagen si son informativos
    if (b.includes('descripción automática') && !b.includes('falla') && !b.includes('daño')) return false;
    return suspiciousTerms.some(t => b.includes(t));
  });

  results.forEach((m, i) => {
    const c = m.clientes || {};
    const v = c.vehiculos && c.vehiculos.length > 0 ? c.vehiculos[0] : null;
    const nombre = c.nombre ? `${c.nombre} ${c.apellido || ''}` : 'No Registrado';
    const vehiculo = v ? `${v.marca} ${v.modelo} [${v.placa}]` : 'No Identificado';
    const fecha = new Date(m.created_at).toLocaleString('es-VE', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });

    console.log(`--- RECLAMO/FALLA #${i + 1} ---`);
    console.log(`NOMBRE: ${nombre}`);
    console.log(`NÚMERO: ${m.from_number}`);
    console.log(`FECHA/HORA: ${fecha}`);
    console.log(`VEHÍCULO: ${vehiculo}`);
    console.log(`CONVERSACIÓN: "${m.body}"`);
    console.log('-------------------------------------------\n');
  });
}

finalReport();
