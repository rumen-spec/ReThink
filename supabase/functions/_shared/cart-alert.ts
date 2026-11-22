/**
 * Cart alerts (SPEC §13.2). A browser cart changing is not by itself worth interrupting someone:
 * they are looking at the screen it happened on. The one moment that is worth a buzz on the phone
 * is the cart crossing a budget — and then only once, not on every quantity tweak.
 *
 * The rules, in order:
 *  1. Only a cart that puts an enabled budget over gets an alert at all.
 *  2. Every change to how far over you are is worth saying, because that is the number the alert
 *     is about. Adding a second item, changing a quantity, swapping to a dearer size: all news.
 *  3. The only thing suppressed is a burst — the same overage republished within seconds, which is
 *     a retry or a double publish rather than a decision the shopper made.
 *
 * Observing a cart never records spending; this file only reads budgets and sends a message.
 */
import { computeBudgetConsequence, findBudgetCategoryFor, formatCad, getMerchant, isMerchantKey, isProductCategoryKey, type BudgetCategory, type ProductCategoryKey } from '@rethink/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyOwnerPhones, type DeliveryReport } from './push.ts';

/** Anti-burst window only: the same figure republished this fast is a retry, not a new decision. */
const BURST_MS = 20 * 1000;

export interface CartAlertOutcome {
  pushed: boolean;
  /** Why it stayed quiet, for logs and for the function's response. */
  reason?: 'within-budget' | 'no-period' | 'no-budget' | 'cooldown' | 'duplicate-event';
  overageCents?: number;
  deliveries?: DeliveryReport[];
}

/**
 * Decide and, if warranted, send. `byCategory` is the subtotal per product category that
 * publish-cart already computed with the shared function; budgets come from the balances view, so
 * confirmed spending is included and cart items never are.
 */
export async function maybeAlertOnCart(
  admin: SupabaseClient,
  ownerId: string,
  eventRowId: string,
  input: {
    merchantKey: string;
    byCategory: Partial<Record<ProductCategoryKey, number | null>>;
    cartId: string;
  },
): Promise<CartAlertOutcome> {
  const { data: period } = await admin.from('budget_periods').select('id').eq('owner_id', ownerId).eq('is_active', true).maybeSingle();
  if (!period) return { pushed: false, reason: 'no-period' };

  const { data: rows } = await admin
    .from('budget_category_balances')
    .select('id, name, allocated_cents, confirmed_spent_cents, enabled, product_category')
    .eq('period_id', period.id)
    .eq('enabled', true);

  const budgets: BudgetCategory[] = (rows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    allocatedCents: c.allocated_cents,
    confirmedSpentCents: c.confirmed_spent_cents,
    enabled: c.enabled,
    productCategory: c.product_category ?? undefined,
  }));

  // The budget this cart pushes furthest over, and the total across all of them.
  let worst: { name: string; overCents: number; remainingCents: number } | null = null;
  let totalOverage = 0;
  let routed = false;
  for (const [key, cents] of Object.entries(input.byCategory)) {
    if (cents === null || cents === undefined || !isProductCategoryKey(key)) continue;
    const budget = findBudgetCategoryFor(budgets, key);
    if (!budget) continue;
    routed = true;
    const c = computeBudgetConsequence(budget, cents);
    const over = c.cartOverageCents ?? 0;
    totalOverage += over;
    if (over > 0 && (!worst || over > worst.overCents)) worst = { name: budget.name, overCents: over, remainingCents: c.remainingCents };
  }

  if (!routed) return { pushed: false, reason: 'no-budget' };
  if (!worst || totalOverage === 0) return { pushed: false, reason: 'within-budget', overageCents: 0 };

  // Only swallow a repeat of the very same figure, and only for a few seconds.
  const since = new Date(Date.now() - BURST_MS).toISOString();
  const { data: recent } = await admin
    .from('spending_events')
    .select('payload, received_at')
    .eq('owner_id', ownerId)
    .eq('type', 'CART_UPDATED')
    .not('payload->>alertedOverageCents', 'is', null)
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(1);

  const last = recent?.[0]?.payload as { alertedOverageCents?: number } | undefined;
  if (last && last.alertedOverageCents === totalOverage) {
    return { pushed: false, reason: 'cooldown', overageCents: totalOverage };
  }

  const merchantLabel = isMerchantKey(input.merchantKey) ? getMerchant(input.merchantKey).label : input.merchantKey;
  const deliveries = await notifyOwnerPhones(admin, ownerId, eventRowId, 'cart', {
    type: 'CART_OVER_BUDGET',
    title: `${merchantLabel} cart`,
    // Calm, factual, and explicit that nothing has been spent (§4.4, §1.4).
    body: `This would put ${worst.name} ${formatCad(worst.overCents)} over. Nothing is recorded as spent yet.`,
    data: { merchantKey: input.merchantKey, cartId: input.cartId, overageCents: totalOverage },
  });

  // Remember what we alerted on, so the next publish can tell a tweak from an escalation.
  // Merged, never replaced: the event's own payload is the record of what the cart was.
  const { data: row } = await admin.from('spending_events').select('payload').eq('id', eventRowId).maybeSingle();
  await admin
    .from('spending_events')
    .update({
      payload: {
        ...((row?.payload as Record<string, unknown> | null) ?? {}),
        alertedOverageCents: totalOverage,
        alertedAt: new Date().toISOString(),
        alertedBudget: worst.name,
      },
    })
    .eq('id', eventRowId);

  return { pushed: true, overageCents: totalOverage, deliveries };
}
