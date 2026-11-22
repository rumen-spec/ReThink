/**
 * Frontend logging shared by the phone and the extension. No runtime deps.
 *
 *   const log = createLogger('mobile').child('home');
 *   log.info('refetched', { categories: 6, ms: 42 });
 *   const end = log.span('fn:publish-cart'); … end({ status: 200 });
 *
 * - Levels: debug < info < warn < error < silent. Set once with `configureLogging`.
 * - Every entry goes to the console sink (formatted, with the ctx object expanded in devtools)
 *   and into a ring buffer (`getRecentLogs`) so a UI panel or "Copy logs" demo tool can show it.
 * - Secrets are scrubbed: any ctx key that looks like a token/secret/code is shortened to its
 *   first 6 chars. Never log a device token, JWT or pairing code in clear; use `redactSecret`.
 * - Never sent anywhere. Local only (SPEC §16 privacy).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
export type EntryLevel = Exclude<LogLevel, 'silent'>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export interface LogEntry {
  /** ISO-8601 */
  ts: string;
  level: EntryLevel;
  ns: string;
  msg: string;
  ctx?: Record<string, unknown>;
}

export type LogSink = (entry: LogEntry) => void;

export interface LogConfig {
  level: LogLevel;
  sinks: LogSink[];
  /** Ring buffer size for `getRecentLogs`. */
  bufferSize: number;
}

// `code` alone is NOT a secret (API error codes like 'bad-code' must stay readable); pairing codes are `pairingCode`.
const SECRET_KEY = /token|secret|authorization|apikey|api_key|password|jwt|bearer|pairingcode/i;
const ANSI: Record<EntryLevel, string> = { debug: '·', info: '●', warn: '▲', error: '✖' };

// The package compiles without DOM/Node libs; every runtime we target (RN, Chrome, Deno) has these.
type ConsoleLike = { debug: (...a: unknown[]) => void; info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
const g = globalThis as unknown as { console?: ConsoleLike; performance?: { now(): number } };

export function redactSecret(value: string, keep = 6): string {
  if (value.length <= keep) return '…';
  return `${value.slice(0, keep)}…(${value.length})`;
}

function scrub(ctx: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = SECRET_KEY.test(k) && typeof v === 'string' ? redactSecret(v) : v;
  }
  return out;
}

export function formatLogEntry(e: LogEntry): string {
  const time = e.ts.slice(11, 23); // HH:MM:SS.mmm
  const ctx = e.ctx && Object.keys(e.ctx).length ? ` ${JSON.stringify(e.ctx)}` : '';
  return `${time} ${ANSI[e.level]} [${e.ns}] ${e.msg}${ctx}`;
}

/** Default sink: console, one method per level, ctx passed as a second argument so devtools expand it. */
export const consoleSink: LogSink = (e) => {
  const c = g.console;
  if (!c) return;
  const fn = e.level === 'debug' ? c.debug : e.level === 'info' ? c.info : e.level === 'warn' ? c.warn : c.error;
  const time = e.ts.slice(11, 23);
  if (e.ctx && Object.keys(e.ctx).length) fn(`${time} ${ANSI[e.level]} [${e.ns}] ${e.msg}`, e.ctx);
  else fn(`${time} ${ANSI[e.level]} [${e.ns}] ${e.msg}`);
};

const config: LogConfig = { level: 'info', sinks: [consoleSink], bufferSize: 200 };
const buffer: LogEntry[] = [];

export function configureLogging(patch: Partial<LogConfig>): LogConfig {
  Object.assign(config, patch);
  while (buffer.length > config.bufferSize) buffer.shift();
  return { ...config, sinks: [...config.sinks] };
}

export function getLogLevel(): LogLevel {
  return config.level;
}

export function getRecentLogs(): readonly LogEntry[] {
  return buffer;
}

export function clearRecentLogs(): void {
  buffer.length = 0;
}

export function isLogLevel(v: unknown): v is LogLevel {
  return typeof v === 'string' && v in ORDER;
}

const now = (): number => (g.performance && typeof g.performance.now === 'function' ? g.performance.now() : Date.now());

/** Turn an unknown thrown value into loggable context without leaking stacks into the UI. */
export function errorContext(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const e = err as Error & { code?: unknown; status?: unknown };
    return {
      error: e.message,
      ...(e.code !== undefined ? { code: e.code } : {}),
      ...(e.status !== undefined ? { status: e.status } : {}),
      kind: e.name,
    };
  }
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; code?: unknown; status?: unknown };
    return { error: String(o.message ?? JSON.stringify(err)), ...(o.code !== undefined ? { code: o.code } : {}), ...(o.status !== undefined ? { status: o.status } : {}) };
  }
  return { error: String(err) };
}

export interface Logger {
  readonly ns: string;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  /** `err` may be an Error, an API error object or anything thrown; it's folded into ctx. */
  error(msg: string, err?: unknown, ctx?: Record<string, unknown>): void;
  child(sub: string): Logger;
  /**
   * Time an operation. Returns `end(outcome?)`, which logs `<label> done {ms, ...outcome}` at
   * info (or at error if `outcome.error` is set) and returns the elapsed ms.
   */
  span(label: string, ctx?: Record<string, unknown>): (outcome?: Record<string, unknown>) => number;
}

export function createLogger(ns: string): Logger {
  const emit = (level: EntryLevel, msg: string, ctx?: Record<string, unknown>) => {
    if (ORDER[level] < ORDER[config.level]) return;
    const entry: LogEntry = { ts: new Date().toISOString(), level, ns, msg, ctx: scrub(ctx) };
    buffer.push(entry);
    if (buffer.length > config.bufferSize) buffer.shift();
    for (const sink of config.sinks) {
      try {
        sink(entry);
      } catch {
        /* a broken sink must never break the app */
      }
    }
  };
  return {
    ns,
    debug: (m, c) => emit('debug', m, c),
    info: (m, c) => emit('info', m, c),
    warn: (m, c) => emit('warn', m, c),
    error: (m, err, c) => emit('error', m, { ...(err !== undefined ? errorContext(err) : {}), ...c }),
    child: (sub) => createLogger(`${ns}:${sub}`),
    span: (label, ctx) => {
      const t0 = now();
      emit('debug', `${label} start`, ctx);
      return (outcome) => {
        const ms = Math.round(now() - t0);
        const failed = outcome && 'error' in outcome;
        emit(failed ? 'error' : 'info', `${label} ${failed ? 'failed' : 'done'}`, { ms, ...ctx, ...outcome });
        return ms;
      };
    },
  };
}
