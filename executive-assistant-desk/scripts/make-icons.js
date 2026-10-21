// Generates the app and tray icons (PNG) without any image libraries.
// Run: npm run icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shape sampler in unit coordinates (0..1). Returns [r,g,b,a] or null.
function sample(x, y) {
  const NAVY = [31, 58, 104], WHITE = [255, 255, 255], GOLD = [242, 178, 51], INK = [27, 36, 51];
  // Rounded square background.
  const r = 0.2, m = 0.02;
  const qx = Math.max(Math.abs(x - 0.5) - (0.5 - m - r), 0), qy = Math.max(Math.abs(y - 0.5) - (0.5 - m - r), 0);
  if (Math.hypot(qx, qy) > r) return null;
  const cx = x - 0.5, cy = y - 0.5, d = Math.hypot(cx, cy);
  if (d < 0.36) {
    if (d < 0.035) return GOLD;
    // Hour hand toward 10 o'clock, minute hand toward 12.
    const seg = (ax, ay, bx, by, w) => {
      const vx = bx - ax, vy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      return Math.hypot(x - (ax + t * vx), y - (ay + t * vy)) < w;
    };
    if (seg(0.5, 0.5, 0.5, 0.22, 0.028)) return INK;
    if (seg(0.5, 0.5, 0.31, 0.39, 0.032)) return INK;
    // Tick marks at 12, 3, 6, 9.
    for (const [tx, ty] of [[0.5, 0.17], [0.83, 0.5], [0.5, 0.83], [0.17, 0.5]]) {
      if (Math.hypot(x - tx, y - ty) < 0.025) return NAVY;
    }
    return WHITE;
  }
  if (d < 0.4) return GOLD;
  return NAVY;
}

function render(size, sampler = sample) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = sampler((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
      }
      const i = (py * size + px) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(size, buf);
}

module.exports = { render, sample };
if (require.main !== module) return;

const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(root, 'build', 'icon.png'), render(256));
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), render(256));
fs.writeFileSync(path.join(root, 'assets', 'tray.png'), render(32));
fs.writeFileSync(path.join(root, 'assets', 'tray@2x.png'), render(64));
console.log('Icons written.');
