const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing credentials");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const payload = {
  fecha: '2026-06-20',
  cliente: 'Erlis Supervisor',
  categoria: 'otro',
  total_egresos: 70,
  notas: 'Egreso manual recuperado (Erlis Supervisor)',
  desglose: [{ descripcion: 'Egreso manual', cantidad: 1, precio_unitario: 70, total: 70 }],
  creado_por: 'Erlis Supervisor',
  sede_id: '310595c5-5258-47fa-9b69-5ad9932685a7'
};

async function insert() {
  const { data, error } = await supabase.from('egresos').insert(payload).select();
  if (error) {
    console.error("Error inserting:", error);
  } else {
    console.log("Success:", data);
  }
}

insert();
