// A device redeems a pairing code and receives its own revocable token. §12.4 "Redeem pairing code".
// Unauthenticated by design (the code is the credential); throttled per IP.
import { adminClient } from '../_shared/env.ts';
import { emitEvent } from '../_shared/events.ts';
import { handle, HttpError, json, readJson, requireString } from '../_shared/http.ts';
import { normalizePairingCode, randomDeviceToken, sha256Hex } from '../_shared/tokens.ts';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 10;

function windowStart(): string {
  return new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS).toISOString();
}

function callerIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'unknown').split(',')[0]!.trim();
}

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const ip = callerIp(req);
  const ws = windowStart();

  const { data: attempts } = await admin.from('pairing_attempts').select('failures').eq('ip', ip).eq('window_start', ws).maybeSingle();
  if ((attempts?.failures ?? 0) >= MAX_FAILURES) throw new HttpError(429, 'Too many attempts; try again later', 'throttled');

  const body = await readJson<{ code?: unknown; deviceLabel?: unknown; platform?: unknown; consent?: unknown }>(req);
  const code = normalizePairingCode(requireString(body.code, 'code', 16));
  const deviceLabel = requireString(body.deviceLabel, 'deviceLabel', 60);
  const platform = body.platform === 'ios' || body.platform === 'chrome' ? body.platform : 'other';
  if (body.consent !== true) throw new HttpError(400, 'Explicit consent required', 'consent-required');

  const fail = async () => {
    await admin.from('pairing_attempts').upsert(
      { ip, window_start: ws, failures: (attempts?.failures ?? 0) + 1 },
      { onConflict: 'ip,window_start' },
    );
    throw new HttpError(400, 'Code invalid or expired', 'bad-code');
  };

  const { data: pc } = await admin
    .from('pairing_codes')
    .select('id, owner_id, role, expires_at, redeemed_at')
    .eq('code_hash', await sha256Hex(code))
    .maybeSingle();
  if (!pc || pc.redeemed_at || Date.parse(pc.expires_at) < Date.now()) await fail();

  const token = randomDeviceToken();
  const { data: device, error } = await admin
    .from('devices')
    .insert({
      owner_id: pc!.owner_id,
      device_label: deviceLabel,
      role: pc!.role,
      platform,
      token_hash: await sha256Hex(token),
      consented_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;

  // Claim the code atomically: only the first redeemer whose update matches `redeemed_at is null` wins.
  const { data: claimed } = await admin
    .from('pairing_codes')
    .update({ redeemed_at: new Date().toISOString(), redeemed_device_id: device.id })
    .eq('id', pc!.id)
    .is('redeemed_at', null)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    await admin.from('devices').delete().eq('id', device.id);
    await fail();
  }

  await emitEvent(admin, {
    eventId: crypto.randomUUID(),
    ownerId: pc!.owner_id,
    deviceId: device.id,
    source: 'server',
    type: 'DEVICE_PAIRED',
    payload: { role: pc!.role, deviceLabel, platform },
    isSimulated: false,
    occurredAt: new Date().toISOString(),
  });

  const { data: profile } = await admin.from('profiles').select('display_name').eq('user_id', pc!.owner_id).maybeSingle();

  return json({
    deviceId: device.id,
    deviceToken: token, // shown once; store in extension session storage / iOS secure store
    role: pc!.role,
    ownerDisplayName: profile?.display_name ?? null,
  });
}));
