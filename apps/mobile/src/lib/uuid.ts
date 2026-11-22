/**
 * Event ids for this phone.
 *
 * React Native's engine has no `crypto` global, so `crypto.randomUUID()` throws here even though it
 * is fine in the browser and in the edge functions. These ids are idempotency keys, not secrets —
 * nothing authenticates with them — so a Math.random v4 is adequate, and we still prefer a real
 * source when the runtime offers one.
 */
type MaybeCrypto = {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
};

const webCrypto = (globalThis as { crypto?: MaybeCrypto }).crypto;

const hex: string[] = Array.from({ length: 256 }, (_, i) => (i + 0x100).toString(16).slice(1));

function fromBytes(bytes: Uint8Array): string {
  // RFC 4122 §4.4: version 4, variant 10xx.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const b = Array.from(bytes, (n) => hex[n]!);
  return `${b[0]}${b[1]}${b[2]}${b[3]}-${b[4]}${b[5]}-${b[6]}${b[7]}-${b[8]}${b[9]}-${b[10]}${b[11]}${b[12]}${b[13]}${b[14]}${b[15]}`;
}

/** A v4 UUID, from the best source this runtime has. */
export function newEventId(): string {
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return fromBytes(bytes);
}
