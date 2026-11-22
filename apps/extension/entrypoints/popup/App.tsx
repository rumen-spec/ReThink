/**
 * Popup: pair this browser, then answer three questions and nothing else —
 * what is in the cart, which budgets it touches, and did you actually buy it.
 *
 * Every line comes from `get-snapshot` (polled every 3 s); nothing is hardcoded. Budgets the cart
 * does not touch are not shown: the phone is where you browse all of them. Only the explicit
 * "Yes, I bought it" records spending (SPEC §1.4), and it can be undone from here.
 */
import {
  cartSubtotalsByCategory,
  colorForBudget,
  computeBudgetConsequence,
  findBudgetCategoryFor,
  formatCad,
  getMerchant,
  getProductCategory,
  isMerchantKey,
  isProductCategoryKey,
  MERCHANTS,
  type BudgetCategory,
  type CartItem,
  type ProductCategoryKey,
} from '@rethink/shared';
import { useEffect, useState } from 'react';

import { log } from '@/lib/log';
import {
  clearPairing,
  confirmPurchase,
  getPairing,
  getSnapshot,
  isUnauthorized,
  pair,
  snapshotSignature,
  undoPurchase,
  watchPairing,
  type BrowserSnapshot,
  type Pairing,
} from '@/lib/rethink';

import './App.css';

const l = log.child('popup');

const WATCHED = MERCHANTS.filter((m) => m.tier === 'demo')
  .map((m) => m.label)
  .join(' · ');

/** Short money for the chip fraction: "$20.25 / $50" rather than "$20.25 / $50.00". */
const dollars = (cents: number): string => (cents % 100 === 0 ? `$${Math.round(cents / 100).toLocaleString('en-CA')}` : formatCad(cents));

export default function App() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('Chrome on Mac');
  const [snap, setSnap] = useState<BrowserSnapshot | null>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  /** Set once a purchase is recorded, so the panel can offer an exact undo. */
  const [recorded, setRecorded] = useState<{ key: string; totalCents: number } | null>(null);

  useEffect(() => {
    void getPairing().then((p) => {
      l.info('popup opened', { paired: !!p, owner: p?.ownerDisplayName ?? null, deviceId: p?.deviceId ?? null });
      setPairing(p);
    });
    return watchPairing(setPairing);
  }, []);

  // Phone → browser direction: poll the role-filtered snapshot while the panel is open (§13.1).
  useEffect(() => {
    if (!pairing) return;
    let alive = true;
    let lastSig = '';
    const tick = async () => {
      try {
        const s = await getSnapshot(pairing);
        if (!alive) return;
        const sig = snapshotSignature(s);
        if (sig !== lastSig) {
          l.info(lastSig ? 'snapshot changed (phone → browser)' : 'snapshot loaded', {
            categories: s.categories.map((c) => `${c.name}:${c.allocatedCents - c.confirmedSpentCents}`),
            carts: s.carts.map((c) => `${c.merchant_key}@v${c.version}`),
          });
          lastSig = sig;
        }
        setSnap(s);
        setLastSync(new Date());
      } catch (e) {
        if (isUnauthorized(e)) {
          l.warn('device token rejected; this browser was revoked on the phone');
          setStatus('This browser was revoked on the phone. Pair again.');
          await clearPairing();
        } else setStatus(`sync failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pairing]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      setStatus(await fn());
    } catch (e) {
      l.error('action failed', e);
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (pairing === undefined) {
    return (
      <main className="panel">
        <p className="meta">…</p>
      </main>
    );
  }

  if (!pairing) {
    return (
      <main className="panel">
        <h1>ReThink</h1>
        <p className="body">
          On your phone: Me → <b>Pair Chrome</b>, then enter the code.
        </p>
        <label className="label" htmlFor="code">Pairing code</label>
        <input id="code" className="input code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} autoFocus placeholder="ABC234" />
        <label className="label" htmlFor="label">This browser's name</label>
        <input id="label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        <button
          className="btn primary"
          disabled={busy || code.length < 6}
          onClick={() =>
            run(async () => {
              const p = await pair(code, label);
              return `Connected to ${p.ownerDisplayName ?? 'profile'}`;
            })
          }>
          Connect
        </button>
        {status && <p className="meta">{status}</p>}
      </main>
    );
  }

  // The cart the content script mirrored, newest first — a seeded demo cart must never win over the
  // one you are actually looking at. An emptied cart is archived server-side, so it is absent here.
  const cart = [...(snap?.carts ?? [])]
    .filter((c) => Array.isArray(c.items) && c.items.length > 0)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
  const items: CartItem[] = (cart?.items ?? []) as CartItem[];
  const merchantLabel = cart && isMerchantKey(cart.merchant_key) ? getMerchant(cart.merchant_key).label : (cart?.merchant_key ?? '');
  const enabled: BudgetCategory[] = (snap?.categories ?? []).filter((c) => c.enabled);

  // What the cart proposes, per product category, and where each amount lands.
  const byCategory = cartSubtotalsByCategory(items);
  const touched = Object.entries(byCategory)
    .filter((e): e is [string, number | null] => isProductCategoryKey(e[0]))
    .map(([key, cents]) => ({
      key: key as ProductCategoryKey,
      label: getProductCategory(key as ProductCategoryKey).label,
      cents,
      budget: findBudgetCategoryFor(enabled, key as ProductCategoryKey) ?? null,
    }));

  const withBudget = touched.filter((t) => t.budget && t.cents !== null && t.cents > 0);
  const unbudgeted = touched.filter((t) => !t.budget);
  const untracked = unbudgeted.reduce((n, t) => n + (t.cents ?? 0), 0);
  const allocatable = withBudget.reduce((n, t) => n + (t.cents ?? 0), 0);

  const confirm = () =>
    run(async () => {
      const allocations = withBudget.map((t) => ({ productCategory: t.key, amountCents: t.cents as number }));
      if (allocations.length === 0) throw new Error('Nothing in this cart has a budget to record against.');
      const r = await confirmPurchase(pairing, { merchantKey: cart!.merchant_key, cartId: cart!.cart_id, allocations });
      setRecorded({ key: r.confirmationKey, totalCents: r.totalCents });
      return `Recorded ${formatCad(r.totalCents)}`;
    });

  const undo = () =>
    run(async () => {
      if (!recorded) return '';
      await undoPurchase(pairing, recorded.key);
      setRecorded(null);
      return 'Undone. Nothing is recorded as spent.';
    });

  return (
    <main className="panel">
      <header className="row">
        <h1>ReThink</h1>
        <span className="meta">
          {pairing.ownerDisplayName ?? 'profile'} · {lastSync ? `synced ${lastSync.toLocaleTimeString()}` : 'syncing…'}
        </span>
      </header>

      {recorded ? (
        <section className="card">
          <div className="row">
            <span className="h2">Recorded</span>
            <span className="money">{formatCad(recorded.totalCents)}</span>
          </div>
          <div className="meta">Your budgets on the phone have moved. This is the only thing that changes what you have spent.</div>
          <button className="btn" disabled={busy} onClick={() => void undo()}>
            Undo
          </button>
        </section>
      ) : null}

      {!cart ? (
        <section className="card">
          <div className="h2">No cart yet</div>
          <div className="meta">Open a product on {WATCHED} and add it to the bag. It shows up here and on your phone within a few seconds.</div>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="row">
              <span className="h2">{merchantLabel}</span>
              <span className="money">{cart.subtotal_cents === null ? 'Partial' : formatCad(cart.subtotal_cents)}</span>
            </div>
            {items.map((it, i) => (
              <div className="row" key={`${it.productKey}:${it.variantKey ?? i}`}>
                <span className="body">
                  {it.quantity > 1 ? `${it.quantity} × ` : ''}
                  {it.title}
                </span>
                <span className="meta">{it.unitPriceCents === null ? 'no price' : formatCad(it.unitPriceCents * it.quantity)}</span>
              </div>
            ))}
          </section>


          <section className="card">
            <div className="h2">Did you buy it?</div>
            <div className="meta">
              {allocatable > 0
                ? `Records ${formatCad(allocatable)} against ${withBudget.map((t) => t.budget!.name).join(' and ')}. Undo is one tap.`
                : 'Nothing in this cart has a budget to record against yet.'}
              {untracked > 0 ? ` ${formatCad(untracked)} has no budget and stays untracked.` : ''}
            </div>
            <button className="btn primary" disabled={busy || allocatable === 0} onClick={() => void confirm()}>
              Yes, I bought it
            </button>
          </section>

          {/* Tags, not cards: which budgets this cart touches, kept out of the cart's way. */}
          <div className="tags">
            {touched.map((t) => {
              const color = t.budget ? colorForBudget(t.budget) : getProductCategory(t.key).color.dark;
              if (!t.budget) {
                return (
                  <span className="tag none" style={{ ['--edge' as string]: color }} key={t.key}>
                    {t.label} <span className="v">no budget</span>
                  </span>
                );
              }
              const over = computeBudgetConsequence(t.budget, t.cents ?? 0).status === 'over';
              const projectedSpent = t.budget.confirmedSpentCents + (t.cents ?? 0);
              return (
                <span className={`tag ${over ? 'over' : ''}`} style={{ ['--edge' as string]: color }} key={t.key}>
                  {t.budget.name}{' '}
                  <span className="v">
                    {dollars(projectedSpent)}/{dollars(t.budget.allocatedCents)}
                  </span>
                </span>
              );
            })}
          </div>
        </>
      )}

      <footer className="row">
        <button className="btn" onClick={() => void clearPairing()}>
          Unpair this browser
        </button>
        <span className="meta">{status || (cart ? `cart v${cart.version}` : 'watching')}</span>
      </footer>
    </main>
  );
}
