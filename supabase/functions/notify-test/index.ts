// Me → Demo tools → "Send test notification". Exercises the full event → delivery → Expo pipeline.
import { adminClient } from '../_shared/env.ts';
import { resolveCaller } from '../_shared/auth.ts';
import { emitEvent } from '../_shared/events.ts';
import { handle, json, readJson, requireUuid } from '../_shared/http.ts';
import { notifyOwnerPhones } from '../_shared/push.ts';

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const caller = await resolveCaller(req, admin, ['owner']);
  const b = await readJson(req);
  const eventId = typeof b.eventId === 'string' ? requireUuid(b.eventId, 'eventId') : crypto.randomUUID();

  const emitted = await emitEvent(admin, {
    eventId,
    ownerId: caller.ownerId,
    deviceId: null,
    source: 'ios-owner',
    type: 'TEST_NOTIFICATION',
    payload: {},
    isSimulated: true,
    occurredAt: new Date().toISOString(),
  });
  if (!emitted.inserted) return json({ duplicate: true, deliveries: [] });

  const deliveries = await notifyOwnerPhones(admin, caller.ownerId, emitted.id, 'hotspot', {
    type: 'TEST_NOTIFICATION',
    title: 'ReThink test',
    body: 'Notifications are working on this phone.',
    data: { eventId },
  });
  return json({ eventId, deliveries });
}));
