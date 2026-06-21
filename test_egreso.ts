import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
  console.log("Inserting test egreso...");
  const { data, error } = await supabase.from('egresos').insert({
    fecha: new Date().toISOString().split('T')[0],
    cliente: 'Test Cliente',
    categoria: 'otro',
    total_egresos: 100,
    notas: 'Test',
    desglose: [{ descripcion: 'Test item', cantidad: 1, precio_unitario: 100, total: 100 }],
    creado_por: 'Admin',
    sede_id: '310595c5-5258-47fa-9b69-5ad9932685a7'
  }).select();
  
  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Insert success:", data);
  }
}

main();
