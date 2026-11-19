import type { Marker } from '../db/types';
import { BODY_PARTS, type BodyPart } from '../content/types';

// Fit an image of (iw, ih) inside a (bw, bh) box without cropping.
export function fit(iw: number, ih: number, bw: number, bh: number) {
  const s = Math.min(bw / iw, bh / ih);
  const w = iw * s, h = ih * s;
  return { s, w, h, ox: (bw - w) / 2, oy: (bh - h) / 2 };
}
export type Fit = ReturnType<typeof fit>;

// Markers are stored as fractions of the image, so they stay on the right
// spot at any screen size or orientation.
export const toScreen = (m: Marker, f: Fit) => ({ x: f.ox + m.x * f.w, y: f.oy + m.y * f.h, r: m.r * f.w });
export const toFraction = (x: number, y: number, f: Fit) => ({ x: (x - f.ox) / f.w, y: (y - f.oy) / f.h });

// Nearest marker wins; a tap counts within 1.3x the marker radius.
export function hitPart(x: number, y: number, markers: Record<string, Marker | null>, f: Fit): BodyPart | null {
  let best: BodyPart | null = null;
  let bestD = Infinity;
  for (const part of BODY_PARTS) {
    const m = markers[part];
    if (!m) continue;
    const p = toScreen(m, f);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= p.r * 1.3 && d / p.r < bestD) { bestD = d / p.r; best = part; }
  }
  return best;
}
