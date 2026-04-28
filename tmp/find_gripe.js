
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findHardcoreGripes() {
  console.log('--- Búsqueda Exhaustiva de Reclamos/Quejas ---\n');

  // Buscamos literalmente cualquier mensaje que contenga palabras de queja fuerte
  const searchTerms = ['mal montada', 'mal montado', 'quedo mal', 'quedó mal', 'sigue sonando', 'sigue el ruido', 'volvio a sonar', 'volvió a sonar', 'garantia', 'garantía', 'reclamo', 'queja', 'no estoy contento', 'servicio malo', 'atencion mala', 'devuelvan', 'fui ayer', 'estafadores', 'chapuza'];
  
  const { data: messages, error } = await supabase
    .from('mensajes_whatsapp')
    .select('body, from_number, created_at, tipo')
    .eq('tipo', 'entrante');

  if (error) return;

  const matches = messages.filter(m => {
    const b = m.body.toLowerCase();
    return searchTerms.some(t => b.includes(t));
  });

  console.log(`Coincidencias encontradas: ${matches.length}\n`);

  matches.forEach((m, i) => {
    console.log(`${i+1}. [${new Date(m.created_at).toLocaleString()}] ${m.from_number}: "${m.body}"`);
  });
}

findHardcoreGripes();
