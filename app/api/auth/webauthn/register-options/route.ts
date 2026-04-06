import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(url, key);

// RP = Relying Party
const rpName = 'Lycos Team CRM';
const rpID = process.env.NODE_ENV === 'production' ? 'lycosteam.com' : 'localhost';
const origin = process.env.NODE_ENV === 'production' ? 'https://lycosteam.com' : 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const username = cookieStore.get('lycos_session')?.value;

    if (!username) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Get current credentials to avoid registering the same device twice
    const { data: credentials } = await db
      .from('webauthn_credentials')
      .select('credential_id')
      .eq('username', username);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(username), // Encode as Uint8Array
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      excludeCredentials: (credentials || []).map(c => ({
        id: c.credential_id, // Pass as string (base64)
        type: 'public-key',
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
