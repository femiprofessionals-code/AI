// Pair codes, pair IDs and PIN hashing (Web Crypto; works in the Android WebView and tests).

// No 0/O, 1/I/L: easy to read out loud or type.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** New secret pair code, e.g. "K7QX-M2PD-9WTR" (12 characters ≈ 59 bits). */
export function newPairCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/** Tidy what the person typed (upper case, dashes re-inserted); null if it can't be a code. */
export function normalizeCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length !== 12 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/** Live formatting while typing. */
export function formatCodeInput(input) {
  const s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12);
  return s.replace(/(.{4})(?=.)/g, '$1-');
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The pair's database ID: a hash of the code, so the code itself is never stored. */
export async function pairIdFor(code) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`private-line:pair:${code}`)));
}

async function pbkdf2(secret, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return hex(bits);
}

/**
 * Proof used to move your place to a replacement phone: needs the pair code AND your PIN.
 * Deliberately slow to make guessing PINs expensive.
 */
export function recoveryHash(code, slot, pin) {
  return pbkdf2(`${pin}`, `private-line:recover:${code}:${slot}`, 150000);
}

/** Local PIN check value (stored only on this phone, with a random salt). */
export async function pinHash(pin, salt) {
  return pbkdf2(`${pin}`, `private-line:lock:${salt}`, 120000);
}

export function randomSalt() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}
