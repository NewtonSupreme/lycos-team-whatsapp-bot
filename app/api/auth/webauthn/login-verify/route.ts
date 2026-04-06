import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const rpID = process.env.NODE_ENV === 'production' ? 'lycos-team-whatsapp-bot.vercel.app' : 'localhost';
const origin = process.env.NODE_ENV === 'production' ? 'https://lycos-team-whatsapp-bot.vercel.app' : 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const { email, responseBody } = await req.json();

    const username = email.toLowerCase().trim().replace('@lycosteam.com', '');

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Base de datos no configurada' }, { status: 500 });
    }

    const { data: challengeData } = await db
      .from('webauthn_challenges')
      .select('challenge')
      .eq('username', username)
      .single();

    if (!challengeData) {
      return NextResponse.json({ error: 'Reto expirado' }, { status: 400 });
    }

    const { data: credentials, error: credError } = await db
      .from('webauthn_credentials')
      .select('*')
      .eq('user_id', username);

    if (credError) {
      console.error('Error fetching credentials:', credError);
      return NextResponse.json({ error: 'Error al buscar credenciales', details: credError.message }, { status: 500 });
    }

    let cred = credentials?.find(c => {
      const credIdBase64URL = Buffer.from(c.credential_id).toString('base64url');
      return credIdBase64URL === responseBody.id;
    });

    if (!cred) {
      return NextResponse.json({ error: 'Credencial no encontrada' }, { status: 404 });
    }

    const publicKeyBuffer = typeof cred.public_key === 'string' 
      ? Buffer.from(cred.public_key, 'base64')
      : cred.public_key;

    const verification = await verifyAuthenticationResponse({
      response: responseBody,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(publicKeyBuffer),
        counter: Number(cred.sign_count || 0),
      },
    });

    if (verification.verified) {
      const { newCounter } = verification.authenticationInfo;

      await db
        .from('webauthn_credentials')
        .update({ sign_count: newCounter, last_used_at: new Date().toISOString() })
        .eq('id', cred.id);

      const cookieStore = await cookies();
      cookieStore.set('lycos_session', username, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
      });

      const { data: user } = await db
        .from('usuarios')
        .select('nombre, username, rol')
        .eq('username', username)
        .single();

      return NextResponse.json({
        success: true,
        nombre: user?.nombre || username,
        username: user?.username || username,
        rol: user?.rol || 'usuario',
      });
    }

    return NextResponse.json({ error: 'Fallo la verificación biométrica' }, { status: 401 });

  } catch (error) {
    console.error('WebAuthn Auth Verify Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal Server Error', details: msg }, { status: 500 });
  }
}
