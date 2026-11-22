// Browser publishes a merchant-scoped cart snapshot. §7.5, §12.2, §13.3. Never an expense.
import { cartSubtotalCents, cartSubtotalsByCategory, isMerchantKey, isProductCategoryKey, isSubtypeOf, type CartItem } from '@rethink/shared';
import { adminClient } from '../_shared/env.ts';
import { resolveCaller } from '../_shared/auth.ts';
import { emitEvent } from '../_shared/events.ts';
import { handle, HttpError, json, optionalIso, readJson, requireString, requireUuid } from '../_shared/http.ts';
import { sha256Hex } from '../_shared/tokens.ts';

const SOURCES = ['retailer-detected', 'manual-consideration'] as const;
const QUALITIES = ['complete', 'partial', 'manual', 'stale', 'unavailable'] as const;
const DISCOUNTS = ['unknown', 'none', 'applied'] as const;

function parseItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw) || raw.length > 100) throw new HttpError(400, 'items must be an array (≤100)', 'bad-input');
  return raw.map((it, i) => {
    if (!it || typeof it !== 'object') throw new HttpError(400, `items[${i}] invalid`, 'bad-input');
    const o = it as Record<string, unknown>;
    const price = o.unitPriceCents;
    if (price !== null && (typeof price !== 'number' || !Number.isInteger(price) || price < 0)) {
      throw new HttpError(400, `items[${i}].unitPriceCents must be integer cents or null`, 'bad-input');
    }
    const qty = o.quantity;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 0 || qty > 99) throw new HttpError(400, `items[${i}].quantity invalid`, 'bad-input');
    const cat = o.productCategory;
    if (!isProductCategoryKey(cat)) throw new HttpError(400, `items[${i}].productCategory must be a registry key ('other' if nothing fits)`, 'bad-input');
    const sub = o.subtype ?? undefined;
    if (sub !== undefined && !isSubtypeOf(cat, sub)) throw new HttpError(400, `items[${i}].subtype does not belong to ${cat}`, 'bad-input');
    return {
      productKey: requireString(o.productKey, `items[${i}].productKey`),
      variantKey: typeof o.variantKey === 'string' ? o.variantKey : null,
      title: requireString(o.title, `items[${i}].title`, 300),
      unitPriceCents: price as number | null,
      quantity: qty,
      productCategory: cat,
      ...(sub !== undefined ? { subtype: sub } : {}),
      ...(typeof o.imageUrl === 'string' && o.imageUrl.startsWith('https://') ? { imageUrl: o.imageUrl.slice(0, 500) } : {}),
    };
  });
}

function oneOf<T extends readonly string[]>(v: unknown, allowed: T, name: string, fallback?: T[number]): T[number] {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'string' || !allowed.includes(v)) throw new HttpError(400, `${name} must be one of ${allowed.join(', ')}`, 'bad-input');
  return v;
}

async function fingerprintOf(items: CartItem[], source: string, subtotal: number | null): Promise<string> {
  const canon = [...items]
    .map((i) => [i.productKey, i.variantKey ?? '', i.unitPriceCents ?? 'null', i.quantity, i.productCategory ?? 'null'].join('|'))
    .sort()
    .join('\n');
  return sha256Hex(`${source}\n${subtotal ?? 'null'}\n${canon}`);
}

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const caller = await resolveCaller(req, admin, ['browser']);
  if (caller.kind !== 'device') throw new HttpError(403, 'Browser device required', 'forbidden');
  const b = await readJson(req);

  const eventId = requireUuid(b.eventId, 'eventId');
  const merchantKey = requireString(b.merchantKey, 'merchantKey', 40);
  if (!isMerchantKey(merchantKey)) throw new HttpError(422, `Unknown merchant ${merchantKey}`, 'unknown-merchant');
  const currency = requireString(b.currency, 'currency', 3).toUpperCase();
  if (currency !== 'CAD') throw new HttpError(422, 'Only CAD carts are accepted (no FX in MVP)', 'wrong-currency');
  const sessionId = requireString(b.sessionId, 'sessionId', 120);
  const cartId = requireString(b.cartId, 'cartId', 120);
  const source = oneOf(b.source, SOURCES, 'source');
  const syncQuality = oneOf(b.syncQuality, QUALITIES, 'syncQuality');
  const discountStatus = oneOf(b.discountStatus, DISCOUNTS, 'discountStatus', 'unknown');
  const version = typeof b.version === 'number' && Number.isInteger(b.version) && b.version >= 1 ? b.version : 1;
  const observedAt = optionalIso(b.observedAt, 'observedAt');
  const items = parseItems(b.items);

  // Server recomputes the subtotal with the shared function; the client's number is never trusted.
  const subtotalCents = cartSubtotalCents(items);
  const byCategory = cartSubtotalsByCategory(items);
  const fingerprint = await fingerprintOf(items, source, subtotalCents);

  const scope = { owner_id: caller.ownerId, merchant_key: merchantKey, device_id: caller.deviceId, session_id: sessionId };
  const { data: existing } = await admin
    .from('cart_snapshots')
    .select('id, version, fingerprint, archived_at')
    .match(scope)
    .maybeSingle();

  if (existing && !existing.archived_at) {
    if (existing.fingerprint === fingerprint) return json({ cartId, version: existing.version, deduped: true, subtotalCents });
    if (version < existing.version) return json({ error: 'Stale cart version', code: 'stale-version', currentVersion: existing.version }, 409);
  }
  const nextVersion = existing && !existing.archived_at ? Math.max(version, existing.version + 1) : Math.max(version, 1);

  const row = {
    ...scope,
    cart_id: cartId,
    items,
    subtotal_cents: subtotalCents,
    currency,
    source,
    sync_quality: syncQuality,
    includes_tax: b.includesTax === true,
    includes_shipping: b.includesShipping === true,
    discount_status: discountStatus,
    fingerprint,
    version: nextVersion,
    observed_at: observedAt,
    archived_at: null,
  };
  const { error } = await admin.from('cart_snapshots').upsert(row, { onConflict: 'owner_id,merchant_key,device_id,session_id' });
  if (error) throw error;

  const emitted = await emitEvent(admin, {
    eventId,
    ownerId: caller.ownerId,
    deviceId: caller.deviceId,
    source: 'browser',
    type: 'CART_UPDATED',
    payload: { merchantKey, cartId, cartVersion: nextVersion, subtotalCents, byCategory, itemCount: items.reduce((n, i) => n + i.quantity, 0), syncQuality },
    isSimulated: false,
    occurredAt: observedAt,
  });

  return json({ cartId, version: nextVersion, subtotalCents, byCategory, fingerprint, eventRecorded: emitted.inserted });
}));
