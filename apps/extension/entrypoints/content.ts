/**
 * Content script: the overlay and the cart mirror (SPEC §7.2, §7.5, §7.6; WEB-01..03).
 *
 * It runs only on hosts in the merchant registry. On a product page it reads the product of record,
 * classifies it, and shows what buying it would do to the budget that product belongs to. On every
 * page of an auto-mirror store it watches the Ajax cart and publishes snapshots, which is what makes
 * the phone move without a refresh.
 *
 * Two rules it must never break: observing is not spending (nothing here writes an expense), and
 * all money maths comes from @rethink/shared.
 */
import {
  AI_THRESHOLD,
  classifyProduct,
  colorForBudget,
  computeBudgetConsequence,
  findBudgetCategoryFor,
  findMerchantByHost,
  formatCad,
  getProductCategory,
  MERCHANT_HOSTS,
  type BudgetCategory,
  type MerchantDef,
} from '@rethink/shared';

import { log } from '@/lib/log';
import { mountOverlay, type OverlayHandle, type OverlayState } from '@/lib/overlay';
import { getPairing, getSnapshot, isUnauthorized, publishCart, watchPairing, type BrowserSnapshot, type Pairing } from '@/lib/rethink';
import { cartSignature, detectProduct, readCart, type DetectedProduct } from '@/lib/shopify';

const POLL_MS = 3_000;

export default defineContentScript({
  matches: MERCHANT_HOSTS.map((h) => `https://${h}/*`),
  async main() {
    const l = log.child('content');
    const merchant = findMerchantByHost(location.hostname);
    if (!merchant) {
      l.warn('host not in registry', { host: location.hostname });
      return;
    }
    l.info('loaded', { merchant: merchant.key, platform: merchant.platform, cartMirror: merchant.cartMirror, path: location.pathname });

    if (merchant.platform !== 'shopify') {
      l.info('no adapter for this platform yet; overlay stays off', { platform: merchant.platform });
      return;
    }
    const store: MerchantDef = merchant;

    const overlay = mountOverlay();
    let pairing: Pairing | null = await getPairing();
    let snapshot: BrowserSnapshot | null = null;
    let product: DetectedProduct | null = null;
    let lastUrl = location.href;
    let lastCartSig = '';
    let stopped = false;

    watchPairing((p) => {
      pairing = p;
      snapshot = null;
      l.info(p ? 'paired' : 'unpaired', { deviceId: p?.deviceId });
      void tick();
    });

    /** The one place the overlay's words are decided. All money comes from the shared functions. */
    function viewFor(p: DetectedProduct | null, snap: BrowserSnapshot | null): { state: OverlayState; color: string } {
      if (!p) return { state: { kind: 'hidden' }, color: '#9AA1A7' };
      if (!pairing) return { state: { kind: 'unpaired' }, color: '#9AA1A7' };
      if (p.currency !== 'CAD') return { state: { kind: 'wrong-currency', currency: p.currency || 'another currency' }, color: '#9AA1A7' };
      if (!snap) return { state: { kind: 'hidden' }, color: '#9AA1A7' };

      const verdict = classifyProduct(p.context);
      const def = getProductCategory(verdict.category);
      const enabled: BudgetCategory[] = snap.categories.filter((c) => c.enabled);
      const budget = findBudgetCategoryFor(enabled, verdict.category);
      const color = budget ? colorForBudget(budget) : def.color.dark;

      if (!budget) return { state: { kind: 'no-budget', categoryLabel: def.label }, color };
      if (p.unitPriceCents === null) return { state: { kind: 'no-price', categoryLabel: def.label }, color };

      const c = computeBudgetConsequence(budget, p.unitPriceCents);
      const over = (c.cartOverageCents ?? 0) > 0;
      const projected = c.projectedRemainingCents;
      return {
        state: {
          kind: 'ready',
          categoryLabel: def.label,
          budgetName: budget.name,
          remainingText: `${formatCad(Math.max(0, c.remainingCents))} left in ${budget.name}`,
          projectedText:
            projected === null
              ? 'Impact unavailable'
              : projected >= 0
                ? `${formatCad(projected)} left if you buy this`
                : `${formatCad(-projected)} over if you buy this`,
          over,
          priceText: formatCad(p.unitPriceCents),
          guess: verdict.confidence < AI_THRESHOLD,
        },
        color,
      };
    }

    async function refreshSnapshot(): Promise<void> {
      if (!pairing) return;
      try {
        snapshot = await getSnapshot(pairing);
      } catch (e) {
        if (isUnauthorized(e)) {
          l.warn('device token rejected; treat as unpaired');
          pairing = null;
          snapshot = null;
        }
      }
    }

    async function refreshProduct(): Promise<void> {
      const url = new URL(location.href);
      product = await detectProduct(store, url);
      if (product) {
        const verdict = classifyProduct(product.context);
        l.info('product detected', {
          handle: product.handle,
          priceCents: product.unitPriceCents,
          currency: product.currency,
          category: verdict.category,
          subtype: verdict.subtype,
          confidence: verdict.confidence,
          reasons: verdict.reasons.slice(0, 4).join(' '),
        });
      }
    }

    /** Publish the Ajax cart when it changes. Observing a cart never records spending. */
    async function mirrorCart(): Promise<void> {
      if (!pairing || store.cartMirror !== 'auto') return;
      const cart = await readCart(store);
      if (!cart) return;
      if (cart.currency && cart.currency !== 'CAD') {
        l.warn('cart is not CAD; not publishing', { currency: cart.currency });
        return;
      }
      const sig = cartSignature(cart);
      if (sig === lastCartSig) return;
      lastCartSig = sig;
      try {
        await publishCart(pairing, {
          cartId: cart.cartId,
          merchantKey: store.key as Parameters<typeof publishCart>[1]['merchantKey'],
          currency: 'CAD',
          source: 'retailer-detected',
          syncQuality: cart.items.some((i) => i.unitPriceCents === null) ? 'partial' : 'complete',
          items: cart.items,
          includesTax: false,
          includesShipping: false,
          discountStatus: cart.discountStatus,
        });
      } catch (e) {
        if (isUnauthorized(e)) {
          pairing = null;
          snapshot = null;
        }
        lastCartSig = ''; // retry on the next tick rather than going quiet
      }
    }

    async function tick(): Promise<void> {
      if (stopped || document.visibilityState === 'hidden') return;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        l.debug('url changed', { path: location.pathname });
        await refreshProduct();
      }
      await Promise.all([refreshSnapshot(), mirrorCart()]);
      const { state, color } = viewFor(product, snapshot);
      overlay.render(state, color);
    }

    await refreshProduct();
    await tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    document.addEventListener('visibilitychange', () => void tick());
    window.addEventListener('pagehide', () => {
      stopped = true;
      clearInterval(timer);
      (overlay as OverlayHandle).destroy();
    });
  },
});
