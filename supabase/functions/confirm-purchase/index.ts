// "I bought this": the ONLY path that turns a cart into confirmed spending. §7.6, §9.2, §13.3.
// Idempotent on confirmationKey; supports a reversal (undo) that appends a negative ledger row.
import { findBudgetCategoryFor, isMerchantKey, isProductCategoryKey, type BudgetCategory } from '@rethink/shared';
import { adminClient } from '../_shared/env.ts';
import { resolveCaller } from '../_shared/auth.ts';
import { emitEvent } from '../_shared/events.ts';
import { handle, HttpError, json, optionalIso, readJson, requireCents, requireString, requireUuid } from '../_shared/http.ts';

Deno.serve(handle(async (req) => {
  const admin = adminClient();
  const caller = await resolveCaller(req, admin, ['owner', 'browser']);
  const b = await readJson(req);
  const action = b.action === 'reverse' ? 'reverse' : 'confirm';

  const { data: period } = await admin.from('budget_periods').select('id').eq('owner_id', caller.ownerId).eq('is_active', true).maybeSingle();
  if (!period) throw new HttpError(422, 'No active budget period', 'no-period');

  if (action === 'reverse') {
    const expenseId = requireUuid(b.expenseId, 'expenseId');
    const eventId = requireUuid(b.eventId, 'eventId');
    const { data: original } = await admin
      .from('expenses')
      .select('id, category_id, amount_cents, source, merchant_key, confirmation_key')
      .eq('id', expenseId)
      .eq('owner_id', caller.ownerId)
      .maybeSingle();
    if (!original) throw new HttpError(404, 'Expense not found', 'not-found');
    if (original.source === 'reversal') throw new HttpError(422, 'Cannot reverse a reversal', 'bad-input');

    const { data: reversal, error } = await admin
      .from('expenses')
      .insert({
        owner_id: caller.ownerId,
        period_id: period.id,
        category_id: original.category_id,
        amount_cents: -original.amount_cents,
        source: 'reversal',
        merchant_key: original.merchant_key,
        reversal_of: original.id,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return json({ reversed: true, alreadyReversed: true });
      throw error;
    }
    await emitEvent(admin, {
      eventId,
      ownerId: caller.ownerId,
      deviceId: caller.deviceId,
      source: caller.kind === 'device' ? 'browser' : 'ios-owner',
      type: 'PURCHASE_CONFIRMED',
      payload: { reversalOf: original.id, expenseId: reversal.id, amountCents: -original.amount_cents, merchantKey: original.merchant_key },
      isSimulated: false,
      occurredAt: new Date().toISOString(),
    });
    return json({ reversed: true, reversalId: reversal.id });
  }

  const confirmationKey = requireUuid(b.confirmationKey, 'confirmationKey');
  const eventId = typeof b.eventId === 'string' ? requireUuid(b.eventId, 'eventId') : confirmationKey;
  const amountCents = requireCents(b.amountCents, 'amountCents', { min: 1 });
  const merchantKey = requireString(b.merchantKey, 'merchantKey', 40);
  if (!isMerchantKey(merchantKey)) throw new HttpError(422, `Unknown merchant ${merchantKey}`, 'unknown-merchant');
  const productCategory = requireString(b.productCategory, 'productCategory', 40);
  if (!isProductCategoryKey(productCategory)) throw new HttpError(422, `Unknown product category ${productCategory}`, 'unknown-category');
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
  const target = findBudgetCategoryFor(shaped, productCategory);
  if (!target) throw new HttpError(422, `No enabled budget for ${productCategory}`, 'no-budget');

  const { data: inserted, error } = await admin
    .from('expenses')
    .insert({
      owner_id: caller.ownerId,
      period_id: period.id,
      category_id: target.id,
      amount_cents: amountCents,
      source: 'purchase-confirmed',
      merchant_key: merchantKey,
      confirmation_key: confirmationKey,
      confirmed_at: confirmedAt,
    })
    .select('id')
    .maybeSingle();

  let expenseId: string;
  let duplicate = false;
  if (error) {
    if (error.code !== '23505') throw error;
    const { data: prior } = await admin.from('expenses').select('id').eq('owner_id', caller.ownerId).eq('confirmation_key', confirmationKey).single();
    expenseId = prior!.id;
    duplicate = true;
  } else {
    expenseId = inserted!.id;
  }

  if (!duplicate && cartId) {
    // The pending scenario is gone: archive the matching cart(s) so Home stops showing it as proposed.
    await admin
      .from('cart_snapshots')
      .update({ archived_at: new Date().toISOString() })
      .eq('owner_id', caller.ownerId)
      .eq('merchant_key', merchantKey)
      .eq('cart_id', cartId)
      .is('archived_at', null);
  }

  const emitted = await emitEvent(admin, {
    eventId,
    ownerId: caller.ownerId,
    deviceId: caller.deviceId,
    source: caller.kind === 'device' ? 'browser' : 'ios-owner',
    type: 'PURCHASE_CONFIRMED',
    payload: { expenseId, amountCents, merchantKey, productCategory, categoryId: target.id, cartId },
    isSimulated: false,
    occurredAt: confirmedAt,
  });

  return json({ expenseId, categoryId: target.id, categoryName: target.name, amountCents, duplicate, eventRecorded: emitted.inserted });
}));
