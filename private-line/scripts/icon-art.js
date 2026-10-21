// Private Line icon artwork, drawn in code (no image files needed).
const zlib = require('zlib');

const TEAL = [15, 118, 110], WHITE = [255, 255, 255], DARK = [11, 90, 84];

function crcTable() {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
}
const TABLE = crcTable();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = TABLE[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const roundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.max(Math.abs(x - cx) - (hw - r), 0), qy = Math.max(Math.abs(y - cy) - (hh - r), 0);
  return Math.hypot(qx, qy) <= r;
};

/** The bubble with two dots, in unit coordinates; null = transparent. */
function bubble(x, y, { bg = true, mono = false } = {}) {
  const inBubble = roundRect(x, y, 0.5, 0.46, 0.3, 0.22, 0.12)
    || (x > 0.3 && x < 0.44 && y > 0.6 && y < 0.78 && (y - 0.6) < (0.44 - x) * 1.3); // tail
  if (inBubble) {
    if (Math.hypot(x - 0.4, y - 0.46) < 0.055 || Math.hypot(x - 0.6, y - 0.46) < 0.055) return mono ? null : TEAL;
    return WHITE;
  }
  if (!bg) return null;
  return roundRect(x, y, 0.5, 0.5, 0.48, 0.48, 0.2) ? (y > 0.5 ? DARK.map((c, i) => Math.round(c + (TEAL[i] - c) * (1 - (y - 0.5) * 2))) : TEAL) : null;
}

function render(w, h, sampler) {
  const ss = 4;
  const buf = Buffer.alloc(w * h * 4);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = sampler((px + (sx + 0.5) / ss) / w, (py + (sy + 0.5) / ss) / h);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const i = (py * w + px) * 4;
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
      buf[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(w, h, buf);
}

module.exports = { render, bubble, png, TEAL };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), render(256, 256, (x, y) => bubble(x, y)));
  console.log('assets/icon.png written');
}
