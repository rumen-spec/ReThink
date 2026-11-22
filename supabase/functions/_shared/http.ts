export const DEVICE_TOKEN_HEADER = 'x-rethink-device-token';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${DEVICE_TOKEN_HEADER}`,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Body must be JSON', 'bad-json');
  }
}

export function requireString(v: unknown, name: string, max = 200): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new HttpError(400, `${name} required`, 'bad-input');
  return v;
}

export function requireUuid(v: unknown, name: string): string {
  const s = requireString(v, name, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new HttpError(400, `${name} must be a UUID`, 'bad-input');
  return s;
}

export function requireCents(v: unknown, name: string, { min = 0 } = {}): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) throw new HttpError(400, `${name} must be integer cents ≥ ${min}`, 'bad-input');
  return v;
}

export function optionalIso(v: unknown, name: string): string {
  if (v === undefined || v === null) return new Date().toISOString();
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${name} must be ISO-8601`, 'bad-input');
  return new Date(v).toISOString();
}

/** Wraps a handler: CORS preflight, POST only, HttpError → status, anything else → 500 without leaking. */
export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error(e);
      return json({ error: 'Internal error', code: 'internal' }, 500);
    }
  };
}
