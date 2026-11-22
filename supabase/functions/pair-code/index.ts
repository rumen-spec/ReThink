// Owner mints a one-time pairing code for a browser or trigger device. §12.4 "Generate pairing code".
import { adminClient } from '../_shared/env.ts';
import { resolveCaller } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/http.ts';
import { randomPairingCode, sha256Hex } from '../_shared/tokens.ts';

const TTL_MS = 10 * 60 * 1000;

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const caller = await resolveCaller(req, admin, ['owner']);
  const body = await readJson<{ role?: unknown }>(req);
  const role = body.role;
  if (role !== 'browser' && role !== 'trigger') throw new HttpError(400, "role must be 'browser' or 'trigger'", 'bad-input');

  // Only one live code per owner+role at a time keeps the UI honest about "the" code.
  await admin.from('pairing_codes').delete().eq('owner_id', caller.ownerId).eq('role', role).is('redeemed_at', null);

  const code = randomPairingCode();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const { error } = await admin.from('pairing_codes').insert({
    owner_id: caller.ownerId,
    code_hash: await sha256Hex(code),
    role,
    expires_at: expiresAt,
  });
  if (error) throw error;

  return json({ code, role, expiresAt });
}));
