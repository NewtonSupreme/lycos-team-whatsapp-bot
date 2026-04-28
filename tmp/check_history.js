
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkHistory(numbers) {
  for (const num of numbers) {
    console.log(`\n--- Historial para ${num} ---`);
    const { data: messages } = await supabase
      .from('mensajes_whatsapp')
      .select('body, tipo, created_at')
      .eq('from_number', num)
      .order('created_at', { ascending: true });

    if (messages) {
      messages.forEach(m => {
        console.log(`[${new Date(m.created_at).toLocaleString()}] ${m.tipo === 'entrante' ? 'C' : 'B'}: ${m.body.substring(0, 50)}${m.body.length > 50 ? '...' : ''}`);
      });
    }
    
    const { data: services } = await supabase
      .from('servicios')
      .select('descripcion, estado, created_at')
      .filter('vehiculos.clientes.telefono', 'eq', num); // Esto no funcionará directamente así en Supabase sin joins complejos o ids

    // Mejor buscar el cliente primero
    const { data: cliente } = await supabase
      .from('clientes')
      .select('id, nombre, apellido, vehiculos(id, marca, modelo, placa, servicios(descripcion, estado, created_at))')
      .eq('telefono', num)
      .single();

    if (cliente) {
      console.log(`Cliente: ${cliente.nombre} ${cliente.apellido}`);
      if (cliente.vehiculos) {
        cliente.vehiculos.forEach(v => {
          console.log(`Vehículo: ${v.marca} ${v.modelo} (${v.placa})`);
          if (v.servicios) {
            v.servicios.forEach(s => {
              console.log(`  Servicio: ${s.descripcion} [${s.estado}] (${new Date(s.created_at).toLocaleDateString()})`);
            });
          }
        });
      }
    }
  }
}

checkHistory(['584242954000', '584122042249', '584141978997']);
