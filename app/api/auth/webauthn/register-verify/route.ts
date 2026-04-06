import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRegistrationResponse, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(url, key);

const rpID = process.env.NODE_ENV === 'production' ? 'lycosteam.com' : 'localhost';
const origin = process.env.NODE_ENV === 'production' ? 'https://lycosteam.com' : 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cookieStore = await cookies();
    const username = cookieStore.get('lycos_session')?.value;

    if (!username) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: challengeData } = await db
      .from('webauthn_challenges')
      .select('challenge')
      .eq('username', username)
      .single();

    if (!challengeData) {
      return NextResponse.json({ error: 'Reto no encontrado' }, { status: 400 });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const { publicKey, id, counter } = credential;

      // Save new credential to DB (credential ID must be Base64URL for SimpleWebAuthn)
      const credentialIDBase64URL = Buffer.from(id).toString('base64url');
      const transports = (body.response.transports || []) as AuthenticatorTransportFuture[];
      
      const { error: saveError } = await db.from('webauthn_credentials').insert({
        username,
        credential_id: credentialIDBase64URL,
        public_key: Buffer.from(publicKey),
        counter: BigInt(counter),
        transports,
      });

      if (saveError) {
          console.error('Save WebAuthn Error:', saveError);
          return NextResponse.json({ error: 'Error al guardar credencial' }, { status: 500 });
      }

      // Cleanup challenge
      await db.from('webauthn_challenges').delete().eq('username', username);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Fallo la verificación' }, { status: 400 });

  } catch (error) {
    console.error('WebAuthn Reg Verify Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
