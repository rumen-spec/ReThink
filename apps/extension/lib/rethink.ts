/**
 * Extension-side client. No Supabase SDK: the browser never holds a user session, only the
 * revocable device token minted at pairing (SPEC §7.1, §12.4). Every call goes to an edge function.
 */
import { storage } from '#imports';
import type { BudgetCategory, CartItem, CartSnapshot, ProductCategoryKey } from '@rethink/shared';

import { log } from '@/lib/log';

const l = log.child('api');

const env = import.meta.env as Record<string, string | undefined>;
const SUPABASE_URL = env.WXT_SUPABASE_URL;
const ANON_KEY = env.WXT_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) throw new Error('Missing WXT_SUPABASE_URL / WXT_SUPABASE_ANON_KEY in apps/extension/.env');

export interface Pairing {
  deviceId: string;
  deviceToken: string;
  role: 'browser';
  ownerDisplayName: string | null;
  sessionId: string;
  pairedAt: string;
}

// `local`, not `session`: a browser restart before the judges arrive must not un-pair. The token is
// revocable from the phone at any time, which is the real safety net.
const pairingItem = storage.defineItem<Pairing | null>('local:rethink.pairing', { fallback: null });
const versionItem = storage.defineItem<number>('local:rethink.demoCartVersion', { fallback: 0 });

export const getPairing = () => pairingItem.getValue();
export const watchPairing = (cb: (p: Pairing | null) => void) => pairingItem.watch(cb);
export async function clearPairing(): Promise<void> {
  l.info('unpaired locally');
  await pairingItem.setValue(null);
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** `quiet` = routine polling: success is logged at debug, failures still at error. */
async function call<T>(name: string, body: unknown, deviceToken?: string, { quiet = false } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: ANON_KEY! };
  if (deviceToken) headers['x-rethink-device-token'] = deviceToken;
  const t0 = performance.now();
  const auth = deviceToken ? 'device' : 'none';
  const done = (outcome: Record<string, unknown>) => {
    const ms = Math.round(performance.now() - t0);
    if ('error' in outcome) l.error(`fn:${name} failed`, undefined, { ms, auth, ...outcome });
    else if (quiet) l.debug(`fn:${name} done`, { ms, auth, ...outcome });
    else l.info(`fn:${name} done`, { ms, auth, ...outcome });
  };
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    done({ error: e instanceof Error ? e.message : String(e), kind: 'network' });
    throw new ApiError(0, 'Network error: is the Supabase URL reachable?');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) {
    done({ error: json.error ?? `HTTP ${res.status}`, code: json.code, status: res.status });
    throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`, json.code);
  }
  done({ status: res.status });
  return json;
}

export async function pair(code: string, deviceLabel: string): Promise<Pairing> {
  const r = await call<{ deviceId: string; deviceToken: string; role: 'browser'; ownerDisplayName: string | null }>('pair-redeem', {
    code,
    deviceLabel,
    platform: 'chrome',
    consent: true,
  });
  const pairing: Pairing = { ...r, sessionId: crypto.randomUUID(), pairedAt: new Date().toISOString() };
  await pairingItem.setValue(pairing);
  // The logger scrubs `deviceToken`; it is never written in clear.
  l.info('paired', { deviceId: r.deviceId, deviceToken: r.deviceToken, owner: r.ownerDisplayName, deviceLabel });
  return pairing;
}

/** What get-snapshot returns for the browser role (role-filtered, no hotspots/devices). */
export interface BrowserSnapshot {
  role: 'browser';
  serverTime: string;
  profile: { displayName: string; onboardedAt: string | null } | null;
  period: { id: string; label: string } | null;
  categories: (BudgetCategory & { updatedAt: string })[];
  savingsPlan: { monthlyContributionCents: number; openingBalanceCents: number; illustrativeRateAnnual: number; horizonMonths: number } | null;
  carts: { cart_id: string; merchant_key: string; items: CartItem[]; subtotal_cents: number | null; version: number; updated_at: string }[];
}

export async function getSnapshot(p: Pairing): Promise<BrowserSnapshot> {
  return call<BrowserSnapshot>('get-snapshot', {}, p.deviceToken, { quiet: true });
}

/** Cheap change signature so the popup can log "snapshot changed" instead of every 3 s poll. */
export function snapshotSignature(s: BrowserSnapshot): string {
  const cats = s.categories.map((c) => `${c.id.slice(0, 8)}:${c.allocatedCents}:${c.confirmedSpentCents}:${c.enabled ? 1 : 0}`).join(',');
  const carts = s.carts.map((c) => `${c.merchant_key}@${c.version}`).join(',');
  return `${cats}|${carts}`;
}

export type PublishResult = { cartId: string; version: number; subtotalCents: number | null; byCategory: Partial<Record<ProductCategoryKey, number | null>>; deduped?: boolean };

/** Publish a merchant-scoped snapshot. The server recomputes the subtotal and dedupes by fingerprint. */
export async function publishCart(p: Pairing, cart: Omit<CartSnapshot, 'sessionId' | 'version' | 'observedAt' | 'subtotalCents'>): Promise<PublishResult> {
  const version = (await versionItem.getValue()) + 1;
  await versionItem.setValue(version);
  const eventId = crypto.randomUUID();
  l.debug('publish cart', { merchant: cart.merchantKey, cartId: cart.cartId, version, items: cart.items.length, eventId });
  const r = await call<PublishResult>(
    'publish-cart',
    { ...cart, sessionId: p.sessionId, version, observedAt: new Date().toISOString(), eventId },
    p.deviceToken,
  );
  l.info(r.deduped ? 'cart unchanged (deduped)' : 'cart published', { version: r.version, subtotalCents: r.subtotalCents, byCategory: r.byCategory });
  return r;
}

export interface ConfirmedExpense {
  expenseId: string;
  categoryId: string;
  categoryName: string | null;
  amountCents: number;
}
export interface ConfirmResult {
  confirmationKey: string;
  totalCents: number;
  expenses: ConfirmedExpense[];
  duplicate: boolean;
}

/**
 * "I bought this" — the ONLY call in the extension that turns a cart into confirmed spending
 * (SPEC §1.4). One ledger row per budget, all sharing the confirmation key, so undo is exact.
 * The server archives the matching cart, which is why the proposed figures disappear afterwards.
 */
export async function confirmPurchase(
  p: Pairing,
  args: { merchantKey: string; cartId: string | null; allocations: { productCategory: ProductCategoryKey; amountCents: number }[] },
): Promise<ConfirmResult> {
  const confirmationKey = crypto.randomUUID();
  l.info('confirming purchase', { merchant: args.merchantKey, allocations: args.allocations, confirmationKey });
  const r = await call<ConfirmResult>(
    'confirm-purchase',
    { ...args, confirmationKey, eventId: crypto.randomUUID(), confirmedAt: new Date().toISOString() },
    p.deviceToken,
  );
  l.info('purchase recorded', { totalCents: r.totalCents, rows: r.expenses.length, duplicate: r.duplicate });
  return r;
}

/** Undo by confirmation key: appends negative rows, never deletes history (SPEC §9.2). */
export async function undoPurchase(p: Pairing, confirmationKey: string): Promise<{ reversed: boolean }> {
  l.info('reversing purchase', { confirmationKey });
  return call<{ reversed: boolean }>('confirm-purchase', { action: 'reverse', confirmationKey, eventId: crypto.randomUUID() }, p.deviceToken);
}

export function isUnauthorized(e: unknown): boolean {
  return e instanceof ApiError && e.status === 401;
}
