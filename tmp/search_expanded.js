
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function searchServiceIssues() {
  console.log('--- Buscando problemas en Servicios y Diagnósticos ---\n');

  const keywords = ['falla', 'mal', 'suena', 'ruido', 'reclamo', 'queja', 'garantía', 'problema', 'pendiente', 'cancelado', 'error'];
  const orFilterBody = keywords.map(kw => `body.ilike.%${kw}%`).join(',');
  const orFilterServicios = keywords.map(kw => `notas.ilike.%${kw}%`).join(',');

  console.log('1. Buscando en mensajes de WhatsApp (ampliado)...');
  const { data: messages, error: msgError } = await supabase
    .from('mensajes_whatsapp')
    .select(`
      created_at, body, from_number,
      clientes (nombre, apellido, vehiculos (marca, modelo, placa))
    `)
    .eq('tipo', 'entrante')
    .or(`body.ilike.%suena%,body.ilike.%ruido%,body.ilike.%mal%,body.ilike.%falla%,body.ilike.%garantia%,body.ilike.% reclamo%,body.ilike.%queja%`)
    .order('created_at', { ascending: false });

  if (messages) {
    console.log(`Encontrados ${messages.length} mensajes relevantes.\n`);
    messages.slice(0, 15).forEach((m, i) => {
      const c = m.clientes;
      const v = c && c.vehiculos ? c.vehiculos.map(vh => `${vh.marca} ${vh.modelo}`).join(', ') : 'N/A';
      console.log(`${i+1}. [${new Date(m.created_at).toLocaleString()}] ${c ? c.nombre : '?'}: "${m.body}" (${v})`);
    });
  }

  console.log('\n2. Buscando en Notas de Servicios...');
  const { data: services, error: srvError } = await supabase
    .from('servicios')
    .select(`
      id, descripcion, notas, estado, created_at,
      vehiculos (marca, modelo, placa, clientes (nombre, apellido, telefono))
    `)
    .or(`notas.ilike.%mal%,notas.ilike.%falla%,notas.ilike.%ruido%,notas.ilike.%garantia%,notas.ilike.%problema%,notas.ilike.%reclamo%`);

  if (services && services.length > 0) {
    console.log(`Encontrados ${services.length} servicios con notas de problemas.\n`);
    services.forEach((s, i) => {
      const v = s.vehiculos;
      const c = v ? v.clientes : null;
      console.log(`${i+1}. [${new Date(s.created_at).toLocaleString()}] ${c ? c.nombre + ' ' + c.apellido : '?'}: Serv: ${s.descripcion} - Nota: "${s.notas}" (${v ? v.marca + ' ' + v.modelo : '?'})`);
    });
  } else {
    console.log('No se encontraron servicios con notas de problemas.');
  }

  console.log('\n3. Buscando en Diagnósticos...');
  const { data: diags, error: diagError } = await supabase
    .from('diagnosticos')
    .select(`
      descripcion, recomendaciones, created_at,
      vehiculos (marca, modelo, placa, clientes (nombre, apellido, telefono))
    `)
    .or(`descripcion.ilike.%falla%,descripcion.ilike.%problema%,recomendaciones.ilike.%garantia%,descripcion.ilike.%ruido%`);

  if (diags && diags.length > 0) {
    console.log(`Encontrados ${diags.length} diagnósticos con fallas.\n`);
    diags.forEach((d, i) => {
      const v = d.vehiculos;
      const c = v ? v.clientes : null;
      console.log(`${i+1}. [${new Date(d.created_at).toLocaleString()}] ${c ? c.nombre : '?'}: Diag: ${d.descripcion} - Rec: ${d.recomendaciones} (${v ? v.marca : '?'})`);
    });
  } else {
    console.log('No se encontraron diagnósticos con esas palabras.');
  }
}

searchServiceIssues();
