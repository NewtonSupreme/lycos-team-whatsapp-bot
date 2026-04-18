const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const itemsToSync = [
  { nombre: 'Silenciador CL27 / CL30', categoria: 'silenciador', precio_usd: 40, stock: 10, codigo: 'CL27/30', descripcion: 'Motores hasta 1.3L. Instalación incluida.' },
  { nombre: 'Silenciador CL40', categoria: 'silenciador', precio_usd: 50, stock: 10, codigo: 'CL40', descripcion: 'Motores hasta 1.5L. Instalación incluida.' },
  { nombre: 'Silenciador CLH40', categoria: 'silenciador', precio_usd: 60, stock: 10, codigo: 'CLH40', descripcion: 'Motores 1.6L hasta 2.0L. Instalación incluida.' },
  { nombre: 'Silenciador CL60', categoria: 'silenciador', precio_usd: 90, stock: 10, codigo: 'CL60', descripcion: 'Motores desde 3.8L en adelante. Instalación incluida.' },
  { nombre: 'Silenciador CLK60', categoria: 'silenciador', precio_usd: 100, stock: 10, codigo: 'CLK60', descripcion: 'Fabricación especial para Sportage, Tucson, Caliber.' },
  { nombre: 'Resonador', categoria: 'resonador', precio_usd: 40, stock: 10, codigo: 'RESONADOR', descripcion: 'Instalación incluida.' },
  { nombre: 'Flowmaster Serie 40', categoria: 'silenciador', precio_usd: 140, stock: 5, codigo: 'FM40', descripcion: 'Instalación incluida, flexibles doble malla.' },
  { nombre: 'Flexible doble malla', categoria: 'flexible', precio_usd: 40, stock: 15, codigo: 'FLEX', descripcion: 'Instalación incluida.' },
  { nombre: 'Terminal de dirección', categoria: 'frenos', precio_usd: 15, stock: 20, codigo: 'TERM', descripcion: 'Precio por lado.' },
  { nombre: 'Rótula', categoria: 'frenos', precio_usd: 20, stock: 20, codigo: 'ROT', descripcion: 'Precio por lado.' },
  { nombre: 'Amortiguador', categoria: 'frenos', precio_usd: 40, stock: 12, codigo: 'AMORT', descripcion: 'Precio unitario. Promoción en divisas.' },
  { nombre: 'Alineación Carros', categoria: 'general', precio_usd: 15, stock: 100, codigo: 'ALIN-C', descripcion: 'Sedán / Carros pequeños.' },
  { nombre: 'Alineación EcoSport', categoria: 'general', precio_usd: 20, stock: 100, codigo: 'ALIN-E', descripcion: 'EcoSport.' },
  { nombre: 'Alineación Camioneta 4x4', categoria: 'general', precio_usd: 25, stock: 100, codigo: 'ALIN-T', descripcion: 'Camionetas grandes / 4x4.' },
  { nombre: 'Balanceo Carros', categoria: 'general', precio_usd: 5, stock: 100, codigo: 'BAL-C', descripcion: 'Precio unitario.' },
  { nombre: 'Balanceo Camionetas', categoria: 'general', precio_usd: 10, stock: 100, codigo: 'BAL-T', descripcion: 'Precio unitario.' },
  { nombre: 'Montura Carros', categoria: 'general', precio_usd: 5, stock: 100, codigo: 'MONT-C', descripcion: 'Precio unitario.' },
  { nombre: 'Montura Camionetas', categoria: 'general', precio_usd: 10, stock: 100, codigo: 'MONT-T', descripcion: 'Precio unitario.' },
  { nombre: 'Lavadito Exterior Carros', categoria: 'general', precio_usd: 5, stock: 100, codigo: 'WASH-E-C', descripcion: 'Solo exterior.' },
  { nombre: 'Lavadito Exterior Camionetas', categoria: 'general', precio_usd: 13, stock: 100, codigo: 'WASH-E-T', descripcion: 'Solo exterior.' },
  { nombre: 'Lavado Completo Carros', categoria: 'general', precio_usd: 10, stock: 100, codigo: 'WASH-F-C', descripcion: 'Interior y exterior.' },
  { nombre: 'Lavado Completo Camionetas', categoria: 'general', precio_usd: 15, stock: 100, codigo: 'WASH-F-T', descripcion: 'Interior y exterior.' },
  { nombre: 'Detailing Carros', categoria: 'general', precio_usd: 60, stock: 10, codigo: 'DET-C', descripcion: 'Limpieza profunda.' },
  { nombre: 'Detailing Camionetas', categoria: 'general', precio_usd: 100, stock: 10, codigo: 'DET-T', descripcion: 'Limpieza profunda.' },
  { nombre: 'Elevavidrios', categoria: 'electrico', precio_usd: 40, stock: 10, codigo: 'ELEV', descripcion: 'Manual o eléctrico.' },
  { nombre: 'Display Ford Fiesta', categoria: 'electrico', precio_usd: 60, stock: 5, codigo: 'DISP-F', descripcion: 'Kilometraje / Gasolina.' },
  { nombre: 'OBD I', categoria: 'electrico', precio_usd: 20, stock: 100, codigo: 'OBDI', descripcion: 'Escaneo OBD I.' },
  { nombre: 'Certificado Médico', categoria: 'general', precio_usd: 15, stock: 100, codigo: 'CERT-M', descripcion: 'Vial.' },
];

async function sync() {
  console.log('🔄 Sincronizando...');
  
  for (const item of itemsToSync) {
    try {
      // 1. Buscar por CODIGO
      const { data: results, error } = await supabase.from('inventario').select('id').eq('codigo', item.codigo);
      if (error) {
         console.log(`❌ Error al buscar ${item.codigo}: ${error.message}`);
         continue;
      }

      if (results && results.length > 0) {
        // UPDATE
        const { error: updErr } = await supabase.from('inventario').update({
          nombre: item.nombre,
          precio_usd: item.precio_usd,
          categoria: item.categoria,
          descripcion: item.descripcion,
          activo: true
        }).eq('id', results[0].id);
        if (updErr) console.log(`❌ Error update ${item.nombre}: ${updErr.message}`);
        else console.log(`✅ [UP] ${item.nombre}`);
      } else {
        // 2. Buscar por NOMBRE
        const { data: resultsName, error: errName } = await supabase.from('inventario').select('id').eq('nombre', item.nombre);
        if (resultsName && resultsName.length > 0) {
          const { error: updErr } = await supabase.from('inventario').update({
            codigo: item.codigo,
            precio_usd: item.precio_usd,
            categoria: item.categoria,
            descripcion: item.descripcion,
            activo: true
          }).eq('id', resultsName[0].id);
          if (updErr) console.log(`❌ Error update N ${item.nombre}: ${updErr.message}`);
          else console.log(`✅ [UP-N] ${item.nombre}`);
        } else {
          // 3. INSERT
          const { error: insErr } = await supabase.from('inventario').insert([item]);
          if (insErr) console.log(`❌ Error insert ${item.nombre}: ${insErr.message}`);
          else console.log(`✨ [NEW] ${item.nombre}`);
        }
      }
    } catch (e) {
      console.log(`❌ Excepción con ${item.nombre}: ${e.message}`);
    }
  }
  console.log('Sincronización finalizada.');
}

// Pequeno delay para asegurar que el cliente este listo? (aunque no deberia ser necesario)
setTimeout(sync, 500);
