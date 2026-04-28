
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findSubtleComplaints() {
  console.log('--- Buscando Quejas Indirectas (Semana Pasada / Detalle / Sigue Igual) ---\n');

  let allMessages = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('mensajes_whatsapp')
      .select('body, from_number, created_at, tipo, wa_message_id')
      .eq('tipo', 'entrante')
      .range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    allMessages = allMessages.concat(data);
    if (data.length < step) break;
    from += step;
  }

  const subtlePatterns = [
    /semana pasada/i,
    /hace.*dias/i,
    /hace.*días/i,
    /el.*dia/i,
    /el.*día/i,
    /ayer/i,
    /vinieron/i,
    /vino/i,
    /fui/i,
    /fuimos/i,
    /montaron/i,
    /pusieron/i,
    /cambiaron/i,
    /no arreglaron/i,
    /no resolvieron/i,
    /no lo arreglaron/i,
    /no quedo/i,
    /no quedó/i,
    /detalle/i,
    /vuelve a/i,
    /vuelve/i,
    /quedo igual/i,
    /quedó igual/i,
    /sigue/i,
    /pero/i
  ];

  const results = allMessages.filter(m => {
    const b = m.body.toLowerCase();
    // Requisito: una referencia temporal/acción pasada + una palabra de "insatisfacción"
    const hasPastRef = /semana|ayer|dia|día|fui|vino|vinieron|montaron|pusieron|cambiaron/i.test(b);
    const hasIssueRef = /no|detalle|igual|sigue|pero|falla|ruido|sonido|garantia|garantía/i.test(b);
    
    // El ejemplo del usuario: "La semana pasada cambiaron silenciador y no arreglaron ese detalle"
    if (b.includes('semana') && b.includes('cambiaron') && b.includes('no')) return true;
    
    return hasPastRef && hasIssueRef;
  });

  console.log(`Se encontraron ${results.length} posibles quejas sutiles:\n`);

  results.forEach((m, i) => {
    console.log(`${i+1}. [${new Date(m.created_at).toLocaleString()}] ${m.from_number}: "${m.body}"`);
  });
}

findSubtleComplaints();
