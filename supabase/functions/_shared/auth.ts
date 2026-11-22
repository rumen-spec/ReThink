import type { SupabaseClient } from '@supabase/supabase-js';
import { DEVICE_TOKEN_HEADER, HttpError } from './http.ts';
import { sha256Hex } from './tokens.ts';

export type Role = 'owner' | 'browser' | 'trigger';

export type Caller =
  | { kind: 'owner'; role: 'owner'; ownerId: string; deviceId: null; label: 'owner' }
  | { kind: 'device'; role: 'browser' | 'trigger'; ownerId: string; deviceId: string; label: string };

/**
 * Who is calling (docs/SPEC.md §12.4). Owner: a Supabase user JWT (anonymous sign-in).
 * Device: a pairing-minted token in `x-rethink-device-token`, matched by sha256 against
 * `devices.token_hash`, not revoked. A device id alone is never a credential.
 */
export async function resolveCaller(req: Request, admin: SupabaseClient, allowed: readonly Role[]): Promise<Caller> {
  const deviceToken = req.headers.get(DEVICE_TOKEN_HEADER);
  if (deviceToken) {
    const hash = await sha256Hex(deviceToken);
    const { data: device } = await admin
      .from('devices')
      .select('id, owner_id, role, device_label, revoked_at')
      .eq('token_hash', hash)
      .maybeSingle();
    if (!device || device.revoked_at) throw new HttpError(401, 'Device token invalid or revoked', 'device-unauthorized');
    if (device.role === 'owner') throw new HttpError(401, 'Owner devices authenticate with a session', 'device-unauthorized');
    if (!allowed.includes(device.role)) throw new HttpError(403, `Role ${device.role} may not call this`, 'forbidden');
    await admin.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
    return { kind: 'device', role: device.role, ownerId: device.owner_id, deviceId: device.id, label: device.device_label };
  }

  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) throw new HttpError(401, 'Missing credentials', 'unauthorized');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Session invalid', 'unauthorized');
  if (!allowed.includes('owner')) throw new HttpError(403, 'Owner may not call this', 'forbidden');
  return { kind: 'owner', role: 'owner', ownerId: data.user.id, deviceId: null, label: 'owner' };
}
