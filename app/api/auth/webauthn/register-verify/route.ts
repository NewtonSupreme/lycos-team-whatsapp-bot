import { NextRequest, NextResponse } from 'next/server';
import { leerSesion } from '@/lib/session-token';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse, AuthenticatorTransportFuture } from '@simplewebauthn/server';
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
    const body = await req.json();
    const cookieStore = await cookies();
    const username = leerSesion(cookieStore.get('lycos_session')?.value);

    if (!username) {
      return NextResponse.json({ error: 'No autorizado. Sesión no encontrada.' }, { status: 401 });
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Base de datos no configurada' }, { status: 500 });
    }

    // Buscar el usuario para obtener su ID
    const { data: userData, error: userErr } = await db
      .from('usuarios')
      .select('id')
      .eq('username', username)
      .single();
    
    if (userErr || !userData?.id) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const userId = userData.id;

    const { data: challengeData, error: challengeError } = await db
      .from('webauthn_challenges')
      .select('challenge')
      .eq('username', username)
      .single();

    if (challengeError) {
      console.error('ChallengeError:', challengeError);
      return NextResponse.json({ error: 'Error al buscar challenge', details: challengeError.message, code: challengeError.code }, { status: 500 });
    }

    if (!challengeData) {
      return NextResponse.json({ error: 'Reto no encontrado. Intenta de nuevo.' }, { status: 400 });
    }

    console.log('=== WebAuthn Register Verify Debug ===');
    console.log('Challenge found:', challengeData ? 'yes' : 'no');

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const { publicKey, id, counter } = credential;

      const credentialIDBase64URL = Buffer.from(id).toString('base64url');
      const publicKeyBase64 = Buffer.from(publicKey).toString('base64');
      const transports = (body.response.transports || []) as AuthenticatorTransportFuture[];
      
      console.log('Inserting credential:', { username, credentialIDBase64URL, counter, transports });
      
      // Insertar con usuario_id
      const { error: saveError } = await db.from('webauthn_credentials').insert({
        usuario_id: userId,
        credential_id: credentialIDBase64URL,
        public_key: publicKeyBase64,
        counter: counter,
      });

      if (saveError) {
          console.error('Save WebAuthn Error:', saveError);
          console.error('Full error details:', JSON.stringify(saveError));
          return NextResponse.json({ error: 'Error al guardar credencial', details: saveError.message, code: saveError.code }, { status: 500 });
      }

      await db.from('webauthn_challenges').delete().eq('username', username);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Fallo la verificación' }, { status: 400 });

  } catch (error) {
    console.error('WebAuthn Reg Verify Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Internal Server Error', details: msg }, { status: 500 });
  }
}
