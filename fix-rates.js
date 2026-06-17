require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');

(async () => {
  const CORRECT_RATE = 592.52;
  const TARGET_DATE = '2026-06-16T22:00:00.000Z';

  // 1. Update Facturas
  const { data: facturas } = await sb.from('facturas').select('id, total').eq('created_at', TARGET_DATE);
  if (facturas) {
    for (const f of facturas) {
      await sb.from('facturas').update({
        tasa_cambio: CORRECT_RATE,
        total_bs: f.total * CORRECT_RATE
      }).eq('id', f.id);
    }
    console.log(`Updated ${facturas.length} facturas to rate ${CORRECT_RATE}`);
  }

  // 2. Update Ventas Dia
  const { data: ventas } = await sb.from('ventas_dia').select('id').eq('created_at', TARGET_DATE);
  if (ventas) {
    for (const v of ventas) {
      await sb.from('ventas_dia').update({
        tasa_cambio: CORRECT_RATE
      }).eq('id', v.id);
    }
    console.log(`Updated ${ventas.length} ventas_dia to rate ${CORRECT_RATE}`);
  }
})();
