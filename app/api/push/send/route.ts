import { NextRequest, NextResponse } from 'next/server';
import { sendGlobalPushNotification, PushPayload } from '@/lib/push-helper';

export async function POST(req: NextRequest) {
  try {
    const payload: PushPayload = await req.json();

    if (!payload.title || !payload.body) {
      return NextResponse.json({ error: 'title and body required' }, { status: 400 });
    }

    const result = await sendGlobalPushNotification(payload);
    
    if (!result.success && result.error) {
       return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, sent: result.sent });
  } catch (err) {
    console.error('Push send error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
