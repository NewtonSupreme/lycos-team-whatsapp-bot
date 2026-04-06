import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const rpName = 'Lycos Team CRM';
const rpID = process.env.NODE_ENV === 'production' ? 'lycos-team-whatsapp-bot.vercel.app' : 'localhost';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('lycos_session')?.value;

    if (!username) {
      return NextResponse.json({ error: 'No autorizado. Sesión no encontrada.' }, { status: 401 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Base de datos no configurada' }, { status: 500 });
    }

    const { data: credData, error: credErr } = await db
      .from('webauthn_credentials')
      .select('id, credential_id, username')
      .eq('username', username);
    
    if (credErr) {
      return NextResponse.json({ 
        error: 'Error_DB_Credentials', 
        message: credErr.message,
        code: credErr.code,
        details: credErr.details
      }, { status: 500 });
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(username),
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      excludeCredentials: (credData || []).map(c => ({
        id: c.credential_id,
        type: 'public-key' as const,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const { error: challengeErr } = await db.from('webauthn_challenges').upsert({
      username,
      challenge: options.challenge,
      created_at: new Date().toISOString()
    });
    
    if (challengeErr) {
      return NextResponse.json({ 
        error: 'Error_DB_Challenge', 
        message: challengeErr.message,
        code: challengeErr.code
      }, { status: 500 });
    }

    return NextResponse.json(options);
  } catch (error) {
    console.error('WebAuthn Reg Options Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal Server Error', details: msg }, { status: 500 });
  }
}
