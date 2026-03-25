import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTHORIZED_ACCOUNTS = [
  'administrador',
  'daniela',
  'Alejandra',
  'Andrea',
];

const AUTHORIZED_EMAILS = AUTHORIZED_ACCOUNTS.map(acc => `${acc.toLowerCase()}@lycosteam.com`);

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Case-insensitive check
    const lowerEmail = email.toLowerCase().trim();
    const isAuthorized = 
      AUTHORIZED_ACCOUNTS.some(acc => acc.toLowerCase() === lowerEmail) || 
      AUTHORIZED_EMAILS.some(em => em.toLowerCase() === lowerEmail);

    if (isAuthorized && password === 'lycos2026') {
      const cookieStore = await cookies();
      
      // Set a session cookie valid for 7 days
      cookieStore.set('lycos_session', email, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Credenciales inválidas o cuenta no autorizada' },
      { status: 401 }
    );
  } catch (_error) {
    return NextResponse.json(
      { error: 'Error en el servidor' },
      { status: 500 }
    );
  }
}
