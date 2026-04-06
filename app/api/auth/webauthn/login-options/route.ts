import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(url, key);

const rpID = process.env.NODE_ENV === 'production' ? 'lycosteam.com' : 'localhost';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email o usuario requerido' }, { status: 400 });
    }

    // Normalize: accept username or email@lycosteam.com
    const username = email.toLowerCase().trim().replace('@lycosteam.com', '');

    // Get user's credentials
    const { data: credentials } = await db
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('username', username);

    if (!credentials || credentials.length === 0) {
      return NextResponse.json({ error: 'No tienes biometría configurada. Inicia sesión con contraseña y actívala.' }, { status: 404 });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: (credentials || []).map(c => ({
        id: c.credential_id, // Pass as string (base64)
        type: 'public-key',
        transports: c.transports,
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
