// Shared between the app and the voice tool: how a spoken line maps to a clip.
export function normalizeLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Small, dependency-free string hash (FNV-1a 32-bit, two rounds) -> 12 hex chars.
export function lineKey(text: string): string {
  const s = normalizeLine(text).toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c * 31 + i), 0x01000193) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12);
}

// "Hello, {name}! I am Bibi." -> ["Hello,", "{name}", "! I am Bibi."]
// Each text part is spoken from its own clip; {name} plays the name clip.
export function splitName(text: string): string[] {
  const out: string[] = [];
  text.split('{name}').forEach((part, i, arr) => {
    const t = part.trim();
    if (t && /[a-z0-9]/i.test(t)) out.push(t);
    if (i < arr.length - 1) out.push('{name}');
  });
  return out;
}
