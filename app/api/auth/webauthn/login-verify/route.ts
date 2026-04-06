import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(url, key);

const rpID = process.env.NODE_ENV === 'production' ? 'lycosteam.com' : 'localhost';
const origin = process.env.NODE_ENV === 'production' ? 'https://lycosteam.com' : 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const { email, responseBody } = await req.json();
    const cookieStore = await cookies();

    const username = email.toLowerCase().trim().replace('@lycosteam.com', '');

    const { data: challengeData } = await db
      .from('webauthn_challenges')
      .select('challenge')
      .eq('username', username)
      .single();

    if (!challengeData) {
      return NextResponse.json({ error: 'Reto expirado' }, { status: 400 });
    }

    const { data: credentials } = await db
      .from('webauthn_credentials')
      .select('*')
      .eq('username', username)
      .eq('credential_id', responseBody.id);

    const cred = credentials?.[0];
    if (!cred) {
      return NextResponse.json({ error: 'Credencial no encontrada' }, { status: 404 });
    }

    const verification = await verifyAuthenticationResponse({
      response: responseBody,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key.toString().replace('\\x', ''), 'hex')),
        counter: Number(cred.counter || 0),
      },
    });

    if (verification.verified) {
      const { newCounter } = verification.authenticationInfo;

      // Update counter
      await db
        .from('webauthn_credentials')
        .update({ counter: BigInt(newCounter) })
        .eq('id', cred.id);

      // Create session
      cookieStore.set('lycos_session', username, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/',
      });

      // Get full user profile
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
