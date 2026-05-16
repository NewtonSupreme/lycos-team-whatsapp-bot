import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { error: e1 } = await sb.from('ventas_silenciadores').select('tasa_cambio').limit(1);
console.log('tasa_cambio:', e1 ? 'MISSING - ' + e1.message : 'EXISTS');

const { error: e2 } = await sb.from('cierres_caja').select('id').limit(1);
console.log('cierres_caja:', e2 ? 'MISSING - ' + e2.message : 'EXISTS');
