import webpush from 'web-push';
import { supabaseAdmin } from './supabase-admin';

let isWebPushInit = false;

export function initWebPush() {
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

export interface PushPayload {
  title: string;
  body: string;
  type?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export async function sendGlobalPushNotification(payload: PushPayload) {
  if (!initWebPush()) {
    console.warn('⚠️ Push notifications not configured (missing VAPID keys)');
    return { success: false, error: 'Push notifications not configured' };
  }

  // Fetch all subscriptions
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth');

  if (error || !subs || subs.length === 0) {
    return { success: true, sent: 0, message: 'No subscriptions found' };
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
  
  return { success: true, sent };
}
