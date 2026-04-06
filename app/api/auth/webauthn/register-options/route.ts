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

// RP = Relying Party
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

    // Get current credentials to avoid registering the same device twice
    console.log('Checking existing credentials for username:', username);
    const { data: credentials, error: credError } = await db
      .from('webauthn_credentials')
      .select('credential_id')
      .eq('username', username);
    
    if (credError) {
      console.error('Error fetching credentials:', credError);
      return NextResponse.json({ error: 'Error al verificar credenciales', details: credError.message }, { status: 500 });
    }
    
    console.log('Found credentials:', credentials);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(username), // Encode as Uint8Array
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      excludeCredentials: (credentials || []).map(c => ({
        id: c.credential_id as string,
        type: 'public-key' as const,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Save challenge to verify later
    await db.from('webauthn_challenges').upsert({
      username,
      challenge: options.challenge,
      created_at: new Date().toISOString()
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('WebAuthn Reg Options Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal Server Error', details: msg }, { status: 500 });
  }
}
