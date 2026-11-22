/**
 * The owner's canonical state on the phone: one anonymous session, one realtime subscription,
 * shared by every tab through context. Derived money values are NOT stored here; screens call the
 * shared finance functions on these inputs (SPEC §10.2).
 */
import type { BudgetCategory, CartItem, IllustrativeRate, ProductCategoryKey, SavingsPlan } from '@rethink/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ensureOwnerDevice } from '@/lib/device';
import { log } from '@/lib/log';
import { callFunction, ensureSession, supabase } from '@/lib/supabase';

const l = log.child('owner-state');

export interface ActiveCart {
  id: string;
  merchantKey: string;
  cartId: string;
  items: CartItem[];
  subtotalCents: number | null;
  version: number;
  updatedAt: string;
  source: 'retailer-detected' | 'manual-consideration';
  syncQuality: string;
}

export interface DeviceRow {
  id: string;
  label: string;
  role: 'owner' | 'browser' | 'trigger';
  platform: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

/** One place this phone watches. Coordinates stay on the server; the phone only registers a fence. */
export interface Hotspot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  enabled: boolean;
  verified: boolean;
  categoryId: string | null;
  lastEnteredAt: string | null;
}

/** A hotspot entry as it appears in the feed. `isSimulated` is always shown, never hidden (§1.4). */
export interface HotspotEvent {
  id: string;
  type: 'HOTSPOT_ENTERED' | 'HOTSPOT_SIMULATED';
  hotspotName: string;
  deviceLabel: string;
  suppressed: string | null;
  isSimulated: boolean;
  occurredAt: string;
}

export interface OwnerState {
  userId: string | null;
  /** This phone's `devices` row. Push has nowhere to go until it exists. */
  deviceId: string | null;
  displayName: string | null;
  periodId: string | null;
  periodLabel: string | null;
  categories: BudgetCategory[];
  cart: ActiveCart | null;
  savingsPlan: SavingsPlan | null;
  devices: DeviceRow[];
  hotspots: Hotspot[];
  hotspotEvents: HotspotEvent[];
  realtime: RealtimeStatus;
  syncedAt: Date | null;
  loading: boolean;
  /** Short human lines for the activity preview / demo tools. Newest first. */
  notes: string[];
}

export interface OwnerActions {
  refetch(): Promise<void>;
  loadDemo(): Promise<void>;
  createPairCode(role: 'browser' | 'trigger'): Promise<{ code: string; expiresAt: string }>;
  setAllocation(categoryId: string, allocatedCents: number): Promise<void>;
  setCategoryEnabled(categoryId: string, enabled: boolean): Promise<void>;
  setMonthlyContribution(cents: number): Promise<void>;
  setHotspotEnabled(hotspotId: string, enabled: boolean): Promise<void>;
  /** Mark coordinates as checked on the map. Only a verified hotspot registers a real fence (§5.8). */
  setHotspotVerified(hotspotId: string, verified: boolean): Promise<void>;
  /** Drop a new pin. Placed by hand on the map, so it counts as verified. */
  addHotspot(input: { name: string; latitude: number; longitude: number; radiusM: number }): Promise<void>;
  removeHotspot(hotspotId: string): Promise<void>;
  /** Report an entry by hand. `simulated: true` is labelled everywhere it appears. */
  reportHotspotEntry(hotspotId: string, simulated: boolean): Promise<string>;
  revokeDevice(deviceId: string): Promise<void>;
  sendTestNotification(): Promise<string>;
  note(line: string): void;
}

const StateCtx = createContext<OwnerState | null>(null);
const ActionsCtx = createContext<OwnerActions | null>(null);

const RATES: IllustrativeRate[] = [0, 0.05, 0.07, 0.1];
const asRate = (n: number): IllustrativeRate => (RATES.includes(n as IllustrativeRate) ? (n as IllustrativeRate) : 0);

export function useOwnerStateProvider(): { state: OwnerState; actions: OwnerActions } {
  const [state, setState] = useState<OwnerState>({
    userId: null,
    deviceId: null,
    displayName: null,
    periodId: null,
    periodLabel: null,
    categories: [],
    cart: null,
    savingsPlan: null,
    devices: [],
    hotspots: [],
    hotspotEvents: [],
    realtime: 'connecting',
    syncedAt: null,
    loading: true,
    notes: [],
  });
  const uidRef = useRef<string | null>(null);

  const note = useCallback((line: string) => {
    setState((s) => ({ ...s, notes: [`${new Date().toLocaleTimeString()} ${line}`, ...s.notes].slice(0, 12) }));
  }, []);

  const refetch = useCallback(async () => {
    const uid = uidRef.current;
    if (!uid) return;
    const end = l.span('refetch');
    const [{ data: profile }, { data: period }, { data: plan }, { data: devices }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('user_id', uid).maybeSingle(),
      supabase.from('budget_periods').select('id, label').eq('owner_id', uid).eq('is_active', true).maybeSingle(),
      supabase.from('savings_plans').select('opening_balance_cents, monthly_contribution_cents, illustrative_rate, horizon_months').eq('owner_id', uid).maybeSingle(),
      supabase.from('devices').select('id, device_label, role, platform, last_seen_at, revoked_at, created_at').eq('owner_id', uid).order('created_at'),
    ]);
    const [{ data: hotspots }, { data: events }] = await Promise.all([
      supabase.from('hotspots').select('id, name, latitude, longitude, radius_m, enabled, verified, category_id, last_entered_at').eq('owner_id', uid).order('name'),
      supabase
        .from('spending_events')
        .select('id, type, payload, is_simulated, occurred_at')
        .eq('owner_id', uid)
        .in('type', ['HOTSPOT_ENTERED', 'HOTSPOT_SIMULATED'])
        .order('occurred_at', { ascending: false })
        .limit(10),
    ]);
    const [{ data: cats }, { data: carts }] = await Promise.all([
      period
        ? supabase
            .from('budget_category_balances')
            .select('id, name, allocated_cents, confirmed_spent_cents, enabled, product_category')
            .eq('period_id', period.id)
            .order('sort_order')
        : Promise.resolve({ data: [] as never[] }),
      supabase
        .from('cart_snapshots')
        .select('id, merchant_key, cart_id, items, subtotal_cents, version, updated_at, source, sync_quality')
        .eq('owner_id', uid)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(1),
    ]);
    const cartRow = carts?.find((c) => Array.isArray(c.items) && c.items.length > 0);
    setState((s) => ({
      ...s,
      displayName: profile?.display_name ?? null,
      periodId: period?.id ?? null,
      periodLabel: period?.label ?? null,
      categories: (cats ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        allocatedCents: c.allocated_cents,
        confirmedSpentCents: c.confirmed_spent_cents,
        enabled: c.enabled,
        productCategory: (c.product_category ?? undefined) as ProductCategoryKey | undefined,
      })),
      cart: cartRow
        ? {
            id: cartRow.id,
            merchantKey: cartRow.merchant_key,
            cartId: cartRow.cart_id,
            items: cartRow.items as CartItem[],
            subtotalCents: cartRow.subtotal_cents,
            version: cartRow.version,
            updatedAt: cartRow.updated_at,
            source: cartRow.source,
            syncQuality: cartRow.sync_quality,
          }
        : null,
      savingsPlan: plan
        ? {
            openingBalanceCents: plan.opening_balance_cents,
            monthlyContributionCents: plan.monthly_contribution_cents,
            illustrativeRateAnnual: asRate(Number(plan.illustrative_rate)),
            horizonMonths: plan.horizon_months,
          }
        : null,
      hotspots: (hotspots ?? []).map((h) => ({
        id: h.id,
        name: h.name,
        latitude: h.latitude,
        longitude: h.longitude,
        radiusM: h.radius_m,
        enabled: h.enabled,
        verified: h.verified,
        categoryId: h.category_id ?? null,
        lastEnteredAt: h.last_entered_at ?? null,
      })),
      hotspotEvents: (events ?? []).map((e) => {
        const p = (e.payload ?? {}) as { hotspotName?: string; deviceLabel?: string; suppressed?: string | null };
        return {
          id: e.id,
          type: e.type as HotspotEvent['type'],
          hotspotName: p.hotspotName ?? 'Hotspot',
          deviceLabel: p.deviceLabel ?? 'A device',
          suppressed: p.suppressed ?? null,
          isSimulated: e.is_simulated,
          occurredAt: e.occurred_at,
        };
      }),
      devices: (devices ?? []).map((d) => ({
        id: d.id,
        label: d.device_label,
        role: d.role,
        platform: d.platform,
        lastSeenAt: d.last_seen_at,
        revokedAt: d.revoked_at,
        createdAt: d.created_at,
      })),
      syncedAt: new Date(),
      loading: false,
    }));
    end({ categories: cats?.length ?? 0, cart: cartRow ? `${cartRow.merchant_key}@v${cartRow.version}` : null, devices: devices?.length ?? 0 });
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      try {
        const session = await ensureSession();
        uidRef.current = session.user.id;
        setState((s) => ({ ...s, userId: session.user.id }));
        // Register this phone before anything else needs it. No prompts: that is just a row.
        ensureOwnerDevice(session.user.id)
          .then((deviceId) => setState((s) => ({ ...s, deviceId })))
          .catch((e: unknown) => l.warn('could not register this phone', { error: e instanceof Error ? e.message : String(e) }));
        await refetch();
        const rt = l.child('realtime');
        const uid = session.user.id;
        channel = supabase
          .channel(`owner:${uid}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_snapshots', filter: `owner_id=eq.${uid}` }, (p) => {
            const row = (p.new ?? p.old) as { merchant_key?: string; version?: number };
            rt.info('cart change', { type: p.eventType, merchant: row.merchant_key, version: row.version });
            note(`Cart ${p.eventType === 'DELETE' ? 'cleared' : 'updated'} from Chrome`);
            void refetch();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_categories', filter: `owner_id=eq.${uid}` }, (p) => {
            const row = (p.new ?? p.old) as { name?: string; allocated_cents?: number };
            rt.info('budget change', { type: p.eventType, name: row.name, allocatedCents: row.allocated_cents });
            void refetch();
          })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'spending_events', filter: `owner_id=eq.${uid}` }, (p) => {
            const row = p.new as { type: string; source: string; is_simulated: boolean };
            rt.debug('event', { type: row.type, source: row.source, simulated: row.is_simulated });
            if (row.type === 'PURCHASE_CONFIRMED') {
              note('Purchase recorded');
              void refetch();
            } else if (row.type.startsWith('HOTSPOT')) {
              note(`${row.is_simulated ? 'Simulated: ' : ''}hotspot entered`);
            } else if (row.type === 'DEVICE_PAIRED') {
              note('A device paired');
              void refetch();
            }
          })
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              rt.info('subscribed; refetching to cover anything missed while disconnected');
              setState((s) => ({ ...s, realtime: 'live' }));
              void refetch();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              rt.warn('channel down', { status, error: err?.message });
              setState((s) => ({ ...s, realtime: 'offline' }));
            } else {
              rt.debug('channel status', { status });
            }
          });
      } catch (e) {
        l.error('bootstrap failed', e);
        setState((s) => ({ ...s, realtime: 'offline', loading: false }));
        note(`Could not connect: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refetch, note]);

  const actions = useMemo<OwnerActions>(
    () => ({
      refetch,
      note,
      async loadDemo() {
        const end = l.span('action:reset_demo');
        const { error } = await supabase.rpc('reset_demo');
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        end();
        note('Demo data reset');
        await refetch();
      },
      async createPairCode(role) {
        const r = await callFunction<{ code: string; expiresAt: string }>('pair-code', { role });
        note(`Pairing code created for ${role}`);
        return r;
      },
      async setAllocation(categoryId, allocatedCents) {
        const uid = uidRef.current;
        if (!uid) throw new Error('Not signed in');
        const end = l.span('action:set-allocation', { categoryId: categoryId.slice(0, 8), allocatedCents });
        const { error } = await supabase.from('budget_categories').update({ allocated_cents: allocatedCents }).eq('id', categoryId);
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        await supabase.from('spending_events').insert({
          event_id: crypto.randomUUID(),
          owner_id: uid,
          source: 'ios-owner',
          type: 'BUDGET_UPDATED',
          payload: { categoryId, allocatedCents },
          is_simulated: false,
          occurred_at: new Date().toISOString(),
        });
        end();
      },
      async setCategoryEnabled(categoryId, enabled) {
        const uid = uidRef.current;
        if (!uid) throw new Error('Not signed in');
        const end = l.span('action:set-category-enabled', { categoryId: categoryId.slice(0, 8), enabled });
        const { error } = await supabase.from('budget_categories').update({ enabled }).eq('id', categoryId);
        if (error) {
          end({ error: error.message });
          // The DB allows one enabled budget per product category per period (SPEC §5.3).
          throw new Error(error.code === '23505' ? 'Another budget already covers these products this month.' : error.message);
        }
        await supabase.from('spending_events').insert({
          event_id: crypto.randomUUID(),
          owner_id: uid,
          source: 'ios-owner',
          type: 'BUDGET_UPDATED',
          payload: { categoryId, enabled },
          is_simulated: false,
          occurred_at: new Date().toISOString(),
        });
        end();
      },
      async setMonthlyContribution(cents) {
        const uid = uidRef.current;
        if (!uid) throw new Error('Not signed in');
        const end = l.span('action:set-contribution', { cents });
        const { error } = await supabase.from('savings_plans').update({ monthly_contribution_cents: cents }).eq('owner_id', uid);
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        end();
        note(`Savings plan set to ${(cents / 100).toFixed(0)}/month`);
        await refetch();
      },
      async setHotspotEnabled(hotspotId, enabled) {
        const end = l.span('action:set-hotspot-enabled', { hotspotId: hotspotId.slice(0, 8), enabled });
        const { error } = await supabase.from('hotspots').update({ enabled }).eq('id', hotspotId);
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        end();
        await refetch();
      },
      async setHotspotVerified(hotspotId, verified) {
        const end = l.span('action:set-hotspot-verified', { hotspotId: hotspotId.slice(0, 8), verified });
        const { error } = await supabase.from('hotspots').update({ verified }).eq('id', hotspotId);
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        end();
        note(verified ? 'Hotspot location confirmed' : 'Hotspot location unconfirmed');
        await refetch();
      },
      async addHotspot({ name, latitude, longitude, radiusM }) {
        const uid = uidRef.current;
        if (!uid) throw new Error('Not signed in');
        const end = l.span('action:add-hotspot', { name, radiusM });
        const { error } = await supabase.from('hotspots').insert({
          owner_id: uid,
          name: name.slice(0, 60),
          latitude,
          longitude,
          radius_m: radiusM,
          enabled: true,
          // The user placed this pin on the map themselves; that is what `verified` means (§5.8).
          verified: true,
        });
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        end();
        note(`Added ${name}`);
        await refetch();
      },
      async removeHotspot(hotspotId) {
        const end = l.span('action:remove-hotspot', { hotspotId: hotspotId.slice(0, 8) });
        const { error } = await supabase.from('hotspots').delete().eq('id', hotspotId);
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        end();
        await refetch();
      },
      async reportHotspotEntry(hotspotId, simulated) {
        const end = l.span('action:report-hotspot', { hotspotId: hotspotId.slice(0, 8), simulated });
        try {
          const r = await callFunction<{ suppressed: string | null; message?: { title: string; body: string } }>('report-hotspot', {
            hotspotId,
            eventId: crypto.randomUUID(),
            occurredAt: new Date().toISOString(),
            isSimulated: simulated,
          });
          end({ suppressed: r.suppressed });
          await refetch();
          if (r.suppressed) {
            note(`Entry recorded, no alert sent (${r.suppressed})`);
            return `Recorded, but no alert: ${r.suppressed}`;
          }
          note(simulated ? 'Simulated hotspot entry' : 'Hotspot entry');
          return r.message ? `Sent: ${r.message.title}` : 'Alert sent';
        } catch (e) {
          end({ error: e instanceof Error ? e.message : String(e) });
          throw e;
        }
      },
      async revokeDevice(deviceId) {
        const uid = uidRef.current;
        if (!uid) throw new Error('Not signed in');
        const end = l.span('action:revoke-device', { deviceId: deviceId.slice(0, 8) });
        const { error } = await supabase.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId);
        if (error) {
          end({ error: error.message });
          throw new Error(error.message);
        }
        await supabase.from('spending_events').insert({
          event_id: crypto.randomUUID(),
          owner_id: uid,
          device_id: deviceId,
          source: 'ios-owner',
          type: 'DEVICE_REVOKED',
          payload: { deviceId },
          is_simulated: false,
          occurred_at: new Date().toISOString(),
        });
        end();
        note('Device revoked');
        await refetch();
      },
      async sendTestNotification() {
        const r = await callFunction<{ deliveries: { status: string; error?: string }[] }>('notify-test', {});
        const summary = r.deliveries.length ? r.deliveries.map((d) => d.status + (d.error ? ` (${d.error})` : '')).join(', ') : 'no phone registered for push yet';
        note(`Test notification: ${summary}`);
        return summary;
      },
    }),
    [refetch, note],
  );

  return { state, actions };
}

export const OwnerStateContext = StateCtx;
export const OwnerActionsContext = ActionsCtx;

export function useOwnerState(): OwnerState {
  const s = useContext(StateCtx);
  if (!s) throw new Error('useOwnerState must be used inside OwnerProvider');
  return s;
}

export function useOwnerActions(): OwnerActions {
  const a = useContext(ActionsCtx);
  if (!a) throw new Error('useOwnerActions must be used inside OwnerProvider');
  return a;
}
