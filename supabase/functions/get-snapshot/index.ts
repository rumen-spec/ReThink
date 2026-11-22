// Role-filtered read of the owner's current state. §12.4 "Get snapshot".
//   owner   → everything
//   browser → profile name, categories (+ confirmed spend), savings plan, active carts, recent cart/purchase events
//   trigger → enabled hotspots only (id, name, coordinates, radius). No budget data (§1.4 rule 6).
// The phone uses RLS + realtime directly; the extension polls this every few seconds for phone→browser sync.
import { adminClient } from '../_shared/env.ts';
import { resolveCaller } from '../_shared/auth.ts';
import { handle, json } from '../_shared/http.ts';

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const caller = await resolveCaller(req, admin, ['owner', 'browser', 'trigger']);
  const ownerId = caller.ownerId;
  const now = new Date().toISOString();

  if (caller.role === 'trigger') {
    const { data: hotspots } = await admin
      .from('hotspots')
      .select('id, name, latitude, longitude, radius_m, enabled, verified')
      .eq('owner_id', ownerId)
      .eq('enabled', true)
      .eq('verified', true);
    return json({ role: 'trigger', serverTime: now, hotspots: hotspots ?? [] });
  }

  const [{ data: profile }, { data: period }, { data: plan }] = await Promise.all([
    admin.from('profiles').select('display_name, onboarded_at').eq('user_id', ownerId).maybeSingle(),
    admin.from('budget_periods').select('id, label, starts_at, ends_at').eq('owner_id', ownerId).eq('is_active', true).maybeSingle(),
    admin.from('savings_plans').select('opening_balance_cents, monthly_contribution_cents, illustrative_rate, horizon_months, version, updated_at').eq('owner_id', ownerId).maybeSingle(),
  ]);

  const { data: categories } = period
    ? await admin
        .from('budget_category_balances')
        .select('id, name, allocated_cents, confirmed_spent_cents, enabled, product_category, sort_order, updated_at')
        .eq('period_id', period.id)
        .order('sort_order')
    : { data: [] };

  const { data: carts } = await admin
    .from('cart_snapshots')
    .select('id, merchant_key, device_id, session_id, cart_id, items, subtotal_cents, currency, source, sync_quality, includes_tax, includes_shipping, discount_status, version, observed_at, updated_at')
    .eq('owner_id', ownerId)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  const eventTypes = caller.role === 'owner' ? undefined : ['CART_UPDATED', 'PURCHASE_CONFIRMED', 'BUDGET_UPDATED'];
  let evq = admin
    .from('spending_events')
    .select('id, event_id, type, source, device_id, payload, is_simulated, occurred_at, received_at')
    .eq('owner_id', ownerId)
    .order('received_at', { ascending: false })
    .limit(20);
  if (eventTypes) evq = evq.in('type', eventTypes);
  const { data: events } = await evq;

  const base = {
    role: caller.role,
    serverTime: now,
    profile: profile ? { displayName: profile.display_name, onboardedAt: profile.onboarded_at } : null,
    period,
    categories: (categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      allocatedCents: c.allocated_cents,
      confirmedSpentCents: c.confirmed_spent_cents,
      enabled: c.enabled,
      productCategory: c.product_category ?? undefined,
      updatedAt: c.updated_at,
    })),
    savingsPlan: plan
      ? {
          openingBalanceCents: plan.opening_balance_cents,
          monthlyContributionCents: plan.monthly_contribution_cents,
          illustrativeRateAnnual: Number(plan.illustrative_rate),
          horizonMonths: plan.horizon_months,
          version: plan.version,
          updatedAt: plan.updated_at,
        }
      : null,
    carts: carts ?? [],
    events: events ?? [],
  };

  if (caller.role === 'browser') return json(base);

  const [{ data: hotspots }, { data: devices }] = await Promise.all([
    admin.from('hotspots').select('*').eq('owner_id', ownerId).order('created_at'),
    admin.from('devices').select('id, device_label, role, platform, consented_at, revoked_at, last_seen_at, notification_pref, created_at').eq('owner_id', ownerId).order('created_at'),
  ]);
  return json({ ...base, hotspots: hotspots ?? [], devices: devices ?? [] });
}));
