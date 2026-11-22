// "I bought this": the ONLY path that turns a cart into confirmed spending. §7.6, §9.2, §13.3.
// A confirmation is split per budget category (a mixed cart → one ledger row per category, all sharing
// the confirmation key). Idempotent on confirmationKey. `action: 'reverse'` appends negative rows (undo).
import { findBudgetCategoryFor, formatCad, getMerchant, isMerchantKey, isProductCategoryKey, type BudgetCategory, type ProductCategoryKey } from '@rethink/shared';
import { adminClient } from '../_shared/env.ts';
import { resolveCaller } from '../_shared/auth.ts';
import { emitEvent } from '../_shared/events.ts';
import { notifyOwnerPhones } from '../_shared/push.ts';
import { handle, HttpError, json, optionalIso, readJson, requireCents, requireString, requireUuid } from '../_shared/http.ts';

interface Allocation {
  productCategory: ProductCategoryKey;
  amountCents: number;
}

/** `allocations: [{ productCategory, amountCents }]` — what the user actually paid, per budget. */
function parseAllocations(raw: unknown): Allocation[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) throw new HttpError(400, 'allocations must be a non-empty array', 'bad-input');
  const seen = new Set<string>();
  return raw.map((a, i) => {
    const o = (a ?? {}) as Record<string, unknown>;
    const key = requireString(o.productCategory, `allocations[${i}].productCategory`, 40);
    if (!isProductCategoryKey(key)) throw new HttpError(422, `Unknown product category ${key}`, 'unknown-category');
    if (seen.has(key)) throw new HttpError(400, `allocations: duplicate category ${key}`, 'bad-input');
    seen.add(key);
    return { productCategory: key, amountCents: requireCents(o.amountCents, `allocations[${i}].amountCents`, { min: 1 }) };
  });
}

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const caller = await resolveCaller(req, admin, ['owner', 'browser']);
  const b = await readJson(req);
  const source = caller.kind === 'device' ? 'browser' : 'ios-owner';

  const { data: period } = await admin.from('budget_periods').select('id').eq('owner_id', caller.ownerId).eq('is_active', true).maybeSingle();
  if (!period) throw new HttpError(422, 'No active budget period', 'no-period');

  // ---- Undo ---------------------------------------------------------------------------------
  if (b.action === 'reverse') {
    const eventId = requireUuid(b.eventId, 'eventId');
    let q = admin
      .from('expenses')
      .select('id, category_id, amount_cents, source, merchant_key, confirmation_key')
      .eq('owner_id', caller.ownerId)
      .neq('source', 'reversal');
    if (typeof b.confirmationKey === 'string') q = q.eq('confirmation_key', requireUuid(b.confirmationKey, 'confirmationKey'));
    else q = q.eq('id', requireUuid(b.expenseId, 'expenseId'));
    const { data: originals } = await q;
    if (!originals || originals.length === 0) throw new HttpError(404, 'Expense not found', 'not-found');

    const { data: reversals, error } = await admin
      .from('expenses')
      .insert(originals.map((o) => ({
        owner_id: caller.ownerId,
        period_id: period.id,
        category_id: o.category_id,
        amount_cents: -o.amount_cents,
        source: 'reversal',
        merchant_key: o.merchant_key,
        reversal_of: o.id,
      })))
      .select('id, reversal_of, amount_cents');
    if (error) {
      if (error.code === '23505') return json({ reversed: true, alreadyReversed: true });
      throw error;
    }
    const back = originals.reduce((n, o) => n + o.amount_cents, 0);
    const emittedReversal = await emitEvent(admin, {
      eventId,
      ownerId: caller.ownerId,
      deviceId: caller.deviceId,
      source,
      type: 'PURCHASE_CONFIRMED',
      payload: { reversal: true, reversals, totalCents: -back, merchantKey: originals[0]!.merchant_key },
      isSimulated: false,
      occurredAt: new Date().toISOString(),
    });
    // A receipt is only news on another device: undoing on the phone needs no push to the phone.
    if (caller.kind === 'device' && emittedReversal.inserted) {
      await notifyOwnerPhones(admin, caller.ownerId, emittedReversal.id, 'cart', {
        type: 'PURCHASE_REVERSED',
        title: 'Purchase undone',
        body: `${formatCad(back)} is back in your budgets.`,
        data: { reversal: true },
      });
    }
    return json({ reversed: true, reversals });
  }

  // ---- Confirm ------------------------------------------------------------------------------
  const confirmationKey = requireUuid(b.confirmationKey, 'confirmationKey');
  const eventId = typeof b.eventId === 'string' ? requireUuid(b.eventId, 'eventId') : confirmationKey;
  const merchantKey = requireString(b.merchantKey, 'merchantKey', 40);
  if (!isMerchantKey(merchantKey)) throw new HttpError(422, `Unknown merchant ${merchantKey}`, 'unknown-merchant');
  const allocations = parseAllocations(b.allocations);
  const totalCents = allocations.reduce((n, a) => n + a.amountCents, 0);
  const cartId = typeof b.cartId === 'string' ? b.cartId.slice(0, 120) : null;
  const confirmedAt = optionalIso(b.confirmedAt, 'confirmedAt');

  const { data: cats } = await admin
    .from('budget_categories')
    .select('id, name, allocated_cents, enabled, product_category')
    .eq('owner_id', caller.ownerId)
    .eq('period_id', period.id);
  const shaped: BudgetCategory[] = (cats ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    allocatedCents: c.allocated_cents,
    confirmedSpentCents: 0,
    enabled: c.enabled,
    productCategory: c.product_category ?? undefined,
  }));
  const targets = allocations.map((a) => {
    const t = findBudgetCategoryFor(shaped, a.productCategory);
    if (!t) throw new HttpError(422, `No enabled budget for ${a.productCategory}`, 'no-budget');
    return { ...a, categoryId: t.id, categoryName: t.name };
  });

  // One statement for all rows: either every row inserts or (on a retry) none do.
  const { data: inserted, error } = await admin
    .from('expenses')
    .insert(targets.map((t) => ({
      owner_id: caller.ownerId,
      period_id: period.id,
      category_id: t.categoryId,
      amount_cents: t.amountCents,
      source: 'purchase-confirmed',
      merchant_key: merchantKey,
      confirmation_key: confirmationKey,
      confirmed_at: confirmedAt,
    })))
    .select('id, category_id, amount_cents');

  let rows = inserted ?? [];
  let duplicate = false;
  if (error) {
    if (error.code !== '23505') throw error;
    const { data: prior } = await admin.from('expenses').select('id, category_id, amount_cents').eq('owner_id', caller.ownerId).eq('confirmation_key', confirmationKey);
    rows = prior ?? [];
    duplicate = true;
  }

  if (!duplicate && cartId) {
    // The pending scenario is gone: archive the matching cart so Home stops showing it as proposed.
    await admin
      .from('cart_snapshots')
      .update({ archived_at: new Date().toISOString() })
      .eq('owner_id', caller.ownerId)
      .eq('merchant_key', merchantKey)
      .eq('cart_id', cartId)
      .is('archived_at', null);
  }

  const expenses = rows.map((r) => {
    const t = targets.find((x) => x.categoryId === r.category_id);
    return { expenseId: r.id, categoryId: r.category_id, categoryName: t?.categoryName ?? null, productCategory: t?.productCategory ?? null, amountCents: r.amount_cents };
  });

  const emitted = await emitEvent(admin, {
    eventId,
    ownerId: caller.ownerId,
    deviceId: caller.deviceId,
    source,
    type: 'PURCHASE_CONFIRMED',
    payload: { confirmationKey, merchantKey, cartId, totalCents, expenses },
    isSimulated: false,
    occurredAt: confirmedAt,
  });

  // Receipt on the phone when the purchase was confirmed somewhere else (the browser).
  // The budget line is the point: this is the moment the number actually moved.
  if (caller.kind === 'device' && emitted.inserted && !duplicate) {
    const label = isMerchantKey(merchantKey) ? getMerchant(merchantKey).label : merchantKey;
    const names = expenses.map((e) => e.categoryName).filter((n): n is string => !!n);
    await notifyOwnerPhones(admin, caller.ownerId, emitted.id, 'cart', {
      type: 'PURCHASE_CONFIRMED',
      title: `${formatCad(totalCents)} at ${label}`,
      body: names.length > 0 ? `Recorded against ${names.join(' and ')}. Undo from the extension if that was wrong.` : 'Recorded.',
      data: { confirmationKey, merchantKey },
    });
  }

  return json({ confirmationKey, totalCents, expenses, duplicate, eventRecorded: emitted.inserted });
}));
