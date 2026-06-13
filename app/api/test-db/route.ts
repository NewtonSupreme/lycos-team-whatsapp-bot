import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sb = createClient(url!, serviceKey!);

  const { data, error } = await sb.from('usuarios').select('*').limit(1);
  return NextResponse.json({ data, error });
}
