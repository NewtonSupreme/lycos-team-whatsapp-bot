import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(url!, key!);

export async function GET() {
  try {
    const { data: columns, error: colErr } = await db
      .from('information_schema.columns')
      .select('table_name, column_name, data_type')
      .in('table_name', ['webauthn_credentials', 'webauthn_challenges'])
      .order('table_name')
      .order('ordinal_position');

    const { data: testCred, error: testCredErr } = await db
      .from('webauthn_credentials')
      .select('*')
      .limit(1);

    const { data: testChall, error: testChallErr } = await db
      .from('webauthn_challenges')
      .select('*')
      .limit(1);

    return NextResponse.json({
      columns: columns || [],
      webauthn_credentials: { data: testCred, error: testCredErr?.message },
      webauthn_challenges: { data: testChall, error: testChallErr?.message }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}