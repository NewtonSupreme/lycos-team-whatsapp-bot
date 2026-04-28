
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findMoreComplaints() {
  console.log('--- Buscando Quejas Indirectas Avanzado ---\n');

  const { data: messages, error } = await supabase
    .from('mensajes_whatsapp')
    .select('body, from_number, created_at, tipo')
    .eq('tipo', 'entrante')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const keywords = [
    'semana pasada', 'hace dias', 'hace días', 'fui', 'vinieron', 'arreglaron',
    'detalle', 'quedo igual', 'quedó igual', 'sigue', 'pero', 'falla', 'mal', 
    'defectuoso', 'no sirve', 'vuelve a', 'ruidito', 'vibrando'
  ];

  const results = messages.filter(m => {
    const b = m.body.toLowerCase();
    // Case 1: Example pattern
    if (b.includes('semana') && b.includes('cambiaron') && b.includes('no')) return true;
    // Case 2: Past reference + dissapointment
    const pastRef = /semana|ayer|dia|día|fui|vinieron|pusieron|hicieron/i.test(b);
    const discontent = /no|detalle|igual|sigue|pero|falla|ruido|sonido/i.test(b);
    return pastRef && discontent;
  });

  console.log(`Se encontraron ${results.length} coincidencias:\n`);
  results.forEach(m => {
    console.log(`- [${new Date(m.created_at).toLocaleString()}] ${m.from_number}: "${m.body}"`);
  });
}

findMoreComplaints();
