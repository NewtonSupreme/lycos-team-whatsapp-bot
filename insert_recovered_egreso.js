const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing environment variables");
  process.exit(1);
}

const payload = {
  fecha: '2026-06-20',
  cliente: 'Egreso Recuperado',
  categoria: 'otro',
  total_egresos: 70,
  notas: 'Egreso manual recuperado de log de actividad (Erlis Supervisor)',
  desglose: [{ descripcion: 'Egreso manual recuperado', cantidad: 1, precio_unitario: 70, total: 70 }],
  creado_por: 'Erlis Supervisor',
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
.then(async r => {
  if (!r.ok) {
    const err = await r.json();
    throw new Error(JSON.stringify(err));
  }
  return r.json();
})
.then(data => {
  console.log("SUCCESS");
  console.log(JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error("ERROR:", err.message);
});
