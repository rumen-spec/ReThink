/**
 * Shopify adapter (SPEC §7.2, §7.5; probe evidence in docs/RETAILERS.md).
 *
 * Two jobs, both read-only:
 *  - **Product of record.** `/products/<handle>.js` under the merchant's CAD path is the price we
 *    trust. The rendered page can show a different number (clearance badges, a cached hero price),
 *    so the JSON wins and the DOM is only ever a cross-check.
 *  - **Cart mirror.** `/cart.js` under the same path, polled. Every line is classified on its own,
 *    because one cart can hold a hoodie and a lip gloss.
 *
 * Currency is verified, never assumed: if the storefront is not serving CAD the caller must refuse
 * budget math rather than compare Canadian budgets against US prices.
 */
import { classifyProduct, type CartItem, type ClassificationContext, type MerchantDef } from '@rethink/shared';

import { log } from '@/lib/log';

const l = log.child('shopify');

/** Everything the overlay needs about the product on screen. */
export interface DetectedProduct {
  handle: string;
  productKey: string;
  variantKey: string | null;
  title: string;
  unitPriceCents: number | null;
  currency: string;
  imageUrl?: string;
  context: ClassificationContext;
}

export interface MirroredCart {
  cartId: string;
  items: CartItem[];
  currency: string;
  /** Shopify applies discounts in the cart; `original_total_price > total_price` means one is on. */
  discountStatus: 'unknown' | 'none' | 'applied';
}

const joinPath = (root: string, rest: string): string => `${root.endsWith('/') ? root : `${root}/`}${rest}`;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
    if (!res.ok) {
      l.warn('fetch not ok', { url, status: res.status });
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    l.warn('fetch failed', { url, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * The product handle for a Shopify PDP, or null when this is not a product page.
 * Handles `/products/x`, `/en-ca/products/x` and `/collections/y/products/x`.
 */
export function productHandleFromPath(pathname: string): string | null {
  const m = /\/products\/([a-z0-9][a-z0-9-_%.]*)\/?$/i.exec(pathname.split('?')[0] ?? '');
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** The variant the shopper is actually looking at, from `?variant=`. */
export function variantFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get('variant');
  return v && /^\d+$/.test(v) ? v : null;
}

interface ShopifyProductJson {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  type?: string;
  tags?: string[];
  price: number;
  description?: string;
  featured_image?: string | null;
  options?: ({ name: string; values?: string[] } | string)[];
  variants?: { id: number; title: string; price: number; available: boolean; featured_image?: { src?: string } | null }[];
}

/** Breadcrumb trail from the page, used only as a classification hint. */
function breadcrumbsFromDom(): string[] {
  const nodes = document.querySelectorAll('nav[aria-label*="readcrumb" i] a, .breadcrumb a, [class*="breadcrumb" i] a');
  return [...nodes].map((n) => (n.textContent ?? '').trim()).filter((t) => t.length > 0 && t.length < 40).slice(0, 6);
}

function optionNamesAndValues(p: ShopifyProductJson): { names: string[]; values: string[] } {
  const names: string[] = [];
  const values: string[] = [];
  for (const o of p.options ?? []) {
    if (typeof o === 'string') names.push(o);
    else {
      names.push(o.name);
      for (const v of o.values ?? []) if (values.length < 10) values.push(v);
    }
  }
  return { names, values };
}

/** Read the product of record. Returns null off a product page or when the JSON is unavailable. */
export async function detectProduct(merchant: MerchantDef, url: URL): Promise<DetectedProduct | null> {
  const handle = productHandleFromPath(url.pathname);
  if (!handle) return null;

  const json = await getJson<ShopifyProductJson>(`${location.origin}${joinPath(merchant.cadRoot, `products/${handle}.js`)}`);
  if (!json) return null;

  const variantKey = variantFromSearch(url.search);
  const variant = variantKey ? json.variants?.find((v) => String(v.id) === variantKey) : undefined;
  const priceCents = typeof variant?.price === 'number' ? variant.price : typeof json.price === 'number' ? json.price : null;
  const { names, values } = optionNamesAndValues(json);
  const image = variant?.featured_image?.src ?? json.featured_image ?? undefined;

  const context: ClassificationContext = {
    merchantKey: merchant.key as ClassificationContext['merchantKey'],
    vendor: json.vendor,
    title: json.title,
    productType: json.type,
    tags: (json.tags ?? []).filter((t) => !t.startsWith('__') && t.length < 40).slice(0, 20),
    breadcrumbs: breadcrumbsFromDom(),
    optionNames: names,
    optionValues: values,
    urlPath: url.pathname,
    descriptionSnippet: (json.description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
  };

  return {
    handle,
    productKey: String(json.id),
    variantKey: variantKey ?? null,
    title: variant ? `${json.title} — ${variant.title}` : json.title,
    unitPriceCents: priceCents,
    currency: await storeCurrency(merchant),
    imageUrl: image && image.startsWith('http') ? image : image ? `https:${image}` : undefined,
    context,
  };
}

interface ShopifyCartJson {
  token: string;
  currency: string;
  item_count: number;
  total_price: number;
  original_total_price?: number;
  items: {
    id: number;
    product_id: number;
    variant_id: number;
    key: string;
    title: string;
    product_title?: string;
    variant_title?: string | null;
    product_type?: string;
    handle?: string;
    quantity: number;
    final_price: number;
    options_with_values?: { name: string; value: string }[];
    image?: string | null;
    url?: string;
  }[];
}

let currencyCache: { key: string; value: string; at: number } | null = null;

/** The storefront's active currency, from the cart endpoint. Cached for a minute. */
export async function storeCurrency(merchant: MerchantDef): Promise<string> {
  if (currencyCache && currencyCache.key === merchant.key && Date.now() - currencyCache.at < 60_000) return currencyCache.value;
  const cart = await getJson<ShopifyCartJson>(`${location.origin}${joinPath(merchant.cadRoot, 'cart.js')}`);
  const value = (cart?.currency ?? '').toUpperCase() || 'UNKNOWN';
  currencyCache = { key: merchant.key, value, at: Date.now() };
  return value;
}

/** Read the Ajax cart and classify every line on its own. */
export async function readCart(merchant: MerchantDef): Promise<MirroredCart | null> {
  const cart = await getJson<ShopifyCartJson>(`${location.origin}${joinPath(merchant.cadRoot, 'cart.js')}`);
  if (!cart) return null;
  const currency = (cart.currency ?? '').toUpperCase();
  currencyCache = { key: merchant.key, value: currency || 'UNKNOWN', at: Date.now() };

  const items: CartItem[] = cart.items.map((line) => {
    const options = line.options_with_values ?? [];
    const verdict = classifyProduct({
      merchantKey: merchant.key as ClassificationContext['merchantKey'],
      title: line.product_title ?? line.title,
      productType: line.product_type,
      optionNames: options.map((o) => o.name),
      optionValues: options.map((o) => o.value).slice(0, 10),
      urlPath: line.url ?? (line.handle ? `/products/${line.handle}` : '/'),
    });
    const image = line.image ?? undefined;
    return {
      productKey: String(line.product_id),
      variantKey: String(line.variant_id),
      title: line.title,
      unitPriceCents: typeof line.final_price === 'number' ? line.final_price : null,
      quantity: line.quantity,
      productCategory: verdict.category,
      ...(verdict.subtype !== 'other' ? { subtype: verdict.subtype } : {}),
      ...(image ? { imageUrl: image.startsWith('http') ? image : `https:${image}` } : {}),
    };
  });

  const discounted = typeof cart.original_total_price === 'number' && cart.original_total_price > cart.total_price;
  return { cartId: cart.token, items, currency, discountStatus: discounted ? 'applied' : 'none' };
}

/** Cheap signature so we only publish when the cart actually changed. */
export function cartSignature(cart: MirroredCart): string {
  return `${cart.items.map((i) => `${i.variantKey}x${i.quantity}@${i.unitPriceCents}`).join(',')}|${cart.discountStatus}`;
}
