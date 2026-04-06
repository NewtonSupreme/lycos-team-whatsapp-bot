import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const rpID = process.env.NODE_ENV === 'production' ? 'lycos-team-whatsapp-bot.vercel.app' : 'localhost';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email o usuario requerido' }, { status: 400 });
    }

    const username = email.toLowerCase().trim().replace('@lycosteam.com', '');

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Base de datos no configurada' }, { status: 500 });
    }

    // Get user's credentials
    const { data: credentials, error: credError } = await db
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', username);

    if (credError) {
      console.error('Error fetching credentials:', credError);
      return NextResponse.json({ error: 'Error al verificar credenciales', details: credError.message }, { status: 500 });
    }

    if (!credentials || credentials.length === 0) {
      return NextResponse.json({ error: 'No tienes biometría configurada. Inicia sesión con contraseña y actívala.' }, { status: 404 });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: (credentials || []).map(c => ({
        id: c.credential_id as string,
        type: 'public-key' as const,
        transports: c.transports ? JSON.parse(c.transports as string) as AuthenticatorTransportFuture[] : undefined,
      })),
      userVerification: 'preferred',
    });

    // Save challenge
    await db.from('webauthn_challenges').upsert({
      username,
      challenge: options.challenge,
      created_at: new Date().toISOString()
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('WebAuthn Auth Options Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal Server Error', details: msg }, { status: 500 });
  }
}
