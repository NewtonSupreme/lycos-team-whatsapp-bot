
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function globalSearch() {
  console.log('--- Búsqueda Global de Problemas/Fallas/Quejas ---\n');

  const keywords = ['falla', 'suena', 'ruido', 'mal', 'problema', 'garantia', 'garantía', 'reclamo', 'queja', 'error', 'fallo', 'falló'];
  
  let allMessages = [];
  let from = 0;
  const step = 1000;
  
  // Paginación para obtener más de 1000
  while (true) {
    const { data, error } = await supabase
      .from('mensajes_whatsapp')
      .select(`
        body, from_number, created_at,
        clientes (nombre, apellido, vehiculos (marca, modelo, placa))
      `)
      .eq('tipo', 'entrante')
      .range(from, from + step - 1)
      .order('created_at', { ascending: false });

    if (error) break;
    if (!data || data.length === 0) break;
    
    allMessages = allMessages.concat(data);
    if (data.length < step) break;
    from += step;
    if (from > 5000) break; // Límite de seguridad
  }

  console.log(`Mensajes analizados: ${allMessages.length}`);

  const found = allMessages.filter(m => {
    const b = m.body.toLowerCase();
    return keywords.some(k => b.includes(k));
  });

  console.log(`Mensajes con palabras clave: ${found.length}\n`);

  found.forEach((m, i) => {
    const c = m.clientes || {};
    const vs = c.vehiculos || [];
    const vInfo = vs.length > 0 ? vs.map(v => `${v.marca} ${v.modelo} (${v.placa})`).join('|') : 'N/A';
    console.log(`${i+1}. [${new Date(m.created_at).toLocaleString()}] ${c.nombre || '?'}: "${m.body}" [Tel: ${m.from_number}] [Veh: ${vInfo}]`);
  });
}

globalSearch();
