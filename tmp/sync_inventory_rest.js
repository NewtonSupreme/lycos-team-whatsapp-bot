const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  console.log('🔄 Sincronizando vía REST API...');
  
  for (const item of itemsToSync) {
    try {
      // 1. Buscar
      const respSearch = await fetch(`${supabaseUrl}/rest/v1/inventario?codigo=eq.${encodeURIComponent(item.codigo)}&select=id`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      const results = await respSearch.json();

      if (results && results.length > 0) {
        // UPDATE
        await fetch(`${supabaseUrl}/rest/v1/inventario?id=eq.${results[0].id}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            nombre: item.nombre,
            precio_usd: item.precio_usd,
            categoria: item.categoria,
            descripcion: item.descripcion,
            activo: true,
            updated_at: new Date().toISOString()
          })
        });
        console.log(`✅ [UP] ${item.nombre}`);
      } else {
        // INSERT
        await fetch(`${supabaseUrl}/rest/v1/inventario`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            ...item,
            activo: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        });
        console.log(`✨ [NEW] ${item.nombre}`);
      }
    } catch (e) {
      console.log(`❌ Error con ${item.nombre}: ${e.message}`);
    }
  }
}

sync();
