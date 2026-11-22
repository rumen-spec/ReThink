// A paired trigger phone (or the owner's own phone) reports entering a hotspot. §14, §13.2–13.3.
// Real vs simulated provenance is recorded and surfaces in the event type and the push copy.
import { formatCad } from '@rethink/shared';
import { adminClient } from '../_shared/env.ts';
import { resolveCaller } from '../_shared/auth.ts';
import { emitEvent } from '../_shared/events.ts';
import { handle, HttpError, json, optionalIso, readJson, requireUuid } from '../_shared/http.ts';
import { notifyOwnerPhones } from '../_shared/push.ts';

// A burst guard for real crossings only: iOS can deliver the same one twice, and a late retry must
// not buzz the phone again. A hand-pressed entry has no such problem — someone meant each tap — so
// it is never rate limited. Rehearsing it back to back has to work.
const COOLDOWN_REAL_MS = 15 * 1000;
const COOLDOWN_SIMULATED_MS = 0;

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const caller = await resolveCaller(req, admin, ['owner', 'trigger']);
  const b = await readJson(req);

  const hotspotId = requireUuid(b.hotspotId, 'hotspotId');
  const eventId = requireUuid(b.eventId, 'eventId');
  const occurredAt = optionalIso(b.occurredAt, 'occurredAt');
  // Either device may send a labelled test/simulated entry (the trigger phone has its own "Test entry"
  // button, SPEC §10.3). It is recorded as HOTSPOT_SIMULATED and never presented as a real callback.
  const isSimulated = b.isSimulated === true;

  const { data: hotspot } = await admin
    .from('hotspots')
    .select('id, name, radius_m, enabled, snoozed_until, verified, category_id')
    .eq('id', hotspotId)
    .eq('owner_id', caller.ownerId)
    .maybeSingle();
  if (!hotspot) throw new HttpError(404, 'Hotspot not found', 'not-found');

  const type = isSimulated ? 'HOTSPOT_SIMULATED' : 'HOTSPOT_ENTERED';
  const deviceLabel = caller.kind === 'device' ? caller.label : 'Your phone';
  const basePayload = { hotspotId, hotspotName: hotspot.name, deviceLabel, provenance: isSimulated ? 'simulated' : 'real' };

  // Why an entry might be accepted-but-silent. Logged, not pushed (§13.3, J7).
  let suppressed: string | null = null;
  if (!hotspot.enabled) suppressed = 'disabled';
  else if (hotspot.snoozed_until && Date.parse(hotspot.snoozed_until) > Date.now()) suppressed = 'snoozed';
  else if (!isSimulated && !hotspot.verified) suppressed = 'unverified-hotspot';
  else if (!isSimulated) {
    const cooldown = COOLDOWN_REAL_MS;
    const since = new Date(Date.now() - cooldown).toISOString();
    let q = admin
      .from('spending_events')
      .select('id')
      .eq('owner_id', caller.ownerId)
      .eq('type', type)
      .eq('payload->>hotspotId', hotspotId)
      .gte('received_at', since)
      .limit(1);
    q = caller.deviceId ? q.eq('device_id', caller.deviceId) : q.is('device_id', null);
    const { data: recent } = await q;
    if (recent && recent.length > 0) suppressed = 'cooldown';
  }

  const emitted = await emitEvent(admin, {
    eventId,
    ownerId: caller.ownerId,
    deviceId: caller.deviceId,
    source: caller.kind === 'device' ? 'ios-trigger' : 'ios-owner',
    type,
    payload: { ...basePayload, suppressed },
    isSimulated,
    occurredAt,
  });
  if (!emitted.inserted) return json({ accepted: true, duplicate: true, suppressed });
  if (suppressed) return json({ accepted: true, suppressed, deliveries: [] });

  await admin.from('hotspots').update({ last_entered_at: occurredAt }).eq('id', hotspotId);

  // Budget line for the owner's push only. Trigger devices never receive this (§1.4 rule 6).
  let budgetLine = '';
  if (hotspot.category_id) {
    const { data: bal } = await admin.from('budget_category_balances').select('name, allocated_cents, confirmed_spent_cents').eq('id', hotspot.category_id).maybeSingle();
    if (bal) {
      const remaining = bal.allocated_cents - bal.confirmed_spent_cents;
      budgetLine = remaining >= 0
        ? ` You have ${formatCad(remaining)} left for ${bal.name} this month.`
        : ` You are ${formatCad(-remaining)} over on ${bal.name} this month.`;
    }
  }

  // A simulated entry says the same thing a real one would; the label rides on the subtitle so the
  // sentence still reads properly (§1.4: simulated is always disclosed, never disguised).
  const arrival = caller.kind === 'device' ? `${deviceLabel} just arrived at ${hotspot.name}.` : `You just arrived at ${hotspot.name}.`;
  const title = hotspot.name;
  const subtitle = isSimulated ? 'Simulated entry' : undefined;
  const body = `${arrival}${budgetLine}`;
  const deliveries = await notifyOwnerPhones(admin, caller.ownerId, emitted.id, 'hotspot', {
    type,
    title,
    subtitle,
    body,
    data: { hotspotId, isSimulated, eventId },
  });

  return json({ accepted: true, suppressed: null, deliveries, message: { title, subtitle, body } });
}));
