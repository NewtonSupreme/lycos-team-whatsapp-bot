const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing environment variables");
  process.exit(1);
}

const payload = {
  fecha: new Date().toISOString().split('T')[0],
  cliente: 'Test Cliente',
  categoria: 'otro',
  total_egresos: 100,
  notas: 'Test',
  desglose: [{ descripcion: 'Test item', cantidad: 1, precio_unitario: 100, total: 100 }],
  creado_por: 'Admin',
  sede_id: '310595c5-5258-47fa-9b69-5ad9932685a7'
};

fetch(`${SUPABASE_URL}/rest/v1/egresos`, {
  method: 'POST',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify(payload)
})
.then(r => r.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
