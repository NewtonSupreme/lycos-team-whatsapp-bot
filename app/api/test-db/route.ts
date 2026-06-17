import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sb = createClient(url!, serviceKey!);

  const { data: v } = await sb.from('ventas_dia').select('*').ilike('cliente', '%rafael%').order('created_at', { ascending: false }).limit(5);
  const { data: f } = await sb.from('facturas').select('*').ilike('cliente', '%rafael%').order('created_at', { ascending: false }).limit(5);
  return NextResponse.json({ v, f });
}
