/**
 * The in-page overlay (SPEC §5.11, §7.6). Everything lives in a closed-off shadow root so the
 * store's CSS cannot reach in and ours cannot leak out. It never blocks the page: it is a small
 * slab pinned to the bottom-right that the shopper can dismiss for the rest of the tab's life.
 *
 * It states one thing — what this product does to the budget it belongs to — and says plainly
 * when it cannot: not paired, not CAD, no budget for this category, or the classifier is unsure.
 */
import { log } from '@/lib/log';

const l = log.child('overlay');

export type OverlayState =
  | { kind: 'hidden' }
  | { kind: 'unpaired' }
  | { kind: 'wrong-currency'; currency: string }
  | { kind: 'no-budget'; categoryLabel: string }
  | { kind: 'no-price'; categoryLabel: string }
  | {
      kind: 'ready';
      categoryLabel: string;
      budgetName: string;
      /** Already-confirmed spending leaves this much before the product is considered. */
      remainingText: string;
      /** "$83.00 over if bought" / "$52.00 left if bought". */
      projectedText: string;
      over: boolean;
      priceText: string;
      /** Shown only when the classifier was unsure, so the shopper knows it is a guess. */
      guess: boolean;
    };

const HOST_ID = 'rethink-overlay-host';
const DISMISS_KEY = 'rethink.overlay.dismissed';

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
  width: 310px; max-width: calc(100vw - 36px);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
  color: #F0F2F3;
  background: linear-gradient(160deg, #1C2023, #0E1012);
  border-radius: 22px; padding: 16px 16px 14px;
  box-shadow: 2px 18px 34px rgba(0,0,0,.55), 0 5px 10px rgba(0,0,0,.4),
              -10px -11px 26px rgba(255,255,255,.05),
              inset 0 1px 1px rgba(255,255,255,.09), inset 0 -1px 1px rgba(0,0,0,.55);
  display: flex; flex-direction: column; gap: 8px;
}
.top { display: flex; align-items: center; gap: 8px; }
.mark { font-size: 12px; font-weight: 600; letter-spacing: .02em; color: #9AA1A7; flex: 1; }
.close {
  all: unset; cursor: pointer; width: 26px; height: 26px; border-radius: 13px;
  background: #272B30; color: #F0F2F3; font-size: 14px; line-height: 26px; text-align: center;
}
.close:focus-visible { outline: 2px solid #F0F2F3; outline-offset: 2px; }
.cat { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #9AA1A7; }
.dot { width: 8px; height: 8px; border-radius: 4px; background: #9085E9; flex: none; }
.headline { font-size: 22px; font-weight: 600; line-height: 28px; font-variant-numeric: tabular-nums; }
.line { font-size: 15px; line-height: 20px; }
.muted { color: #9AA1A7; }
.over { color: #F07A74; }
.foot { font-size: 12px; line-height: 16px; color: #9AA1A7; }
`;

export interface OverlayHandle {
  render(state: OverlayState, categoryColor?: string): void;
  destroy(): void;
}

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function mountOverlay(): OverlayHandle {
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  root.append(style, wrap);

  let attached = false;
  const attach = () => {
    if (!attached && document.body) {
      document.body.appendChild(host);
      attached = true;
    }
  };
  const detach = () => {
    if (attached) {
      host.remove();
      attached = false;
    }
  };

  const el = (tag: string, cls?: string, text?: string): HTMLElement => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  return {
    render(state, categoryColor = '#9AA1A7') {
      if (state.kind === 'hidden' || dismissed()) {
        detach();
        return;
      }
      wrap.replaceChildren();

      const top = el('div', 'top');
      top.append(el('span', 'mark', 'ReThink'));
      const close = el('button', 'close', '✕') as HTMLButtonElement;
      close.setAttribute('aria-label', 'Hide ReThink for this tab');
      close.addEventListener('click', () => {
        try {
          sessionStorage.setItem(DISMISS_KEY, '1');
        } catch {
          /* private mode: dismissal just will not persist */
        }
        l.info('dismissed for this tab');
        detach();
      });
      top.append(close);
      wrap.append(top);

      switch (state.kind) {
        case 'unpaired':
          wrap.append(el('div', 'headline', 'Not connected'));
          wrap.append(el('div', 'line muted', 'Open the ReThink extension and enter the code from your phone to see your budget here.'));
          break;
        case 'wrong-currency':
          wrap.append(el('div', 'headline', 'Not in Canadian dollars'));
          wrap.append(el('div', 'line muted', `This store is showing ${state.currency}. Your budgets are in CAD, so ReThink will not compare them.`));
          break;
        case 'no-budget': {
          const cat = el('div', 'cat');
          const dot = el('span', 'dot');
          dot.style.background = categoryColor;
          cat.append(dot, el('span', undefined, state.categoryLabel));
          wrap.append(cat);
          wrap.append(el('div', 'headline', `No ${state.categoryLabel} budget`));
          wrap.append(el('div', 'line muted', `Add one on your phone and this will show what the purchase does to it.`));
          break;
        }
        case 'no-price': {
          wrap.append(el('div', 'headline', 'Price not readable'));
          wrap.append(el('div', 'line muted', 'ReThink will not guess a price. Nothing has been recorded as spent.'));
          break;
        }
        case 'ready': {
          const cat = el('div', 'cat');
          const dot = el('span', 'dot');
          dot.style.background = categoryColor;
          cat.append(dot, el('span', undefined, `${state.categoryLabel} · ${state.priceText}`));
          wrap.append(cat);
          wrap.append(el('div', 'headline', state.remainingText));
          wrap.append(el('div', `line ${state.over ? 'over' : 'muted'}`, state.projectedText));
          wrap.append(el('div', 'foot', state.guess ? `Best guess: ${state.categoryLabel}. Nothing is recorded as spent until you say you bought it.` : 'Nothing is recorded as spent until you say you bought it.'));
          break;
        }
      }
      attach();
    },
    destroy() {
      detach();
    },
  };
}
