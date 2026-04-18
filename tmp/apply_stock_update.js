
const { createClient } = require('@supabase/supabase-js');

const url = "https://svazupuylnaxqmtaastz.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YXp1cHV5bG5heHFtdGFhc3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MTUxMjYsImV4cCI6MjA4OTI5MTEyNn0.l_rCrXM0qmMSU6ZMkv_9aP4vQbJR3m02prauifyo09o";

async function runUpdate() {
  const db = createClient(url, key);
  
  const updates = [
    { nombre: 'Silenciador CL40', stock: 5 },
    { nombre: 'Silenciador CL60', stock: 3 },
    { nombre: 'Resonador', stock: 5 },
    { nombre: 'Silenciador CL27', stock: 5 },
    { nombre: 'Silenciador CLK60', stock: 1 }
  ];

  console.log('🚀 Iniciando actualización manual de stock...');

  for (const item of updates) {
    const { data: existing } = await db.from('inventario')
      .select('id, stock')
      .ilike('nombre', `%${item.nombre}%`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await db.from('inventario')
        .update({ 
          stock: item.stock,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      if (error) {
        console.error(`❌ Error actualizando ${item.nombre}:`, error.message);
      } else {
        console.log(`✅ ${item.nombre}: Stock actualizado a ${item.stock}`);
      }
    } else {
      console.warn(`⚠️ No se encontró el producto: ${item.nombre}`);
    }
  }

  console.log('🏁 Proceso finalizado.');
}

runUpdate();
