import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BUCKET = 'tutorial';
const FILE_NAME = 'tutorial_Lycos_Team.mp4';

async function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  try {
    // 1. Auth check — validate session cookie
    const cookie = request.cookies.get('lycos_session')?.value;
    if (!cookie) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const db = await getDb();
    if (!db) {
      return new NextResponse('Error de configuración', { status: 500 });
    }

    const { data: user } = await db
      .from('usuarios')
      .select('id')
      .eq('username', cookie)
      .maybeSingle();

    if (!user) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    // 2. Generate signed URL from Supabase Storage
    const { data: signedData, error: signedError } = await db.storage
      .from(BUCKET)
      .createSignedUrl(FILE_NAME, 60 * 60 * 24); // 24 hours

    if (signedError || !signedData?.signedUrl) {
      console.error('Error getting signed URL:', signedError);
      return new NextResponse('Video no disponible', { status: 404 });
    }

    // 3. Redirect to signed URL (browser fetches directly from Supabase CDN)
    return NextResponse.redirect(signedData.signedUrl);
  } catch (e) {
    console.error('Error in tutorial-video API:', e);
    return new NextResponse('Error interno', { status: 500 });
  }
}
