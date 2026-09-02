/**
 * ULID generator — spec-compliant, monotonic within the same millisecond.
 * Zero dependencies. Crockford base32, 48-bit time + 80-bit randomness.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I,L,O,U)
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number, len: number): string {
  let str = '';
  let n = now;
  for (let i = len; i > 0; i--) {
    const mod = n % ENCODING_LEN;
    str = ENCODING[mod]! + str;
    n = (n - mod) / ENCODING_LEN;
  }
  return str;
}

function encodeRandom(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let str = '';
  for (let i = 0; i < len; i++) {
    str += ENCODING[bytes[i]! % ENCODING_LEN];
  }
  return str;
}

let lastTime = 0;
let lastRandom: number[] = new Array<number>(RANDOM_LEN).fill(0);

function incrementRandom(random: number[]): number[] {
  const next = [...random];
  for (let i = RANDOM_LEN - 1; i >= 0; i--) {
    if (next[i]! < ENCODING_LEN - 1) {
      next[i] = next[i]! + 1;
      return next;
    }
    next[i] = 0;
  }
  return next; // overflow: wrapped (extremely unlikely within same ms)
}

/** Generate a ULID (monotonic within the same millisecond). */
export function ulid(seedTime?: number): string {
  const now = seedTime ?? Date.now();
  if (now === lastTime) {
    lastRandom = incrementRandom(lastRandom);
    let rand = '';
    for (let i = 0; i < RANDOM_LEN; i++) rand += ENCODING[lastRandom[i]!];
    return encodeTime(now, TIME_LEN) + rand;
  }
  lastTime = now;
  const randChars = encodeRandom(RANDOM_LEN);
  lastRandom = [...randChars].map((c) => ENCODING.indexOf(c));
  return encodeTime(now, TIME_LEN) + randChars;
}

/** Current UTC time as ISO-8601 string (no offset). */
export function nowIso(): string {
  return new Date().toISOString();
}
