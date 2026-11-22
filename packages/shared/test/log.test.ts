import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearRecentLogs,
  configureLogging,
  createLogger,
  errorContext,
  formatLogEntry,
  getRecentLogs,
  redactSecret,
  type LogEntry,
} from '../src/log.ts';

let captured: LogEntry[];
beforeEach(() => {
  captured = [];
  clearRecentLogs();
  configureLogging({ level: 'debug', sinks: [(e) => captured.push(e)], bufferSize: 200 });
});
afterEach(() => configureLogging({ level: 'info', bufferSize: 200 }));

describe('levels and namespaces', () => {
  it('filters below the configured level', () => {
    configureLogging({ level: 'warn' });
    const log = createLogger('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(captured.map((e) => e.level)).toEqual(['warn', 'error']);
  });
  it('silent drops everything', () => {
    configureLogging({ level: 'silent' });
    createLogger('t').error('boom');
    expect(captured).toHaveLength(0);
  });
  it('child namespaces join with a colon', () => {
    createLogger('mobile').child('home').child('rt').info('x');
    expect(captured[0]!.ns).toBe('mobile:home:rt');
  });
});

describe('secrets never reach a sink in clear', () => {
  it('scrubs token-like ctx keys and leaves the rest', () => {
    createLogger('t').info('paired', { deviceToken: 'abcdefghijklmnop', deviceId: 'dev-1', pairingCode: 'ABC234K', code: 'bad-code', apikey: 'sb_publishable_xyz' });
    expect(captured[0]!.ctx).toEqual({
      deviceToken: 'abcdef…(16)',
      deviceId: 'dev-1',
      pairingCode: 'ABC234…(7)',
      code: 'bad-code', // API error codes stay readable
      apikey: 'sb_pub…(18)',
    });
  });
  it('redactSecret keeps a short prefix and the length', () => {
    expect(redactSecret('eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe('eyJhbG…(32)');
    expect(redactSecret('abc')).toBe('…');
  });
});

describe('errors and spans', () => {
  it('error() folds an Error with code/status into ctx', () => {
    const err = Object.assign(new Error('Code invalid or expired'), { code: 'bad-code', status: 400 });
    createLogger('t').error('pair failed', err, { attempt: 2 });
    expect(captured[0]!.ctx).toEqual({ error: 'Code invalid or expired', code: 'bad-code', status: 400, kind: 'Error', attempt: 2 });
  });
  it('errorContext handles non-Error throws', () => {
    expect(errorContext('nope')).toEqual({ error: 'nope' });
    expect(errorContext({ message: 'm', status: 500 })).toEqual({ error: 'm', status: 500 });
  });
  it('span logs start at debug and done at info with ms', () => {
    const end = createLogger('t').span('fn:get-snapshot', { role: 'browser' });
    const ms = end({ status: 200 });
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(captured.map((e) => [e.level, e.msg])).toEqual([
      ['debug', 'fn:get-snapshot start'],
      ['info', 'fn:get-snapshot done'],
    ]);
    expect(captured[1]!.ctx).toMatchObject({ role: 'browser', status: 200 });
    expect(typeof captured[1]!.ctx!.ms).toBe('number');
  });
  it('span with an error outcome logs at error level', () => {
    createLogger('t').span('x')({ error: 'HTTP 401' });
    expect(captured.at(-1)!.level).toBe('error');
    expect(captured.at(-1)!.msg).toBe('x failed');
  });
});

describe('ring buffer and formatting', () => {
  it('keeps only the last N entries', () => {
    configureLogging({ bufferSize: 3 });
    const log = createLogger('t');
    for (let i = 0; i < 5; i++) log.info(`m${i}`);
    expect(getRecentLogs().map((e) => e.msg)).toEqual(['m2', 'm3', 'm4']);
  });
  it('formats as time, glyph, namespace, message, ctx', () => {
    const line = formatLogEntry({ ts: '2026-11-22T01:02:03.456Z', level: 'warn', ns: 'ext:api', msg: 'slow', ctx: { ms: 1200 } });
    expect(line).toBe('01:02:03.456 ▲ [ext:api] slow {"ms":1200}');
  });
  it('a throwing sink does not break logging', () => {
    configureLogging({
      sinks: [
        () => {
          throw new Error('sink down');
        },
        (e) => captured.push(e),
      ],
    });
    expect(() => createLogger('t').info('still fine')).not.toThrow();
    expect(captured).toHaveLength(1);
  });
});
