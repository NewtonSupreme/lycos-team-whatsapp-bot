import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321', // Local fallback for build
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'
);

let isWebPushInit = false;
function initWebPush() {
  if (isWebPushInit) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@lycosteam.com';

  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isWebPushInit = true;
    return true;
  }
  return false;
}

interface PushPayload {
  title: string;
  body: string;
  type?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    if (!initWebPush()) {
      return NextResponse.json({ error: 'Push notifications not configured' }, { status: 500 });
    }

    const payload: PushPayload = await req.json();

    if (!payload.title || !payload.body) {
      return NextResponse.json({ error: 'title and body required' }, { status: 400 });
    }

    // Fetch all subscriptions
    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth');

    if (error || !subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No subscriptions found' });
    }

    const sendPromises = subs.map(async (sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSub, JSON.stringify(payload));
        return { success: true };
      } catch (err: unknown) {
        // If subscription expired (410), remove it
        const errorObj = err as { statusCode?: number };
        if (errorObj?.statusCode === 410 || errorObj?.statusCode === 404) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
        return { success: false };
      }
    });

    const results = await Promise.allSettled(sendPromises);
    const sent = results.filter(r => r.status === 'fulfilled').length;

    return NextResponse.json({ success: true, sent });
  } catch (err) {
    console.error('Push send error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
