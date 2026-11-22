import type { SupabaseClient } from '@supabase/supabase-js';

export interface PushMessage {
  type: string;
  title: string;
  /** iOS second line, bold under the title. Where provenance labels live so the body reads normally. */
  subtitle?: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface DeliveryReport {
  deviceId: string;
  status: 'sent' | 'failed' | 'suppressed';
  error?: string;
}

/**
 * Best-effort Expo push to the owner's opted-in iPhones (§13.2). One delivery row per
 * (event, device) so a retried event can't re-send. Trigger devices never receive budget content.
 */
export async function notifyOwnerPhones(
  admin: SupabaseClient,
  ownerId: string,
  eventRowId: string,
  prefKey: 'cart' | 'hotspot',
  msg: PushMessage,
): Promise<DeliveryReport[]> {
  const { data: devices } = await admin
    .from('devices')
    .select('id, notification_pref, push_tokens(expo_push_token, invalidated_at)')
    .eq('owner_id', ownerId)
    .eq('role', 'owner')
    .is('revoked_at', null);

  const reports: DeliveryReport[] = [];
  for (const d of devices ?? []) {
    const pref = (d.notification_pref as Record<string, unknown> | null)?.[prefKey];
    const tokenRow = Array.isArray(d.push_tokens) ? d.push_tokens[0] : d.push_tokens;
    const token = tokenRow && !tokenRow.invalidated_at ? (tokenRow.expo_push_token as string) : null;

    const { data: claimed } = await admin
      .from('notification_deliveries')
      .insert({ event_id: eventRowId, device_id: d.id, type: msg.type, status: 'queued' })
      .select('id')
      .maybeSingle();
    if (!claimed) continue; // already delivered for this event+device

    if (pref === false || !token) {
      await admin.from('notification_deliveries').update({ status: 'suppressed', last_attempt_at: new Date().toISOString(), error: pref === false ? 'muted' : 'no-push-token' }).eq('id', claimed.id);
      reports.push({ deviceId: d.id, status: 'suppressed', error: pref === false ? 'muted' : 'no-push-token' });
      continue;
    }

    let status: 'sent' | 'failed' = 'sent';
    let error: string | undefined;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
      const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: token,
          title: msg.title,
          ...(msg.subtitle ? { subtitle: msg.subtitle } : {}),
          body: msg.body,
          data: { type: msg.type, ...msg.data },
          sound: 'default',
        }),
      });
      const out = await res.json().catch(() => ({}));
      const ticket = out?.data?.[0] ?? out?.data;
      if (!res.ok || ticket?.status === 'error') {
        status = 'failed';
        error = ticket?.message ?? `HTTP ${res.status}`;
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          await admin.from('push_tokens').update({ invalidated_at: new Date().toISOString() }).eq('device_id', d.id);
        }
      }
    } catch (e) {
      status = 'failed';
      error = e instanceof Error ? e.message : String(e);
    }
    await admin.from('notification_deliveries').update({ status, error, last_attempt_at: new Date().toISOString() }).eq('id', claimed.id);
    reports.push({ deviceId: d.id, status, error });
  }
  return reports;
}
