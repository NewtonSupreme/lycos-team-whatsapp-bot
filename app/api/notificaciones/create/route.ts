import { NextRequest, NextResponse } from 'next/server';
import { createGlobalNotification } from '@/lib/notificaciones-helper';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    if (!payload.sede_id || !payload.titulo || !payload.mensaje) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await createGlobalNotification({
      sede_id: payload.sede_id,
      tipo: payload.tipo || 'info',
      titulo: payload.titulo,
      mensaje: payload.mensaje,
      entidad_tipo: payload.entidad_tipo,
      entidad_id: payload.entidad_id,
      url: payload.url
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: result.notificacion_id });
  } catch (err) {
    console.error('API /notificaciones/create error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
