
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const KEYWORDS = [
  'falla', 'fallo', 'falló', 'problema', 'error', 'no funciona', 'mal', 'malo', 'mala',
  'ruido', 'suena', 'sonido', 'ruidito', 'vibra', 'vibración', 'vibracion', 'golpe',
  'reclamo', 'queja', 'protesta', 'indignado', 'molesto', 'molesta', 'arrecho', 'arrecha', 'bravo', 'brava',
  'pesimo', 'pésimo', 'terrible', 'asco', 'porqueria', 'porquería', 'chapuza', 'cochinada',
  'garantia', 'garantía', 'respondan', 'atencion', 'atención', 'servicio',
  'estafa', 'robo', 'ladron', 'ladrones', 'caro', 'carisimo', 'carísimo',
  'sigue', 'volvio', 'volvió', 'peor', 'igual', 'nada que', 'remedio',
  'montaron', 'cambiaron', 'hicieron', 'pusieron', 'quedo', 'quedó', 'dejo', 'dejó',
  'suelto', 'partido', 'roto', 'rajado', 'fuga', 'humo', 'olor',
  'decepcion', 'decepción', 'estafadores', 'mal hecho', 'mal trabajo', 'mal servicio',
  'no me parece', 'no estoy de acuerdo', 'no resolvieron', 'perdida de tiempo', 'pérdida de tiempo',
  'carajo', 'mierda', 'coño', 'verga', 'no joda', 'no jodas' // Venezuelan common swear words indicating frustration
];

async function deepSearch() {
  console.log('🔍 INICIANDO BÚSQUEDA PROFUNDA DE QUEJAS Y FALLAS...\n');

  // 1. Obtener todos los mensajes entrantes
  let allIncoming = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('mensajes_whatsapp')
      .select('body, from_number, created_at, tipo, wa_message_id, cliente_id')
      .eq('tipo', 'entrante')
      .range(from, from + step - 1)
      .order('created_at', { ascending: false });
    if (error || !data || data.length === 0) break;
    allIncoming = allIncoming.concat(data);
    if (data.length < step) break;
    from += step;
  }

  console.log(`✅ Total de mensajes analizados: ${allIncoming.length}`);

  const complaints = allIncoming.filter(m => {
    const b = m.body.toLowerCase();
    // Excluir descripciones automáticas de imágenes que no sean críticas
    if (b.includes('descripción automática') && !b.includes('falla') && !b.includes('daño') && !b.includes('corrosión')) return false;
    return KEYWORDS.some(k => b.includes(k));
  });

  console.log(`✅ Se detectaron ${complaints.length} mensajes con términos de interés.\n`);

  // 2. Buscar transferencias a humano (indicador de problemas)
  console.log('🔍 Buscando conversaciones transferidas a humano...');
  const { data: humanConvs } = await supabase
    .from('conversaciones')
    .select('telefono, ultimo_mensaje, updated_at')
    .eq('estado', 'humano');

  if (humanConvs && humanConvs.length > 0) {
    console.log(`✅ ${humanConvs.length} conversaciones están en modo humano.`);
  }

  // 3. Buscar mensajes eliminados/pendientes con error
  console.log('🔍 Buscando errores en mensajes_pendientes_ia...');
  const { data: pendingErrors } = await supabase
    .from('mensajes_pendientes_ia')
    .select('*')
    .neq('status', 'completed');

  // 4. Reporte Agrupado por Cliente
  const reportByClient = {};

  complaints.forEach(m => {
    if (!reportByClient[m.from_number]) reportByClient[m.from_number] = { messages: [], humanMode: false };
    reportByClient[m.from_number].messages.push(m);
  });

  if (humanConvs) {
    humanConvs.forEach(c => {
      if (!reportByClient[c.telefono]) reportByClient[c.telefono] = { messages: [], humanMode: true };
      else reportByClient[c.telefono].humanMode = true;
    });
  }

  console.log('--- REPORTE DETALLADO GRUPAL ---\n');

  for (const [phone, data] of Object.entries(reportByClient)) {
    // Solo mostrar si tiene mensajes de queja o está en modo humano con algo sospechoso
    if (data.messages.length > 0 || data.humanMode) {
      console.log(`📌 CLIENTE: ${phone} ${data.humanMode ? '[MODO HUMANO ACTIVO]' : ''}`);
      
      // Obtener nombre si existe
      const { data: cliente } = await supabase.from('clientes').select('nombre, apellido').eq('telefono', phone).single();
      if (cliente) console.log(`   Nombre: ${cliente.nombre} ${cliente.apellido}`);

      data.messages.slice(0, 10).forEach(m => {
        console.log(`   - [${new Date(m.created_at).toLocaleString()}] "${m.body}"`);
      });
      console.log('--------------------------------------------------\n');
    }
  }

  if (pendingErrors && pendingErrors.length > 0) {
    console.log('❌ MENSAJES CON ERROR DE PROCESAMIENTO (Posibles eliminados o fallidos):');
    pendingErrors.forEach(e => {
      console.log(`   - [${e.created_at}] Tel: ${e.from_number} | Error: ${e.error_log}`);
    });
  }
}

deepSearch();
